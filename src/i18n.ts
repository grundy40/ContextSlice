import { createContext, createElement, ReactNode, useContext, useEffect, useState } from 'react';
import {
  NodeTier,
  OutputTarget,
  OverrideMode,
  ProjectTagColor,
  PromptTemplateKind,
  WorkspaceView,
} from './types/context';

export type Locale = 'en' | 'zh-TW';

const LANG_STORAGE_KEY = 'contextslice_lang_v1';

export function detectDefaultLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-TW';
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'zh-TW') return saved;
  } catch {
    // Ignore storage access errors
  }

  try {
    const navLang = (
      window.navigator.language ||
      window.navigator.languages?.[0] ||
      ''
    ).toLowerCase();
    if (navLang.startsWith('zh')) return 'zh-TW';
    return 'en';
  } catch {
    return 'zh-TW';
  }
}

export function saveLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, locale);
  } catch {
    // Ignore storage access errors
  }
}

const zhTW = {
  app: {
    pageTitle: 'ContextSlice Studio — 幫 AI 挑重點、省 Token 的程式碼整理工作台',
    noProject: '尚未匯入專案',
    importLoaded: (source: string, count: number) =>
      `已從「${source}」載入 ${count} 個程式檔`,
    importSkippedUnsupported: (count: number) => ` · 略過 ${count} 個二進位或非文字檔`,
    importSkippedOversized: (count: number) => ` · 略過 ${count} 個超過 1.5MB 大檔`,
    importTruncatedLimit: (count: number) =>
      ` · 另有 ${count} 個檔案超過瀏覽器 200 檔上限（大型專案建議改用右側「命令列腳本」或「1個工具自動切」完整掃描）`,
    closeImportNoticeAria: '關閉匯入提示',
    guideBtn: '新手入門引導',
    guideCollapse: '收起',
    guideExpand: '30 秒看懂',
    guideAria: '新手入門引導',
    guideTitle: '第一次用？這工具很簡單！',
    guideCloseAria: '關閉新手入門引導',
    guideStep1Title: '1. 這裡可以看到你的程式結構',
    guideStep1Desc:
      '左邊會幫你把檔案裡的函式列出來，中間圖表會畫出「誰呼叫誰」，不用自己一行一行慢慢翻。',
    guideStep2Title: '2. AI 會幫你自動挑選最相關的程式碼，節省 Token 費用',
    guideStep2Desc:
      '系統只保留你要改的重點內容，其餘相關程式只留標題外框，右邊整理好後直接複製貼給 AI 就能用。',
    guidePrivacy: '全部在瀏覽器本機處理，不上傳程式碼',
    guideAck: '我知道了',
    timeLocale: 'zh-TW',
  },
  header: {
    navAria: '主要視圖切換',
    nav: {
      graph: '程式關聯圖',
      dashboard: '省量與趨勢',
      diff: '精簡前後對照',
    } as Record<WorkspaceView, string>,
    defaultProjectName: '目前專案',
    tagTooltip: (name: string) =>
      `為「${name}」設定分類標籤與顏色（自動記憶於本機）`,
    tagDefault: '專案標籤',
    tagEditAria: '編輯專案標籤',
    tagSetTitle: '設定專案標籤',
    tagCurrentProject: (name: string) => `目前專案：${name}`,
    tagCloseAria: '關閉專案標籤編輯',
    tagNameLabel: '分類名稱',
    tagNamePlaceholder: '例如：核心 API、重構中、Bug 修復',
    tagSuggestions: ['核心功能', '後端 API', '前端介面', 'Bug 修復', '重構中'],
    tagColorLabel: '顏色標記',
    tagColorAria: (label: string) => `顏色：${label}`,
    tagColorNames: {
      sky: '天藍',
      emerald: '翠綠',
      amber: '琥珀',
      violet: '紫羅蘭',
      rose: '玫瑰',
      slate: '石板灰',
    } as Record<ProjectTagColor, string>,
    tagClear: '清除標籤',
    tagSave: '儲存標籤',
    proactiveTooltip: (names: string[]) =>
      `系統已自動展開較複雜的相關程式：${names.join('、')}`,
    proactiveText: (count: number, tokens: number) =>
      `已自動補齊 ${count} 個重點程式 (+${tokens} tk)`,
    cleanupTooltip:
      '刪除舊的操作歷程快照、重設所有節點手動設定、清理過時快取並強制重掃工作區',
    cleanupDone: '已整理完成',
    cleanupBusy: '整理中...',
    cleanupIdle: '一鍵整理',
    rescanTooltip: '本機改完程式後，點這裡直接重新讀取資料夾內容',
    rescanBusy: '掃描中...',
    rescanIdle: '重新讀取資料夾',
    importBtn: '匯入資料夾 / 檔案',
    langToggleLabel: 'EN',
    langToggleTitle: 'Switch to English (切換為英文介面)',
    langToggleAria: '切換介面語言',
  },
  toolbar: {
    aria: '切片策略控制列',
    workspaceTitle: '當前匯入的專案或資料夾',
    noProject: '尚未匯入專案',
    searchPlaceholder: '輸入任務或關鍵字 (支援 CJK + 中英對照 / 支援多目錄)...',
    hop1Label: '1層相關',
    hop1Title: '僅包含直接相關節點 (1-hop)',
    hop2Label: '2層相關',
    hop2Title: '包含 2 層依賴擴展 (2-hop)',
    autoExpandLabel: (count: number) => `自動補齊 (${count})`,
    autoExpandTitle: '自動偵測高複雜度叢集並在預算內展開',
    resetOverrides: (count: number) => `重置 (${count})`,
    resetOverridesTitle: '清除所有手動釘選或覆寫狀態',
    budgetLabel: 'Token 上限:',
    budgetAria: 'Token 上限選擇',
    hotTopicsLabel: '熱點標籤：',
  },
  explorer: {
    aria: '檔案與函式清單',
    title: '檔案與函式清單',
    counts: (fileCount: number, nodeCount: number) =>
      `${fileCount} 檔 · ${nodeCount} 項`,
    searchAria: '搜尋函式、變數或語義行為',
    searchPlaceholderSemantic: '搜尋名稱或行為（例：處理雨刷邏輯）',
    searchPlaceholderExact: '精確搜尋函式、變數或檔名...',
    clearSearchAria: '清除搜尋條件',
    semanticTitle:
      '開啟後，可依程式註解、語義同義詞與呼叫結構關聯模糊搜尋相關節點（即使忘記確切名稱也能找到）',
    semanticLabel: (enabled: boolean) => `語義模糊比對：${enabled ? '開' : '關'}`,
    enterFocus: 'Enter 聚焦',
    matchCount: (matched: number, total: number) => ({
      prefix: '符合 ',
      suffix: ` / ${total} 個節點`,
      matched,
    }),
    semanticSortHint: '依語義與結構關聯排序',
    emptyTitle: '尚未匯入任何專案檔案',
    emptyDesc: '請選擇本機資料夾、程式碼檔案，或直接貼上程式段落開始整理。',
    noMatchPrefix: '找不到符合「',
    noMatchSuffix: '」的函式或變數',
    clearSearchBtn: '清除搜尋',
    oversized: (lineCount: number) => `檔案較長 (${lineCount} 行 · 已自動分段)`,
    toggleFocalRemove: '取消主要修改目標',
    toggleFocalAdd: '設為這次要改的重點',
    tierLabel: {
      full: '給完整',
      skeleton: '只留外框',
      map: '只留名稱',
      excluded: '略過',
    } as Record<NodeTier, string>,
    tierAutoExpanded: '完整 · 自動補齊',
    tierTooltipAutoExpanded: (score: number) =>
      `系統判斷這個程式關聯較多，已自動展開完整內容（複雜度 ${score}）`,
    tierTooltip: (tierLabel: string, isManual: boolean) =>
      `點一下可切換給 AI 看的程度（目前：${tierLabel}${isManual ? ' · 你手動指定' : ''}）`,
    footerPrefix: '點右側標籤可自己決定給 AI 看多少：',
  },
  graph: {
    onlyConnected: (hidden: number) => `只看有關聯的（已藏起 ${hidden} 個無關程式）`,
    showAll: (total: number) => `顯示全部 ${total} 個程式`,
    jumpPlaceholder: '快速跳到某個函式...',
    zoomOutAria: '縮小',
    zoomInAria: '放大',
    autoFit: '自動置中',
    emptyTitle: '匯入本機程式碼，立即開始結構切片',
    emptyDesc:
      '所有分析皆在瀏覽器本機完成，不會上傳原始碼。匯入後會自動產生「熱點標籤」與依賴關聯圖，不熟關鍵字也能一鍵切片並省下 Token。',
    emptyPickFolderBtn: '匯入本機資料夾',
    emptyPickFilesBtn: '選擇檔案',
    emptyPasteBtn: '貼上程式碼',
    emptyNoConnectedTitle: '目前沒有直接連線的焦點節點',
    emptyNoConnectedDesc:
      '請在上方輸入關鍵字、點擊熱點標籤，或點擊下方按鈕檢視全部已解析程式區塊。',
    emptyShowAllBtn: (total: number) => `顯示全部 ${total} 個節點`,
    roleHeader: {
      'caller-2': '更上游（第2層誰用到它）',
      'caller-1': '上游（誰用到它）',
      focal: '這次要改的重點',
      'callee-1': '下游（它用到誰）',
      'callee-2': '更下游（第2層用到誰）',
      external: '其他沒連到的程式',
    },
    roleShort: {
      'caller-1': '誰用到它',
      'caller-2': '間接上游',
      focal: '修改重點',
      'callee-1': '它用到誰',
      'callee-2': '間接下游',
      external: '無關聯',
    },
    tierText: {
      full: '給完整內容',
      skeleton: '只留標題外框',
      map: '只留名字位置',
      excluded: '暫不放入',
    } as Record<NodeTier, string>,
    badgeAutoExpanded: '已擴充',
    badgeManual: '手動',
    badgeHighComplexity: '高複雜',
    tooltipLayer: '層級：',
    tooltipAutoExpanded: ' · 系統已自動擴充',
    tooltipManual: ' · 手動 Override',
    tooltipHighComplexity: (score: number) => ` · 高複雜度 (${score})`,
    autoCompleted: '已自動補齊',
    legendFocal: '修改重點 / 選取',
    legendExpanded: (count: number) => `已擴充 (${count})`,
    legendManual: (count: number) => `手動 Override (${count})`,
    legendComplexity: (count: number) => `高複雜度 (${count})`,
    legendSkeleton: '僅留外框',
    minimapTitle: '全景小地圖',
    minimapCloseAria: '收合小地圖',
    minimapOpen: '小地圖',
    inspectorAutoExpanded: '已擴充節點',
    inspectorManual: '手動 Override',
    inspectorComplexity: (score: number) => `高複雜度 (${score})`,
    removeFocal: '取消修改重點',
    setFocal: '設為修改重點',
    overrideMode: {
      auto: '自動',
      full: '給完整',
      skeleton: '只留外框',
      exclude: '略過',
    } as Record<OverrideMode, string>,
    inspectDiff: '看精簡前後對比',
  },
  diff: {
    empty: '目前沒有可以對照的程式碼',
    selectLabel: '選擇要看的函式',
    originalTk: (tk: number) => `原本 ${tk} tk`,
    slicedTk: (tk: number) => `精簡後 ${tk} tk`,
    savedPct: (pct: number) => `省下 ${pct}%`,
    fullCodeHeader: '原本完整程式碼（要修改它時才給完整）',
    linesAndTokens: (lines: number, tk: number) => `${lines} 行 · ${tk} tokens`,
    skeletonHeader: '精簡外框版（只留名稱、參數與格式）',
    foldedDetails: (tk: number) => `折疊實作細節 · ${tk} tokens`,
  },
  dashboard: {
    tooltipInjected: '送給 AI',
    tooltipBudget: '上限設定',
    tooltipUtil: '使用比例',
    tooltipAutoExpanded: '自動補齊',
    tooltipPlaces: (n: number) => `${n} 處`,
    rawTitle: '原本全部程式碼大小',
    rawNote: '如果不精簡，直接全貼給 AI 的量',
    slicedTitle: '精簡整理後的大小',
    slicedNote: (pct: number) => `體積縮小了 ${pct}%`,
    tradTitle: '傳統 AI 工具的總花費',
    tradNote: (tk: string) => `光工具說明書就先扣 ${tk} tk`,
    savedTitle: '總共幫你省下',
    savedNote: (tk: string) => `每次問 AI 少花 ${tk} tokens`,
    trendAria: '最近 10 次操作的 Token 花費變化',
    trendTitle: '最近 10 次操作的 Token 花費變化',
    trendDesc: '每次你改搜尋字、調上限或自動補齊程式，這裡都會記下來，方便比較哪種設定最剛好',
    trendLegendActual: '實際送出量',
    trendLegendBudget: '設定的上限',
    trendSeriesBudget: '上限設定',
    trendSeriesActual: '實際送出',
    trendSummary: (count: number, avg: number, peak: string) =>
      `${count}/10 筆（跨重整保存）· 平均用掉 ${avg}% · 最高 ${peak} tk`,
    trendClear: '清空紀錄',
    trendEmpty: '還沒有操作紀錄',
    throttleAria: '智能節流策略',
    throttleTitle: '智能節流策略（依賴圖分析建議）',
    throttleManualBadge: (count: number) => `已手動套用 ${count} 項「僅顯示簽名」`,
    throttleDesc:
      '根據依賴圖的呼叫入度、跨檔關聯與目前 Token 佔比，找出不需展開實作細節的節點，建議手動設為「僅顯示簽名」以最大化 Token 效率',
    throttleReset: '還原自動判斷',
    throttleApplyAll: (count: number) => `一鍵套用 ${count} 項建議`,
    throttleCandidatesLabel: '建議設為「僅顯示簽名」',
    throttleCandidatesCount: (count: number) => `${count} 個節點`,
    throttleSavingsLabel: '套用後可再省下',
    throttleProjectedLabel: '預估優化後送出量',
    throttleProjectedNote: (pct: number) => `（佔上限 ${pct}%）`,
    throttleInOut: (inD: number, outD: number) => `入度 ${inD} · 出度 ${outD}`,
    throttleCrossFile: (edges: number) => `跨檔 ${edges} 邊`,
    throttleSaveLine: (tk: number, pct: number) => `省 ${tk} tk (-${pct}%)`,
    throttleSetBtn: '設為僅顯示簽名',
    throttleOptimal:
      '依賴圖檢查完成：目前非核心節點已經處於最佳精簡狀態，或已沒有體積較大且可改為「僅顯示簽名」的完整節點。',
    throttleReasonInDegree: (inDegree: number) =>
      `被 ${inDegree} 處程式呼叫（高入度共用介面），改為僅顯示簽名即可讓 AI 看懂參數與回傳型別`,
    throttleReasonAutoExpanded: (lineCount: number, savings: number) =>
      `系統因關聯度較高自動展開（${lineCount} 行），若本次不改內部實作，保留簽名即可省下 ${savings} tk`,
    throttleReasonCrossFile: (crossCount: number) =>
      `跨檔案關聯節點（連結 ${crossCount} 條跨檔邊），保留簽名外框即可維持跨檔呼叫正確性`,
    throttleReasonDefault: (injected: number, pct: number) =>
      `非本次修改焦點但佔用 ${injected} tk，改為僅顯示簽名可立即釋放 ${pct}% 額度`,
    taxTitle: '不同用法差多少 Token？（為什麼不要裝一堆工具？）',
    taxDesc:
      '工具裝太多時，每次對話 AI 都要先重讀一大疊說明書；把挑選程式的工作移到外面做，就能省下大量無謂花費',
    taxBaseline: '比較基準：問一次修改任務',
    taxBarTrad: '傳統做法：裝 20 個工具 + 完整讀檔（說明書佔掉一大塊）',
    taxBarTradNote: (tk: string) => `工具說明書就佔 ${tk} tk`,
    taxBarThin: '極簡 1 工具模式（推薦：只裝 1 個自動切片工具）',
    taxBarThinNote: (tk: number) => `只花 1 個工具說明 ${tk} tk`,
    taxBarZero: '免裝工具模式（不掛 MCP，只寫一句超短規則讓 AI 自己讀檔）',
    taxBarZeroNote: (tk: number) => `免工具費 · 只用 ${tk} tk 短規則`,
    taxBarDirect: '直接複製 / 腳本整理好再貼給 AI（最省、零額外花費）',
    taxBarDirectNote: '0 額外花費（全部額度都留給程式碼）',
    taxTooltipProtocol: (tk: number) => `協議與規則稅：${tk} tokens`,
    taxTooltipCode: (tk: number) => `代碼上下文：${tk} tokens`,
    benchTitle: '多任務實戰基準測試（Benchmark）',
    benchDesc: '直接用目前載入的專案程式碼，實測三種常見任務與預算下的精簡效率與運算速度',
    benchRunAgain: '重新跑一次實測',
    benchRun: '跑 3 種情境實測',
    benchScenarioA: '情境 A：目前任務設定',
    benchScenarioB: '情境 B：小額度精簡（1層 / 4K）',
    benchScenarioC: '情境 C：深度關聯（2層 / 16K）',
    benchColScenario: '測試情境',
    benchColQuery: '搜尋關鍵字',
    benchColTrad: '傳統總花費',
    benchColSliced: '實測精簡量',
    benchColSaved: '總省下',
    benchColAuto: '自動補齊',
    benchColTime: '耗時',
    benchColStatus: '預算狀態',
    benchWithin: '額度內通過',
    benchOver: '超出上限',
    benchEmpty: '點擊右上角「跑 3 種情境實測」，系統會立即用目前專案跑完基準測試並列出比較結果',
    breakdownTitle: '每個函式佔用多少 Token（可單獨調整）',
    breakdownCount: (count: number) => `共 ${count} 個函式 / 區塊`,
    breakdownColName: '函式名稱與位置',
    breakdownColLines: '行數',
    breakdownColRaw: '原本大小',
    breakdownColInjected: '實際送出',
    breakdownColSaved: '省下',
    breakdownColHop: '關聯距離',
    breakdownColOverride: '要給 AI 看多少',
    hopFocal: '修改重點',
    hopDist: (d: number) => `隔 ${d} 層`,
    hopUnrelated: '無直接關聯',
  },
  output: {
    asideAria: '匯出與使用方式',
    usageTitle: '這次要送給 AI 的用量',
    countsLine: (full: number, skel: number, map: number, excluded: number) =>
      `完整 ${full} · 外框 ${skel} · 名單 ${map} · 略過 ${excluded}`,
    savedPct: (pct: number) => `省 ${pct}%`,
    exportPdfTitle:
      '將目前整理好的上下文、自動補齊節點與依賴關聯輸出成離線可讀的 A4 技術摘要 PDF',
    pdfDone: '已匯出 PDF 說明書！',
    pdfGenerating: '正在排版生成 PDF...',
    pdfIdle: '匯出為 PDF 說明書',
    clusterResolved: (total: number, resolved: number, added: number) =>
      `找到 ${total} 個重要程式，已自動展開 ${resolved} 處 (+${added} tk)`,
    clusterDisabled: (total: number) =>
      `發現 ${total} 個重要程式沒展開（自動補齊已關閉）`,
    clusterOverBudget: (total: number) =>
      `發現 ${total} 個重要程式，但額度不夠，先保留外框`,
    clusterToolTitle: '自動補齊工具紀錄 (expand_skeleton_cluster)',
    clusterStatusResolved: '已完成補齊',
    clusterStatusDisabled: '目前關閉',
    clusterStatusOverBudget: '額度不足',
    clusterCostDelta: (tk: number) => `已補齊 +${tk}tk`,
    clusterComplexity: (score: number) => `複雜度 ${score}`,
    tabs: {
      browser: '複製貼上',
      cli: '命令列腳本',
      'zero-mcp': '免裝工具',
      'thin-mcp': '1個工具自動切',
    } as Record<OutputTarget, string>,
    browserSubLeft: '不用裝任何東西 · ',
    browserSubRight: '直接複製貼給網頁版 AI',
    copiedPacket: '已複製內容！',
    copyPacket: '複製給 AI 的內容',
    promptPrefixLabel: '提問開頭：',
    promptTemplates: {
      none: '只複製程式碼',
      fix: '修 Bug / 改功能',
      explain: '幫我解釋邏輯',
      review: '檢查潛在問題',
    } as Record<PromptTemplateKind, string>,
    promptPlaceholderTask: '（請在這裡補上你想調整的功能）',
    buildPromptPacket: (packet: string, task: string, kind: PromptTemplateKind) => {
      if (kind === 'none') return packet;
      if (kind === 'fix') {
        return `請根據下方精簡後的程式碼，幫我處理這個需求：${task}\n\n要求：\n1. 優先修改焦點函式，並注意精簡外框裡的參數型別不要寫錯。\n2. 若有缺少哪段折疊起來的實作細節，再告訴我需要補充哪個函式名稱。\n\n${packet}`;
      }
      if (kind === 'explain') {
        return `請根據下方精簡後的程式碼，用白話幫我說明「${task}」的執行流程與各檔案如何串接：\n\n${packet}`;
      }
      return `請根據下方精簡後的程式碼，幫我針對「${task}」做一次程式審查，找出可能的邊界錯誤、型別問題或效能風險：\n\n${packet}`;
    },
    toolDirLabel: '本機工具存放資料夾（設定後下方路徑與 JSON 會同步更新）',
    toolDirPlaceholder: '例如 ./tools 或 ~/.contextslice/tools',
    toolDirPresets: {
      project: '專案內',
      home: '個人目錄',
      macLinux: 'Mac / Linux',
    },
    cliSubLeft: '免費零花費',
    cliSubRight: ' · 下載單檔在電腦跑',
    copy: '複製',
    copied: '已複製',
    downloadScript: '下載腳本 (.mjs)',
    cliDesc:
      '在問 Claude Code、OpenCode 或其他終端機 AI 之前，先用這支小腳本把專案精簡好，才不會一次塞爆額度。',
    zeroMcpSub: '不掛任何工具 · 規則超短（僅 ',
    zeroMcpCopiedRule: '已複製規則',
    zeroMcpCopyRule: '複製規則文字',
    zeroMcpDesc:
      '適合 OpenCode、Pi Agent、Claude Code：不想設定 MCP 工具也沒關係，只要把下面這段話貼進規則檔，AI 就會自己先跑腳本整理程式。',
    zeroMcpStep1: '1. 貼進全域規則檔（AGENTS.md / CLAUDE.md）',
    zeroMcpStep2: '2. Pi Agent 專用說明檔 (~/.pi/agent/skills/context-slice/SKILL.md)',
    copyContent: '複製內容',
    zeroMcpStep3: (path: string) => `3. 電腦裡手動跑一次看看 (${path}/ctxslice.mjs)`,
    copyCmd: '複製指令',
    thinMcpSubLeft: '只裝 1 個工具（說明只佔 ',
    thinMcpSubRight: '，問問題自動切）',
    copyOpenCode: '複製 OpenCode 設定',
    downloadMcp: '下載工具主檔',
    thinMcpDescPrefix: 'OpenCode、Pi Agent、Claude Code 全部共用這一個 ',
    thinMcpDescSuffix: '！裝好後跟平常一樣問問題，AI 會自己呼叫它把程式切好再看。',
    thinMcpStep1: '1. 貼進 AGENTS.md / CLAUDE.md（以後不用自己下指令）',
    copiedAutoRule: '已複製規則',
    copyAutoRule: '複製這段規則',
    thinMcpStep2: '2. 讓你的 AI 軟體認識它（選你用的工具複製）',
    copiedPi: '已複製 Pi 設定',
    copyPi: '複製 Pi 設定',
    copiedClaude: '已複製 Claude 指令',
    copyClaude: '複製 Claude 指令',
    thinMcpStep3: '3. 一鍵測試電腦是否設定成功（貼到終端機檢查工具回應）',
    copiedVerify: '已複製測試指令',
    copyVerify: '複製測試指令',
    thinMcpStep4: (path: string) => `4. 工具主程式內容（下載存成 ${path}/ctxslice-mcp.mjs）`,
  },
  importModal: {
    title: '匯入你的專案資料夾或程式檔案',
    closeAria: '關閉',
    tabFiles: '選取電腦資料夾 / 多個檔案',
    tabPaste: '直接貼上一段長程式碼',
    dropTitle: '把資料夾或程式檔案拖進來，或點下面按鈕選擇',
    dropDesc:
      '支援 TS/JS、Python、Go、C/C++、Swift、PHP、HTML/CSS、Rust、Java、C#、Ruby 等語言；所有分析都在瀏覽器本機完成，不會上傳到外部伺服器。',
    dropLimit:
      '瀏覽器單次最多載入 200 個檔案（自動略過 node_modules、.git、dist 等編譯目錄、二進位檔與超過 1.5MB 檔案）',
    reading: '讀取中...',
    pickFolder: '選擇整個資料夾',
    pickFiles: '選擇多個檔案',
    defaultSourceFiles: '電腦選取檔案',
    defaultSourceDrag: '拖曳匯入檔案',
    defaultSourceMulti: '電腦選取多檔',
    defaultFolderName: '本機資料夾',
    errNoCode:
      '沒有找到可分析的程式碼檔案（任何文字型程式碼檔皆可匯入；圖片、壓縮檔、執行檔等二進位檔會自動略過）',
    errFolderEmpty: '這個資料夾內沒有找到支援的程式碼檔案',
    errNoPaste: '請先貼上程式碼內容',
    pasteFilenameLabel: '檔名與副檔名（用來判斷這是哪一種程式語言）',
    pasteCodeLabel: '把太長、貼不進對話框的程式碼貼在這裡（會自動幫你拆解分段）',
    cancel: '取消',
    submit: '開始分析與精簡',
  },
  engine: {
    reasonDefaultExcluded: '跟這次要改的重點沒關係，先略過',
    reasonManualExclude: '你手動設定略過',
    reasonManualFull: '你手動設定看完整內容',
    reasonManualSkeleton: '你手動設定只留外框',
    reasonFocalFull: '這是你要改的重點（保留 100% 完整內容）',
    reasonFocalSkeleton: '額度快滿了，重點先縮成外框',
    reasonFocalMap: '額度不夠了，只留名稱和行號',
    reasonHopSkeleton: (hop: number) => `跟重點有直接關聯（隔 ${hop} 層，先留外框給 AI 參考）`,
    reasonHopMap: (hop: number) => `隔 ${hop} 層的相關程式（額度比較緊，先只留位置）`,
    reasonSameFileType: '同一支檔案裡的資料格式定義（自動保留）',
    reasonExportedMap: '其他公開函式的位置清單',
    reasonAutoExpanded: '系統判斷這段很重要且較複雜，已自動補齊完整內容',
    clusterDegree: (degree: number) => `跟 ${degree} 個地方有關聯`,
    clusterCrossFile: (count: number) => `跨檔案連用 ${count} 次`,
    clusterFoldedLines: (lines: number) => `原本被折疊了 ${lines} 行`,
    clusterDirectFocal: '直接連到修改重點',
    clusterFallback: '關聯較複雜的重要程式',
    semanticExactName: '名稱完全符合',
    semanticDirectName: '名稱直接符合',
    semanticPathMatch: '檔名路徑符合',
    semanticNameMatch: '名稱符合',
    semanticVar: (v: string) => `含變數 ${v}`,
    semanticDocPhrase: (phrase: string) => `註解語義命中「${phrase}」`,
    semanticBodyPhrase: (phrase: string) => `程式內文語義「${phrase}」`,
    semanticBehaviorName: (term: string) => `行為語義命中 ${term}`,
    semanticBehaviorVar: (term: string) => `關聯變數語義 ${term}`,
    semanticBehaviorDoc: (term: string) => `註解語義命中 ${term}`,
    semanticBehaviorBody: (term: string) => `實作行為命中 ${term}`,
    semanticFuzzyName: '拼寫模糊相近',
    semanticFuzzyVar: (id: string) => `模糊相近變數 ${id}`,
    semanticStructFallbackName: '關聯函式',
    semanticStructCalledBy: (name: string) => `結構關聯 · 被 ${name} 呼叫`,
    semanticStructCalls: (name: string) => `結構關聯 · 呼叫 ${name}`,
    timeLocale: 'zh-TW',
  },
  pdf: {
    canvasError: '無法建立 PDF 畫布內容',
    runningHeader: (ver: string) => `ContextSlice Studio ${ver} · 技術摘要說明書`,
    titleBanner: 'ContextSlice Studio 技術摘要說明書',
    metaLine1: (project: string, hops: number, ts: string) =>
      `專案來源：${project}   |   關聯範圍：${hops} 層相關   |   產生時間：${ts}`,
    taskLabel: (q: string) =>
      `任務關鍵字：${q || '（未指定，依主要公開函式自動選取）'}`,
    sec1Title: '上下文精簡與額度摘要',
    cardRawLabel: '原本全部程式碼',
    cardRawNote: (count: number) => `${count} 個函式區塊`,
    cardSlicedLabel: '精簡後送出量',
    cardSlicedNote: (budget: string, pct: number) => `上限 ${budget} (${pct}%)`,
    cardSavedLabel: '總共省下比例',
    cardSavedNote: (pct: number) => `代碼縮小 ${pct}%`,
    cardAutoLabel: '自動補齊重點',
    cardAutoValue: (count: number) => `${count} 處`,
    cardAutoNote: (clusters: number) => `偵測 ${clusters} 個複雜處`,
    sec2Title: '已展開完整內容的節點（焦點與自動補齊）',
    sec2Subtitle: (count: number) =>
      `共 ${count} 個完整保留節點，確保 AI 修改時擁有完整實作細節`,
    sec2Empty: '目前沒有展開為完整內容的節點（可能因預算設定較低而壓縮為外框）。',
    badgeAuto: '[自動補齊重點]',
    badgeFocal: '[主要修改目標]',
    badgeManual: '[手動給完整]',
    lineUnit: (lines: number) => `${lines} 行`,
    sec3Title: '程式依賴關聯分析結果',
    sec3Subtitle: (
      full: number,
      skel: number,
      map: number,
      excl: number,
      totalEdges: number,
      cross: number,
      intra: number,
    ) =>
      `層級分布：完整 ${full} · 只留外框 ${skel} · 只留名稱 ${map} · 略過 ${excl}  |  總關聯線 ${totalEdges} 條（跨檔 ${cross} / 同檔 ${intra}）`,
    edgeKindIntra: '同檔引用',
    edgeKindImport: '匯入參照',
    edgeKindCross: '跨檔呼叫',
    sec3Empty: '目前載入的檔案之間沒有偵測到顯著的靜態呼叫邊。',
    tblName: '函式 / 區塊名稱',
    tblFile: '所在檔案',
    tblTier: '納入方式',
    tblTokens: '送出 Token',
    autoExpandedLabel: '自動補齊',
    tierText: {
      full: '給完整內容',
      skeleton: '只留外框',
      map: '只留名稱',
      excluded: '略過',
    } as Record<NodeTier, string>,
    sec4Title: '已組裝之上下文精簡內容（Context Slice）',
    sec4Subtitle: '以下為整理後可直接提供給 AI 模型或供離線審閱的結構化片段',
    truncatedNotice: (maxPages: number) =>
      `※ 內容篇幅超過 ${maxPages} 頁上限，其餘程式碼已省略；完整封包請於工作台「複製貼上」分頁取得。`,
    footerPrivacy: (ver: string) =>
      `ContextSlice Studio ${ver} · 本機運算生成，未上傳任何原始碼`,
    footerPage: (page: number, total: number) => `第 ${page} 頁 / 共 ${total} 頁`,
    dateLocale: 'zh-TW',
  },
};

export type Messages = typeof zhTW;

const en: Messages = {
  app: {
    pageTitle: 'ContextSlice Studio — Structural Code Slicing & Token Optimizer for AI',
    noProject: 'No Project Loaded',
    importLoaded: (source: string, count: number) =>
      `Loaded ${count} code files from "${source}"`,
    importSkippedUnsupported: (count: number) =>
      ` · Skipped ${count} binary/non-text files`,
    importSkippedOversized: (count: number) =>
      ` · Skipped ${count} files > 1.5MB`,
    importTruncatedLimit: (count: number) =>
      ` · ${count} additional files exceeded the 200-file browser limit (use the CLI Script or 1-Tool MCP tab for full repo scans)`,
    closeImportNoticeAria: 'Dismiss import notice',
    guideBtn: 'Quick Start Guide',
    guideCollapse: 'Hide',
    guideExpand: '30s Tour',
    guideAria: 'Quick Start Guide',
    guideTitle: 'First time here? Here is how it works:',
    guideCloseAria: 'Close quick start guide',
    guideStep1Title: '1. Inspect your codebase call hierarchy',
    guideStep1Desc:
      'Functions and classes are listed on the left while the interactive graph visualizes who calls whom — no manual file digging needed.',
    guideStep2Title: '2. Auto-select relevant code & save tokens',
    guideStep2Desc:
      'Target functions stay complete, related neighbors fold into signature skeletons, and the right panel lets you copy or export in one click.',
    guidePrivacy: '100% local in-browser processing — code never leaves your machine',
    guideAck: 'Got it',
    timeLocale: 'en-US',
  },
  header: {
    navAria: 'Primary workspace views',
    nav: {
      graph: 'Call Graph',
      dashboard: 'Savings & Trends',
      diff: 'Skeleton Diff',
    } as Record<WorkspaceView, string>,
    defaultProjectName: 'Current Project',
    tagTooltip: (name: string) =>
      `Set category tag & color for "${name}" (saved locally)`,
    tagDefault: 'Project Tag',
    tagEditAria: 'Edit project tag',
    tagSetTitle: 'Set Project Tag',
    tagCurrentProject: (name: string) => `Project: ${name}`,
    tagCloseAria: 'Close project tag editor',
    tagNameLabel: 'Tag Name',
    tagNamePlaceholder: 'e.g. Core API, Refactoring, Bug Fix',
    tagSuggestions: ['Core Feature', 'Backend API', 'Frontend UI', 'Bug Fix', 'Refactoring'],
    tagColorLabel: 'Badge Color',
    tagColorAria: (label: string) => `Color: ${label}`,
    tagColorNames: {
      sky: 'Sky',
      emerald: 'Emerald',
      amber: 'Amber',
      violet: 'Violet',
      rose: 'Rose',
      slate: 'Slate',
    } as Record<ProjectTagColor, string>,
    tagClear: 'Clear Tag',
    tagSave: 'Save Tag',
    proactiveTooltip: (names: string[]) =>
      `Auto-expanded complex related symbols: ${names.join(', ')}`,
    proactiveText: (count: number, tokens: number) =>
      `Auto-expanded ${count} key symbols (+${tokens} tk)`,
    cleanupTooltip:
      'Clear saved session trend snapshots, reset manual node overrides, and force a fresh workspace rescan',
    cleanupDone: 'Cleaned up',
    cleanupBusy: 'Cleaning...',
    cleanupIdle: 'Quick Cleanup',
    rescanTooltip: 'Re-read the local folder after editing files on disk',
    rescanBusy: 'Rescanning...',
    rescanIdle: 'Rescan Folder',
    importBtn: 'Import Folder / Files',
    langToggleLabel: '繁中',
    langToggleTitle: '切換為繁體中文介面 (Switch to Traditional Chinese)',
    langToggleAria: 'Toggle UI language',
  },
  toolbar: {
    aria: 'Context slicing controls',
    workspaceTitle: 'Currently loaded project or folder',
    noProject: 'No Project Loaded',
    searchPlaceholder: 'Task or symbol keywords (supports CJK + bilingual matching)...',
    hop1Label: '1-Hop',
    hop1Title: 'Include direct dependencies only (1-hop)',
    hop2Label: '2-Hop',
    hop2Title: 'Include 2-hop dependency expansion',
    autoExpandLabel: (count: number) => `Auto-Expand (${count})`,
    autoExpandTitle: 'Automatically detect high-complexity clusters and expand within budget',
    resetOverrides: (count: number) => `Reset (${count})`,
    resetOverridesTitle: 'Clear all manual pins and tier overrides',
    budgetLabel: 'Token Budget:',
    budgetAria: 'Select token budget',
    hotTopicsLabel: 'Hot Topics:',
  },
  explorer: {
    aria: 'Files & Symbols Explorer',
    title: 'Files & Symbols',
    counts: (fileCount: number, nodeCount: number) =>
      `${fileCount} files · ${nodeCount} items`,
    searchAria: 'Search functions, variables, or behaviors',
    searchPlaceholderSemantic: 'Search name or behavior (e.g. validate auth token)',
    searchPlaceholderExact: 'Exact search symbols, variables, or files...',
    clearSearchAria: 'Clear search',
    semanticTitle:
      'Uses structural comments, behavioral synonyms, and call-graph neighbors for fuzzy semantic matching',
    semanticLabel: (enabled: boolean) => `Semantic Match: ${enabled ? 'ON' : 'OFF'}`,
    enterFocus: 'Enter to focus',
    matchCount: (matched: number, total: number) => ({
      prefix: 'Matched ',
      suffix: ` / ${total} nodes`,
      matched,
    }),
    semanticSortHint: 'Sorted by semantic & structural relevance',
    emptyTitle: 'No project files imported yet',
    emptyDesc:
      'Pick a local folder, select source files, or paste a code snippet to begin.',
    noMatchPrefix: 'No symbols matching "',
    noMatchSuffix: '"',
    clearSearchBtn: 'Clear Search',
    oversized: (lineCount: number) => `Large file (${lineCount} lines · auto-segmented)`,
    toggleFocalRemove: 'Unpin focal target',
    toggleFocalAdd: 'Pin as focal target',
    tierLabel: {
      full: 'Full',
      skeleton: 'Skeleton',
      map: 'Map',
      excluded: 'Skip',
    } as Record<NodeTier, string>,
    tierAutoExpanded: 'Full · Auto',
    tierTooltipAutoExpanded: (score: number) =>
      `High-connectivity node auto-expanded by Proactive Discovery (complexity ${score})`,
    tierTooltip: (tierLabel: string, isManual: boolean) =>
      `Click to cycle detail level (current: ${tierLabel}${isManual ? ' · manual' : ''})`,
    footerPrefix: 'Click right badge to override detail level: ',
  },
  graph: {
    onlyConnected: (hidden: number) => `Connected Only (${hidden} unrelated hidden)`,
    showAll: (total: number) => `Show All ${total} Symbols`,
    jumpPlaceholder: 'Jump to function...',
    zoomOutAria: 'Zoom out',
    zoomInAria: 'Zoom in',
    autoFit: 'Fit View',
    emptyTitle: 'Import a local codebase to start structural slicing',
    emptyDesc:
      'Everything runs locally in your browser—zero source code leaves your machine. Once imported, Smart Topic Chips and the call graph appear automatically.',
    emptyPickFolderBtn: 'Import Local Folder',
    emptyPickFilesBtn: 'Select Files',
    emptyPasteBtn: 'Paste Code',
    emptyNoConnectedTitle: 'No focal nodes connected for current query',
    emptyNoConnectedDesc:
      'Type keywords or click a Smart Topic Chip above, or display all parsed symbol blocks below.',
    emptyShowAllBtn: (total: number) => `Show All ${total} Nodes`,
    roleHeader: {
      'caller-2': '2-Hop Callers (Indirect Upstream)',
      'caller-1': '1-Hop Callers (Upstream)',
      focal: 'Focal Targets',
      'callee-1': '1-Hop Callees (Downstream)',
      'callee-2': '2-Hop Callees (Indirect Downstream)',
      external: 'Unconnected Symbols',
    },
    roleShort: {
      'caller-1': 'Caller',
      'caller-2': '2-Hop Caller',
      focal: 'Focal',
      'callee-1': 'Callee',
      'callee-2': '2-Hop Callee',
      external: 'Unlinked',
    },
    tierText: {
      full: 'Full Body',
      skeleton: 'Skeleton Only',
      map: 'Name & Location',
      excluded: 'Excluded',
    } as Record<NodeTier, string>,
    badgeAutoExpanded: 'Expanded',
    badgeManual: 'Manual',
    badgeHighComplexity: 'Complex',
    tooltipLayer: 'Tier: ',
    tooltipAutoExpanded: ' · Auto-Expanded',
    tooltipManual: ' · Manual Override',
    tooltipHighComplexity: (score: number) => ` · High Complexity (${score})`,
    autoCompleted: 'Auto-Expanded',
    legendFocal: 'Focal / Selected',
    legendExpanded: (count: number) => `Auto-Expanded (${count})`,
    legendManual: (count: number) => `Manual Override (${count})`,
    legendComplexity: (count: number) => `High Complexity (${count})`,
    legendSkeleton: 'Skeleton Only',
    minimapTitle: 'Minimap',
    minimapCloseAria: 'Collapse minimap',
    minimapOpen: 'Minimap',
    inspectorAutoExpanded: 'Auto-Expanded',
    inspectorManual: 'Manual Override',
    inspectorComplexity: (score: number) => `Complexity (${score})`,
    removeFocal: 'Unpin Focal',
    setFocal: 'Set as Focal',
    overrideMode: {
      auto: 'Auto',
      full: 'Full',
      skeleton: 'Skeleton',
      exclude: 'Skip',
    } as Record<OverrideMode, string>,
    inspectDiff: 'Inspect Skeleton Diff',
  },
  diff: {
    empty: 'No code symbols available to compare',
    selectLabel: 'Select symbol',
    originalTk: (tk: number) => `Original ${tk} tk`,
    slicedTk: (tk: number) => `Skeleton ${tk} tk`,
    savedPct: (pct: number) => `Saved ${pct}%`,
    fullCodeHeader: 'Original Full Implementation (injected for focal targets)',
    linesAndTokens: (lines: number, tk: number) => `${lines} lines · ${tk} tokens`,
    skeletonHeader: 'Folded Skeleton (preserves signature, types & contract)',
    foldedDetails: (tk: number) => `Body folded · ${tk} tokens`,
  },
  dashboard: {
    tooltipInjected: 'Injected',
    tooltipBudget: 'Budget',
    tooltipUtil: 'Utilization',
    tooltipAutoExpanded: 'Auto-Expanded',
    tooltipPlaces: (n: number) => `${n}`,
    rawTitle: 'Raw Codebase Size',
    rawNote: 'Tokens if pasting every file unmodified',
    slicedTitle: 'Sliced Context Size',
    slicedNote: (pct: number) => `Code volume reduced by ${pct}%`,
    tradTitle: 'Traditional Tooling Cost',
    tradNote: (tk: string) => `Tool schemas alone burn ${tk} tk`,
    savedTitle: 'Total Net Savings',
    savedNote: (tk: string) => `Saved ${tk} tokens per AI turn`,
    trendAria: 'Last 10 session token budget trend',
    trendTitle: 'Token Usage Trend (Last 10 Operations)',
    trendDesc:
      'Every query change, budget adjustment, or auto-expansion is recorded across reloads to help tune your setup',
    trendLegendActual: 'Injected Tokens',
    trendLegendBudget: 'Budget Limit',
    trendSeriesBudget: 'Budget',
    trendSeriesActual: 'Injected',
    trendSummary: (count: number, avg: number, peak: string) =>
      `${count}/10 snapshots (persisted) · Avg ${avg}% · Peak ${peak} tk`,
    trendClear: 'Clear History',
    trendEmpty: 'No session history yet',
    throttleAria: 'Smart Throttling Recommendations',
    throttleTitle: 'Smart Throttling Strategy (Dependency Graph Analysis)',
    throttleManualBadge: (count: number) => `${count} set to Skeleton manually`,
    throttleDesc:
      'Identifies high-degree or cross-file full nodes that are not primary edit targets so folding them to skeletons maximizes token efficiency',
    throttleReset: 'Restore Auto',
    throttleApplyAll: (count: number) => `Apply All ${count} Suggestions`,
    throttleCandidatesLabel: 'Suggested for Skeleton Folding',
    throttleCandidatesCount: (count: number) => `${count} nodes`,
    throttleSavingsLabel: 'Additional Savings',
    throttleProjectedLabel: 'Projected Injected Size',
    throttleProjectedNote: (pct: number) => `(${pct}% of budget)`,
    throttleInOut: (inD: number, outD: number) => `in ${inD} · out ${outD}`,
    throttleCrossFile: (edges: number) => `${edges} cross-file edges`,
    throttleSaveLine: (tk: number, pct: number) => `Save ${tk} tk (-${pct}%)`,
    throttleSetBtn: 'Fold to Skeleton',
    throttleOptimal:
      'Graph check complete: non-focal nodes are already optimally folded with no oversized candidates left.',
    throttleReasonInDegree: (inDegree: number) =>
      `Called by ${inDegree} sites (shared interface); skeleton signature gives AI full parameter & return types`,
    throttleReasonAutoExpanded: (lineCount: number, savings: number) =>
      `Auto-expanded due to high connectivity (${lineCount} lines); fold to save ${savings} tk if not editing its body`,
    throttleReasonCrossFile: (crossCount: number) =>
      `Cross-file bridge (${crossCount} edges); signature skeleton preserves cross-file contract`,
    throttleReasonDefault: (injected: number, pct: number) =>
      `Non-focal node using ${injected} tk; folding to skeleton frees ${pct}% immediately`,
    taxTitle: 'Token Cost by Integration Mode (Why Avoid Tool Bloat?)',
    taxDesc:
      'Loading 20+ file-reading tools forces AI agents to re-read bulky tool schemas every turn. Pre-slicing out-of-band eliminates that tax.',
    taxBaseline: 'Baseline: single coding task turn',
    taxBarTrad: 'Traditional: 20+ MCP tools + multi-turn full file reads',
    taxBarTradNote: (tk: string) => `Schema tax alone: ${tk} tk`,
    taxBarThin: 'Thin 1-Tool MCP (Recommended: single auto-slicing tool)',
    taxBarThinNote: (tk: number) => `Single schema tax: ${tk} tk`,
    taxBarZero: 'Zero-MCP Mode (No MCP server, tiny CLI rule only)',
    taxBarZeroNote: (tk: number) => `Zero tool tax · ${tk} tk micro-rule`,
    taxBarDirect: 'Direct Copy / Local CLI Slice (Zero overhead)',
    taxBarDirectNote: '0 overhead (100% budget for code)',
    taxTooltipProtocol: (tk: number) => `Protocol & rule tax: ${tk} tokens`,
    taxTooltipCode: (tk: number) => `Code context: ${tk} tokens`,
    benchTitle: 'Multi-Scenario Live Benchmark',
    benchDesc:
      'Runs 3 real slicing scenarios against your loaded codebase to measure token reduction and latency',
    benchRunAgain: 'Re-run Benchmark',
    benchRun: 'Run 3-Scenario Benchmark',
    benchScenarioA: 'Scenario A: Current Config',
    benchScenarioB: 'Scenario B: Tight Budget (1-Hop / 4K)',
    benchScenarioC: 'Scenario C: Deep Graph (2-Hop / 16K)',
    benchColScenario: 'Scenario',
    benchColQuery: 'Query',
    benchColTrad: 'Traditional Cost',
    benchColSliced: 'Sliced Output',
    benchColSaved: 'Net Savings',
    benchColAuto: 'Auto-Expanded',
    benchColTime: 'Latency',
    benchColStatus: 'Budget Status',
    benchWithin: 'Within Budget',
    benchOver: 'Over Budget',
    benchEmpty:
      'Click "Run 3-Scenario Benchmark" to measure real-time compression ratio and latency on your project',
    breakdownTitle: 'Per-Symbol Token Breakdown (Manual Override)',
    breakdownCount: (count: number) => `${count} symbols / blocks`,
    breakdownColName: 'Symbol & Location',
    breakdownColLines: 'Lines',
    breakdownColRaw: 'Raw',
    breakdownColInjected: 'Injected',
    breakdownColSaved: 'Saved',
    breakdownColHop: 'Distance',
    breakdownColOverride: 'Detail Level',
    hopFocal: 'Focal Target',
    hopDist: (d: number) => `${d}-hop`,
    hopUnrelated: 'Unlinked',
  },
  output: {
    asideAria: 'Export & Integration Panel',
    usageTitle: 'Context Payload Usage',
    countsLine: (full: number, skel: number, map: number, excluded: number) =>
      `Full ${full} · Skel ${skel} · Map ${map} · Skip ${excluded}`,
    savedPct: (pct: number) => `Saved ${pct}%`,
    exportPdfTitle:
      'Export the assembled context, auto-expanded nodes, and dependency summary as an offline A4 PDF brief',
    pdfDone: 'PDF Brief Exported!',
    pdfGenerating: 'Generating PDF...',
    pdfIdle: 'Export PDF Brief',
    clusterResolved: (total: number, resolved: number, added: number) =>
      `Found ${total} complex hubs, auto-expanded ${resolved} (+${added} tk)`,
    clusterDisabled: (total: number) =>
      `${total} complex hubs detected (Auto-Expand disabled)`,
    clusterOverBudget: (total: number) =>
      `${total} complex hubs kept as skeletons (budget tight)`,
    clusterToolTitle: 'Skeleton Expansion Record (expand_skeleton_cluster)',
    clusterStatusResolved: 'Expanded',
    clusterStatusDisabled: 'Disabled',
    clusterStatusOverBudget: 'Budget Tight',
    clusterCostDelta: (tk: number) => `Expanded +${tk}tk`,
    clusterComplexity: (score: number) => `Complexity ${score}`,
    tabs: {
      browser: 'Copy & Paste',
      cli: 'CLI Script',
      'zero-mcp': 'Zero-MCP',
      'thin-mcp': '1-Tool MCP',
    } as Record<OutputTarget, string>,
    browserSubLeft: 'Zero setup · ',
    browserSubRight: 'Paste directly into Web AI',
    copiedPacket: 'Copied!',
    copyPacket: 'Copy Context for AI',
    promptPrefixLabel: 'Prompt Prefix:',
    promptTemplates: {
      none: 'Code Only',
      fix: 'Fix Bug / Feature',
      explain: 'Explain Flow',
      review: 'Code Review',
    } as Record<PromptTemplateKind, string>,
    promptPlaceholderTask: '(describe the feature or bug fix here)',
    buildPromptPacket: (packet: string, task: string, kind: PromptTemplateKind) => {
      if (kind === 'none') return packet;
      if (kind === 'fix') {
        return `Please help me implement or fix the following task using the sliced codebase below: ${task}\n\nGuidelines:\n1. Focus edits on the full focal functions and respect the parameter/return types shown in the skeleton signatures.\n2. If any folded implementation body is needed, let me know which function name to expand.\n\n${packet}`;
      }
      if (kind === 'explain') {
        return `Using the sliced codebase below, please explain the execution flow and cross-file interactions for "${task}":\n\n${packet}`;
      }
      return `Please perform a code review for "${task}" on the sliced codebase below, checking for edge-case bugs, type mismatches, or performance risks:\n\n${packet}`;
    },
    toolDirLabel: 'Local Tool Folder (paths & JSON configs update live)',
    toolDirPlaceholder: 'e.g. ./tools or ~/.contextslice/tools',
    toolDirPresets: {
      project: 'In Project',
      home: 'Home Dir',
      macLinux: 'Mac / Linux',
    },
    cliSubLeft: 'Zero Cost',
    cliSubRight: ' · Single-file local Node script',
    copy: 'Copy',
    copied: 'Copied',
    downloadScript: 'Download (.mjs)',
    cliDesc:
      'Run this zero-dependency script locally before asking Claude Code or OpenCode so you never blow through your context window.',
    zeroMcpSub: 'No MCP tools · Tiny rule (only ',
    zeroMcpCopiedRule: 'Copied Rule',
    zeroMcpCopyRule: 'Copy Rule',
    zeroMcpDesc:
      'Ideal for OpenCode, Pi Agent, and Claude Code: paste this micro-rule into AGENTS.md / CLAUDE.md so the agent automatically slices code via CLI.',
    zeroMcpStep1: '1. Paste into global rules (AGENTS.md / CLAUDE.md)',
    zeroMcpStep2: '2. Pi Agent skill file (~/.pi/agent/skills/context-slice/SKILL.md)',
    copyContent: 'Copy Content',
    zeroMcpStep3: (path: string) => `3. Test locally in terminal (${path}/ctxslice.mjs)`,
    copyCmd: 'Copy Command',
    thinMcpSubLeft: 'Single 1-Tool MCP (only ',
    thinMcpSubRight: ', slices automatically)',
    copyOpenCode: 'Copy OpenCode Config',
    downloadMcp: 'Download MCP (.mjs)',
    thinMcpDescPrefix: 'OpenCode, Pi Agent, and Claude Code share this single ',
    thinMcpDescSuffix: '! Ask questions normally and your AI agent will slice relevant code on demand.',
    thinMcpStep1: '1. Paste into AGENTS.md / CLAUDE.md (auto-invoke rule)',
    copiedAutoRule: 'Copied Rule',
    copyAutoRule: 'Copy Rule',
    thinMcpStep2: '2. Register MCP Server (choose your client config)',
    copiedPi: 'Copied Pi Config',
    copyPi: 'Copy Pi Config',
    copiedClaude: 'Copied Claude Cmd',
    copyClaude: 'Copy Claude Cmd',
    thinMcpStep3: '3. One-line terminal verification command',
    copiedVerify: 'Copied Test Cmd',
    copyVerify: 'Copy Test Cmd',
    thinMcpStep4: (path: string) => `4. MCP Server Script (save as ${path}/ctxslice-mcp.mjs)`,
  },
  importModal: {
    title: 'Import Project Folder or Source Files',
    closeAria: 'Close',
    tabFiles: 'Pick Folder / Multiple Files',
    tabPaste: 'Paste Long Code Snippet',
    dropTitle: 'Drag & drop a folder or files here, or click below',
    dropDesc:
      'Supports TS/JS, Python, Go, C/C++, Swift, PHP, HTML/CSS, Rust, Java, C#, Ruby, and more. All parsing runs locally in your browser.',
    dropLimit:
      'Up to 200 files per browser import (automatically skips node_modules, .git, dist, binaries, and files > 1.5MB)',
    reading: 'Reading...',
    pickFolder: 'Select Folder',
    pickFiles: 'Select Files',
    defaultSourceFiles: 'Selected Files',
    defaultSourceDrag: 'Dragged Files',
    defaultSourceMulti: 'Multiple Files',
    defaultFolderName: 'Local Folder',
    errNoCode:
      'No analyzable text source files found (images, archives, executables, and binaries are automatically skipped).',
    errFolderEmpty: 'No supported code files found inside this folder.',
    errNoPaste: 'Please paste code content first.',
    pasteFilenameLabel: 'File path & extension (used to detect language)',
    pasteCodeLabel: 'Paste oversized file content here (auto-split into functions & classes)',
    cancel: 'Cancel',
    submit: 'Analyze & Slice',
  },
  engine: {
    reasonDefaultExcluded: 'Unrelated to current edit focus, skipped',
    reasonManualExclude: 'Manually excluded by user',
    reasonManualFull: 'Manually pinned to full code',
    reasonManualSkeleton: 'Manually folded to skeleton',
    reasonFocalFull: 'Focal edit target (100% full body preserved)',
    reasonFocalSkeleton: 'Budget tight; focal target folded to skeleton',
    reasonFocalMap: 'Budget exhausted; name & line range only',
    reasonHopSkeleton: (hop: number) =>
      `${hop}-hop dependency (skeleton signature preserved for AI)`,
    reasonHopMap: (hop: number) =>
      `${hop}-hop dependency (tight budget, location map only)`,
    reasonSameFileType: 'Same-file type/interface definition (auto-retained)',
    reasonExportedMap: 'Other exported symbol map entry',
    reasonAutoExpanded: 'Auto-expanded due to high dependency complexity',
    clusterDegree: (degree: number) => `Connected to ${degree} symbols`,
    clusterCrossFile: (count: number) => `${count} cross-file edges`,
    clusterFoldedLines: (lines: number) => `${lines} folded lines`,
    clusterDirectFocal: 'Directly linked to focal target',
    clusterFallback: 'High-complexity connected hub',
    semanticExactName: 'Exact name match',
    semanticDirectName: 'Direct name match',
    semanticPathMatch: 'File path match',
    semanticNameMatch: 'Name match',
    semanticVar: (v: string) => `Uses identifier ${v}`,
    semanticDocPhrase: (phrase: string) => `Doc/comment match "${phrase}"`,
    semanticBodyPhrase: (phrase: string) => `Body match "${phrase}"`,
    semanticBehaviorName: (term: string) => `Behavior match in name: ${term}`,
    semanticBehaviorVar: (term: string) => `Behavior match in identifier: ${term}`,
    semanticBehaviorDoc: (term: string) => `Behavior match in comment: ${term}`,
    semanticBehaviorBody: (term: string) => `Behavior match in body: ${term}`,
    semanticFuzzyName: 'Fuzzy name match',
    semanticFuzzyVar: (id: string) => `Fuzzy identifier match: ${id}`,
    semanticStructFallbackName: 'Related symbol',
    semanticStructCalledBy: (name: string) => `Call graph · called by ${name}`,
    semanticStructCalls: (name: string) => `Call graph · calls ${name}`,
    timeLocale: 'en-US',
  },
  pdf: {
    canvasError: 'Unable to initialize PDF canvas context',
    runningHeader: (ver: string) => `ContextSlice Studio ${ver} · Technical Context Brief`,
    titleBanner: 'ContextSlice Studio Technical Context Brief',
    metaLine1: (project: string, hops: number, ts: string) =>
      `Source: ${project}   |   Scope: ${hops}-Hop   |   Generated: ${ts}`,
    taskLabel: (q: string) =>
      `Task Query: ${q || '(auto-selected from top exported symbol)'}`,
    sec1Title: 'Context Slicing & Token Budget Summary',
    cardRawLabel: 'Raw Codebase',
    cardRawNote: (count: number) => `${count} symbol blocks`,
    cardSlicedLabel: 'Sliced Payload',
    cardSlicedNote: (budget: string, pct: number) => `Budget ${budget} (${pct}%)`,
    cardSavedLabel: 'Net Savings',
    cardSavedNote: (pct: number) => `Code reduced ${pct}%`,
    cardAutoLabel: 'Auto-Expanded',
    cardAutoValue: (count: number) => `${count} hubs`,
    cardAutoNote: (clusters: number) => `${clusters} complex clusters`,
    sec2Title: 'Full-Body Symbols (Focal & Auto-Expanded)',
    sec2Subtitle: (count: number) =>
      `${count} complete symbol blocks retained so AI has full implementation details`,
    sec2Empty: 'No symbols expanded to full body (folded to skeletons due to tight budget).',
    badgeAuto: '[AUTO-EXPANDED]',
    badgeFocal: '[FOCAL TARGET]',
    badgeManual: '[MANUAL FULL]',
    lineUnit: (lines: number) => `${lines} lines`,
    sec3Title: 'Dependency Graph Analysis',
    sec3Subtitle: (
      full: number,
      skel: number,
      map: number,
      excl: number,
      totalEdges: number,
      cross: number,
      intra: number,
    ) =>
      `Tiers: Full ${full} · Skel ${skel} · Map ${map} · Skip ${excl}  |  Total Edges ${totalEdges} (Cross ${cross} / Intra ${intra})`,
    edgeKindIntra: 'intra-file',
    edgeKindImport: 'import',
    edgeKindCross: 'cross-file',
    sec3Empty: 'No significant static call edges detected between loaded files.',
    tblName: 'Symbol / Block',
    tblFile: 'File Location',
    tblTier: 'Detail Tier',
    tblTokens: 'Tokens',
    autoExpandedLabel: 'Auto-Expanded',
    tierText: {
      full: 'Full Body',
      skeleton: 'Skeleton',
      map: 'Map Only',
      excluded: 'Excluded',
    } as Record<NodeTier, string>,
    sec4Title: 'Assembled Context Packet (Context Slice)',
    sec4Subtitle: 'Structured sliced context ready for LLM prompts or offline review',
    truncatedNotice: (maxPages: number) =>
      `Note: Content truncated at ${maxPages}-page limit; copy the full packet from the Copy & Paste tab.`,
    footerPrivacy: (ver: string) =>
      `ContextSlice Studio ${ver} · Generated locally in-browser — zero code uploaded`,
    footerPage: (page: number, total: number) => `Page ${page} of ${total}`,
    dateLocale: 'en-US',
  },
};

export const MESSAGES: Record<Locale, Messages> = {
  'zh-TW': zhTW,
  en,
};

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale] ?? MESSAGES['zh-TW'];
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: Messages;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'zh-TW',
  setLocale: () => {},
  toggleLocale: () => {},
  t: zhTW,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectDefaultLocale());

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    saveLocale(next);
  };

  const toggleLocale = () => {
    setLocale(locale === 'zh-TW' ? 'en' : 'zh-TW');
  };

  useEffect(() => {
    const msgs = getMessages(locale);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'zh-TW' ? 'zh-Hant' : 'en';
      document.title = msgs.app.pageTitle;
    }
  }, [locale]);

  const value: I18nContextValue = {
    locale,
    setLocale,
    toggleLocale,
    t: getMessages(locale),
  };

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
