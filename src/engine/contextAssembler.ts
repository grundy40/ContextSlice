import { getMessages, Locale } from '../i18n';
import { APP_VERSION } from '../version';
import {
  AstSymbolNode,
  CodeFile,
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

const PLAIN_TEXT_CONFIG_EXT_RE = /\.(json|jsonc|json5|yaml|yml|toml|ini|cfg|conf|xml|properties|txt)$/i;

const EN_CONVERSATIONAL_STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as', 'into', 'about',
  'how', 'why', 'what', 'when', 'where', 'who', 'which', 'whom', 'whose',
  'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might', 'must',
  'do', 'does', 'did', 'done', 'doing', 'have', 'has', 'had', 'having',
  'please', 'pls', 'help', 'me', 'my', 'we', 'our', 'you', 'your', 'they', 'their',
  'it', 'its', 'this', 'that', 'these', 'those', 'there', 'here',
  'and', 'or', 'but', 'so', 'than', 'too', 'very', 'just', 'only', 'also',
  'fix', 'modify', 'want', 'need', 'tell',
]);

const ZH_CONVERSATIONAL_STOPWORDS_RE =
  /為什麼|为什么|怎麼樣|怎么样|怎麼|怎么|如何|請幫我|请帮我|幫我|帮我|請問|请问|修改|更改|調整|调整|一下|什麼|什么|這個|这个|那個|那个|哪裡|哪里|[的了嗎呢啊吧著着過把被給跟與及]/g;

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

  // 1. ASCII 部分（保留版號與連字號識別碼如 0.4.0、v0.4.0、ctxslice-mcp，同時安全濾除自然語言口語停用詞）
  const asciiParts = trimmed.toLowerCase().match(/[a-z0-9_]+(?:[.-][a-z0-9_]+)*/g) ?? [];
  for (const p of asciiParts) {
    if (p.length >= 2 && !EN_CONVERSATIONAL_STOPWORDS.has(p)) {
      tokens.add(p);
      if (/^v\d/.test(p) && p.length >= 3) {
        tokens.add(p.slice(1));
      }
      if (p.includes('.') || p.includes('-')) {
        for (const sub of p.split(/[.-]/)) {
          if (sub.length >= 2 && !EN_CONVERSATIONAL_STOPWORDS.has(sub)) {
            tokens.add(sub);
          }
        }
      }
    }
  }

  // 2. Bilingual 關鍵字映射
  for (const [pattern, synonyms] of BILINGUAL_KEYWORDS) {
    if (pattern.test(trimmed)) {
      for (const s of synonyms) tokens.add(s);
    }
  }

  // 3. CJK 2-gram 分詞（先濾除自然語言口語停用詞，保留技術關鍵字）
  if (containsCJK(trimmed)) {
    const cleanedCjk = trimmed.replace(ZH_CONVERSATIONAL_STOPWORDS_RE, ' ');
    if (containsCJK(cleanedCjk)) {
      const cjkTerms = tokenizeCJK2gram(cleanedCjk);
      cjkTerms.forEach((term) => tokens.add(term));
    }
  }

  // 4. 雙語查詢擴展
  const allTerms = Array.from(tokens);
  for (const term of allTerms) {
    const bilingual = bilingualLookup(term);
    bilingual.forEach((t) => tokens.add(t));
  }

  return Array.from(tokens);
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mergeLineRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [rawS, rawE] of sorted) {
    const s = Math.max(1, rawS);
    const e = Math.max(s, rawE);
    if (merged.length === 0) {
      merged.push([s, e]);
    } else {
      const prev = merged[merged.length - 1];
      if (s <= prev[1] + 1) {
        prev[1] = Math.max(prev[1], e);
      } else {
        merged.push([s, e]);
      }
    }
  }
  return merged;
}

function formatShownLines(ranges: Array<[number, number]>): string {
  const merged = mergeLineRanges(ranges);
  if (merged.length === 0) return 'none';
  return merged.map(([s, e]) => (s === e ? String(s) : `${s}-${e}`)).join(', ');
}

interface ConfigWindowSlice {
  windowedCode: string;
  ranges: Array<[number, number]>;
  tokens: number;
}

function slicePlainTextConfigWindow(
  content: string,
  queryTerms: string[],
): ConfigWindowSlice | null {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines.length <= 200) return null;

  const matchedLines: number[] = [];
  if (queryTerms.length > 0) {
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (queryTerms.some((t) => lower.includes(t))) {
        matchedLines.push(i + 1);
      }
    }
  }

  const rawRanges: Array<[number, number]> =
    matchedLines.length > 0
      ? matchedLines.map((ln) => [Math.max(1, ln - 40), Math.min(lines.length, ln + 40)])
      : [[1, Math.min(lines.length, 81)]];

  const merged = mergeLineRanges(rawRanges);
  const parts: string[] = [];
  for (let idx = 0; idx < merged.length; idx++) {
    const [s, e] = merged[idx];
    if (idx > 0) {
      const prevEnd = merged[idx - 1][1];
      parts.push(`// ... lines ${prevEnd + 1}-${s - 1} omitted ...`);
    }
    parts.push(lines.slice(s - 1, e).join('\n'));
  }

  const windowedCode = parts.join('\n');
  return {
    windowedCode,
    ranges: merged,
    tokens: estimateTokens(windowedCode),
  };
}

function buildRepositoryFileTree(files: CodeFile[], maxTokens = 1800): string[] {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const out: string[] = [];
  let usedTokens = 0;
  let omittedCount = 0;

  for (const f of sorted) {
    const line = `    ${f.path} (${f.lineCount} lines)`;
    const tk = estimateTokens(line);
    if (usedTokens + tk > maxTokens && out.length > 0) {
      omittedCount++;
      continue;
    }
    usedTokens += tk;
    out.push(line);
  }

  if (omittedCount > 0) {
    out.push(`    ... (${omittedCount} more files omitted to keep overview within ~1.8K tokens)`);
  }
  return out;
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
  const trimmedQuery = query.trim();
  const hasManualOverride = Object.values(overrides).some((m) => m === 'full' || m === 'skeleton');
  const validPinnedIds = pinnedFocalIds.filter((id) => nodes.some((n) => n.id === id));

  // State A: Empty query with no manual pins/overrides -> return repository file tree overview
  if (trimmedQuery === '' && validPinnedIds.length === 0 && !hasManualOverride) {
    const emptyPlans: ComputedNodePlan[] = nodes.map((node) => ({
      node,
      tier: 'excluded',
      override: overrides[node.id] ?? 'auto',
      hopDistance: null,
      relevanceScore: 0,
      isFocal: false,
      injectedTokens: 0,
      reason: eng.reasonDefaultExcluded,
    }));
    const treeLines = buildRepositoryFileTree(workspace.files, 1800);
    const packetSections: string[] = [
      `<context_slice mode="file_tree_empty_query" version="${APP_VERSION.replace(/^v/, '')}" total_files="${workspace.files.length}">`,
      '  <note>Empty query received. Returning repository file tree overview; call context_slice again with specific symbol or file keywords to retrieve code.</note>',
      '  <repository_file_tree>',
      ...treeLines,
      '  </repository_file_tree>',
      '</context_slice>',
    ];
    const assembledPacket = packetSections.join('\n');
    const totalInjectedTokens = workspace.files.length === 0 ? 0 : estimateTokens(assembledPacket);
    return {
      nodePlans: emptyPlans,
      focalNodeIds: [],
      totalInjectedTokens,
      budgetTokens,
      budgetUtilizationPercent:
        budgetTokens > 0 ? Math.min(999, Number(((totalInjectedTokens / budgetTokens) * 100).toFixed(1))) : 0,
      overBudget: totalInjectedTokens > budgetTokens,
      countsByTier: { full: 0, skeleton: 0, map: 0, excluded: nodes.length },
      metrics: {
        rawRepoTokens: totalRawTokens,
        slicedCodeTokens: totalInjectedTokens,
        codeReductionPercent:
          totalRawTokens > 0
            ? Math.max(0, Number((((totalRawTokens - totalInjectedTokens) / totalRawTokens) * 100).toFixed(1)))
            : 0,
        traditionalSkillAndMcpTax: 4850,
        traditionalMultiTurnReadBloat: Math.round(totalRawTokens * 1.15),
        traditionalTotalTokens: 4850 + Math.round(totalRawTokens * 1.15),
        thinMcpSchemaTax: 185,
        thinMcpTotalTokens: 185 + totalInjectedTokens,
        zeroTaxSchemaOverhead: 0,
        zeroMcpRuleTax: 42,
        zeroTaxTotalTokens: totalInjectedTokens,
        netSavingsVsTraditionalPercent: 0,
      },
      assembledPacket: workspace.files.length === 0 ? '' : assembledPacket,
      detectedClusters: [],
      autoExpandedNodeIds: [],
      autoExpansionToolCall: null,
      remainingBudgetForExpansion: budgetTokens,
    };
  }

  const queryTerms = expandQueryTerms(query);

  // Precompute ±40-line local windows for >200-line plain-text config files
  const configWindowByNodeId = new Map<string, ConfigWindowSlice>();
  for (const node of nodes) {
    if (
      node.kind === 'module' &&
      node.lineCount > 200 &&
      PLAIN_TEXT_CONFIG_EXT_RE.test(node.filePath)
    ) {
      const win = slicePlainTextConfigWindow(node.fullCode, queryTerms);
      if (win) {
        configWindowByNodeId.set(node.id, win);
      }
    }
  }

  const getEffectiveRawTokens = (node: AstSymbolNode) =>
    configWindowByNodeId.get(node.id)?.tokens ?? node.rawTokens;

  // 1. Score all nodes with TF-IDF scarcity weighting
  const scores = new Map<string, number>();
  for (const node of nodes) {
    scores.set(node.id, scoreNodeRelevance(node, queryTerms, nodes));
  }

  // 2. Determine focal nodes (pinned takes precedence, else top TF-IDF matches; NO arbitrary fallback on 0-match queries)
  let focalIds: string[] = [...validPinnedIds];

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

  // 4. Priority ordering & greedy budget-aware tier assignment (On-Demand Blanking: NO unrelated stuffing)
  const plansMap = new Map<string, ComputedNodePlan>();
  const packetOverheadTokens = 95;
  let remainingBudget = Math.max(0, budgetTokens - packetOverheadTokens);

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

    const typeA = a.kind === 'interface' || a.kind === 'type' ? 1 : 0;
    const typeB = b.kind === 'interface' || b.kind === 'type' ? 1 : 0;
    return typeB - typeA;
  });

  for (const node of prioritySorted) {
    const override = overrides[node.id] ?? 'auto';
    const hop = hopMap.has(node.id) ? hopMap.get(node.id)! : null;
    const isFocal = focalSet.has(node.id);
    const relevanceScore = scores.get(node.id) ?? 0;
    const effRawTokens = getEffectiveRawTokens(node);

    let tier: NodeTier = 'excluded';
    let reason = eng.reasonDefaultExcluded;

    if (override === 'exclude') {
      tier = 'excluded';
      reason = eng.reasonManualExclude;
    } else if (override === 'full') {
      tier = 'full';
      remainingBudget = Math.max(0, remainingBudget - effRawTokens);
      reason = eng.reasonManualFull;
    } else if (override === 'skeleton') {
      tier = 'skeleton';
      remainingBudget = Math.max(0, remainingBudget - node.skeletonTokens);
      reason = eng.reasonManualSkeleton;
    } else {
      // Strictly include ONLY focal targets, 1/2-hop neighbors, and same-file types/constants
      if (isFocal) {
        if (effRawTokens <= remainingBudget || remainingBudget === budgetTokens - packetOverheadTokens) {
          tier = 'full';
          remainingBudget = Math.max(0, remainingBudget - effRawTokens);
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
        tier = 'skeleton';
        remainingBudget = Math.max(0, remainingBudget - node.skeletonTokens);
        reason = eng.reasonSameFileType;
      }
      // On-demand blanking: leave remaining budget unused instead of stuffing unrelated symbols
    }

    const injectedTokens =
      tier === 'full'
        ? effRawTokens
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
    plan.injectedTokens = getEffectiveRawTokens(plan.node);
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

  const fullBlocks = nodePlans.filter((p) => p.tier === 'full');
  const skeletonBlocks = nodePlans.filter((p) => p.tier === 'skeleton');
  const mapBlocks = nodePlans.filter((p) => p.tier === 'map');

  // State B: Non-empty query with 0 matches (and no manual overrides) -> warn agent & return repository file tree
  if (trimmedQuery !== '' && fullBlocks.length === 0 && skeletonBlocks.length === 0 && mapBlocks.length === 0) {
    const treeLines = buildRepositoryFileTree(workspace.files, 1800);
    const packetSections: string[] = [
      `<context_slice mode="file_tree_zero_matches" version="${APP_VERSION.replace(/^v/, '')}" query="${escapeXmlAttr(query)}">`,
      `  <note>WARNING: 0 matches found for query "${escapeXmlText(query)}". Do NOT guess code from this file tree alone—pick valid file paths or symbol names from the tree below and call context_slice again.</note>`,
      '  <repository_file_tree>',
      ...treeLines,
      '  </repository_file_tree>',
      '</context_slice>',
    ];
    const assembledPacket = packetSections.join('\n');
    const totalInjectedTokens = estimateTokens(assembledPacket);
    return {
      nodePlans,
      focalNodeIds: [],
      totalInjectedTokens,
      budgetTokens,
      budgetUtilizationPercent:
        budgetTokens > 0 ? Math.min(999, Number(((totalInjectedTokens / budgetTokens) * 100).toFixed(1))) : 0,
      overBudget: totalInjectedTokens > budgetTokens,
      countsByTier: { full: 0, skeleton: 0, map: 0, excluded: nodes.length },
      metrics: {
        rawRepoTokens: totalRawTokens,
        slicedCodeTokens: totalInjectedTokens,
        codeReductionPercent:
          totalRawTokens > 0
            ? Math.max(0, Number((((totalRawTokens - totalInjectedTokens) / totalRawTokens) * 100).toFixed(1)))
            : 0,
        traditionalSkillAndMcpTax: 4850,
        traditionalMultiTurnReadBloat: Math.round(totalRawTokens * 1.15),
        traditionalTotalTokens: 4850 + Math.round(totalRawTokens * 1.15),
        thinMcpSchemaTax: 185,
        thinMcpTotalTokens: 185 + totalInjectedTokens,
        zeroTaxSchemaOverhead: 0,
        zeroMcpRuleTax: 42,
        zeroTaxTotalTokens: totalInjectedTokens,
        netSavingsVsTraditionalPercent: 0,
      },
      assembledPacket,
      detectedClusters: [],
      autoExpandedNodeIds: [],
      autoExpansionToolCall: null,
      remainingBudgetForExpansion: budgetTokens,
    };
  }

  // Group output cleanly per file with <file path="..." total_lines="..." shown_lines="...">
  const fileById = new Map(workspace.files.map((f) => [f.id, f]));
  const fullStart1EndLine = new Map<string, number>();
  const coveredRangesByFile = new Map<string, Array<[number, number]>>();
  const addCoveredRange = (fileId: string, start: number, end: number) => {
    const arr = coveredRangesByFile.get(fileId) ?? [];
    arr.push([start, end]);
    coveredRangesByFile.set(fileId, arr);
  };

  for (const p of fullBlocks) {
    const win = configWindowByNodeId.get(p.node.id);
    if (win) {
      for (const [s, e] of win.ranges) {
        addCoveredRange(p.node.fileId, s, e);
        if (s === 1) {
          fullStart1EndLine.set(p.node.fileId, Math.max(fullStart1EndLine.get(p.node.fileId) ?? 0, e));
        }
      }
    } else {
      addCoveredRange(p.node.fileId, p.node.startLine, p.node.endLine);
      if (p.node.startLine === 1) {
        fullStart1EndLine.set(
          p.node.fileId,
          Math.max(fullStart1EndLine.get(p.node.fileId) ?? 0, p.node.endLine),
        );
      }
    }
  }
  for (const p of skeletonBlocks) {
    if (p.node.skeletonCode === p.node.fullCode) {
      addCoveredRange(p.node.fileId, p.node.startLine, p.node.endLine);
    }
  }

  const seenFileIds: string[] = [];
  const seenFileSet = new Set<string>();
  for (const p of [...fullBlocks, ...skeletonBlocks]) {
    if (!seenFileSet.has(p.node.fileId)) {
      seenFileSet.add(p.node.fileId);
      seenFileIds.push(p.node.fileId);
    }
  }

  const headerByFile = new Map<string, { endLine: number; header: string }>();
  for (const fileId of seenFileIds) {
    const file = fileById.get(fileId);
    if (!file || PLAIN_TEXT_CONFIG_EXT_RE.test(file.path)) continue;
    const hdr = extractFileHeader(file.content);
    if (!hdr) continue;
    const coveredEnd = fullStart1EndLine.get(fileId) ?? 0;
    if (coveredEnd >= hdr.endLine) continue;
    headerByFile.set(fileId, hdr);
  }

  const footerByFile = new Map<string, { startLine: number; endLine: number; footer: string; chunks: FileFooterChunk[] }>();
  for (const fileId of seenFileIds) {
    const file = fileById.get(fileId);
    if (!file || PLAIN_TEXT_CONFIG_EXT_RE.test(file.path)) continue;
    const hasUnfullNode = nodePlans.some((p) => p.node.fileId === fileId && p.tier !== 'full');
    const ranges = coveredRangesByFile.get(fileId) ?? [];
    const wholeFileCovered = ranges.some(([s, e]) => s <= 1 && e >= file.lineCount);
    if (!hasUnfullNode && wholeFileCovered) continue;

    const ftr = extractFileFooter(file.content);
    if (!ftr) continue;
    const hdrEnd = headerByFile.get(fileId)?.endLine ?? 0;
    const uncoveredChunks = ftr.chunks.filter(
      (c) =>
        c.startLine > hdrEnd &&
        !ranges.some(([s, e]) => c.startLine >= s && c.endLine <= e),
    );
    if (uncoveredChunks.length > 0) {
      footerByFile.set(fileId, {
        startLine: uncoveredChunks[0].startLine,
        endLine: uncoveredChunks[uncoveredChunks.length - 1].endLine,
        footer: uncoveredChunks.map((c) => c.text).join('\n'),
        chunks: uncoveredChunks,
      });
    }
  }

  const packetSections: string[] = [];
  packetSections.push(
    `<context_slice mode="progressive-structural-slice" version="${APP_VERSION.replace(/^v/, '')}" budget="${budgetTokens}">`,
  );

  for (const fileId of seenFileIds) {
    const file = fileById.get(fileId);
    if (!file) continue;
    const fileFulls = fullBlocks.filter((p) => p.node.fileId === fileId);
    const fileSkels = skeletonBlocks.filter((p) => p.node.fileId === fileId);
    const hdr = headerByFile.get(fileId);
    const ftr = footerByFile.get(fileId);

    const shownRanges: Array<[number, number]> = [];
    if (hdr) shownRanges.push([1, hdr.endLine]);
    for (const p of fileFulls) {
      const win = configWindowByNodeId.get(p.node.id);
      if (win) shownRanges.push(...win.ranges);
      else shownRanges.push([p.node.startLine, p.node.endLine]);
    }
    for (const p of fileSkels) {
      const win = configWindowByNodeId.get(p.node.id);
      if (win) shownRanges.push(...win.ranges);
      else shownRanges.push([p.node.startLine, p.node.endLine]);
    }
    if (ftr) {
      for (const c of ftr.chunks) shownRanges.push([c.startLine, c.endLine]);
    }

    const shownLinesAttr = formatShownLines(shownRanges);
    packetSections.push(
      `  <file path="${escapeXmlAttr(file.path)}" total_lines="${file.lineCount}" shown_lines="${shownLinesAttr}">`,
    );

    if (hdr) {
      packetSections.push(`    <file_header lines="1-${hdr.endLine}">`);
      packetSections.push(hdr.header);
      packetSections.push('    </file_header>');
    }

    const combinedBlocks = [
      ...fileSkels.map((p) => ({ kind: 'skeleton' as const, plan: p })),
      ...fileFulls.map((p) => ({ kind: 'full' as const, plan: p })),
    ].sort((a, b) => a.plan.node.startLine - b.plan.node.startLine);

    for (const entry of combinedBlocks) {
      const p = entry.plan;
      const win = configWindowByNodeId.get(p.node.id);
      if (entry.kind === 'skeleton') {
        packetSections.push(
          `    <skeleton symbol="${escapeXmlAttr(p.node.name)}" lines="${p.node.startLine}-${p.node.endLine}" note="${escapeXmlAttr(p.reason)}">`,
        );
        packetSections.push(win ? win.windowedCode : p.node.skeletonCode);
        packetSections.push('    </skeleton>');
      } else {
        const tag = p.autoExpanded ? ' autoExpanded="true"' : '';
        const linesAttr = win ? formatShownLines(win.ranges) : `${p.node.startLine}-${p.node.endLine}`;
        packetSections.push(
          `    <focal symbol="${escapeXmlAttr(p.node.name)}" lines="${linesAttr}"${tag}>`,
        );
        packetSections.push(win ? win.windowedCode : p.node.fullCode);
        packetSections.push('    </focal>');
      }
    }

    if (ftr) {
      packetSections.push(`    <file_footer lines="${ftr.startLine}-${ftr.endLine}">`);
      packetSections.push(ftr.footer);
      packetSections.push('    </file_footer>');
    }

    packetSections.push('  </file>');
  }

  if (mapBlocks.length > 0) {
    packetSections.push('  <repo_symbol_map>');
    for (const p of mapBlocks) {
      const fTotal = fileById.get(p.node.fileId)?.lineCount ?? p.node.endLine;
      packetSections.push(
        `    <file path="${escapeXmlAttr(p.node.filePath)}" total_lines="${fTotal}" shown_lines="${p.node.startLine}-${p.node.endLine}">`,
      );
      packetSections.push(`      ${p.node.kind} ${p.node.name}`);
      packetSections.push('    </file>');
    }
    packetSections.push('  </repo_symbol_map>');
  }

  packetSections.push('</context_slice>');
  const assembledPacket = packetSections.join('\n');
  const totalInjectedTokens = estimateTokens(assembledPacket);

  const codeReductionPercent =
    totalRawTokens > 0
      ? Math.max(0, Number((((totalRawTokens - totalInjectedTokens) / totalRawTokens) * 100).toFixed(1)))
      : 0;

  // Protocol & Skill Context Tax Benchmark (per-turn overhead + raw read bloat)
  const traditionalSkillAndMcpTax = 4850;
  const traditionalMultiTurnReadBloat = Math.round(totalRawTokens * 1.15);
  const traditionalTotalTokens = traditionalSkillAndMcpTax + traditionalMultiTurnReadBloat;

  const thinMcpSchemaTax = 185;
  const thinMcpTotalTokens = thinMcpSchemaTax + totalInjectedTokens;

  const zeroTaxSchemaOverhead = 0;
  const zeroMcpRuleTax = 42;
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
