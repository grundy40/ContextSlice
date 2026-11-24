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

export function generateCliScript(config: GeneratorConfig): string {
  const safeQuery = (config.query || 'fix bug').replace(/"/g, '\\"');
  const toolDir = normalizeToolDir(config.toolDir);
  return `#!/usr/bin/env node
/**
 * ctxslice.mjs — Zero-Config Multi-Language Local AST Context Pre-Compiler
 * Supports any text-based code file; deep skeletonizing for TS/JS, Python, Go, C/C++, Swift, PHP, HTML/Vue/Svelte, CSS, Rust, Java/Kotlin, C#, Ruby, SQL
 * Usage:
 *   node ${toolDir}/ctxslice.mjs "${safeQuery}" --budget ${config.budgetTokens} --hops ${config.maxHops}
 *   node ${toolDir}/ctxslice.mjs "${safeQuery}" --root /path/to/your-project --budget ${config.budgetTokens}
 */
import fs from 'node:fs';
import path from 'node:path';

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
const NOISE_FILE = /(^|\\/)(package-lock\\.json|npm-shrinkwrap\\.json|yarn\\.lock|pnpm-lock\\.yaml|Cargo\\.lock|poetry\\.lock|Gemfile\\.lock|composer\\.lock|go\\.sum|Podfile\\.lock|packages\\.lock\\.json)$|\\.min\\.(js|mjs|cjs|css)$|\\.map$/i;

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
  if (e === '.html' || e === '.htm' || e === '.vue' || e === '.svelte') {
    return code.replace(
      /^([ \\t]*<(script|style|section|main|nav|header|footer|form|template)(?:\\s[^>]*)?>)[\\s\\S]*?^\\1?<\\/\\2>/gim,
      (full) => {
        const lines = full.split('\\n');
        return lines.length > 6 ? \`\${lines[0]}\\n  <!-- ... \${lines.length - 2} lines folded -->\\n\${lines[lines.length - 1]}\` : full;
      }
    );
  }
  const folded = code.replace(
    /^((?:export\\s+|public\\s+|private\\s+|protected\\s+|internal\\s+|static\\s+|async\\s+|pub\\s+)*(?:function|func|fn|def)\\s+[A-Za-z0-9_$:]+\\s*\\([^)]*\\)[^{\\n]*)\\{[\\s\\S]*?^\\}/gm,
    (_, sig) => \`\${sig.trim()} { /* ... body folded ... */ }\`
  );
  // Fallback for languages the regexes cannot fold (end-based like Lua/Ruby, etc.):
  // if folding did not shrink the code, truncate long files to their head lines.
  if (estimateTokens(folded) >= estimateTokens(code) * 0.9) {
    const lines = code.split('\\n');
    if (lines.length > 24) {
      const cmt = (e === '.lua') ? '--' : (e === '.py' || e === '.pyw' || e === '.rb' || e === '.sh') ? '#' : '*';
      const openC = cmt === '*' ? '/*' : cmt;
      const closeC = cmt === '*' ? '*/' : '';
      return lines.slice(0, 20).join('\\n') + \`\\n\${openC} ... \${lines.length - 20} lines folded ... \${closeC}\`;
    }
  }
  return folded;
}

const files = walk(targetRoot);
const terms = query.toLowerCase().split(/\\s+/).filter(Boolean);
const scored = files.map((filePath) => {
  const buf = fs.readFileSync(filePath);
  if (isBinaryBuffer(buf)) return null;
  const content = buf.toString('utf8');
  const lower = content.toLowerCase();
  const score = terms.reduce((s, t) => s + (lower.split(t).length - 1) * 4 + (filePath.toLowerCase().includes(t) ? 12 : 0), 0);
  return { filePath: path.relative(targetRoot, filePath), ext: path.extname(filePath), content, score, tokens: estimateTokens(content) };
}).filter(Boolean).sort((a, b) => b.score - a.score);

let remaining = budget;
const out = ['<context_slice root="' + path.basename(targetRoot) + '" budget="' + budget + '">'];
for (let i = 0; i < scored.length; i++) {
  const item = scored[i];
  if (i < 2 && item.tokens <= remaining) {
    out.push(\`  <!-- FULL: \${item.filePath} (\${item.tokens} tokens) -->\`);
    out.push(item.content);
    remaining -= item.tokens;
  } else {
    const skel = skeletonizeCode(item.content, item.ext);
    const skelTokens = estimateTokens(skel);
    if (skelTokens <= remaining) {
      out.push(\`  <!-- SKELETON: \${item.filePath} (\${skelTokens} tokens) -->\`);
      out.push(skel);
      remaining -= skelTokens;
    }
  }
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
  const microRule = `# 全域放一次即可：
# - OpenCode: ~/.config/opencode/AGENTS.md
# - Pi Agent: ~/.pi/agent/AGENTS.md
# - Claude Code: ~/.claude/CLAUDE.md
When inspecting, debugging, or modifying code in ANY project, ALWAYS run \`node ${cliPath} "<keywords>"\` via bash/terminal in the current working directory first BEFORE reading raw files.
Do NOT read entire raw files unless a needed implementation body is folded in the slice.`;

  const piSkill = `---
name: context-slice
description: Global out-of-band multi-language AST code slicing for any active project
---
Run \`node ${cliPath} "$ARGUMENTS" --budget ${config.budgetTokens}\` via bash in the current project directory.`;

  const watchCommand = `# 只需在電腦固定資料夾放 1 次腳本（所有專案共用，進到哪個資料夾就切哪個專案）
# 支援 TS/JS, Python, Go, C/C++, Swift, PHP, HTML/CSS, Rust, Java, C#, Ruby, SQL
node ${cliPath} "${safeQuery}" --budget ${config.budgetTokens}

# 或跨目錄直接指定目標專案資料夾：
node ${cliPath} "${safeQuery}" --root /path/to/project --budget ${config.budgetTokens}`;

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
 * ctxslice-mcp.mjs — Global Multi-Language, Multi-Project 1-Tool MCP Server (~195 Tokens Schema Tax)
 * Supports any text-based code file; deep skeletonizing for TS/JS, Python, Go, C/C++, Swift, PHP, HTML/Vue/Svelte, CSS, Rust, Java/Kotlin, C#, Ruby, SQL
 * Install ONCE in a shared folder (e.g. ${mcpPath}).
 * Agents call get_context_slice automatically with projectPath + query.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const TOOL_DEF = {
  name: 'get_context_slice',
  description:
    'PRIMARY code-reading tool. ALWAYS invoke this automatically BEFORE reading raw source files whenever the user asks about, debugs, or modifies code in a local project. Automatically detects high-complexity code clusters and expands critical skeletons within token budget.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Task or symbol keywords (prefer English identifiers or mixed terms)' },
      projectPath: { type: 'string', description: 'Absolute path to target project folder (e.g. D:\\\\src\\\\my-project)' },
      budget: { type: 'number', description: 'Max token budget (default ${config.budgetTokens})' },
      autoExpand: { type: 'boolean', description: 'Auto-expand high-complexity skeleton clusters to resolve context gaps (default true)' }
    },
    required: ['query']
  }
};

const EXPAND_TOOL_DEF = {
  name: 'expand_skeleton_cluster',
  description:
    'Skeleton Expansion MCP tool. Triggered automatically or on demand to expand folded high-complexity symbol clusters into full source implementations when context gaps are detected.',
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      symbols: { type: 'array', items: { type: 'string' }, description: 'Symbol or file names of the high-complexity cluster to expand' },
      projectPath: { type: 'string', description: 'Absolute path to target project folder' },
      budget: { type: 'number', description: 'Max token budget for expanded code (default ${config.budgetTokens})' }
    },
    required: ['symbols']
  }
};

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  'venv', '.venv', '__pycache__', 'vendor', 'target', '.build', '.swiftpm', 'DerivedData', 'Pods', 'bin', 'obj'
]);

const BINARY_EXT_RE = /\\.(png|jpe?g|gif|webp|bmp|ico|icns|tiff?|svg|mp4|mov|avi|mkv|webm|wmv|flv|mp3|wav|ogg|flac|aac|m4a|wma|zip|rar|7z|tar|gz|bz2|xz|tgz|iso|dmg|exe|dll|so|dylib|bin|o|a|obj|lib|wasm|class|jar|war|pyc|pyo|ttf|otf|woff2?|eot|pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|db|sqlite3?|mdb|psd|ai|sketch|fig|xd|blend|fbx|glb|gltf)$/i;
const NOISE_FILE_RE = /(^|\\/)(package-lock\\.json|npm-shrinkwrap\\.json|yarn\\.lock|pnpm-lock\\.yaml|Cargo\\.lock|poetry\\.lock|Gemfile\\.lock|composer\\.lock|go\\.sum|Podfile\\.lock|packages\\.lock\\.json)$|\\.min\\.(js|mjs|cjs|css)$|\\.map$/i;
const CONTROL_WORDS = new Set(['if', 'else', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'typeof', 'do', 'try']);

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

  // 1. Python (.py, .pyw)
  if (e === '.py' || e === '.pyw') {
    const pyRe = /^(async\\s+def|def|class)\\s+([A-Za-z_][A-Za-z0-9_]*)/;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(pyRe);
      if (!m) continue;
      let end = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '' || /^\\s+/.test(lines[j])) end = j;
        else break;
      }
      while (end > i && lines[end].trim() === '') end--;
      const full = lines.slice(i, end + 1).join('\\n');
      const skeleton = end - i > 2 ? \`\${lines[i]}\\n    # ... \${end - i} lines folded\` : full;
      blocks.push({ name: m[2], kind: m[1] === 'class' ? 'class' : 'function', startLine: i + 1, endLine: end + 1, full, skeleton });
      i = end;
    }
    return blocks;
  }

  // 2. Ruby (.rb)
  if (e === '.rb') {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\\s*)(def|class|module)\\s+([A-Za-z_][A-Za-z0-9_.:!?]*)/);
      if (!m) continue;
      const baseIndent = m[1].length;
      let end = i;
      for (let j = i + 1; j < lines.length; j++) {
        const em = lines[j].match(/^(\\s*)end\\b/);
        end = j;
        if (em && em[1].length <= baseIndent) break;
      }
      const full = lines.slice(i, end + 1).join('\\n');
      const skeleton = end - i > 3 ? \`\${lines[i]}\\n\${m[1]}  # ... \${end - i - 1} lines folded\\n\${m[1]}end\` : full;
      blocks.push({ name: m[3], kind: m[2] === 'def' ? 'function' : 'class', startLine: i + 1, endLine: end + 1, full, skeleton });
    }
    return blocks;
  }

  // 3. HTML / Vue / Svelte
  if (e === '.html' || e === '.htm' || e === '.vue' || e === '.svelte') {
    const tagRe = /^([ \\t]*)<(head|header|nav|main|section|article|form|template|footer|script|style|div)(?:\\s+([^>]*))?>/i;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(tagRe);
      if (!m) continue;
      const tag = m[2].toLowerCase();
      const attrs = m[3] || '';
      const idMatch = attrs.match(/\\bid=["']([^"']+)["']/i);
      if (tag === 'div' && !idMatch) continue;
      if (tag === 'script' && /\\bsrc=/.test(attrs)) continue;
      const openRe = new RegExp(\`<\${tag}(?:\\\\s|>)\`, 'gi');
      const closeRe = new RegExp(\`</\${tag}>\`, 'gi');
      let depth = 0, end = i;
      for (let j = i; j < lines.length; j++) {
        depth += (lines[j].match(openRe)?.length || 0) - (lines[j].match(closeRe)?.length || 0);
        end = j;
        if (depth <= 0) break;
      }
      const full = lines.slice(i, end + 1).join('\\n');
      const name = idMatch ? \`<\${tag}#\${idMatch[1]}>\` : \`<\${tag}>\`;
      const skeleton = end - i > 4 ? \`\${lines[i]}\\n  <!-- ... \${end - i - 1} lines folded -->\\n</\${tag}>\` : full;
      blocks.push({ name, kind: tag === 'script' ? 'module' : 'type', startLine: i + 1, endLine: end + 1, full, skeleton });
      i = end;
    }
    return blocks;
  }

  // 4. SQL (.sql)
  if (e === '.sql') {
    const sqlRe = /^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(TABLE|VIEW|FUNCTION|PROCEDURE|TRIGGER)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?([A-Za-z0-9_."\`]+)/i;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(sqlRe);
      if (!m) continue;
      let end = i;
      for (let j = i; j < lines.length; j++) {
        end = j;
        if (lines[j].includes(';')) break;
      }
      const full = lines.slice(i, end + 1).join('\\n');
      const skeleton = end - i > 5 ? \`\${lines[i]}\\n  -- ... \${end - i} lines folded\` : full;
      blocks.push({ name: m[2].replace(/["\`]/g, ''), kind: 'type', startLine: i + 1, endLine: end + 1, full, skeleton });
      i = end;
    }
    return blocks;
  }

  // 5. Brace-delimited languages (TS/JS, Go, C/C++, Swift, PHP, Rust, Java/Kotlin, C#, CSS)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let name = null;
    let kind = 'function';
    let m = null;

    if (e === '.go') {
      m = line.match(/^(?:func[ \\t]+(?:\\([^)]+\\)[ \\t]+)?([A-Za-z_][A-Za-z0-9_]*)|type[ \\t]+([A-Za-z_][A-Za-z0-9_]*)[ \\t]+(?:struct|interface)\\b)/);
      if (m) { name = m[1] || m[2]; kind = m[1] ? 'function' : 'type'; }
    } else if (e === '.swift') {
      m = line.match(/^(?:@[A-Za-z_][A-Za-z0-9_]*(?:\\([^)]*\\))?[ \\t]+)*(?:(?:public|private|internal|open|fileprivate|final|static|class|override|mutating|async|throws)[ \\t]+)*(func|class|struct|enum|protocol|extension|actor)[ \\t]+([A-Za-z_][A-Za-z0-9_]*)/);
      if (m) { name = m[2]; kind = m[1] === 'func' ? 'function' : m[1] === 'protocol' ? 'interface' : 'class'; }
    } else if (e === '.php' || e === '.phtml') {
      m = line.match(/^[ \\t]*(?:(?:abstract|final|public|protected|private|static)[ \\t]+)*(function|class|interface|trait|enum)[ \\t]+([A-Za-z_][A-Za-z0-9_]*)/);
      if (m) { name = m[2]; kind = m[1] === 'function' ? 'function' : m[1] === 'interface' ? 'interface' : 'class'; }
    } else if (e === '.rs') {
      m = line.match(/^(?:pub(?:\\([^)]+\\))?[ \\t]+)?(?:async[ \\t]+)?(fn|struct|enum|trait|impl(?:<[^>]+>)?)[ \\t]+([A-Za-z_][A-Za-z0-9_]*)/);
      if (m) { name = m[2]; kind = m[1] === 'fn' ? 'function' : m[1] === 'trait' ? 'interface' : 'type'; }
    } else if (e === '.c' || e === '.h' || e === '.cpp' || e === '.cc' || e === '.cxx' || e === '.hpp' || e === '.hh') {
      const tm = line.match(/^(?:typedef[ \\t]+)?(struct|class|enum(?:[ \\t]+class)?|namespace)[ \\t]+([A-Za-z_][A-Za-z0-9_]*)/);
      if (tm && line.includes('{')) {
        name = tm[2]; kind = tm[1].startsWith('class') ? 'class' : 'type';
      } else {
        const fm = line.match(/^([A-Za-z_~][A-Za-z0-9_:<>*& \\t]*?)[ \\t]+([A-Za-z_~][A-Za-z0-9_:]*(?:::[A-Za-z_~][A-Za-z0-9_]*)?)[ \\t]*\\([^;{}]*\\)[ \\t]*(?:const[ \\t]*)?(?:noexcept[ \\t]*)?(?:override[ \\t]*)?\\{/);
        if (fm) {
          const shortN = fm[2].includes('::') ? fm[2].split('::').pop() : fm[2];
          if (!CONTROL_WORDS.has(shortN)) { name = fm[2]; kind = 'function'; }
        }
      }
    } else if (e === '.java' || e === '.kt' || e === '.kts' || e === '.cs') {
      m = line.match(/^[ \\t]*(?:(?:public|private|protected|internal|static|final|abstract|override|virtual|async|sealed|data|open|suspend)[ \\t]+)*(class|interface|enum|record|struct|fun|[A-Za-z_][A-Za-z0-9_<>\\[\\]?]*)[ \\t]+([A-Za-z_][A-Za-z0-9_]*)[ \\t]*(?:\\([^;{]*\\))?[^{;\\n]*\\{/);
      if (m && !CONTROL_WORDS.has(m[1]) && !CONTROL_WORDS.has(m[2])) {
        name = m[2];
        kind = ['class', 'interface', 'enum', 'record', 'struct'].includes(m[1]) ? m[1] : 'function';
      }
    } else if (e === '.css' || e === '.scss') {
      m = line.match(/^(@media[^{]+|@keyframes\\s+[A-Za-z0-9_-]+|:root|[.#A-Za-z_][^\\n{;]{1,64})\\{/);
      if (m) { name = m[1].trim(); kind = 'type'; }
    } else {
      m = line.match(/^(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?(function|class|interface|type|enum|const)\\s+([A-Za-z0-9_$]+)/);
      if (m) { name = m[2]; kind = m[1]; }
    }

    if (!name) continue;
    const end = findBraceEnd(lines, i);
    const full = lines.slice(i, end + 1).join('\\n');
    const sigIdx = full.indexOf('{');
    const skeleton = (kind === 'interface' || kind === 'type' || sigIdx === -1 || end - i < 4)
      ? full
      : full.slice(0, sigIdx).trim() + \` { /* ... \${end - i - 1} lines folded */ }\`;
    blocks.push({ name, kind, startLine: i + 1, endLine: end + 1, full, skeleton });
    if (kind !== 'class' && kind !== 'module') i = end;
  }
  return blocks;
}

function collectProjectBlocks(root) {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (isAcceptedFile(e.name)) files.push(full);
    }
  };
  walk(root);

  const allBlocks = [];
  for (const f of files) {
    const rel = path.relative(root, f);
    const rawBuf = fs.readFileSync(f);
    if (isBinaryBuffer(rawBuf)) continue;
    const raw = rawBuf.toString('utf8');
    const blocks = extractBlocks(raw, path.extname(f));
    const items = blocks.length > 0 ? blocks : [{ name: path.basename(rel), kind: 'module', startLine: 1, endLine: raw.split('\\n').length, full: raw, skeleton: raw.slice(0, 400) }];
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

function expandSkeletonCluster(symbols, projectPath, budget = ${config.budgetTokens}) {
  const root = projectPath ? path.resolve(projectPath) : (process.env.WORKSPACE_ROOT || process.cwd());
  if (!fs.existsSync(root)) return \`Error: projectPath not found: \${root}\`;
  const wanted = new Set((symbols || []).map((s) => String(s).toLowerCase()));
  const blocks = collectProjectBlocks(root);
  let used = 0;
  const expanded = [];
  for (const b of blocks) {
    const match = wanted.has(b.name.toLowerCase()) || [...wanted].some((w) => b.name.toLowerCase().includes(w) || b.rel.toLowerCase().includes(w));
    if (match && used + b.rawTk <= budget) {
      used += b.rawTk;
      expanded.push(\`// [\${b.rel}:\${b.startLine}-\${b.endLine}] [MCP: expand_skeleton_cluster]\\n\${b.full}\`);
    }
  }
  return \`<skeleton_expansion root="\${root}" expanded="\${expanded.length}" used="\${used}">\\n\${expanded.join('\\n\\n')}\\n</skeleton_expansion>\`;
}

function sliceProject(query, projectPath, budget = ${config.budgetTokens}, autoExpand = true) {
  const root = projectPath ? path.resolve(projectPath) : (process.env.WORKSPACE_ROOT || process.cwd());
  if (!fs.existsSync(root)) return \`Error: projectPath not found: \${root}\`;
  const terms = String(query).toLowerCase().split(/\\s+/).filter(Boolean);
  const allBlocks = collectProjectBlocks(root).map((b) => {
    const lower = b.full.toLowerCase();
    const score = terms.reduce((s, t) => s + (b.name.toLowerCase().includes(t) ? 16 : 0) + (lower.split(t).length - 1) * 3, 0);
    return { ...b, score };
  }).sort((a, b) => b.score - a.score);

  let used = 0;
  const fullChunks = [];
  const skelCandidates = [];
  const focalNames = new Set();
  for (let i = 0; i < allBlocks.length; i++) {
    const b = allBlocks[i];
    const isFocal = i < 3 && b.score > 0;
    if (isFocal && used + b.rawTk <= budget) {
      used += b.rawTk;
      focalNames.add(b.name);
      fullChunks.push(\`// [\${b.rel}:\${b.startLine}-\${b.endLine}]\\n\${b.full}\`);
    } else if (used + b.skelTk <= budget) {
      const linked = b.score > 0 || [...focalNames].some((fn) => b.full.includes(fn));
      if (linked || i < 12) {
        used += b.skelTk;
        skelCandidates.push({ ...b, linked });
      }
    }
  }

  // Automated High-Complexity Cluster Detection & Skeleton Expansion
  const autoExpandedNames = [];
  const finalSkelChunks = [];
  for (const item of skelCandidates) {
    const delta = Math.max(0, item.rawTk - item.skelTk);
    const isComplexCluster = (item.linked || item.score > 0) && (item.lineCount >= 16 || delta >= 45);
    if (autoExpand && isComplexCluster && autoExpandedNames.length < 4 && used + delta <= budget) {
      used += delta;
      autoExpandedNames.push(item.name);
      fullChunks.push(\`// [\${item.rel}:\${item.startLine}-\${item.endLine}] [MCP auto-expanded: \${item.lineCount} lines]\\n\${item.full}\`);
    } else {
      finalSkelChunks.push(\`// [\${item.rel}:\${item.startLine}-\${item.endLine}] (skeleton)\\n\${item.skeleton}\`);
    }
  }

  const expandTag = autoExpandedNames.length > 0
    ? \` autoExpanded="\${autoExpandedNames.join(',')}"\`
    : '';
  return \`<context_slice root="\${root}" budget="\${budget}" used="\${used}"\${expandTag}>\\n<skeletons>\\n\${finalSkelChunks.join('\\n')}\\n</skeletons>\\n<focal>\\n\${fullChunks.join('\\n\\n')}\\n</focal>\\n</context_slice>\`;
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
      serverInfo: { name: 'ctxslice-thin', version: '0.1.1' }
    });
  }
  if (req.method === 'ping') return send({});
  if (req.method === 'tools/list') return send({ tools: [TOOL_DEF, EXPAND_TOOL_DEF] });
  if (req.method === 'tools/call' && req.params?.name === 'get_context_slice') {
    try {
      const { query, projectPath, budget, autoExpand } = req.params.arguments || {};
      return send({ content: [{ type: 'text', text: sliceProject(query, projectPath, budget, autoExpand !== false) }] });
    } catch (err) {
      return send({ isError: true, content: [{ type: 'text', text: String(err?.message || err) }] });
    }
  }
  if (req.method === 'tools/call' && req.params?.name === 'expand_skeleton_cluster') {
    try {
      const { symbols, projectPath, budget } = req.params.arguments || {};
      return send({ content: [{ type: 'text', text: expandSkeletonCluster(symbols, projectPath, budget) }] });
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

  const hermesYamlConfig = `# ~/.hermes/config.yaml — 設定一次即可通用所有專案
mcp_servers:
  context_slice:
    command: "node"
    args: ["${mcpPath}"]
    tools:
      include: ["get_context_slice"]`;

  const autoInvokeRule = `# 貼到三套工具的全域規則（~/.config/opencode/AGENTS.md、~/.pi/agent/AGENTS.md、~/.claude/CLAUDE.md），設一次就全部自動調用！
When the user asks to inspect, explain, debug, or modify code in any project folder, ALWAYS call the \`get_context_slice\` MCP tool first (passing \`projectPath\` as the current workspace directory and English/mixed keywords) BEFORE reading raw files directly.`;

  const verifyCommand = `node -v && node -e "const s=require('child_process').spawnSync('node',['${mcpPath}'],{input:'{\\"jsonrpc\\":\\"2.0\\",\\"id\\":1,\\"method\\":\\"tools/list\\"}\\n',encoding:'utf8'});console.log(s.stdout||s.stderr)"`;

  return { serverCode, clientConfig, opencodeConfig, claudeCodeCmd, hermesYamlConfig, autoInvokeRule, verifyCommand };
}
