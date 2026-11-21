import { FolderOpen, RotateCcw, Search, Sparkles, Zap } from 'lucide-react';

interface ToolbarControlsProps {
  projectLabel: string;
  fileCount: number;
  onOpenImport: () => void;
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
  onOpenImport,
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
        <button
          type="button"
          onClick={onOpenImport}
          title="點擊更換或匯入專案資料夾／檔案"
          className="h-9 bg-[#0B0F17] border border-slate-700/80 hover:border-sky-500/50 rounded-md px-3 text-xs font-medium text-slate-200 flex items-center gap-2 transition-colors cursor-pointer max-w-[260px]"
        >
          <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="truncate">{fileCount > 0 ? projectLabel : '尚未匯入專案'}</span>
          {fileCount > 0 && (
            <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
              ({fileCount})
            </span>
          )}
        </button>

        <div className="relative flex-1 min-w-[220px] max-w-md flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => onChangeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAutoFocusByQuery();
            }}
            placeholder="輸入想改的功能或函式名稱（例：login、order、retry）"
            className="w-full h-9 pl-8 pr-24 bg-[#0B0F17] border border-slate-700/80 rounded-md text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
          />
          <button
            type="button"
            onClick={onAutoFocusByQuery}
            title="根據輸入內容，自動幫你找出最相關的程式"
            className="absolute right-1 h-7 px-2.5 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-sky-300 rounded flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3 h-3" />
            自動找重點
          </button>
        </div>
      </div>

      {/* Right: Hop Depth & Token Budget Controls */}
      <div className="flex flex-wrap items-center gap-4 shrink-0">
        {/* Hop segmented control */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 whitespace-nowrap">關聯範圍</span>
          <div className="flex items-center p-0.5 bg-[#0B0F17] border border-slate-800 rounded-md">
            {([1, 2] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => onChangeHops(h)}
                title={h === 1 ? '只找直接連到的程式（最省 Token）' : '多往外找一層間接相關的程式'}
                className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 ${
                  maxHops === h
                    ? 'bg-sky-500/20 text-sky-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {h === 1 ? '1層相關' : '2層相關'}
              </button>
            ))}
          </div>
        </div>

        {/* Proactive Discovery mode toggle */}
        <button
          type="button"
          onClick={onToggleAutoExpand}
          title="開啟後，遇到太複雜、只看標題不夠的程式時，會自動展開完整內容給 AI 看"
          className={`h-8 px-2.5 text-xs font-medium rounded-md border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            autoExpandClusters
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/20'
              : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5 shrink-0" />
          <span>自動補齊重點</span>
          <span className="font-mono tabular-nums text-[11px] opacity-90">
            {autoExpandClusters
              ? autoExpandedCount > 0
                ? `(${autoExpandedCount})`
                : '(開)'
              : detectedClusterCount > 0
                ? `(關·有 ${detectedClusterCount} 處可補)`
                : '(關)'}
          </span>
        </button>

        {/* Budget segmented presets */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 whitespace-nowrap">Token 上限</span>
          <div className="flex items-center p-0.5 bg-[#0B0F17] border border-slate-800 rounded-md">
            {BUDGET_OPTIONS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => onChangeBudget(b)}
                className={`px-2 py-1 text-xs font-mono tabular-nums rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-400 ${
                  budgetTokens === b
                    ? 'bg-sky-500/20 text-sky-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {formatBudgetLabel(b)}
              </button>
            ))}
          </div>
        </div>

        {overrideCount > 0 && (
          <button
            type="button"
            onClick={onResetOverrides}
            className="h-8 px-2.5 text-xs text-slate-300 hover:text-white border border-slate-700/80 hover:border-slate-600 rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            恢復全部自動 ({overrideCount})
          </button>
        )}
      </div>
    </section>
  );
}
