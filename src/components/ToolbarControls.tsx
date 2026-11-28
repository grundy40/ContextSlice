import { useMemo } from 'react';
import { FolderOpen, RotateCcw, Search, Sparkles, Zap, Tag } from 'lucide-react';
import { useI18n } from '../i18n';
import { AstSymbolNode } from '../types/context';

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
  files?: Array<{ path: string; content: string }>;
  nodes?: AstSymbolNode[];
}

const BUDGET_OPTIONS = [
  1000,
  4000,
  8000,
  16000,
  32768,
  64000,
  128000,
  256000,
  1000000,
];

function formatBudgetLabel(b: number): string {
  if (b >= 1_000_000) return `${b / 1_000_000}M`;
  if (b >= 1_000) return `${Math.round(b / 1_000)}K`;
  return String(b);
}

interface TopicDef {
  zhLabel: string;
  enLabel: string;
  q: string;
  keywords: string[];
}

const TOPIC_CATALOG: TopicDef[] = [
  { zhLabel: '登入驗證 (auth/login)', enLabel: 'Auth & Login (auth/login)', q: 'auth login', keywords: ['auth', 'login', 'signin', 'token', 'jwt', 'session', 'oauth'] },
  { zhLabel: '資料處理 (fetch/api)', enLabel: 'API & Data (fetch/api)', q: 'api fetch data', keywords: ['api', 'fetch', 'request', 'client', 'http', 'endpoint', 'service', 'data'] },
  { zhLabel: '介面元件 (ui/view)', enLabel: 'UI Views (ui/view)', q: 'ui view component', keywords: ['ui', 'view', 'component', 'modal', 'panel', 'header', 'toolbar', 'render', 'page'] },
  { zhLabel: '設定與路由 (config/route)', enLabel: 'Config & Routes (config/route)', q: 'config route router', keywords: ['config', 'setting', 'route', 'router', 'middleware', 'env', 'manifest'] },
  { zhLabel: '狀態管理 (store/state)', enLabel: 'State & Store (store/state)', q: 'state store context', keywords: ['state', 'store', 'context', 'reducer', 'cache', 'workspace', 'history'] },
  { zhLabel: '解析與引擎 (parse/slice)', enLabel: 'Parser & Engine (parse/slice)', q: 'parse slice engine', keywords: ['parse', 'parser', 'slice', 'ast', 'token', 'graph', 'assemble', 'search'] },
  { zhLabel: '資料庫與快取 (db/cache)', enLabel: 'Database & Cache (db/cache)', q: 'db cache query', keywords: ['db', 'database', 'sql', 'cache', 'redis', 'repo', 'storage', 'schema'] },
  { zhLabel: '工具與命令列 (mcp/cli)', enLabel: 'MCP & CLI (mcp/cli)', q: 'mcp cli tool', keywords: ['mcp', 'cli', 'command', 'server', 'script', 'stdio', 'tool'] },
  { zhLabel: '錯誤與測試 (error/test)', enLabel: 'Errors & Tests (error/test)', q: 'error test spec', keywords: ['error', 'exception', 'test', 'spec', 'assert', 'mock', 'logger', 'log'] },
  { zhLabel: '訂單與金流 (order/pay)', enLabel: 'Orders & Billing (order/pay)', q: 'order payment price', keywords: ['order', 'cart', 'checkout', 'payment', 'price', 'discount', 'invoice'] },
];

const GENERIC_ROOT_NOISE = new Set([
  'src', 'app', 'lib', 'pkg', 'dist', 'build', 'index', 'main', 'types', 'type',
  'utils', 'util', 'helper', 'helpers', 'common', 'shared', 'default', 'module',
  'get', 'set', 'has', 'is', 'can', 'handle', 'create', 'update', 'delete', 'run',
  'init', 'load', 'read', 'write', 'from', 'with', 'props', 'item', 'items', 'list',
  'json', 'yaml', 'toml', 'conf', 'txt', 'xml', 'tsx', 'jsx', 'mjs', 'cjs',
]);

function extractWordTokens(input: string): string[] {
  return input
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !GENERIC_ROOT_NOISE.has(w) && !/^\d+$/.test(w));
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
  onResetOverrides,
  overrideCount,
  files = [],
  nodes = [],
}: ToolbarControlsProps) {
  const { locale, t } = useI18n();

  const smartChips = useMemo(() => {
    if (fileCount === 0) return [];

    const tokenFreq = new Map<string, number>();
    for (const f of files) {
      for (const tok of extractWordTokens(f.path)) {
        tokenFreq.set(tok, (tokenFreq.get(tok) ?? 0) + 3);
      }
    }
    for (const n of nodes) {
      if (n.kind === 'module') continue;
      for (const tok of extractWordTokens(n.name)) {
        tokenFreq.set(tok, (tokenFreq.get(tok) ?? 0) + 2);
      }
    }

    const scoredCatalog = TOPIC_CATALOG.map((topic) => {
      let score = 0;
      for (const kw of topic.keywords) {
        score += tokenFreq.get(kw) ?? 0;
      }
      return { topic, score };
    })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const chips: Array<{ label: string; q: string }> = scoredCatalog
      .slice(0, 6)
      .map(({ topic }) => ({
        label: locale === 'en' ? topic.enLabel : topic.zhLabel,
        q: topic.q,
      }));

    if (chips.length < 4) {
      const usedQueries = new Set(chips.flatMap((c) => c.q.split(' ')));
      const topRoots = [...tokenFreq.entries()]
        .filter(([tok]) => !usedQueries.has(tok))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6 - chips.length);

      for (const [root] of topRoots) {
        chips.push({
          label: locale === 'en' ? `Module (${root})` : `核心詞根 (${root})`,
          q: root,
        });
      }
    }

    return chips.slice(0, 6);
  }, [files, nodes, fileCount, locale]);

  return (
    <section
      aria-label={t.toolbar.aria}
      className="shrink-0 border-b border-slate-800/80 bg-[#111827] px-6 py-3 flex flex-col gap-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Active Workspace Badge & Query Input */}
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[320px]">
          <div
            className="h-9 bg-[#0B0F17] border border-slate-700/80 rounded-md px-3 text-xs font-medium text-slate-200 flex items-center gap-2 max-w-[260px]"
            title={t.toolbar.workspaceTitle}
          >
            <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="truncate">{fileCount > 0 ? projectLabel : t.toolbar.noProject}</span>
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
              placeholder={t.toolbar.searchPlaceholder}
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
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                maxHops === 1
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={t.toolbar.hop1Title}
            >
              {t.toolbar.hop1Label}
            </button>
            <button
              type="button"
              onClick={() => onChangeHops(2)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                maxHops === 2
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={t.toolbar.hop2Title}
            >
              {t.toolbar.hop2Label}
            </button>
          </div>

          {/* Auto-Expand Complexity Cluster Toggle */}
          <button
            type="button"
            onClick={onToggleAutoExpand}
            className={`h-9 px-3 text-xs font-medium rounded-md border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              autoExpandClusters
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title={t.toolbar.autoExpandTitle}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.toolbar.autoExpandLabel(autoExpandedCount)}</span>
          </button>

          {/* Reset Manual Overrides */}
          {overrideCount > 0 && (
            <button
              type="button"
              onClick={onResetOverrides}
              className="h-9 px-2.5 text-xs font-medium bg-[#0B0F17] border border-slate-800 hover:border-slate-700 text-slate-300 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              title={t.toolbar.resetOverridesTitle}
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>{t.toolbar.resetOverrides(overrideCount)}</span>
            </button>
          )}

          {/* Token Budget Selector */}
          <div className="flex items-center gap-2 bg-[#0B0F17] border border-slate-800 rounded-md px-3 h-9">
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs text-slate-400 whitespace-nowrap">{t.toolbar.budgetLabel}</span>
            <select
              value={budgetTokens}
              onChange={(e) => onChangeBudget(Number(e.target.value))}
              aria-label={t.toolbar.budgetAria}
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
      </div>

      {/* Smart Topic Chips (Rendered only after real codebase import) */}
      {fileCount > 0 && smartChips.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 text-xs">
          <span className="text-[11px] text-slate-400 flex items-center gap-1 shrink-0 font-medium">
            <Tag className="w-3 h-3 text-sky-400" />
            {t.toolbar.hotTopicsLabel}
          </span>
          {smartChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => {
                onChangeQuery(chip.q);
                onAutoFocusByQuery();
              }}
              className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                query === chip.q
                  ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                  : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700 text-slate-300 hover:text-slate-100'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
