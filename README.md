# ContextSlice Studio (`v0.4.1`)

> **Targeted Structural Code Slicing & 1-Tool MCP Brain Plugin for AI Coding Agents**  
> Before an LLM reads your codebase, ContextSlice builds a local dependency graph via **structural parsing** — returning a compact **Dual-State File Tree** when queries are empty or miss, preserving **complete implementations only for focal targets**, folding `1-hop` / `2-hop` neighbors into **signature skeletons**, and leaving unused budget blank without padding noise.

🌐 **Language / 語言**: **English** · [繁體中文](#繁體中文說明-traditional-chinese)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-emerald?style=flat)](https://grundy40.github.io/ContextSlice/)
[![npm package](https://img.shields.io/npm/v/%40grundy40%2Fcontextslice?color=cb3837&label=npm)](https://www.npmjs.com/package/@grundy40/contextslice)
[![GitHub Repo](https://img.shields.io/badge/GitHub-ContextSlice-blue?style=flat)](https://github.com/grundy40/ContextSlice)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

---

## English Documentation

### Table of Contents
1. [Why ContextSlice?](#1-why-contextslice)
2. [Supported Languages & Core Capabilities](#2-supported-languages--core-capabilities)
3. [User & Developer Guide (General Users vs. Project Developers)](#3-user--developer-guide-general-users-vs-project-developers)
4. [30-Second Web Workbench Tour](#4-30-second-web-workbench-tour)
5. [Four Integration Modes (1-Tool MCP / CLI / Zero-Install / Web UI)](#5-four-integration-modes-1-tool-mcp--cli--zero-install--web-ui)
6. [Project Structure & Privacy](#6-project-structure--privacy)
7. [How to Prompt in AI Chats](#7-how-to-prompt-in-ai-chats)
8. [Changelog](#8-changelog)
9. [Real-World 32K Benchmark & Budget Guide](#9-real-world-32k-benchmark--budget-guide)
10. [License & Links](#10-license--links)

---

### 1. Why ContextSlice?

AI coding assistants routinely hit three costly bottlenecks when reading real repositories:
1. **Token explosion from full-file reads**: Fixing one feature often spans multiple files; dumping whole source files wastes budget and dilutes model attention.
2. **Monolithic files & giant config dumps**: Multi-thousand-line modules or large JSON/YAML/config files exceed context budgets unless sliced structurally or windowed around matched lines.
3. **Bloated MCP tool schemas ("Protocol Tax")**: Attaching 20+ file-reading and grep tools injects thousands of schema tokens into every single conversation turn before any real work starts.

**How ContextSlice solves this**:  
Designed primarily as a **zero-dependency 1-Tool MCP brain plugin (`ctxslice-mcp`) and CLI (`ctxslice`)**—paired with a **visual Web UI workbench**—ContextSlice performs local structural parsing and call-graph tracing. It enforces **on-demand blanking** (never stuffing unrelated code into leftover budget) and a **Dual-State File Tree** safeguard so agents never hallucinate missing files or symbols.

---

### 2. Supported Languages & Core Capabilities

- **Multi-Language Structural Parsing**: Supports **TypeScript / JavaScript, Python, Go, Rust, Java, Kotlin, C#, C / C++, Swift, PHP, Ruby, SQL**, plus embedded `web-tree-sitter` WASM with lazy grammar caching (`~/.contextslice/parsers/`) and automatic offline state-machine brace-matching fallback.
- **Full-Format Plain-Text Config Search & ±40-Line Local Windowing**: Indexes `.json`, `.jsonc`, `.json5`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.conf`, `.xml`, `.properties`, and `.txt` (supporting version numbers and config keys like `0.4.0` or `budget`), while automatically skipping lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, etc.) and `.env` / `.pem` / `.key` secrets. Config files over **200 lines** automatically extract **±40-line local windows** around matched lines.
- **Dual-State File Tree & On-Demand Blanking (Anti-Hallucination)**:
  - **State A (`query.trim() === ""`)**: Outputs `mode="file_tree_empty_query"` with a compact repository file tree (~1K–2K tokens) and an explicit `<note>` instructing the agent to call `context_slice` again with specific symbols or file keywords.
  - **State B (`0 matches`)**: Outputs `mode="file_tree_zero_matches"` with the repository file tree and an explicit warning `<note>` forbidding the agent from guessing code from filenames alone.
  - **Matched Queries**: Outputs ONLY focal complete implementations, `1-hop`/`2-hop` neighbor skeletons, and same-file types/constants—leaving remaining budget blank.
- **Line-Range XML Boundary Tags**: Every `<file>` tag includes `total_lines` and `shown_lines` (e.g., `<file path="src/context.ts" total_lines="1050" shown_lines="1-45, 210-285">`) to prevent large-file boundary hallucinations.
- **Unified 32K Default Budget**: Standardized to **`32,768` (`32K`)** across Web UI, CLI, and 1-Tool MCP based on cross-repo refactoring benchmarks (with instant switching across `1K`–`1M` in Web UI).
- **Safe Conversational Stopword Filtering & CJK Bilingual Search**: Strips conversational filler (`how to`, `fix the`, `為什麼`, `怎麼`, `幫我`) without harming technical keywords, alongside CJK 2-gram tokenization and 50+ bilingual synonyms.
- **Web UI Pure Empty State & Smart Topic Chips**: Zero built-in fake sample projects; starts with a clean 1-step local import/paste card and scans imported file paths and symbol roots to generate 4–6 clickable bilingual topic chips.

---

### 3. User & Developer Guide (General Users vs. Project Developers)

#### 👥 General Users (No Repository Download Required)
If you simply want to plug ContextSlice into **Claude Code, OpenCode, Pi Agent, or Cursor** as an AI coding brain plugin or run it in your terminal, **no project clone or `npm install` is required**:

```bash
# Run zero-dependency CLI slicer directly on your current repository
npx @grundy40/contextslice "login token validation" --budget 32768

# Or get a compact repository file tree overview (~1K-2K tokens)
npx @grundy40/contextslice ""

# Or register the 1-Tool MCP server in Claude Code
claude mcp add --scope user context-slice -- npx -y -p @grundy40/contextslice ctxslice-mcp
```

Or install globally (`npm install -g @grundy40/contextslice`) to use `contextslice`, `ctxslice`, and `ctxslice-mcp` directly.

#### 💻 Project Developers (Run or Extend the Web Workbench)
If you want to run the **ContextSlice Studio Web UI** locally, customize the engine, or rebuild standalone CLI/MCP binaries (`Node.js >= 20` recommended):

```bash
# 1. Install dependencies
npm install

# 2. One-command launch (auto-checks deps, starts dev server on port 3000 & opens browser)
node start.mjs
```

Manual development & build commands:

```bash
npm run dev        # Start local dev server (http://localhost:3000)
npm run lint       # Run TypeScript type check
npm run build      # Build production web bundle to dist/
npm run build:cli  # Bundle src/engine/scriptGenerators.ts into packages/cli/bin/
```

---

### 4. 30-Second Web Workbench Tour

> 🚀 **Try the Free Live Web Demo (No Setup Needed):** [https://grundy40.github.io/ContextSlice/](https://grundy40.github.io/ContextSlice/)

1. **Pure Empty Start**: Open the workbench to a focused 1-step onboarding card: **Import Local Folder**, **Select Files**, or **Paste Code**. All processing runs 100% locally in browser memory.
2. **One-Click Smart Topic Chips**: Right after importing your project, ContextSlice scans file paths and extracted symbol roots to render **4–6 bilingual Smart Topic Chips** below the search bar—click any chip to slice immediately even if you don't know exact function names.
3. **Inspect & Tune Visually**: Explore the interactive dependency graph (zoom, pan, minimap), compare raw vs. skeleton diffs, view 10-turn token savings trends, or run the 3-scenario live benchmark.
4. **Export Anywhere**: Copy ready-to-paste AI prompt packets, download standalone `ctxslice.mjs` / `ctxslice-mcp.mjs`, or export an offline A4 PDF brief.

---

### 5. Four Integration Modes (1-Tool MCP / CLI / Zero-Install / Web UI)

#### 5.1 Universal 1-Tool MCP (`ctxslice-mcp`) — Recommended AI Agent Core Plugin
**OpenCode**, **Pi Agent**, and **Claude Code** share the same single-file, zero-dependency MCP server (`ctxslice-mcp.mjs`):
1. Register via `npx` (`claude mcp add --scope user context-slice -- npx -y -p @grundy40/contextslice ctxslice-mcp`) or download `ctxslice-mcp.mjs` from the **`1-Tool MCP`** tab in Web UI.
2. Add the auto-invoke rule to your agent instruction file (`~/.claude/CLAUDE.md`, `~/.config/opencode/AGENTS.md`, or `~/.pi/agent/AGENTS.md`):
   ```markdown
   When inspecting, debugging, or modifying code in any project folder, ALWAYS call the `get_context_slice` MCP tool first (passing `projectPath` and `query`) BEFORE reading raw files.
   ```
3. Run the one-line JSON-RPC verification command shown in the panel to confirm `get_context_slice` responds properly.

#### 5.2 CLI Mode (`ctxslice`)
Run `npx @grundy40/contextslice "<query>" --root ./my-project --budget 32768` or `node ./tools/ctxslice.mjs "<query>"` to emit XML slices cleanly to `stdout` in terminals or CI scripts.

#### 5.3 Zero-Install Mode (`Zero-MCP`)
Generates a 42-token micro-rule (`AGENTS.md`) and `SKILL.md` for agents with bash access—avoiding even minimal MCP schema overhead.

#### 5.4 Web UI Copy & Paste (Visual Companion)
Open the **`Copy & Paste`** tab, choose a prompt template (`Code Only` / `Bug Fix / Feature` / `Explain Logic` / `Audit Issues`), and paste directly into ChatGPT, Claude Web, or Gemini.

---

### 6. Project Structure & Privacy

```text
├── README.md                            # Single bilingual documentation (English + 繁體中文)
├── index.html                           # HTML entry point & SEO metadata
├── metadata.json                        # App metadata & versioned capabilities
├── start.mjs                            # Cross-platform one-click launcher
├── package.json                         # Single source of truth for version & npm scripts
├── LICENSE                              # MIT License
├── .github/workflows/
│   ├── deploy-pages.yml                 # Automated GitHub Pages Live Demo deploy on main
│   └── publish-npm.yml                  # Automated npm publish on v* Git tags
├── scripts/
│   └── build-cli.mjs                    # Builds packages/cli/bin/* & syncs CLI package version
├── packages/cli/                        # Zero-dependency @grundy40/contextslice npm package
│   ├── package.json                     # bin mappings (contextslice, ctxslice, ctxslice-mcp)
│   ├── README.md                        # Pure-English npm package documentation
│   └── bin/                             # Generated single-file CLI & MCP binaries (gitignored)
└── src/
    ├── App.tsx                          # Main workbench, preferences, proactive discovery & layout
    ├── i18n.ts                          # Bilingual en / zh-TW dictionary, auto-detect & persistence
    ├── version.ts                       # Reads APP_VERSION directly from root package.json
    ├── types/context.ts                 # TypeScript types for symbols, assembly, MCP & benchmarks
    ├── engine/
    │   ├── astParser.ts                 # Multi-language structural parser & call graph builder
    │   ├── contextAssembler.ts          # Dual-state File Tree, TF-IDF, windowing & XML builder
    │   ├── cjkTokenizer.ts              # CJK 2-gram tokenizer & 50+ bilingual synonym pairs
    │   ├── semanticSearch.ts            # Semantic search, safe stopwords & score propagation
    │   ├── skeletonExpansion.ts         # Complexity cluster detector & expand_skeleton_cluster
    │   ├── localImporter.ts             # Local folder scanner & secret/lockfile skip filters
    │   ├── pdfManualExporter.ts         # Offline A4 technical brief PDF generator (jsPDF)
    │   ├── treeSitterBundle.ts          # Base64-embedded web-tree-sitter runtime & core WASM
    │   └── scriptGenerators.ts          # Generators for CLI, Zero-MCP & 1-Tool MCP scripts
    └── components/
        ├── HeaderBar.tsx                # Navigation tabs, EN/繁中 switcher, tags & rescan
        ├── ToolbarControls.tsx          # Search bar, dynamic Smart Topic Chips & 32K budget
        ├── SymbolExplorer.tsx           # Left-hand file & symbol explorer
        ├── DependencyGraphView.tsx      # 1-step empty onboarding card, interactive graph & minimap
        ├── SavingsDashboardView.tsx     # Token savings metrics, 10-turn chart & live benchmark
        ├── SkeletonDiffView.tsx         # Side-by-side raw vs. skeleton diff inspector
        ├── UniversalOutputPanel.tsx     # 4 integration modes, prompt builder & verify commands
        └── ImportModal.tsx              # Folder/multi-file importer & long-snippet paste modal
```

> **Privacy Guarantee**: All code parsing, dependency graphing, benchmarking, and context assembly run **100% locally** in your browser or on your own machine. Your source code is never uploaded to any external server.

---

### 7. How to Prompt in AI Chats

#### Code Review
```text
# ContextSlice Pre-processed Result
Please review the following code slice for potential bugs, edge cases, or regressions:

[Paste ContextSlice output here]

# Focus on the <focal> implementations first and use <skeleton> blocks as interface contracts.
```

#### Bug Fix
```text
# ContextSlice Relevant Code Slice
I'm hitting a bug inside `authService.validateToken()`.
Below is the sliced context (focal implementation preserved in full, direct dependencies folded into skeletons):

[Paste ContextSlice output here]

Please identify why token validation fails and propose a minimal fix.
```

#### Feature / Refactor
```text
# ContextSlice Architectural Slice
I want to optimize the user login flow. Below is the `login` call slice selected within 32K budget:

[Paste ContextSlice output here]

Please recommend the cleanest refactoring approach without breaking upstream callers.
```

---

### 8. Changelog

#### `v0.4.1` (2026-11-28)
- **Focal-First Budget Priority & Doc/Test Downweighting**: Downweighted documentation (`*.md`, `docs/**`, `CHANGELOG*`, `README*`) and test files (`tests/**`, `*_test.*`, `*.test.*`, `*.spec.*`, `test_*.*`) unless explicitly queried, enforced strict focal-first `<focal>` allocation before `hop="1"` skeletons, filtered pure syntax keywords (`class`, `def`, `function`, etc.) when symbol terms are present, and applied per-slice token caps so docs/tests never crowd out core source implementations under tight budgets (`16K`).
- **Markdown Duplicate Header/Skeleton Fix & Compact Windowing**: Eliminated redundant `<file_header>` emission on `.md` files and module skeletons starting at line 1, and added compact ±16-line local windowing (480-token cap per doc) to prevent huge files like `CHANGELOG.md` from exhausting budget.
- **Python Method-Level AST/Structural Extraction & Class Skeletons**: Recursively extracts methods inside Python `class_definition` (`ClassName.methodName`) across Web AST, CLI regex, and MCP Tree-sitter WASM; renders full `<focal>` implementations for matched methods while keeping the parent class as a structural `<skeleton>` with attribute summaries and folded unhit sibling methods instead of collapsing the whole class into one line.

#### `v0.4.0` (2026-11-28)
- **Dual-State File Tree & Strict On-Demand Blanking**: Implemented State A (`mode="file_tree_empty_query"`) and State B (`mode="file_tree_zero_matches"`) with explicit `<note>` anti-hallucination prompts across Web UI, CLI (`ctxslice`), and 1-Tool MCP (`ctxslice-mcp`). Removed unrelated code padding so unused budget stays blank.
- **Line-Range `<file>` XML Attributes**: Added `total_lines` and `shown_lines` attributes to `<file>` tags across Web UI, CLI, and 1-Tool MCP to prevent large-file boundary hallucinations.
- **Unified `32,768` (`32K`) Default Budget & Single-Source Versioning**: Aligned default budget to `32768` everywhere; switched `src/version.ts` to read directly from root `package.json`, synced `packages/cli/package.json` via `scripts/build-cli.mjs`, and updated `.github/workflows/publish-npm.yml`.
- **Full-Format Plain-Text Config Search & ±40-Line Local Windowing**: Added full indexing for `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.conf`, `.xml`, `.properties`, and `.txt` (supporting version tokens like `0.4.0`), skipping lockfiles and `.env` secrets, with automatic ±40-line local window truncation for config files > 200 lines.
- **Safe Conversational Stopword Filtering**: Strips natural-language filler (`how to`, `fix the`, `為什麼`, `怎麼`, `幫我`) without dropping technical identifiers.
- **Web UI Pure Empty State & Dynamic Smart Topic Chips**: Removed fake sample data in favor of a 1-step local import/paste card, and added post-import scanning of file paths and symbol roots to generate 4–6 bilingual clickable topic chips.
- **Single Bilingual `README.md` & Terminology Alignment**: Consolidated documentation into a single bilingual `README.md`, removed `README.zh-TW.md`, updated `packages/cli/README.md`, and standardized terminology to `"structural parsing"`.

#### `v0.3.4` (2026-11-27)
- **Top-Level Constant Indexing & File Footer Preservation**: Indexed module-level constants/exports across Python, TS/JS, Go, and Rust and added `<file_footers>` trailing export preservation across Web UI, CLI, and MCP.

#### `v0.3.3` (2026-11-27)
- **File Header Preservation (`<file_headers>`)**: Preserved top-level imports, module constants, and type/interface declarations whenever any block in a file is sliced.

#### `v0.3.2` (2026-11-27)
- **GitHub Pages Live Demo & `contextslice` Alias**: Added `.github/workflows/deploy-pages.yml` and `"contextslice"` bin alias.

#### `v0.3.1` (2026-11-27)
- **Zero-Dependency npm Package (`@grundy40/contextslice`)**: Added `packages/cli/`, `scripts/build-cli.mjs`, and `.github/workflows/publish-npm.yml`.

#### `v0.3.0` (2026-11-27)
- **Bilingual `en` / `zh-TW` UI Switcher**: Added `src/i18n.ts` dictionary, auto-detection, persistence, and `EN / 繁中` toggle.

#### `v0.2.1` (2026-11-27)
- **Multi-Language Extractors, State-Machine `findBraceEnd`, True Call Graph & Embedded Tree-sitter WASM**: Added Go/Rust/Java/Kotlin/C#/C++ extractors, BFS call graph, and lazy WASM caching with offline fallback.

#### `v0.2.0` (2026-11-27)
- **Path Disambiguation, Directory Quota Cap (65%), TF-IDF Scarcity, `subPath` Sandbox & `mtime` Cache**.

#### `v0.1.4` – `v0.1.1` (2026-11-21 – 2026-11-23)
- Initial release with CJK 2-gram + bilingual synonym search, cross-platform `./tools` path support, universal text ingestion, interactive call graph, 4 integration modes, and offline PDF export.

---

### 9. Real-World 32K Benchmark & Budget Guide

Evaluated on cross-file call-graph tracing and code-patching tasks across three major open-source repositories (**Hono** in TypeScript, **HTTPX** in Python, and **Gin** in Go):

| Context Mode | Avg. Input Tokens | Token Reduction | Hono (TS) | HTTPX (Py) | Gin (Go) | Overall Pass Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Full Core Directory (Baseline)** | ~215,000 | — | ✅ PASS | ✅ PASS | ✅ PASS | **100% (3/3)** |
| **ContextSlice `32K` (Default)** | **32,768** | **-85.1%** | ✅ PASS | ✅ PASS | ✅ PASS | **100% (3/3)** 🏆 |
| **ContextSlice `16K`** | 16,384 | -92.4% | ❌ FAIL | ❌ FAIL | ✅ PASS | 33.3% (1/3) |
| **ContextSlice `8K`** | 8,192 | -96.2% | ❌ FAIL | ⚠️ Partial | ✅ PASS | 33.3% (1/3) |

> **Key Takeaway**: At the unified **`32,768` (`32K`)** default budget, ContextSlice achieves **100% code-patching pass rate** across TypeScript, Python, and Go while cutting **85.1%** of token costs.

| Project Scale | Codebase Size | Recommended `--budget` | Est. Token Savings | Best Use Case |
| :--- | :---: | :---: | :---: | :--- |
| **Micro / Scripts** | `< 15 KLOC` | `8,192` – `16,384` | ~70% – 85% | Single-file lookups, small utilities |
| **Small–Medium App** | `15 – 80 KLOC` | `24,576` – `32,768` | ~80% – 88% | Standard bug fixes & feature work |
| **Large Framework** | `80 – 300 KLOC` | **`32,768` – `49,152`** | ~85% – 93% | Cross-file call-graph refactoring |
| **Enterprise Monorepo** | `> 300 KLOC` | **`49,152` – `65,536`** | ~90% – 96% | Multi-module architecture changes |

---

### 10. License & Links

Released under the [MIT License](./LICENSE).

- **Live Web Demo (GitHub Pages)**: [https://grundy40.github.io/ContextSlice/](https://grundy40.github.io/ContextSlice/)
- **Interactive Budget Calculator & Full Benchmark Report**: [https://grundy40.github.io/ContextSlice/benchmark.html](https://grundy40.github.io/ContextSlice/benchmark.html)
- **npm Package (`@grundy40/contextslice`)**: [https://www.npmjs.com/package/@grundy40/contextslice](https://www.npmjs.com/package/@grundy40/contextslice)
- **GitHub Repository**: [https://github.com/grundy40/ContextSlice](https://github.com/grundy40/ContextSlice)
- **Agensi Free Skill**: [https://www.agensi.io/r/GRUNDY40?to=/skills/context-slice](https://www.agensi.io/r/GRUNDY40?to=/skills/context-slice)

---

&nbsp;

---

# 繁體中文說明 (Traditional Chinese)

> **專為 AI 程式開發打造之精準結構化切片與 1-Tool MCP 大腦外掛**  
> 在 AI Agent 讀取大型專案前，ContextSlice 透過本地**結構解析（Structural Parsing）**建立依賴呼叫圖——空查詢或未命中時回傳精準防呆的**雙狀態目錄樹**，命中時僅輸出**目標完整程式碼與 1/2-Hop 關聯外框**，剩餘預算直接留白省錢、絕不硬塞無關檔案。

🌐 **Language / 語言**: [English](#contextslice-studio-v041) · **繁體中文**

---

## 目錄
1. [為什麼選擇 ContextSlice？](#1-為什麼選擇-contextslice)
2. [支援語言與核心技術](#2-支援語言與核心技術)
3. [使用者與開發者分流指南（一般使用者 vs. 專案開發者）](#3-使用者與開發者分流指南一般使用者-vs-專案開發者)
4. [網頁版工作台 30 秒上手](#4-網頁版工作台-30-秒上手)
5. [四大整合模式（1-Tool MCP / CLI / 免裝工具 / 網頁版）](#5-四大整合模式1-tool-mcp--cli--免裝工具--網頁版)
6. [專案結構與隱私安全](#6-專案結構與隱私安全)
7. [在 AI 對話中的推薦提問模板](#7-在-ai-對話中的推薦提問模板)
8. [版本更新紀錄（Changelog）](#8-版本更新紀錄changelog)
9. [32K 實戰基準測試與預算指南](#9-32k-實戰基準測試與預算指南)
10. [授權與相關連結](#10-授權與相關連結)

---

### 1. 為什麼選擇 ContextSlice？

使用 AI 程式助理處理真實專案時，開發者最常遇到三大瓶頸：
1. **傾倒整支檔案導致 Token 爆炸**：修復單一功能常跨多個模組，直接把所有完整檔案餵給模型不僅燒預算，更會產生大量雜訊干擾判斷。
2. **超大程式碼或巨型設定檔塞爆上下文**：動輒上千行的核心模組或大型 JSON/YAML 設定檔，單靠檔名過濾無法精準節流。
3. **傳統 MCP 工具過多產生沉重「協議稅」**：同時掛載 20 個以上讀檔與 grep 工具，每輪對話還沒開始做事就先白燒數千個宣告 Token。

**ContextSlice 的解法**：  
以 **零依賴 1-Tool MCP 大腦外掛（`ctxslice-mcp`）與命令列工具（`ctxslice`）** 為核心定位，搭配 **網頁版視覺化輔助工作台**，在本地完成結構解析與呼叫圖追蹤；嚴格執行 **「按需留白不硬塞」** 與 **雙狀態目錄樹防呆機制**，大幅壓低 Token 成本並杜絕 AI 幻覺。

---

### 2. 支援語言與核心技術

- **多語言結構解析與呼叫圖**：支援 **TypeScript / JavaScript、Python、Go、Rust、Java、Kotlin、C#、C / C++、Swift、PHP、Ruby、SQL**；MCP 內嵌 Base64 `web-tree-sitter` 執行期與惰性語法快取（`~/.contextslice/parsers/`），斷網時自動無縫降級為狀態機括號匹配器。
- **全格式純文字設定檔搜尋與 ±40 行局部視窗保護**：完整納入 `.json`、`.jsonc`、`.json5`、`.yaml`、`.yml`、`.toml`、`.ini`、`.cfg`、`.conf`、`.xml`、`.properties`、`.txt`（支援純數字版號與鍵名如 `0.4.0`、`budget` 精準命中），同時自動略過 lockfile（`package-lock.json`、`yarn.lock`、`pnpm-lock.yaml` 等）與 `.env` / `.pem` / `.key` 機密檔；超過 **200 行** 的大型設定檔自動以命中行號前後各 **40 行** 局部視窗截取，防止一次耗盡額度。
- **雙狀態目錄樹防呆與按需留白原則**：
  - **狀態 A（空查詢 `query.trim() === ""`）**：輸出 `mode="file_tree_empty_query"` 與專案檔案目錄樹（約 1K~2K Tokens），並附上明確 `<note>` 引導 AI 指定關鍵字再次呼叫。
  - **狀態 B（關鍵字 0 命中）**：輸出 `mode="file_tree_zero_matches"` 與目錄樹，並在 `<note>` 明確警告 Agent 禁止從目錄樹猜測程式碼，應從樹中挑選有效路徑或符號重新呼叫。
  - **有命中時**：僅輸出焦點完整實作、1/2-Hop 關聯外框與同檔型別/常數，剩餘預算直接留白省錢，絕不硬塞無關檔案。
- **XML `<file>` 邊界行號標註（防大檔幻覺）**：輸出統一加上 `total_lines` 與 `shown_lines` 屬性（例如 `<file path="src/context.ts" total_lines="1050" shown_lines="1-45, 210-285">`），零效能損耗且讓 AI 清楚掌握檔案全貌與顯示區間。
- **全端統一 `32,768`（32K）預設預算**：網頁版、CLI 與 1-Tool MCP 預設預算統一設為 32,768，與真實開源庫（Hono / HTTPX / Gin）基準測試報告黃金標準對齊。
- **安全語助詞過濾與多語雙語檢索**：僅濾除純自然語言口語停用詞（如 `為什麼`、`怎麼`、`幫我`、`修改`、`的`、`了`、`how to`、`fix the`），絕不誤傷技術關鍵字，並支援 CJK 2-gram 與 50+ 組中英日韓同義詞擴展。
- **網頁版純淨空狀態與動態智慧熱點標籤**：不內建任何假範例專案；初始僅顯示極簡清晰的「匯入本機資料夾 / 選擇檔案 / 貼上程式碼」一步行動卡片，匯入真實專案後自動掃描檔名與高頻業務詞根，於搜尋列下方產生 4～6 個雙語可點擊標籤。

---

### 3. 使用者與開發者分流指南（一般使用者 vs. 專案開發者）

#### 👥 一般使用者（免下載專案，直接執行零依賴 CLI / 1-Tool MCP）
如果你只想把 ContextSlice 接進 **Claude Code、OpenCode、Pi Agent、Cursor** 當作 AI 大腦外掛，或在終端機快速切片，**完全不需要下載或 clone 專案原始碼**：

```bash
# 免下載專案，直接透過 npx 零依賴執行切片
npx @grundy40/contextslice "login token validation" --budget 32768

# 傳入空查詢，快速取得專案目錄樹總覽（約 1K-2K Tokens）
npx @grundy40/contextslice ""

# 一行將 1-Tool MCP 伺服器註冊至 Claude Code
claude mcp add --scope user context-slice -- npx -y -p @grundy40/contextslice ctxslice-mcp
```

若常態使用可全域安裝：`npm install -g @grundy40/contextslice`，即可隨時呼叫 `contextslice`、`ctxslice` 與 `ctxslice-mcp`。

#### 💻 專案開發者（下載原始碼啟動網頁版工作台與自訂引擎）
如果你想在本機執行 **ContextSlice Studio 網頁版視覺化工作台**、修改核心引擎或重新建置獨立執行檔（建議 `Node.js >= 20`）：

```bash
# 1. 安裝相依套件
npm install

# 2. 一鍵啟動網頁版工作台（自動啟動伺服器並開啟瀏覽器）
node start.mjs
```

常用開發與建置指令：

```bash
npm run dev        # 啟動本機開發伺服器 (http://localhost:3000)
npm run lint       # 執行 TypeScript 型別與語法檢查
npm run build      # 建置網頁版正式輸出至 dist/
npm run build:cli  # 重新編譯並同步版號至 packages/cli/bin/
```

---

### 4. 網頁版工作台 30 秒上手

> 🚀 **免安裝立即線上試用（GitHub Pages Live Demo）：** [https://grundy40.github.io/ContextSlice/](https://grundy40.github.io/ContextSlice/)

1. **純淨一步匯入**：開啟工作台後直接點擊 **「匯入本機資料夾」**、**「選擇檔案」** 或 **「貼上程式碼」**（全程於瀏覽器本機記憶體運算，不上傳任何原始碼；單次匯入上限 200 檔，大型專案建議使用 CLI / 1-Tool MCP）。
2. **點擊智慧熱點標籤**：匯入後搜尋列下方會自動生成 4～6 個雙語熱點標籤（例如 `登入驗證 (auth/login)`、`資料處理 (fetch/api)`），不熟關鍵字也能滑鼠一點立刻完成切片並看到省量結果。
3. **視覺化檢視與微調**：透過中間依賴關聯圖檢視上下游關係、在「精簡前後對照」確認外框折疊品質，或在「省量與趨勢」執行 3 種情境基準測試。
4. **一鍵匯出**：於右側面板複製含提問模板的 Context Slice、下載獨立 `ctxslice.mjs` / `ctxslice-mcp.mjs`，或匯出離線 A4 技術摘要 PDF。

---

### 5. 四大整合模式（1-Tool MCP / CLI / 免裝工具 / 網頁版）

#### 5.1 通用 1-Tool MCP（`ctxslice-mcp`）— 推薦 AI Agent 核心大腦外掛
**OpenCode**、**Pi Agent** 與 **Claude Code** 全部共用同一個單檔零依賴 MCP 伺服器：
1. 直接使用 `npx -y -p @grundy40/contextslice ctxslice-mcp` 註冊，或在網頁版 **`1個工具自動切`** 分頁下載 `ctxslice-mcp.mjs`。
2. 將全域自動調用規則貼進對應指令檔（`~/.claude/CLAUDE.md`、`~/.config/opencode/AGENTS.md` 或 `~/.pi/agent/AGENTS.md`）：
   ```markdown
   When inspecting, debugging, or modifying code in any project folder, ALWAYS call the `get_context_slice` MCP tool first (passing `projectPath` and `query`) BEFORE reading raw files.
   ```
3. 執行面板附帶的一鍵測試指令確認 `get_context_slice` 正常回應即可。

#### 5.2 CLI 命令列腳本（`ctxslice`）
執行 `npx @grundy40/contextslice "<關鍵字>" --root ./project --budget 32768` 或 `node ./tools/ctxslice.mjs "<關鍵字>"`，直接將 XML 切片結果輸出至終端機或 CI 腳本。

#### 5.3 免裝工具模式（`Zero-MCP`）
產生僅約 42 Tokens 的超短全域微規則（`AGENTS.md`）與 Pi Agent `SKILL.md`，讓支援終端機指令的 Agent 直接執行 `ctxslice.mjs`，徹底免除 MCP 協議稅。

#### 5.4 網頁版複製貼上（視覺化輔助工作台）
切換右側 **`複製貼上`** 分頁，挑選提問開頭（`只複製程式碼` / `修 Bug / 改功能` / `幫我解釋邏輯` / `檢查潛在問題`）後一鍵複製貼給 ChatGPT、Claude Web 或 Gemini。

---

### 6. 專案結構與隱私安全

```text
├── README.md                            # 單一雙語整合說明文件（英文 + 繁體中文）
├── index.html                           # 頁面進入點與 SEO Metadata
├── metadata.json                        # 應用中繼資料與功能宣告
├── start.mjs                            # macOS / Linux / Windows 一鍵啟動腳本
├── package.json                         # 單一版號真相來源與 npm 腳本設定
├── LICENSE                              # MIT 開源授權
├── .github/workflows/
│   ├── deploy-pages.yml                 # 推送 main 自動部署 GitHub Pages 線上版
│   └── publish-npm.yml                  # 推送 v* 標籤自動同步版號並發布 npm
├── scripts/
│   └── build-cli.mjs                    # 建置獨立 CLI/MCP 並自動同步 CLI 版號
├── packages/cli/                        # 零依賴 @grundy40/contextslice npm 套件
│   ├── package.json                     # bin 映射設定 (contextslice, ctxslice, ctxslice-mcp)
│   ├── README.md                        # 純英文 npm 套件頁面說明
│   └── bin/                             # 自動產生的單檔 CLI 與 MCP 執行檔（gitignored）
└── src/
    ├── App.tsx                          # 主工作台、偏好記憶、主動補齊與一步匯入接線
    ├── i18n.ts                          # 英／繁中雙語字典、自動偵測與 localStorage 記憶
    ├── version.ts                       # 直接讀取根目錄 package.json 的單一版號常數
    ├── types/context.ts                 # 符號、切片組裝、MCP 與基準測試型別定義
    ├── engine/
    │   ├── astParser.ts                 # 多語言結構解析與依賴圖建構
    │   ├── contextAssembler.ts          # 雙狀態目錄樹、TF-IDF、局部視窗與 XML 組裝
    │   ├── cjkTokenizer.ts              # CJK 2-gram 分詞與 50+ 組雙語同義詞映射
    │   ├── semanticSearch.ts            # 語意模糊搜尋、安全停用詞過濾與分數傳遞
    │   ├── skeletonExpansion.ts         # 高複雜度叢集偵測與自動補齊執行器
    │   ├── localImporter.ts             # 本機檔案掃描與 lockfile / 機密檔過濾
    │   ├── pdfManualExporter.ts         # 離線 A4 技術摘要 PDF 匯出引擎 (jsPDF)
    │   ├── treeSitterBundle.ts          # Base64 內嵌 web-tree-sitter 執行期與 WASM
    │   └── scriptGenerators.ts          # CLI / 免裝工具 / 1-Tool MCP 單檔腳本產生器
    └── components/
        ├── HeaderBar.tsx                # 頂部導覽列、語言切換鈕、專案標籤與重讀
        ├── ToolbarControls.tsx          # 搜尋列、動態智慧熱點標籤與 32K 預算選擇
        ├── SymbolExplorer.tsx           # 左側檔案與函式清單
        ├── DependencyGraphView.tsx      # 一步行動空狀態引導卡片、互動關聯圖與小地圖
        ├── SavingsDashboardView.tsx     # 省量指標、10 次趨勢圖與實戰基準測試
        ├── SkeletonDiffView.tsx         # 精簡前後對照視窗
        ├── UniversalOutputPanel.tsx     # 四端整合匯出、自訂路徑、提問模板與測試指令
        └── ImportModal.tsx              # 資料夾／多檔匯入與長程式碼貼上彈窗
```

> **隱私安全保證**：所有程式解析、依賴建圖、基準測試與上下文封包組裝皆 **100% 在本地瀏覽器或您的電腦完成**，絕不將任何原始碼上傳至外部伺服器。

---

### 7. 在 AI 對話中的推薦提問模板

#### 檢查潛在問題（Code Review）
```text
# ContextSlice 預處理結果
請幫我審查以下結構化精簡程式碼，找出潛在 Bug、邊界條件或回歸風險：

[貼上 ContextSlice 產出的精簡結果]

# 請優先檢視 <focal> 完整實作，並以 <skeleton> 外框作為呼叫介面契約。
```

#### 修 Bug / 改功能
```text
# ContextSlice 關聯程式碼切片
目前 `authService.validateToken()` 發生異常，以下是透過結構切片保留的完整焦點與直接依賴外框：

[貼上 ContextSlice 產出的精簡結果]

請協助指出問題根因並提供最小幅度的修正方案。
```

#### 架構優化與重構
```text
# ContextSlice 架構切片
我想優化使用者登入流程，以下是在 32K 預算內挑出的 `login` 呼叫關聯切片：

[貼上 ContextSlice 產出的精簡結果]

請在不破壞上游呼叫方的情況下，提出最乾淨的重構建議。
```

---

### 8. 版本更新紀錄（Changelog）

#### `v0.4.1`（2026-11-28）
- **核心原始碼優先分配 `<focal>` 與文件／測試權重調降**：調降 `*.md`、`docs/**`、`CHANGELOG*`、`README*` 與測試檔（`tests/**`、`*_test.*`、`*.test.*`、`*.spec.*`、`test_*.*`）評分權重，除非明確查詢否則不允許搶佔 `<focal>` 預算；強制 `<focal>` 直接命中原始碼優先於 `hop="1"` 骨架與文件配置預算，並過濾純語法關鍵字（`class`、`def`、`function` 等），徹底解決 `16K` 預算下核心程式碼被文件與測試擠壓折疊的問題。
- **修復 Markdown 重複輸出 Bug 與文件 Token 上限保護**：修正 `.md` 檔案同時輸出 `<file_header>` 與第 1 行 `<skeleton>` 造成重複兩次的錯誤，並以 ±16 行緊湊視窗與單檔／總體 Token 上限防止 `CHANGELOG.md` 等長文件吞噬大量預算。
- **細化 Python 方法層級提取與類別結構骨架**：於網頁版解析器、CLI 狀態機與 MCP Tree-sitter WASM 同步遞迴提取 `class` 內部方法（`ClassName.methodName`）；命中特定方法時完整展開該目標方法於 `<focal>`，父類別保留屬性摘要並僅折疊未命中之兄弟方法（標記 `# [expanded in <focal symbol="..."> below]`），不再將整個類別壓成單行註解。

#### `v0.4.0`（2026-11-28）
- **雙狀態目錄樹防呆與按需留白原則**：於網頁版、CLI（`ctxslice`）與 1-Tool MCP（`ctxslice-mcp`）同步實作狀態 A（`mode="file_tree_empty_query"`）與狀態 B（`mode="file_tree_zero_matches"`）及明確 `<note>` 提示語；命中時嚴格執行按需留白，絕不硬塞無關檔案。
- **XML 標籤標註總行數與顯示區間**：於 `<file>` 標籤加上 `total_lines` 與 `shown_lines` 屬性，消除大型檔案邊界幻覺。
- **全端統一 `32,768`（32K）預設預算與單一版號真相來源**：網頁版、CLI、MCP 預設 budget 統一為 `32768`；`src/version.ts` 改為直接讀取根目錄 `package.json`，`build-cli.mjs` 自動同步寫入 `packages/cli/package.json`，並同步修正 `.github/workflows/publish-npm.yml`。
- **全格式純文字設定檔搜尋與 ±40 行局部視窗保護**：納入 `.json`、`.yaml`、`.yml`、`.toml`、`.ini`、`.cfg`、`.conf`、`.xml`、`.properties`、`.txt`（支援 `0.4.0` 等版號與鍵名精準命中），略過 lockfile 與 `.env` 機密，且超過 200 行自動以命中行前後各 40 行截取。
- **安全語助詞過濾**：過濾自然語言口語停用詞而不誤傷技術關鍵字。
- **純淨空狀態導引與動態智慧熱點標籤**：移除所有假範例專案，空狀態僅保留一步匯入／貼上卡片；匯入真實專案後自動掃描檔名與函式詞根，於搜尋列下方動態產生 4～6 個雙語可點擊標籤。
- **單一雙語 `README.md` 與術語對齊**：刪除 `README.zh-TW.md`，整合為英文上、繁中下單一文件並附頂部錨點跳轉；同步更新純英文 `packages/cli/README.md`，並將誇大宣傳詞統一降級為「結構解析（structural parsing）」。

#### `v0.3.4`（2026-11-27）
- **頂層常數納入索引與檔案末尾匯出保留**：同步支援 Python、TS/JS、Go、Rust 頂層常數索引及 `<file_footers>` 結尾宣告保留。

#### `v0.3.3`（2026-11-27）
- **檔案頭部保留（`<file_headers>`）**：自動保留切片檔案頂端 `import` 區塊、常數與型別宣告。

#### `v0.3.2`（2026-11-27）
- **GitHub Pages 線上展示部署與 `contextslice` 短指令別名**。

#### `v0.3.1`（2026-11-27）
- **零依賴獨立 npm 套件（`@grundy40/contextslice`）與自動化發布流程**。

#### `v0.3.0`（2026-11-27）
- **英／繁中雙語工作台介面即時切換（`src/i18n.ts`）**。

#### `v0.2.1`（2026-11-27）
- **多語言狀態機提取器、真實呼叫圖（BFS）與內嵌 Tree-sitter WASM（含離線降級）**。

#### `v0.2.0`（2026-11-27）
- **路徑加權、65% 目錄配額上限、TF-IDF 稀缺度權重、`subPath` 沙箱與 `mtime` 快取**。

#### `v0.1.4` – `v0.1.1`（2026-11-21 – 2026-11-23）
- 初始版本釋出：支援 CJK 2-gram 與雙語同義詞檢索、跨平台 `./tools` 路徑設定、全文字檔匯入、互動依賴圖、四大整合模式與離線 PDF 匯出。

---

### 9. 32K 實戰基準測試與預算指南

於三大開源專案（TypeScript **Hono**、Python **HTTPX**、Go **Gin**）進行跨檔呼叫追蹤與改碼基準實測結果如下：

| 上下文模式 | 平均輸入 Tokens | Token 節省幅度 | Hono (TS) | HTTPX (Py) | Gin (Go) | 改碼總通過率 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **完整核心目錄（對照基準）** | ~215,000 | — | ✅ PASS | ✅ PASS | ✅ PASS | **100% (3/3)** |
| **ContextSlice `32K`（預設標準）** | **32,768** | **-85.1%** | ✅ PASS | ✅ PASS | ✅ PASS | **100% (3/3)** 🏆 |
| **ContextSlice `16K`** | 16,384 | -92.4% | ❌ FAIL | ❌ FAIL | ✅ PASS | 33.3% (1/3) |
| **ContextSlice `8K`** | 8,192 | -96.2% | ❌ FAIL | ⚠️ Partial | ✅ PASS | 33.3% (1/3) |

> **實測結論**：在全端預設 **`32,768`（32K）** 預算下，ContextSlice 維持 **100% 改碼通過率**，同時平均省下 **85.1%** 的 Token 成本。

| 專案規模 | 程式碼行數 | 建議 `--budget` 設定 | 預估省下比例 | 適用情境 |
| :--- | :---: | :---: | :---: | :--- |
| **微型工具 / 腳本** | `< 15 KLOC` | `8,192` – `16,384` | ~70% – 85% | 單檔查錯、小型公用函式 |
| **中小型應用** | `15 – 80 KLOC` | `24,576` – `32,768` | ~80% – 88% | 日常 Bug 修復與功能開發 |
| **大型框架專案** | `80 – 300 KLOC` | **`32,768` – `49,152`** | ~85% – 93% | 跨檔呼叫追蹤與模組重構 |
| **企業級 Monorepo** | `> 300 KLOC` | **`49,152` – `65,536`** | ~90% – 96% | 跨模組架構調整（建議上限 `64K`） |

---

### 10. 授權與相關連結

本專案採用 [MIT 開源授權](./LICENSE)。

- **線上免費網頁版（GitHub Pages Live Demo）**：[https://grundy40.github.io/ContextSlice/](https://grundy40.github.io/ContextSlice/)
- **互動式預算試算與完整基準測試報告**：[https://grundy40.github.io/ContextSlice/benchmark.html](https://grundy40.github.io/ContextSlice/benchmark.html)
- **npm 套件主頁（`@grundy40/contextslice`）**：[https://www.npmjs.com/package/@grundy40/contextslice](https://www.npmjs.com/package/@grundy40/contextslice)
- **GitHub 儲存庫**：[https://github.com/grundy40/ContextSlice](https://github.com/grundy40/ContextSlice)
- **Agensi Free Skill**：[https://www.agensi.io/r/GRUNDY40?to=/skills/context-slice](https://www.agensi.io/r/GRUNDY40?to=/skills/context-slice)
