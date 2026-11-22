import { ImportReport } from '../types/context';

export const MAX_IMPORT_FILES = 80;
export const MAX_IMPORT_FILE_BYTES = 1_500_000;

/**
 * 二進位檔副檔名黑名單（圖片／影音／壓縮／執行檔／字型／Office／資料庫／設計原始檔／資產）。
 * 只要不在這份名單且通過內容嗅探，任何文字型程式碼檔（含未列名語言、設定檔、無副檔名的
 * Makefile / Dockerfile 等）都接受匯入。
 */
export const BINARY_FILE_EXT =
  /\.(png|jpe?g|gif|webp|bmp|ico|icns|tiff?|svg|mp4|mov|avi|mkv|webm|wmv|flv|mp3|wav|ogg|flac|aac|m4a|wma|zip|rar|7z|tar|gz|bz2|xz|tgz|iso|dmg|exe|dll|so|dylib|bin|o|a|obj|lib|wasm|class|jar|war|pyc|pyo|ttf|otf|woff2?|eot|pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|db|sqlite3?|mdb|psd|ai|sketch|fig|xd|blend|fbx|glb|gltf)$/i;

/** 對結構分析沒有幫助的雜訊檔：各種 lock 檔、minified 產物與 source map */
export const NOISE_FILE_RE =
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum|Podfile\.lock|packages\.lock\.json)$|\.min\.(js|mjs|cjs|css)$|\.map$/i;

const SNIFF_SAMPLE_BYTES = 8192;

/** 內容嗅探：含 NUL byte、UTF-8 解碼失敗或控制字元比例過高即視為二進位檔 */
function isLikelyBinaryText(sample: string): boolean {
  const len = Math.min(sample.length, SNIFF_SAMPLE_BYTES);
  if (len === 0) return false;
  let suspicious = 0;
  for (let i = 0; i < len; i++) {
    const code = sample.charCodeAt(i);
    if (
      code === 0 ||
      code === 0xfffd ||
      code === 127 ||
      code < 9 ||
      code === 11 ||
      code === 12 ||
      (code > 13 && code < 32)
    ) {
      suspicious += 1;
    }
  }
  return suspicious / len > 0.08;
}

export const IGNORED_IMPORT_DIRS =
  /(^|\/)(node_modules|\.git|dist|build|\.next|coverage|venv|\.venv|__pycache__|site-packages|\.pytest_cache|\.mypy_cache|target|vendor|\.build|\.swiftpm|DerivedData|Pods|bin|obj)(\/|$)/i;

const IGNORED_DIR_NAME = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'venv',
  '.venv',
  '__pycache__',
  'site-packages',
  '.pytest_cache',
  '.mypy_cache',
  'target',
  'vendor',
  '.build',
  '.swiftpm',
  'DerivedData',
  'Pods',
  'bin',
  'obj',
]);

export interface LocalImportResult {
  files: Array<{ path: string; content: string }>;
  report: ImportReport;
}

export async function readFilesFromFileList(
  list: FileList,
  sourceLabel = '電腦選取檔案',
): Promise<LocalImportResult> {
  const files: Array<{ path: string; content: string }> = [];
  let totalScanned = 0;
  let skippedUnsupported = 0;
  let skippedOversized = 0;
  let truncatedByLimit = 0;

  for (const file of Array.from(list)) {
    const relPath =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (IGNORED_IMPORT_DIRS.test(relPath)) continue;

    totalScanned += 1;
    if (BINARY_FILE_EXT.test(file.name) || NOISE_FILE_RE.test(relPath.replace(/\\/g, '/'))) {
      skippedUnsupported += 1;
      continue;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      skippedOversized += 1;
      continue;
    }

    const sample = await file.slice(0, SNIFF_SAMPLE_BYTES).text();
    if (isLikelyBinaryText(sample)) {
      skippedUnsupported += 1;
      continue;
    }
    if (files.length >= MAX_IMPORT_FILES) {
      truncatedByLimit += 1;
      continue;
    }

    const text = await file.text();
    files.push({ path: relPath, content: text });
  }

  return {
    files,
    report: {
      sourceLabel,
      totalScanned,
      loadedCount: files.length,
      skippedUnsupported,
      skippedOversized,
      truncatedByLimit,
      canRescanInPlace: false,
    },
  };
}

export interface DirectoryHandleLike {
  name: string;
  entries?: () => AsyncIterable<[string, HandleEntryLike]>;
  values?: () => AsyncIterable<HandleEntryLike>;
}

export interface HandleEntryLike {
  kind: 'file' | 'directory';
  name: string;
  getFile?: () => Promise<File>;
  entries?: () => AsyncIterable<[string, HandleEntryLike]>;
  values?: () => AsyncIterable<HandleEntryLike>;
}

export async function readFilesFromDirectoryHandle(
  rootHandle: DirectoryHandleLike,
): Promise<LocalImportResult> {
  const files: Array<{ path: string; content: string }> = [];
  let totalScanned = 0;
  let skippedUnsupported = 0;
  let skippedOversized = 0;
  let truncatedByLimit = 0;

  const walk = async (dir: DirectoryHandleLike, prefix: string) => {
    const iter = dir.values ? dir.values() : null;
    if (!iter) return;

    for await (const entry of iter) {
      if (entry.kind === 'directory') {
        if (IGNORED_DIR_NAME.has(entry.name)) continue;
        await walk(entry, prefix ? `${prefix}/${entry.name}` : entry.name);
        continue;
      }

      if (entry.kind === 'file' && entry.getFile) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (IGNORED_IMPORT_DIRS.test(relPath)) continue;

        totalScanned += 1;
        if (BINARY_FILE_EXT.test(entry.name) || NOISE_FILE_RE.test(relPath)) {
          skippedUnsupported += 1;
          continue;
        }

        const file = await entry.getFile();
        if (file.size > MAX_IMPORT_FILE_BYTES) {
          skippedOversized += 1;
          continue;
        }

        const sample = await file.slice(0, SNIFF_SAMPLE_BYTES).text();
        if (isLikelyBinaryText(sample)) {
          skippedUnsupported += 1;
          continue;
        }
        if (files.length >= MAX_IMPORT_FILES) {
          truncatedByLimit += 1;
          continue;
        }

        const content = await file.text();
        files.push({ path: relPath, content });
      }
    }
  };

  await walk(rootHandle, rootHandle.name);

  return {
    files,
    report: {
      sourceLabel: rootHandle.name,
      totalScanned,
      loadedCount: files.length,
      skippedUnsupported,
      skippedOversized,
      truncatedByLimit,
      canRescanInPlace: true,
    },
  };
}
