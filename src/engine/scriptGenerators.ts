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

export function generateCliScript(config: GeneratorConfig): string {
  const safeQuery = (config.query || 'fix bug').replace(/"/g, '\\"');
  const toolDir = normalizeToolDir(config.toolDir);
  return `#!/usr/bin/env node
/**
 * ctxslice.mjs — Zero-Config Multi-Language Local AST Context Pre-Compiler (v0.2.0)
 * Features: Path Disambiguation, TF-IDF Scarcity Weighting, Omitted Top Matches Summary
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
const rootFlag = args.indexOf('--root');
const targetRoot = rootFlag !== -1 && args[rootFlag + 1] ? path.resolve(args[rootFlag + 1]) : process.cwd();
const budgetFlag = args.indexOf('--budget');
const budget = budgetFlag !== -1 ? Number(args[budgetFlag + 1]) : ${config.budgetTokens};
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

function skeletonizeCode(code, ext) {
  const e = ext.toLowerCase();
  if (e === '.py' || e === '.pyw') {
    return code.replace(
      /^((?:async\\s+)?def\\s+[A-Za-z_][A-Za-z0-9_]*\\s*\\([^)]*\\)[^:]*:)\\n(?:[ \\t]+.*\\n?)+/gm,
      (_, sig) => \`\${sig}\\n    # ... body folded\\n\`
    );
  }
  if (e === '.go') {
    return code.replace(
      /^(func[ \\t]+(?:\\([^)]+\\)[ \\t]+)?[A-Za-z_][A-Za-z0-9_]*[ \\t]*\\([^)]*\\)[^{\\n]*)\\{[\\s\\S]*?^\\}/gm,
      (_, sig) => \`\${sig.trim()} { /* ... body folded ... */ }\`
    );
  }
  const folded = code.replace(
    /^((?:export\\s+|public\\s+|private\\s+|protected\\s+|internal\\s+|static\\s+|async\\s+|pub\\s+)*(?:function|func|fn|def)\\s+[A-Za-z0-9_$:]+\\s*\\([^)]*\\)[^{\\n]*)\\{[\\s\\S]*?^\\}/gm,
    (_, sig) => \`\${sig.trim()} { /* ... body folded ... */ }\`
  );
  if (estimateTokens(folded) >= estimateTokens(code) * 0.9) {
    const lines = code.split('\\n');
    if (lines.length > 24) {
      return lines.slice(0, 20).join('\\n') + \`\\n/* ... \${lines.length - 20} lines folded ... */\`;
    }
  }
  return folded;
}

const files = walk(targetRoot);
const terms = expandQueryTerms(query);
const fileContents = new Map();
for (const filePath of files) {
  try {
    const buf = fs.readFileSync(filePath);
    if (isBinaryBuffer(buf)) continue;
    fileContents.set(filePath, buf.toString('utf8'));
  } catch {}
}

const validFiles = Array.from(fileContents.keys());
const totalFiles = Math.max(1, validFiles.length);
const termDF = {};
for (const t of terms) {
  let df = 0;
  for (const [filePath, content] of fileContents.entries()) {
    if (content.toLowerCase().includes(t) || filePath.toLowerCase().includes(t)) {
      df++;
    }
  }
  termDF[t] = Math.max(1, df);
}

const scored = validFiles.map((filePath) => {
  const relPath = path.relative(targetRoot, filePath);
  const content = fileContents.get(filePath);
  const lower = content.toLowerCase();
  const relLower = relPath.toLowerCase();
  let score = 0;
  for (const t of terms) {
    const df = termDF[t] || 1;
    const idf = Math.log(1 + (totalFiles / df));
    const scarcityMultiplier = (df / totalFiles > 0.3) ? 0.35 : (df / totalFiles > 0.15) ? 0.7 : 1.25;
    // Path Disambiguation: extra boost if directory path hierarchy matches query terms (e.g. backend/ vs frontend/)
    const pathMatch = relLower.includes(t) ? 25 : 0;
    const bodyOcc = lower.split(t).length - 1;
    const bodyScore = Math.min(15, 3 * Math.log1p(bodyOcc));
    score += (pathMatch + bodyScore) * idf * scarcityMultiplier;
  }
  return { filePath: relPath, ext: path.extname(filePath), content, score, tokens: estimateTokens(content) };
}).filter(Boolean).sort((a, b) => b.score - a.score);

let remaining = budget;
const out = ['<context_slice root="' + path.basename(targetRoot) + '" budget="' + budget + '">'];
const includedPaths = new Set();
const dirBudgetUsed = {};
const maxDirBudget = budget * 0.65;

const candidateItems = [];
for (let i = 0; i < scored.length; i++) {
  const item = scored[i];
  const topDir = item.filePath.split(path.sep)[0] || 'root';
  const curDir = dirBudgetUsed[topDir] || 0;

  if (i < 2 && item.tokens <= remaining && curDir + item.tokens <= maxDirBudget) {
    remaining -= item.tokens;
    dirBudgetUsed[topDir] = curDir + item.tokens;
    includedPaths.add(item.filePath);
    out.push(\`  <!-- FULL: \${item.filePath} (\${item.tokens} tokens) -->\`);
    out.push(item.content);
  } else {
    const skel = skeletonizeCode(item.content, item.ext);
    const skelTokens = estimateTokens(skel);
    if (skelTokens <= remaining && curDir + skelTokens <= maxDirBudget) {
      remaining -= skelTokens;
      dirBudgetUsed[topDir] = curDir + skelTokens;
      includedPaths.add(item.filePath);
      out.push(\`  <!-- SKELETON: \${item.filePath} (\${skelTokens} tokens) -->\`);
      out.push(skel);
    } else {
      candidateItems.push(item);
    }
  }
}

// Omitted Top Matches Summary (top 3 high relevance items omitted due to budget/diversity cap)
const omitted = candidateItems.filter(item => item.score > 0 && !includedPaths.has(item.filePath)).slice(0, 3);
if (omitted.length > 0) {
  out.push('<omitted_top_matches>');
  for (const o of omitted) {
    out.push(\`  <!-- Omitted: \${o.filePath} (score: \${o.score.toFixed(1)}) — consider expanding -->\`);
  }
  out.push('</omitted_top_matches>');
}

out.push('</context_slice>');
process.stdout.write(out.join('\\n') + '\\n');
`;
}

export function generateZeroMcpDesktopConfig(config: GeneratorConfig): {
  microRule: string;
  piSkill: string;
  watchCommand: string;
} {
  const safeQuery = config.query || 'active task';
  const toolDir = normalizeToolDir(config.toolDir);
  const cliPath = `${toolDir}/ctxslice.mjs`;
  const microRule = `# Global Rule:
When inspecting, debugging, or modifying code in ANY project, ALWAYS run \`node ${cliPath} "<keywords>"\` via bash/terminal in the current working directory first BEFORE reading raw files.`;

  const piSkill = `---
name: context-slice
description: Global out-of-band multi-language AST code slicing for any active project
---
Run \`node ${cliPath} "$ARGUMENTS" --budget ${config.budgetTokens}\` via bash in the current project directory.`;

  const watchCommand = `node ${cliPath} "${safeQuery}" --budget ${config.budgetTokens}`;

  return { microRule, piSkill, watchCommand };
}

export function generateThinMcpServer(config: GeneratorConfig): {
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
  const serverCode = `#!/usr/bin/env node
/**
 * ctxslice-mcp.mjs — Global Multi-Language MCP Server v0.2.0
 * Features: Path Disambiguation, TF-IDF Scarcity Weighting, subPath Sandbox, In-Memory mtime Cache, Omitted Summary
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

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
  description: 'PRIMARY code-reading tool with path disambiguation, TF-IDF scarcity weighting & omitted summary.',
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

// Pure in-memory mtime cache: Map<filePath, { mtime: number, items: Array<...> }>
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

function findBraceEnd(lines, startIdx) {
  let depth = 0, opened = false, end = startIdx;
  for (let j = startIdx; j < lines.length; j++) {
    for (const ch of lines[j]) {
      if (ch === '{') { depth++; opened = true; }
      else if (ch === '}') depth--;
    }
    end = j;
    if (opened && depth <= 0) break;
    if (!opened && lines[j].trim().endsWith(';')) break;
  }
  return end;
}

function extractBlocks(code, ext) {
  const e = (ext || '').toLowerCase();
  const lines = code.split('\\n');
  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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

    m = line.match(/^(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?(function|class|interface|type|enum|const)\\s+([A-Za-z0-9_$]+)/);
    if (m) {
      name = m[2];
      kind = m[1];
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
  return blocks;
}

function collectProjectBlocks(root, scanRoot) {
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
    if (cached && cached.mtime === mtime) {
      items = cached.items;
    } else {
      const rawBuf = fs.readFileSync(f);
      if (isBinaryBuffer(rawBuf)) continue;
      const raw = rawBuf.toString('utf8');
      const blocks = extractBlocks(raw, path.extname(f));
      items = blocks.length > 0 ? blocks : [{ name: path.basename(rel), kind: 'module', startLine: 1, endLine: raw.split('\\n').length, full: raw, skeleton: raw.slice(0, 400) }];
      FILE_CACHE.set(f, { mtime, items });
    }

    for (const b of items) {
      allBlocks.push({
        ...b,
        rel,
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

function expandSkeletonCluster(symbols, projectPath, budget = ${config.budgetTokens}, subPath) {
  try {
    const { root, scanRoot } = resolveScanRoot(projectPath, subPath);
    const wanted = new Set((symbols || []).map((s) => String(s).toLowerCase()));
    const blocks = collectProjectBlocks(root, scanRoot);
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

function sliceProject(query, projectPath, budget = ${config.budgetTokens}, autoExpand = true, subPath) {
  try {
    const { root, scanRoot } = resolveScanRoot(projectPath, subPath);
    const terms = expandQueryTerms(String(query));
    const blocks = collectProjectBlocks(root, scanRoot);
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
        // Path Disambiguation: extra boost if directory path hierarchy matches query terms (e.g. backend/ vs frontend/)
        const pathMatch = relLower.includes(t) ? 25 : 0;
        const bodyOcc = lower.split(t).length - 1;
        const bodyScore = Math.min(12, 2.5 * Math.log1p(bodyOcc));
        score += (nameMatch + pathMatch + bodyScore) * idf * scarcityMultiplier;
      }
      return { ...b, score };
    }).sort((a, b) => b.score - a.score);

    let used = 0;
    const fullChunks = [];
    const skelCandidates = [];
    const focalNames = new Set();
    const includedIds = new Set();
    const candidateItems = [];
    const dirBudgetUsed = {};
    const maxDirBudget = budget * 0.65; // Directory quota cap: max 65% per top-level folder

    for (let i = 0; i < allBlocks.length; i++) {
      const b = allBlocks[i];
      const topDir = b.rel.split(path.sep)[0] || 'root';
      const curDir = dirBudgetUsed[topDir] || 0;

      const isFocal = i < 3 && b.score > 0;
      if (isFocal && used + b.rawTk <= budget && curDir + b.rawTk <= maxDirBudget) {
        used += b.rawTk;
        dirBudgetUsed[topDir] = curDir + b.rawTk;
        focalNames.add(b.name);
        includedIds.add(b.name + '@' + b.startLine);
        fullChunks.push(\`// [\${b.rel}:\${b.startLine}-\${b.endLine}]\\n\${b.full}\`);
      } else if (used + b.skelTk <= budget && curDir + b.skelTk <= maxDirBudget) {
        const linked = b.score > 0 || [...focalNames].some((fn) => b.full.includes(fn));
        if (linked || i < 12) {
          used += b.skelTk;
          dirBudgetUsed[topDir] = curDir + b.skelTk;
          skelCandidates.push({ ...b, linked });
          includedIds.add(b.name + '@' + b.startLine);
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
        finalSkelChunks.push(\`// [\${item.rel}:\${item.startLine}-\${item.endLine}] (skeleton)\\n\${item.skeleton}\`);
      }
    }

    // Collect Omitted Top Matches Summary
    const omitted = candidateItems.filter(b => b.score > 0 && !includedIds.has(b.name + '@' + b.startLine)).slice(0, 3);
    const omittedTag = omitted.length > 0
      ? \`\\n<omitted_top_matches>\\n\` + omitted.map(o => \`  <!-- Omitted: \${o.rel}:\${o.startLine} (\${o.name}, score: \${o.score.toFixed(1)}) — consider expanding -->\`).join('\\n') + \`\\n</omitted_top_matches>\`
      : '';

    const expandTag = autoExpandedNames.length > 0 ? \` autoExpanded="\${autoExpandedNames.join(',')}"\` : '';
    const subPathTag = subPath ? \` subPath="\${subPath}"\` : '';
    return \`<context_slice root="\${root}"\${subPathTag} budget="\${budget}" used="\${used}"\${expandTag}>\\n<skeletons>\\n\${finalSkelChunks.join('\\n')}\\n</skeletons>\\n<focal>\\n\${fullChunks.join('\\n\\n')}\\n</focal>\${omittedTag}\\n</context_slice>\`;
  } catch (err) {
    return \`Error: \${err.message}\`;
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
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
      serverInfo: { name: 'ctxslice-thin', version: '0.2.0' }
    });
  }
  if (req.method === 'ping') return send({});
  if (req.method === 'tools/list') return send({ tools: [TOOL_DEF, EXPAND_TOOL_DEF] });
  if (req.method === 'tools/call' && req.params?.name === 'get_context_slice') {
    try {
      const { query, projectPath, budget, autoExpand, subPath } = req.params.arguments || {};
      return send({ content: [{ type: 'text', text: sliceProject(query, projectPath, budget, autoExpand !== false, subPath) }] });
    } catch (err) {
      return send({ isError: true, content: [{ type: 'text', text: String(err?.message || err) }] });
    }
  }
  if (req.method === 'tools/call' && req.params?.name === 'expand_skeleton_cluster') {
    try {
      const { symbols, projectPath, budget, subPath } = req.params.arguments || {};
      return send({ content: [{ type: 'text', text: expandSkeletonCluster(symbols, projectPath, budget, subPath) }] });
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
