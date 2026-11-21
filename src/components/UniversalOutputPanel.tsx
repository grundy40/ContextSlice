import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Download, FileText, Zap } from 'lucide-react';
import { exportContextManualPdf } from '../engine/pdfManualExporter';
import {
  generateCliScript,
  generateThinMcpServer,
  generateZeroMcpDesktopConfig,
} from '../engine/scriptGenerators';
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

const TARGET_TABS: Array<{ id: OutputTarget; label: string }> = [
  { id: 'browser', label: '複製貼上' },
  { id: 'cli', label: '命令列腳本' },
  { id: 'zero-mcp', label: '免裝工具' },
  { id: 'thin-mcp', label: '1個工具自動切' },
];

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

const PROMPT_TEMPLATES: Array<{ id: PromptTemplateKind; label: string }> = [
  { id: 'none', label: '只複製程式碼' },
  { id: 'fix', label: '修 Bug / 改功能' },
  { id: 'explain', label: '幫我解釋邏輯' },
  { id: 'review', label: '檢查潛在問題' },
];

const TOOL_DIR_PRESETS = [
  { label: 'Windows', value: 'D:/tools' },
  { label: '專案內', value: './tools' },
  { label: 'Mac / Linux', value: '/opt/tools' },
];

function buildPromptWrappedPacket(
  packet: string,
  query: string,
  kind: PromptTemplateKind,
): string {
  if (kind === 'none') return packet;
  const task = query.trim() || '（請在這裡補上你想調整的功能）';
  if (kind === 'fix') {
    return `請根據下方精簡後的程式碼，幫我處理這個需求：${task}\n\n要求：\n1. 優先修改焦點函式，並注意精簡外框裡的參數型別不要寫錯。\n2. 若有缺少哪段折疊起來的實作細節，再告訴我需要補充哪個函式名稱。\n\n${packet}`;
  }
  if (kind === 'explain') {
    return `請根據下方精簡後的程式碼，用白話幫我說明「${task}」的執行流程與各檔案如何串接：\n\n${packet}`;
  }
  return `請根據下方精簡後的程式碼，幫我針對「${task}」做一次程式審查，找出可能的邊界錯誤、型別問題或效能風險：\n\n${packet}`;
}

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
  const browserCopyContent = buildPromptWrappedPacket(
    assembly.assembledPacket,
    query,
    promptTemplate,
  );

  const utilPct = Math.min(100, assembly.budgetUtilizationPercent);

  return (
    <aside
      aria-label="匯出與使用方式"
      className="w-[430px] shrink-0 border-l border-slate-800/80 bg-[#0E1420] flex flex-col min-h-0"
    >
      {/* Budget Utilization Header */}
      <div className="p-4 border-b border-slate-800/80 space-y-2.5 bg-[#111827]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-200">這次要送給 AI 的用量</span>
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
            完整 {assembly.countsByTier.full} · 外框 {assembly.countsByTier.skeleton} · 名單{' '}
            {assembly.countsByTier.map} · 略過 {assembly.countsByTier.excluded}
          </span>
          <span className="text-emerald-400">省 {assembly.metrics.codeReductionPercent}%</span>
        </div>

        <button
          type="button"
          disabled={pdfStatus === 'generating'}
          onClick={() => void handleExportPdf()}
          title="將目前整理好的上下文、自動補齊節點與依賴關聯輸出成離線可讀的 A4 技術摘要 PDF"
          className="w-full py-1.5 px-3 rounded-md border border-slate-700/80 bg-[#0B0F17] hover:bg-slate-800/80 hover:border-sky-500/40 disabled:opacity-60 text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
        >
          {pdfStatus === 'done' ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-emerald-300">已匯出 PDF 說明書！</span>
            </>
          ) : (
            <>
              <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>{pdfStatus === 'generating' ? '正在排版生成 PDF...' : '匯出為 PDF 說明書'}</span>
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
                    ? `找到 ${assembly.detectedClusters.length} 個重要程式，已自動展開 ${assembly.autoExpansionToolCall.gapsResolvedCount} 處 (+${assembly.autoExpansionToolCall.tokensAdded} tk)`
                    : assembly.autoExpansionToolCall.status === 'disabled'
                      ? `發現 ${assembly.detectedClusters.length} 個重要程式沒展開（自動補齊已關閉）`
                      : `發現 ${assembly.detectedClusters.length} 個重要程式，但額度不夠，先保留外框`}
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
                  <span>自動補齊工具紀錄 (expand_skeleton_cluster)</span>
                  <span className="text-emerald-400">
                    {assembly.autoExpansionToolCall.status === 'resolved'
                      ? '已完成補齊'
                      : assembly.autoExpansionToolCall.status === 'disabled'
                        ? '目前關閉'
                        : '額度不足'}
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
                        {c.resolvedByMcp ? `已補齊 +${c.tokenCostDelta}tk` : `複雜度 ${c.complexityScore}`}
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
          {TARGET_TABS.map((tab) => {
            const active = activeTarget === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeTarget(tab.id)}
                className={`py-1.5 px-1.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap truncate cursor-pointer ${
                  active
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
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
                不用裝任何東西 · <span className="text-emerald-400">直接複製貼給網頁版 AI</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('packet', browserCopyContent)}
                className="px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedKey === 'packet' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'packet' ? '已複製內容！' : '複製給 AI 的內容'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-800 bg-[#0B0F17] p-1.5">
              <span className="px-1.5 text-[11px] text-slate-400 whitespace-nowrap">提問開頭：</span>
              {PROMPT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => onChangePromptTemplate(tpl.id)}
                  className={`px-2 py-1 text-[11px] rounded transition-colors cursor-pointer whitespace-nowrap ${
                    promptTemplate === tpl.id
                      ? 'bg-sky-500/20 text-sky-300 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tpl.label}
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
                本機工具存放資料夾（設定後下方路徑與 JSON 會同步更新）
              </label>
              <div className="flex items-center gap-1">
                {TOOL_DIR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => onChangeToolDir(preset.value)}
                    className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors cursor-pointer ${
                      toolDir === preset.value
                        ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                        : 'border-slate-800 bg-[#0B0F17] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              id="tool-dir-input"
              type="text"
              value={toolDir}
              onChange={(e) => onChangeToolDir(e.target.value)}
              placeholder="例如 D:/tools 或 /opt/tools"
              className="w-full h-7 px-2.5 bg-[#0B0F17] border border-slate-700/80 rounded text-[11px] font-mono text-slate-100 focus:outline-none focus:border-sky-400"
            />
          </div>
        )}

        {activeTarget === 'cli' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-300">
                <span className="text-emerald-400">免費零花費</span> · 下載單檔在電腦跑
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy('cli', cliScript)}
                  className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 rounded flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  {copiedKey === 'cli' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  複製
                </button>
                <button
                  type="button"
                  onClick={() => triggerDownload('ctxslice.mjs', cliScript)}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3 h-3" />
                  下載腳本 (.mjs)
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              在問 Claude Code、OpenCode 或其他終端機 AI 之前，先用這支小腳本把專案精簡好，才不會一次塞爆額度。
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
                不掛任何工具 · 規則超短（僅 <span className="font-mono text-sky-300">45 tk</span>）
              </div>
              <button
                type="button"
                onClick={() => handleCopy('zero-mcp-rule', zeroMcp.microRule)}
                className="px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                {copiedKey === 'zero-mcp-rule' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'zero-mcp-rule' ? '已複製規則' : '複製規則文字'}
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              適合 <span className="text-slate-200">OpenCode</span>、<span className="text-slate-200">Pi Agent</span>、<span className="text-slate-200">Claude Code</span>：不想設定 MCP 工具也沒關係，只要把下面這段話貼進規則檔，AI 就會自己先跑腳本整理程式。
            </p>
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-slate-300">1. 貼進全域規則檔（AGENTS.md / CLAUDE.md）</div>
              <pre className="p-3 rounded border border-slate-800/90 bg-[#0B0F17] text-[11.5px] leading-relaxed font-mono text-sky-200 overflow-x-auto">
                <code>{zeroMcp.microRule}</code>
              </pre>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">2. Pi Agent 專用說明檔 (~/.pi/agent/skills/context-slice/SKILL.md)</span>
                <button
                  type="button"
                  onClick={() => handleCopy('pi-skill', zeroMcp.piSkill)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
                >
                  {copiedKey === 'pi-skill' ? '已複製' : '複製內容'}
                </button>
              </div>
              <pre className="p-3 rounded border border-slate-800/90 bg-[#0B0F17] text-[11px] leading-relaxed font-mono text-slate-300 overflow-x-auto">
                <code>{zeroMcp.piSkill}</code>
              </pre>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">
                  3. 電腦裡手動跑一次看看 ({toolDir.replace(/\/+$/, '')}/ctxslice.mjs)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('zero-mcp-cmd', zeroMcp.watchCommand)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
                >
                  {copiedKey === 'zero-mcp-cmd' ? '已複製' : '複製指令'}
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
                只裝 1 個工具（說明只佔 <span className="font-mono text-amber-300">~185 tk</span>，問問題自動切）
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy('opencode-cfg', thinMcp.opencodeConfig)}
                  className="px-2.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 rounded flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  {copiedKey === 'opencode-cfg' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  複製 OpenCode 設定
                </button>
                <button
                  type="button"
                  onClick={() => triggerDownload('ctxslice-mcp.mjs', thinMcp.serverCode)}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3 h-3" />
                  下載工具主檔
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              <span className="text-slate-200">OpenCode</span>、<span className="text-slate-200">Pi Agent</span>、<span className="text-slate-200">Claude Code</span> 全部共用這一個 <code className="text-sky-300">ctxslice-mcp.mjs</code>！裝好後跟平常一樣問問題，AI 會自己呼叫它把程式切好再看。
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">1. 貼進 AGENTS.md / CLAUDE.md（以後不用自己下指令）</span>
                <button
                  type="button"
                  onClick={() => handleCopy('auto-rule', thinMcp.autoInvokeRule)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 cursor-pointer shrink-0 ml-2"
                >
                  {copiedKey === 'auto-rule' ? '已複製規則' : '複製這段規則'}
                </button>
              </div>
              <pre className="p-2.5 rounded border border-emerald-500/30 bg-[#0B0F17] text-[11px] leading-relaxed font-mono text-emerald-200 overflow-x-auto">
                <code>{thinMcp.autoInvokeRule}</code>
              </pre>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300">2. 讓你的 AI 軟體認識它（選你用的工具複製）</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy('mcp-json', thinMcp.clientConfig)}
                    className="text-[11px] text-amber-300 hover:text-amber-200 cursor-pointer"
                  >
                    {copiedKey === 'mcp-json' ? '已複製 Pi 設定' : '複製 Pi 設定'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy('claude-cmd', thinMcp.claudeCodeCmd)}
                    className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
                  >
                    {copiedKey === 'claude-cmd' ? '已複製 Claude 指令' : '複製 Claude 指令'}
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
                  3. 一鍵測試電腦是否設定成功（貼到終端機檢查工具回應）
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('verify-cmd', thinMcp.verifyCommand)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 cursor-pointer shrink-0 ml-2"
                >
                  {copiedKey === 'verify-cmd' ? '已複製測試指令' : '複製測試指令'}
                </button>
              </div>
              <pre className="p-2.5 rounded border border-slate-800/90 bg-[#0B0F17] text-[10.5px] font-mono text-slate-300 overflow-x-auto">
                <code>{thinMcp.verifyCommand}</code>
              </pre>
            </div>
            <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
              <div className="text-[11px] font-medium text-slate-300">
                4. 工具主程式內容（下載存成 {toolDir.replace(/\/+$/, '')}/ctxslice-mcp.mjs）
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
