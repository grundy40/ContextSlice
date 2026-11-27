import { FolderOpen, RotateCcw, Search, Sparkles, Zap } from 'lucide-react';

interface ToolbarControlsProps {
  projectLabel: string;
  fileCount: number;
  query: string;
  onChangeQuery: (q: string) => void;
  onAutoFocusByQuery: () => void;
  budgetTokens: number;
  onChangeBudget: (budget: number) => void;
  maxHops: 1 | 2;
  onChangeHops: (hops: 1 | 2) => void;
  autoExpandClusters: boolean;
  onToggleAutoExpand: () => void;
  autoExpandedCount: number;
  detectedClusterCount: number;
  onResetOverrides: () => void;
  overrideCount: number;
}

const BUDGET_OPTIONS = [
  1000,
  4000,
  8000,
  16000,
  32000,
  64000,
  128000,
  256000,
  1000000,
];

function formatBudgetLabel(b: number): string {
  if (b >= 1_000_000) return `${b / 1_000_000}M`;
  if (b >= 1_000) return `${b / 1_000}K`;
  return String(b);
}

export function ToolbarControls({
  projectLabel,
  fileCount,
  query,
  onChangeQuery,
  onAutoFocusByQuery,
  budgetTokens,
  onChangeBudget,
  maxHops,
  onChangeHops,
  autoExpandClusters,
  onToggleAutoExpand,
  autoExpandedCount,
  detectedClusterCount,
  onResetOverrides,
  overrideCount,
}: ToolbarControlsProps) {
  return (
    <section
      aria-label="切片策略控制列"
      className="shrink-0 border-b border-slate-800/80 bg-[#111827] px-6 py-3 flex flex-wrap items-center justify-between gap-4"
    >
      {/* Left: Active Workspace Badge & Query Input */}
      <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[320px]">
        <div
          className="h-9 bg-[#0B0F17] border border-slate-700/80 rounded-md px-3 text-xs font-medium text-slate-200 flex items-center gap-2 max-w-[260px]"
          title="當前匯入的專案或資料夾"
        >
          <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="truncate">{fileCount > 0 ? projectLabel : '尚未匯入專案'}</span>
          {fileCount > 0 && (
            <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
              ({fileCount})
            </span>
          )}
        </div>

        <div className="relative flex-1 min-w-[220px] max-w-md flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onAutoFocusByQuery();
              }
            }}
            placeholder="輸入任務或關鍵字 (支援 CJK + 中英對照 / 支援多目錄)..."
            className="w-full h-9 bg-[#0B0F17] border border-slate-700/80 focus:border-sky-500 rounded-md pl-9 pr-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Right: Budget Slider & Hop Filter */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Hop Filter */}
        <div className="flex items-center gap-1 bg-[#0B0F17] border border-slate-800 rounded-md p-0.5">
          <button
            type="button"
            onClick={() => onChangeHops(1)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
              maxHops === 1
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="僅包含直接相關節點 (1-hop)"
          >
            1層相關
          </button>
          <button
            type="button"
            onClick={() => onChangeHops(2)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
              maxHops === 2
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="包含 2 層依賴擴展 (2-hop)"
          >
            2層相關
          </button>
        </div>

        {/* Auto-Expand Complexity Cluster Toggle */}
        <button
          type="button"
          onClick={onToggleAutoExpand}
          className={`h-9 px-3 text-xs font-medium rounded-md border flex items-center gap-1.5 transition-colors cursor-pointer ${
            autoExpandClusters
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title="自動偵測高複雜度叢集並在預算內展開"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>自動補齊 ({autoExpandedCount})</span>
        </button>

        {/* Reset Manual Overrides */}
        {overrideCount > 0 && (
          <button
            type="button"
            onClick={onResetOverrides}
            className="h-9 px-2.5 text-xs font-medium bg-[#0B0F17] border border-slate-800 hover:border-slate-700 text-slate-300 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
            title="清除所有手動釘選或覆寫狀態"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>重置 ({overrideCount})</span>
          </button>
        )}

        {/* Token Budget Selector */}
        <div className="flex items-center gap-2 bg-[#0B0F17] border border-slate-800 rounded-md px-3 h-9">
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs text-slate-400">Token 上限:</span>
          <select
            value={budgetTokens}
            onChange={(e) => onChangeBudget(Number(e.target.value))}
            aria-label="Token 上限選擇"
            className="bg-transparent text-xs font-mono font-medium text-slate-200 focus:outline-none cursor-pointer"
          >
            {BUDGET_OPTIONS.map((b) => (
              <option key={b} value={b} className="bg-[#111827] text-slate-200">
                {formatBudgetLabel(b)} ({b.toLocaleString()})
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
