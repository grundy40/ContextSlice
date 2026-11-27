import { getMessages, Locale } from '../i18n';
import {
  AstSymbolNode,
  ComputedNodePlan,
  ContextAssemblyResult,
  McpToolInvocationRecord,
  NodeTier,
  OverrideMode,
  ParsedWorkspace,
  ProtocolComparisonMetrics,
} from '../types/context';
import { estimateTokens } from './astParser';
import {
  detectHighComplexityClusters,
  invokeSkeletonExpansionMcpTool,
} from './skeletonExpansion';

import { tokenizeCJK2gram, bilingualLookup } from './cjkTokenizer';

/** CJK 字符檢測正則 */
const CJK_REGEX = /[一-鿿぀-ゟ゠-ヿ가-힯]/;

/** 檢測文本是否包含 CJK 字符 */
function containsCJK(text: string): boolean {
  return CJK_REGEX.test(text);
}

const BILINGUAL_KEYWORDS: Array<[RegExp, string[]]> = [
  [/折扣|優惠|折價|coupon|discount/i, ['discount', 'coupon', 'promo', 'applydiscount', 'validatecoupon']],
  [/庫存|存貨|鎖定|競態|inventory|stock|lock/i, ['inventory', 'stock', 'lock', 'acquire', 'release', 'reserve']],
  [/結帳|訂單|購物車|checkout|order/i, ['checkout', 'order', 'cart', 'processorder', 'submitorder']],
  [/付款|金流|刷卡|payment|charge/i, ['payment', 'charge', 'refund', 'gateway', 'stripe']],
  [/稅|金額|價格|定價|tax|price|pricing/i, ['tax', 'price', 'pricing', 'subtotal', 'total', 'calculate']],
  [/認證|登入|權限|token|auth/i, ['auth', 'token', 'session', 'jwt', 'interceptor', 'refresh']],
  [/快取|同步|cache|sync/i, ['cache', 'sync', 'invalidate', 'revalidate', 'workspace']],
  [/驗證|檢查|校驗|valid/i, ['validate', 'verify', 'schema', 'check', 'guard']],
  [/重試|佇列|失敗|retry|queue/i, ['retry', 'queue', 'backoff', 'deadletter', 'recover']],
  [/通知|推播|webhook|audit|log/i, ['webhook', 'notify', 'audit', 'log', 'dispatch']],
  [/匯出|下載|報表|export|csv/i, ['export', 'download', 'serialize', 'report']],
];

function expandQueryTerms(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const tokens = new Set<string>();

  // 1. ASCII 部分
  const asciiParts = trimmed.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  for (const p of asciiParts) {
    if (p.length >= 2) tokens.add(p);
  }

  // 2. Bilingual 關鍵字映射
  for (const [pattern, synonyms] of BILINGUAL_KEYWORDS) {
    if (pattern.test(trimmed)) {
      for (const s of synonyms) tokens.add(s);
    }
  }

  // 3. CJK 2-gram 分詞
  if (containsCJK(trimmed)) {
    const cjkTerms = tokenizeCJK2gram(trimmed);
    cjkTerms.forEach(term => tokens.add(term));
  }

  // 4. 雙語查詢擴展
  const allTerms = Array.from(tokens);
  for (const term of allTerms) {
    const bilingual = bilingualLookup(term);
    bilingual.forEach(t => tokens.add(t));
  }

  return Array.from(tokens);
}

export function scoreNodeRelevance(node: AstSymbolNode, queryTerms: string[], allNodes: AstSymbolNode[] = []): number {
  if (queryTerms.length === 0) return 0;
  const totalNodes = Math.max(1, allNodes.length);

  // Compute Document Frequency (DF) for each query term across workspace nodes
  const termDF = new Map<string, number>();
  for (const term of queryTerms) {
    let df = 0;
    for (const n of allNodes) {
      if (
        n.name.toLowerCase().includes(term) ||
        n.filePath.toLowerCase().includes(term) ||
        n.fullCode.toLowerCase().includes(term)
      ) {
        df++;
      }
    }
    termDF.set(term, Math.max(1, df));
  }

  const haystackName = node.name.toLowerCase();
  const haystackPath = node.filePath.toLowerCase();
  const haystackDoc = node.docComment.toLowerCase();
  const haystackBody = node.fullCode.toLowerCase();

  let score = 0;
  // CJK 權重調整因子：中文/日文/韓文匹配略高於ASCII
  const isCjkMatch = /[一-鿿぀-ゟ゠-ヿ가-힯]/.test(queryTerms.join(''));

  for (const term of queryTerms) {
    const df = termDF.get(term) || 1;
    const idf = Math.log(1 + (totalNodes / df));
    // 關鍵字稀缺度加權（TF-IDF 式防噪）：若詞頻過高（出現在 >30% 檔案中），大幅降權；專有名詞大幅加權
    const scarcityMultiplier = df / totalNodes > 0.3 ? 0.35 : df / totalNodes > 0.15 ? 0.7 : 1.25;

    let termScore = 0;
    // 1. 名稱精確匹配（遠高於內文出現次數）
    if (haystackName === term) {
      termScore += isCjkMatch ? 36 : 32;  // CJK: 36, ASCII: 32
    }
    else if (haystackName.includes(term)) {
      termScore += isCjkMatch ? 22 : 20;  // CJK: 22, ASCII: 20
    }

    // 2. 路徑匹配
    if (haystackPath.includes(term)) {
      termScore += isCjkMatch ? 10 : 8;
    }

    // 3. 註解/Docstring 匹配
    if (haystackDoc.includes(term)) {
      termScore += isCjkMatch ? 8 : 6;
    }

    // 4. 函式體內文本語義匹配 (BM25-like saturation)
    const occ = haystackBody.split(term).length - 1;
    if (occ > 0) {
      termScore += Math.min(10, 2.5 * Math.log1p(occ));
    }

    score += termScore * idf * scarcityMultiplier;
  }

  // 5. 偏好函式/方法
  if (score > 0 && (node.kind === 'function' || node.kind === 'method')) {
    score *= isCjkMatch ? 1.08 : 1.15;  // CJK: 1.08x, ASCII: 1.15x
  }

  // 6. CJK 中英雙語查詢加成
  if (isCjkMatch) {
    const englishTerms = queryTerms.filter(t => /^[a-z0-9_]+$/.test(t));
    if (englishTerms.length > 0) {
      const hasEnglishMatch = englishTerms.some(eTerm => 
        haystackName.includes(eTerm) || haystackDoc.includes(eTerm)
      );
      if (hasEnglishMatch) score *= 1.10;  // 雙語匹配加成 10%
    }
  }

  return Number(score.toFixed(2));
}
export interface AssembleOptions {
  workspace: ParsedWorkspace;
  query: string;
  pinnedFocalIds: string[];
  overrides: Record<string, OverrideMode>;
  budgetTokens: number;
  maxHops: 1 | 2;
  autoExpandClusters?: boolean;
  proactiveExpandedIds?: string[];
  proactiveToolCall?: McpToolInvocationRecord | null;
  locale?: Locale;
}

/**
 * Preserves top-of-file imports, module-level constants, and top-level type/interface declarations
 * up to the first function/class or any object/array literal exceeding 60 lines (capped at ~50 lines).
 */
export function extractFileHeader(
  content: string,
  maxLines = 50,
  maxObjectLines = 60,
): { header: string; endLine: number } | null {
  if (!content) return null;
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const limit = Math.min(lines.length, maxLines);
  const funcOrClassStartRe =
    /^(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:async\s+)?(?:function\*?\s+|class\s+)|^(?:async\s+)?def\s+|^func\s+|^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?(?:fn|struct|impl|trait)\s+|^(?:public|private|protected|internal|static|final|abstract|async|override|\s)*(?:class|record)\s+/;
  const importOrTypeOrVarRe =
    /^(?:import\b|export\s+(?:type|interface|const|let|var|enum)\b|type\s+|interface\s+|const\s+|let\s+|var\s+|package\s+|using\s+|from\s+\S+\s+import\b|#include\b|#define\b)/;

  const stripLineNoise = (line: string) =>
    line
      .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""')
      .replace(/\/\/.*$|#.*$/g, '');

  const countBlockSpan = (startIdx: number): number => {
    let depth = 0;
    let opened = false;
    const scanMax = Math.min(lines.length, startIdx + maxObjectLines + 5);
    for (let j = startIdx; j < scanMax; j++) {
      const clean = stripLineNoise(lines[j]);
      for (let k = 0; k < clean.length; k++) {
        const ch = clean[k];
        if (ch === '{' || ch === '[') {
          depth++;
          opened = true;
        } else if (ch === '}' || ch === ']') {
          depth--;
          if (opened && depth <= 0) {
            return j - startIdx + 1;
          }
        }
      }
    }
    return opened ? maxObjectLines + 1 : 1;
  };

  let inBlockComment = false;
  let lastSafeEnd = 0;
  let i = 0;

  while (i < limit) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      i++;
      continue;
    }

    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      i++;
      continue;
    }

    if (funcOrClassStartRe.test(trimmed)) break;

    if (/^(?:export\s+)?(?:const|let|var)\s+[A-Za-z0-9_$]+[^;\n]*=>/.test(trimmed)) break;
    if (/^(?:export\s+)?(?:const|let|var)\s+[A-Za-z0-9_$]+\s*=\s*(?:async\s*)?\([^)]*$/.test(trimmed)) {
      const lookahead = lines.slice(i, Math.min(lines.length, i + 6)).join(' ');
      if (lookahead.includes('=>')) break;
    }

    if (
      !importOrTypeOrVarRe.test(trimmed) &&
      /^(?:[\w<>[\],*&:.]+\s+)+[A-Za-z_][A-Za-z0-9_]*\s*\([^;]*\)\s*(?:const|override|throws\s+[\w,\s]+)?\s*\{?$/.test(
        trimmed,
      )
    ) {
      break;
    }

    const cleanLine = stripLineNoise(raw);
    let netDelta = 0;
    let hasOpener = false;
    for (let k = 0; k < cleanLine.length; k++) {
      if (cleanLine[k] === '{' || cleanLine[k] === '[') {
        netDelta++;
        hasOpener = true;
      } else if (cleanLine[k] === '}' || cleanLine[k] === ']') {
        netDelta--;
      }
    }

    if (hasOpener && netDelta > 0) {
      const span = countBlockSpan(i);
      const isImport = /^(?:import|export\s+type\s*\{)/.test(trimmed);
      if ((!isImport && span > maxObjectLines) || i + span > limit) {
        break;
      }
      i += span;
      lastSafeEnd = i;
      continue;
    }

    if (
      /^(?:import|export\s+type|type|const|let|var)\b/.test(trimmed) &&
      (trimmed.endsWith('(') || trimmed.endsWith('=')) &&
      i + 1 < limit
    ) {
      let j = i + 1;
      while (j < limit) {
        const nextT = lines[j].trim();
        if (nextT.endsWith(')') || nextT.endsWith(';')) {
          j++;
          break;
        }
        if (
          nextT === '' ||
          (!nextT.startsWith('|') &&
            !nextT.startsWith('&') &&
            !nextT.startsWith('"') &&
            !nextT.startsWith("'"))
        ) {
          break;
        }
        j++;
      }
      if (j <= limit) {
        i = j;
        lastSafeEnd = i;
        continue;
      }
      break;
    }

    i++;
    lastSafeEnd = i;
  }

  if (lastSafeEnd <= 0) return null;
  const headerLines = lines.slice(0, lastSafeEnd);
  while (headerLines.length > 0 && headerLines[headerLines.length - 1].trim() === '') {
    headerLines.pop();
  }
  if (headerLines.length === 0) return null;
  return {
    header: headerLines.join('\n'),
    endLine: headerLines.length,
  };
}

export interface FileFooterChunk {
  startLine: number;
  endLine: number;
  text: string;
}

/**
 * Preserves module-level exports and top-level constant assignments found within the
 * trailing `tailLines` (~20) lines of a file (e.g., `export default`, `module.exports`,
 * Python `DEFAULT_TIMEOUT_CONFIG = ...`, TS `export const`, Go `const (...)` / `var`).
 */
export function extractFileFooter(
  content: string,
  tailLines = 20,
): { footer: string; startLine: number; endLine: number; chunks: FileFooterChunk[] } | null {
  if (!content) return null;
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let lastNonEmpty = lines.length - 1;
  while (lastNonEmpty >= 0 && lines[lastNonEmpty].trim() === '') {
    lastNonEmpty--;
  }
  if (lastNonEmpty < 0) return null;

  const windowStart = Math.max(0, lastNonEmpty - tailLines + 1);
  const stripFooterNoise = (line: string) =>
    line
      .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""')
      .replace(/\/\/.*$|#.*$/g, '');

  const findTailStmtEnd = (startIdx: number): number => {
    let paren = 0;
    let bracket = 0;
    let brace = 0;
    for (let j = startIdx; j <= lastNonEmpty; j++) {
      const clean = stripFooterNoise(lines[j]);
      for (let k = 0; k < clean.length; k++) {
        const ch = clean[k];
        if (ch === '(') paren++;
        else if (ch === ')') paren = Math.max(0, paren - 1);
        else if (ch === '[') bracket++;
        else if (ch === ']') bracket = Math.max(0, bracket - 1);
        else if (ch === '{') brace++;
        else if (ch === '}') brace = Math.max(0, brace - 1);
      }
      if (paren <= 0 && bracket <= 0 && brace <= 0) {
        const t = lines[j].trimEnd();
        if (t.endsWith('\\') || (t.endsWith('=') && !t.endsWith('=>'))) continue;
        return j;
      }
    }
    return lastNonEmpty;
  };

  const footerStartRe =
    /^(?:export\s+default\s+(?!(?:async\s+)?(?:function|class|abstract\s+class|interface)\b)|export\s+(?:type\s+)?\{|export\s+\*\s+from\b|export\s+(?:const|let|var)\s+|module\.exports\s*=|exports\.[A-Za-z_$][A-Za-z0-9_$]*\s*=|(?:pub(?:\([^)]+\))?\s+)?(?:const|static)\s+[A-Za-z_][A-Za-z0-9_]*|(?:const|var)\s*\(|(?:const|var)\s+[A-Z][A-Za-z0-9_]*\b|(?:[A-Z][A-Z0-9_]+|__all__|__version__)\s*(?::\s*[^=\n]+)?=\s*(?!=))/;

  const chunks: FileFooterChunk[] = [];
  let i = windowStart;
  while (i <= lastNonEmpty) {
    const raw = lines[i];
    if (!raw || /^\s/.test(raw)) {
      i++;
      continue;
    }
    const trimmed = raw.trim();
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('/*') ||
      !footerStartRe.test(raw)
    ) {
      i++;
      continue;
    }
    const endIdx = findTailStmtEnd(i);
    chunks.push({
      startLine: i + 1,
      endLine: endIdx + 1,
      text: lines.slice(i, endIdx + 1).join('\n'),
    });
    i = endIdx + 1;
  }

  if (chunks.length === 0) return null;
  return {
    footer: chunks.map((c) => c.text).join('\n'),
    startLine: chunks[0].startLine,
    endLine: chunks[chunks.length - 1].endLine,
    chunks,
  };
}

export function assembleDynamicContext(options: AssembleOptions): ContextAssemblyResult {
  const {
    workspace,
    query,
    pinnedFocalIds,
    overrides,
    budgetTokens,
    maxHops,
    autoExpandClusters = true,
    proactiveExpandedIds,
    proactiveToolCall,
    locale = 'zh-TW',
  } = options;
  const { engine: eng } = getMessages(locale);
  const { nodes, edges, totalRawTokens } = workspace;

  const queryTerms = expandQueryTerms(query);

  // 1. Score all nodes with TF-IDF scarcity weighting
  const scores = new Map<string, number>();
  for (const node of nodes) {
    scores.set(node.id, scoreNodeRelevance(node, queryTerms, nodes));
  }

  // 2. Determine focal nodes (pinned takes precedence, else top BM25 matches, else top exported function)
  let focalIds: string[] = pinnedFocalIds.filter((id) => nodes.some((n) => n.id === id));

  if (focalIds.length === 0 && queryTerms.length > 0) {
    const ranked = [...nodes]
      .map((n) => ({ id: n.id, score: scores.get(n.id) ?? 0 }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    if (ranked.length > 0) {
      const topScore = ranked[0].score;
      focalIds = ranked
        .filter((r, idx) => idx < 2 || r.score >= topScore * 0.72)
        .slice(0, 3)
        .map((r) => r.id);
    }
  }

  if (focalIds.length === 0 && nodes.length > 0) {
    const firstCallable =
      nodes.find((n) => n.exported && (n.kind === 'function' || n.kind === 'method')) ?? nodes[0];
    focalIds = [firstCallable.id];
  }

  const focalSet = new Set(focalIds);

  // 3. Build undirected adjacency list for BFS (both callers & callees matter for safe code edits)
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const edge of edges) {
    adj.get(edge.sourceNodeId)?.add(edge.targetNodeId);
    adj.get(edge.targetNodeId)?.add(edge.sourceNodeId);
  }

  // BFS from focal nodes
  const hopMap = new Map<string, number>();
  const queue: Array<{ id: string; hop: number }> = [];
  for (const fId of focalIds) {
    hopMap.set(fId, 0);
    queue.push({ id: fId, hop: 0 });
  }

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    if (curr.hop >= maxHops) continue;
    const neighbors = adj.get(curr.id);
    if (!neighbors) continue;
    for (const nb of neighbors) {
      if (!hopMap.has(nb)) {
        hopMap.set(nb, curr.hop + 1);
        queue.push({ id: nb, hop: curr.hop + 1 });
      }
    }
  }

  // 4. Priority ordering & greedy budget-aware tier assignment
  const plansMap = new Map<string, ComputedNodePlan>();
  const packetOverheadTokens = 95; // XML/Markdown section wrappers
  let remainingBudget = Math.max(0, budgetTokens - packetOverheadTokens);

  // Sort candidates: Manual Full -> Focal -> 1-Hop -> 2-Hop -> Same-File Types -> Rest
  const prioritySorted = [...nodes].sort((a, b) => {
    const ovA = overrides[a.id] ?? 'auto';
    const ovB = overrides[b.id] ?? 'auto';
    if (ovA === 'full' && ovB !== 'full') return -1;
    if (ovB === 'full' && ovA !== 'full') return 1;

    const hopA = hopMap.get(a.id) ?? 99;
    const hopB = hopMap.get(b.id) ?? 99;
    if (hopA !== hopB) return hopA - hopB;

    const sA = scores.get(a.id) ?? 0;
    const sB = scores.get(b.id) ?? 0;
    if (sA !== sB) return sB - sA;

    // Prefer keeping interfaces/types of touched files
    const typeA = a.kind === 'interface' || a.kind === 'type' ? 1 : 0;
    const typeB = b.kind === 'interface' || b.kind === 'type' ? 1 : 0;
    return typeB - typeA;
  });

  for (const node of prioritySorted) {
    const override = overrides[node.id] ?? 'auto';
    const hop = hopMap.has(node.id) ? hopMap.get(node.id)! : null;
    const isFocal = focalSet.has(node.id);
    const relevanceScore = scores.get(node.id) ?? 0;

    let tier: NodeTier = 'excluded';
    let reason = eng.reasonDefaultExcluded;

    if (override === 'exclude') {
      tier = 'excluded';
      reason = eng.reasonManualExclude;
    } else if (override === 'full') {
      tier = 'full';
      remainingBudget = Math.max(0, remainingBudget - node.rawTokens);
      reason = eng.reasonManualFull;
    } else if (override === 'skeleton') {
      tier = 'skeleton';
      remainingBudget = Math.max(0, remainingBudget - node.skeletonTokens);
      reason = eng.reasonManualSkeleton;
    } else {
      // Automatic 3-tier progressive allocation
      if (isFocal) {
        if (node.rawTokens <= remainingBudget || remainingBudget === budgetTokens - packetOverheadTokens) {
          tier = 'full';
          remainingBudget = Math.max(0, remainingBudget - node.rawTokens);
          reason = eng.reasonFocalFull;
        } else if (node.skeletonTokens <= remainingBudget) {
          tier = 'skeleton';
          remainingBudget = Math.max(0, remainingBudget - node.skeletonTokens);
          reason = eng.reasonFocalSkeleton;
        } else {
          tier = 'map';
          remainingBudget = Math.max(0, remainingBudget - node.mapTokens);
          reason = eng.reasonFocalMap;
        }
      } else if (hop !== null && hop <= maxHops) {
        if (node.skeletonTokens <= remainingBudget) {
          tier = 'skeleton';
          remainingBudget = Math.max(0, remainingBudget - node.skeletonTokens);
          reason = eng.reasonHopSkeleton(hop);
        } else if (node.mapTokens <= remainingBudget) {
          tier = 'map';
          remainingBudget = Math.max(0, remainingBudget - node.mapTokens);
          reason = eng.reasonHopMap(hop);
        }
      } else if (
        (node.kind === 'interface' ||
          node.kind === 'type' ||
          (node.kind === 'const' &&
            (node.exported || /^[A-Z][A-Z0-9_]+$/.test(node.name)) &&
            node.lineCount <= 25)) &&
        focalIds.some((fid) => nodes.find((x) => x.id === fid)?.fileId === node.fileId) &&
        node.skeletonTokens <= remainingBudget
      ) {
        // Same-file types and module-level constants are essential for single-file edits
        tier = 'skeleton';
        remainingBudget = Math.max(0, remainingBudget - node.skeletonTokens);
        reason = eng.reasonSameFileType;
      } else if (node.exported && node.mapTokens <= remainingBudget * 0.35) {
        tier = 'map';
        remainingBudget = Math.max(0, remainingBudget - node.mapTokens);
        reason = eng.reasonExportedMap;
      }
    }

    const injectedTokens =
      tier === 'full'
        ? node.rawTokens
        : tier === 'skeleton'
          ? node.skeletonTokens
          : tier === 'map'
            ? node.mapTokens
            : 0;

    plansMap.set(node.id, {
      node,
      tier,
      override,
      hopDistance: hop,
      relevanceScore,
      isFocal,
      injectedTokens,
      reason,
    });
  }

  // Preserve original file/line order for initial pass
  const baseNodePlans = nodes.map((n) => plansMap.get(n.id)!);

  // 5. High-Complexity Cluster Detection + Proactive Discovery MCP `expand_skeleton_cluster` Flow
  const { clusters, complexityByNodeId } = detectHighComplexityClusters(
    workspace,
    baseNodePlans,
    focalIds,
    locale,
  );
  const remainingBudgetForExpansion = remainingBudget;

  let expandedIds: string[] = [];
  let updatedClusters = clusters;
  let toolCallRecord: McpToolInvocationRecord | null = null;

  if (proactiveExpandedIds !== undefined) {
    const validSet = new Set(proactiveExpandedIds);
    expandedIds = clusters.filter((c) => validSet.has(c.hubNodeId)).map((c) => c.hubNodeId);
    const expandedSet = new Set(expandedIds);
    updatedClusters = clusters.map((c) => ({
      ...c,
      resolvedByMcp: expandedSet.has(c.hubNodeId),
      currentTier: expandedSet.has(c.hubNodeId) ? ('full' as const) : c.currentTier,
    }));
    toolCallRecord =
      proactiveToolCall ??
      (clusters.length > 0 && !autoExpandClusters
        ? invokeSkeletonExpansionMcpTool({
            clusters,
            remainingBudget,
            autoExpandEnabled: false,
            triggerMode: 'proactive-discovery',
            locale,
          }).toolCallRecord
        : null);
  } else {
    const expansionResult = invokeSkeletonExpansionMcpTool({
      clusters,
      remainingBudget,
      autoExpandEnabled: autoExpandClusters,
      triggerMode: 'proactive-discovery',
      locale,
    });
    expandedIds = expansionResult.expandedNodeIds;
    updatedClusters = expansionResult.updatedClusters;
    toolCallRecord = expansionResult.toolCallRecord;
  }

  const autoExpandedSet = new Set(expandedIds);

  for (const id of autoExpandedSet) {
    const plan = plansMap.get(id);
    if (!plan) continue;
    plan.tier = 'full';
    plan.injectedTokens = plan.node.rawTokens;
    plan.autoExpanded = true;
    plan.reason = eng.reasonAutoExpanded;
  }

  const nodePlans = nodes.map((n) => {
    const plan = plansMap.get(n.id)!;
    return {
      ...plan,
      complexityScore: complexityByNodeId.get(n.id) ?? 0,
    };
  });

  const countsByTier: Record<NodeTier, number> = {
    full: 0,
    skeleton: 0,
    map: 0,
    excluded: 0,
  };
  for (const p of nodePlans) {
    countsByTier[p.tier]++;
  }

  // Assemble final prompt-ready context packet
  const fullBlocks = nodePlans.filter((p) => p.tier === 'full');
  const skeletonBlocks = nodePlans.filter((p) => p.tier === 'skeleton');
  const mapBlocks = nodePlans.filter((p) => p.tier === 'map');

  const packetSections: string[] = [];
  packetSections.push('<context_slice mode="progressive-ast-skeleton">');

  // Preserve top-level imports, constants & types for every file that contributes code blocks
  const fileById = new Map(workspace.files.map((f) => [f.id, f]));
  const fullStart1EndLine = new Map<string, number>();
  const coveredRangesByFile = new Map<string, Array<[number, number]>>();
  const addCoveredRange = (fileId: string, start: number, end: number) => {
    const arr = coveredRangesByFile.get(fileId) ?? [];
    arr.push([start, end]);
    coveredRangesByFile.set(fileId, arr);
  };
  for (const p of fullBlocks) {
    addCoveredRange(p.node.fileId, p.node.startLine, p.node.endLine);
    if (p.node.startLine === 1) {
      fullStart1EndLine.set(
        p.node.fileId,
        Math.max(fullStart1EndLine.get(p.node.fileId) ?? 0, p.node.endLine),
      );
    }
  }
  for (const p of skeletonBlocks) {
    if (p.node.skeletonCode === p.node.fullCode) {
      addCoveredRange(p.node.fileId, p.node.startLine, p.node.endLine);
    }
  }

  const seenFileIds = new Set<string>();
  const headerEndByFile = new Map<string, number>();
  const preservedHeaders: Array<{ filePath: string; endLine: number; header: string }> = [];
  for (const p of [...fullBlocks, ...skeletonBlocks]) {
    if (seenFileIds.has(p.node.fileId)) continue;
    seenFileIds.add(p.node.fileId);
    const file = fileById.get(p.node.fileId);
    if (!file) continue;
    const hdr = extractFileHeader(file.content);
    if (!hdr) continue;
    const coveredEnd = fullStart1EndLine.get(p.node.fileId) ?? 0;
    if (coveredEnd >= hdr.endLine) continue;
    headerEndByFile.set(file.id, hdr.endLine);
    preservedHeaders.push({ filePath: file.path, endLine: hdr.endLine, header: hdr.header });
  }

  const preservedFooters: Array<{ filePath: string; startLine: number; endLine: number; footer: string }> = [];
  for (const fileId of seenFileIds) {
    const file = fileById.get(fileId);
    if (!file) continue;
    const hasUnfullNode = nodePlans.some((p) => p.node.fileId === fileId && p.tier !== 'full');
    const ranges = coveredRangesByFile.get(fileId) ?? [];
    const wholeFileCovered = ranges.some(([s, e]) => s <= 1 && e >= file.lineCount);
    if (!hasUnfullNode && wholeFileCovered) continue;

    const ftr = extractFileFooter(file.content);
    if (!ftr) continue;
    const hdrEnd = headerEndByFile.get(fileId) ?? 0;
    const uncoveredChunks = ftr.chunks.filter(
      (c) =>
        c.startLine > hdrEnd &&
        !ranges.some(([s, e]) => c.startLine >= s && c.endLine <= e),
    );
    if (uncoveredChunks.length > 0) {
      preservedFooters.push({
        filePath: file.path,
        startLine: uncoveredChunks[0].startLine,
        endLine: uncoveredChunks[uncoveredChunks.length - 1].endLine,
        footer: uncoveredChunks.map((c) => c.text).join('\n'),
      });
    }
  }

  if (preservedHeaders.length > 0) {
    packetSections.push(
      '  <file_headers note="Top-level imports, module constants, and type declarations preserved for included files">',
    );
    for (const h of preservedHeaders) {
      packetSections.push(`    // [${h.filePath}:1-${h.endLine}] (file header)`);
      packetSections.push(h.header);
      packetSections.push('');
    }
    packetSections.push('  </file_headers>');
  }

  if (mapBlocks.length > 0) {
    packetSections.push('  <repo_symbol_map>');
    for (const p of mapBlocks) {
      packetSections.push(
        `    - ${p.node.filePath}:${p.node.startLine}-${p.node.endLine} | ${p.node.kind} ${p.node.name}`,
      );
    }
    packetSections.push('  </repo_symbol_map>');
  }

  if (skeletonBlocks.length > 0) {
    packetSections.push('  <dependency_skeletons note="Signatures and types only; implementations folded">');
    for (const p of skeletonBlocks) {
      packetSections.push(`    // [${p.node.filePath}:${p.node.startLine}-${p.node.endLine}] (${p.reason})`);
      packetSections.push(p.node.skeletonCode);
      packetSections.push('');
    }
    packetSections.push('  </dependency_skeletons>');
  }

  if (fullBlocks.length > 0) {
    packetSections.push('  <focal_implementations note="Full source code for active edit targets & auto-expanded complex clusters">');
    for (const p of fullBlocks) {
      const tag = p.autoExpanded ? ' [MCP: expand_skeleton_cluster]' : '';
      packetSections.push(`    // [${p.node.filePath}:${p.node.startLine}-${p.node.endLine}]${tag}`);
      packetSections.push(p.node.fullCode);
      packetSections.push('');
    }
    packetSections.push('  </focal_implementations>');
  }

  if (preservedFooters.length > 0) {
    packetSections.push(
      '  <file_footers note="Module-level exports and tail constant assignments preserved for partially sliced files">',
    );
    for (const ftr of preservedFooters) {
      packetSections.push(`    // [${ftr.filePath}:${ftr.startLine}-${ftr.endLine}] (file footer)`);
      packetSections.push(ftr.footer);
      packetSections.push('');
    }
    packetSections.push('  </file_footers>');
  }

  packetSections.push('</context_slice>');
  const assembledPacket = packetSections.join('\n');
  const totalInjectedTokens = estimateTokens(assembledPacket);

  const codeReductionPercent =
    totalRawTokens > 0
      ? Math.max(0, Number((((totalRawTokens - totalInjectedTokens) / totalRawTokens) * 100).toFixed(1)))
      : 0;

  // Protocol & Skill Context Tax Benchmark (per-turn overhead + raw read bloat)
  const traditionalSkillAndMcpTax = 4850; // ~2,000 tokens Skill prompt + ~2,850 tokens (18-22 MCP tool JSON schemas)
  const traditionalMultiTurnReadBloat = Math.round(totalRawTokens * 1.15);
  const traditionalTotalTokens = traditionalSkillAndMcpTax + traditionalMultiTurnReadBloat;

  const thinMcpSchemaTax = 185; // 1 consolidated tool: get_context_slice(query, budget)
  const thinMcpTotalTokens = thinMcpSchemaTax + totalInjectedTokens;

  const zeroTaxSchemaOverhead = 0;
  const zeroMcpRuleTax = 42; // Ultra-short 42-token instruction pointing to .context/active-slice.md
  const zeroTaxTotalTokens = totalInjectedTokens;

  const netSavingsVsTraditionalPercent =
    traditionalTotalTokens > 0
      ? Math.max(
          0,
          Number((((traditionalTotalTokens - zeroTaxTotalTokens) / traditionalTotalTokens) * 100).toFixed(1)),
        )
      : 0;

  const metrics: ProtocolComparisonMetrics = {
    rawRepoTokens: totalRawTokens,
    slicedCodeTokens: totalInjectedTokens,
    codeReductionPercent,
    traditionalSkillAndMcpTax,
    traditionalMultiTurnReadBloat,
    traditionalTotalTokens,
    thinMcpSchemaTax,
    thinMcpTotalTokens,
    zeroTaxSchemaOverhead,
    zeroMcpRuleTax,
    zeroTaxTotalTokens,
    netSavingsVsTraditionalPercent,
  };

  return {
    nodePlans,
    focalNodeIds: focalIds,
    totalInjectedTokens,
    budgetTokens,
    budgetUtilizationPercent:
      budgetTokens > 0 ? Math.min(999, Number(((totalInjectedTokens / budgetTokens) * 100).toFixed(1))) : 0,
    overBudget: totalInjectedTokens > budgetTokens,
    countsByTier,
    metrics,
    assembledPacket,
    detectedClusters: updatedClusters,
    autoExpandedNodeIds: expandedIds,
    autoExpansionToolCall: toolCallRecord,
    remainingBudgetForExpansion,
  };
}
