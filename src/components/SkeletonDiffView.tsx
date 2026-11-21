import { ComputedNodePlan } from '../types/context';

interface SkeletonDiffViewProps {
  nodePlans: ComputedNodePlan[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function SkeletonDiffView({
  nodePlans,
  selectedNodeId,
  onSelectNode,
}: SkeletonDiffViewProps) {
  const activePlan =
    nodePlans.find((p) => p.node.id === selectedNodeId) ??
    nodePlans.find((p) => p.tier === 'skeleton') ??
    nodePlans[0];

  if (!activePlan) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0B0F17] text-sm text-slate-400">
        目前沒有可以對照的程式碼
      </div>
    );
  }

  const { node } = activePlan;
  const savedPct =
    node.rawTokens > 0
      ? Math.max(0, Math.round(((node.rawTokens - node.skeletonTokens) / node.rawTokens) * 100))
      : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0B0F17]">
      {/* Selector & Reduction Summary */}
      <div className="px-5 py-3 border-b border-slate-800/80 bg-[#0E1420] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label htmlFor="diff-symbol-select" className="text-xs text-slate-400 whitespace-nowrap">
            選擇要看的函式
          </label>
          <select
            id="diff-symbol-select"
            value={activePlan.node.id}
            onChange={(e) => onSelectNode(e.target.value)}
            className="h-8 bg-[#0B0F17] border border-slate-700/80 rounded px-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-400 cursor-pointer"
          >
            {nodePlans.map((p) => (
              <option key={p.node.id} value={p.node.id}>
                {p.node.filePath.split('/').pop()} › {p.node.name} ({p.node.rawTokens} tk)
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
          <span className="text-slate-400">
            原本 {node.rawTokens} tk
          </span>
          <span className="text-slate-600">→</span>
          <span className="text-amber-300">
            精簡後 {node.skeletonTokens} tk
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-emerald-400 font-semibold">省下 {savedPct}%</span>
        </div>
      </div>

      {/* Side-by-Side Comparison */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80">
        <div className="flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-slate-800/80 bg-[#111827] flex items-center justify-between text-xs">
            <span className="font-medium text-slate-200">原本完整程式碼（要修改它時才給完整）</span>
            <span className="font-mono tabular-nums text-slate-400">
              {node.lineCount} 行 · {node.rawTokens} tokens
            </span>
          </div>
          <pre className="flex-1 p-4 overflow-auto text-[12px] leading-relaxed font-mono text-slate-300 bg-[#0B0F17]">
            <code>{node.fullCode}</code>
          </pre>
        </div>

        <div className="flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-slate-800/80 bg-[#111827] flex items-center justify-between text-xs">
            <span className="font-medium text-amber-300">精簡外框版（只留名稱、參數與格式）</span>
            <span className="font-mono tabular-nums text-slate-400">
              折疊實作細節 · {node.skeletonTokens} tokens
            </span>
          </div>
          <pre className="flex-1 p-4 overflow-auto text-[12px] leading-relaxed font-mono text-amber-100/90 bg-[#0B0F17]">
            <code>{node.skeletonCode}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
