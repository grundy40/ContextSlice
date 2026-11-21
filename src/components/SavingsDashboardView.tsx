import { useMemo, useState } from 'react';
import { ArrowRight, Play, RotateCcw, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { assembleDynamicContext } from '../engine/contextAssembler';
import {
  BenchmarkRow,
  ContextAssemblyResult,
  OverrideMode,
  ParsedWorkspace,
  SessionTokenSnapshot,
} from '../types/context';

interface SavingsDashboardViewProps {
  assembly: ContextAssemblyResult;
  workspace: ParsedWorkspace;
  currentQuery: string;
  maxHops: 1 | 2;
  autoExpandClusters: boolean;
  sessionHistory: SessionTokenSnapshot[];
  onClearHistory: () => void;
  onSetOverride: (nodeId: string, override: OverrideMode) => void;
  onSelectNode: (nodeId: string) => void;
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SessionTokenSnapshot }>;
}

function SessionTrendTooltip({ active, payload }: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-700 bg-[#0E1420] px-3 py-2 shadow-xl text-[11px] space-y-1">
      <div className="flex items-center justify-between gap-4 font-mono text-slate-300 border-b border-slate-800 pb-1">
        <span className="font-semibold text-sky-300">{item.stepLabel}</span>
        <span className="text-slate-400">{item.timestamp}</span>
      </div>
      <div className="text-slate-300 max-w-[220px] truncate">{item.querySummary}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono tabular-nums pt-0.5">
        <span className="text-slate-400">送給 AI</span>
        <span className="text-right text-sky-300 font-semibold">
          {item.injectedTokens.toLocaleString()} tk
        </span>
        <span className="text-slate-400">上限設定</span>
        <span className="text-right text-amber-300">
          {item.budgetTokens.toLocaleString()} tk
        </span>
        <span className="text-slate-400">使用比例</span>
        <span
          className={`text-right font-semibold ${
            item.utilizationPercent > 100 ? 'text-rose-400' : 'text-emerald-400'
          }`}
        >
          {item.utilizationPercent}%
        </span>
        <span className="text-slate-400">自動補齊</span>
        <span className="text-right text-emerald-300">{item.autoExpandedCount} 處</span>
      </div>
    </div>
  );
}

export function SavingsDashboardView({
  assembly,
  workspace,
  currentQuery,
  maxHops,
  autoExpandClusters,
  sessionHistory,
  onClearHistory,
  onSetOverride,
  onSelectNode,
}: SavingsDashboardViewProps) {
  const { metrics, nodePlans } = assembly;
  const maxBar = Math.max(1, metrics.traditionalTotalTokens);
  const [benchmarkRows, setBenchmarkRows] = useState<BenchmarkRow[] | null>(null);

  const throttleAnalysis = useMemo(() => {
    const inDegreeMap = new Map<string, number>();
    const outDegreeMap = new Map<string, number>();
    const crossFileMap = new Map<string, number>();

    for (const edge of workspace.edges) {
      outDegreeMap.set(edge.sourceNodeId, (outDegreeMap.get(edge.sourceNodeId) ?? 0) + 1);
      inDegreeMap.set(edge.targetNodeId, (inDegreeMap.get(edge.targetNodeId) ?? 0) + 1);
      if (edge.sourceFileId !== edge.targetFileId) {
        crossFileMap.set(edge.sourceNodeId, (crossFileMap.get(edge.sourceNodeId) ?? 0) + 1);
        crossFileMap.set(edge.targetNodeId, (crossFileMap.get(edge.targetNodeId) ?? 0) + 1);
      }
    }

    const candidates = nodePlans
      .filter((plan) => {
        if (plan.isFocal) return false;
        if (plan.tier !== 'full') return false;
        if (plan.override === 'skeleton') return false;
        return plan.injectedTokens - plan.node.skeletonTokens > 12;
      })
      .map((plan) => {
        const inDegree = inDegreeMap.get(plan.node.id) ?? 0;
        const outDegree = outDegreeMap.get(plan.node.id) ?? 0;
        const crossFileCount = crossFileMap.get(plan.node.id) ?? 0;
        const savingsTokens = Math.max(0, plan.injectedTokens - plan.node.skeletonTokens);
        const savingsPercent =
          plan.injectedTokens > 0
            ? Math.round((savingsTokens / plan.injectedTokens) * 100)
            : 0;

        const priorityScore =
          savingsTokens *
          (1 +
            (inDegree >= 2 ? 0.35 : 0) +
            (crossFileCount > 0 ? 0.2 : 0) +
            (plan.autoExpanded ? 0.15 : 0));

        let reason: string;
        if (inDegree >= 2) {
          reason = `被 ${inDegree} 處程式呼叫（高入度共用介面），改為僅顯示簽名即可讓 AI 看懂參數與回傳型別`;
        } else if (plan.autoExpanded) {
          reason = `系統因關聯度較高自動展開（${plan.node.lineCount} 行），若本次不改內部實作，保留簽名即可省下 ${savingsTokens} tk`;
        } else if (crossFileCount > 0) {
          reason = `跨檔案關聯節點（連結 ${crossFileCount} 條跨檔邊），保留簽名外框即可維持跨檔呼叫正確性`;
        } else {
          reason = `非本次修改焦點但佔用 ${plan.injectedTokens} tk，改為僅顯示簽名可立即釋放 ${savingsPercent}% 額度`;
        }

        return {
          plan,
          inDegree,
          outDegree,
          crossFileCount,
          savingsTokens,
          savingsPercent,
          priorityScore,
          reason,
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 5);

    const manualSkeletonPlans = nodePlans.filter((p) => p.override === 'skeleton');
    const totalPotentialSavings = candidates.reduce((sum, c) => sum + c.savingsTokens, 0);
    const projectedTokens = Math.max(0, assembly.totalInjectedTokens - totalPotentialSavings);
    const projectedUtilPercent =
      assembly.budgetTokens > 0
        ? Math.round((projectedTokens / assembly.budgetTokens) * 100)
        : 0;

    return {
      candidates,
      manualSkeletonPlans,
      totalPotentialSavings,
      projectedTokens,
      projectedUtilPercent,
    };
  }, [workspace.edges, nodePlans, assembly.totalInjectedTokens, assembly.budgetTokens]);

  const applyAllThrottleRecommendations = () => {
    for (const item of throttleAnalysis.candidates) {
      onSetOverride(item.plan.node.id, 'skeleton');
    }
  };

  const resetManualSkeletons = () => {
    for (const plan of throttleAnalysis.manualSkeletonPlans) {
      onSetOverride(plan.node.id, 'auto');
    }
  };

  const runLiveBenchmark = () => {
    const callableNodes = workspace.nodes.filter(
      (n) => n.kind === 'function' || n.kind === 'method' || n.kind === 'class',
    );
    const secondTarget = callableNodes[Math.min(1, Math.max(0, callableNodes.length - 1))]?.name ?? 'handler';
    const thirdTarget = callableNodes[Math.min(3, Math.max(0, callableNodes.length - 1))]?.name ?? 'service';

    const scenarios: Array<{
      id: string;
      label: string;
      query: string;
      hops: 1 | 2;
      budget: number;
    }> = [
      {
        id: 'bench-current',
        label: '情境 A：目前任務設定',
        query: currentQuery || callableNodes[0]?.name || 'main',
        hops: maxHops,
        budget: assembly.budgetTokens,
      },
      {
        id: 'bench-tight',
        label: '情境 B：小額度精簡（1層 / 4K）',
        query: secondTarget,
        hops: 1,
        budget: 4000,
      },
      {
        id: 'bench-deep',
        label: '情境 C：深度關聯（2層 / 16K）',
        query: thirdTarget,
        hops: 2,
        budget: 16000,
      },
    ];

    const rows: BenchmarkRow[] = scenarios.map((sc) => {
      const t0 = performance.now();
      const res = assembleDynamicContext({
        workspace,
        query: sc.query,
        pinnedFocalIds: [],
        overrides: {},
        budgetTokens: sc.budget,
        maxHops: sc.hops,
        autoExpandClusters,
      });
      const elapsedMs = Number((performance.now() - t0).toFixed(2));
      return {
        id: sc.id,
        label: sc.label,
        query: sc.query,
        rawTokens: res.metrics.rawRepoTokens,
        traditionalTokens: res.metrics.traditionalTotalTokens,
        slicedTokens: res.totalInjectedTokens,
        reductionPercent: res.metrics.netSavingsVsTraditionalPercent,
        elapsedMs,
        autoExpandedCount: res.autoExpandedNodeIds.length,
        withinBudget: !res.overBudget,
      };
    });

    setBenchmarkRows(rows);
  };

  const avgUtil =
    sessionHistory.length > 0
      ? Number(
          (
            sessionHistory.reduce((sum, s) => sum + s.utilizationPercent, 0) /
            sessionHistory.length
          ).toFixed(1),
        )
      : 0;
  const peakTokens =
    sessionHistory.length > 0
      ? Math.max(...sessionHistory.map((s) => s.injectedTokens))
      : 0;

  const bars = [
    {
      label: '傳統做法：裝 20 個工具 + 完整讀檔（說明書佔掉一大塊）',
      tokens: metrics.traditionalTotalTokens,
      taxTokens: metrics.traditionalSkillAndMcpTax,
      codeTokens: metrics.traditionalMultiTurnReadBloat,
      taxNote: `工具說明書就佔 ${metrics.traditionalSkillAndMcpTax.toLocaleString()} tk`,
      barColor: 'bg-rose-500/80',
      taxColor: 'bg-rose-400',
    },
    {
      label: '極簡 1 工具模式（推薦：只裝 1 個自動切片工具）',
      tokens: metrics.thinMcpTotalTokens,
      taxTokens: metrics.thinMcpSchemaTax,
      codeTokens: metrics.slicedCodeTokens,
      taxNote: `只花 1 個工具說明 ${metrics.thinMcpSchemaTax} tk`,
      barColor: 'bg-amber-400/80',
      taxColor: 'bg-amber-300',
    },
    {
      label: '免裝工具模式（不掛 MCP，只寫一句超短規則讓 AI 自己讀檔）',
      tokens: metrics.zeroTaxTotalTokens + metrics.zeroMcpRuleTax,
      taxTokens: metrics.zeroMcpRuleTax,
      codeTokens: metrics.slicedCodeTokens,
      taxNote: `免工具費 · 只用 ${metrics.zeroMcpRuleTax} tk 短規則`,
      barColor: 'bg-sky-400/85',
      taxColor: 'bg-sky-300',
    },
    {
      label: '直接複製 / 腳本整理好再貼給 AI（最省、零額外花費）',
      tokens: metrics.zeroTaxTotalTokens,
      taxTokens: 0,
      codeTokens: metrics.slicedCodeTokens,
      taxNote: '0 額外花費（全部額度都留給程式碼）',
      barColor: 'bg-emerald-400/85',
      taxColor: 'bg-emerald-300',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[#0B0F17] p-6 space-y-6">
      {/* 4-Column Metric Strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 border border-slate-800/80 bg-[#111827] rounded-lg divide-y xl:divide-y-0 xl:divide-x divide-slate-800/80">
        <div className="p-4">
          <div className="text-xs text-slate-400">原本全部程式碼大小</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold tabular-nums text-slate-100">
            {metrics.rawRepoTokens.toLocaleString()}
            <span className="ml-1.5 text-xs font-normal text-slate-400">tokens</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">如果不精簡，直接全貼給 AI 的量</div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">精簡整理後的大小</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold tabular-nums text-emerald-400">
            {metrics.slicedCodeTokens.toLocaleString()}
            <span className="ml-1.5 text-xs font-normal text-slate-400">tokens</span>
          </div>
          <div className="mt-1 text-xs text-emerald-400/90 tabular-nums">
            體積縮小了 {metrics.codeReductionPercent}%
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">傳統 AI 工具的總花費</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold tabular-nums text-rose-400">
            {metrics.traditionalTotalTokens.toLocaleString()}
            <span className="ml-1.5 text-xs font-normal text-slate-400">tokens</span>
          </div>
          <div className="mt-1 text-xs text-slate-400 tabular-nums">
            光工具說明書就先扣 {metrics.traditionalSkillAndMcpTax.toLocaleString()} tk
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">總共幫你省下</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold tabular-nums text-sky-400">
            {metrics.netSavingsVsTraditionalPercent}%
          </div>
          <div className="mt-1 text-xs text-slate-400 tabular-nums">
            每次問 AI 少花 {(metrics.traditionalTotalTokens - metrics.zeroTaxTotalTokens).toLocaleString()} tokens
          </div>
        </div>
      </div>

      {/* Mini-Line Chart: Last 10 Session States Token Budget Trend */}
      <section
        aria-label="最近 10 次操作的 Token 花費變化"
        className="border border-slate-800/80 bg-[#111827] rounded-lg p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              最近 10 次操作的 Token 花費變化
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              每次你改搜尋字、調上限或自動補齊程式，這裡都會記下來，方便比較哪種設定最剛好
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono tabular-nums">
            <span className="flex items-center gap-1.5 text-sky-300">
              <span className="w-2.5 h-0.5 bg-sky-400 inline-block" />
              實際送出量
            </span>
            <span className="flex items-center gap-1.5 text-amber-300">
              <span className="w-2.5 h-0.5 border-t border-dashed border-amber-400 inline-block" />
              設定的上限
            </span>
            <span className="text-slate-400">
              {sessionHistory.length}/10 筆（跨重整保存）· 平均用掉 {avgUtil}% · 最高 {peakTokens.toLocaleString()} tk
            </span>
            {sessionHistory.length > 1 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="px-2 py-1 rounded border border-slate-800 bg-[#0B0F17] hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                清空紀錄
              </button>
            )}
          </div>
        </div>

        <div className="h-[156px] w-full">
          {sessionHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sessionHistory} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="stepLabel"
                  tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                />
                <YAxis
                  width={54}
                  tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
                />
                <Tooltip content={<SessionTrendTooltip />} cursor={{ stroke: '#475569', strokeDasharray: '3 3' }} />
                <Line
                  type="monotone"
                  dataKey="budgetTokens"
                  name="上限設定"
                  stroke="#FBBF24"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="injectedTokens"
                  name="實際送出"
                  stroke="#38BDF8"
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: '#38BDF8', stroke: '#0B0F17', strokeWidth: 1.5 }}
                  activeDot={{ r: 5, fill: '#38BDF8', stroke: '#F8FAFC', strokeWidth: 1.5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              還沒有操作紀錄
            </div>
          )}
        </div>
      </section>

      {/* Smart Throttling Strategy (Dependency Graph Analysis) */}
      <section
        aria-label="智能節流策略"
        className="border border-sky-500/25 bg-[#111827] rounded-lg p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
              <h3 className="text-sm font-semibold text-slate-100">
                智能節流策略（依賴圖分析建議）
              </h3>
              {throttleAnalysis.manualSkeletonPlans.length > 0 && (
                <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[11px] font-mono text-amber-300">
                  已手動套用 {throttleAnalysis.manualSkeletonPlans.length} 項「僅顯示簽名」
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              根據依賴圖的呼叫入度、跨檔關聯與目前 Token 佔比，找出不需展開實作細節的節點，建議手動設為「僅顯示簽名」以最大化 Token 效率
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {throttleAnalysis.manualSkeletonPlans.length > 0 && (
              <button
                type="button"
                onClick={resetManualSkeletons}
                className="px-2.5 py-1.5 text-xs border border-slate-700 bg-[#0B0F17] hover:bg-slate-800 text-slate-300 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                還原自動判斷
              </button>
            )}
            {throttleAnalysis.candidates.length > 0 && (
              <button
                type="button"
                onClick={applyAllThrottleRecommendations}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                一鍵套用 {throttleAnalysis.candidates.length} 項建議
              </button>
            )}
          </div>
        </div>

        {throttleAnalysis.candidates.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3.5 py-2.5">
                <div className="text-[11px] text-slate-400">建議設為「僅顯示簽名」</div>
                <div className="mt-1 text-base font-mono font-semibold text-amber-300 tabular-nums">
                  {throttleAnalysis.candidates.length} 個節點
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3.5 py-2.5">
                <div className="text-[11px] text-slate-400">套用後可再省下</div>
                <div className="mt-1 text-base font-mono font-semibold text-emerald-400 tabular-nums">
                  -{throttleAnalysis.totalPotentialSavings.toLocaleString()} tokens
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3.5 py-2.5">
                <div className="text-[11px] text-slate-400">預估優化後送出量</div>
                <div className="mt-1 text-base font-mono font-semibold text-sky-300 tabular-nums">
                  {throttleAnalysis.projectedTokens.toLocaleString()} tk
                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                    （佔上限 {throttleAnalysis.projectedUtilPercent}%）
                  </span>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-800/70 border border-slate-800/80 rounded-md bg-[#0B0F17]">
              {throttleAnalysis.candidates.map((item) => {
                const { plan } = item;
                return (
                  <div
                    key={plan.node.id}
                    className="p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-900/50 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectNode(plan.node.id)}
                          className="font-mono text-xs font-semibold text-slate-100 hover:text-sky-300 transition-colors cursor-pointer"
                        >
                          {plan.node.name}
                        </button>
                        <span className="text-[11px] font-mono text-slate-500 truncate">
                          {plan.node.filePath}:{plan.node.startLine}-{plan.node.endLine}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800/90 text-[10px] font-mono text-slate-300">
                          入度 {item.inDegree} · 出度 {item.outDegree}
                        </span>
                        {item.crossFileCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-[10px] font-mono text-sky-300">
                            跨檔 {item.crossFileCount} 邊
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{item.reason}</p>
                    </div>

                    <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
                      <div className="text-right font-mono tabular-nums text-[11px]">
                        <div className="flex items-center gap-1 text-slate-300">
                          <span>{plan.injectedTokens} tk</span>
                          <ArrowRight className="w-3 h-3 text-slate-500" />
                          <span className="text-amber-300 font-semibold">
                            {plan.node.skeletonTokens} tk
                          </span>
                        </div>
                        <div className="text-emerald-400">
                          省 {item.savingsTokens} tk (-{item.savingsPercent}%)
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSetOverride(plan.node.id, 'skeleton')}
                        className="px-2.5 py-1.5 rounded border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer"
                      >
                        設為僅顯示簽名
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300 flex items-center justify-between gap-3">
            <span>
              依賴圖檢查完成：目前非核心節點已經處於最佳精簡狀態，或已沒有體積較大且可改為「僅顯示簽名」的完整節點。
            </span>
          </div>
        )}
      </section>

      {/* Protocol & Skill Tax Comparison Chart */}
      <section className="border border-slate-800/80 bg-[#111827] rounded-lg p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              不同用法差多少 Token？（為什麼不要裝一堆工具？）
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              工具裝太多時，每次對話 AI 都要先重讀一大疊說明書；把挑選程式的工作移到外面做，就能省下大量無謂花費
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            比較基準：問一次修改任務
          </span>
        </div>

        <div className="space-y-4">
          {bars.map((item) => {
            const taxPct = (item.taxTokens / maxBar) * 100;
            const codePct = (item.codeTokens / maxBar) * 100;
            return (
              <div key={item.label} className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-200">{item.label}</span>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="text-slate-400">{item.taxNote}</span>
                    <span className="text-slate-100 font-semibold">
                      {item.tokens.toLocaleString()} tk
                    </span>
                  </div>
                </div>
                <div className="h-3 w-full bg-[#0B0F17] rounded overflow-hidden flex border border-slate-800/80">
                  {taxPct > 0 && (
                    <div
                      className={`h-full ${item.taxColor}`}
                      style={{ width: `${Math.max(0.8, taxPct)}%` }}
                      title={`協議與規則稅：${item.taxTokens} tokens`}
                    />
                  )}
                  <div
                    className={`h-full ${item.barColor}`}
                    style={{ width: `${Math.max(1.2, codePct)}%` }}
                    title={`代碼上下文：${item.codeTokens} tokens`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Multi-Scenario Real-Time Benchmark Runner */}
      <section className="border border-slate-800/80 bg-[#111827] rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              多任務實戰基準測試（Benchmark）
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              直接用目前載入的專案程式碼，實測三種常見任務與預算下的精簡效率與運算速度
            </p>
          </div>
          <button
            type="button"
            disabled={workspace.nodes.length === 0}
            onClick={runLiveBenchmark}
            className="px-3.5 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            {benchmarkRows ? '重新跑一次實測' : '跑 3 種情境實測'}
          </button>
        </div>

        {benchmarkRows ? (
          <div className="overflow-x-auto border border-slate-800/80 rounded-md">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-[#0E1420] text-[11px] font-medium text-slate-400">
                  <th className="py-2 px-3">測試情境</th>
                  <th className="py-2 px-3">搜尋關鍵字</th>
                  <th className="py-2 px-3 text-right">傳統總花費</th>
                  <th className="py-2 px-3 text-right">實測精簡量</th>
                  <th className="py-2 px-3 text-right">總省下</th>
                  <th className="py-2 px-3 text-right">自動補齊</th>
                  <th className="py-2 px-3 text-right">耗時</th>
                  <th className="py-2 px-3 text-right">預算狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {benchmarkRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-medium text-slate-200 whitespace-nowrap">{row.label}</td>
                    <td className="py-2 px-3 font-mono text-slate-400 max-w-[160px] truncate">{row.query}</td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-rose-400">
                      {row.traditionalTokens.toLocaleString()} tk
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-sky-300 font-semibold">
                      {row.slicedTokens.toLocaleString()} tk
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-400 font-semibold">
                      {row.reductionPercent}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                      {row.autoExpandedCount} 處
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400">
                      {row.elapsedMs} ms
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          row.withinBudget
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {row.withinBudget ? '額度內通過' : '超出上限'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-800 bg-[#0B0F17] py-4 px-4 text-xs text-slate-500 text-center">
            點擊右上角「跑 3 種情境實測」，系統會立即用目前專案跑完基準測試並列出比較結果
          </div>
        )}
      </section>

      {/* High-Density Symbol Breakdown Table */}
      <section className="border border-slate-800/80 bg-[#111827] rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">每個函式佔用多少 Token（可單獨調整）</h3>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            共 {nodePlans.length} 個函式 / 區塊
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 bg-[#0E1420] text-[11px] font-medium text-slate-400">
                <th className="py-2.5 px-4">函式名稱與位置</th>
                <th className="py-2.5 px-3 text-right">行數</th>
                <th className="py-2.5 px-3 text-right">原本大小</th>
                <th className="py-2.5 px-3 text-right">實際送出</th>
                <th className="py-2.5 px-3 text-right">省下</th>
                <th className="py-2.5 px-3">關聯距離</th>
                <th className="py-2.5 px-4 text-right">要給 AI 看多少</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {nodePlans.map((plan) => {
                const savedPct =
                  plan.node.rawTokens > 0
                    ? Math.max(
                        0,
                        Math.round(
                          ((plan.node.rawTokens - plan.injectedTokens) / plan.node.rawTokens) * 100,
                        ),
                      )
                    : 0;
                return (
                  <tr
                    key={plan.node.id}
                    className="h-10 hover:bg-slate-800/35 transition-colors"
                  >
                    <td className="py-2 px-4">
                      <button
                        type="button"
                        onClick={() => onSelectNode(plan.node.id)}
                        className="text-left hover:text-sky-300 transition-colors cursor-pointer"
                      >
                        <div className="font-mono font-medium text-slate-100">
                          {plan.node.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {plan.node.filePath}:{plan.node.startLine}-{plan.node.endLine}
                        </div>
                      </button>
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                      {plan.node.lineCount}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400">
                      {plan.node.rawTokens}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-medium text-slate-100">
                      {plan.injectedTokens}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-400">
                      {savedPct}%
                    </td>
                    <td className="py-2 px-3 text-slate-300 whitespace-nowrap">
                      {plan.hopDistance === 0
                        ? '修改重點'
                        : plan.hopDistance !== null
                          ? `隔 ${plan.hopDistance} 層`
                          : '無直接關聯'}
                    </td>
                    <td className="py-2 px-4 text-right">
                      <div className="inline-flex items-center p-0.5 bg-[#0B0F17] border border-slate-800 rounded">
                        {(['auto', 'full', 'skeleton', 'exclude'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => onSetOverride(plan.node.id, mode)}
                            className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer whitespace-nowrap ${
                              plan.override === mode
                                ? 'bg-slate-800 text-sky-300 font-medium'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {mode === 'auto'
                              ? '自動'
                              : mode === 'full'
                                ? '給完整'
                                : mode === 'skeleton'
                                  ? '只留外框'
                                  : '略過'}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
