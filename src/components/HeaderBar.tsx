import { FormEvent, useEffect, useRef, useState } from 'react';
import { Check, Eraser, Pencil, RefreshCw, Sparkles, Tag, X } from 'lucide-react';
import { ProjectTagColor, ProjectTagConfig, WorkspaceView } from '../types/context';

interface ProactiveExpansionIndicator {
  enabled: boolean;
  expandedCount: number;
  tokensAdded: number;
  expandedNames: string[];
  triggerSeq: number;
}

interface HeaderBarProps {
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
  onOpenImport: () => void;
  canRescanFolder?: boolean;
  isRescanning?: boolean;
  onRescanFolder?: () => void;
  cleanupStatus?: 'idle' | 'cleaning' | 'done';
  onQuickCleanup?: () => void;
  proactiveExpansion?: ProactiveExpansionIndicator;
  projectName?: string;
  projectTag?: ProjectTagConfig | null;
  onSaveProjectTag?: (tag: ProjectTagConfig | null) => void;
}

const NAV_ITEMS: Array<{ id: WorkspaceView; label: string }> = [
  { id: 'graph', label: '程式關聯圖' },
  { id: 'dashboard', label: '省量與趨勢' },
  { id: 'diff', label: '精簡前後對照' },
];

const TAG_COLOR_OPTIONS: Array<{
  id: ProjectTagColor;
  label: string;
  dotClass: string;
  badgeClass: string;
}> = [
  {
    id: 'sky',
    label: '天藍',
    dotClass: 'bg-sky-400',
    badgeClass: 'border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/20',
  },
  {
    id: 'emerald',
    label: '翠綠',
    dotClass: 'bg-emerald-400',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20',
  },
  {
    id: 'amber',
    label: '琥珀',
    dotClass: 'bg-amber-400',
    badgeClass: 'border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/20',
  },
  {
    id: 'violet',
    label: '紫羅蘭',
    dotClass: 'bg-violet-400',
    badgeClass: 'border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/20',
  },
  {
    id: 'rose',
    label: '玫瑰',
    dotClass: 'bg-rose-400',
    badgeClass: 'border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/20',
  },
  {
    id: 'slate',
    label: '石板灰',
    dotClass: 'bg-slate-400',
    badgeClass: 'border-slate-600/70 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80',
  },
];

const QUICK_TAG_SUGGESTIONS = ['核心功能', '後端 API', '前端介面', 'Bug 修復', '重構中'];

export function HeaderBar({
  activeView,
  onChangeView,
  onOpenImport,
  canRescanFolder = false,
  isRescanning = false,
  onRescanFolder,
  cleanupStatus = 'idle',
  onQuickCleanup,
  proactiveExpansion,
  projectName = '目前專案',
  projectTag = null,
  onSaveProjectTag,
}: HeaderBarProps) {
  const [pulseActive, setPulseActive] = useState(false);
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState(projectTag?.label ?? '');
  const [draftColor, setDraftColor] = useState<ProjectTagColor>(projectTag?.color ?? 'sky');

  const tagPopoverRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!proactiveExpansion || proactiveExpansion.triggerSeq === 0) return;
    setPulseActive(true);
    const timer = setTimeout(() => setPulseActive(false), 1800);
    return () => clearTimeout(timer);
  }, [proactiveExpansion?.triggerSeq]);

  useEffect(() => {
    setDraftLabel(projectTag?.label ?? '');
    setDraftColor(projectTag?.color ?? 'sky');
  }, [projectTag?.label, projectTag?.color, projectName]);

  useEffect(() => {
    if (!tagEditorOpen) return;
    tagInputRef.current?.focus();

    const handleOutside = (e: MouseEvent) => {
      if (tagPopoverRef.current && !tagPopoverRef.current.contains(e.target as Node)) {
        setTagEditorOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTagEditorOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [tagEditorOpen]);

  const showIndicator =
    Boolean(proactiveExpansion?.enabled) && (proactiveExpansion?.expandedCount ?? 0) > 0;

  const activeColorMeta =
    TAG_COLOR_OPTIONS.find((c) => c.id === (projectTag?.color ?? 'sky')) ?? TAG_COLOR_OPTIONS[0];

  const handleOpenTagEditor = () => {
    setDraftLabel(projectTag?.label ?? '');
    setDraftColor(projectTag?.color ?? 'sky');
    setTagEditorOpen((v) => !v);
  };

  const handleSubmitTag = (e: FormEvent) => {
    e.preventDefault();
    if (!onSaveProjectTag) return;
    const trimmed = draftLabel.trim();
    if (!trimmed) {
      onSaveProjectTag(null);
    } else {
      onSaveProjectTag({ label: trimmed, color: draftColor });
    }
    setTagEditorOpen(false);
  };

  const handleClearTag = () => {
    setDraftLabel('');
    onSaveProjectTag?.(null);
    setTagEditorOpen(false);
  };

  return (
    <header className="h-14 shrink-0 border-b border-slate-800/80 bg-[#0B0F17] px-6 flex items-center justify-between gap-6">
      {/* Zone 1: Wordmark + version + Project Tag Editor */}
      <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-lg font-bold tracking-tight text-slate-50">
            ContextSlice
          </span>
          <span className="text-[11px] font-mono text-slate-400">v0.1.1</span>
        </div>

        {onSaveProjectTag && (
          <div className="relative" ref={tagPopoverRef}>
            <button
              type="button"
              onClick={handleOpenTagEditor}
              aria-expanded={tagEditorOpen}
              title={`為「${projectName}」設定分類標籤與顏色（自動記憶於本機）`}
              className={`px-2.5 py-1 rounded-md border text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                projectTag?.label
                  ? activeColorMeta.badgeClass
                  : 'border-slate-800 bg-[#111827] hover:bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {projectTag?.label ? (
                <>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${activeColorMeta.dotClass}`} />
                  <span className="max-w-[120px] truncate">{projectTag.label}</span>
                  <Pencil className="w-2.5 h-2.5 opacity-70 shrink-0" />
                </>
              ) : (
                <>
                  <Tag className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>專案標籤</span>
                </>
              )}
            </button>

            {tagEditorOpen && (
              <form
                onSubmit={handleSubmitTag}
                role="dialog"
                aria-label="編輯專案標籤"
                className="absolute left-0 top-full mt-2 z-50 w-[304px] rounded-xl border border-slate-700/90 bg-[#111827] p-4 shadow-2xl space-y-3 whitespace-normal"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      設定專案標籤
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5" title={projectName}>
                      目前專案：{projectName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTagEditorOpen(false)}
                    aria-label="關閉專案標籤編輯"
                    className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="project-tag-input" className="block text-[11px] text-slate-300">
                    分類名稱
                  </label>
                  <input
                    id="project-tag-input"
                    ref={tagInputRef}
                    type="text"
                    maxLength={24}
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    placeholder="例如：核心 API、重構中、Bug 修復"
                    className="w-full h-8 px-2.5 bg-[#0B0F17] border border-slate-700/80 rounded-md text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                  />
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {QUICK_TAG_SUGGESTIONS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDraftLabel(preset)}
                        className="px-1.5 py-0.5 rounded border border-slate-800 bg-[#0B0F17] hover:border-slate-600 text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] text-slate-300">顏色標記</div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {TAG_COLOR_OPTIONS.map((opt) => {
                      const selected = draftColor === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDraftColor(opt.id)}
                          title={opt.label}
                          aria-label={`顏色：${opt.label}`}
                          className={`h-7 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
                            selected
                              ? 'border-slate-200 bg-slate-800'
                              : 'border-slate-800 bg-[#0B0F17] hover:border-slate-600'
                          }`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${opt.dotClass}`}
                          >
                            {selected && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={handleClearTag}
                    className="px-2 py-1 text-[11px] text-slate-400 hover:text-rose-300 cursor-pointer transition-colors"
                  >
                    清除標籤
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md cursor-pointer transition-colors"
                  >
                    儲存標籤
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Zone 2: Clean single-line view links */}
      <nav className="flex items-center gap-7" aria-label="主要視圖切換">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded ${
                isActive ? 'text-sky-400' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="absolute inset-x-0 -bottom-[1px] h-[2px] bg-sky-400" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Unobtrusive Proactive Discovery indicator + rescan/import actions */}
      <div className="flex items-center gap-3 shrink-0">
        {showIndicator && proactiveExpansion && (
          <div
            role="status"
            aria-live="polite"
            title={`系統已自動展開較複雜的相關程式：${proactiveExpansion.expandedNames.join('、')}`}
            className={`hidden md:flex items-center gap-1.5 text-[11px] font-mono tabular-nums transition-colors duration-300 mr-1 ${
              pulseActive ? 'text-emerald-300' : 'text-slate-400'
            }`}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              {pulseActive && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400/90" />
            </span>
            <Sparkles className="w-3 h-3 text-emerald-400/80 shrink-0" />
            <span className="whitespace-nowrap">
              已自動補齊 {proactiveExpansion.expandedCount} 個重點程式 (+{proactiveExpansion.tokensAdded} tk)
            </span>
          </div>
        )}

        {onQuickCleanup && (
          <button
            type="button"
            disabled={cleanupStatus === 'cleaning'}
            onClick={onQuickCleanup}
            title="刪除舊的操作歷程快照、重設所有節點手動設定、清理過時快取並強制重掃工作區"
            className={`px-3 py-2 text-xs font-medium border rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 disabled:opacity-60 ${
              cleanupStatus === 'done'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-[#111827] hover:bg-slate-800 text-slate-200 border-slate-700/80'
            }`}
          >
            {cleanupStatus === 'done' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>已整理完成</span>
              </>
            ) : (
              <>
                <Eraser className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>{cleanupStatus === 'cleaning' ? '整理中...' : '一鍵整理'}</span>
              </>
            )}
          </button>
        )}

        {canRescanFolder && onRescanFolder && (
          <button
            type="button"
            disabled={isRescanning}
            onClick={onRescanFolder}
            title="本機改完程式後，點這裡直接重新讀取資料夾內容"
            className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-100 border border-slate-700/80 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isRescanning ? 'animate-spin' : ''}`} />
            {isRescanning ? '掃描中...' : '重新讀取資料夾'}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenImport}
          className="px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          匯入資料夾 / 檔案
        </button>
      </div>
    </header>
  );
}
