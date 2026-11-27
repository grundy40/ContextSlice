# ContextSlice Studio (`v0.2.1`)

> **幫 AI 挑重點、省 Token 的程式結構分析與精簡工作台**  
> 在把程式碼交給 AI 之前，先自動找出要修改的函式與上下游關聯，將其他無關細節摺疊成「只留名稱與參數的外框」，大幅縮小體積並避免上下文溢位。

[![GitHub Repo](https://img.shields.io/badge/GitHub-ContextSlice-blue?style=flat)](https://github.com/grundy40/ContextSlice)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Agensi Free Skill](https://img.shields.io/badge/Agensi-Free%20Skill-success)](https://www.agensi.io/skills/context-slice)

---

## 目錄

1. [為什麼做這個工具？](#1-為什麼做這個工具)
2. [支援的程式語言與核心能力](#2-支援的程式語言與核心能力)
3. [本機安裝與啟動](#3-本機安裝與啟動)
4. [30 秒上手使用流程](#4-30-秒上手使用流程)
5. [四種串接方式（網頁版 / CLI / 免裝工具 / 1 個工具自動切）](#5-四種串接方式網頁版--cli--免裝工具--1-個工具自動切)
   - [OpenCode / Pi Agent / Claude Code 通用 1-Tool MCP](#51-opencode--pi-agent--claude-code-通用-1-tool-mcp)
   - [網頁版 AI 直接複製貼上（附提問模板）](#52-網頁版-ai-直接複製貼上附提問模板)
6. [專案結構與隱私安全](#6-專案結構與隱私安全)
7. [在 AI 對話中如何提問?](#7-在-ai-對話中如何提問)
8. [版本更新紀錄](#8-版本更新紀錄)
9. [授權條款](#9-授權條款)

---

## 1. 為什麼做這個工具？

平常請 AI 改程式時，最常遇到三個問題：

1. **一次貼太多檔案，Token 花費爆表**：改一個功能往往牽涉好幾個檔案，全部貼進去不只花錢，AI 也容易看到無關內容而答偏。
2. **單一檔案太長，貼不進對話框**：幾千行的長檔案沒辦法靠單純篩選檔名解決。
3. **傳統 AI 工具說明書太肥**：如果外掛了 20 個讀寫檔案工具，每輪對話都要先附上幾千個 Token 的工具說明書，浪費額度。

**ContextSlice Studio 的做法**：  
先在瀏覽器或本機幫程式碼畫出關聯圖，只把**要改的重點留完整**，有直接關聯的程式**只留標題與參數外框**，其餘無關程式自動略過；而且能用「自動補齊重點」功能偵測邏輯較複雜的模組，在額度內自動補全所需內容。

---

## 2. 支援的程式語言與核心能力

- **支援所有程式碼檔案**：任何文字型程式碼檔都能匯入分析，並自動略過圖片、壓縮檔、執行檔等二進位檔與 lock / minified 雜訊檔。其中 TypeScript / JavaScript、Python、Go、C / C++、Swift、PHP、HTML / Vue / Svelte、CSS / SCSS、Rust、Java / Kotlin、C#、Ruby、SQL 提供**深度語言解析**；其餘語言（如 Lua、Scala、Dart、Zig、Elixir、Shell、Makefile、設定檔等）由**通用解析器**自動切分函式與類別區塊，無結構可切分時以整檔模組方式呈現。
- **長檔案自動分段**：單檔過長時，自動拆解內部函式與類別，只展開你要修改的區塊。
- **彈性 Token 上限**：支援 `1K`、`4K`、`8K`、`16K`、`32K`、`64K`、`128K`、`256K`、`1M` 快速切換。
- **互動式程式關聯圖**：支援滑鼠滾輪縮放、拖曳平移、全景小地圖，以及「誰用到它 / 修改重點 / 它用到誰」分層檢視。
- **自動補齊重點（Proactive Discovery）**：當關聯節點邏輯較複雜時，自動呼叫 `expand_skeleton_cluster` 展開完整內容，並在頂部列提示補齊狀態。
- **省量分析與實戰基準測試**：
  - 內建 Recharts 迷你折線圖，跨重整保存最近 10 次操作的 Token 花費趨勢。
  - 內建 **多任務實戰基準測試（Benchmark）**，可針對目前專案一鍵實測精簡比率與執行耗時（ms）。
- **個人偏好記憶與一鍵重新掃描**：自動記住您的預算、關聯層數、工具資料夾與提問模板；支援瀏覽器資料夾權限的一鍵重新讀取（若處於不支援環境會自動切換為標準資料夾選取）。

---

## 3. 本機安裝與啟動

### 環境需求
- **Node.js**：建議 `v20.0.0` 以上（匯出至電腦使用的 `ctxslice.mjs` 與 `ctxslice-mcp.mjs` 僅依賴 Node 內建模組，**不需額外 `npm install`**）。

### 一鍵啟動（macOS / Linux / Windows 通用）

下載或 `git clone` 專案後，進入專案資料夾只需執行這**同一行指令**（會自動安裝缺少的套件、啟動伺服器並開啟瀏覽器）：

```bash
node start.mjs
```

也可使用 npm 指令啟動：`npm run launch`

### 傳統分段啟動指令

```bash
# 1. 安裝相依套件
npm install

# 2. 啟動開發伺服器（預設 http://localhost:3000）
npm run dev

# 3. 執行 TypeScript 型別檢查
npm run lint

# 4. 建置正式版靜態檔（輸出至 dist/）
npm run build
```

---

## 4. 30 秒上手使用流程

1. **不確定怎麼看？先點左側「新手入門引導」**：會用兩句白話快速說明左、中、右各區塊用途。
2. **匯入你的資料夾或檔案**：點擊右上角「匯入資料夾 / 檔案」，選擇本機程式碼資料夾、多個檔案或貼上單段長程式碼即可開始分析。
   - 若資料夾內含不支援檔案、超過 1.5MB 大檔或超過瀏覽器單次 200 檔上限，上方會顯示明確提示。
3. **輸入你想改的功能並選擇上限**：在上方搜尋列輸入任務（例如 `login`、`order`、`retry`），選擇 `1層相關` 或 `2層相關` 與目標 Token 上限。
4. **直接帶走結果**：從右側面板選擇你習慣的 AI 工具方式複製、下載，或匯出為離線 PDF 說明書即可。

---

## 5. 四種串接方式（網頁版 / CLI / 免裝工具 / 1 個工具自動切）

右側面板提供「**本機工具存放資料夾**」設定欄位（預設 `./tools`，可一鍵切換 `~/.contextslice/tools` 或 `/opt/tools`），修改後所有設定 JSON 與指令會即時同步更新。

### 5.1 OpenCode / Pi Agent / Claude Code 通用 1-Tool MCP

三套工具可共用同一支零依賴腳本 `ctxslice-mcp.mjs`：

1. 在右側切換至 **`1個工具自動切`** 分頁，填入你的存放路徑並點擊 **「下載工具主檔」** 存成 `ctxslice-mcp.mjs`。
2. 複製分頁提供的 **全域規則** 貼入對應規則檔：
   - **OpenCode**：`~/.config/opencode/AGENTS.md`
   - **Pi Agent**：`~/.pi/agent/AGENTS.md`
   - **Claude Code**：`~/.claude/CLAUDE.md`
3. 依你使用的工具複製對應設定（OpenCode JSON / Pi JSON / `claude mcp add` 指令）。
4. 複製分頁中的 **「一鍵測試指令」** 到終端機執行，看到工具列表回傳即代表設定成功。

### 5.2 網頁版 AI 直接複製貼上（附提問模板）

1. 在右側 **`複製貼上`** 分頁選擇想要的提問開頭（`只複製程式碼` / `修 Bug / 改功能` / `幫我解釋邏輯` / `檢查潛在問題`）。
2. 點擊 **「複製給 AI 的內容」**，直接貼到 ChatGPT、Claude Web 或 Gemini 對話框即可。

---

## 6. 專案結構與隱私安全

```text
├── index.html                           # 頁面進入點
├── start.mjs                            # macOS / Linux / Windows 一鍵啟動腳本
├── package.json                         # 套件與腳本定義
├── LICENSE                              # MIT 開源授權
└── src/
    ├── App.tsx                          # 主介面、偏好記憶、主動補齊、標籤與一鍵整理
    ├── version.ts                       # 版本號常數定義 (APP_VERSION)
    ├── types/context.ts                 # 資料型別與基準測試定義
    ├── engine/
    │   ├── astParser.ts                 # 多語言程式解析與關聯建圖
    │   ├── contextAssembler.ts          # 相關度評分、層級分配與封包組裝
    │   ├── cjkTokenizer.ts              # 中日韓 2-gram 分詞與 50+ 組雙語詞彙映射
    │   ├── semanticSearch.ts            # 符號語意模糊搜尋與加權比對引擎
    │   ├── skeletonExpansion.ts         # 複雜叢集偵測與自動補齊執行器
    │   ├── localImporter.ts             # 本機資料夾掃描與略過統計 (上限 200 檔)
    │   ├── pdfManualExporter.ts         # 離線 A4 技術摘要 PDF 匯出引擎
    │   ├── treeSitterBundle.ts          # Base64 內嵌 web-tree-sitter 核心執行期與 WASM
    │   └── scriptGenerators.ts          # CLI / 免工具 / 1-Tool MCP 腳本產生器
    └── components/
        ├── HeaderBar.tsx                # 頂部導覽列、自動補齊指示與一鍵重讀
        ├── ToolbarControls.tsx          # 專案切換、搜尋、關聯層數與 Token 上限
        ├── SymbolExplorer.tsx           # 左側檔案與函式清單
        ├── DependencyGraphView.tsx      # 互動式程式關聯圖與全景小地圖
        ├── SavingsDashboardView.tsx     # 省量指標、10 次趨勢圖與實戰基準測試
        ├── SkeletonDiffView.tsx         # 精簡前後對照視窗
        ├── UniversalOutputPanel.tsx     # 四端匯出、自訂路徑、提問模板與測試指令
        └── ImportModal.tsx              # 資料夾／多檔案匯入與長程式碼貼上彈窗
```

> **隱私保護**：所有程式碼解析、依賴建圖、基準測試與精簡封包產生皆在**您的瀏覽器本機記憶體**內完成，不會將您的任何原始碼傳送至外部伺服器。

---

## 7. 在 AI 對話中如何提問？

如果你在使用 ChatGPT、Claude Web、Gemini 等對話框時想用 ContextSlice 預處理程式碼，可以這樣做：

### 🚀 推薦提問模板

**只複製程式碼**：
```
# ContextSlice 預處理結果

請幫我檢查以下程式碼的潛在問題：
[貼上 ContextSlice 產出的精簡結果]

# 需要特別注意的功能函式：
# 請聚焦於這些函式的實作邏輯
```

**修 Bug**：
```
# ContextSlice 發現的關聯程式碼

我發現的 bug 在 `authService.validateToken()` 函式中。
以下是與之相關的程式碼片段（已自動精簡，保留關鍵細節）：
[貼上 ContextSlice 產出的精簡結果]

請幫我找出為什麼 token 驗證失敗。
```

**改功能**：
```
# ContextSlice 精簡分析

我想優化使用者登入流程。以下是與 `login` 相關的程式碼（已自動篩選只保留相關部分）：
[貼上 ContextSlice 產出的精簡結果]

請分析這段程式碼的最佳優化方案。
```

---

## 8. 版本更新紀錄

### v0.2.1（2026-11-27）

- **強化多語言腳本解析器（Multi-Language AST Extractors）**：在 `scriptGenerators.ts` 補齊 Go、Rust、Java、Kotlin、C#、C/C++ 專用函式與類別宣告正則提取，徹底解決非 JS/Python 語言在 CLI 與 MCP 端的退化問題。
- **狀態機括號匹配器（State-Machine `findBraceEnd`）**：計算括號深度前先以保留換行的遮罩演算法（`maskCommentsAndStrings`）屏蔽單行註解 `//...`、多行註解 `/*...*/`、`#...` 及字串字面量，徹底杜絕字串或註解中 `{` 導致的區塊截斷與行號偏移錯誤。
- **真實呼叫依賴圖（True Call Graph with BFS 1-hop & 2-hop）**：建立專案全域 `SymbolMap`，透過單字邊界呼叫正則（`\bfuncName\s*\(`）建立雙向呼叫拓撲，並以 BFS 算法精確計算 1 層與 2 層（`maxHops`）呼叫關聯，取代模糊字串包含。
- **WASM 版 Tree-sitter 實機引擎（Base64 內嵌 + 按需快取 + 優雅降級）**：新增 `src/engine/treeSitterBundle.ts` 內嵌 `web-tree-sitter@0.22.6` 純 JS 執行期與核心 WASM，使單檔 `ctxslice-mcp.mjs` 免 `npm install` 即可於首次解析時自動下載並快取各語言 `.wasm` 至 `~/.contextslice/parsers/tree-sitter-<lang>.wasm`；若處於離線或失敗環境（或設定 `CTXSLICE_DISABLE_WASM_FETCH=1`），自動無縫優雅降級回狀態機正則解析器。
- **版號統一連動與 CLI `--version` 支援**：`scriptGenerators.ts` 改為直接引用 `src/version.ts`（`APP_VERSION`），同步更新 `ctxslice.mjs` 與 `ctxslice-mcp.mjs` 的 `--version` / `-v` 旗標、`serverInfo.version`、`tools/list` 描述與 `<context_slice version="...">` 輸出屬性。
- **文案上限校準與依賴相容性修正**：保留瀏覽器單次 `200` 檔匯入上限並同步更新 `README.md`、`ImportModal.tsx` 與第 6 節專案結構樹（補齊 `version.ts`、`cjkTokenizer.ts`、`semanticSearch.ts`、`treeSitterBundle.ts`）；同時將 `package.json` 的 `esbuild` 升版至 `^0.28.0` 以相容 `vite@^8.3.0`，解決 `npm install` 的 `ERESOLVE` 衝突。

### v0.2.0（2026-11-27）

- **路徑消歧義與目錄配額限制（Path Disambiguation & Quota Cap）**：解決全端/微服務專案中多資料夾同名檔案（如 `frontend/utils/auth.ts` vs `backend/utils/auth.ts`）的誤判問題。評分時自動納入資料夾層級路徑匹配加權，並限制單一資料夾最多佔用 65% Token 預算，確保跨模組均衡分佈。
- **Omitted Top Matches 省略提示摘要**：在 `<context_slice>` 結尾自動附加極短的 `<omitted_top_matches>` 提示標籤（列出受限於預算而被卡掉的前 3 名高相關函式與檔案位置），讓 AI 一目了然並主動呼叫 `expand_skeleton_cluster` 按需補抓。
- **關鍵字稀缺度加權（簡易 TF-IDF）**：計算全專案文檔頻率（DF）與 IDF 稀缺度加權，自動對高頻通用詞（如 `data`、`id`、`error`）進行降權防噪。
- **純記憶體 mtime 增量快取**：於 MCP 伺服器中實作執行期 `FILE_CACHE = new Map()`，透過比對 `fs.statSync(f).mtimeMs` 避免重複讀檔與正則解析。
- **路徑限縮沙盒（subPath）與敏感檔過濾**：支援 `subPath` 參數與路徑越界防禦，並自動過濾 `.env`、`.pem`、`.key` 等機密檔案。
- **零依賴 BPE Token 精度估算與 32K 預算**：內建與 tiktoken 高度對齊的零依賴子詞 Token 估算器，預設 Token 上限提升至 32K。
- **未來擴充藍圖（Roadmap）**：預計支援專案專屬自訂同義詞與多語系字典配置檔（`.context/synonyms.json`）。

### v0.1.4（2026-11-23）

- **CJK 關鍵字匹配支援**：在 CLI 與 1-Tool MCP 腳本中加入中文/日文/韓文 2-gram 分詞與雙語擴展，支援 `登入驗證`、`数据处理` 等非英語查詢。
- **生成器模板整合 CJK 邏輯**：`scriptGenerators.ts` 現在生成的 `ctxslice.mjs` 與 `ctxslice-mcp.mjs` 內置輕量 CJK 2-gram 分詞器與 50 組中英對照表，無需外部依賴。

### v0.1.3（2026-11-22）

- **預設工具路徑改為相對路徑**：將硬編碼的 Windows 路徑（`D:/tools`）改為專案內相對路徑（`./tools`），提升跨平台相容性。
- **新增家目錄選項**：新增 `~/.contextslice/tools` 選項，方便在 Mac / Linux 環境使用用戶家目錄存放工具。

### v0.1.2（2026-11-22）

- **支援所有程式碼檔案**：匯入層改為接受所有文字型程式碼檔（含無副檔名的 Makefile、Dockerfile、shell 腳本與各種設定檔），自動略過圖片、壓縮檔、執行檔等二進位檔與 lock / minified 雜訊檔。
- **新增通用解析器**：未列名語言（Lua、Scala、Dart、Zig、Elixir 等）自動切分函式與類別區塊，大型容器會提取內部方法；無結構可切分時以整檔模組呈現。
- **匯出工具同步**：`ctxslice.mjs` 與 `ctxslice-mcp.mjs` 採用相同檔案篩選邏輯，並為 end 結尾語言加入 skeleton 折疊退化保護。

### v0.1.1（2026-11-21）

- 首次公開發布：多語言 AST 解析、互動式程式關聯圖、四種串接方式（網頁版複製貼上 / CLI / 免裝工具 / 1-Tool MCP）、省量分析與實戰基準測試、離線 PDF 匯出。

---

## 9. 授權條款

本專案採用 [MIT License](./LICENSE) 開源授權。

---

### 📎 相關連結

- **GitHub 原始碼**：[https://github.com/grundy40/ContextSlice](https://github.com/grundy40/ContextSlice)
- **Agensi 免費技能（透過推廣連結下載）**：[https://www.agensi.io/r/GRUNDY40?to=/skills/context-slice](https://www.agensi.io/r/GRUNDY40?to=/skills/context-slice)
