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
  const safeQuery = (config.query || 'fix bug').replace(/"/g, '\\"');
  const budgetTokens = config.budgetTokens || 32768;
  const maxHops = config.maxHops || 2;
  return `#!/usr/bin/env node
/**
 * ctxslice.mjs — Zero-Config Multi-Language Local AST Context Pre-Compiler (${APP_VERSION})
 * Features: Multi-Language AST Extractors, State-Machine Brace Matcher, True Call Graph (BFS), TF-IDF, Directory Quota Cap
 */
import fs from 'node:fs';
import path from 'node:path';

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
  const q = String(query || '').toLowerCase();
  const terms = new Set(q.split(/\\s+/).filter(Boolean));
  const asciiParts = q.match(/[a-z0-9_]+/g) || [];
  for (const p of asciiParts) {
    if (p.length >= 2) terms.add(p);
    for (const t of bilingualLookup(p)) terms.add(t);
  }
  if (containsCJK(q)) {
    for (const gram of tokenizeCJK2gram(q)) {
      terms.add(gram);
      for (const t of bilingualLookup(gram)) terms.add(t);
    }
    for (const run of q.match(CJK_RUN_RE) || []) terms.add(run);
  }
  return [...terms].filter(Boolean);
}

const args = process.argv.slice(2);
if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write('ctxslice ${APP_VERSION}\\n');
  process.exit(0);
}
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    'ContextSlice CLI ${APP_VERSION} — Zero-Config Multi-Language AST Slicer\\n\\n' +
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
const skipIdx = new Set([rootFlag, rootFlag + 1, budgetFlag, budgetFlag + 1]);
const query = args.find((a, idx) => !skipIdx.has(idx) && !a.startsWith('--')) || '${safeQuery}';
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
const NOISE_FILE = /(^|\\/)(package-lock\\.json|npm-shrinkwrap\\.json|yarn\\.lock|pnpm-lock\\.yaml|Cargo\\.lock|poetry\\.lock|Gemfile\\.lock|composer\\.lock|go\\.sum|Podfile\\.lock|packages\\.lock\\.json|\\.env(\\..*)?|\\.pem|\\.key|credentials\\.json|service-account.*\\.json|secrets\\.json)$|\\.min\\.(js|mjs|cjs|css)$|\\.map$/i;
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

function estimateTokens(str) {
  if (!str) return 0;
  let cjk = 0;
  for (let i = 0; i < str.length; i++) if (str.charCodeAt(i) >= 128) cjk++;
  return Math.max(1, Math.round((str.length - cjk) / 2.1 + cjk * 1.6));
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
      m = line.match(/^(?:async\\s+)?(def|class)\\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (m) {
        name = m[2];
        kind = m[1] === 'class' ? 'class' : 'function';
        let end = i;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() === '' || /^\\s+/.test(lines[j])) end = j;
          else break;
        }
        while (end > i && lines[end].trim() === '') end--;
        const full = lines.slice(i, end + 1).join('\\n');
        const skeleton = end - i > 2 ? \`\${lines[i]}\\n    # ... \${end - i} lines folded\` : full;
        blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
        i = end;
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
      blocks.push({ name, kind, exported: line.startsWith('export '), startLine: i + 1, endLine: end + 1, full, skeleton });
      if (kind !== 'class' && kind !== 'module') i = end;
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
const terms = expandQueryTerms(query);
const allRawBlocks = [];
const fileHeaders = new Map();
const fileFooters = new Map();
const fileLineCounts = new Map();
for (const filePath of files) {
  try {
    const buf = fs.readFileSync(filePath);
    if (isBinaryBuffer(buf)) continue;
    const content = buf.toString('utf8');
    const relPath = path.relative(targetRoot, filePath);
    fileLineCounts.set(relPath, content.split('\\n').length);
    const hdr = extractFileHeader(content);
    if (hdr) fileHeaders.set(relPath, hdr);
    const ftr = extractFileFooter(content);
    if (ftr) fileFooters.set(relPath, ftr);
    const items = extractBlocks(content, path.extname(filePath), relPath);
    for (const b of items) {
      allRawBlocks.push({
        ...b,
        filePath: relPath,
        rawTokens: estimateTokens(b.full),
        skelTokens: estimateTokens(b.skeleton),
      });
    }
  } catch {}
}

const totalBlocks = Math.max(1, allRawBlocks.length);
const termDF = {};
for (const t of terms) {
  let df = 0;
  for (const b of allRawBlocks) {
    if (b.name.toLowerCase().includes(t) || b.filePath.toLowerCase().includes(t) || b.full.toLowerCase().includes(t)) {
      df++;
    }
  }
  termDF[t] = Math.max(1, df);
}

const scored = allRawBlocks.map((b) => {
  const lower = b.full.toLowerCase();
  const relLower = b.filePath.toLowerCase();
  let score = 0;
  for (const t of terms) {
    const df = termDF[t] || 1;
    const idf = Math.log(1 + (totalBlocks / df));
    const scarcityMultiplier = (df / totalBlocks > 0.3) ? 0.35 : (df / totalBlocks > 0.15) ? 0.7 : 1.25;
    const nameMatch = b.name.toLowerCase().includes(t) ? 35 : 0;
    const pathMatch = relLower.includes(t) ? 25 : 0;
    const bodyOcc = lower.split(t).length - 1;
    const bodyScore = Math.min(15, 3 * Math.log1p(bodyOcc));
    score += (nameMatch + pathMatch + bodyScore) * idf * scarcityMultiplier;
  }
  return { ...b, score };
}).sort((a, b) => b.score - a.score);

// True Call Graph (SymbolMap + Word-Boundary Call/Constant Matching + BFS maxHops)
const symbolMap = new Map();
const constSymbolNames = new Set();
for (let i = 0; i < scored.length; i++) {
  const b = scored[i];
  if (b.name && b.kind !== 'module' && !CONTROL_WORDS.has(b.name)) {
    const names = (b.kind === 'const' && b.name.includes(','))
      ? b.name.split(',').map((s) => s.trim()).filter(Boolean)
      : [b.name];
    for (const sn of names) {
      if (!symbolMap.has(sn)) symbolMap.set(sn, []);
      symbolMap.get(sn).push(i);
      if (b.kind === 'const') constSymbolNames.add(sn);
    }
  }
}
const callAdj = Array.from({ length: scored.length }, () => new Set());
const definedNames = Array.from(symbolMap.keys());
for (let i = 0; i < scored.length; i++) {
  const caller = scored[i];
  const maskedCaller = maskCommentsAndStrings(caller.full);
  for (const sym of definedNames) {
    if (sym === caller.name) continue;
    if (maskedCaller.includes(sym)) {
      const esc = sym.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
      const isConstRef = constSymbolNames.has(sym) && sym.length >= 3;
      const re = isConstRef ? new RegExp('\\\\b' + esc + '\\\\b', 'm') : new RegExp('\\\\b' + esc + '\\\\s*\\\\(', 'm');
      if (re.test(maskedCaller)) {
        for (const t of (symbolMap.get(sym) || [])) {
          callAdj[i].add(t);
          callAdj[t].add(i);
        }
      }
    }
  }
}
const hopDistances = new Map();
const focalFiles = new Set();
const bfsQ = [];
for (let i = 0; i < scored.length; i++) {
  if (scored[i].score > 0 && bfsQ.length < 3) {
    bfsQ.push(i);
    hopDistances.set(i, 0);
    focalFiles.add(scored[i].filePath);
  }
}
let qHead = 0;
while (qHead < bfsQ.length) {
  const curr = bfsQ[qHead++];
  const curHop = hopDistances.get(curr) ?? 0;
  if (curHop >= ${maxHops}) continue;
  for (const nbr of callAdj[curr]) {
    if (!hopDistances.has(nbr)) {
      hopDistances.set(nbr, curHop + 1);
      bfsQ.push(nbr);
    }
  }
}

let remaining = budget;
const out = ['<context_slice root="' + path.basename(targetRoot) + '" version="${SCRIPT_VERSION}" budget="' + budget + '">'];
const includedIds = new Set();
const includedFiles = new Set();
const fullStart1EndLine = new Map();
const coveredRangesByFile = new Map();
const partialFiles = new Set();
const addCoveredRange = (fp, s, e) => {
  if (!coveredRangesByFile.has(fp)) coveredRangesByFile.set(fp, []);
  coveredRangesByFile.get(fp).push([s, e]);
};
const dirBudgetUsed = {};
const maxDirBudget = budget * 0.65;

const candidateItems = [];
for (let i = 0; i < scored.length; i++) {
  const item = scored[i];
  const topDir = item.filePath.split(path.sep)[0] || 'root';
  const curDir = dirBudgetUsed[topDir] || 0;
  const hop = hopDistances.get(i);
  const isFocal = hop === 0 || (i < 2 && item.score > 0);
  const key = item.filePath + ':' + item.startLine;

  if (isFocal && item.rawTokens <= remaining && curDir + item.rawTokens <= maxDirBudget) {
    remaining -= item.rawTokens;
    dirBudgetUsed[topDir] = curDir + item.rawTokens;
    includedIds.add(key);
    includedFiles.add(item.filePath);
    addCoveredRange(item.filePath, item.startLine, item.endLine);
    if (item.startLine === 1) {
      fullStart1EndLine.set(item.filePath, Math.max(fullStart1EndLine.get(item.filePath) || 0, item.endLine));
    }
    out.push(\`  <!-- FULL: \${item.filePath}:\${item.startLine}-\${item.endLine} (\${item.rawTokens} tokens) -->\`);
    out.push(item.full);
  } else if (item.skelTokens <= remaining && curDir + item.skelTokens <= maxDirBudget) {
    const sameFileConst = item.kind === 'const' && (item.exported || /^[A-Z][A-Z0-9_]+$/.test(item.name)) && (item.endLine - item.startLine + 1) <= 25 && focalFiles.has(item.filePath);
    const linked = (hop !== undefined && hop <= ${maxHops}) || item.score > 0 || sameFileConst;
    if (linked || i < 12) {
      remaining -= item.skelTokens;
      dirBudgetUsed[topDir] = curDir + item.skelTokens;
      includedIds.add(key);
      includedFiles.add(item.filePath);
      partialFiles.add(item.filePath);
      if (item.skeleton === item.full) {
        addCoveredRange(item.filePath, item.startLine, item.endLine);
      }
      out.push(\`  <!-- SKELETON: \${item.filePath}:\${item.startLine}-\${item.endLine} (\${item.skelTokens} tokens) -->\`);
      out.push(item.skeleton);
    } else {
      partialFiles.add(item.filePath);
      candidateItems.push(item);
    }
  } else {
    partialFiles.add(item.filePath);
    candidateItems.push(item);
  }
}

const headerChunks = [];
const headerEndByFile = new Map();
for (const fp of includedFiles) {
  const hdr = fileHeaders.get(fp);
  if (!hdr) continue;
  const coveredEnd = fullStart1EndLine.get(fp) || 0;
  if (coveredEnd >= hdr.endLine) continue;
  headerEndByFile.set(fp, hdr.endLine);
  headerChunks.push(\`  <!-- FILE_HEADER: \${fp}:1-\${hdr.endLine} -->\`);
  headerChunks.push(hdr.header);
}
if (headerChunks.length > 0) {
  out.splice(1, 0, '<file_headers>', ...headerChunks, '</file_headers>');
}

const footerChunks = [];
for (const fp of includedFiles) {
  const ftr = fileFooters.get(fp);
  if (!ftr) continue;
  const ranges = coveredRangesByFile.get(fp) || [];
  const totalLines = fileLineCounts.get(fp) || 0;
  const wholeFileCovered = ranges.some(([s, e]) => s <= 1 && e >= totalLines);
  if (!partialFiles.has(fp) && wholeFileCovered) continue;
  const hdrEnd = headerEndByFile.get(fp) || 0;
  const uncovered = ftr.chunks.filter((c) => c.startLine > hdrEnd && !ranges.some(([s, e]) => c.startLine >= s && c.endLine <= e));
  if (uncovered.length > 0) {
    footerChunks.push(\`  <!-- FILE_FOOTER: \${fp}:\${uncovered[0].startLine}-\${uncovered[uncovered.length - 1].endLine} -->\`);
    footerChunks.push(uncovered.map((c) => c.text).join('\\n'));
  }
}
if (footerChunks.length > 0) {
  out.push('<file_footers>', ...footerChunks, '</file_footers>');
}

const omitted = candidateItems.filter(item => item.score > 0 && !includedIds.has(item.filePath + ':' + item.startLine)).slice(0, 3);
if (omitted.length > 0) {
  out.push('<omitted_top_matches>');
  for (const o of omitted) {
    out.push(\`  <!-- Omitted: \${o.filePath}:\${o.startLine} (\${o.name}, score: \${o.score.toFixed(1)}) — consider expanding -->\`);
  }
  out.push('</omitted_top_matches>');
}

out.push('</context_slice>');
process.stdout.write(out.join('\\n') + '\\n');
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
description: Global out-of-band multi-language AST code slicing for any active project
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
  const q = String(query || '').toLowerCase();
  const terms = new Set(q.split(/\\s+/).filter(Boolean));
  const asciiParts = q.match(/[a-z0-9_]+/g) || [];
  for (const p of asciiParts) {
    if (p.length >= 2) terms.add(p);
    for (const t of bilingualLookup(p)) terms.add(t);
  }
  if (containsCJK(q)) {
    for (const gram of tokenizeCJK2gram(q)) {
      terms.add(gram);
      for (const t of bilingualLookup(gram)) terms.add(t);
    }
    for (const run of q.match(CJK_RUN_RE) || []) terms.add(run);
  }
  return [...terms].filter(Boolean);
}

const TOOL_DEF = {
  name: 'get_context_slice',
  description: 'PRIMARY code-reading tool (${APP_VERSION}) with Tree-sitter WASM / State-Machine AST parsing, True Call Graph, TF-IDF & omitted summary.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Task or symbol keywords (Supports CJK multi-language + bilingual zh-en matching)' },
      projectPath: { type: 'string', description: 'Absolute path to target project folder' },
      subPath: { type: 'string', description: 'Optional sub-directory path to sandbox/restrict project scanning (e.g. src/auth)' },
      budget: { type: 'number', description: 'Max token budget (default ${config.budgetTokens})' },
      autoExpand: { type: 'boolean', description: 'Auto-expand high-complexity skeleton clusters (default true)' }
    },
    required: ['query']
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
const NOISE_FILE_RE = /(^|\\/)(package-lock\\.json|npm-shrinkwrap\\.json|yarn\\.lock|pnpm-lock\\.yaml|Cargo\\.lock|poetry\\.lock|Gemfile\\.lock|composer\\.lock|go\\.sum|Podfile\\.lock|packages\\.lock\\.json|\\.env(\\..*)?|\\.pem|\\.key|credentials\\.json|service-account.*\\.json|secrets\\.json)$|\\.min\\.(js|mjs|cjs|css)$|\\.map$/i;
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
      const name = String(nameCap.node.text || '').trim();
      const key = name + '@' + startLine + '-' + endLine;
      if (!name || seen.has(key)) continue;
      seen.add(key);

      const nodeType = bodyCap.node.type || 'function';
      const kind = nodeType.includes('class') ? 'class'
        : nodeType.includes('interface') ? 'interface'
        : nodeType.includes('struct') ? 'struct'
        : nodeType.includes('impl') ? 'impl'
        : nodeType.includes('method') ? 'method'
        : 'function';

      const full = lines.slice(startLine - 1, endLine).join('\\n');
      let skeleton = full;
      if (endLine - startLine >= 3) {
        if (langName === 'python') {
          skeleton = \`\${lines[startLine - 1]}\\n    # ... \${endLine - startLine} lines folded\`;
        } else {
          const sigIdx = full.indexOf('{');
          if (sigIdx !== -1 && kind !== 'interface') {
            skeleton = full.slice(0, sigIdx).trim() + \` { /* ... \${endLine - startLine - 1} lines folded */ }\`;
          }
        }
      }
      blocks.push({ name, kind, startLine, endLine, full, skeleton });
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
      m = line.match(/^(?:async\\s+)?(def|class)\\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (m) {
        name = m[2];
        kind = m[1] === 'class' ? 'class' : 'function';
        let end = i;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() === '' || /^\\s+/.test(lines[j])) end = j;
          else break;
        }
        while (end > i && lines[end].trim() === '') end--;
        const full = lines.slice(i, end + 1).join('\\n');
        const skeleton = end - i > 2 ? \`\${lines[i]}\\n    # ... \${end - i} lines folded\` : full;
        blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
        i = end;
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
      blocks.push({ name, kind, exported: line.startsWith('export '), startLine: i + 1, endLine: end + 1, full, skeleton });
      if (kind !== 'class' && kind !== 'module') i = end;
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

async function collectProjectBlocks(root, scanRoot) {
  const files = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (isAcceptedFile(e.name)) files.push(full);
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
  for (const f of files) {
    const rel = path.relative(root, f);
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
    if (cached && cached.mtime === mtime) {
      items = cached.items;
      parserMode = cached.parserMode || 'regex';
      fileHeader = cached.header ?? null;
      fileFooter = cached.footer ?? null;
      fileLines = cached.lineCount || 0;
    } else {
      const rawBuf = fs.readFileSync(f);
      if (isBinaryBuffer(rawBuf)) continue;
      const raw = rawBuf.toString('utf8');
      fileLines = raw.split('\\n').length;
      fileHeader = extractFileHeader(raw);
      fileFooter = extractFileFooter(raw);
      const ext = path.extname(f);
      const tsBlocks = await extractBlocksWithTreeSitter(raw, ext, rel);
      if (tsBlocks && tsBlocks.length > 0) {
        const extraConsts = extractTopLevelConstants(raw, ext, tsBlocks);
        items = extraConsts.length > 0 ? [...tsBlocks, ...extraConsts].sort((a, b) => a.startLine - b.startLine) : tsBlocks;
        parserMode = 'tree-sitter-wasm';
      } else {
        items = extractBlocks(raw, ext, rel);
        parserMode = 'state-machine-regex';
      }
      FILE_CACHE.set(f, { mtime, parserMode, items, header: fileHeader, footer: fileFooter, lineCount: fileLines });
    }
    if (fileHeader) headerMap.set(rel, fileHeader);
    if (fileFooter) footerMap.set(rel, fileFooter);
    lineCountMap.set(rel, fileLines);

    for (const b of items) {
      allBlocks.push({
        ...b,
        rel,
        parserMode,
        lineCount: Math.max(1, b.endLine - b.startLine + 1),
        rawTk: Math.max(1, Math.round(b.full.length / 3.8)),
        skelTk: Math.max(1, Math.round(b.skeleton.length / 3.8))
      });
    }
  }
  return { blocks: allBlocks, headerMap, footerMap, lineCountMap };
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
    const expanded = [];
    const expandedFiles = new Set();
    const fullStart1EndLine = new Map();
    const coveredRangesByFile = new Map();
    for (const b of blocks) {
      const match = wanted.has(b.name.toLowerCase()) || [...wanted].some((w) => b.name.toLowerCase().includes(w) || b.rel.toLowerCase().includes(w));
      if (match && used + b.rawTk <= budget) {
        used += b.rawTk;
        expandedFiles.add(b.rel);
        if (!coveredRangesByFile.has(b.rel)) coveredRangesByFile.set(b.rel, []);
        coveredRangesByFile.get(b.rel).push([b.startLine, b.endLine]);
        if (b.startLine === 1) {
          fullStart1EndLine.set(b.rel, Math.max(fullStart1EndLine.get(b.rel) || 0, b.endLine));
        }
        expanded.push(\`// [\${b.rel}:\${b.startLine}-\${b.endLine}] [MCP: expand_skeleton_cluster]\\n\${b.full}\`);
      }
    }
    const headerChunks = [];
    const headerEndByFile = new Map();
    for (const rel of expandedFiles) {
      const hdr = headerMap.get(rel);
      if (!hdr) continue;
      if ((fullStart1EndLine.get(rel) || 0) >= hdr.endLine) continue;
      headerEndByFile.set(rel, hdr.endLine);
      headerChunks.push(\`// [\${rel}:1-\${hdr.endLine}] (file header)\\n\${hdr.header}\`);
    }
    const footerChunks = [];
    for (const rel of expandedFiles) {
      const ftr = footerMap.get(rel);
      if (!ftr) continue;
      const ranges = coveredRangesByFile.get(rel) || [];
      const totalLines = lineCountMap.get(rel) || 0;
      if (ranges.some(([s, e]) => s <= 1 && e >= totalLines)) continue;
      const hdrEnd = headerEndByFile.get(rel) || 0;
      const uncovered = ftr.chunks.filter((c) => c.startLine > hdrEnd && !ranges.some(([s, e]) => c.startLine >= s && c.endLine <= e));
      if (uncovered.length > 0) {
        footerChunks.push(\`// [\${rel}:\${uncovered[0].startLine}-\${uncovered[uncovered.length - 1].endLine}] (file footer)\\n\${uncovered.map((c) => c.text).join('\\n')}\`);
      }
    }
    const hdrTag = headerChunks.length > 0 ? \`\\n<file_headers>\\n\${headerChunks.join('\\n\\n')}\\n</file_headers>\` : '';
    const ftrTag = footerChunks.length > 0 ? \`\\n<file_footers>\\n\${footerChunks.join('\\n\\n')}\\n</file_footers>\` : '';
    return \`<skeleton_expansion root="\${root}" subPath="\${subPath || ''}" expanded="\${expanded.length}" used="\${used}">\${hdrTag}\\n\${expanded.join('\\n\\n')}\${ftrTag}\\n</skeleton_expansion>\`;
  } catch (err) {
    return \`Error: \${err.message}\`;
  }
}

async function sliceProject(query, projectPath, budget = ${budgetTokens}, autoExpand = true, subPath) {
  try {
    const { root, scanRoot } = resolveScanRoot(projectPath, subPath);
    const terms = expandQueryTerms(String(query));
    const { blocks, headerMap, footerMap, lineCountMap } = await collectProjectBlocks(root, scanRoot);
    const totalBlocks = Math.max(1, blocks.length);
    const termDF = {};
    for (const t of terms) {
      let df = 0;
      for (const b of blocks) {
        if (b.name.toLowerCase().includes(t) || b.rel.toLowerCase().includes(t) || b.full.toLowerCase().includes(t)) {
          df++;
        }
      }
      termDF[t] = Math.max(1, df);
    }

    const allBlocks = blocks.map((b) => {
      const lower = b.full.toLowerCase();
      const relLower = b.rel.toLowerCase();
      let score = 0;
      for (const t of terms) {
        const df = termDF[t] || 1;
        const idf = Math.log(1 + (totalBlocks / df));
        const scarcityMultiplier = (df / totalBlocks > 0.3) ? 0.35 : (df / totalBlocks > 0.15) ? 0.7 : 1.25;
        const nameMatch = b.name.toLowerCase().includes(t) ? 35 : 0;
        const pathMatch = relLower.includes(t) ? 25 : 0;
        const bodyOcc = lower.split(t).length - 1;
        const bodyScore = Math.min(12, 2.5 * Math.log1p(bodyOcc));
        score += (nameMatch + pathMatch + bodyScore) * idf * scarcityMultiplier;
      }
      return { ...b, score };
    }).sort((a, b) => b.score - a.score);

    // 構建專案 SymbolMap 與真實依賴圖 (True Call Graph + Constants)
    const symbolMap = new Map();
    const constSymbolNames = new Set();
    for (let idx = 0; idx < allBlocks.length; idx++) {
      const b = allBlocks[idx];
      if (b.name && b.kind !== 'module' && !CONTROL_WORDS.has(b.name)) {
        const names = (b.kind === 'const' && b.name.includes(','))
          ? b.name.split(',').map((s) => s.trim()).filter(Boolean)
          : [b.name];
        for (const sn of names) {
          if (!symbolMap.has(sn)) symbolMap.set(sn, []);
          symbolMap.get(sn).push(idx);
          if (b.kind === 'const') constSymbolNames.add(sn);
        }
      }
    }

    const callAdj = Array.from({ length: allBlocks.length }, () => new Set());
    const definedNames = Array.from(symbolMap.keys());
    for (let i = 0; i < allBlocks.length; i++) {
      const caller = allBlocks[i];
      const maskedCaller = maskCommentsAndStrings(caller.full);
      for (const sym of definedNames) {
        if (sym === caller.name) continue;
        if (maskedCaller.includes(sym)) {
          const esc = sym.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
          const isConstRef = constSymbolNames.has(sym) && sym.length >= 3;
          const callRe = isConstRef ? new RegExp('\\\\b' + esc + '\\\\b', 'm') : new RegExp('\\\\b' + esc + '\\\\s*\\\\(', 'm');
          if (callRe.test(maskedCaller)) {
            for (const t of (symbolMap.get(sym) || [])) {
              callAdj[i].add(t);
              callAdj[t].add(i);
            }
          }
        }
      }
    }

    // 計算自頂部修改重點 (Focal) 出發的 1 層 (1-hop) 與 2 層 (2-hop) 關聯距離
    const focalIndices = [];
    const focalFiles = new Set();
    const hopDistances = new Map();
    for (let i = 0; i < allBlocks.length; i++) {
      if (allBlocks[i].score > 0 && focalIndices.length < 3) {
        focalIndices.push(i);
        hopDistances.set(i, 0);
        focalFiles.add(allBlocks[i].rel);
      }
    }

    const bfsQ = [...focalIndices];
    let qHead = 0;
    while (qHead < bfsQ.length) {
      const curr = bfsQ[qHead++];
      const curHop = hopDistances.get(curr) ?? 0;
      if (curHop >= ${maxHops}) continue;
      for (const nbr of callAdj[curr]) {
        if (!hopDistances.has(nbr)) {
          hopDistances.set(nbr, curHop + 1);
          bfsQ.push(nbr);
        }
      }
    }

    let used = 0;
    const fullChunks = [];
    const skelCandidates = [];
    const focalNames = new Set();
    const includedIds = new Set();
    const includedFiles = new Set();
    const partialFiles = new Set();
    const fullStart1EndLine = new Map();
    const coveredRangesByFile = new Map();
    const addCoveredRange = (rel, s, e) => {
      if (!coveredRangesByFile.has(rel)) coveredRangesByFile.set(rel, []);
      coveredRangesByFile.get(rel).push([s, e]);
    };
    const candidateItems = [];
    const dirBudgetUsed = {};
    const maxDirBudget = budget * 0.65;

    for (let i = 0; i < allBlocks.length; i++) {
      const b = allBlocks[i];
      const topDir = b.rel.split(path.sep)[0] || 'root';
      const curDir = dirBudgetUsed[topDir] || 0;
      const hop = hopDistances.get(i);
      const isFocal = (hop === 0 || (i < 3 && b.score > 0));

      if (isFocal && used + b.rawTk <= budget && curDir + b.rawTk <= maxDirBudget) {
        used += b.rawTk;
        dirBudgetUsed[topDir] = curDir + b.rawTk;
        focalNames.add(b.name);
        includedIds.add(b.rel + ':' + b.name + '@' + b.startLine);
        includedFiles.add(b.rel);
        addCoveredRange(b.rel, b.startLine, b.endLine);
        if (b.startLine === 1) {
          fullStart1EndLine.set(b.rel, Math.max(fullStart1EndLine.get(b.rel) || 0, b.endLine));
        }
        fullChunks.push(\`// [\${b.rel}:\${b.startLine}-\${b.endLine}] [\${b.parserMode}]\\n\${b.full}\`);
      } else if (used + b.skelTk <= budget && curDir + b.skelTk <= maxDirBudget) {
        const sameFileConst = b.kind === 'const' && (b.exported || /^[A-Z][A-Z0-9_]+$/.test(b.name)) && b.lineCount <= 25 && focalFiles.has(b.rel);
        const linked = (hop !== undefined && hop <= ${maxHops}) || b.score > 0 || sameFileConst;
        if (linked || i < 12) {
          used += b.skelTk;
          dirBudgetUsed[topDir] = curDir + b.skelTk;
          skelCandidates.push({ ...b, linked, hop: hop ?? null });
          includedIds.add(b.rel + ':' + b.name + '@' + b.startLine);
          includedFiles.add(b.rel);
          partialFiles.add(b.rel);
          if (b.skeleton === b.full) {
            addCoveredRange(b.rel, b.startLine, b.endLine);
          }
        } else {
          partialFiles.add(b.rel);
          candidateItems.push(b);
        }
      } else {
        partialFiles.add(b.rel);
        candidateItems.push(b);
      }
    }

    const autoExpandedNames = [];
    const finalSkelChunks = [];
    for (const item of skelCandidates) {
      const delta = Math.max(0, item.rawTk - item.skelTk);
      const isComplexCluster = (item.linked || item.score > 0) && (item.lineCount >= 16 || delta >= 45);
      const topDir = item.rel.split(path.sep)[0] || 'root';
      const curDir = dirBudgetUsed[topDir] || 0;

      if (autoExpand && isComplexCluster && autoExpandedNames.length < 4 && used + delta <= budget && curDir + delta <= maxDirBudget) {
        used += delta;
        dirBudgetUsed[topDir] = curDir + delta;
        autoExpandedNames.push(item.name);
        addCoveredRange(item.rel, item.startLine, item.endLine);
        if (item.startLine === 1) {
          fullStart1EndLine.set(item.rel, Math.max(fullStart1EndLine.get(item.rel) || 0, item.endLine));
        }
        fullChunks.push(\`// [\${item.rel}:\${item.startLine}-\${item.endLine}] [MCP auto-expanded: \${item.lineCount} lines]\\n\${item.full}\`);
      } else {
        const hopNote = item.hop ? \` | \${item.hop}-hop\` : '';
        finalSkelChunks.push(\`// [\${item.rel}:\${item.startLine}-\${item.endLine}] (skeleton\${hopNote})\\n\${item.skeleton}\`);
      }
    }

    const headerChunks = [];
    const headerEndByFile = new Map();
    for (const rel of includedFiles) {
      const hdr = headerMap.get(rel);
      if (!hdr) continue;
      if ((fullStart1EndLine.get(rel) || 0) >= hdr.endLine) continue;
      headerEndByFile.set(rel, hdr.endLine);
      headerChunks.push(\`// [\${rel}:1-\${hdr.endLine}] (file header)\\n\${hdr.header}\`);
    }
    const headerTag = headerChunks.length > 0 ? \`\\n<file_headers>\\n\${headerChunks.join('\\n\\n')}\\n</file_headers>\` : '';

    const footerChunks = [];
    for (const rel of includedFiles) {
      const ftr = footerMap.get(rel);
      if (!ftr) continue;
      const ranges = coveredRangesByFile.get(rel) || [];
      const totalLines = lineCountMap.get(rel) || 0;
      const wholeFileCovered = ranges.some(([s, e]) => s <= 1 && e >= totalLines);
      if (!partialFiles.has(rel) && wholeFileCovered) continue;
      const hdrEnd = headerEndByFile.get(rel) || 0;
      const uncovered = ftr.chunks.filter((c) => c.startLine > hdrEnd && !ranges.some(([s, e]) => c.startLine >= s && c.endLine <= e));
      if (uncovered.length > 0) {
        footerChunks.push(\`// [\${rel}:\${uncovered[0].startLine}-\${uncovered[uncovered.length - 1].endLine}] (file footer)\\n\${uncovered.map((c) => c.text).join('\\n')}\`);
      }
    }
    const footerTag = footerChunks.length > 0 ? \`\\n<file_footers>\\n\${footerChunks.join('\\n\\n')}\\n</file_footers>\` : '';

    const omitted = candidateItems.filter(b => b.score > 0 && !includedIds.has(b.rel + ':' + b.name + '@' + b.startLine)).slice(0, 3);
    const omittedTag = omitted.length > 0
      ? \`\\n<omitted_top_matches>\\n\` + omitted.map(o => \`  <!-- Omitted: \${o.rel}:\${o.startLine} (\${o.name}, score: \${o.score.toFixed(1)}) — consider expanding -->\`).join('\\n') + \`\\n</omitted_top_matches>\`
      : '';

    const expandTag = autoExpandedNames.length > 0 ? \` autoExpanded="\${autoExpandedNames.join(',')}"\` : '';
    const subPathTag = subPath ? \` subPath="\${subPath}"\` : '';
    return \`<context_slice root="\${root}" version="${SCRIPT_VERSION}"\${subPathTag} budget="\${budget}" used="\${used}"\${expandTag}>\${headerTag}\\n<skeletons>\\n\${finalSkelChunks.join('\\n')}\\n</skeletons>\\n<focal>\\n\${fullChunks.join('\\n\\n')}\\n</focal>\${footerTag}\${omittedTag}\\n</context_slice>\`;
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

