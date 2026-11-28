import { APP_VERSION } from '../version';
import { TREE_SITTER_JS_B64, TREE_SITTER_WASM_B64 } from './treeSitterBundle';

const SCRIPT_VERSION = APP_VERSION.replace(/^v/, '');

export interface GeneratorConfig {
  query: string;
  budgetTokens: number;
  maxHops: 1 | 2;
  toolDir?: string;
}

function normalizeToolDir(toolDir?: string): string {
  const cleaned = (toolDir || './tools').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return cleaned || './tools';
}

const EXTRACT_FILE_HEADER_SOURCE = String.raw`
function extractFileHeader(content, maxLines = 50, maxObjectLines = 60) {
  if (!content) return null;
  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  const limit = Math.min(lines.length, maxLines);
  const funcOrClassStartRe =
    /^(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:async\s+)?(?:function\*?\s+|class\s+)|^(?:async\s+)?def\s+|^func\s+|^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?(?:fn|struct|impl|trait)\s+|^(?:public|private|protected|internal|static|final|abstract|async|override|\s)*(?:class|record)\s+/;
  const importOrTypeOrVarRe =
    /^(?:import\b|export\s+(?:type|interface|const|let|var|enum)\b|type\s+|interface\s+|const\s+|let\s+|var\s+|package\s+|using\s+|from\s+\S+\s+import\b|#include\b|#define\b)/;
  const stripLineNoise = (line) =>
    line.replace(/(['"\x60])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$|#.*$/g, '');

  const countBlockSpan = (startIdx) => {
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
          if (opened && depth <= 0) return j - startIdx + 1;
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
      /^(?:[\w<>[\],*&:.]+\s+)+[A-Za-z_][A-Za-z0-9_]*\s*\([^;]*\)\s*(?:const|override|throws\s+[\w,\s]+)?\s*\{?$/.test(trimmed)
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
      if ((!isImport && span > maxObjectLines) || i + span > limit) break;
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
          (!nextT.startsWith('|') && !nextT.startsWith('&') && !nextT.startsWith('"') && !nextT.startsWith("'"))
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
  return { header: headerLines.join('\n'), endLine: headerLines.length };
}
`;

const EXTRACT_FOOTER_AND_CONST_SOURCE = String.raw`
function findStatementEndLine(lines, startIdx, mode) {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inBlockComment = false;
  let pyTripleQuote = null;
  const maxScan = Math.min(lines.length - 1, startIdx + 120);

  for (let j = startIdx; j <= maxScan; j++) {
    const raw = lines[j];
    const len = raw.length;
    let k = 0;
    while (k < len) {
      const ch = raw[k];
      const next = raw[k + 1];
      const next3 = mode === 'py' ? raw.slice(k, k + 3) : '';
      if (pyTripleQuote) {
        if (next3 === pyTripleQuote) { pyTripleQuote = null; k += 3; continue; }
        k++; continue;
      }
      if (inBlockComment) {
        if (ch === '*' && next === '/') { inBlockComment = false; k += 2; continue; }
        k++; continue;
      }
      if (mode === 'py' && ch === '#') break;
      if (mode !== 'py' && ch === '/' && next === '/') break;
      if (mode !== 'py' && ch === '/' && next === '*') { inBlockComment = true; k += 2; continue; }
      if (mode === 'py' && (next3 === '"""' || next3 === "'''")) { pyTripleQuote = next3; k += 3; continue; }
      if (ch === '"' || ch === "'" || (mode === 'ts' && ch === '\x60') || (mode === 'go' && ch === '\x60')) {
        const quote = ch;
        k++;
        while (k < len) {
          if (quote !== '\x60' && raw[k] === '\\') { k += 2; continue; }
          if (raw[k] === quote) { k++; break; }
          k++;
        }
        continue;
      }
      if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      else if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
      k++;
    }
    if (!inBlockComment && !pyTripleQuote && parenDepth <= 0 && bracketDepth <= 0 && braceDepth <= 0) {
      const trimmedEnd = raw.trimEnd();
      if (trimmedEnd.endsWith('\\')) continue;
      if (trimmedEnd.endsWith('=') && !trimmedEnd.endsWith('=>')) continue;
      return j;
    }
  }
  return maxScan;
}

function extractTopLevelConstants(code, ext, existingBlocks) {
  const e = (ext || '').toLowerCase();
  const lines = String(code || '').replace(/\r\n/g, '\n').split('\n');
  const covered = (existingBlocks || []).map((b) => [b.startLine, b.endLine]);
  const isCovered = (ln) => covered.some(([s, en]) => ln >= s && ln <= en);
  const out = [];

  if (e === '.py' || e === '.pyw') {
    for (let i = 0; i < lines.length; i++) {
      const ln = i + 1;
      if (isCovered(ln)) continue;
      const line = lines[i];
      const m = line.match(/^([A-Z][A-Z0-9_]+|__all__|__version__)\s*(?::\s*[^=\n]+)?=\s*(?!=)/);
      if (!m) continue;
      const endIdx = findStatementEndLine(lines, i, 'py');
      const endLine = endIdx + 1;
      covered.push([ln, endLine]);
      const full = lines.slice(i, endLine).join('\n');
      const lineCount = endLine - ln + 1;
      const skeleton = lineCount <= 8 ? full : line + '\n    # ... ' + (lineCount - 1) + ' lines folded';
      out.push({ name: m[1], kind: 'const', exported: !m[1].startsWith('_') || m[1] === '__all__', startLine: ln, endLine, full, skeleton });
      i = endIdx;
    }
    return out;
  }

  if (e === '.go') {
    for (let i = 0; i < lines.length; i++) {
      const ln = i + 1;
      if (isCovered(ln)) continue;
      const line = lines[i];
      const gm = line.match(/^(const|var)\s*\(/);
      if (gm) {
        const endIdx = findStatementEndLine(lines, i, 'go');
        const endLine = endIdx + 1;
        covered.push([ln, endLine]);
        const names = [];
        for (let j = i + 1; j <= endIdx; j++) {
          const im = lines[j].match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\b/);
          if (im && im[1] !== '_' && im[1] !== 'iota') names.push(im[1]);
        }
        const name = names.length > 0 ? names.slice(0, 4).join(', ') : gm[1] + '_block';
        const full = lines.slice(i, endLine).join('\n');
        const lineCount = endLine - ln + 1;
        const skeleton = lineCount <= 12 ? full : line + '\n\t// ... ' + (lineCount - 2) + ' lines folded\n)';
        out.push({ name, kind: 'const', exported: names.some((n) => /^[A-Z]/.test(n)), startLine: ln, endLine, full, skeleton });
        i = endIdx;
        continue;
      }
      const sm = line.match(/^(const|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
      if (sm) {
        const endIdx = findStatementEndLine(lines, i, 'go');
        const endLine = endIdx + 1;
        covered.push([ln, endLine]);
        const full = lines.slice(i, endLine).join('\n');
        const lineCount = endLine - ln + 1;
        const skeleton = lineCount <= 8 ? full : line + '\n\t// ... ' + (lineCount - 1) + ' lines folded';
        out.push({ name: sm[2], kind: 'const', exported: /^[A-Z]/.test(sm[2]), startLine: ln, endLine, full, skeleton });
        i = endIdx;
      }
    }
    return out;
  }

  if (e === '.rs') {
    for (let i = 0; i < lines.length; i++) {
      const ln = i + 1;
      if (isCovered(ln)) continue;
      const line = lines[i];
      const rm = line.match(/^(?:pub(?:\([^)]+\))?\s+)?(?:const|static)\s+([A-Z][A-Z0-9_]*)\b/);
      if (!rm) continue;
      const endIdx = findStatementEndLine(lines, i, 'rs');
      const endLine = endIdx + 1;
      covered.push([ln, endLine]);
      const full = lines.slice(i, endLine).join('\n');
      const lineCount = endLine - ln + 1;
      const skeleton = lineCount <= 8 ? full : line + '\n  /* ... ' + (lineCount - 1) + ' lines folded */';
      out.push({ name: rm[1], kind: 'const', exported: line.startsWith('pub'), startLine: ln, endLine, full, skeleton });
      i = endIdx;
    }
    return out;
  }

  if (['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'].includes(e)) {
    for (let i = 0; i < lines.length; i++) {
      const ln = i + 1;
      if (isCovered(ln)) continue;
      const line = lines[i];
      let name = null;
      let exported = false;
      const cm = line.match(/^(export\s+)?(?:declare\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/);
      if (cm) {
        exported = Boolean(cm[1]);
        if (exported || /^[A-Z][A-Z0-9_]+$/.test(cm[2])) name = cm[2];
      } else {
        const tm = line.match(/^(?:export\s+(default)\s+(?!(?:async\s+)?(?:function|class|abstract\s+class|interface)\b)|(module\.exports)\s*=)/);
        if (tm) { name = tm[1] ? 'default' : 'module.exports'; exported = true; }
      }
      if (!name) continue;
      const endIdx = findStatementEndLine(lines, i, 'ts');
      const endLine = endIdx + 1;
      const full = lines.slice(i, endLine).join('\n');
      if (full.includes('=>') && !name.startsWith('default')) continue;
      covered.push([ln, endLine]);
      const lineCount = endLine - ln + 1;
      const skeleton = lineCount <= 10 ? full : line + '\n  /* ... ' + (lineCount - 1) + ' lines folded */';
      out.push({ name, kind: 'const', exported, startLine: ln, endLine, full, skeleton });
      i = endIdx;
    }
  }
  return out;
}

function extractFileFooter(content, tailLines = 20) {
  if (!content) return null;
  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  let lastNonEmpty = lines.length - 1;
  while (lastNonEmpty >= 0 && lines[lastNonEmpty].trim() === '') lastNonEmpty--;
  if (lastNonEmpty < 0) return null;
  const windowStart = Math.max(0, lastNonEmpty - tailLines + 1);
  const stripFooterNoise = (line) =>
    line.replace(/(['"\x60])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$|#.*$/g, '');
  const findTailStmtEnd = (startIdx) => {
    let paren = 0, bracket = 0, brace = 0;
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
  const chunks = [];
  let i = windowStart;
  while (i <= lastNonEmpty) {
    const raw = lines[i];
    if (!raw || /^\s/.test(raw)) { i++; continue; }
    const trimmed = raw.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || !footerStartRe.test(raw)) {
      i++; continue;
    }
    const endIdx = findTailStmtEnd(i);
    chunks.push({ startLine: i + 1, endLine: endIdx + 1, text: lines.slice(i, endIdx + 1).join('\n') });
    i = endIdx + 1;
  }
  if (chunks.length === 0) return null;
  return {
    footer: chunks.map((c) => c.text).join('\n'),
    startLine: chunks[0].startLine,
    endLine: chunks[chunks.length - 1].endLine,
    chunks
  };
}
`;

const SHARED_SLICER_HELPERS_SOURCE = String.raw`
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
  'fix', 'modify', 'want', 'need', 'tell'
]);
const ZH_CONVERSATIONAL_STOPWORDS_RE = /為什麼|为什么|怎麼樣|怎么样|怎麼|怎么|如何|請幫我|请帮我|幫我|帮我|請問|请问|修改|更改|調整|调整|一下|什麼|什么|這個|这个|那個|那个|哪裡|哪里|[的了嗎呢啊吧著着過把被給跟與及]/g;

function estimateTokens(str) {
  if (!str) return 0;
  let cjk = 0;
  for (let i = 0; i < str.length; i++) if (str.charCodeAt(i) >= 128) cjk++;
  return Math.max(1, Math.round((str.length - cjk) / 2.1 + cjk * 1.6));
}

function escapeXmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mergeLineRanges(ranges) {
  if (!ranges || ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const r of sorted) {
    const s = Math.max(1, r[0]);
    const e = Math.max(s, r[1]);
    if (merged.length === 0) {
      merged.push([s, e]);
    } else {
      const prev = merged[merged.length - 1];
      if (s <= prev[1] + 1) prev[1] = Math.max(prev[1], e);
      else merged.push([s, e]);
    }
  }
  return merged;
}

function formatShownLines(ranges) {
  const merged = mergeLineRanges(ranges);
  if (merged.length === 0) return 'none';
  return merged.map((r) => (r[0] === r[1] ? String(r[0]) : r[0] + '-' + r[1])).join(', ');
}

function slicePlainTextConfigWindow(content, queryTerms) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  if (lines.length <= 200) return null;

  const matchedLines = [];
  if (queryTerms && queryTerms.length > 0) {
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (queryTerms.some((t) => lower.includes(t))) {
        matchedLines.push(i + 1);
      }
    }
  }

  const rawRanges = matchedLines.length > 0
    ? matchedLines.map((ln) => [Math.max(1, ln - 40), Math.min(lines.length, ln + 40)])
    : [[1, Math.min(lines.length, 81)]];

  const merged = mergeLineRanges(rawRanges);
  const parts = [];
  for (let idx = 0; idx < merged.length; idx++) {
    const s = merged[idx][0];
    const e = merged[idx][1];
    if (idx > 0) {
      const prevEnd = merged[idx - 1][1];
      parts.push('// ... lines ' + (prevEnd + 1) + '-' + (s - 1) + ' omitted ...');
    }
    parts.push(lines.slice(s - 1, e).join('\n'));
  }

  const windowedCode = parts.join('\n');
  return {
    windowedCode,
    ranges: merged,
    tokens: estimateTokens(windowedCode)
  };
}

function buildRepositoryFileTree(fileEntries, maxTokens = 1800) {
  const sorted = [...fileEntries].sort((a, b) => a.relPath.localeCompare(b.relPath));
  const out = [];
  let usedTokens = 0;
  let omittedCount = 0;
  for (const f of sorted) {
    const line = '    ' + f.relPath + ' (' + f.lineCount + ' lines)';
    const tk = estimateTokens(line);
    if (usedTokens + tk > maxTokens && out.length > 0) {
      omittedCount++;
      continue;
    }
    usedTokens += tk;
    out.push(line);
  }
  if (omittedCount > 0) {
    out.push('    ... (' + omittedCount + ' more files omitted to keep overview within ~1.8K tokens)');
  }
  return out;
}
const DOC_EXT_RE = /\.(md|mdx|rst|adoc|asciidoc)$/i;
const DOC_PATH_RE = /(^|\/)(docs?|documentation|wiki|guides?)\/|(^|\/)(README|CHANGELOG|HISTORY|CONTRIBUTING|CHANGES|RELEASES|MIGRATION|UPGRADING|AUTHORS|NOTICE|LICENSE)([^/]*)$/i;
const TEST_PATH_RE = /(^|\/)(tests?|__tests__|spec|specs|testing|fixtures?|benchmarks?|examples?|samples?)\/|(\.|_)(test|spec)\.[^/]+$|(^|\/)test_[^/]+\.[^/]+$/i;
const SYNTAX_NOISE_WORDS = new Set([
  'class', 'def', 'function', 'func', 'fn', 'struct', 'interface', 'type', 'enum',
  'const', 'let', 'var', 'async', 'await', 'import', 'export', 'return',
  'public', 'private', 'protected', 'static'
]);

function classifyFileRole(filePath) {
  const norm = String(filePath || '').replace(/\\/g, '/');
  if (DOC_EXT_RE.test(norm) || DOC_PATH_RE.test(norm)) return 'doc';
  if (TEST_PATH_RE.test(norm)) return 'test';
  return 'source';
}

function getQueryRoleIntents(query) {
  const q = String(query || '').toLowerCase();
  return {
    wantsDocs: /\b(readme|changelog|docs|documentation|markdown|guide)\b|\.md\b|文件|說明/.test(q),
    wantsTests: /\b(tests?|specs?|pytest|unittest|jest|vitest)\b|測試/.test(q)
  };
}

function sliceDocWindow(content, queryTerms, radius = 16, maxTokens = 480) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  if (lines.length <= 45) {
    return {
      windowedCode: content,
      ranges: [[1, Math.max(1, lines.length)]],
      tokens: estimateTokens(content)
    };
  }
  const matchedLines = [];
  if (queryTerms && queryTerms.length > 0) {
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (queryTerms.some((t) => lower.includes(t))) {
        matchedLines.push(i + 1);
        if (matchedLines.length >= 3) break;
      }
    }
  }
  const rawRanges = matchedLines.length > 0
    ? matchedLines.slice(0, 2).map((ln) => [Math.max(1, ln - radius), Math.min(lines.length, ln + radius)])
    : [[1, Math.min(lines.length, 24)]];
  const merged = mergeLineRanges(rawRanges);
  const parts = [];
  const usedRanges = [];
  let accTokens = 0;
  for (let idx = 0; idx < merged.length; idx++) {
    const s = merged[idx][0];
    const e = merged[idx][1];
    const sliceLines = [];
    let endWritten = s - 1;
    for (let ln = s; ln <= e; ln++) {
      const candidate = lines[ln - 1];
      const tk = estimateTokens(candidate);
      if (accTokens + tk > maxTokens && sliceLines.length > 0) break;
      sliceLines.push(candidate);
      accTokens += tk;
      endWritten = ln;
    }
    if (sliceLines.length === 0) break;
    if (idx > 0 && usedRanges.length > 0) {
      const prevEnd = usedRanges[usedRanges.length - 1][1];
      if (s > prevEnd + 1) parts.push('<!-- ... lines ' + (prevEnd + 1) + '-' + (s - 1) + ' omitted ... -->');
    }
    parts.push(sliceLines.join('\n'));
    usedRanges.push([s, endWritten]);
    if (accTokens >= maxTokens) break;
  }
  if (usedRanges.length > 0 && usedRanges[usedRanges.length - 1][1] < lines.length) {
    parts.push('<!-- ... ' + (lines.length - usedRanges[usedRanges.length - 1][1]) + ' remaining doc lines omitted ... -->');
  }
  const windowedCode = parts.join('\n');
  return {
    windowedCode,
    ranges: usedRanges.length > 0 ? usedRanges : [[1, Math.min(lines.length, 20)]],
    tokens: estimateTokens(windowedCode)
  };
}

function findPythonSignatureEndIdx(lines, startIdx) {
  let paren = 0, bracket = 0, brace = 0;
  const maxScan = Math.min(lines.length - 1, startIdx + 25);
  for (let j = startIdx; j <= maxScan; j++) {
    const raw = lines[j];
    let k = 0;
    while (k < raw.length) {
      const ch = raw[k];
      if (ch === '#') break;
      if (ch === '"' || ch === "'") {
        const quote = ch;
        k++;
        while (k < raw.length) {
          if (raw[k] === '\\') { k += 2; continue; }
          if (raw[k] === quote) { k++; break; }
          k++;
        }
        continue;
      }
      if (ch === '(') paren++;
      else if (ch === ')') paren = Math.max(0, paren - 1);
      else if (ch === '[') bracket++;
      else if (ch === ']') bracket = Math.max(0, bracket - 1);
      else if (ch === '{') brace++;
      else if (ch === '}') brace = Math.max(0, brace - 1);
      k++;
    }
    const noComment = raw.replace(/#.*$/, '').trimEnd();
    if (paren <= 0 && bracket <= 0 && brace <= 0 && noComment.endsWith(':')) return j;
  }
  return startIdx;
}

function findPythonBlockEndIdx(lines, sigEndIdx, baseIndent) {
  let end = sigEndIdx;
  let inTriple = null;
  for (let j = sigEndIdx + 1; j < lines.length; j++) {
    const raw = lines[j];
    const trimmed = raw.trim();
    if (inTriple) {
      end = j;
      if ((raw.split(inTriple).length - 1) % 2 === 1) inTriple = null;
      continue;
    }
    if (trimmed === '') { end = j; continue; }
    const indent = (raw.match(/^\s*/) || [''])[0].length;
    if (indent <= baseIndent) break;
    end = j;
    const tm = trimmed.match(/^("""|''')/);
    if (tm && (trimmed.split(tm[1]).length - 1) % 2 === 1) inTriple = tm[1];
  }
  while (end > sigEndIdx && lines[end].trim() === '') end--;
  return end;
}

function buildPythonClassSkeleton(fullClassCode, classStartLine = 1, expandedMethodRanges = []) {
  const lines = String(fullClassCode || '').split('\n');
  if (lines.length <= 4) return fullClassCode;
  let classDefRel = 0;
  while (classDefRel < lines.length && lines[classDefRel].trimStart().startsWith('@')) classDefRel++;
  if (classDefRel >= lines.length) return fullClassCode;

  const classIndent = (lines[classDefRel].match(/^\s*/) || [''])[0].length;
  const classSigEndRel = findPythonSignatureEndIdx(lines, classDefRel);
  const out = [];
  for (let i = 0; i <= classSigEndRel; i++) out.push(lines[i]);

  let bodyIdx = classSigEndRel + 1;
  while (bodyIdx < lines.length && lines[bodyIdx].trim() === '') bodyIdx++;
  if (bodyIdx < lines.length) {
    const t = lines[bodyIdx].trim();
    if (t.startsWith('"""') || t.startsWith("'''")) {
      const q = t.slice(0, 3);
      if (t.length > 3 && t.slice(3).includes(q)) {
        out.push(lines[bodyIdx]);
        bodyIdx++;
      } else {
        let docEnd = bodyIdx;
        for (let j = bodyIdx + 1; j < lines.length; j++) {
          if (lines[j].includes(q)) { docEnd = j; break; }
        }
        if (docEnd - bodyIdx <= 4) {
          for (let j = bodyIdx; j <= docEnd; j++) out.push(lines[j]);
        } else {
          out.push(lines[bodyIdx]);
          out.push(lines[bodyIdx + 1]);
          const indentStr = (lines[bodyIdx].match(/^\s*/) || ['    '])[0];
          out.push(indentStr + '... (' + (docEnd - bodyIdx - 1) + ' docstring lines folded)');
          out.push(lines[docEnd]);
        }
        bodyIdx = docEnd + 1;
      }
    }
  }

  let methodIndent = null;
  let memberCount = 0;
  for (let i = bodyIdx; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = (raw.match(/^\s*/) || [''])[0].length;
    if (indent <= classIndent) continue;

    if (trimmed.startsWith('@') && (methodIndent === null || indent === methodIndent)) {
      let k = i + 1;
      while (k < lines.length && lines[k].trimStart().startsWith('@')) k++;
      if (k < lines.length && /^(?:async\s+)?def\s+/.test(lines[k].trim())) {
        if (methodIndent === null) methodIndent = indent;
        for (let d = i; d < k; d++) out.push(lines[d]);
        i = k - 1;
        continue;
      }
    }

    const dm = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (dm && (methodIndent === null || indent === methodIndent)) {
      methodIndent = indent;
      memberCount++;
      const mSigEnd = findPythonSignatureEndIdx(lines, i);
      const mEnd = findPythonBlockEndIdx(lines, mSigEnd, indent);
      const absStart = classStartLine + i;
      const absEnd = classStartLine + mEnd;
      const hit = expandedMethodRanges.find((r) => r.startLine <= absEnd && r.endLine >= absStart);
      for (let s = i; s <= mSigEnd; s++) {
        if (s === mSigEnd) {
          const folded = Math.max(1, mEnd - mSigEnd);
          const note = hit
            ? ' # [expanded in <focal symbol="' + hit.name + '"> below]'
            : ' # ... ' + folded + ' lines folded';
          out.push(lines[s] + note);
        } else {
          out.push(lines[s]);
        }
      }
      i = mEnd;
      continue;
    }

    if (methodIndent === null || indent <= methodIndent) {
      if (/^[A-Za-z_][A-Za-z0-9_]*\s*(?::[^=]+)?(?:=.*)?$/.test(trimmed)) {
        out.push(raw);
        memberCount++;
      }
    }
  }

  if (memberCount === 0) {
    return lines.length > 4
      ? lines.slice(0, classSigEndRel + 1).join('\n') + '\n    # ... ' + (lines.length - classSigEndRel - 1) + ' lines folded'
      : fullClassCode;
  }
  return out.join('\n');
}

function extractPythonBlocks(lines, lineIdx) {
  const line = lines[lineIdx];
  const m = line.match(/^(async\s+def|def|class)\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (!m) return null;

  const kind = m[1] === 'class' ? 'class' : 'function';
  const name = m[2];
  let startIdx = lineIdx;
  while (startIdx > 0 && /^@[A-Za-z_]/.test(lines[startIdx - 1])) startIdx--;
  const startLine = startIdx + 1;
  const sigEndIdx = findPythonSignatureEndIdx(lines, lineIdx);
  const endIdx = findPythonBlockEndIdx(lines, sigEndIdx, 0);
  const endLine = endIdx + 1;
  const full = lines.slice(startIdx, endIdx + 1).join('\n');
  const results = [];

  if (kind === 'class') {
    results.push({
      name,
      kind: 'class',
      exported: !name.startsWith('_'),
      startLine,
      endLine,
      full,
      skeleton: buildPythonClassSkeleton(full, startLine)
    });
    let methodIndent = null;
    for (let mIdx = sigEndIdx + 1; mIdx <= endIdx; mIdx++) {
      const mLine = lines[mIdx];
      const mTrimmed = mLine.trim();
      if (!mTrimmed || mTrimmed.startsWith('#')) continue;
      const indent = (mLine.match(/^\s*/) || [''])[0].length;
      if (indent <= 0) continue;
      const dm = mTrimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (!dm) continue;
      if (methodIndent === null) methodIndent = indent;
      if (indent !== methodIndent) continue;
      const methodName = dm[1];
      let mStartIdx = mIdx;
      while (
        mStartIdx > sigEndIdx + 1 &&
        lines[mStartIdx - 1].trimStart().startsWith('@') &&
        (lines[mStartIdx - 1].match(/^\s*/) || [''])[0].length === indent
      ) {
        mStartIdx--;
      }
      const mSigEnd = findPythonSignatureEndIdx(lines, mIdx);
      const mEnd = findPythonBlockEndIdx(lines, mSigEnd, indent);
      const mFull = lines.slice(mStartIdx, mEnd + 1).join('\n');
      const mFolded = Math.max(1, mEnd - mSigEnd);
      const indentStr = (mLine.match(/^\s*/) || ['    '])[0];
      const mSigLines = lines.slice(mStartIdx, mSigEnd + 1).join('\n');
      const mSkel = mEnd - mSigEnd > 2 ? mSigLines + '\n' + indentStr + '    # ... ' + mFolded + ' lines folded' : mFull;
      results.push({
        name: name + '.' + methodName,
        kind: 'method',
        exported: !name.startsWith('_') && !methodName.startsWith('_'),
        startLine: mStartIdx + 1,
        endLine: mEnd + 1,
        full: mFull,
        skeleton: mSkel
      });
      mIdx = mEnd;
    }
  } else {
    const sigLines = lines.slice(startIdx, sigEndIdx + 1).join('\n');
    const skeleton = endIdx - sigEndIdx > 2 ? sigLines + '\n    # ... ' + (endIdx - sigEndIdx) + ' lines folded' : full;
    results.push({
      name,
      kind: 'function',
      exported: !name.startsWith('_'),
      startLine,
      endLine,
      full,
      skeleton
    });
  }
  return { blocks: results, endIdx };
}

function extractTsClassMembers(lines, classStartIdx, classEndIdx, exported, maskFn, findBraceEndFn, findStmtEndFn) {
  const members = [];
  const classSlice = lines.slice(classStartIdx, classEndIdx + 1).join('\n');
  const maskedClassLines = maskFn(classSlice).split('\n');
  let depth = 0;
  let opened = false;
  let relIdx = 0;

  while (relIdx < maskedClassLines.length) {
    const absIdx = classStartIdx + relIdx;
    const rawLine = lines[absIdx] || '';
    const trimmed = rawLine.trim();
    const mLine = maskedClassLines[relIdx] || '';

    if (depth === 1 && trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*') && absIdx < classEndIdx) {
      // 1) Standard class method: 'async text(...) { ... }'
      const methodMatch = rawLine.match(/^\s{1,8}(?:(?:public|private|protected|async|static|override|abstract|get|set)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:<[^>]*>)?\s*\(/);
      if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(methodMatch[1])) {
        const mName = methodMatch[1];
        let braceRelLine = relIdx;
        while (braceRelLine < maskedClassLines.length && braceRelLine - relIdx < 8 && !maskedClassLines[braceRelLine].includes('{')) {
          braceRelLine++;
        }
        if (braceRelLine < maskedClassLines.length && maskedClassLines[braceRelLine].includes('{')) {
          const mEnd = Math.min(classEndIdx - 1, findBraceEndFn(lines, absIdx));
          if (mEnd >= absIdx + 1 && mEnd < classEndIdx) {
            const mFull = lines.slice(absIdx, mEnd + 1).join('\n');
            const sigIdx = mFull.indexOf('{');
            const mSkel = (sigIdx === -1 || mEnd - absIdx < 3)
              ? mFull
              : mFull.slice(0, sigIdx).trim() + ' { /* ... ' + (mEnd - absIdx - 1) + ' lines folded */ }';
            members.push({
              name: mName,
              kind: 'method',
              exported,
              startLine: absIdx + 1,
              endLine: mEnd + 1,
              full: mFull,
              skeleton: mSkel
            });
            // Advance depth tracking past method lines cleanly
            for (let k = relIdx; k <= mEnd - classStartIdx && k < maskedClassLines.length; k++) {
              for (const ch of maskedClassLines[k]) {
                if (ch === '{') { depth++; opened = true; }
                else if (ch === '}') depth--;
              }
            }
            relIdx = (mEnd - classStartIdx) + 1;
            continue;
          }
        }
      }

      // 2) Class field arrow function / function expression: 'text: TextRespond = (...) => { ... }'
      const fieldMatch = rawLine.match(/^\s{1,8}(?:(?:public|private|protected|readonly|static|override|abstract|declare|async)\s+)*([A-Za-z_$#][A-Za-z0-9_$]*)\s*[?!]?\s*(?::[^=]*)?(?:=|$)/);
      if (fieldMatch && !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(fieldMatch[1])) {
        const fName = fieldMatch[1].replace(/^#/, '');
        const lookSlice = maskedClassLines.slice(relIdx, Math.min(maskedClassLines.length, relIdx + 8)).join('\n');
        const eqIdx = lookSlice.indexOf('=');
        if (eqIdx !== -1) {
          const afterEq = lookSlice.slice(eqIdx + 1);
          const arrowRel = afterEq.indexOf('=>');
          const fnMatch = afterEq.match(/\bfunction\b/);
          const fnRel = fnMatch && fnMatch.index !== undefined ? fnMatch.index : -1;
          const fnPosInLook = (arrowRel !== -1 && (fnRel === -1 || arrowRel < fnRel))
            ? eqIdx + 1 + arrowRel
            : (fnRel !== -1 ? eqIdx + 1 + fnRel : -1);
          if (fnPosInLook !== -1) {
            const lineOffsetToFn = lookSlice.slice(0, fnPosInLook).split('\n').length - 1;
            const fnLineAbs = absIdx + lineOffsetToFn;
            let bodyBraceLineAbs = -1;
            for (let scan = fnLineAbs; scan <= Math.min(classEndIdx - 1, fnLineAbs + 5); scan++) {
              const sMask = maskedClassLines[scan - classStartIdx] || '';
              if (sMask.includes('{')) { bodyBraceLineAbs = scan; break; }
              if (sMask.trim().endsWith(';')) break;
            }
            const mEnd = bodyBraceLineAbs !== -1
              ? Math.min(classEndIdx - 1, findBraceEndFn(lines, bodyBraceLineAbs))
              : Math.min(classEndIdx - 1, findStmtEndFn(lines, absIdx, 'ts'));
            if (mEnd >= absIdx && mEnd < classEndIdx) {
              const mFull = lines.slice(absIdx, mEnd + 1).join('\n');
              let mSkel = mFull;
              if (bodyBraceLineAbs !== -1 && mEnd - absIdx >= 3) {
                const preBodyLines = lines.slice(absIdx, bodyBraceLineAbs + 1);
                const lastPre = preBodyLines[preBodyLines.length - 1];
                const lastMask = maskedClassLines[bodyBraceLineAbs - classStartIdx] || '';
                const bCol = lastMask.indexOf('{');
                if (bCol !== -1) {
                  preBodyLines[preBodyLines.length - 1] = lastPre.slice(0, bCol);
                  const sigText = preBodyLines.join('\n').trim();
                  const folded = Math.max(1, mEnd - bodyBraceLineAbs - 1);
                  mSkel = sigText + ' { /* ... ' + folded + ' lines folded */ }';
                }
              }
              members.push({
                name: fName,
                kind: 'method',
                exported,
                startLine: absIdx + 1,
                endLine: mEnd + 1,
                full: mFull,
                skeleton: mSkel
              });
              for (let k = relIdx; k <= mEnd - classStartIdx && k < maskedClassLines.length; k++) {
                for (const ch of maskedClassLines[k]) {
                  if (ch === '{') { depth++; opened = true; }
                  else if (ch === '}') depth--;
                }
              }
              relIdx = (mEnd - classStartIdx) + 1;
              continue;
            }
          }
        }
      }
    }

    for (const ch of mLine) {
      if (ch === '{') { depth++; opened = true; }
      else if (ch === '}') depth--;
    }
    if (opened && depth <= 0) break;
    relIdx++;
  }
  return members;
}

function assembleContextSliceXml(opts) {
  const {
    blocks,
    fileEntries,
    fileLineCounts,
    fileHeaders,
    fileFooters,
    rawQuery,
    terms,
    budget,
    maxHops,
    autoExpand,
    rootAttr,
    version,
    subPathTag,
    includeParserAttr,
    controlWords,
    maskFn
  } = opts;

  if (!String(rawQuery || '').trim()) {
    const treeLines = buildRepositoryFileTree(fileEntries, 1800);
    return [
      '<context_slice mode="file_tree_empty_query" root="' + escapeXmlAttr(rootAttr) + '" version="' + version + '"' + (subPathTag || '') + ' total_files="' + fileEntries.length + '">',
      '  <note>Empty query received. Returning repository file tree overview; call context_slice again with specific symbol or file keywords to retrieve code.</note>',
      '  <repository_file_tree>',
      ...treeLines,
      '  </repository_file_tree>',
      '</context_slice>'
    ].join('\n');
  }

  const roleIntents = getQueryRoleIntents(rawQuery);
  const configWindowByKey = new Map();
  const preparedBlocks = blocks.map((b) => {
    const rel = b.filePath;
    const key = rel + ':' + b.startLine;
    const lineCount = Math.max(1, b.endLine - b.startLine + 1);
    const isConfigFile = PLAIN_TEXT_CONFIG_EXT_RE.test(rel);
    const isDocExt = DOC_EXT_RE.test(rel);
    let win = null;
    if (b.kind === 'module') {
      if (isConfigFile && lineCount > 200) {
        win = slicePlainTextConfigWindow(b.full, terms);
      } else if (isDocExt && lineCount > 45) {
        win = sliceDocWindow(b.full, terms, 16, 480);
      }
    }
    if (win) configWindowByKey.set(key, win);
    const rawTk = win ? win.tokens : (b.rawTk !== undefined ? b.rawTk : estimateTokens(b.full));
    const skelTk = isDocExt
      ? Math.min(b.skelTk !== undefined ? b.skelTk : estimateTokens(b.skeleton), win ? win.tokens : 480)
      : (b.skelTk !== undefined ? b.skelTk : estimateTokens(b.skeleton));
    return {
      ...b,
      filePath: rel,
      lineCount,
      role: classifyFileRole(rel),
      isDocExt,
      rawTk,
      skelTk
    };
  });

  const totalBlocks = Math.max(1, preparedBlocks.length);
  const termDF = {};
  for (const t of terms) {
    let df = 0;
    for (const b of preparedBlocks) {
      if (b.name.toLowerCase().includes(t) || b.filePath.toLowerCase().includes(t) || b.full.toLowerCase().includes(t)) {
        df++;
      }
    }
    termDF[t] = Math.max(1, df);
  }

  const scored = preparedBlocks.map((b) => {
    const nameLower = b.name.toLowerCase();
    const shortLower = nameLower.includes('.') ? nameLower.split('.').pop() : nameLower;
    const relLower = b.filePath.toLowerCase();
    const lowerBody = b.full.toLowerCase();
    let score = 0;
    let matchedTerms = 0;

    for (const t of terms) {
      const df = termDF[t] || 1;
      const idf = Math.log(1 + (totalBlocks / df));
      const scarcity = (df / totalBlocks > 0.3) ? 0.35 : (df / totalBlocks > 0.15) ? 0.7 : 1.25;
      let termScore = 0;
      let hit = false;
      if (nameLower === t || shortLower === t) { termScore += 48; hit = true; }
      else if (nameLower.includes(t)) { termScore += 24; hit = true; }
      if (relLower.includes(t)) { termScore += 12; hit = true; }
      const bodyOcc = lowerBody.split(t).length - 1;
      if (bodyOcc > 0) { termScore += Math.min(12, 3 * Math.log1p(bodyOcc)); hit = true; }
      if (hit) matchedTerms++;
      score += termScore * idf * scarcity;
    }

    if (matchedTerms >= 2) {
      score *= 1 + 0.35 * (matchedTerms - 1);
    }
    if (score > 0 && (b.kind === 'function' || b.kind === 'method')) score *= 1.18;
    else if (score > 0 && (b.kind === 'class' || b.kind === 'interface' || b.kind === 'type' || b.kind === 'struct')) score *= 1.08;

    if (score > 0) {
      if (b.role === 'doc' && !roleIntents.wantsDocs) score *= 0.10;
      else if (b.role === 'test' && !roleIntents.wantsTests) score *= 0.20;
      else if (b.role === 'source') score *= 1.25;
    }

    return { ...b, score, matchedTerms };
  }).sort((a, b) => b.score - a.score);

  // Build Call Graph with shortName + common dunder guard + parent/method loop avoidance
  const symbolMap = new Map();
  const constSymbolNames = new Set();
  for (let i = 0; i < scored.length; i++) {
    const b = scored[i];
    if (b.name && b.kind !== 'module' && !controlWords.has(b.name)) {
      const rawShort = b.name.includes('.') ? b.name.split('.').pop() : b.name;
      const names = (b.kind === 'const' && rawShort.includes(','))
        ? rawShort.split(',').map((s) => s.trim()).filter(Boolean)
        : [rawShort];
      for (const sn of names) {
        if (!sn || /^__.*__$/.test(sn)) continue;
        if (!symbolMap.has(sn)) symbolMap.set(sn, []);
        symbolMap.get(sn).push(i);
        if (b.kind === 'const') constSymbolNames.add(sn);
      }
    }
  }

  const isChildMethodOf = (child, parent) =>
    child.filePath === parent.filePath &&
    child.kind === 'method' &&
    (child.name.startsWith(parent.name + '.') ||
      (child.startLine > parent.startLine && child.endLine <= parent.endLine));

  const callAdj = Array.from({ length: scored.length }, () => new Set());
  const definedNames = Array.from(symbolMap.keys());
  for (let i = 0; i < scored.length; i++) {
    const caller = scored[i];
    const maskedCaller = maskFn(caller.full);
    for (const sym of definedNames) {
      const callerShort = caller.name.includes('.') ? caller.name.split('.').pop() : caller.name;
      if (sym === caller.name || sym === callerShort) continue;
      if (maskedCaller.includes(sym)) {
        const esc = sym.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&');
        const isConstRef = constSymbolNames.has(sym) && sym.length >= 3;
        const re = isConstRef ? new RegExp('\\b' + esc + '\\b', 'm') : new RegExp('\\b' + esc + '\\s*\\(', 'm');
        if (re.test(maskedCaller)) {
          for (const t of (symbolMap.get(sym) || [])) {
            const target = scored[t];
            if (isChildMethodOf(target, caller) || isChildMethodOf(caller, target)) continue;
            callAdj[i].add(t);
            callAdj[t].add(i);
          }
        }
      }
    }
  }

  // Focal selection: strictly prefer source matches over docs/tests + class/method smart deduplication
  const hasSourceMatches = scored.some((b) => b.role === 'source' && b.score > 0);
  const eligibleIndices = [];
  for (let i = 0; i < scored.length; i++) {
    if (scored[i].score <= 0) continue;
    if (hasSourceMatches && scored[i].role !== 'source') continue;
    eligibleIndices.push(i);
  }
  const focalSet = new Set();
  const promotedParentClassSet = new Set();
  if (eligibleIndices.length > 0) {
    const topScore = scored[eligibleIndices[0]].score;
    const candidateIdx = eligibleIndices
      .filter((idx, rank) => (rank < 3 && scored[idx].score >= topScore * 0.3) || scored[idx].score >= topScore * 0.55)
      .slice(0, 5);
    const candidateChosen = new Set();
    for (const idx of candidateIdx) {
      const b = scored[idx];
      if (b.kind === 'class' && b.lineCount > 35) {
        const childIndices = [];
        for (let ci = 0; ci < scored.length; ci++) {
          const c = scored[ci];
          if (isChildMethodOf(c, b)) {
            const cShort = c.name.split('.').pop().toLowerCase();
            const explicitHit = terms.some((t) => cShort === t || cShort.includes(t));
            if (explicitHit || c.score >= b.score * 0.55) {
              childIndices.push(ci);
            }
          }
        }
        if (childIndices.length > 0) {
          promotedParentClassSet.add(idx);
          for (const ci of childIndices.slice(0, 4)) candidateChosen.add(ci);
          continue;
        }
      }
      candidateChosen.add(idx);
    }
    for (const idx of candidateChosen) {
      const b = scored[idx];
      if (b.kind === 'method') {
        const hasFullParent = [...candidateChosen].some((pIdx) => {
          const p = scored[pIdx];
          return Boolean(p && p.kind === 'class' && isChildMethodOf(b, p));
        });
        if (hasFullParent) continue;
      }
      focalSet.add(idx);
    }
  }

  // BFS from final focalSet
  const hopDistances = new Map();
  const focalFiles = new Set();
  const bfsQ = [...focalSet];
  for (const fi of bfsQ) {
    hopDistances.set(fi, 0);
    focalFiles.add(scored[fi].filePath);
  }
  let qHead = 0;
  while (qHead < bfsQ.length) {
    const curr = bfsQ[qHead++];
    const curHop = hopDistances.get(curr) ?? 0;
    if (curHop >= maxHops) continue;
    for (const nbr of callAdj[curr]) {
      if (!hopDistances.has(nbr)) {
        hopDistances.set(nbr, curHop + 1);
        bfsQ.push(nbr);
      }
    }
  }

  const fileHeaderTokenCache = new Map();
  for (const [fp, hdr] of fileHeaders.entries()) {
    if (PLAIN_TEXT_CONFIG_EXT_RE.test(fp) || DOC_EXT_RE.test(fp)) continue;
    if (hdr && hdr.header) fileHeaderTokenCache.set(fp, estimateTokens(hdr.header) + 12);
  }

  const directCoreFiles = new Set(focalFiles);
  for (const pid of promotedParentClassSet) directCoreFiles.add(scored[pid].filePath);
  const minDirectTerms = Math.min(2, Math.max(1, terms.length));
  for (let i = 0; i < scored.length; i++) {
    const b = scored[i];
    if (b.role !== 'source') continue;
    const h = hopDistances.get(i);
    const isDirectCallable = h === 1 && (b.kind === 'function' || b.kind === 'method' || b.kind === 'class');
    if ((terms.length >= 2 && b.matchedTerms >= minDirectTerms) || isDirectCallable) {
      directCoreFiles.add(b.filePath);
    }
  }

  const isPeripheralIdx = (idx) => {
    if (focalSet.has(idx) || promotedParentClassSet.has(idx)) return false;
    const b = scored[idx];
    if (focalFiles.has(b.filePath)) return false;
    const h = hopDistances.get(idx);
    if (h !== undefined && h >= 2) return true;
    if (!directCoreFiles.has(b.filePath)) return true;
    if ((b.kind === 'interface' || b.kind === 'type' || b.kind === 'const') && b.matchedTerms <= 1 && h === undefined) {
      return true;
    }
    return false;
  };

  // Two-pass allocation ordering: ALL focal targets first, then promoted parent classes, source -> non-peripheral -> matchedTerms -> hop -> score
  const roleRank = (r) => (r === 'source' ? 0 : r === 'test' ? 1 : 2);
  const allocOrder = Array.from({ length: scored.length }, (_, i) => i).sort((a, b) => {
    const focA = focalSet.has(a) ? 0 : 1;
    const focB = focalSet.has(b) ? 0 : 1;
    if (focA !== focB) return focA - focB;
    const parA = promotedParentClassSet.has(a) ? 0 : 1;
    const parB = promotedParentClassSet.has(b) ? 0 : 1;
    if (parA !== parB) return parA - parB;
    const rrA = roleRank(scored[a].role);
    const rrB = roleRank(scored[b].role);
    if (rrA !== rrB) return rrA - rrB;
    const perA = isPeripheralIdx(a) ? 1 : 0;
    const perB = isPeripheralIdx(b) ? 1 : 0;
    if (perA !== perB) return perA - perB;
    if (scored[a].matchedTerms !== scored[b].matchedTerms) return scored[b].matchedTerms - scored[a].matchedTerms;
    const hopA = hopDistances.get(a) ?? 99;
    const hopB = hopDistances.get(b) ?? 99;
    if (hopA !== hopB) return hopA - hopB;
    return scored[b].score - scored[a].score;
  });

  let remaining = budget;
  let docBudgetUsed = 0;
  let testBudgetUsed = 0;
  let peripheralBudgetUsed = 0;
  const docBudgetCap = hasSourceMatches ? Math.min(2048, Math.floor(budget * 0.12)) : Math.min(6144, Math.floor(budget * 0.5));
  const testBudgetCap = hasSourceMatches ? Math.min(3072, Math.floor(budget * 0.2)) : Math.floor(budget * 0.65);
  const peripheralBudgetCap = budget <= 16384 ? Math.floor(budget * 0.25) : Math.floor(budget * 0.3);
  const dirBudgetUsed = {};
  const maxDirBudget = budget * 0.72;

  const includedIds = new Set();
  const includedFiles = [];
  const includedFilesSet = new Set();
  const headerChargedFiles = new Set();
  const fullStart1EndLine = new Map();
  const coveredRangesByFile = new Map();
  const partialFiles = new Set();
  const selectedByFile = new Map();
  const fullParentClassesByFile = new Map();
  const skelCandidates = [];
  const candidateItems = [];

  const getHeaderReserve = (item) => {
    if (headerChargedFiles.has(item.filePath)) return 0;
    if (item.kind === 'module' && item.startLine === 1) return 0;
    return fileHeaderTokenCache.get(item.filePath) || 0;
  };
  const addCoveredRange = (fp, s, e) => {
    if (!coveredRangesByFile.has(fp)) coveredRangesByFile.set(fp, []);
    coveredRangesByFile.get(fp).push([s, e]);
  };
  const addSelectedBlock = (fp, entry) => {
    if (!includedFilesSet.has(fp)) {
      includedFilesSet.add(fp);
      includedFiles.push(fp);
    }
    if (!selectedByFile.has(fp)) selectedByFile.set(fp, []);
    selectedByFile.get(fp).push(entry);
  };
  const canUseRoleBudget = (role, cost) => {
    if (role === 'doc') return docBudgetUsed + cost <= docBudgetCap;
    if (role === 'test') return testBudgetUsed + cost <= testBudgetCap;
    return true;
  };
  const addRoleBudget = (role, cost) => {
    if (role === 'doc') docBudgetUsed += cost;
    else if (role === 'test') testBudgetUsed += cost;
  };

  for (const idx of allocOrder) {
    const item = scored[idx];
    if (item.kind === 'method') {
      const fullClasses = fullParentClassesByFile.get(item.filePath);
      if (fullClasses && fullClasses.some((cls) => isChildMethodOf(item, cls))) continue;
    }

    const topDir = item.filePath.split('/')[0] || 'root';
    const curDir = dirBudgetUsed[topDir] || 0;
    const hop = hopDistances.get(idx);
    const isFocal = focalSet.has(idx);
    const isPromotedParent = promotedParentClassSet.has(idx);
    const peripheral = isPeripheralIdx(idx);
    const key = item.filePath + ':' + item.startLine;
    const win = configWindowByKey.get(key);
    const hdrCost = getHeaderReserve(item);

    if (isFocal && (item.rawTk <= remaining || remaining === budget) && (!hasSourceMatches || item.role !== 'doc')) {
      remaining = Math.max(0, remaining - item.rawTk);
      if (hdrCost > 0 && hdrCost <= remaining) {
        remaining -= hdrCost;
        headerChargedFiles.add(item.filePath);
      }
      dirBudgetUsed[topDir] = curDir + item.rawTk;
      addRoleBudget(item.role, item.rawTk);
      includedIds.add(key);
      if (item.kind === 'class') {
        if (!fullParentClassesByFile.has(item.filePath)) fullParentClassesByFile.set(item.filePath, []);
        fullParentClassesByFile.get(item.filePath).push(item);
      }
      if (win) {
        for (const r of win.ranges) {
          addCoveredRange(item.filePath, r[0], r[1]);
          if (r[0] === 1) fullStart1EndLine.set(item.filePath, Math.max(fullStart1EndLine.get(item.filePath) || 0, r[1]));
        }
      } else {
        addCoveredRange(item.filePath, item.startLine, item.endLine);
        if (item.startLine === 1) fullStart1EndLine.set(item.filePath, Math.max(fullStart1EndLine.get(item.filePath) || 0, item.endLine));
      }
      addSelectedBlock(item.filePath, { tier: 'full', item, win, autoExpanded: false });
    } else if (isPromotedParent && item.skelTk <= remaining) {
      remaining -= item.skelTk;
      if (hdrCost > 0 && hdrCost <= remaining) {
        remaining -= hdrCost;
        headerChargedFiles.add(item.filePath);
      }
      dirBudgetUsed[topDir] = curDir + item.skelTk;
      includedIds.add(key);
      partialFiles.add(item.filePath);
      addSelectedBlock(item.filePath, { tier: 'skeleton', item, win, hop: 1 });
    } else {
      const totalSkelCost = item.skelTk + hdrCost;
      const fitsPeripheral = !peripheral || (peripheralBudgetUsed + totalSkelCost <= peripheralBudgetCap);
      if (
        fitsPeripheral &&
        totalSkelCost <= remaining &&
        (curDir + item.skelTk <= maxDirBudget || item.role === 'source') &&
        canUseRoleBudget(item.role, item.skelTk)
      ) {
        const sameFileConst = item.kind === 'const' && (item.exported || /^[A-Z][A-Z0-9_]+$/.test(item.name)) && item.lineCount <= 25 && focalFiles.has(item.filePath);
        const linked = (hop !== undefined && hop <= maxHops) || item.score > 0 || sameFileConst;
        if (linked) {
          remaining -= totalSkelCost;
          if (hdrCost > 0) headerChargedFiles.add(item.filePath);
          if (peripheral) peripheralBudgetUsed += totalSkelCost;
          dirBudgetUsed[topDir] = curDir + totalSkelCost;
          addRoleBudget(item.role, item.skelTk);
          includedIds.add(key);
          partialFiles.add(item.filePath);
          if (item.skeleton === item.full && !win) addCoveredRange(item.filePath, item.startLine, item.endLine);
          if (autoExpand && item.role === 'source' && !isPromotedParent && !peripheral) {
            skelCandidates.push({ idx, item, win, hop: hop ?? null, key });
          } else {
            addSelectedBlock(item.filePath, { tier: 'skeleton', item, win, hop: hop ?? null });
          }
        } else {
          partialFiles.add(item.filePath);
          candidateItems.push(item);
        }
      } else {
        partialFiles.add(item.filePath);
        candidateItems.push(item);
      }
    }
  }

  const autoExpandedNames = [];
  if (autoExpand && skelCandidates.length > 0) {
    for (const cand of skelCandidates) {
      const it = cand.item;
      const delta = Math.max(0, it.rawTk - it.skelTk);
      const isComplexCluster = (cand.hop === 1 || it.matchedTerms >= minDirectTerms || it.score > 0) && (it.lineCount >= 16 || delta >= 45);
      const canExpandClass = it.kind !== 'class' || (!it.filePath.endsWith('.py') && it.lineCount <= 80);
      if (canExpandClass && isComplexCluster && autoExpandedNames.length < 4 && delta <= remaining) {
        remaining -= delta;
        autoExpandedNames.push(it.name);
        if (cand.win) {
          for (const r of cand.win.ranges) {
            addCoveredRange(it.filePath, r[0], r[1]);
            if (r[0] === 1) fullStart1EndLine.set(it.filePath, Math.max(fullStart1EndLine.get(it.filePath) || 0, r[1]));
          }
        } else {
          addCoveredRange(it.filePath, it.startLine, it.endLine);
          if (it.startLine === 1) fullStart1EndLine.set(it.filePath, Math.max(fullStart1EndLine.get(it.filePath) || 0, it.endLine));
        }
        addSelectedBlock(it.filePath, { tier: 'full', item: it, win: cand.win, autoExpanded: true });
      } else {
        addSelectedBlock(it.filePath, { tier: 'skeleton', item: it, win: cand.win, hop: cand.hop });
      }
    }
  }

  if (includedFiles.length === 0) {
    const treeLines = buildRepositoryFileTree(fileEntries, 1800);
    return [
      '<context_slice mode="file_tree_zero_matches" root="' + escapeXmlAttr(rootAttr) + '" version="' + version + '"' + (subPathTag || '') + ' query="' + escapeXmlAttr(rawQuery) + '">',
      '  <note>WARNING: 0 matches found for query "' + escapeXmlText(rawQuery) + '". Do NOT guess code from this file tree alone—pick valid file paths or symbol names from the tree below and call context_slice again.</note>',
      '  <repository_file_tree>',
      ...treeLines,
      '  </repository_file_tree>',
      '</context_slice>'
    ].join('\n');
  }

  const headerByFile = new Map();
  const headerEndByFile = new Map();
  for (const fp of includedFiles) {
    if (PLAIN_TEXT_CONFIG_EXT_RE.test(fp) || DOC_EXT_RE.test(fp)) continue;
    const entries = selectedByFile.get(fp) || [];
    const hasStart1ModuleSkel = entries.some((e) => e.tier === 'skeleton' && e.item.kind === 'module' && e.item.startLine === 1);
    if (hasStart1ModuleSkel) continue;
    const hdr = fileHeaders.get(fp);
    if (!hdr) continue;
    if ((fullStart1EndLine.get(fp) || 0) >= hdr.endLine) continue;
    headerEndByFile.set(fp, hdr.endLine);
    headerByFile.set(fp, hdr);
  }

  const footerByFile = new Map();
  for (const fp of includedFiles) {
    if (PLAIN_TEXT_CONFIG_EXT_RE.test(fp) || DOC_EXT_RE.test(fp)) continue;
    if (!directCoreFiles.has(fp)) continue;
    const ftr = fileFooters.get(fp);
    if (!ftr) continue;
    const ranges = coveredRangesByFile.get(fp) || [];
    const totalLines = fileLineCounts.get(fp) || 0;
    const wholeFileCovered = ranges.some((r) => r[0] <= 1 && r[1] >= totalLines);
    if (!partialFiles.has(fp) && wholeFileCovered) continue;
    const hdrEnd = headerEndByFile.get(fp) || 0;
    const uncovered = ftr.chunks.filter((c) => c.startLine > hdrEnd && !ranges.some((r) => c.startLine >= r[0] && c.endLine <= r[1]));
    if (uncovered.length > 0) {
      footerByFile.set(fp, {
        startLine: uncovered[0].startLine,
        endLine: uncovered[uncovered.length - 1].endLine,
        text: uncovered.map((c) => c.text).join('\n'),
        chunks: uncovered
      });
    }
  }

  const used = Math.max(0, budget - remaining);
  const expandAttr = autoExpandedNames.length > 0 ? ' autoExpanded="' + escapeXmlAttr(autoExpandedNames.join(',')) + '"' : '';
  const out = [
    '<context_slice mode="progressive-structural-slice" root="' + escapeXmlAttr(rootAttr) + '" version="' + version + '"' + (subPathTag || '') + ' budget="' + budget + '" used="' + used + '"' + expandAttr + '>'
  ];

  for (const fp of includedFiles) {
    const rawEntries = (selectedByFile.get(fp) || []).slice().sort((a, b) => a.item.startLine - b.item.startLine);
    const fullClasses = rawEntries.filter((e) => e.tier === 'full' && e.item.kind === 'class').map((e) => e.item);
    const structuralPyClasses = /\.pyw?$/i.test(fp)
      ? rawEntries.filter((e) => e.item.kind === 'class').map((e) => e.item)
      : [];
    const entries = rawEntries.filter(
      (e) =>
        !(
          e.tier === 'skeleton' &&
          e.item.kind === 'method' &&
          (fullClasses.some((cls) => isChildMethodOf(e.item, cls)) ||
            structuralPyClasses.some((cls) => isChildMethodOf(e.item, cls)))
        ),
    );
    const fullEntries = entries.filter((e) => e.tier === 'full');
    const hdr = headerByFile.get(fp);
    const ftr = footerByFile.get(fp);
    const totalLines = fileLineCounts.get(fp) || 0;
    const shownRanges = [];
    if (hdr) shownRanges.push([1, hdr.endLine]);
    for (const ent of entries) {
      if (ent.win) shownRanges.push(...ent.win.ranges);
      else shownRanges.push([ent.item.startLine, ent.item.endLine]);
    }
    if (ftr) {
      for (const c of ftr.chunks) shownRanges.push([c.startLine, c.endLine]);
    }
    out.push('  <file path="' + escapeXmlAttr(fp) + '" total_lines="' + totalLines + '" shown_lines="' + formatShownLines(shownRanges) + '">');
    if (hdr) {
      out.push('    <file_header lines="1-' + hdr.endLine + '">');
      out.push(hdr.header);
      out.push('    </file_header>');
    }
    for (const ent of entries) {
      const it = ent.item;
      if (ent.tier === 'full') {
        const linesAttr = ent.win ? formatShownLines(ent.win.ranges) : (it.startLine + '-' + it.endLine);
        const parserAttr = includeParserAttr && it.parserMode ? ' parser="' + escapeXmlAttr(it.parserMode) + '"' : '';
        const autoAttr = ent.autoExpanded ? ' autoExpanded="true"' : '';
        out.push('    <focal symbol="' + escapeXmlAttr(it.name) + '" lines="' + linesAttr + '"' + parserAttr + autoAttr + '>');
        out.push(ent.win ? ent.win.windowedCode : it.full);
        out.push('    </focal>');
      } else {
        let skelBody = ent.win ? ent.win.windowedCode : it.skeleton;
        if (!ent.win && it.kind === 'class' && /\.pyw?$/i.test(fp)) {
          const expandedChildRanges = fullEntries
            .filter((fe) => isChildMethodOf(fe.item, it))
            .map((fe) => ({ name: fe.item.name, startLine: fe.item.startLine, endLine: fe.item.endLine }));
          if (expandedChildRanges.length > 0) {
            skelBody = buildPythonClassSkeleton(it.full, it.startLine, expandedChildRanges);
          }
        }
        const hopAttr = (ent.hop !== null && ent.hop !== undefined) ? ' hop="' + ent.hop + '"' : '';
        const skelLinesAttr = ent.win ? formatShownLines(ent.win.ranges) : (it.startLine + '-' + it.endLine);
        out.push('    <skeleton symbol="' + escapeXmlAttr(it.name) + '" lines="' + skelLinesAttr + '"' + hopAttr + '>');
        out.push(skelBody);
        out.push('    </skeleton>');
      }
    }
    if (ftr) {
      out.push('    <file_footer lines="' + ftr.startLine + '-' + ftr.endLine + '">');
      out.push(ftr.text);
      out.push('    </file_footer>');
    }
    out.push('  </file>');
  }

  const omitted = candidateItems.filter((it) => it.score > 0 && !includedIds.has(it.filePath + ':' + it.startLine)).slice(0, 3);
  if (omitted.length > 0) {
    out.push('  <omitted_top_matches>');
    for (const o of omitted) {
      out.push('    <!-- Omitted: ' + o.filePath + ':' + o.startLine + ' (' + o.name + ', score: ' + o.score.toFixed(1) + ') — consider expanding -->');
    }
    out.push('  </omitted_top_matches>');
  }

  out.push('</context_slice>');
  return out.join('\n');
}
`;

const CJK_MULTILINGUAL_WORDS = {
  // Auth / Login (Traditional, Simplified, Japanese, Korean)
  "登": ["login", "auth", "verify", "signin"],
  "入": ["login", "enter", "init"],
  "登录": ["login", "signin", "auth"],
  "登入": ["login", "signin", "auth"],
  "ログイン": ["login", "signin"],
  "로그인": ["login", "signin"],
  "认证": ["auth", "verify", "authentication"],
  "認證": ["auth", "verify", "authentication"],
  "認証": ["auth", "authentication"],
  "인증": ["auth", "authentication"],
  "验证": ["verify", "validate"],
  "驗證": ["verify", "validate"],
  "検証": ["verify", "validate"],
  "검증": ["verify", "validate"],
  "權限": ["permission", "role", "authz"],
  "权限": ["permission", "role", "authz"],
  "権限": ["permission", "role"],
  "권한": ["permission", "role"],
  "令牌": ["token", "jwt"],
  "權杖": ["token", "jwt"],
  "トークン": ["token"],
  "토큰": ["token"],

  // Parse / Code / Data
  "解析": ["parse", "analyze"],
  "解": ["decode", "parse"],
  "析": ["analyze", "parse"],
  "パース": ["parse"],
  "파싱": ["parse"],
  "数据": ["data"],
  "數據": ["data"],
  "データ": ["data"],
  "데이터": ["data"],
  "結構": ["struct", "structure"],
  "结构": ["struct", "structure"],
  "構造": ["struct", "structure"],
  "구조": ["struct", "structure"],

  // API / Interface / Service
  "接口": ["api", "interface"],
  "介面": ["api", "interface"],
  "インターフェース": ["interface", "api"],
  "인터페이스": ["interface", "api"],
  "服务": ["service"],
  "服務": ["service"],
  "サービス": ["service"],
  "서비스": ["service"],
  "路由": ["router", "route"],
  "路徑": ["path", "route"],
  "路径": ["path", "route"],
  "ルート": ["route", "router"],
  "라우트": ["route", "router"],

  // Database / Cache / Storage
  "數據庫": ["database", "db"],
  "数据库": ["database", "db"],
  "データベース": ["database", "db"],
  "데이터베이스": ["database", "db"],
  "緩存": ["cache"],
  "缓存": ["cache"],
  "キャッシュ": ["cache"],
  "캐시": ["cache"],
  "存儲": ["store", "storage"],
  "存储": ["store", "storage"],
  "ストレージ": ["storage"],
  "스토리지": ["storage"],

  // Config / Setting / Env
  "配置": ["config", "configuration"],
  "設定": ["config", "setup", "setting"],
  "設定ファイル": ["config"],
  "설정": ["config", "setting"],
  "環境": ["env", "environment"],
  "环境": ["env", "environment"],
  "환경": ["env", "environment"],

  // Error / Log / Debug / Test
  "錯誤": ["error", "exception"],
  "错误": ["error", "exception"],
  "エラー": ["error"],
  "에러": ["error"],
  "異常": ["exception", "error"],
  "异常": ["exception", "error"],
  "日誌": ["log", "logger"],
  "日志": ["log", "logger"],
  "ログ": ["log"],
  "로그": ["log"],
  "調試": ["debug"],
  "调试": ["debug"],
  "デバッグ": ["debug"],
  "디버그": ["debug"],
  "測試": ["test", "spec"],
  "测试": ["test", "spec"],
  "テスト": ["test"],
  "테스트": ["test"],
};

export function generateCliScript(config: Partial<GeneratorConfig> = {}): string {
  const safeQuery = (config.query || '').replace(/"/g, '\\"');
  const budgetTokens = config.budgetTokens || 32768;
  const maxHops = config.maxHops || 2;
  return `#!/usr/bin/env node
/**
 * ctxslice.mjs — Zero-Config Multi-Language Local Structural Context Pre-Compiler (${APP_VERSION})
 * Features: Multi-Language Structural Extractors, State-Machine Brace Matcher, True Call Graph (BFS), TF-IDF, Dual-State File Tree
 */
import fs from 'node:fs';
import path from 'node:path';

${SHARED_SLICER_HELPERS_SOURCE}

const CJK_RE = /[一-鿿぀-ゟ゠-ヿ가-힯]/;
const CJK_RUN_RE = new RegExp('[一-鿿぀-ゟ゠-ヿ가-힯]+', 'g');
const CJK_WORDS = ${JSON.stringify(CJK_MULTILINGUAL_WORDS, null, 2)};
const EN_CJK = {};
for (const zh in CJK_WORDS) { for (const en of CJK_WORDS[zh]) { if (!EN_CJK[en]) EN_CJK[en] = []; EN_CJK[en].push(zh); } }
function containsCJK(s) { return CJK_RE.test(s); }
function tokenizeCJK2gram(text) {
  const runs = String(text || '').match(CJK_RUN_RE) || [];
  const out = [];
  for (const run of runs) {
    let i = 0;
    while (i < run.length) {
      if (i + 1 < run.length) { out.push(run[i] + run[i + 1]); i += 2; }
      else { out.push(run[i]); i += 1; }
    }
  }
  return out;
}
function bilingualLookup(term) {
  const out = [];
  if (CJK_WORDS[term]) out.push(...CJK_WORDS[term]);
  if (EN_CJK[term]) out.push(...EN_CJK[term]);
  return out;
}
function expandQueryTerms(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];
  const q = trimmed.toLowerCase();
  const terms = new Set();
  const asciiParts = q.match(/[a-z0-9_]+(?:[.-][a-z0-9_]+)*/g) || [];
  for (const p of asciiParts) {
    if (p.length >= 2 && !EN_CONVERSATIONAL_STOPWORDS.has(p)) {
      terms.add(p);
      if (/^v\\d/.test(p) && p.length >= 3) terms.add(p.slice(1));
      if (p.includes('.') || p.includes('-')) {
        for (const sub of p.split(/[.-]/)) {
          if (sub.length >= 2 && !EN_CONVERSATIONAL_STOPWORDS.has(sub)) terms.add(sub);
        }
      }
      for (const t of bilingualLookup(p)) terms.add(t);
    }
  }
  if (containsCJK(trimmed)) {
    const cleanedCjk = trimmed.replace(ZH_CONVERSATIONAL_STOPWORDS_RE, ' ');
    if (containsCJK(cleanedCjk)) {
      for (const gram of tokenizeCJK2gram(cleanedCjk)) {
        terms.add(gram);
        for (const t of bilingualLookup(gram)) terms.add(t);
      }
      for (const run of cleanedCjk.match(CJK_RUN_RE) || []) {
        terms.add(run);
        for (const t of bilingualLookup(run)) terms.add(t);
      }
    }
  }
  const snapshot = [...terms];
  for (const term of snapshot) {
    for (const t of bilingualLookup(term)) terms.add(t);
  }
  // Filter pure syntax keywords (class, def, function...) whenever non-syntax identifiers exist
  const collected = [...terms].filter(Boolean);
  const nonSyntax = collected.filter((t) => !SYNTAX_NOISE_WORDS.has(t));
  return nonSyntax.length > 0 ? nonSyntax : collected;
}

const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write('ctxslice ${APP_VERSION}\\n');
  process.exit(0);
}
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    'ContextSlice CLI ${APP_VERSION} — Zero-Config Multi-Language Structural Code Slicer\\n\\n' +
    'Usage:\\n  ctxslice "<query>" [--root <dir>] [--budget <tokens>]\\n\\n' +
    'Options:\\n  --root <dir>     Target repository path (default: current directory)\\n' +
    '  --budget <num>   Max token budget (default: ${budgetTokens})\\n' +
    '  -v, --version    Show version\\n' +
    '  -h, --help       Show help\\n'
  );
  process.exit(0);
}
const rootFlag = args.indexOf('--root');
const targetRoot = rootFlag !== -1 && args[rootFlag + 1] ? path.resolve(args[rootFlag + 1]) : process.cwd();
const budgetFlag = args.indexOf('--budget');
const budget = budgetFlag !== -1 ? Number(args[budgetFlag + 1]) : ${budgetTokens};
const skipIdx = new Set();
if (rootFlag !== -1) { skipIdx.add(rootFlag); skipIdx.add(rootFlag + 1); }
if (budgetFlag !== -1) { skipIdx.add(budgetFlag); skipIdx.add(budgetFlag + 1); }
const queryArg = args.find((a, idx) => !skipIdx.has(idx) && !a.startsWith('--'));
const query = queryArg !== undefined ? queryArg : '${safeQuery}';
const IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  'venv', '.venv', '__pycache__', 'vendor', 'target', '.build', '.swiftpm', 'DerivedData', 'Pods', 'bin', 'obj'
]);
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.icns', '.tif', '.tiff', '.svg',
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz', '.iso', '.dmg',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.obj', '.lib', '.wasm', '.class', '.jar', '.war', '.pyc', '.pyo',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.rtf',
  '.db', '.sqlite', '.sqlite3', '.mdb', '.psd', '.ai', '.sketch', '.fig', '.xd', '.blend'
]);
const NOISE_FILE = /(^|\\/)(package-lock\\.json|npm-shrinkwrap\\.json|yarn\\.lock|pnpm-lock\\.yaml|bun\\.lockb?|Cargo\\.lock|poetry\\.lock|Gemfile\\.lock|composer\\.lock|go\\.sum|Podfile\\.lock|packages\\.lock\\.json|\\.env(\\..*)?|\\.pem|\\.key|credentials\\.json|service-account.*\\.json|secrets\\.json)$|\\.min\\.(js|mjs|cjs|css)$|\\.map$/i;
const CONTROL_WORDS = new Set(['if', 'else', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'typeof', 'do', 'try']);

function isTextCandidate(full) {
  if (BINARY_EXT.has(path.extname(full).toLowerCase())) return false;
  if (NOISE_FILE.test(full.replace(/\\\\/g, '/'))) return false;
  return true;
}

function isBinaryBuffer(buf) {
  const len = Math.min(buf.length, 8192);
  if (len === 0) return false;
  let suspicious = 0;
  for (let i = 0; i < len; i++) {
    const b = buf[i];
    if (b === 0 || b < 9 || b === 11 || b === 12 || (b > 13 && b < 32) || b === 127) suspicious++;
  }
  return suspicious / len > 0.08;
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (isTextCandidate(full)) acc.push(full);
  }
  return acc;
}


function maskCommentsAndStrings(code) {
  return code
    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, (m) => m.replace(/[^\\n]/g, ' '))
    .replace(/\\/\\/.*$/gm, (m) => ' '.repeat(m.length))
    .replace(/#.*$/gm, (m) => ' '.repeat(m.length))
    .replace(/\`(?:\\\\[\\s\\S]|[^\`\\\\])*\`/g, (m) => m.replace(/[^\\n]/g, ' '))
    .replace(/"(?:\\\\.|[^"\\\\])*"/g, (m) => ' '.repeat(m.length))
    .replace(/'(?:\\\\.|[^'\\\\])*'/g, (m) => ' '.repeat(m.length));
}

function findBraceEnd(lines, startIdx) {
  const maskedLines = maskCommentsAndStrings(lines.slice(startIdx).join('\\n')).split('\\n');
  let depth = 0, opened = false, endRel = 0;
  for (let j = 0; j < maskedLines.length; j++) {
    const line = maskedLines[j];
    for (let k = 0; k < line.length; k++) {
      const ch = line[k];
      if (ch === '{') { depth++; opened = true; }
      else if (ch === '}') depth--;
    }
    endRel = j;
    if (opened && depth <= 0) break;
    if (!opened && line.trim().endsWith(';')) break;
  }
  return startIdx + endRel;
}

function extractBlocks(code, ext, fileName) {
  const e = (ext || '').toLowerCase();
  const lines = code.split('\\n');
  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) continue;

    let name = null;
    let kind = 'function';
    let m = null;

    if (e === '.py' || e === '.pyw') {
      const pyRes = extractPythonBlocks(lines, i);
      if (pyRes) {
        blocks.push(...pyRes.blocks);
        i = pyRes.endIdx;
        continue;
      }
    }

    if (e === '.go') {
      m = line.match(/^func\\s+(?:\\([^)]+\\)\\s+)?([A-Za-z0-9_]+)/);
      if (m) {
        name = m[1];
        kind = 'function';
        const end = findBraceEnd(lines, i);
        const full = lines.slice(i, end + 1).join('\\n');
        const sigIdx = full.indexOf('{');
        const skeleton = (sigIdx === -1 || end - i < 3) ? full : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
        blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
        i = end;
        continue;
      }
    }

    if (e === '.rs') {
      m = line.match(/^(?:pub(?:\\([^)]+\\))?\\s+)?(?:async\\s+)?(fn|struct|enum|impl|trait)\\s+([A-Za-z0-9_]+)/);
      if (m) {
        kind = m[1];
        name = m[2];
        const end = findBraceEnd(lines, i);
        const full = lines.slice(i, end + 1).join('\\n');
        const sigIdx = full.indexOf('{');
        const skeleton = (sigIdx === -1 || end - i < 3) ? full : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
        blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
        if (kind !== 'impl') i = end;
        continue;
      }
    }

    if (e === '.java' || e === '.kt' || e === '.kts' || e === '.cs') {
      m = line.match(/^(?:\\s)*(?:public|private|protected|internal|static|final|async|override|abstract|default|native|synchronized|\\s)+[\\w<>\\[\\],\\s]+\\s+([A-Za-z0-9_]+)\\s*\\(/);
      if (!m) {
        m = line.match(/^(?:\\s)*(?:public|private|protected|internal|static|final|abstract|\\s)*(class|interface|record|enum|struct)\\s+([A-Za-z0-9_]+)/);
        if (m) { kind = m[1]; name = m[2]; }
      } else {
        name = m[1]; kind = 'method';
      }
      if (name) {
        const end = findBraceEnd(lines, i);
        const full = lines.slice(i, end + 1).join('\\n');
        const sigIdx = full.indexOf('{');
        const skeleton = (sigIdx === -1 || end - i < 3) ? full : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
        blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
        if (kind !== 'class') i = end;
        continue;
      }
    }

    if (e === '.c' || e === '.h' || e === '.cpp' || e === '.hpp' || e === '.cc' || e === '.cxx') {
      m = line.match(/^(?:class|struct|enum)\\s+([A-Za-z0-9_]+)/);
      if (m) {
        kind = 'class'; name = m[1];
      } else {
        m = line.match(/^(?:(?:inline|static|virtual|explicit|constexpr|friend)\\s+)*[\\w:*&<>\\[\\]\\s]+\\s+([A-Za-z0-9_]+)\\s*\\([^;)]*\\)\\s*(?:const)?\\s*(?:noexcept)?\\s*\\{?/);
        if (m && !line.includes('return ') && !line.includes('typedef ')) { name = m[1]; kind = 'function'; }
      }
      if (name) {
        const end = findBraceEnd(lines, i);
        const full = lines.slice(i, end + 1).join('\\n');
        const sigIdx = full.indexOf('{');
        const skeleton = (sigIdx === -1 || end - i < 3) ? full : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
        blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
        if (kind !== 'class' && kind !== 'struct') i = end;
        continue;
      }
    }

    m = line.match(/^(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?(function|class|interface|type|enum|const)\\s+([A-Za-z0-9_$]+)/);
    if (!m) {
      m = line.match(/^(?:(?:public|protected|private|static|final|abstract)\\s+)*(?:function|func)\\s+([A-Za-z0-9_$]+)/);
      if (m) { name = m[1]; kind = 'function'; }
    } else {
      name = m[2]; kind = m[1];
    }

    if (name) {
      const isStmtOnly = kind === 'const' || (kind === 'type' && !line.includes('{'));
      const end = isStmtOnly ? findStatementEndLine(lines, i, 'ts') : findBraceEnd(lines, i);
      const full = lines.slice(i, end + 1).join('\\n');
      const sigIdx = full.indexOf('{');
      const isShortConst = kind === 'const' && (end - i + 1) <= 10 && !full.includes('=>');
      const skeleton = (kind === 'interface' || kind === 'type' || isShortConst || sigIdx === -1 || end - i < 4)
        ? full
        : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
      const isExported = line.startsWith('export ');
      blocks.push({ name, kind, exported: isExported, startLine: i + 1, endLine: end + 1, full, skeleton });
      if (kind === 'class' && /\\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i.test(e)) {
        const classMembers = extractTsClassMembers(lines, i, end, isExported, maskCommentsAndStrings, findBraceEnd, findStatementEndLine);
        if (classMembers.length > 0) blocks.push(...classMembers);
        i = end;
      } else if (kind !== 'class' && kind !== 'module') {
        i = end;
      }
    }
  }

  const topConsts = extractTopLevelConstants(code, e, blocks);
  if (topConsts.length > 0) {
    blocks.push(...topConsts);
    blocks.sort((a, b) => a.startLine - b.startLine);
  }

  if (blocks.length === 0 && lines.length > 0) {
    const name = path.basename(fileName || ('file' + e));
    const full = code;
    const skeleton = lines.length > 25 ? lines.slice(0, 20).join('\\n') + \`\\n/* ... \${lines.length - 20} lines folded ... */\` : full;
    blocks.push({ name, kind: 'module', startLine: 1, endLine: lines.length, full, skeleton });
  }
  return blocks;
}

${EXTRACT_FILE_HEADER_SOURCE}
${EXTRACT_FOOTER_AND_CONST_SOURCE}

const files = walk(targetRoot);
const fileLineCounts = new Map();
const fileEntries = [];
const textRecords = [];
for (const filePath of files) {
  try {
    const buf = fs.readFileSync(filePath);
    if (isBinaryBuffer(buf)) continue;
    const content = buf.toString('utf8');
    const relPath = path.relative(targetRoot, filePath).replace(/\\\\/g, '/');
    const lineCount = content.replace(/\\r\\n/g, '\\n').split('\\n').length;
    fileLineCounts.set(relPath, lineCount);
    fileEntries.push({ relPath, lineCount });
    textRecords.push({ filePath, relPath, content });
  } catch {}
}

const terms = expandQueryTerms(query);
const allRawBlocks = [];
const fileHeaders = new Map();
const fileFooters = new Map();

if (query.trim()) {
  for (const rec of textRecords) {
    const skipHdrFtr = PLAIN_TEXT_CONFIG_EXT_RE.test(rec.relPath) || DOC_EXT_RE.test(rec.relPath);
    if (!skipHdrFtr) {
      const hdr = extractFileHeader(rec.content);
      if (hdr) fileHeaders.set(rec.relPath, hdr);
      const ftr = extractFileFooter(rec.content);
      if (ftr) fileFooters.set(rec.relPath, ftr);
    }
    const items = extractBlocks(rec.content, path.extname(rec.filePath), rec.relPath);
    for (const b of items) {
      allRawBlocks.push({ ...b, filePath: rec.relPath });
    }
  }
}

const outputXml = assembleContextSliceXml({
  blocks: allRawBlocks,
  fileEntries,
  fileLineCounts,
  fileHeaders,
  fileFooters,
  rawQuery: query,
  terms,
  budget,
  maxHops: ${maxHops},
  autoExpand: false,
  rootAttr: path.basename(targetRoot),
  version: '${SCRIPT_VERSION}',
  subPathTag: '',
  includeParserAttr: false,
  controlWords: CONTROL_WORDS,
  maskFn: maskCommentsAndStrings
});
process.stdout.write(outputXml + '\\n');
`;
}

export function generateZeroMcpDesktopConfig(config: Partial<GeneratorConfig> = {}): {
  microRule: string;
  piSkill: string;
  watchCommand: string;
} {
  const safeQuery = config.query || 'active task';
  const budgetTokens = config.budgetTokens || 32768;
  const toolDir = normalizeToolDir(config.toolDir);
  const cliPath = `${toolDir}/ctxslice.mjs`;
  const microRule = `# Global Rule:
When inspecting, debugging, or modifying code in ANY project, ALWAYS run \`node ${cliPath} "<keywords>"\` via bash/terminal in the current working directory first BEFORE reading raw files.`;

  const piSkill = `---
name: context-slice
description: Global out-of-band multi-language structural code slicing for any active project
---
Run \`node ${cliPath} "$ARGUMENTS" --budget ${budgetTokens}\` via bash in the current project directory.`;

  const watchCommand = `node ${cliPath} "${safeQuery}" --budget ${budgetTokens}`;

  return { microRule, piSkill, watchCommand };
}

export function generateThinMcpServer(config: Partial<GeneratorConfig> = {}): {
  serverCode: string;
  clientConfig: string;
  opencodeConfig: string;
  claudeCodeCmd: string;
  hermesYamlConfig: string;
  autoInvokeRule: string;
  verifyCommand: string;
} {
  const toolDir = normalizeToolDir(config.toolDir);
  const mcpPath = `${toolDir}/ctxslice-mcp.mjs`;
  const budgetTokens = config.budgetTokens || 32768;
  const maxHops = config.maxHops || 2;
  const serverCode = `#!/usr/bin/env node
/**
 * ctxslice-mcp.mjs — Global Multi-Language MCP Server ${APP_VERSION}
 * Features: Embedded Base64 Tree-sitter WASM + Lazy Cache (~/.contextslice/parsers),
 *           State-Machine Brace Matcher Fallback, True Call Graph (BFS), TF-IDF, subPath Sandbox, mtime Cache
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { createRequire } from 'node:module';

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  process.stdout.write('ctxslice-mcp ${APP_VERSION}\\n');
  process.exit(0);
}

${SHARED_SLICER_HELPERS_SOURCE}

const CJK_RE = /[一-鿿぀-ゟ゠-ヿ가-힯]/;
const CJK_RUN_RE = new RegExp('[一-鿿぀-ゟ゠-ヿ가-힯]+', 'g');
const CJK_WORDS = ${JSON.stringify(CJK_MULTILINGUAL_WORDS, null, 2)};
const EN_CJK = {};
for (const zh in CJK_WORDS) { for (const en of CJK_WORDS[zh]) { if (!EN_CJK[en]) EN_CJK[en] = []; EN_CJK[en].push(zh); } }
function containsCJK(s) { return CJK_RE.test(s); }
function tokenizeCJK2gram(text) {
  const runs = String(text || '').match(CJK_RUN_RE) || [];
  const out = [];
  for (const run of runs) {
    let i = 0;
    while (i < run.length) {
      if (i + 1 < run.length) { out.push(run[i] + run[i + 1]); i += 2; }
      else { out.push(run[i]); i += 1; }
    }
  }
  return out;
}
function bilingualLookup(term) {
  const out = [];
  if (CJK_WORDS[term]) out.push(...CJK_WORDS[term]);
  if (EN_CJK[term]) out.push(...EN_CJK[term]);
  return out;
}
function expandQueryTerms(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];
  const q = trimmed.toLowerCase();
  const terms = new Set();
  const asciiParts = q.match(/[a-z0-9_]+(?:[.-][a-z0-9_]+)*/g) || [];
  for (const p of asciiParts) {
    if (p.length >= 2 && !EN_CONVERSATIONAL_STOPWORDS.has(p)) {
      terms.add(p);
      if (/^v\\d/.test(p) && p.length >= 3) terms.add(p.slice(1));
      if (p.includes('.') || p.includes('-')) {
        for (const sub of p.split(/[.-]/)) {
          if (sub.length >= 2 && !EN_CONVERSATIONAL_STOPWORDS.has(sub)) terms.add(sub);
        }
      }
      for (const t of bilingualLookup(p)) terms.add(t);
    }
  }
  if (containsCJK(trimmed)) {
    const cleanedCjk = trimmed.replace(ZH_CONVERSATIONAL_STOPWORDS_RE, ' ');
    if (containsCJK(cleanedCjk)) {
      for (const gram of tokenizeCJK2gram(cleanedCjk)) {
        terms.add(gram);
        for (const t of bilingualLookup(gram)) terms.add(t);
      }
      for (const run of cleanedCjk.match(CJK_RUN_RE) || []) {
        terms.add(run);
        for (const t of bilingualLookup(run)) terms.add(t);
      }
    }
  }
  const snapshot = [...terms];
  for (const term of snapshot) {
    for (const t of bilingualLookup(term)) terms.add(t);
  }
  const collected = [...terms].filter(Boolean);
  const nonSyntax = collected.filter((t) => !SYNTAX_NOISE_WORDS.has(t));
  return nonSyntax.length > 0 ? nonSyntax : collected;
}

const TOOL_DEF = {
  name: 'get_context_slice',
  description: 'PRIMARY code-reading tool (${APP_VERSION}) with Tree-sitter WASM / State-Machine structural parsing, True Call Graph, TF-IDF & Dual-State File Tree.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Task or symbol keywords (Supports CJK multi-language + bilingual matching; omit or pass "" to return repository file tree overview)' },
      projectPath: { type: 'string', description: 'Absolute path to target project folder' },
      subPath: { type: 'string', description: 'Optional sub-directory path to sandbox/restrict project scanning (e.g. src/auth)' },
      budget: { type: 'number', description: 'Max token budget (default ${config.budgetTokens})' },
      autoExpand: { type: 'boolean', description: 'Auto-expand high-complexity skeleton clusters (default true)' }
    },
    required: []
  }
};

const EXPAND_TOOL_DEF = {
  name: 'expand_skeleton_cluster',
  description: 'Skeleton Expansion MCP tool to expand folded high-complexity symbol clusters.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      symbols: { type: 'array', items: { type: 'string' }, description: 'Symbol or file names to expand' },
      projectPath: { type: 'string', description: 'Absolute path to target project folder' },
      subPath: { type: 'string', description: 'Optional sub-directory path sandbox' },
      budget: { type: 'number', description: 'Max token budget for expanded code' }
    },
    required: ['symbols']
  }
};

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  'venv', '.venv', '__pycache__', 'vendor', 'target', '.build', '.swiftpm', 'DerivedData', 'Pods', 'bin', 'obj'
]);

const BINARY_EXT_RE = /\\.(png|jpe?g|gif|webp|bmp|ico|icns|tiff?|svg|mp4|mov|avi|mkv|webm|wmv|flv|mp3|wav|ogg|flac|aac|m4a|wma|zip|rar|7z|tar|gz|bz2|xz|tgz|iso|dmg|exe|dll|so|dylib|bin|o|a|obj|lib|wasm|class|jar|war|pyc|pyo|ttf|otf|woff2?|eot|pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|db|sqlite3?|mdb|psd|ai|sketch|fig|xd|blend|fbx|glb|gltf)$/i;
const NOISE_FILE_RE = /(^|\\/)(package-lock\\.json|npm-shrinkwrap\\.json|yarn\\.lock|pnpm-lock\\.yaml|bun\\.lockb?|Cargo\\.lock|poetry\\.lock|Gemfile\\.lock|composer\\.lock|go\\.sum|Podfile\\.lock|packages\\.lock\\.json|\\.env(\\..*)?|\\.pem|\\.key|credentials\\.json|service-account.*\\.json|secrets\\.json)$|\\.min\\.(js|mjs|cjs|css)$|\\.map$/i;
const CONTROL_WORDS = new Set(['if', 'else', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'typeof', 'do', 'try']);

// Pure in-memory mtime cache: Map<filePath, { mtime: number, parserMode: string, items: Array<...> }>
const FILE_CACHE = new Map();

function isAcceptedFile(name) {
  if (BINARY_EXT_RE.test(name)) return false;
  if (NOISE_FILE_RE.test(name)) return false;
  return true;
}

function isBinaryBuffer(buf) {
  const len = Math.min(buf.length, 8192);
  if (len === 0) return false;
  let suspicious = 0;
  for (let i = 0; i < len; i++) {
    const b = buf[i];
    if (b === 0 || b < 9 || b === 11 || b === 12 || (b > 13 && b < 32) || b === 127) suspicious++;
  }
  return suspicious / len > 0.08;
}

// Embedded web-tree-sitter@0.22.6 runtime + core WASM (Base64) for zero-install execution
const TREE_SITTER_JS_B64 = '${TREE_SITTER_JS_B64}';
const TREE_SITTER_WASM_B64 = '${TREE_SITTER_WASM_B64}';
const WASM_PARSER_DIR = path.join(os.homedir(), '.contextslice', 'parsers');

const EXT_TO_TS_LANG = {
  '.rs': 'rust',
  '.go': 'go',
  '.py': 'python',
  '.pyw': 'python',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.java': 'java',
  '.cs': 'c_sharp',
  '.c': 'cpp',
  '.h': 'cpp',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
};

const WASM_GRAMMAR_URLS = {
  rust: 'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-rust.wasm',
  go: 'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-go.wasm',
  python: 'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-python.wasm',
  javascript: 'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-javascript.wasm',
  typescript: 'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-typescript.wasm',
  tsx: 'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-tsx.wasm',
  cpp: 'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-cpp.wasm',
  java: 'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-java.wasm',
  c_sharp: 'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-c_sharp.wasm',
};

const TREE_SITTER_QUERIES = {
  rust: '(function_item name: (identifier) @name) @body (struct_item name: (type_identifier) @name) @body (enum_item name: (type_identifier) @name) @body (trait_item name: (type_identifier) @name) @body (impl_item type: (type_identifier) @name) @body',
  go: '(function_declaration name: (identifier) @name) @body (method_declaration name: (field_identifier) @name) @body',
  python: '(function_definition name: (identifier) @name) @body (class_definition name: (identifier) @name) @body',
  javascript: '(function_declaration name: (identifier) @name) @body (class_declaration name: (identifier) @name) @body (method_definition name: (property_identifier) @name) @body',
  typescript: '(function_declaration name: (identifier) @name) @body (class_declaration name: (type_identifier) @name) @body (interface_declaration name: (type_identifier) @name) @body (method_definition name: (property_identifier) @name) @body',
  tsx: '(function_declaration name: (identifier) @name) @body (class_declaration name: (type_identifier) @name) @body (interface_declaration name: (type_identifier) @name) @body (method_definition name: (property_identifier) @name) @body',
  java: '(method_declaration name: (identifier) @name) @body (class_declaration name: (identifier) @name) @body (interface_declaration name: (identifier) @name) @body',
  c_sharp: '(method_declaration name: (identifier) @name) @body (class_declaration name: (identifier) @name) @body (interface_declaration name: (identifier) @name) @body',
  cpp: '(function_definition declarator: (function_declarator declarator: (_) @name)) @body (class_specifier name: (type_identifier) @name) @body (struct_specifier name: (type_identifier) @name) @body',
};

let tsParserClassPromise = null;
const LANG_CACHE = new Map();

async function getTreeSitterParserClass() {
  if (!tsParserClassPromise) {
    tsParserClassPromise = (async () => {
      try {
        const jsCode = Buffer.from(TREE_SITTER_JS_B64, 'base64').toString('utf8');
        const mod = { exports: {} };
        const req = createRequire(import.meta.url);
        const loader = new Function('exports', 'require', 'module', '__filename', '__dirname', jsCode);
        loader(mod.exports, req, mod, 'tree-sitter.js', '.');
        const Parser = mod.exports;
        const wasmBytes = Buffer.from(TREE_SITTER_WASM_B64, 'base64');
        await Parser.init({ wasmBinary: wasmBytes });
        return Parser;
      } catch {
        return null;
      }
    })();
  }
  return tsParserClassPromise;
}

async function loadLanguageWasm(langName) {
  if (!langName || !WASM_GRAMMAR_URLS[langName]) return null;
  if (LANG_CACHE.has(langName)) return LANG_CACHE.get(langName);
  try {
    const Parser = await getTreeSitterParserClass();
    if (!Parser) { LANG_CACHE.set(langName, null); return null; }

    const cacheFile = path.join(WASM_PARSER_DIR, \`tree-sitter-\${langName}.wasm\`);
    let wasmBytes = null;
    if (fs.existsSync(cacheFile)) {
      wasmBytes = fs.readFileSync(cacheFile);
    } else if (process.env.CTXSLICE_DISABLE_WASM_FETCH !== '1') {
      const res = await fetch(WASM_GRAMMAR_URLS[langName], { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        wasmBytes = Buffer.from(await res.arrayBuffer());
        try {
          fs.mkdirSync(WASM_PARSER_DIR, { recursive: true });
          fs.writeFileSync(cacheFile, wasmBytes);
        } catch {}
      }
    }
    if (!wasmBytes) {
      LANG_CACHE.set(langName, null);
      return null;
    }
    const language = await Parser.Language.load(new Uint8Array(wasmBytes));
    LANG_CACHE.set(langName, language);
    return language;
  } catch {
    LANG_CACHE.set(langName, null);
    return null;
  }
}

async function extractBlocksWithTreeSitter(code, ext, fileName) {
  const e = (ext || '').toLowerCase();
  const langName = EXT_TO_TS_LANG[e];
  const querySrc = langName ? TREE_SITTER_QUERIES[langName] : null;
  if (!langName || !querySrc) return null;

  const Parser = await getTreeSitterParserClass();
  const language = await loadLanguageWasm(langName);
  if (!Parser || !language) return null;

  let parser = null;
  let tree = null;
  let query = null;
  try {
    parser = new Parser();
    parser.setLanguage(language);
    tree = parser.parse(code);
    query = language.query(querySrc);
    const matches = query.matches(tree.rootNode);
    if (!matches || matches.length === 0) return null;

    const lines = code.split('\\n');
    const seen = new Set();
    const blocks = [];

    for (const m of matches) {
      const bodyCap = m.captures.find((c) => c.name === 'body');
      const nameCap = m.captures.find((c) => c.name === 'name');
      if (!bodyCap || !nameCap) continue;
      const startLine = bodyCap.node.startPosition.row + 1;
      const endLine = bodyCap.node.endPosition.row + 1;
      const rawName = String(nameCap.node.text || '').trim();
      if (!rawName) continue;

      const nodeType = bodyCap.node.type || 'function';
      let name = rawName;
      let kind = nodeType.includes('class') ? 'class'
        : nodeType.includes('interface') ? 'interface'
        : nodeType.includes('struct') ? 'struct'
        : nodeType.includes('impl') ? 'impl'
        : nodeType.includes('method') ? 'method'
        : 'function';

      if (langName === 'python' && nodeType === 'function_definition') {
        let p = bodyCap.node.parent;
        while (p) {
          if (p.type === 'class_definition') {
            const clsNameNode = p.childForFieldName ? p.childForFieldName('name') : null;
            const clsName = clsNameNode ? String(clsNameNode.text || '').trim() : '';
            if (clsName) {
              name = \`\${clsName}.\${rawName}\`;
              kind = 'method';
            }
            break;
          }
          p = p.parent;
        }
      }

      const key = name + '@' + startLine + '-' + endLine;
      if (seen.has(key)) continue;
      seen.add(key);

      const full = lines.slice(startLine - 1, endLine).join('\\n');
      let skeleton = full;
      if (langName === 'python' && kind === 'class') {
        skeleton = buildPythonClassSkeleton(full, startLine);
      } else if (endLine - startLine >= 3) {
        if (langName === 'python') {
          const sigEndIdx = findPythonSignatureEndIdx(lines, startLine - 1);
          const indentStr = (lines[startLine - 1].match(/^\\s*/) || [''])[0];
          const sigText = lines.slice(startLine - 1, sigEndIdx + 1).join('\\n');
          const foldedLines = Math.max(1, endLine - (sigEndIdx + 1));
          skeleton = foldedLines > 2 ? \`\${sigText}\\n\${indentStr}    # ... \${foldedLines} lines folded\` : full;
        } else {
          const sigIdx = full.indexOf('{');
          if (sigIdx !== -1 && kind !== 'interface') {
            skeleton = full.slice(0, sigIdx).trim() + \` { /* ... \${endLine - startLine - 1} lines folded */ }\`;
          }
        }
      }
      blocks.push({ name, kind, startLine, endLine, full, skeleton });
    }

    // Extract TS/JS class field arrow functions & function expressions inside class_body
    // (covers public_field_definition, property_definition, field_definition)
    if (langName === 'typescript' || langName === 'tsx' || langName === 'javascript') {
      const stack = [tree.rootNode];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (!cur) continue;
        if (cur.type === 'class_body') {
          const children = cur.namedChildren || [];
          for (const fieldNode of children) {
            if (
              fieldNode.type !== 'public_field_definition' &&
              fieldNode.type !== 'property_definition' &&
              fieldNode.type !== 'field_definition'
            ) {
              continue;
            }
            let valNode = fieldNode.childForFieldName
              ? (fieldNode.childForFieldName('value') || fieldNode.childForFieldName('initializer'))
              : null;
            if (!valNode && fieldNode.namedChildren) {
              valNode = fieldNode.namedChildren.find(
                (nc) =>
                  nc.type === 'arrow_function' ||
                  nc.type === 'function_expression' ||
                  nc.type === 'function' ||
                  nc.type === 'parenthesized_expression',
              ) || null;
            }
            while (valNode && valNode.type === 'parenthesized_expression' && valNode.namedChildCount === 1) {
              valNode = valNode.namedChild(0);
            }
            if (
              !valNode ||
              (valNode.type !== 'arrow_function' &&
                valNode.type !== 'function_expression' &&
                valNode.type !== 'function')
            ) {
              continue;
            }
            const nameNode =
              (fieldNode.childForFieldName
                ? (fieldNode.childForFieldName('name') || fieldNode.childForFieldName('property'))
                : null) ||
              (fieldNode.namedChildren || []).find(
                (nc) =>
                  nc.type === 'property_identifier' ||
                  nc.type === 'private_property_identifier' ||
                  nc.type === 'identifier',
              );
            const rawFieldName = nameNode ? String(nameNode.text || '').trim().replace(/^#/, '') : '';
            if (!rawFieldName) continue;

            const startLine = fieldNode.startPosition.row + 1;
            const endLine = fieldNode.endPosition.row + 1;
            const key = rawFieldName + '@' + startLine + '-' + endLine;
            if (seen.has(key)) continue;
            seen.add(key);

            const full = lines.slice(startLine - 1, endLine).join('\\n');
            let skeleton = full;
            if (endLine - startLine >= 3) {
              const fnBody = valNode.childForFieldName ? valNode.childForFieldName('body') : null;
              if (fnBody && fnBody.type === 'statement_block') {
                const bodyRow = fnBody.startPosition.row;
                const bodyCol = fnBody.startPosition.column;
                const preLines = lines.slice(startLine - 1, bodyRow + 1);
                if (preLines.length > 0) {
                  preLines[preLines.length - 1] = preLines[preLines.length - 1].slice(0, bodyCol);
                  const sigPrefix = preLines.join('\\n').trim();
                  const foldedLines = Math.max(1, endLine - (bodyRow + 1) - 1);
                  skeleton = sigPrefix + \` { /* ... \${foldedLines} lines folded */ }\`;
                }
              } else {
                const sigIdx = full.indexOf('{');
                if (sigIdx !== -1) {
                  skeleton = full.slice(0, sigIdx).trim() + \` { /* ... \${endLine - startLine - 1} lines folded */ }\`;
                }
              }
            }
            blocks.push({ name: rawFieldName, kind: 'method', startLine, endLine, full, skeleton });
          }
          continue;
        }
        const kids = cur.namedChildren || [];
        for (let k = kids.length - 1; k >= 0; k--) {
          stack.push(kids[k]);
        }
      }
    }

    if (blocks.length === 0) return null;
    blocks.sort((a, b) => a.startLine - b.startLine);
    return blocks;
  } catch {
    return null;
  } finally {
    if (query) try { query.delete(); } catch {}
    if (tree) try { tree.delete(); } catch {}
    if (parser) try { parser.delete(); } catch {}
  }
}

function maskCommentsAndStrings(code) {
  return code
    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, (m) => m.replace(/[^\\n]/g, ' '))
    .replace(/\\/\\/.*$/gm, (m) => ' '.repeat(m.length))
    .replace(/#.*$/gm, (m) => ' '.repeat(m.length))
    .replace(/\`(?:\\\\[\\s\\S]|[^\`\\\\])*\`/g, (m) => m.replace(/[^\\n]/g, ' '))
    .replace(/"(?:\\\\.|[^"\\\\])*"/g, (m) => ' '.repeat(m.length))
    .replace(/'(?:\\\\.|[^'\\\\])*'/g, (m) => ' '.repeat(m.length));
}

// 狀態機括號匹配器：計算括號深度前先以遮罩演算法屏蔽單行註解、多行註解與字串字面量（保留換行符號）
function findBraceEnd(lines, startIdx) {
  const maskedLines = maskCommentsAndStrings(lines.slice(startIdx).join('\\n')).split('\\n');
  let depth = 0, opened = false, endRel = 0;
  for (let j = 0; j < maskedLines.length; j++) {
    const line = maskedLines[j];
    for (let k = 0; k < line.length; k++) {
      const ch = line[k];
      if (ch === '{') { depth++; opened = true; }
      else if (ch === '}') depth--;
    }
    endRel = j;
    if (opened && depth <= 0) break;
    if (!opened && line.trim().endsWith(';')) break;
  }
  return startIdx + endRel;
}

// 支援 Go, Rust, Java, Kotlin, C#, C++, Python, TS/JS 之多語言區塊提取器 (Offline Fallback)
function extractBlocks(code, ext, fileName) {
  const e = (ext || '').toLowerCase();
  const lines = code.split('\\n');
  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) continue;

    let name = null;
    let kind = 'function';
    let m = null;

    if (e === '.py' || e === '.pyw') {
      const pyRes = extractPythonBlocks(lines, i);
      if (pyRes) {
        blocks.push(...pyRes.blocks);
        i = pyRes.endIdx;
        continue;
      }
    }

    if (e === '.go') {
      m = line.match(/^func\\s+(?:\\([^)]+\\)\\s+)?([A-Za-z0-9_]+)/);
      if (m) {
        name = m[1];
        kind = 'function';
        const end = findBraceEnd(lines, i);
        const full = lines.slice(i, end + 1).join('\\n');
        const sigIdx = full.indexOf('{');
        const skeleton = (sigIdx === -1 || end - i < 3)
          ? full
          : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
        blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
        i = end;
        continue;
      }
    }

    if (e === '.rs') {
      m = line.match(/^(?:pub(?:\\([^)]+\\))?\\s+)?(?:async\\s+)?(fn|struct|enum|impl|trait)\\s+([A-Za-z0-9_]+)/);
      if (m) {
        kind = m[1];
        name = m[2];
        const end = findBraceEnd(lines, i);
        const full = lines.slice(i, end + 1).join('\\n');
        const sigIdx = full.indexOf('{');
        const skeleton = (sigIdx === -1 || end - i < 3)
          ? full
          : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
        blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
        if (kind !== 'impl') i = end;
        continue;
      }
    }

    if (e === '.java' || e === '.kt' || e === '.kts' || e === '.cs') {
      m = line.match(/^(?:\\s)*(?:public|private|protected|internal|static|final|async|override|abstract|default|native|synchronized|\\s)+[\\w<>\\[\\],\\s]+\\s+([A-Za-z0-9_]+)\\s*\\(/);
      if (!m) {
        m = line.match(/^(?:\\s)*(?:public|private|protected|internal|static|final|abstract|\\s)*(class|interface|record|enum|struct)\\s+([A-Za-z0-9_]+)/);
        if (m) {
          kind = m[1];
          name = m[2];
        }
      } else {
        name = m[1];
        kind = 'method';
      }
      if (name) {
        const end = findBraceEnd(lines, i);
        const full = lines.slice(i, end + 1).join('\\n');
        const sigIdx = full.indexOf('{');
        const skeleton = (sigIdx === -1 || end - i < 3)
          ? full
          : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
        blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
        if (kind !== 'class') i = end;
        continue;
      }
    }

    if (e === '.c' || e === '.h' || e === '.cpp' || e === '.hpp' || e === '.cc' || e === '.cxx') {
      m = line.match(/^(?:class|struct|enum)\\s+([A-Za-z0-9_]+)/);
      if (m) {
        kind = 'class';
        name = m[1];
      } else {
        m = line.match(/^(?:(?:inline|static|virtual|explicit|constexpr|friend)\\s+)*[\\w:*&<>\\[\\]\\s]+\\s+([A-Za-z0-9_]+)\\s*\\([^;)]*\\)\\s*(?:const)?\\s*(?:noexcept)?\\s*\\{?/);
        if (m && !line.includes('return ') && !line.includes('typedef ')) {
          name = m[1];
          kind = 'function';
        }
      }
      if (name) {
        const end = findBraceEnd(lines, i);
        const full = lines.slice(i, end + 1).join('\\n');
        const sigIdx = full.indexOf('{');
        const skeleton = (sigIdx === -1 || end - i < 3)
          ? full
          : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
        blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
        if (kind !== 'class' && kind !== 'struct') i = end;
        continue;
      }
    }

    m = line.match(/^(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?(function|class|interface|type|enum|const)\\s+([A-Za-z0-9_$]+)/);
    if (!m) {
      m = line.match(/^(?:(?:public|protected|private|static|final|abstract)\\s+)*(?:function|func)\\s+([A-Za-z0-9_$]+)/);
      if (m) {
        name = m[1];
        kind = 'function';
      }
    } else {
      name = m[2];
      kind = m[1];
    }

    if (name) {
      const isStmtOnly = kind === 'const' || (kind === 'type' && !line.includes('{'));
      const end = isStmtOnly ? findStatementEndLine(lines, i, 'ts') : findBraceEnd(lines, i);
      const full = lines.slice(i, end + 1).join('\\n');
      const sigIdx = full.indexOf('{');
      const isShortConst = kind === 'const' && (end - i + 1) <= 10 && !full.includes('=>');
      const skeleton = (kind === 'interface' || kind === 'type' || isShortConst || sigIdx === -1 || end - i < 4)
        ? full
        : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
      const isExported = line.startsWith('export ');
      blocks.push({ name, kind, exported: isExported, startLine: i + 1, endLine: end + 1, full, skeleton });
      if (kind === 'class' && /\\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i.test(e)) {
        const classMembers = extractTsClassMembers(lines, i, end, isExported, maskCommentsAndStrings, findBraceEnd, findStatementEndLine);
        if (classMembers.length > 0) blocks.push(...classMembers);
        i = end;
      } else if (kind !== 'class' && kind !== 'module') {
        i = end;
      }
    }
  }

  const topConsts = extractTopLevelConstants(code, e, blocks);
  if (topConsts.length > 0) {
    blocks.push(...topConsts);
    blocks.sort((a, b) => a.startLine - b.startLine);
  }

  if (blocks.length === 0 && lines.length > 0) {
    const name = path.basename(fileName || ('file' + e));
    const full = code;
    const skeleton = lines.length > 25
      ? lines.slice(0, 20).join('\\n') + \`\\n/* ... \${lines.length - 20} lines folded ... */\`
      : full;
    blocks.push({ name, kind: 'module', startLine: 1, endLine: lines.length, full, skeleton });
  }

  return blocks;
}

${EXTRACT_FILE_HEADER_SOURCE}
${EXTRACT_FOOTER_AND_CONST_SOURCE}

function collectFileOverview(root, scanRoot) {
  const files = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (isAcceptedFile(full.replace(/\\\\/g, '/'))) files.push(full);
    }
  };
  walk(scanRoot);
  const fileEntries = [];
  for (const f of files) {
    try {
      const buf = fs.readFileSync(f);
      if (isBinaryBuffer(buf)) continue;
      const relPath = path.relative(root, f).replace(/\\\\/g, '/');
      const lineCount = buf.toString('utf8').replace(/\\r\\n/g, '\\n').split('\\n').length;
      fileEntries.push({ relPath, lineCount });
    } catch {}
  }
  return fileEntries;
}

async function collectProjectBlocks(root, scanRoot) {
  const files = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (isAcceptedFile(full.replace(/\\\\/g, '/'))) files.push(full);
    }
  };
  walk(scanRoot);

  for (const cachedPath of FILE_CACHE.keys()) {
    if (!fs.existsSync(cachedPath)) {
      FILE_CACHE.delete(cachedPath);
    }
  }

  const allBlocks = [];
  const headerMap = new Map();
  const footerMap = new Map();
  const lineCountMap = new Map();
  const fileEntries = [];
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\\\/g, '/');
    let stat;
    try {
      stat = fs.statSync(f);
    } catch {
      continue;
    }
    const mtime = stat.mtimeMs;
    const cached = FILE_CACHE.get(f);

    let items;
    let parserMode = 'regex';
    let fileHeader = null;
    let fileFooter = null;
    let fileLines = 0;
    const skipHdrFtr = PLAIN_TEXT_CONFIG_EXT_RE.test(rel) || DOC_EXT_RE.test(rel);
    if (cached && cached.mtime === mtime) {
      items = cached.items;
      parserMode = cached.parserMode || 'regex';
      fileHeader = skipHdrFtr ? null : (cached.header ?? null);
      fileFooter = skipHdrFtr ? null : (cached.footer ?? null);
      fileLines = cached.lineCount || 0;
    } else {
      const rawBuf = fs.readFileSync(f);
      if (isBinaryBuffer(rawBuf)) continue;
      const raw = rawBuf.toString('utf8');
      fileLines = raw.replace(/\\r\\n/g, '\\n').split('\\n').length;
      fileHeader = skipHdrFtr ? null : extractFileHeader(raw);
      fileFooter = skipHdrFtr ? null : extractFileFooter(raw);
      const ext = path.extname(f);
      const tsBlocks = skipHdrFtr ? null : await extractBlocksWithTreeSitter(raw, ext, rel);
      if (tsBlocks && tsBlocks.length > 0) {
        const extraConsts = extractTopLevelConstants(raw, ext, tsBlocks);
        items = extraConsts.length > 0 ? [...tsBlocks, ...extraConsts].sort((a, b) => a.startLine - b.startLine) : tsBlocks;
        parserMode = 'tree-sitter-wasm';
      } else {
        items = extractBlocks(raw, ext, rel);
        parserMode = PLAIN_TEXT_CONFIG_EXT_RE.test(rel)
          ? 'plain-text-config'
          : DOC_EXT_RE.test(rel)
            ? 'markdown-doc'
            : 'state-machine-regex';
      }
      FILE_CACHE.set(f, { mtime, parserMode, items, header: fileHeader, footer: fileFooter, lineCount: fileLines });
    }
    if (fileHeader) headerMap.set(rel, fileHeader);
    if (fileFooter) footerMap.set(rel, fileFooter);
    lineCountMap.set(rel, fileLines);
    fileEntries.push({ relPath: rel, lineCount: fileLines });

    for (const b of items) {
      allBlocks.push({
        ...b,
        filePath: rel,
        rel,
        parserMode,
        lineCount: Math.max(1, b.endLine - b.startLine + 1),
        rawTk: estimateTokens(b.full),
        skelTk: estimateTokens(b.skeleton)
      });
    }
  }
  return { blocks: allBlocks, headerMap, footerMap, lineCountMap, fileEntries };
}

function resolveScanRoot(projectPath, subPath) {
  const root = projectPath ? path.resolve(projectPath) : (process.env.WORKSPACE_ROOT || process.cwd());
  if (!fs.existsSync(root)) throw new Error(\`projectPath not found: \${root}\`);
  if (!subPath || typeof subPath !== 'string' || !subPath.trim()) {
    return { root, scanRoot: root };
  }
  const scanRoot = path.resolve(root, subPath);
  const rel = path.relative(root, scanRoot);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(\`Security Error: subPath '\${subPath}' escapes projectPath sandbox\`);
  }
  if (!fs.existsSync(scanRoot)) {
    throw new Error(\`subPath not found: \${scanRoot}\`);
  }
  return { root, scanRoot };
}

async function expandSkeletonCluster(symbols, projectPath, budget = ${budgetTokens}, subPath) {
  try {
    const { root, scanRoot } = resolveScanRoot(projectPath, subPath);
    const wanted = new Set((symbols || []).map((s) => String(s).toLowerCase()));
    const { blocks, headerMap, footerMap, lineCountMap } = await collectProjectBlocks(root, scanRoot);
    let used = 0;
    const expandedFiles = [];
    const expandedFilesSet = new Set();
    const expandedByFile = new Map();
    const fullStart1EndLine = new Map();
    const coveredRangesByFile = new Map();
    let expandedCount = 0;
    for (const b of blocks) {
      const match = wanted.has(b.name.toLowerCase()) || [...wanted].some((w) => b.name.toLowerCase().includes(w) || b.rel.toLowerCase().includes(w));
      if (match && used + b.rawTk <= budget) {
        used += b.rawTk;
        expandedCount++;
        if (!expandedFilesSet.has(b.rel)) {
          expandedFilesSet.add(b.rel);
          expandedFiles.push(b.rel);
        }
        if (!expandedByFile.has(b.rel)) expandedByFile.set(b.rel, []);
        expandedByFile.get(b.rel).push(b);
        if (!coveredRangesByFile.has(b.rel)) coveredRangesByFile.set(b.rel, []);
        coveredRangesByFile.get(b.rel).push([b.startLine, b.endLine]);
        if (b.startLine === 1) {
          fullStart1EndLine.set(b.rel, Math.max(fullStart1EndLine.get(b.rel) || 0, b.endLine));
        }
      }
    }

    const sections = [];
    for (const rel of expandedFiles) {
      const hdr = headerMap.get(rel);
      const showHdr = hdr && (fullStart1EndLine.get(rel) || 0) < hdr.endLine;
      const hdrEnd = showHdr ? hdr.endLine : 0;
      const ftr = footerMap.get(rel);
      const ranges = coveredRangesByFile.get(rel) || [];
      const totalLines = lineCountMap.get(rel) || 0;
      const wholeFileCovered = ranges.some(([s, e]) => s <= 1 && e >= totalLines);
      const uncoveredFooter = (!wholeFileCovered && ftr)
        ? ftr.chunks.filter((c) => c.startLine > hdrEnd && !ranges.some(([s, e]) => c.startLine >= s && c.endLine <= e))
        : [];
      const shownRanges = [];
      if (showHdr) shownRanges.push([1, hdr.endLine]);
      const items = (expandedByFile.get(rel) || []).slice().sort((a, b) => a.startLine - b.startLine);
      for (const it of items) shownRanges.push([it.startLine, it.endLine]);
      for (const c of uncoveredFooter) shownRanges.push([c.startLine, c.endLine]);

      sections.push(\`  <file path="\${escapeXmlAttr(rel)}" total_lines="\${totalLines}" shown_lines="\${formatShownLines(shownRanges)}">\`);
      if (showHdr) {
        sections.push(\`    <file_header lines="1-\${hdr.endLine}">\`);
        sections.push(hdr.header);
        sections.push('    </file_header>');
      }
      for (const it of items) {
        sections.push(\`    <focal symbol="\${escapeXmlAttr(it.name)}" lines="\${it.startLine}-\${it.endLine}" source="expand_skeleton_cluster">\`);
        sections.push(it.full);
        sections.push('    </focal>');
      }
      if (uncoveredFooter.length > 0) {
        sections.push(\`    <file_footer lines="\${uncoveredFooter[0].startLine}-\${uncoveredFooter[uncoveredFooter.length - 1].endLine}">\`);
        sections.push(uncoveredFooter.map((c) => c.text).join('\\n'));
        sections.push('    </file_footer>');
      }
      sections.push('  </file>');
    }

    return \`<skeleton_expansion root="\${escapeXmlAttr(root)}" subPath="\${escapeXmlAttr(subPath || '')}" expanded="\${expandedCount}" used="\${used}">\\n\${sections.join('\\n')}\\n</skeleton_expansion>\`;
  } catch (err) {
    return \`Error: \${err.message}\`;
  }
}

async function sliceProject(query, projectPath, budget = ${budgetTokens}, autoExpand = true, subPath) {
  try {
    const { root, scanRoot } = resolveScanRoot(projectPath, subPath);
    const rawQuery = String(query ?? '');
    const subPathTag = subPath ? \` subPath="\${escapeXmlAttr(subPath)}"\` : '';

    // State A: Empty query -> return repository file tree overview (~1K-2K tokens)
    if (!rawQuery.trim()) {
      const fileEntries = collectFileOverview(root, scanRoot);
      return assembleContextSliceXml({
        blocks: [],
        fileEntries,
        fileLineCounts: new Map(),
        fileHeaders: new Map(),
        fileFooters: new Map(),
        rawQuery,
        terms: [],
        budget,
        maxHops: ${maxHops},
        autoExpand,
        rootAttr: root,
        version: '${SCRIPT_VERSION}',
        subPathTag,
        includeParserAttr: true,
        controlWords: CONTROL_WORDS,
        maskFn: maskCommentsAndStrings
      });
    }

    const terms = expandQueryTerms(rawQuery);
    const { blocks, headerMap, footerMap, lineCountMap, fileEntries } = await collectProjectBlocks(root, scanRoot);
    return assembleContextSliceXml({
      blocks,
      fileEntries,
      fileLineCounts: lineCountMap,
      fileHeaders: headerMap,
      fileFooters: footerMap,
      rawQuery,
      terms,
      budget,
      maxHops: ${maxHops},
      autoExpand,
      rootAttr: root,
      version: '${SCRIPT_VERSION}',
      subPathTag,
      includeParserAttr: true,
      controlWords: CONTROL_WORDS,
      maskFn: maskCommentsAndStrings
    });
  } catch (err) {
    return \`Error: \${err.message}\`;
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const send = (result) => {
    if (req.id === undefined || req.id === null) return;
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\\n');
  };
  if (req.method === 'initialize') {
    return send({
      protocolVersion: req.params?.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'ctxslice-thin', version: '${SCRIPT_VERSION}' }
    });
  }
  if (req.method === 'ping') return send({});
  if (req.method === 'tools/list') return send({ tools: [TOOL_DEF, EXPAND_TOOL_DEF] });
  if (req.method === 'tools/call' && req.params?.name === 'get_context_slice') {
    try {
      const { query, projectPath, budget, autoExpand, subPath } = req.params.arguments || {};
      const text = await sliceProject(query, projectPath, budget, autoExpand !== false, subPath);
      return send({ content: [{ type: 'text', text }] });
    } catch (err) {
      return send({ isError: true, content: [{ type: 'text', text: String(err?.message || err) }] });
    }
  }
  if (req.method === 'tools/call' && req.params?.name === 'expand_skeleton_cluster') {
    try {
      const { symbols, projectPath, budget, subPath } = req.params.arguments || {};
      const text = await expandSkeletonCluster(symbols, projectPath, budget, subPath);
      return send({ content: [{ type: 'text', text }] });
    } catch (err) {
      return send({ isError: true, content: [{ type: 'text', text: String(err?.message || err) }] });
    }
  }
  if (req.id !== undefined && req.id !== null) return send({});
});
`;

  const clientConfig = `{
  "mcpServers": {
    "context-slice": {
      "command": "node",
      "args": ["${mcpPath}"]
    }
  }
}`;

  const opencodeConfig = `{
  "mcp": {
    "context-slice": {
      "type": "local",
      "command": ["node", "${mcpPath}"]
    }
  }
}`;

  const claudeCodeCmd = `claude mcp add --scope user context-slice -- node ${mcpPath}`;

  const hermesYamlConfig = `# ~/.hermes/config.yaml
mcp_servers:
  context_slice:
    command: "node"
    args: ["${mcpPath}"]
    tools:
      include: ["get_context_slice"]`;

  const autoInvokeRule = `When inspecting, debugging, or modifying code in any project folder, ALWAYS call the \`get_context_slice\` MCP tool first (passing \`projectPath\` and \`query\`) BEFORE reading raw files.`;

  const verifyCommand = `node -v && node -e "const s=require('child_process').spawnSync('node',['${mcpPath}'],{input:'{\\"jsonrpc\\":\\"2.0\\",\\"id\\":1,\\"method\\":\\"tools/list\\"}\\n',encoding:'utf8'});console.log(s.stdout||s.stderr)"`;

  return { serverCode, clientConfig, opencodeConfig, claudeCodeCmd, hermesYamlConfig, autoInvokeRule, verifyCommand };
}

export function generateMcpServerScript(config: Partial<GeneratorConfig> = {}): string {
  return generateThinMcpServer(config).serverCode;
}

