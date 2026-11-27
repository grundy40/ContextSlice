import { FormEvent, useEffect, useRef, useState } from 'react';
import { Check, Eraser, Languages, Pencil, RefreshCw, Sparkles, Tag, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { ProjectTagColor, ProjectTagConfig, WorkspaceView } from '../types/context';
import { APP_VERSION } from '../version';

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

const NAV_VIEW_IDS: WorkspaceView[] = ['graph', 'dashboard', 'diff'];

const TAG_COLOR_OPTIONS: Array<{
  id: ProjectTagColor;
  dotClass: string;
  badgeClass: string;
}> = [
  {
    id: 'sky',
    dotClass: 'bg-sky-400',
    badgeClass: 'border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/20',
  },
  {
    id: 'emerald',
    dotClass: 'bg-emerald-400',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20',
  },
  {
    id: 'amber',
    dotClass: 'bg-amber-400',
    badgeClass: 'border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/20',
  },
  {
    id: 'violet',
    dotClass: 'bg-violet-400',
    badgeClass: 'border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/20',
  },
  {
    id: 'rose',
    dotClass: 'bg-rose-400',
    badgeClass: 'border-rose-500/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/20',
  },
  {
    id: 'slate',
    dotClass: 'bg-slate-400',
    badgeClass: 'border-slate-600/70 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80',
  },
];

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
  projectName,
  projectTag = null,
  onSaveProjectTag,
}: HeaderBarProps) {
  const { toggleLocale, t } = useI18n();
  const displayProjectName = projectName ?? t.header.defaultProjectName;
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
  }, [projectTag?.label, projectTag?.color, displayProjectName]);

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
          <span className="text-[11px] font-mono text-slate-400">{APP_VERSION}</span>
        </div>

        {onSaveProjectTag && (
          <div className="relative" ref={tagPopoverRef}>
            <button
              type="button"
              onClick={handleOpenTagEditor}
              aria-expanded={tagEditorOpen}
              title={t.header.tagTooltip(displayProjectName)}
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
                  <span>{t.header.tagDefault}</span>
                </>
              )}
            </button>

            {tagEditorOpen && (
              <form
                onSubmit={handleSubmitTag}
                role="dialog"
                aria-label={t.header.tagEditAria}
                className="absolute left-0 top-full mt-2 z-50 w-[304px] rounded-xl border border-slate-700/90 bg-[#111827] p-4 shadow-2xl space-y-3 whitespace-normal"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      {t.header.tagSetTitle}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5" title={displayProjectName}>
                      {t.header.tagCurrentProject(displayProjectName)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTagEditorOpen(false)}
                    aria-label={t.header.tagCloseAria}
                    className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="project-tag-input" className="block text-[11px] text-slate-300">
                    {t.header.tagNameLabel}
                  </label>
                  <input
                    id="project-tag-input"
                    ref={tagInputRef}
                    type="text"
                    maxLength={24}
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    placeholder={t.header.tagNamePlaceholder}
                    className="w-full h-8 px-2.5 bg-[#0B0F17] border border-slate-700/80 rounded-md text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                  />
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {t.header.tagSuggestions.map((preset) => (
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
                  <div className="text-[11px] text-slate-300">{t.header.tagColorLabel}</div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {TAG_COLOR_OPTIONS.map((opt) => {
                      const selected = draftColor === opt.id;
                      const colorLabel = t.header.tagColorNames[opt.id];
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setDraftColor(opt.id)}
                          title={colorLabel}
                          aria-label={t.header.tagColorAria(colorLabel)}
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
                    {t.header.tagClear}
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md cursor-pointer transition-colors"
                  >
                    {t.header.tagSave}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Zone 2: Clean single-line view links */}
      <nav className="flex items-center gap-7" aria-label={t.header.navAria}>
        {NAV_VIEW_IDS.map((viewId) => {
          const isActive = activeView === viewId;
          return (
            <button
              key={viewId}
              type="button"
              onClick={() => onChangeView(viewId)}
              className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded ${
                isActive ? 'text-sky-400' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {t.header.nav[viewId]}
              {isActive && (
                <span className="absolute inset-x-0 -bottom-[1px] h-[2px] bg-sky-400" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Proactive indicator + language toggle + cleanup/rescan/import actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        {showIndicator && proactiveExpansion && (
          <div
            role="status"
            aria-live="polite"
            title={t.header.proactiveTooltip(proactiveExpansion.expandedNames)}
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
              {t.header.proactiveText(proactiveExpansion.expandedCount, proactiveExpansion.tokensAdded)}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={toggleLocale}
          title={t.header.langToggleTitle}
          aria-label={t.header.langToggleAria}
          className="px-2.5 py-2 text-xs font-medium bg-[#111827] hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <Languages className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>{t.header.langToggleLabel}</span>
        </button>

        {onQuickCleanup && (
          <button
            type="button"
            disabled={cleanupStatus === 'cleaning'}
            onClick={onQuickCleanup}
            title={t.header.cleanupTooltip}
            className={`px-3 py-2 text-xs font-medium border rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 disabled:opacity-60 ${
              cleanupStatus === 'done'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-[#111827] hover:bg-slate-800 text-slate-200 border-slate-700/80'
            }`}
          >
            {cleanupStatus === 'done' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{t.header.cleanupDone}</span>
              </>
            ) : (
              <>
                <Eraser className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>{cleanupStatus === 'cleaning' ? t.header.cleanupBusy : t.header.cleanupIdle}</span>
              </>
            )}
          </button>
        )}

        {canRescanFolder && onRescanFolder && (
          <button
            type="button"
            disabled={isRescanning}
            onClick={onRescanFolder}
            title={t.header.rescanTooltip}
            className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-100 border border-slate-700/80 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isRescanning ? 'animate-spin' : ''}`} />
            {isRescanning ? t.header.rescanBusy : t.header.rescanIdle}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenImport}
          className="px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          {t.header.importBtn}
        </button>
      </div>
    </header>
  );
}
