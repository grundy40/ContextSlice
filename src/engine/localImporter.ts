import { ImportReport } from '../types/context';

export const MAX_IMPORT_FILES = 80;
export const MAX_IMPORT_FILE_BYTES = 1_500_000;

export const SUPPORTED_IMPORT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|pyw|go|c|h|cpp|cc|cxx|hpp|hh|hxx|swift|php|phtml|html|htm|vue|svelte|css|scss|less|rs|java|kt|kts|cs|rb|sql|json|yaml|yml|toml|md|sh|ps1)$/i;

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
    if (!SUPPORTED_IMPORT_EXT.test(file.name)) {
      skippedUnsupported += 1;
      continue;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      skippedOversized += 1;
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
        if (!SUPPORTED_IMPORT_EXT.test(entry.name)) {
          skippedUnsupported += 1;
          continue;
        }

        const file = await entry.getFile();
        if (file.size > MAX_IMPORT_FILE_BYTES) {
          skippedOversized += 1;
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
