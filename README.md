# ContextSlice Studio (`v0.1.1`)

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
7. [授權條款](#7-授權條款)

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

- **支援多語言解析與精簡**：TypeScript / JavaScript、Python、Go、C / C++、Swift、PHP、HTML / Vue / Svelte、CSS / SCSS、Rust、Java / Kotlin、C#、Ruby、SQL。
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
   - 若資料夾內含不支援檔案、超過 1.5MB 大檔或超過瀏覽器單次 80 檔上限，上方會顯示明確提示。
3. **輸入你想改的功能並選擇上限**：在上方搜尋列輸入任務（例如 `login`、`order`、`retry`），選擇 `1層相關` 或 `2層相關` 與目標 Token 上限。
4. **直接帶走結果**：從右側面板選擇你習慣的 AI 工具方式複製、下載，或匯出為離線 PDF 說明書即可。

---

## 5. 四種串接方式（網頁版 / CLI / 免裝工具 / 1 個工具自動切）

右側面板提供「**本機工具存放資料夾**」設定欄位（預設 `D:/tools`，可一鍵切換 `./tools` 或 `/opt/tools`），修改後所有設定 JSON 與指令會即時同步更新。

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
    ├── types/context.ts                 # 資料型別與基準測試定義
    ├── engine/
    │   ├── astParser.ts                 # 多語言程式解析與關聯建圖
    │   ├── contextAssembler.ts          # 相關度評分、層級分配與封包組裝
    │   ├── skeletonExpansion.ts         # 複雜叢集偵測與自動補齊執行器
    │   ├── localImporter.ts             # 本機資料夾掃描與略過統計
    │   ├── pdfManualExporter.ts         # 離線 A4 技術摘要 PDF 匯出引擎
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

## 7. Agensi 免費技能上架

ContextSlice 已經上架為 Agensi.io 上的免費 AI Agent 技能，讓你的 Claude Code、Copilot 等 AI 編碼工具能自動使用 ContextSlice 進行 Token 節省。

### 📥 下載方式

**方式 1：直接下載 MCP 服務（推薦）**
```bash
# 執行完這個指令後，你的 AI 編碼工具就會自動在每次分析程式碼時，先呼叫 ContextSlice
claude mcp add --scope user context-slice -- node /path/to/tools/ctxslice-mcp.mjs
```

**方式 2：到 Agensi 平台搜尋**
訪問 https://www.agensi.io ，搜尋 `context-slice` 即可下載。

### 💡 上架後的好處：

1. **免費**：不用付錢，就能使用
2. **自動化**：AI 編碼工具自動调用，不需要手動操作
3. **隱私**：所有處理都在本機完成
4. **跨工具**：支援 Claude Code、Copilot、Cursor、OpenCode 等 20+ 個 AI 編碼工具

---

## 8. 在 AI 對話中如何提問？

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

## 7. 授權條款

本專案採用 [MIT License](./LICENSE) 開源授權。

---

### 📎 相關連結

- **GitHub 原始碼**：[https://github.com/grundy40/ContextSlice](https://github.com/grundy40/ContextSlice)
- **Agensi 免費技能（透過推廣連結下載）**：[https://www.agensi.io/r/GRUNDY40?to=/skills/context-slice](https://www.agensi.io/r/GRUNDY40?to=/skills/context-slice)
