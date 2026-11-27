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
  return Math.max(1, Math.round(str.length / 3.8));
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
      const end = findBraceEnd(lines, i);
      const full = lines.slice(i, end + 1).join('\\n');
      const sigIdx = full.indexOf('{');
      const skeleton = (kind === 'interface' || kind === 'type' || sigIdx === -1 || end - i < 4)
        ? full
        : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
      blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
      if (kind !== 'class' && kind !== 'module') i = end;
    }
  }

  if (blocks.length === 0 && lines.length > 0) {
    const name = path.basename(fileName || ('file' + e));
    const full = code;
    const skeleton = lines.length > 25 ? lines.slice(0, 20).join('\\n') + \`\\n/* ... \${lines.length - 20} lines folded ... */\` : full;
    blocks.push({ name, kind: 'module', startLine: 1, endLine: lines.length, full, skeleton });
  }
  return blocks;
}

const files = walk(targetRoot);
const terms = expandQueryTerms(query);
const allRawBlocks = [];
for (const filePath of files) {
  try {
    const buf = fs.readFileSync(filePath);
    if (isBinaryBuffer(buf)) continue;
    const content = buf.toString('utf8');
    const relPath = path.relative(targetRoot, filePath);
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

// True Call Graph (SymbolMap + Word-Boundary Call Matching + BFS maxHops)
const symbolMap = new Map();
for (let i = 0; i < scored.length; i++) {
  const b = scored[i];
  if (b.name && b.kind !== 'module' && !CONTROL_WORDS.has(b.name)) {
    if (!symbolMap.has(b.name)) symbolMap.set(b.name, []);
    symbolMap.get(b.name).push(i);
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
      if (new RegExp('\\\\b' + esc + '\\\\s*\\\\(', 'm').test(maskedCaller)) {
        for (const t of (symbolMap.get(sym) || [])) {
          callAdj[i].add(t);
          callAdj[t].add(i);
        }
      }
    }
  }
}
const hopDistances = new Map();
const bfsQ = [];
for (let i = 0; i < scored.length; i++) {
  if (scored[i].score > 0 && bfsQ.length < 3) {
    bfsQ.push(i);
    hopDistances.set(i, 0);
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
    out.push(\`  <!-- FULL: \${item.filePath}:\${item.startLine}-\${item.endLine} (\${item.rawTokens} tokens) -->\`);
    out.push(item.full);
  } else if (item.skelTokens <= remaining && curDir + item.skelTokens <= maxDirBudget) {
    const linked = (hop !== undefined && hop <= ${maxHops}) || item.score > 0;
    if (linked || i < 12) {
      remaining -= item.skelTokens;
      dirBudgetUsed[topDir] = curDir + item.skelTokens;
      includedIds.add(key);
      out.push(\`  <!-- SKELETON: \${item.filePath}:\${item.startLine}-\${item.endLine} (\${item.skelTokens} tokens) -->\`);
      out.push(item.skeleton);
    } else {
      candidateItems.push(item);
    }
  } else {
    candidateItems.push(item);
  }
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
      const end = findBraceEnd(lines, i);
      const full = lines.slice(i, end + 1).join('\\n');
      const sigIdx = full.indexOf('{');
      const skeleton = (kind === 'interface' || kind === 'type' || sigIdx === -1 || end - i < 4)
        ? full
        : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
      blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
      if (kind !== 'class' && kind !== 'module') i = end;
    }
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
    if (cached && cached.mtime === mtime) {
      items = cached.items;
      parserMode = cached.parserMode || 'regex';
    } else {
      const rawBuf = fs.readFileSync(f);
      if (isBinaryBuffer(rawBuf)) continue;
      const raw = rawBuf.toString('utf8');
      const ext = path.extname(f);
      const tsBlocks = await extractBlocksWithTreeSitter(raw, ext, rel);
      if (tsBlocks && tsBlocks.length > 0) {
        items = tsBlocks;
        parserMode = 'tree-sitter-wasm';
      } else {
        items = extractBlocks(raw, ext, rel);
        parserMode = 'state-machine-regex';
      }
      FILE_CACHE.set(f, { mtime, parserMode, items });
    }

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
  return allBlocks;
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

async function expandSkeletonCluster(symbols, projectPath, budget = ${config.budgetTokens}, subPath) {
  try {
    const { root, scanRoot } = resolveScanRoot(projectPath, subPath);
    const wanted = new Set((symbols || []).map((s) => String(s).toLowerCase()));
    const blocks = await collectProjectBlocks(root, scanRoot);
    let used = 0;
    const expanded = [];
    for (const b of blocks) {
      const match = wanted.has(b.name.toLowerCase()) || [...wanted].some((w) => b.name.toLowerCase().includes(w) || b.rel.toLowerCase().includes(w));
      if (match && used + b.rawTk <= budget) {
        used += b.rawTk;
        expanded.push(\`// [\${b.rel}:\${b.startLine}-\${b.endLine}] [MCP: expand_skeleton_cluster]\\n\${b.full}\`);
      }
    }
    return \`<skeleton_expansion root="\${root}" subPath="\${subPath || ''}" expanded="\${expanded.length}" used="\${used}">\\n\${expanded.join('\\n\\n')}\\n</skeleton_expansion>\`;
  } catch (err) {
    return \`Error: \${err.message}\`;
  }
}

async function sliceProject(query, projectPath, budget = ${config.budgetTokens}, autoExpand = true, subPath) {
  try {
    const { root, scanRoot } = resolveScanRoot(projectPath, subPath);
    const terms = expandQueryTerms(String(query));
    const blocks = await collectProjectBlocks(root, scanRoot);
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

    // 構建專案 SymbolMap 與基於單字邊界正則 (\\bname\\s*\\() 的真實函式呼叫依賴圖 (True Call Graph)
    const symbolMap = new Map();
    for (let idx = 0; idx < allBlocks.length; idx++) {
      const b = allBlocks[idx];
      if (b.name && b.kind !== 'module' && !CONTROL_WORDS.has(b.name)) {
        if (!symbolMap.has(b.name)) symbolMap.set(b.name, []);
        symbolMap.get(b.name).push(idx);
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
          const callRe = new RegExp('\\\\b' + esc + '\\\\s*\\\\(', 'm');
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
    const hopDistances = new Map();
    for (let i = 0; i < allBlocks.length; i++) {
      if (allBlocks[i].score > 0 && focalIndices.length < 3) {
        focalIndices.push(i);
        hopDistances.set(i, 0);
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
        fullChunks.push(\`// [\${b.rel}:\${b.startLine}-\${b.endLine}] [\${b.parserMode}]\\n\${b.full}\`);
      } else if (used + b.skelTk <= budget && curDir + b.skelTk <= maxDirBudget) {
        const linked = (hop !== undefined && hop <= ${maxHops}) || b.score > 0;
        if (linked || i < 12) {
          used += b.skelTk;
          dirBudgetUsed[topDir] = curDir + b.skelTk;
          skelCandidates.push({ ...b, linked, hop: hop ?? null });
          includedIds.add(b.rel + ':' + b.name + '@' + b.startLine);
        } else {
          candidateItems.push(b);
        }
      } else {
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
        fullChunks.push(\`// [\${item.rel}:\${item.startLine}-\${item.endLine}] [MCP auto-expanded: \${item.lineCount} lines]\\n\${item.full}\`);
      } else {
        const hopNote = item.hop ? \` | \${item.hop}-hop\` : '';
        finalSkelChunks.push(\`// [\${item.rel}:\${item.startLine}-\${item.endLine}] (skeleton\${hopNote})\\n\${item.skeleton}\`);
      }
    }

    const omitted = candidateItems.filter(b => b.score > 0 && !includedIds.has(b.rel + ':' + b.name + '@' + b.startLine)).slice(0, 3);
    const omittedTag = omitted.length > 0
      ? \`\\n<omitted_top_matches>\\n\` + omitted.map(o => \`  <!-- Omitted: \${o.rel}:\${o.startLine} (\${o.name}, score: \${o.score.toFixed(1)}) — consider expanding -->\`).join('\\n') + \`\\n</omitted_top_matches>\`
      : '';

    const expandTag = autoExpandedNames.length > 0 ? \` autoExpanded="\${autoExpandedNames.join(',')}"\` : '';
    const subPathTag = subPath ? \` subPath="\${subPath}"\` : '';
    return \`<context_slice root="\${root}" version="${SCRIPT_VERSION}"\${subPathTag} budget="\${budget}" used="\${used}"\${expandTag}>\\n<skeletons>\\n\${finalSkelChunks.join('\\n')}\\n</skeletons>\\n<focal>\\n\${fullChunks.join('\\n\\n')}\\n</focal>\${omittedTag}\\n</context_slice>\`;
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

