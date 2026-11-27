import { getMessages, Locale } from '../i18n';
import { AstSymbolNode, ComputedNodePlan, DependencyEdge } from '../types/context';

export interface SemanticMatchInfo {
  nodeId: string;
  score: number;
  kind: 'name' | 'variable' | 'behavior' | 'fuzzy' | 'structure';
  reasonLabel: string;
  matchedTerm?: string;
}

const BEHAVIOR_SYNONYM_GROUPS: Array<{ pattern: RegExp; terms: string[] }> = [
  {
    pattern: /雨刷|雨水|雨量|擋風玻璃|wiper|rain|windshield/i,
    terms: ['wiper', 'wipers', 'windshield', 'rain', 'sweep', 'washer', 'intermittent', 'blade', 'mist'],
  },
  {
    pattern: /馬達|驅動|轉速|開關|motor|drive|actuator|pwm/i,
    terms: ['motor', 'drive', 'actuator', 'pwm', 'relay', 'switch', 'toggle', 'power', 'voltage'],
  },
  {
    pattern: /感測|偵測|讀取|sensor|detect|sense/i,
    terms: ['sensor', 'detect', 'sense', 'measure', 'sample', 'read', 'poll', 'signal', 'threshold'],
  },
  {
    pattern: /速度|車速|節流|延遲|間隔|speed|interval|delay|throttle/i,
    terms: ['speed', 'velocity', 'interval', 'delay', 'throttle', 'debounce', 'timer', 'tick', 'rate'],
  },
  {
    pattern: /處理|控制|執行|管理|排程|process|handle|control|manage/i,
    terms: ['handle', 'process', 'control', 'manage', 'execute', 'run', 'dispatch', 'orchestrate', 'update'],
  },
  {
    pattern: /認證|登入|權限|帳號|token|auth|login|session/i,
    terms: ['auth', 'login', 'logout', 'session', 'token', 'jwt', 'oauth', 'permission', 'role', 'guard'],
  },
  {
    pattern: /快取|同步|儲存|記憶|cache|sync|store|persist/i,
    terms: ['cache', 'sync', 'invalidate', 'revalidate', 'store', 'persist', 'storage', 'snapshot'],
  },
  {
    pattern: /驗證|檢查|校驗|防呆|valid|check|verify/i,
    terms: ['validate', 'verify', 'check', 'assert', 'guard', 'schema', 'sanitize', 'parse'],
  },
  {
    pattern: /重試|錯誤|例外|復原|失敗|retry|error|recover|fallback/i,
    terms: ['retry', 'error', 'exception', 'catch', 'recover', 'fallback', 'backoff', 'queue', 'fail'],
  },
  {
    pattern: /訂單|結帳|購物車|庫存|折扣|付款|order|checkout|cart|stock|discount|pay/i,
    terms: ['order', 'checkout', 'cart', 'inventory', 'stock', 'discount', 'coupon', 'payment', 'charge', 'price'],
  },
  {
    pattern: /通知|推播|事件|日誌|紀錄|notify|event|log|audit/i,
    terms: ['notify', 'webhook', 'alert', 'emit', 'event', 'dispatch', 'log', 'audit', 'track'],
  },
  {
    pattern: /搜尋|過濾|查詢|比對|search|filter|query|match/i,
    terms: ['search', 'filter', 'query', 'match', 'find', 'lookup', 'rank', 'score'],
  },
  {
    pattern: /渲染|畫面|排版|繪製|圖表|render|draw|paint|layout|chart/i,
    terms: ['render', 'draw', 'paint', 'layout', 'view', 'canvas', 'svg', 'chart', 'zoom', 'pan'],
  },
  {
    pattern: /匯出|匯入|讀檔|下載|export|import|file|pdf/i,
    terms: ['export', 'import', 'download', 'upload', 'read', 'write', 'file', 'pdf', 'stream'],
  },
  {
    pattern: /連線|請求|網路|fetch|http|api|request|socket/i,
    terms: ['fetch', 'request', 'response', 'api', 'http', 'client', 'endpoint', 'socket', 'connect'],
  },
];

const CHINESE_GLUE_PATTERN = /[處理邏輯功能程式負責相關的跟與及機制流程怎麼如何做這那一下]/g;

function splitIdentifierWords(ident: string): string[] {
  return ident
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-./:]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/**
 * Computes subsequence / character-overlap similarity in [0, 1] for fuzzy typo matching.
 */
function fuzzySubsequenceScore(haystack: string, needle: string): number {
  if (!haystack || !needle || needle.length < 3) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h.includes(n)) return 1;

  let hi = 0;
  let ni = 0;
  let consecutive = 0;
  let maxConsecutive = 0;

  while (hi < h.length && ni < n.length) {
    if (h[hi] === n[ni]) {
      ni += 1;
      consecutive += 1;
      if (consecutive > maxConsecutive) maxConsecutive = consecutive;
    } else {
      consecutive = 0;
    }
    hi += 1;
  }

  if (ni < n.length) return 0;
  const compactness = n.length / Math.max(n.length, h.length);
  const streakRatio = maxConsecutive / n.length;
  return Math.min(0.95, 0.45 * compactness + 0.55 * streakRatio);
}

function extractCommentsFromCode(code: string): string {
  const blockComments = code.match(/\/\*[\s\S]*?\*\//g) ?? [];
  const lineComments = code.match(/(?:\/\/|#)[^\n]*/g) ?? [];
  return [...blockComments, ...lineComments].join(' ').toLowerCase();
}

function extractQueryIntent(rawQuery: string): {
  rawLower: string;
  asciiTerms: string[];
  cjkPhrases: string[];
  expandedTerms: string[];
} {
  const rawLower = rawQuery.trim().toLowerCase();
  if (!rawLower) {
    return { rawLower: '', asciiTerms: [], cjkPhrases: [], expandedTerms: [] };
  }

  const asciiTerms = Array.from(
    new Set(
      (rawLower.match(/[a-z0-9_]+/g) ?? [])
        .flatMap((part) => [part, ...splitIdentifierWords(part)])
        .filter((t) => t.length >= 2),
    ),
  );

  // Extract CJK chunks after stripping generic glue words
  const strippedCjk = rawLower.replace(CHINESE_GLUE_PATTERN, ' ');
  const cjkPhrases = Array.from(
    new Set(
      (strippedCjk.match(/[\u4e00-\u9fff]{2,}/g) ?? []).flatMap((chunk) => {
        if (chunk.length <= 2) return [chunk];
        const grams = [chunk];
        for (let i = 0; i <= chunk.length - 2; i++) {
          grams.push(chunk.slice(i, i + 2));
        }
        return grams;
      }),
    ),
  );

  const expandedSet = new Set<string>();
  for (const group of BEHAVIOR_SYNONYM_GROUPS) {
    if (group.pattern.test(rawLower)) {
      for (const term of group.terms) {
        expandedSet.add(term);
      }
    }
  }

  return {
    rawLower,
    asciiTerms,
    cjkPhrases,
    expandedTerms: Array.from(expandedSet),
  };
}

function scoreSingleNode(
  node: AstSymbolNode,
  intent: ReturnType<typeof extractQueryIntent>,
  eng: ReturnType<typeof getMessages>['engine'],
): SemanticMatchInfo | null {
  const { rawLower, asciiTerms, cjkPhrases, expandedTerms } = intent;
  const nameLower = node.name.toLowerCase();
  const qualifiedLower = node.qualifiedName.toLowerCase();
  const pathLower = node.filePath.toLowerCase();
  const docLower = node.docComment.toLowerCase();
  const commentLower = extractCommentsFromCode(node.fullCode);
  const bodyLower = node.fullCode.toLowerCase();
  const nameWords = splitIdentifierWords(node.name);

  let score = 0;
  let kind: SemanticMatchInfo['kind'] = 'behavior';
  let reasonLabel = '';
  let matchedTerm: string | undefined;

  // 1. Direct name / qualifiedName / filePath match
  if (nameLower === rawLower) {
    score += 100;
    kind = 'name';
    reasonLabel = eng.semanticExactName;
  } else if (nameLower.includes(rawLower) || qualifiedLower.includes(rawLower)) {
    score += 75;
    kind = 'name';
    reasonLabel = eng.semanticDirectName;
  } else if (pathLower.includes(rawLower)) {
    score += 48;
    kind = 'name';
    reasonLabel = eng.semanticPathMatch;
  }

  // 2. Referenced variable / identifier match
  const exactVar = node.referencedIdentifiers.find((id) => id.toLowerCase().includes(rawLower));
  if (exactVar) {
    score += 55;
    if (kind !== 'name') {
      kind = 'variable';
      reasonLabel = eng.semanticVar(exactVar);
      matchedTerm = exactVar;
    }
  }

  // 3. CJK intent phrase match inside comments / docstrings / body
  for (const phrase of cjkPhrases) {
    if (docLower.includes(phrase) || commentLower.includes(phrase)) {
      score += 46;
      if (!reasonLabel) {
        kind = 'behavior';
        reasonLabel = eng.semanticDocPhrase(phrase);
        matchedTerm = phrase;
      }
    } else if (bodyLower.includes(phrase)) {
      score += 34;
      if (!reasonLabel) {
        kind = 'behavior';
        reasonLabel = eng.semanticBodyPhrase(phrase);
        matchedTerm = phrase;
      }
    }
  }

  // 4. Expanded behavioral / bilingual AST identifier & body match
  const searchTerms = Array.from(new Set([...asciiTerms, ...expandedTerms]));
  let behaviorHits = 0;
  for (const term of searchTerms) {
    const inName = nameLower.includes(term) || nameWords.includes(term);
    const inVars = node.referencedIdentifiers.some((id) => id.toLowerCase().includes(term));
    const inComments = docLower.includes(term) || commentLower.includes(term);
    const inBody = bodyLower.includes(term);

    if (inName) {
      score += asciiTerms.includes(term) ? 42 : 34;
      behaviorHits += 1;
      if (!reasonLabel) {
        kind = 'behavior';
        reasonLabel = eng.semanticBehaviorName(term);
        matchedTerm = term;
      }
    } else if (inVars) {
      score += asciiTerms.includes(term) ? 30 : 24;
      behaviorHits += 1;
      if (!reasonLabel) {
        kind = 'behavior';
        reasonLabel = eng.semanticBehaviorVar(term);
        matchedTerm = term;
      }
    } else if (inComments) {
      score += 24;
      behaviorHits += 1;
      if (!reasonLabel) {
        kind = 'behavior';
        reasonLabel = eng.semanticBehaviorDoc(term);
        matchedTerm = term;
      }
    } else if (inBody) {
      score += 14;
      behaviorHits += 1;
      if (!reasonLabel) {
        kind = 'behavior';
        reasonLabel = eng.semanticBehaviorBody(term);
        matchedTerm = term;
      }
    }
  }
  if (behaviorHits >= 2) {
    score += Math.min(20, behaviorHits * 6);
  }

  // 5. Fuzzy subsequence match for typos / abbreviated names (e.g. "wpr" -> "wiper")
  if (score === 0 && rawLower.length >= 3 && /^[a-z0-9_]+$/i.test(rawLower)) {
    const nameSim = fuzzySubsequenceScore(node.name, rawLower);
    if (nameSim >= 0.56) {
      score += Math.round(nameSim * 44);
      kind = 'fuzzy';
      reasonLabel = eng.semanticFuzzyName;
    } else {
      for (const id of node.referencedIdentifiers) {
        const varSim = fuzzySubsequenceScore(id, rawLower);
        if (varSim >= 0.65) {
          score += Math.round(varSim * 32);
          kind = 'fuzzy';
          reasonLabel = eng.semanticFuzzyVar(id);
          matchedTerm = id;
          break;
        }
      }
    }
  }

  if (score <= 0) return null;
  return {
    nodeId: node.id,
    score,
    kind,
    reasonLabel,
    matchedTerm,
  };
}

/**
 * Performs semantic + AST structural fuzzy matching across all symbol nodes.
 * Uses direct symbol/comment/behavior scoring plus 1-hop AST dependency edge propagation
 * so structurally coupled callers/callees also surface when searching by behavior.
 */
export function searchAstSymbolsSemantic(
  nodePlans: ComputedNodePlan[],
  edges: DependencyEdge[],
  rawQuery: string,
  semanticEnabled: boolean,
  locale: Locale = 'zh-TW',
): Map<string, SemanticMatchInfo> {
  const { engine: eng } = getMessages(locale);
  const results = new Map<string, SemanticMatchInfo>();
  const trimmed = rawQuery.trim();
  if (!trimmed) return results;

  const lower = trimmed.toLowerCase();

  if (!semanticEnabled) {
    for (const p of nodePlans) {
      const nameMatch =
        p.node.name.toLowerCase().includes(lower) ||
        p.node.qualifiedName.toLowerCase().includes(lower) ||
        p.node.filePath.toLowerCase().includes(lower);
      if (nameMatch) {
        results.set(p.node.id, {
          nodeId: p.node.id,
          score: 80,
          kind: 'name',
          reasonLabel: eng.semanticNameMatch,
        });
        continue;
      }
      const refVar = p.node.referencedIdentifiers.find((id) => id.toLowerCase().includes(lower));
      if (refVar) {
        results.set(p.node.id, {
          nodeId: p.node.id,
          score: 50,
          kind: 'variable',
          reasonLabel: eng.semanticVar(refVar),
          matchedTerm: refVar,
        });
      }
    }
    return results;
  }

  const intent = extractQueryIntent(trimmed);
  const directMatches = new Map<string, SemanticMatchInfo>();

  for (const p of nodePlans) {
    const match = scoreSingleNode(p.node, intent, eng);
    if (match) {
      directMatches.set(p.node.id, match);
      results.set(p.node.id, match);
    }
  }

  // Structural AST propagation: surface 1-hop callers/callees & same-class siblings
  // connected to strong direct semantic matches
  const nodeNameById = new Map(nodePlans.map((p) => [p.node.id, p.node.name]));
  for (const edge of edges) {
    const srcMatch = directMatches.get(edge.sourceNodeId);
    const dstMatch = directMatches.get(edge.targetNodeId);

    if (srcMatch && srcMatch.score >= 24 && !results.has(edge.targetNodeId)) {
      const propagatedScore = Math.round(srcMatch.score * 0.48);
      if (propagatedScore >= 14) {
        const srcName = nodeNameById.get(edge.sourceNodeId) ?? eng.semanticStructFallbackName;
        results.set(edge.targetNodeId, {
          nodeId: edge.targetNodeId,
          score: propagatedScore,
          kind: 'structure',
          reasonLabel: eng.semanticStructCalledBy(srcName),
          matchedTerm: srcName,
        });
      }
    }

    if (dstMatch && dstMatch.score >= 24 && !results.has(edge.sourceNodeId)) {
      const propagatedScore = Math.round(dstMatch.score * 0.45);
      if (propagatedScore >= 14) {
        const dstName = nodeNameById.get(edge.targetNodeId) ?? eng.semanticStructFallbackName;
        results.set(edge.sourceNodeId, {
          nodeId: edge.sourceNodeId,
          score: propagatedScore,
          kind: 'structure',
          reasonLabel: eng.semanticStructCalls(dstName),
          matchedTerm: dstName,
        });
      }
    }
  }

  return results;
}
