import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Sparkles, X } from 'lucide-react';
import { parseWorkspaceFiles } from './engine/astParser';
import { assembleDynamicContext } from './engine/contextAssembler';
import {
  DirectoryHandleLike,
  readFilesFromDirectoryHandle,
} from './engine/localImporter';
import { invokeSkeletonExpansionMcpTool } from './engine/skeletonExpansion';
import { DependencyGraphView } from './components/DependencyGraphView';
import { HeaderBar } from './components/HeaderBar';
import { ImportModal } from './components/ImportModal';
import { SavingsDashboardView } from './components/SavingsDashboardView';
import { SkeletonDiffView } from './components/SkeletonDiffView';
import { SymbolExplorer } from './components/SymbolExplorer';
import { ToolbarControls } from './components/ToolbarControls';
import { UniversalOutputPanel } from './components/UniversalOutputPanel';
import {
  ImportReport,
  McpToolInvocationRecord,
  OutputTarget,
  OverrideMode,
  ProjectTagConfig,
  PromptTemplateKind,
  SessionTokenSnapshot,
  WorkspaceView,
} from './types/context';

const PREFS_STORAGE_KEY = 'contextslice_prefs_v1';
const HISTORY_STORAGE_KEY = 'contextslice_history_v1';

interface StoredPreferences {
  budgetTokens?: number;
  maxHops?: 1 | 2;
  proactiveDiscovery?: boolean;
  outputTarget?: OutputTarget;
  toolDir?: string;
  promptTemplate?: PromptTemplateKind;
  projectTags?: Record<string, ProjectTagConfig>;
}

function loadSavedPreferences(): StoredPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredPreferences;
  } catch {
    return {};
  }
}

function loadSavedHistory(): { items: SessionTokenSnapshot[]; maxSeq: number } {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return { items: [], maxSeq: 0 };
    const parsed = JSON.parse(raw) as SessionTokenSnapshot[];
    if (!Array.isArray(parsed)) return { items: [], maxSeq: 0 };
    const items = parsed.slice(-10);
    const maxSeq = items.reduce((max, item) => {
      const n = Number(String(item.stepLabel || '').replace('#', ''));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return { items, maxSeq };
  } catch {
    return { items: [], maxSeq: 0 };
  }
}

export default function App() {
  const savedPrefs = useMemo(() => loadSavedPreferences(), []);
  const savedHistory = useMemo(() => loadSavedHistory(), []);

  const [customFiles, setCustomFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [isRescanning, setIsRescanning] = useState<boolean>(false);
  const [workspaceRevision, setWorkspaceRevision] = useState<number>(0);
  const [cleanupStatus, setCleanupStatus] = useState<'idle' | 'cleaning' | 'done'>('idle');
  const dirHandleRef = useRef<DirectoryHandleLike | null>(null);
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState<string>('');
  const [budgetTokens, setBudgetTokens] = useState<number>(
    typeof savedPrefs.budgetTokens === 'number' && savedPrefs.budgetTokens > 0
      ? savedPrefs.budgetTokens
      : 32768,
  );
  const [maxHops, setMaxHops] = useState<1 | 2>(savedPrefs.maxHops === 2 ? 2 : 1);
  const [proactiveDiscovery, setProactiveDiscovery] = useState<boolean>(
    typeof savedPrefs.proactiveDiscovery === 'boolean' ? savedPrefs.proactiveDiscovery : true,
  );
  const [pinnedFocalIds, setPinnedFocalIds] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, OverrideMode>>({});
  const [activeView, setActiveView] = useState<WorkspaceView>('graph');
  const [outputTarget, setOutputTarget] = useState<OutputTarget>(
    savedPrefs.outputTarget ?? 'browser',
  );
  const [toolDir, setToolDir] = useState<string>(savedPrefs.toolDir || './tools');
  const [promptTemplate, setPromptTemplate] = useState<PromptTemplateKind>(
    savedPrefs.promptTemplate ?? 'fix',
  );
  const [projectTags, setProjectTags] = useState<Record<string, ProjectTagConfig>>(
    () => savedPrefs.projectTags ?? {},
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ nodeId: string; seq: number } | null>(null);
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const [guideOpen, setGuideOpen] = useState<boolean>(false);
  const [proactiveState, setProactiveState] = useState<{
    contextKey: string;
    expandedNodeIds: string[];
    toolCall: McpToolInvocationRecord | null;
    triggerSeq: number;
  }>({
    contextKey: '',
    expandedNodeIds: [],
    toolCall: null,
    triggerSeq: 0,
  });
  const [sessionHistory, setSessionHistory] = useState<SessionTokenSnapshot[]>(savedHistory.items);
  const snapshotSeqRef = useRef(savedHistory.maxSeq);

  // Persist user preferences in localStorage
  useEffect(() => {
    try {
      const payload: StoredPreferences = {
        budgetTokens,
        maxHops,
        proactiveDiscovery,
        outputTarget,
        toolDir,
        promptTemplate,
        projectTags,
      };
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [budgetTokens, maxHops, proactiveDiscovery, outputTarget, toolDir, promptTemplate, projectTags]);

  // Persist last 10 session snapshots across reloads
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(sessionHistory));
    } catch {
      // Ignore storage quota errors
    }
  }, [sessionHistory]);

  const activeProjectLabel = useMemo(() => {
    return importReport?.sourceLabel || '尚未匯入專案';
  }, [importReport]);

  const projectTagKey = useMemo(() => {
    return `project:${importReport?.sourceLabel || 'default'}`;
  }, [importReport]);

  const activeProjectTag = projectTags[projectTagKey] ?? null;

  const handleSaveProjectTag = (nextTag: ProjectTagConfig | null) => {
    setProjectTags((prev) => {
      const next = { ...prev };
      if (!nextTag || !nextTag.label.trim()) {
        delete next[projectTagKey];
      } else {
        next[projectTagKey] = {
          label: nextTag.label.trim(),
          color: nextTag.color,
        };
      }
      return next;
    });
  };

  const workspace = useMemo(() => {
    void workspaceRevision;
    return parseWorkspaceFiles(customFiles);
  }, [customFiles, workspaceRevision]);

  const contextKey = useMemo(
    () =>
      `custom|r${workspaceRevision}|${workspace.files.length}:${workspace.nodes.length}|${query}|${budgetTokens}|${maxHops}|${pinnedFocalIds.join(',')}|${JSON.stringify(overrides)}`,
    [
      workspaceRevision,
      workspace.files.length,
      workspace.nodes.length,
      query,
      budgetTokens,
      maxHops,
      pinnedFocalIds,
      overrides,
    ],
  );

  const activeProactiveExpandedIds = useMemo(
    () =>
      proactiveDiscovery && proactiveState.contextKey === contextKey
        ? proactiveState.expandedNodeIds
        : [],
    [proactiveDiscovery, proactiveState.contextKey, proactiveState.expandedNodeIds, contextKey],
  );

  const activeProactiveToolCall =
    proactiveDiscovery && proactiveState.contextKey === contextKey
      ? proactiveState.toolCall
      : null;

  const assembly = useMemo(
    () =>
      assembleDynamicContext({
        workspace,
        query,
        pinnedFocalIds,
        overrides,
        budgetTokens,
        maxHops,
        autoExpandClusters: proactiveDiscovery,
        proactiveExpandedIds: activeProactiveExpandedIds,
        proactiveToolCall: activeProactiveToolCall,
      }),
    [
      workspace,
      query,
      pinnedFocalIds,
      overrides,
      budgetTokens,
      maxHops,
      proactiveDiscovery,
      activeProactiveExpandedIds,
      activeProactiveToolCall,
    ],
  );

  // Proactive Discovery monitor: watches assembly.detectedClusters and automatically
  // initiates the Skeleton Expansion MCP tool for unresolved high-complexity nodes.
  useEffect(() => {
    if (!proactiveDiscovery) return;
    if (proactiveState.contextKey === contextKey) return;

    const unresolvedClusters = assembly.detectedClusters.filter((c) => !c.resolvedByMcp);
    if (unresolvedClusters.length === 0) {
      setProactiveState((prev) => ({
        contextKey,
        expandedNodeIds: [],
        toolCall: null,
        triggerSeq: prev.triggerSeq,
      }));
      return;
    }

    const result = invokeSkeletonExpansionMcpTool({
      clusters: unresolvedClusters,
      remainingBudget: assembly.remainingBudgetForExpansion,
      autoExpandEnabled: true,
      triggerMode: 'proactive-discovery',
    });

    setProactiveState((prev) => ({
      contextKey,
      expandedNodeIds: result.expandedNodeIds,
      toolCall: result.toolCallRecord,
      triggerSeq:
        result.expandedNodeIds.length > 0 ? prev.triggerSeq + 1 : prev.triggerSeq,
    }));
  }, [
    proactiveDiscovery,
    proactiveState.contextKey,
    contextKey,
    assembly.detectedClusters,
    assembly.remainingBudgetForExpansion,
  ]);

  // Record up to the last 10 settled session states for the token consumption trend chart
  useEffect(() => {
    if (workspace.files.length === 0) return;
    if (proactiveDiscovery && proactiveState.contextKey !== contextKey) return;
    const stateId = `${contextKey}|${proactiveDiscovery ? 'p1' : 'p0'}`;
    const baseSummary = query.trim() || `${activeProjectLabel} (${maxHops}-Hop)`;
    const labelSummary = activeProjectTag?.label
      ? `[${activeProjectTag.label}] ${baseSummary}`
      : baseSummary;

    setSessionHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.id === stateId) {
        if (
          last.injectedTokens === assembly.totalInjectedTokens &&
          last.budgetTokens === assembly.budgetTokens &&
          last.autoExpandedCount === assembly.autoExpandedNodeIds.length
        ) {
          return prev;
        }
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          injectedTokens: assembly.totalInjectedTokens,
          budgetTokens: assembly.budgetTokens,
          utilizationPercent: assembly.budgetUtilizationPercent,
          rawRepoTokens: assembly.metrics.rawRepoTokens,
          autoExpandedCount: assembly.autoExpandedNodeIds.length,
        };
        return updated;
      }

      snapshotSeqRef.current += 1;
      const nextSnap: SessionTokenSnapshot = {
        id: stateId,
        stepLabel: `#${snapshotSeqRef.current}`,
        timestamp: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
        injectedTokens: assembly.totalInjectedTokens,
        budgetTokens: assembly.budgetTokens,
        utilizationPercent: assembly.budgetUtilizationPercent,
        rawRepoTokens: assembly.metrics.rawRepoTokens,
        querySummary: labelSummary,
        autoExpandedCount: assembly.autoExpandedNodeIds.length,
      };
      return [...prev, nextSnap].slice(-10);
    });
  }, [
    workspace.files.length,
    proactiveDiscovery,
    proactiveState.contextKey,
    contextKey,
    activeProjectLabel,
    maxHops,
    query,
    assembly.totalInjectedTokens,
    assembly.budgetTokens,
    assembly.budgetUtilizationPercent,
    assembly.metrics.rawRepoTokens,
    assembly.autoExpandedNodeIds.length,
  ]);

  const effectiveSelectedNodeId = useMemo(() => {
    if (selectedNodeId && workspace.nodes.some((n) => n.id === selectedNodeId)) {
      return selectedNodeId;
    }
    return assembly.focalNodeIds[0] ?? workspace.nodes[0]?.id ?? null;
  }, [selectedNodeId, workspace.nodes, assembly.focalNodeIds]);

  const handleImportFiles = (payload: {
    files: Array<{ path: string; content: string }>;
    report: ImportReport;
    directoryHandle?: DirectoryHandleLike | null;
  }) => {
    setCustomFiles(payload.files);
    setImportReport(payload.report);
    dirHandleRef.current = payload.directoryHandle ?? null;
    setPinnedFocalIds([]);
    setOverrides({});
    setSelectedNodeId(null);
    setFocusRequest(null);
    setQuery('');
  };

  const handleRescanFolder = async () => {
    const handle = dirHandleRef.current;
    if (!handle) {
      setImportOpen(true);
      return;
    }
    setIsRescanning(true);
    try {
      const { files, report } = await readFilesFromDirectoryHandle(handle);
      if (files.length > 0) {
        setCustomFiles(files);
        setImportReport(report);
      }
    } catch {
      setImportOpen(true);
    } finally {
      setIsRescanning(false);
    }
  };

  const handleAutoFocusByQuery = () => {
    setPinnedFocalIds([]);
    setSelectedNodeId(null);
  };

  const handleToggleFocal = (nodeId: string) => {
    setPinnedFocalIds((prev) => {
      const base = prev.length > 0 ? prev : assembly.focalNodeIds;
      if (base.includes(nodeId)) {
        return base.filter((id) => id !== nodeId);
      }
      return [...base, nodeId];
    });
  };

  const handleSetOverride = (nodeId: string, nextOverride: OverrideMode) => {
    setOverrides((prev) => {
      const copy = { ...prev };
      if (nextOverride === 'auto') {
        delete copy[nodeId];
      } else {
        copy[nodeId] = nextOverride;
      }
      return copy;
    });
  };

  const handleFocusNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setFocusRequest((prev) => ({ nodeId, seq: (prev?.seq ?? 0) + 1 }));
  };

  const handleInspectDiff = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setActiveView('diff');
  };

  const handleClearHistory = () => {
    snapshotSeqRef.current = 0;
    setSessionHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  const handleQuickCleanup = async () => {
    if (cleanupStatus === 'cleaning') return;
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    setCleanupStatus('cleaning');

    // 1. Delete old SessionHistory snapshots & storage cache
    snapshotSeqRef.current = 0;
    setSessionHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }

    // 2. Reset all node Override & transient focus/cache states
    setOverrides({});
    setPinnedFocalIds([]);
    setSelectedNodeId(null);
    setFocusRequest(null);
    setProactiveState((prev) => ({
      contextKey: '',
      expandedNodeIds: [],
      toolCall: null,
      triggerSeq: prev.triggerSeq,
    }));

    // 3. Force workspace rescan (re-read local folder handle if active, and bump AST revision)
    try {
      if (dirHandleRef.current) {
        const { files, report } = await readFilesFromDirectoryHandle(dirHandleRef.current);
        if (files.length > 0) {
          setCustomFiles(files);
          setImportReport(report);
        }
      }
    } catch {
      // Keep existing customFiles if folder handle permission expired
    } finally {
      setWorkspaceRevision((rev) => rev + 1);
      setCleanupStatus('done');
      cleanupTimerRef.current = setTimeout(() => {
        setCleanupStatus('idle');
        cleanupTimerRef.current = null;
      }, 2200);
    }
  };

  const hasImportNotice =
    Boolean(importReport) &&
    Boolean(
      importReport &&
        (importReport.truncatedByLimit > 0 ||
          importReport.skippedOversized > 0 ||
          importReport.skippedUnsupported > 0 ||
          importReport.loadedCount > 0),
    );

  const hasImportWarnings = Boolean(
    importReport &&
      (importReport.truncatedByLimit > 0 || importReport.skippedOversized > 0),
  );

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0B0F17] text-slate-100">
      <HeaderBar
        activeView={activeView}
        onChangeView={setActiveView}
        onOpenImport={() => setImportOpen(true)}
        canRescanFolder={Boolean(dirHandleRef.current)}
        isRescanning={isRescanning}
        onRescanFolder={() => void handleRescanFolder()}
        cleanupStatus={cleanupStatus}
        onQuickCleanup={() => void handleQuickCleanup()}
        projectName={activeProjectLabel}
        projectTag={activeProjectTag}
        onSaveProjectTag={handleSaveProjectTag}
        proactiveExpansion={{
          enabled: proactiveDiscovery,
          expandedCount: assembly.autoExpandedNodeIds.length,
          tokensAdded: assembly.autoExpansionToolCall?.tokensAdded ?? 0,
          expandedNames: assembly.autoExpansionToolCall?.expandedNodeNames ?? [],
          triggerSeq: proactiveState.triggerSeq,
        }}
      />

      <ToolbarControls
        projectLabel={activeProjectLabel}
        fileCount={workspace.files.length}
        query={query}
        onChangeQuery={setQuery}
        onAutoFocusByQuery={handleAutoFocusByQuery}
        budgetTokens={budgetTokens}
        onChangeBudget={setBudgetTokens}
        maxHops={maxHops}
        onChangeHops={setMaxHops}
        autoExpandClusters={proactiveDiscovery}
        onToggleAutoExpand={() => setProactiveDiscovery((v) => !v)}
        autoExpandedCount={assembly.autoExpandedNodeIds.length}
        detectedClusterCount={assembly.detectedClusters.length}
        onResetOverrides={() => {
          setOverrides({});
          setPinnedFocalIds([]);
        }}
        overrideCount={Object.keys(overrides).length}
      />

      {hasImportNotice && importReport && (
        <div
          role="status"
          className={`shrink-0 px-6 py-2 border-b text-xs flex items-center justify-between gap-4 ${
            hasImportWarnings
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasImportWarnings ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span className="truncate">
              已從「{importReport.sourceLabel}」載入 <strong>{importReport.loadedCount}</strong> 個程式檔
              {importReport.skippedUnsupported > 0 && ` · 略過 ${importReport.skippedUnsupported} 個二進位或非文字檔`}
              {importReport.skippedOversized > 0 && ` · 略過 ${importReport.skippedOversized} 個超過 1.5MB 大檔`}
              {importReport.truncatedByLimit > 0 &&
                ` · 另有 ${importReport.truncatedByLimit} 個檔案超過瀏覽器 80 檔上限（大型專案建議改用右側「命令列腳本」或「1個工具自動切」完整掃描）`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setImportReport(null)}
            aria-label="關閉匯入提示"
            className="p-1 rounded hover:bg-white/10 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3-Column Precision IDE Viewport */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        <div className="relative w-[272px] shrink-0 border-r border-slate-800/80 bg-[#0E1420] flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-slate-800/80 bg-[#111827]/70 shrink-0">
            <button
              type="button"
              onClick={() => setGuideOpen((prev) => !prev)}
              aria-expanded={guideOpen}
              className="w-full px-3 py-1.5 rounded-md border border-sky-500/35 bg-sky-500/10 hover:bg-sky-500/15 text-sky-300 text-xs font-medium flex items-center justify-between transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                新手入門引導
              </span>
              <span className="text-[11px] text-sky-400/80">
                {guideOpen ? '收起' : '30 秒看懂'}
              </span>
            </button>
          </div>

          <SymbolExplorer
            files={workspace.files}
            nodePlans={assembly.nodePlans}
            edges={workspace.edges}
            selectedNodeId={effectiveSelectedNodeId}
            onSelectNode={handleFocusNode}
            onToggleFocal={handleToggleFocal}
            onCycleOverride={handleSetOverride}
          />

          {guideOpen && (
            <div
              role="dialog"
              aria-label="新手入門引導"
              className="absolute left-3 top-12 z-40 w-[328px] rounded-xl border border-sky-500/40 bg-[#111827]/98 p-4 shadow-2xl backdrop-blur-md space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                  <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>第一次用？這工具很簡單！</span>
                </div>
                <button
                  type="button"
                  onClick={() => setGuideOpen(false)}
                  aria-label="關閉新手入門引導"
                  className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs leading-relaxed text-slate-300">
                <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-2.5">
                  <div className="font-semibold text-sky-300">
                    1. 這裡可以看到你的程式結構
                  </div>
                  <p className="mt-1 text-slate-400">
                    左邊會幫你把檔案裡的函式列出來，中間圖表會畫出「誰呼叫誰」，不用自己一行一行慢慢翻。
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-2.5">
                  <div className="font-semibold text-emerald-300">
                    2. AI 會幫你自動挑選最相關的程式碼，節省 Token 費用
                  </div>
                  <p className="mt-1 text-slate-400">
                    系統只保留你要改的重點內容，其餘相關程式只留標題外框，右邊整理好後直接複製貼給 AI 就能用。
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-500">
                  全部在瀏覽器本機處理，不上傳程式碼
                </span>
                <button
                  type="button"
                  onClick={() => setGuideOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md transition-colors cursor-pointer"
                >
                  我知道了
                </button>
              </div>
            </div>
          )}
        </div>

        {activeView === 'graph' && (
          <DependencyGraphView
            nodePlans={assembly.nodePlans}
            edges={workspace.edges}
            selectedNodeId={effectiveSelectedNodeId}
            focusRequest={focusRequest}
            onSelectNode={setSelectedNodeId}
            onToggleFocal={handleToggleFocal}
            onSetOverride={handleSetOverride}
            onInspectDiff={handleInspectDiff}
          />
        )}

        {activeView === 'dashboard' && (
          <SavingsDashboardView
            assembly={assembly}
            workspace={workspace}
            currentQuery={query}
            maxHops={maxHops}
            autoExpandClusters={proactiveDiscovery}
            sessionHistory={sessionHistory}
            onClearHistory={handleClearHistory}
            onSetOverride={handleSetOverride}
            onSelectNode={(id) => {
              setSelectedNodeId(id);
              setActiveView('diff');
            }}
          />
        )}

        {activeView === 'diff' && (
          <SkeletonDiffView
            nodePlans={assembly.nodePlans}
            selectedNodeId={effectiveSelectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        )}

        <UniversalOutputPanel
          assembly={assembly}
          edges={workspace.edges}
          projectLabel={activeProjectLabel}
          query={query}
          maxHops={maxHops}
          activeTarget={outputTarget}
          onChangeTarget={setOutputTarget}
          toolDir={toolDir}
          onChangeToolDir={setToolDir}
          promptTemplate={promptTemplate}
          onChangePromptTemplate={setPromptTemplate}
        />
      </main>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImportFiles={handleImportFiles}
      />
    </div>
  );
}
