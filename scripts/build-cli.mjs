#!/usr/bin/env node
/**
 * Builds standalone zero-dependency CLI & MCP single-file executables
 * from src/engine/scriptGenerators.ts into packages/cli/bin/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ENGINE_ENTRY = path.join(ROOT_DIR, 'src', 'engine', 'scriptGenerators.ts');
const PKG_DIR = path.join(ROOT_DIR, 'packages', 'cli');
const BIN_DIR = path.join(PKG_DIR, 'bin');

async function loadGenerators() {
  const result = await build({
    entryPoints: [ENGINE_ENTRY],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
  });

  const compiledJs = result.outputFiles[0]?.text;
  if (!compiledJs) {
    throw new Error('Failed to bundle src/engine/scriptGenerators.ts');
  }

  const dataUri = `data:text/javascript;base64,${Buffer.from(compiledJs, 'utf8').toString('base64')}`;
  return import(dataUri);
}

function ensureShebang(code) {
  const normalized = code.replace(/\r\n/g, '\n');
  return normalized.startsWith('#!/usr/bin/env node')
    ? normalized
    : `#!/usr/bin/env node\n${normalized}`;
}

async function main() {
  const { generateCliScript, generateThinMcpServer } = await loadGenerators();

  if (typeof generateCliScript !== 'function' || typeof generateThinMcpServer !== 'function') {
    throw new Error('scriptGenerators.ts must export generateCliScript and generateThinMcpServer');
  }

  const pkgJsonPath = path.join(PKG_DIR, 'package.json');
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  fs.mkdirSync(BIN_DIR, { recursive: true });

  const defaultConfig = {
    query: 'fix bug',
    budgetTokens: 32768,
    maxHops: 2,
    toolDir: './tools',
  };

  const cliCode = ensureShebang(generateCliScript(defaultConfig));
  const { serverCode } = generateThinMcpServer(defaultConfig);
  const mcpCode = ensureShebang(serverCode);

  const cliOut = path.join(BIN_DIR, 'ctxslice.mjs');
  const mcpOut = path.join(BIN_DIR, 'ctxslice-mcp.mjs');

  fs.writeFileSync(cliOut, cliCode, 'utf8');
  fs.writeFileSync(mcpOut, mcpCode, 'utf8');
  fs.chmodSync(cliOut, 0o755);
  fs.chmodSync(mcpOut, 0o755);

  const rootLicense = path.join(ROOT_DIR, 'LICENSE');
  const pkgLicense = path.join(PKG_DIR, 'LICENSE');
  if (fs.existsSync(rootLicense)) {
    fs.copyFileSync(rootLicense, pkgLicense);
  }

  const cliKb = (Buffer.byteLength(cliCode, 'utf8') / 1024).toFixed(1);
  const mcpKb = (Buffer.byteLength(mcpCode, 'utf8') / 1024).toFixed(1);

  console.log(`[build:cli] Built ${pkgJson.name}@${pkgJson.version}`);
  console.log(`  - ${path.relative(ROOT_DIR, cliOut)} (${cliKb} KB, mode 755)`);
  console.log(`  - ${path.relative(ROOT_DIR, mcpOut)} (${mcpKb} KB, mode 755)`);
}

main().catch((err) => {
  console.error('[build:cli] Build failed:', err);
  process.exit(1);
});
