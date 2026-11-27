import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Download, FileText, Zap } from 'lucide-react';
import { exportContextManualPdf } from '../engine/pdfManualExporter';
import {
  generateCliScript,
  generateThinMcpServer,
  generateZeroMcpDesktopConfig,
} from '../engine/scriptGenerators';
import { useI18n } from '../i18n';
import {
  ContextAssemblyResult,
  DependencyEdge,
  OutputTarget,
  PromptTemplateKind,
} from '../types/context';

interface UniversalOutputPanelProps {
  assembly: ContextAssemblyResult;
  edges: DependencyEdge[];
  projectLabel: string;
  query: string;
  maxHops: 1 | 2;
  activeTarget: OutputTarget;
  onChangeTarget: (target: OutputTarget) => void;
  toolDir: string;
  onChangeToolDir: (dir: string) => void;
  promptTemplate: PromptTemplateKind;
  onChangePromptTemplate: (kind: PromptTemplateKind) => void;
}

const TARGET_TAB_IDS: OutputTarget[] = ['browser', 'cli', 'zero-mcp', 'thin-mcp'];

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const PROMPT_TEMPLATE_IDS: PromptTemplateKind[] = ['none', 'fix', 'explain', 'review'];

const TOOL_DIR_PRESETS: Array<{ key: 'project' | 'home' | 'macLinux'; value: string }> = [
  { key: 'project', value: './tools' },
  { key: 'home', value: '~/.contextslice/tools' },
  { key: 'macLinux', value: '/opt/tools' },
];

export function UniversalOutputPanel({
  assembly,
  edges,
  projectLabel,
  query,
  maxHops,
  activeTarget,
  onChangeTarget,
  toolDir,
  onChangeToolDir,
  promptTemplate,
  onChangePromptTemplate,
}: UniversalOutputPanelProps) {
  const { locale, t } = useI18n();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [clusterInspectorOpen, setClusterInspectorOpen] = useState<boolean>(false);
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'generating' | 'done'>('idle');

  const handleExportPdf = async () => {
    if (pdfStatus === 'generating') return;
    setPdfStatus('generating');
    try {
      await exportContextManualPdf({
        projectLabel,
        query,
        maxHops,
        assembly,
        edges,
        locale,
      });
      setPdfStatus('done');
      setTimeout(() => setPdfStatus('idle'), 2200);
    } catch {
      setPdfStatus('idle');
    }
  };

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const genConfig = {
    query,
    budgetTokens: assembly.budgetTokens,
    maxHops,
    toolDir,
  };

  const cliScript = generateCliScript(genConfig);
  const zeroMcp = generateZeroMcpDesktopConfig(genConfig);
  const thinMcp = generateThinMcpServer(genConfig);
  const taskPromptText = query.trim() || t.output.promptPlaceholderTask;
  const browserCopyContent = t.output.buildPromptPacket(
    assembly.assembledPacket,
    taskPromptText,
    promptTemplate,
  );

  const utilPct = Math.min(100, assembly.budgetUtilizationPercent);

  return (
    <aside
      aria-label={t.output.asideAria}
      className="w-[430px] shrink-0 border-l border-slate-800/80 bg-[#0E1420] flex flex-col min-h-0"
    >
      {/* Budget Utilization Header */}
      <div className="p-4 border-b border-slate-800/80 space-y-2.5 bg-[#111827]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-200">{t.output.usageTitle}</span>
          <span
            className={`text-xs font-mono tabular-nums font-semibold ${
              assembly.overBudget ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {assembly.totalInjectedTokens.toLocaleString()} / {assembly.budgetTokens.toLocaleString()} tk (
            {assembly.budgetUtilizationPercent}%)
          </span>
        </div>

        <div className="h-2 w-full bg-[#0B0F17] rounded overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all duration-150 ${
              assembly.overBudget ? 'bg-rose-500' : 'bg-sky-400'
            }`}
            style={{ width: `${utilPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
          <span>
            {t.output.countsLine(
              assembly.countsByTier.full,
              assembly.countsByTier.skeleton,
              assembly.countsByTier.map,
              assembly.countsByTier.excluded,
            )}
          </span>
          <span className="text-emerald-400">{t.output.savedPct(assembly.metrics.codeReductionPercent)}</span>
        </div>

        <button
          type="button"
          disabled={pdfStatus === 'generating'}
          onClick={() => void handleExportPdf()}
          title={t.output.exportPdfTitle}
          className="w-full py-1.5 px-3 rounded-md border border-slate-700/80 bg-[#0B0F17] hover:bg-slate-800/80 hover:border-sky-500/40 disabled:opacity-60 text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          {pdfStatus === 'done' ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-emerald-300">{t.output.pdfDone}</span>
            </>
          ) : (
            <>
              <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>{pdfStatus === 'generating' ? t.output.pdfGenerating : t.output.pdfIdle}</span>
            </>
          )}
        </button>

        {/* Automated Skeleton Expansion MCP Tool-Call Strip */}
        {assembly.detectedClusters.length > 0 && assembly.autoExpansionToolCall && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setClusterInspectorOpen((v) => !v)}
              className="w-full px-2.5 py-1.5 rounded-md border border-slate-800 bg-[#0B0F17] hover:border-slate-700 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Zap
                  className={`w-3.5 h-3.5 shrink-0 ${
                    assembly.autoExpansionToolCall.status === 'resolved'
                      ? 'text-emerald-400'
                      : assembly.autoExpansionToolCall.status === 'disabled'
                        ? 'text-slate-500'
                        : 'text-amber-300'
                  }`}
                />
                <span className="text-[11px] text-slate-200 truncate">
                  {assembly.autoExpansionToolCall.status === 'resolved'
                    ? t.output.clusterResolved(
                        assembly.detectedClusters.length,
                        assembly.autoExpansionToolCall.gapsResolvedCount,
                        assembly.autoExpansionToolCall.tokensAdded,
                      )
                    : assembly.autoExpansionToolCall.status === 'disabled'
                      ? t.output.clusterDisabled(assembly.detectedClusters.length)
                      : t.output.clusterOverBudget(assembly.detectedClusters.length)}
                </span>
              </div>
              {clusterInspectorOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
            </button>

            {clusterInspectorOpen && (
              <div className="mt-2 p-2.5 rounded-md border border-slate-800 bg-[#0B0F17] space-y-2 max-h-56 overflow-y-auto">
                <div className="flex items-center justify-between text-[10.5px] font-mono text-slate-400">
                  <span>{t.output.clusterToolTitle}</span>
                  <span className="text-emerald-400">
                    {assembly.autoExpansionToolCall.status === 'resolved'
                      ? t.output.clusterStatusResolved
                      : assembly.autoExpansionToolCall.status === 'disabled'
                        ? t.output.clusterStatusDisabled
                        : t.output.clusterStatusOverBudget}
                  </span>
                </div>

                <div className="space-y-1">
                  {assembly.detectedClusters.map((c) => (
                    <div
                      key={c.clusterId}
                      className="px-2 py-1.5 rounded bg-[#111827] border border-slate-800/80 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-mono text-slate-100 truncate">
                          {c.hubName}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {c.gapReason}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-mono tabular-nums shrink-0 px-1.5 py-0.5 rounded ${
                          c.resolvedByMcp
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {c.resolvedByMcp
                          ? t.output.clusterCostDelta(c.tokenCostDelta)
                          : t.output.clusterComplexity(c.complexityScore)}
                      </span>
                    </div>
                  ))}
                </div>

                <pre className="p-2 rounded bg-[#090D14] border border-slate-800/80 text-[10px] font-mono text-sky-200/90 overflow-x-auto">
                  <code>{JSON.stringify(assembly.autoExpansionToolCall.requestPayload, null, 2)}</code>
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4-Environment Mode Selector */}
      <div className="px-4 pt-3 pb-2 border-b border-slate-800/80 bg-[#0E1420]">
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-md">
          {TARGET_TAB_IDS.map((tabId) => {
            const active = activeTarget === tabId;
            return (
              <button
                key={tabId}
                type="button"
                onClick={() => onChangeTarget(tabId)}
                className={`py-1.5 px-1.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap truncate cursor-pointer ${
                  active
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.output.tabs[tabId]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode Content */}
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3 overflow-y-auto">
        {activeTarget === 'browser' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-300">
                {t.output.browserSubLeft}
                <span className="text-emerald-400">{t.output.browserSubRight}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('packet', browserCopyContent)}
                className="px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedKey === 'packet' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'packet' ? t.output.copiedPacket : t.output.copyPacket}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-800 bg-[#0B0F17] p-1.5">
              <span className="px-1.5 text-[11px] text-slate-400 whitespace-nowrap">
                {t.output.promptPrefixLabel}
              </span>
              {PROMPT_TEMPLATE_IDS.map((tplId) => (
                <button
                  key={tplId}
                  type="button"
                  onClick={() => onChangePromptTemplate(tplId)}
                  className={`px-2 py-1 text-[11px] rounded transition-colors cursor-pointer whitespace-nowrap ${
                    promptTemplate === tplId
                      ? 'bg-sky-500/20 text-sky-300 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.output.promptTemplates[tplId]}
                </button>
              ))}
            </div>

            <pre className="flex-1 min-h-[240px] p-3 rounded border border-slate-800/90 bg-[#0B0F17] text-[11.5px] leading-relaxed font-mono text-slate-300 overflow-auto">
              <code>{browserCopyContent}</code>
            </pre>
          </>
        )}

        {activeTarget !== 'browser' && (
          <div className="rounded-md border border-slate-800 bg-[#111827]/70 p-2.5 space-y-1.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="tool-dir-input" className="text-[11px] font-medium text-slate-300">
                {t.output.toolDirLabel}
              </label>
              <div className="flex items-center gap-1 shrink-0">
                {TOOL_DIR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => onChangeToolDir(preset.value)}
                    className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors cursor-pointer whitespace-nowrap ${
                      toolDir === preset.value
                        ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                        : 'border-slate-800 bg-[#0B0F17] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.output.toolDirPresets[preset.key]}
                  </button>
                ))}
              </div>
            </div>
            <input
              id="tool-dir-input"
              type="text"
              value={toolDir}
              onChange={(e) => onChangeToolDir(e.target.value)}
              placeholder={t.output.toolDirPlaceholder}
              className="w-full h-7 px-2.5 bg-[#0B0F17] border border-slate-700/80 rounded text-[11px] font-mono text-slate-100 focus:outline-none focus:border-sky-400"
            />
          </div>
        )}

        {activeTarget === 'cli' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-300">
                <span className="text-emerald-400">{t.output.cliSubLeft}</span>
                {t.output.cliSubRight}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy('cli', cliScript)}
                  className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 rounded flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  {copiedKey === 'cli' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedKey === 'cli' ? t.output.copied : t.output.copy}
                </button>
                <button
                  type="button"
                  onClick={() => triggerDownload('ctxslice.mjs', cliScript)}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3 h-3" />
                  {t.output.downloadScript}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t.output.cliDesc}
            </p>
            <pre className="flex-1 min-h-[240px] p-3 rounded border border-slate-800/90 bg-[#0B0F17] text-[11.5px] leading-relaxed font-mono text-slate-300 overflow-auto">
              <code>{cliScript}</code>
            </pre>
          </>
        )}

        {activeTarget === 'zero-mcp' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-300">
                {t.output.zeroMcpSub}
                <span className="font-mono text-sky-300">45 tk</span>）
              </div>
              <button
                type="button"
                onClick={() => handleCopy('zero-mcp-rule', zeroMcp.microRule)}
                className="px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedKey === 'zero-mcp-rule' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'zero-mcp-rule' ? t.output.zeroMcpCopiedRule : t.output.zeroMcpCopyRule}
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t.output.zeroMcpDesc}
            </p>
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-slate-300">{t.output.zeroMcpStep1}</div>
              <pre className="p-3 rounded border border-slate-800/90 bg-[#0B0F17] text-[11.5px] leading-relaxed font-mono text-sky-200 overflow-x-auto">
                <code>{zeroMcp.microRule}</code>
              </pre>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">{t.output.zeroMcpStep2}</span>
                <button
                  type="button"
                  onClick={() => handleCopy('pi-skill', zeroMcp.piSkill)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer shrink-0 ml-2"
                >
                  {copiedKey === 'pi-skill' ? t.output.copied : t.output.copyContent}
                </button>
              </div>
              <pre className="p-3 rounded border border-slate-800/90 bg-[#0B0F17] text-[11px] leading-relaxed font-mono text-slate-300 overflow-x-auto">
                <code>{zeroMcp.piSkill}</code>
              </pre>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">
                  {t.output.zeroMcpStep3(toolDir.replace(/\/+$/, ''))}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('zero-mcp-cmd', zeroMcp.watchCommand)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer shrink-0 ml-2"
                >
                  {copiedKey === 'zero-mcp-cmd' ? t.output.copied : t.output.copyCmd}
                </button>
              </div>
              <pre className="p-3 rounded border border-slate-800/90 bg-[#0B0F17] text-[11px] leading-relaxed font-mono text-slate-300 overflow-x-auto">
                <code>{zeroMcp.watchCommand}</code>
              </pre>
            </div>
          </>
        )}

        {activeTarget === 'thin-mcp' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-300">
                {t.output.thinMcpSubLeft}
                <span className="font-mono text-amber-300">~185 tk</span>
                {t.output.thinMcpSubRight}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy('opencode-cfg', thinMcp.opencodeConfig)}
                  className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 rounded flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  {copiedKey === 'opencode-cfg' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedKey === 'opencode-cfg' ? t.output.copied : t.output.copyOpenCode}
                </button>
                <button
                  type="button"
                  onClick={() => triggerDownload('ctxslice-mcp.mjs', thinMcp.serverCode)}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3 h-3" />
                  {t.output.downloadMcp}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t.output.thinMcpDescPrefix}
              <code className="text-sky-300">ctxslice-mcp.mjs</code>
              {t.output.thinMcpDescSuffix}
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">{t.output.thinMcpStep1}</span>
                <button
                  type="button"
                  onClick={() => handleCopy('auto-rule', thinMcp.autoInvokeRule)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 cursor-pointer shrink-0 ml-2"
                >
                  {copiedKey === 'auto-rule' ? t.output.copiedAutoRule : t.output.copyAutoRule}
                </button>
              </div>
              <pre className="p-2.5 rounded border border-emerald-500/30 bg-[#0B0F17] text-[11px] leading-relaxed font-mono text-emerald-200 overflow-x-auto">
                <code>{thinMcp.autoInvokeRule}</code>
              </pre>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">{t.output.thinMcpStep2}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy('mcp-json', thinMcp.clientConfig)}
                    className="text-[11px] text-amber-300 hover:text-amber-200 cursor-pointer"
                  >
                    {copiedKey === 'mcp-json' ? t.output.copiedPi : t.output.copyPi}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy('claude-cmd', thinMcp.claudeCodeCmd)}
                    className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
                  >
                    {copiedKey === 'claude-cmd' ? t.output.copiedClaude : t.output.copyClaude}
                  </button>
                </div>
              </div>
              <pre className="p-2.5 rounded border border-slate-800/90 bg-[#0B0F17] text-[11px] font-mono text-amber-200 overflow-x-auto">
                <code>{thinMcp.opencodeConfig}</code>
              </pre>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">
                  {t.output.thinMcpStep3}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('verify-cmd', thinMcp.verifyCommand)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 cursor-pointer shrink-0 ml-2"
                >
                  {copiedKey === 'verify-cmd' ? t.output.copiedVerify : t.output.copyVerify}
                </button>
              </div>
              <pre className="p-2.5 rounded border border-slate-800/90 bg-[#0B0F17] text-[10.5px] font-mono text-slate-300 overflow-x-auto">
                <code>{thinMcp.verifyCommand}</code>
              </pre>
            </div>
            <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
              <div className="text-[11px] font-medium text-slate-300">
                {t.output.thinMcpStep4(toolDir.replace(/\/+$/, ''))}
              </div>
              <pre className="flex-1 min-h-[140px] p-3 rounded border border-slate-800/90 bg-[#0B0F17] text-[11px] leading-relaxed font-mono text-slate-300 overflow-auto">
                <code>{thinMcp.serverCode}</code>
              </pre>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
