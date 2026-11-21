#!/usr/bin/env node
/**
 * ContextSlice Studio — 跨平台一鍵啟動腳本（支援 macOS / Linux / Windows）
 * 用法：node start.mjs  或  npm run launch
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);
const TARGET_URL = `http://localhost:${PORT}`;
const IS_WIN = process.platform === 'win32';

function isPortOpen(port, host = '127.0.0.1', timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

function openBrowser(url) {
  try {
    if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else if (IS_WIN) {
      spawn('cmd', ['/c', 'start', '""', url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    console.log(`[ContextSlice] 請手動開啟瀏覽器前往：${url}`);
  }
}

async function waitForServer(port, maxWaitMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function main() {
  const majorNode = Number(process.versions.node.split('.')[0] || 0);
  if (majorNode < 18) {
    console.error(`[ContextSlice] 目前 Node.js 版本為 v${process.versions.node}，建議升級至 v20 以上。`);
    process.exit(1);
  }

  const viteBinPath = path.join(ROOT_DIR, 'node_modules', 'vite', 'bin', 'vite.js');

  if (!fs.existsSync(viteBinPath)) {
    console.log('[ContextSlice] 首次啟動，正在自動安裝相依套件 (npm install)...');
    const installRes = IS_WIN
      ? spawnSync('cmd', ['/c', 'npm', 'install'], { cwd: ROOT_DIR, stdio: 'inherit' })
      : spawnSync('npm', ['install'], { cwd: ROOT_DIR, stdio: 'inherit' });
    if (installRes.status !== 0) {
      console.error('[ContextSlice] 安裝相依套件失敗，請檢查網路或 npm 設定後重試。');
      process.exit(installRes.status ?? 1);
    }
  }

  if (await isPortOpen(PORT)) {
    console.log(`[ContextSlice] 偵測到服務已在執行，直接開啟瀏覽器：${TARGET_URL}`);
    openBrowser(TARGET_URL);
    return;
  }

  console.log(`[ContextSlice] 正在啟動工作台 (${TARGET_URL})...`);
  const devProc = spawn(
    process.execPath,
    [viteBinPath, '--port', String(PORT), '--host', '0.0.0.0'],
    {
      cwd: ROOT_DIR,
      stdio: 'inherit',
    },
  );

  const shutdown = (signal) => {
    if (!devProc.killed) {
      devProc.kill(signal);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  devProc.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  const ready = await waitForServer(PORT);
  if (ready) {
    console.log(`[ContextSlice] 已啟動並自動開啟瀏覽器：${TARGET_URL}（按 Ctrl+C 可關閉）`);
    openBrowser(TARGET_URL);
  } else {
    console.log(`[ContextSlice] 伺服器仍在啟動中，請稍候手動開啟：${TARGET_URL}`);
  }
}

main().catch((err) => {
  console.error('[ContextSlice] 啟動失敗：', err);
  process.exit(1);
});
