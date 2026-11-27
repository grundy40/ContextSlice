import { KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, CornerDownLeft, FileCode2, Search, Sparkles, Target, X } from 'lucide-react';
import { searchAstSymbolsSemantic, SemanticMatchInfo } from '../engine/semanticSearch';
import { useI18n } from '../i18n';
import {
  CodeFile,
  ComputedNodePlan,
  DependencyEdge,
  NodeTier,
  OverrideMode,
  SymbolKind,
} from '../types/context';

interface SymbolExplorerProps {
  files: CodeFile[];
  nodePlans: ComputedNodePlan[];
  edges?: DependencyEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onToggleFocal: (nodeId: string) => void;
  onCycleOverride: (nodeId: string, nextOverride: OverrideMode) => void;
}

const KIND_ABBR: Record<SymbolKind, string> = {
  function: 'fn',
  class: 'cls',
  method: 'mth',
  interface: 'ifc',
  type: 'typ',
  const: 'var',
  module: 'mod',
};

const TIER_TEXT_CLASS: Record<NodeTier, string> = {
  full: 'text-emerald-400',
  skeleton: 'text-amber-300',
  map: 'text-slate-400',
  excluded: 'text-slate-600',
};

function nextOverrideCycle(currentTier: NodeTier, currentOverride: OverrideMode): OverrideMode {
  if (currentOverride === 'auto') {
    return currentTier === 'full' ? 'skeleton' : 'full';
  }
  if (currentOverride === 'full') return 'skeleton';
  if (currentOverride === 'skeleton') return 'exclude';
  return 'auto';
}

function renderHighlightedText(text: string, query: string): ReactNode {
  if (!query) return text;
  const lowerText = text.toLowerCase();
  const idx = lowerText.indexOf(query);
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <mark className="bg-sky-400/25 text-sky-200 rounded-[2px] px-0.5">{match}</mark>
      {after}
    </>
  );
}

export function SymbolExplorer({
  files,
  nodePlans,
  edges = [],
  selectedNodeId,
  onSelectNode,
  onToggleFocal,
  onCycleOverride,
}: SymbolExplorerProps) {
  const { locale, t } = useI18n();
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const [symbolFilter, setSymbolFilter] = useState('');
  const [semanticEnabled, setSemanticEnabled] = useState(true);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const normalizedFilter = symbolFilter.trim().toLowerCase();

  const {
    orderedFiles,
    filteredPlansByFile,
    matchInfoByNodeId,
    flatMatchedNodeIds,
  } = useMemo(() => {
    const map = new Map<string, ComputedNodePlan[]>();
    const matchMap: Map<string, SemanticMatchInfo> = normalizedFilter
      ? searchAstSymbolsSemantic(nodePlans, edges, symbolFilter, semanticEnabled, locale)
      : new Map();
    const flatIds: string[] = [];

    const fileScoreEntries: Array<{ file: CodeFile; topScore: number }> = [];

    for (const file of files) {
      let filePlans = nodePlans.filter((p) => {
        if (p.node.fileId !== file.id) return false;
        if (!normalizedFilter) return true;
        return matchMap.has(p.node.id);
      });

      if (normalizedFilter && filePlans.length > 0) {
        filePlans = [...filePlans].sort(
          (a, b) => (matchMap.get(b.node.id)?.score ?? 0) - (matchMap.get(a.node.id)?.score ?? 0),
        );
      }

      if (filePlans.length > 0 || !normalizedFilter) {
        map.set(file.id, filePlans);
        const topScore =
          filePlans.length > 0
            ? Math.max(...filePlans.map((p) => matchMap.get(p.node.id)?.score ?? 0))
            : 0;
        fileScoreEntries.push({ file, topScore });
      }
    }

    if (normalizedFilter) {
      fileScoreEntries.sort((a, b) => b.topScore - a.topScore);
    }

    const sortedFiles = fileScoreEntries.map((entry) => entry.file);
    for (const file of sortedFiles) {
      const plans = map.get(file.id) ?? [];
      for (const p of plans) {
        flatIds.push(p.node.id);
      }
    }

    return {
      orderedFiles: sortedFiles,
      filteredPlansByFile: map,
      matchInfoByNodeId: matchMap,
      flatMatchedNodeIds: flatIds,
    };
  }, [files, nodePlans, edges, symbolFilter, normalizedFilter, semanticEnabled, locale]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [normalizedFilter, flatMatchedNodeIds.length]);

  const activeKeyboardNodeId =
    normalizedFilter && flatMatchedNodeIds.length > 0
      ? flatMatchedNodeIds[Math.min(activeMatchIndex, flatMatchedNodeIds.length - 1)]
      : null;

  const focusAstNode = (nodeId: string) => {
    onSelectNode(nodeId);
    const el = rowRefs.current.get(nodeId);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  useEffect(() => {
    if (!selectedNodeId) return;
    const el = rowRefs.current.get(selectedNodeId);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedNodeId]);

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (symbolFilter) {
        e.preventDefault();
        setSymbolFilter('');
      }
      return;
    }

    if (flatMatchedNodeIds.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = (activeMatchIndex + 1) % flatMatchedNodeIds.length;
      setActiveMatchIndex(nextIdx);
      const nextId = flatMatchedNodeIds[nextIdx];
      rowRefs.current.get(nextId)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx =
        (activeMatchIndex - 1 + flatMatchedNodeIds.length) % flatMatchedNodeIds.length;
      setActiveMatchIndex(prevIdx);
      const prevId = flatMatchedNodeIds[prevIdx];
      rowRefs.current.get(prevId)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const targetId =
        activeKeyboardNodeId ?? flatMatchedNodeIds[0];
      if (targetId) {
        focusAstNode(targetId);
      }
    }
  };

  const toggleFile = (fileId: string) => {
    setCollapsedFiles((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  const matchCountSummary = t.explorer.matchCount(flatMatchedNodeIds.length, nodePlans.length);

  return (
    <aside
      aria-label={t.explorer.aria}
      className="flex-1 flex flex-col min-h-0"
    >
      <div className="px-4 py-3 border-b border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
            {t.explorer.title}
          </h2>
          <span className="text-[11px] font-mono tabular-nums text-slate-400">
            {t.explorer.counts(files.length, nodePlans.length)}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="relative flex items-center">
            <Search className="w-3 h-3 text-slate-500 absolute left-2.5 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              aria-label={t.explorer.searchAria}
              placeholder={
                semanticEnabled
                  ? t.explorer.searchPlaceholderSemantic
                  : t.explorer.searchPlaceholderExact
              }
              className="w-full h-7 pl-7 pr-7 bg-[#0B0F17] border border-slate-800 rounded text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-400 transition-colors"
            />
            {symbolFilter && (
              <button
                type="button"
                onClick={() => {
                  setSymbolFilter('');
                  searchInputRef.current?.focus();
                }}
                aria-label={t.explorer.clearSearchAria}
                className="absolute right-1.5 p-0.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSemanticEnabled((v) => !v)}
              title={t.explorer.semanticTitle}
              className={`px-2 py-0.5 rounded border text-[10.5px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                semanticEnabled
                  ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                  : 'border-slate-800 bg-[#0B0F17] text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-2.5 h-2.5 shrink-0" />
              {t.explorer.semanticLabel(semanticEnabled)}
            </button>

            {normalizedFilter && flatMatchedNodeIds.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-500">
                <CornerDownLeft className="w-2.5 h-2.5" />
                {t.explorer.enterFocus}
              </span>
            )}
          </div>
        </div>

        {normalizedFilter && (
          <div className="flex items-center justify-between text-[10.5px] text-slate-400">
            <span className="font-mono tabular-nums">
              {matchCountSummary.prefix}
              <strong className="text-sky-300">{matchCountSummary.matched}</strong>
              {matchCountSummary.suffix}
            </span>
            {semanticEnabled && (
              <span className="text-slate-500">{t.explorer.semanticSortHint}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {files.length === 0 ? (
          <div className="px-4 py-10 text-center space-y-2">
            <p className="text-xs font-medium text-slate-300">{t.explorer.emptyTitle}</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {t.explorer.emptyDesc}
            </p>
          </div>
        ) : normalizedFilter && flatMatchedNodeIds.length === 0 ? (
          <div className="px-4 py-8 text-center space-y-2">
            <p className="text-xs text-slate-400">
              {t.explorer.noMatchPrefix}
              <span className="text-slate-200 font-mono">{symbolFilter.trim()}</span>
              {t.explorer.noMatchSuffix}
            </p>
            <button
              type="button"
              onClick={() => {
                setSymbolFilter('');
                searchInputRef.current?.focus();
              }}
              className="px-2.5 py-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-300 cursor-pointer"
            >
              {t.explorer.clearSearchBtn}
            </button>
          </div>
        ) : (
          orderedFiles.map((file) => {
            const filePlans = filteredPlansByFile.get(file.id);
            if (!filePlans || (normalizedFilter && filePlans.length === 0)) return null;

            const isCollapsed = normalizedFilter ? false : Boolean(collapsedFiles[file.id]);
            const fileInjected = filePlans.reduce((sum, p) => sum + p.injectedTokens, 0);

            return (
              <div key={file.id} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleFile(file.id)}
                  className="w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left hover:bg-slate-800/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    )}
                    <FileCode2 className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
                    <span className="text-xs font-medium text-slate-200 truncate" title={file.path}>
                      {renderHighlightedText(file.path.split('/').pop() ?? file.path, normalizedFilter)}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                    {fileInjected}/{file.rawTokens}
                  </span>
                </button>

                {file.isOversized && !isCollapsed && (
                  <div className="px-8 pb-1 text-[11px] text-amber-300/90">
                    {t.explorer.oversized(file.lineCount)}
                  </div>
                )}

                {!isCollapsed && (
                  <div className="pl-5 pr-2 space-y-0.5">
                    {filePlans.map((plan) => {
                      const isSelected = selectedNodeId === plan.node.id;
                      const isKeyboardActive = activeKeyboardNodeId === plan.node.id;
                      const matchInfo = normalizedFilter
                        ? matchInfoByNodeId.get(plan.node.id)
                        : undefined;

                      return (
                        <div
                          key={plan.node.id}
                          ref={(el) => {
                            if (el) {
                              rowRefs.current.set(plan.node.id, el);
                            } else {
                              rowRefs.current.delete(plan.node.id);
                            }
                          }}
                          className={`group flex items-center justify-between gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
                            isSelected
                              ? 'bg-sky-500/15 text-slate-100 ring-1 ring-sky-500/35'
                              : isKeyboardActive
                                ? 'bg-slate-800/80 text-slate-100 ring-1 ring-slate-600'
                                : 'hover:bg-slate-800/40 text-slate-300'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => focusAstNode(plan.node.id)}
                            className="flex flex-col items-start min-w-0 flex-1 text-left cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5 w-full min-w-0">
                              <span className="text-[10px] font-mono text-slate-500 w-6 shrink-0">
                                {KIND_ABBR[plan.node.kind]}
                              </span>
                              <span className="truncate font-mono text-[11.5px]" title={plan.node.name}>
                                {renderHighlightedText(
                                  plan.node.name,
                                  matchInfo?.matchedTerm && matchInfo.kind === 'behavior'
                                    ? matchInfo.matchedTerm
                                    : normalizedFilter,
                                )}
                              </span>
                            </span>
                            {matchInfo && matchInfo.kind !== 'name' && (
                              <span
                                className={`pl-7 text-[10px] truncate max-w-full ${
                                  matchInfo.kind === 'structure'
                                    ? 'text-violet-300/90'
                                    : matchInfo.kind === 'fuzzy'
                                      ? 'text-amber-300/90'
                                      : 'text-sky-300/85'
                                }`}
                                title={matchInfo.reasonLabel}
                              >
                                {matchInfo.reasonLabel}
                              </span>
                            )}
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onToggleFocal(plan.node.id)}
                              title={plan.isFocal ? t.explorer.toggleFocalRemove : t.explorer.toggleFocalAdd}
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                plan.isFocal
                                  ? 'text-sky-400'
                                  : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:text-slate-300'
                              }`}
                            >
                              <Target className="w-3 h-3" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                onCycleOverride(
                                  plan.node.id,
                                  nextOverrideCycle(plan.tier, plan.override),
                                )
                              }
                              title={
                                plan.autoExpanded
                                  ? t.explorer.tierTooltipAutoExpanded(plan.complexityScore ?? 0)
                                  : t.explorer.tierTooltip(t.explorer.tierLabel[plan.tier], plan.override !== 'auto')
                              }
                              className={`text-[11px] font-medium px-1.5 py-0.5 rounded bg-slate-900/70 hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap ${TIER_TEXT_CLASS[plan.tier]}`}
                            >
                              {plan.autoExpanded ? t.explorer.tierAutoExpanded : t.explorer.tierLabel[plan.tier]}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
        {t.explorer.footerPrefix}
        <span className="text-emerald-400">{t.explorer.tierLabel.full}</span> /{' '}
        <span className="text-amber-300">{t.explorer.tierLabel.skeleton}</span> /{' '}
        <span className="text-slate-500">{t.explorer.tierLabel.excluded}</span>
      </div>
    </aside>
  );
}
