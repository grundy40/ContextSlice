import React, { useRef, useState } from 'react';
import { FolderOpen, FilePlus2, X } from 'lucide-react';
import {
  DirectoryHandleLike,
  readFilesFromDirectoryHandle,
  readFilesFromFileList,
} from '../engine/localImporter';
import { ImportReport } from '../types/context';

interface ImportPayload {
  files: Array<{ path: string; content: string }>;
  report: ImportReport;
  directoryHandle?: DirectoryHandleLike | null;
}

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportFiles: (payload: ImportPayload) => void;
}

export function ImportModal({ open, onClose, onImportFiles }: ImportModalProps) {
  const [tab, setTab] = useState<'files' | 'paste'>('files');
  const [pastePath, setPastePath] = useState('src/services/OversizedHandler.ts');
  const [pasteContent, setPasteContent] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const processFileList = async (list: FileList | null, sourceLabel = '電腦選取檔案') => {
    if (!list || list.length === 0) return;
    setErrorMsg(null);
    setIsReading(true);
    try {
      const { files, report } = await readFilesFromFileList(list, sourceLabel);
      if (files.length === 0) {
        setErrorMsg(
          '沒有找到支援的程式碼檔案（支援 TS/JS、Python、Go、C/C++、Swift、PHP、HTML/CSS、Rust、Java、C#、Ruby、SQL 等）',
        );
        return;
      }
      onImportFiles({ files, report, directoryHandle: null });
      onClose();
    } finally {
      setIsReading(false);
    }
  };

  const handlePickFolder = async () => {
    setErrorMsg(null);
    const pickerWin = window as Window & {
      showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike>;
    };

    if (typeof pickerWin.showDirectoryPicker === 'function') {
      try {
        const dirHandle = await pickerWin.showDirectoryPicker({ mode: 'read' });
        setIsReading(true);
        const { files, report } = await readFilesFromDirectoryHandle(dirHandle);
        if (files.length === 0) {
          setErrorMsg('這個資料夾內沒有找到支援的程式碼檔案');
          setIsReading(false);
          return;
        }
        onImportFiles({ files, report, directoryHandle: dirHandle });
        setIsReading(false);
        onClose();
        return;
      } catch (err) {
        setIsReading(false);
        const errName = err instanceof Error ? err.name : '';
        if (errName === 'AbortError') return;
        // Fall back to classic <input webkitdirectory> (e.g. inside iframe / Firefox / Safari)
      }
    }

    folderInputRef.current?.click();
  };

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteContent.trim()) {
      setErrorMsg('請先貼上程式碼內容');
      return;
    }
    const cleanPath = pastePath.trim() || 'src/OversizedFile.ts';
    onImportFiles({
      files: [{ path: cleanPath, content: pasteContent }],
      report: {
        sourceLabel: cleanPath,
        totalScanned: 1,
        loadedCount: 1,
        skippedUnsupported: 0,
        skippedOversized: 0,
        truncatedByLimit: 0,
        canRescanInPlace: false,
      },
      directoryHandle: null,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-xl rounded-lg border border-slate-700/80 bg-[#111827] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 id="import-modal-title" className="text-sm font-semibold text-slate-100">
            匯入你的專案資料夾或程式檔案
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => {
                setTab('files');
                setErrorMsg(null);
              }}
              className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                tab === 'files' ? 'bg-slate-800 text-sky-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              選取電腦資料夾 / 多個檔案
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('paste');
                setErrorMsg(null);
              }}
              className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                tab === 'paste' ? 'bg-slate-800 text-sky-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              直接貼上一段長程式碼
            </button>
          </div>
        </div>

        <div className="p-5">
          {tab === 'files' ? (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  void processFileList(e.dataTransfer.files, '拖曳匯入檔案');
                }}
                className={`border border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging
                    ? 'border-sky-400 bg-sky-500/10'
                    : 'border-slate-700 bg-[#0B0F17]'
                }`}
              >
                <p className="text-sm font-medium text-slate-200">
                  把資料夾或程式檔案拖進來，或點下面按鈕選擇
                </p>
                <p className="mt-1.5 text-xs text-slate-400">
                  支援 TS/JS、Python、Go、C/C++、Swift、PHP、HTML/CSS、Rust、Java、C#、Ruby 等語言；所有分析都在瀏覽器本機完成，不會上傳到外部伺服器。
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  瀏覽器單次最多載入 80 個檔案（自動略過 node_modules、.git、dist 等編譯目錄與超過 1.5MB 檔案）
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={isReading}
                    onClick={() => void handlePickFolder()}
                    className="px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 rounded flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    {isReading ? '讀取中...' : '選擇整個資料夾'}
                  </button>
                  <button
                    type="button"
                    disabled={isReading}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-100 rounded flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                    選擇多個檔案
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void processFileList(e.target.files, '電腦選取多檔');
                    e.target.value = '';
                  }}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  // @ts-expect-error webkitdirectory is supported in Chromium/Firefox/Safari
                  webkitdirectory=""
                  directory=""
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const firstRel = (e.target.files?.[0] as (File & { webkitRelativePath?: string }) | undefined)
                      ?.webkitRelativePath;
                    const folderName = firstRel ? firstRel.split('/')[0] : '本機資料夾';
                    void processFileList(e.target.files, folderName);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          ) : (
            <form onSubmit={handlePasteSubmit} className="space-y-3">
              <div>
                <label htmlFor="paste-filename" className="block text-xs font-medium text-slate-300 mb-1">
                  檔名與副檔名（用來判斷這是哪一種程式語言）
                </label>
                <input
                  id="paste-filename"
                  type="text"
                  value={pastePath}
                  onChange={(e) => setPastePath(e.target.value)}
                  className="w-full h-9 px-3 bg-[#0B0F17] border border-slate-700 rounded text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div>
                <label htmlFor="paste-code" className="block text-xs font-medium text-slate-300 mb-1">
                  把太長、貼不進對話框的程式碼貼在這裡（會自動幫你拆解分段）
                </label>
                <textarea
                  id="paste-code"
                  rows={10}
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="export function processOrder(...) { ... }"
                  className="w-full p-3 bg-[#0B0F17] border border-slate-700 rounded text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs text-slate-300 hover:text-white rounded cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded cursor-pointer"
                >
                  開始分析與精簡
                </button>
              </div>
            </form>
          )}

          {errorMsg && (
            <div className="mt-3 text-xs text-rose-400">{errorMsg}</div>
          )}
        </div>
      </div>
    </div>
  );
}
