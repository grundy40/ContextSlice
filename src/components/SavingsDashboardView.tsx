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
import { useI18n } from '../i18n';
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
  const { t } = useI18n();
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
        <span className="text-slate-400">{t.dashboard.tooltipInjected}</span>
        <span className="text-right text-sky-300 font-semibold">
          {item.injectedTokens.toLocaleString()} tk
        </span>
        <span className="text-slate-400">{t.dashboard.tooltipBudget}</span>
        <span className="text-right text-amber-300">
          {item.budgetTokens.toLocaleString()} tk
        </span>
        <span className="text-slate-400">{t.dashboard.tooltipUtil}</span>
        <span
          className={`text-right font-semibold ${
            item.utilizationPercent > 100 ? 'text-rose-400' : 'text-emerald-400'
          }`}
        >
          {item.utilizationPercent}%
        </span>
        <span className="text-slate-400">{t.dashboard.tooltipAutoExpanded}</span>
        <span className="text-right text-emerald-300">{t.dashboard.tooltipPlaces(item.autoExpandedCount)}</span>
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
  const { locale, t } = useI18n();
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
          reason = t.dashboard.throttleReasonInDegree(inDegree);
        } else if (plan.autoExpanded) {
          reason = t.dashboard.throttleReasonAutoExpanded(plan.node.lineCount, savingsTokens);
        } else if (crossFileCount > 0) {
          reason = t.dashboard.throttleReasonCrossFile(crossFileCount);
        } else {
          reason = t.dashboard.throttleReasonDefault(plan.injectedTokens, savingsPercent);
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
  }, [workspace.edges, nodePlans, assembly.totalInjectedTokens, assembly.budgetTokens, t.dashboard]);

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
        label: t.dashboard.benchScenarioA,
        query: currentQuery || callableNodes[0]?.name || 'main',
        hops: maxHops,
        budget: assembly.budgetTokens,
      },
      {
        id: 'bench-tight',
        label: t.dashboard.benchScenarioB,
        query: secondTarget,
        hops: 1,
        budget: 4000,
      },
      {
        id: 'bench-deep',
        label: t.dashboard.benchScenarioC,
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
        locale,
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
      label: t.dashboard.taxBarTrad,
      tokens: metrics.traditionalTotalTokens,
      taxTokens: metrics.traditionalSkillAndMcpTax,
      codeTokens: metrics.traditionalMultiTurnReadBloat,
      taxNote: t.dashboard.taxBarTradNote(metrics.traditionalSkillAndMcpTax.toLocaleString()),
      barColor: 'bg-rose-500/80',
      taxColor: 'bg-rose-400',
    },
    {
      label: t.dashboard.taxBarThin,
      tokens: metrics.thinMcpTotalTokens,
      taxTokens: metrics.thinMcpSchemaTax,
      codeTokens: metrics.slicedCodeTokens,
      taxNote: t.dashboard.taxBarThinNote(metrics.thinMcpSchemaTax),
      barColor: 'bg-amber-400/80',
      taxColor: 'bg-amber-300',
    },
    {
      label: t.dashboard.taxBarZero,
      tokens: metrics.zeroTaxTotalTokens + metrics.zeroMcpRuleTax,
      taxTokens: metrics.zeroMcpRuleTax,
      codeTokens: metrics.slicedCodeTokens,
      taxNote: t.dashboard.taxBarZeroNote(metrics.zeroMcpRuleTax),
      barColor: 'bg-sky-400/85',
      taxColor: 'bg-sky-300',
    },
    {
      label: t.dashboard.taxBarDirect,
      tokens: metrics.zeroTaxTotalTokens,
      taxTokens: 0,
      codeTokens: metrics.slicedCodeTokens,
      taxNote: t.dashboard.taxBarDirectNote,
      barColor: 'bg-emerald-400/85',
      taxColor: 'bg-emerald-300',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[#0B0F17] p-6 space-y-6">
      {/* 4-Column Metric Strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 border border-slate-800/80 bg-[#111827] rounded-lg divide-y xl:divide-y-0 xl:divide-x divide-slate-800/80">
        <div className="p-4">
          <div className="text-xs text-slate-400">{t.dashboard.rawTitle}</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold tabular-nums text-slate-100">
            {metrics.rawRepoTokens.toLocaleString()}
            <span className="ml-1.5 text-xs font-normal text-slate-400">tokens</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">{t.dashboard.rawNote}</div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">{t.dashboard.slicedTitle}</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold tabular-nums text-emerald-400">
            {metrics.slicedCodeTokens.toLocaleString()}
            <span className="ml-1.5 text-xs font-normal text-slate-400">tokens</span>
          </div>
          <div className="mt-1 text-xs text-emerald-400/90 tabular-nums">
            {t.dashboard.slicedNote(metrics.codeReductionPercent)}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">{t.dashboard.tradTitle}</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold tabular-nums text-rose-400">
            {metrics.traditionalTotalTokens.toLocaleString()}
            <span className="ml-1.5 text-xs font-normal text-slate-400">tokens</span>
          </div>
          <div className="mt-1 text-xs text-slate-400 tabular-nums">
            {t.dashboard.tradNote(metrics.traditionalSkillAndMcpTax.toLocaleString())}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400">{t.dashboard.savedTitle}</div>
          <div className="mt-1.5 text-2xl font-mono font-semibold tabular-nums text-sky-400">
            {metrics.netSavingsVsTraditionalPercent}%
          </div>
          <div className="mt-1 text-xs text-slate-400 tabular-nums">
            {t.dashboard.savedNote((metrics.traditionalTotalTokens - metrics.zeroTaxTotalTokens).toLocaleString())}
          </div>
        </div>
      </div>

      {/* Mini-Line Chart: Last 10 Session States Token Budget Trend */}
      <section
        aria-label={t.dashboard.trendAria}
        className="border border-slate-800/80 bg-[#111827] rounded-lg p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              {t.dashboard.trendTitle}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {t.dashboard.trendDesc}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono tabular-nums">
            <span className="flex items-center gap-1.5 text-sky-300">
              <span className="w-2.5 h-0.5 bg-sky-400 inline-block" />
              {t.dashboard.trendLegendActual}
            </span>
            <span className="flex items-center gap-1.5 text-amber-300">
              <span className="w-2.5 h-0.5 border-t border-dashed border-amber-400 inline-block" />
              {t.dashboard.trendLegendBudget}
            </span>
            <span className="text-slate-400">
              {t.dashboard.trendSummary(sessionHistory.length, avgUtil, peakTokens.toLocaleString())}
            </span>
            {sessionHistory.length > 1 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="px-2 py-1 rounded border border-slate-800 bg-[#0B0F17] hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                {t.dashboard.trendClear}
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
                  name={t.dashboard.trendSeriesBudget}
                  stroke="#FBBF24"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="injectedTokens"
                  name={t.dashboard.trendSeriesActual}
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
              {t.dashboard.trendEmpty}
            </div>
          )}
        </div>
      </section>

      {/* Smart Throttling Strategy (Dependency Graph Analysis) */}
      <section
        aria-label={t.dashboard.throttleAria}
        className="border border-sky-500/25 bg-[#111827] rounded-lg p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
              <h3 className="text-sm font-semibold text-slate-100">
                {t.dashboard.throttleTitle}
              </h3>
              {throttleAnalysis.manualSkeletonPlans.length > 0 && (
                <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[11px] font-mono text-amber-300">
                  {t.dashboard.throttleManualBadge(throttleAnalysis.manualSkeletonPlans.length)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {t.dashboard.throttleDesc}
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
                {t.dashboard.throttleReset}
              </button>
            )}
            {throttleAnalysis.candidates.length > 0 && (
              <button
                type="button"
                onClick={applyAllThrottleRecommendations}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {t.dashboard.throttleApplyAll(throttleAnalysis.candidates.length)}
              </button>
            )}
          </div>
        </div>

        {throttleAnalysis.candidates.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3.5 py-2.5">
                <div className="text-[11px] text-slate-400">{t.dashboard.throttleCandidatesLabel}</div>
                <div className="mt-1 text-base font-mono font-semibold text-amber-300 tabular-nums">
                  {t.dashboard.throttleCandidatesCount(throttleAnalysis.candidates.length)}
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3.5 py-2.5">
                <div className="text-[11px] text-slate-400">{t.dashboard.throttleSavingsLabel}</div>
                <div className="mt-1 text-base font-mono font-semibold text-emerald-400 tabular-nums">
                  -{throttleAnalysis.totalPotentialSavings.toLocaleString()} tokens
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-[#0B0F17] px-3.5 py-2.5">
                <div className="text-[11px] text-slate-400">{t.dashboard.throttleProjectedLabel}</div>
                <div className="mt-1 text-base font-mono font-semibold text-sky-300 tabular-nums">
                  {throttleAnalysis.projectedTokens.toLocaleString()} tk
                  <span className="ml-1.5 text-xs font-normal text-slate-400">
                    {t.dashboard.throttleProjectedNote(throttleAnalysis.projectedUtilPercent)}
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
                          {t.dashboard.throttleInOut(item.inDegree, item.outDegree)}
                        </span>
                        {item.crossFileCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-[10px] font-mono text-sky-300">
                            {t.dashboard.throttleCrossFile(item.crossFileCount)}
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
                          {t.dashboard.throttleSaveLine(item.savingsTokens, item.savingsPercent)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSetOverride(plan.node.id, 'skeleton')}
                        className="px-2.5 py-1.5 rounded border border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer"
                      >
                        {t.dashboard.throttleSetBtn}
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
              {t.dashboard.throttleOptimal}
            </span>
          </div>
        )}
      </section>

      {/* Protocol & Skill Tax Comparison Chart */}
      <section className="border border-slate-800/80 bg-[#111827] rounded-lg p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              {t.dashboard.taxTitle}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {t.dashboard.taxDesc}
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {t.dashboard.taxBaseline}
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
                      title={t.dashboard.taxTooltipProtocol(item.taxTokens)}
                    />
                  )}
                  <div
                    className={`h-full ${item.barColor}`}
                    style={{ width: `${Math.max(1.2, codePct)}%` }}
                    title={t.dashboard.taxTooltipCode(item.codeTokens)}
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
              {t.dashboard.benchTitle}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {t.dashboard.benchDesc}
            </p>
          </div>
          <button
            type="button"
            disabled={workspace.nodes.length === 0}
            onClick={runLiveBenchmark}
            className="px-3.5 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            {benchmarkRows ? t.dashboard.benchRunAgain : t.dashboard.benchRun}
          </button>
        </div>

        {benchmarkRows ? (
          <div className="overflow-x-auto border border-slate-800/80 rounded-md">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-[#0E1420] text-[11px] font-medium text-slate-400">
                  <th className="py-2 px-3">{t.dashboard.benchColScenario}</th>
                  <th className="py-2 px-3">{t.dashboard.benchColQuery}</th>
                  <th className="py-2 px-3 text-right">{t.dashboard.benchColTrad}</th>
                  <th className="py-2 px-3 text-right">{t.dashboard.benchColSliced}</th>
                  <th className="py-2 px-3 text-right">{t.dashboard.benchColSaved}</th>
                  <th className="py-2 px-3 text-right">{t.dashboard.benchColAuto}</th>
                  <th className="py-2 px-3 text-right">{t.dashboard.benchColTime}</th>
                  <th className="py-2 px-3 text-right">{t.dashboard.benchColStatus}</th>
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
                      {t.dashboard.tooltipPlaces(row.autoExpandedCount)}
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
                        {row.withinBudget ? t.dashboard.benchWithin : t.dashboard.benchOver}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-800 bg-[#0B0F17] py-4 px-4 text-xs text-slate-500 text-center">
            {t.dashboard.benchEmpty}
          </div>
        )}
      </section>

      {/* High-Density Symbol Breakdown Table */}
      <section className="border border-slate-800/80 bg-[#111827] rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800/80 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">{t.dashboard.breakdownTitle}</h3>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {t.dashboard.breakdownCount(nodePlans.length)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 bg-[#0E1420] text-[11px] font-medium text-slate-400">
                <th className="py-2.5 px-4">{t.dashboard.breakdownColName}</th>
                <th className="py-2.5 px-3 text-right">{t.dashboard.breakdownColLines}</th>
                <th className="py-2.5 px-3 text-right">{t.dashboard.breakdownColRaw}</th>
                <th className="py-2.5 px-3 text-right">{t.dashboard.breakdownColInjected}</th>
                <th className="py-2.5 px-3 text-right">{t.dashboard.breakdownColSaved}</th>
                <th className="py-2.5 px-3">{t.dashboard.breakdownColHop}</th>
                <th className="py-2.5 px-4 text-right">{t.dashboard.breakdownColOverride}</th>
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
                        ? t.dashboard.hopFocal
                        : plan.hopDistance !== null
                          ? t.dashboard.hopDist(plan.hopDistance)
                          : t.dashboard.hopUnrelated}
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
                            {t.graph.overrideMode[mode]}
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
