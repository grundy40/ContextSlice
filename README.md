# ContextSlice Studio (`v0.3.3`)

> **Targeted AST Code Slicing & Token Optimization Workbench for AI Coding**  
> Before sending source code to an LLM, ContextSlice pinpoints the functions you are editing and traces their upstream/downstream call graph — keeping focal implementations intact while folding neighboring dependencies into compact signature skeletons to slash token usage and eliminate context bloat.

🌐 **Language / 語言**: **English** · [繁體中文](./README.zh-TW.md)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-emerald?style=flat)](https://grundy40.github.io/ContextSlice/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-ContextSlice-blue?style=flat)](https://github.com/grundy40/ContextSlice)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Agensi Free Skill](https://img.shields.io/badge/Agensi-Free%20Skill-success)](https://www.agensi.io/skills/context-slice)

---

## Table of Contents

1. [Why ContextSlice?](#1-why-contextslice)
2. [Supported Languages & Core Capabilities](#2-supported-languages--core-capabilities)
3. [Local Setup & Launch](#3-local-setup--launch)
4. [30-Second Quick Start](#4-30-second-quick-start)
5. [Four Integration Modes (Web UI / CLI / Zero-Install / 1-Tool MCP)](#5-four-integration-modes-web-ui--cli--zero-install--1-tool-mcp)
   - [Universal 1-Tool MCP for OpenCode / Pi Agent / Claude Code](#51-universal-1-tool-mcp-for-opencode--pi-agent--claude-code)
   - [Web UI Copy & Paste (with Prompt Templates)](#52-web-ui-copy--paste-with-prompt-templates)
6. [Project Structure & Privacy](#6-project-structure--privacy)
7. [How to Prompt in AI Chats](#7-how-to-prompt-in-ai-chats)
8. [Changelog](#8-changelog)
9. [License & Links](#9-license--links)

---

## 1. Why ContextSlice?

Developers working with AI coding assistants constantly hit three costly bottlenecks:

1. **Token explosion from pasting too many files**: Fixing a single feature often touches multiple modules; dumping full files wastes budget and distracts the model with irrelevant noise.
2. **Monolithic files exceeding context limits**: Multi-thousand-line files cannot be solved by file-name filtering alone.
3. **Bloated MCP tool schemas ("Protocol Tax")**: Attaching 20+ file-reading and grep tools injects thousands of schema tokens into every single conversation turn before any real work happens.

**How ContextSlice Studio solves this**:  
ContextSlice builds a dependency call graph locally in your browser or terminal, preserves **full implementations only for focal targets**, folds direct `1-hop` / `2-hop` neighbors into **signature-only skeletons**, and drops unrelated symbols. When a folded cluster has high structural complexity, **Proactive Discovery** automatically invokes `expand_skeleton_cluster` within remaining budget so the AI never misses critical logic.

---

## 2. Supported Languages & Core Capabilities

- **Broad Language & File Coverage**: Import any text-based source file while automatically filtering binaries, archives, images, lockfiles, and minified assets. Deep AST extractors support **TypeScript / JavaScript, Python, Go, C / C++, Swift, PHP, HTML / Vue / Svelte, CSS / SCSS, Rust, Java / Kotlin, C#, Ruby, and SQL**; additional languages (`Lua`, `Scala`, `Dart`, `Zig`, `Elixir`, `Shell`, `Makefile`, configs, etc.) are sliced cleanly by a generic structural parser with whole-module fallback.
- **Zero-Install Hybrid CLI & 1-Tool MCP Engine (`ctxslice.mjs` & `ctxslice-mcp.mjs`)**:
  - **Embedded Tree-sitter WASM + Lazy Cache + Graceful Fallback**: Embeds Base64 `web-tree-sitter@0.22.6` and lazily caches per-language `.wasm` grammars under `~/.contextslice/parsers/` on first use; seamlessly falls back to the built-in state-machine parser when offline or when `CTXSLICE_DISABLE_WASM_FETCH=1`.
  - **State-Machine Brace Matcher & True Call Graph**: Masks `//...`, `/*...*/`, `#...`, and string literals before counting braces, then builds a project-wide `SymbolMap` with word-boundary call matching and BFS `1-hop` / `2-hop` traversal.
  - **Path Disambiguation, Directory Quota Cap & TF-IDF Weighting**: Prevents cross-module collisions (e.g., `frontend/utils/auth.ts` vs `backend/utils/auth.ts`), caps any single directory at 65% of budget, down-weights noisy generic tokens, and appends `<omitted_top_matches>` hints when high-scoring symbols are budget-capped.
  - **Security & Performance**: `subPath` traversal sandbox, automatic filtering of `.env` / `.pem` / `.key` secrets, in-memory `mtime` caching, CJK 2-gram + bilingual synonym matching, and zero-dependency subword BPE token estimation.
- **Flexible Token Budgets**: Instant switching across `1K`, `4K`, `8K`, `16K`, `32K` (default), `64K`, `128K`, `256K`, and `1M`.
- **Interactive Dependency Graph**: Zoom, pan, panoramic minimap, semantic fuzzy search, and tiered inspection (*Callers / Focal Targets / Callees*).
- **Proactive Discovery**: Automatically detects complex folded hubs and expands them via `expand_skeleton_cluster` within remaining token budget, surfaced clearly in the header bar.
- **Token Savings Dashboard & Live Benchmark**:
  - Built-in Recharts sparkline tracking token consumption across your last 10 operations (persisted across reloads).
  - One-click **Multi-Task Live Benchmark** measuring compression ratio and execution latency (`ms`) directly on your loaded workspace.
- **Bilingual UI (`en` / `zh-TW`) & Persistent Preferences**: Automatically detects `navigator.language`, persists selection in `localStorage`, and provides an instant `EN / 繁中` header switcher that localizes UI views, prompt templates, engine explanations, and offline A4 PDF exports. Also remembers your budget, hop depth, tool directory, and supports one-click local folder rescanning.

---

## 3. Local Setup & Launch

### Requirements
- **Node.js**: `v20.0.0` or higher recommended (exported standalone scripts `ctxslice.mjs` and `ctxslice-mcp.mjs` rely strictly on Node.js built-ins — **zero `npm install` required**).

### One-Command Launch (macOS / Linux / Windows)

After cloning or downloading the project, run this single command inside the project folder (automatically installs missing dependencies, starts the dev server, and opens your browser):

```bash
node start.mjs
```

Or via npm: `npm run launch`

### Manual Commands

```bash
# 1. Install dependencies
npm install

# 2. Start development server (default http://localhost:3000)
npm run dev

# 3. Run TypeScript type check
npm run lint

# 4. Build production bundle (outputs to dist/)
npm run build
```

---

## 4. 30-Second Quick Start

> 🚀 **Try the Free Live Web Demo (No Setup Needed):** [https://grundy40.github.io/ContextSlice/](https://grundy40.github.io/ContextSlice/)

1. **Need orientation?** Click **Quick Start Guide** on the top-left for a two-step overview of the explorer, call graph, and output panel.
2. **Import your codebase**: Click **Import Folder / Files** in the top-right to load a local project directory, select multiple files, or paste a long snippet.
   - Browser imports enforce a **200-file limit** per batch (and skip binaries or files > 1.5 MB) with clear summary banners; for full-repository scans of any size, use the exported CLI script or 1-Tool MCP server.
3. **Describe your task & choose constraints**: Enter keywords (e.g., `login`, `order`, `retry`), pick `1-Hop` or `2-Hop` dependency depth, and select your target token budget.
4. **Export anywhere**: From the right-hand panel, copy a ready-to-paste AI prompt packet, download `ctxslice.mjs` / `ctxslice-mcp.mjs`, or generate an offline A4 PDF brief.

---

## 5. Four Integration Modes (Web UI / CLI / Zero-Install / 1-Tool MCP)

The right-hand output panel includes a configurable **Local Tool Directory** field (defaults to `./tools`, with one-click presets for `~/.contextslice/tools` and `/opt/tools`). Updating this path syncs all generated JSON configs and CLI commands in real time.

### 5.1 Zero-Setup `npx` CLI & MCP (`@grundy40/contextslice`)

Run ContextSlice anywhere directly from npm with **zero runtime dependencies**:

```bash
# Slice the current repository via CLI
npx @grundy40/contextslice "login token validation" --budget 32768

# Register the 1-Tool MCP server in Claude Code
claude mcp add --scope user context-slice -- npx -y -p @grundy40/contextslice ctxslice-mcp
```

Or install globally (`npm install -g @grundy40/contextslice`) to invoke `contextslice`, `ctxslice`, and `ctxslice-mcp` directly.

### 5.2 Universal 1-Tool MCP for OpenCode / Pi Agent / Claude Code

All three agent environments share the same single-file, zero-dependency server `ctxslice-mcp.mjs`:

1. Open the **`1-Tool MCP`** tab in the right-hand panel, set your preferred tool folder, and click **Download Server Script** to save `ctxslice-mcp.mjs` (or use `npx -y -p @grundy40/contextslice ctxslice-mcp` as shown above).
2. Copy the provided **Global Agent Rule** into your agent's instruction file:
   - **OpenCode**: `~/.config/opencode/AGENTS.md`
   - **Pi Agent**: `~/.pi/agent/AGENTS.md`
   - **Claude Code**: `~/.claude/CLAUDE.md`
3. Copy the matching registration snippet (`OpenCode JSON`, `Pi JSON`, or `claude mcp add` command).
4. Run the provided **One-Click Verify Command** in your terminal (`--version` / `tools/list` JSON-RPC handshake) to confirm the MCP server responds properly.

### 5.3 CLI & Zero-Install Modes

- **CLI Mode (`ctxslice.mjs` / `npx @grundy40/contextslice`)**: Run a standalone local script (`node ctxslice.mjs "your query" --budget 32768`) to slice any repository from your terminal or CI pipeline without running the browser UI.
- **Zero-Install Mode (Zero-MCP)**: Generates an ultra-lean micro-rule (`AGENTS.md`) and `SKILL.md` so agent runners can invoke `ctxslice.mjs` via bash with near-zero schema overhead.

### 5.4 Web UI Copy & Paste (with Prompt Templates)

1. Open the **`Web Copy`** tab on the right and choose a prompt template (`Code Only` / `Bug Fix / Feature` / `Explain Logic` / `Audit Issues`).
2. Click **Copy Prompt for AI** and paste directly into ChatGPT, Claude Web, or Gemini.

---

## 6. Project Structure & Privacy

```text
├── README.md                            # Main English documentation
├── README.zh-TW.md                      # Traditional Chinese documentation
├── index.html                           # HTML entry point & SEO metadata
├── start.mjs                            # Cross-platform one-click launcher
├── package.json                         # Dependencies & npm scripts (incl. build:cli)
├── LICENSE                              # MIT License
├── .github/workflows/
│   ├── deploy-pages.yml                 # Automated GitHub Pages Live Demo deploy on main
│   └── publish-npm.yml                  # Automated npm publish on v* Git tags
├── scripts/
│   └── build-cli.mjs                    # Extracts standalone CLI & MCP executables
├── packages/cli/                        # Zero-dependency @grundy40/contextslice npm package
│   ├── package.json                     # bin mappings (contextslice, ctxslice, ctxslice-mcp)
│   ├── README.md                        # npm package & npx / Claude Code guide
│   └── bin/                             # Generated single-file CLI & MCP binaries (gitignored)
└── src/
    ├── App.tsx                          # Main workbench, preferences, proactive discovery & layout
    ├── i18n.ts                          # Bilingual en / zh-TW dictionary, auto-detect & persistence
    ├── version.ts                       # Single-source APP_VERSION constant
    ├── types/context.ts                 # AST, assembly, MCP & benchmark TypeScript types
    ├── engine/
    │   ├── astParser.ts                 # Multi-language AST slicing & call graph builder
    │   ├── contextAssembler.ts          # TF-IDF scoring, quota cap, tier allocation & XML packet
    │   ├── cjkTokenizer.ts              # CJK 2-gram tokenizer & 50+ bilingual synonym pairs
    │   ├── semanticSearch.ts            # Semantic symbol search & structural score propagation
    │   ├── skeletonExpansion.ts         # Complexity cluster detector & expand_skeleton_cluster
    │   ├── localImporter.ts             # Local folder scanner & skip telemetry (200-file limit)
    │   ├── pdfManualExporter.ts         # Offline A4 technical brief PDF generator (jsPDF)
    │   ├── treeSitterBundle.ts          # Base64-embedded web-tree-sitter runtime & core WASM
    │   └── scriptGenerators.ts          # Generators for CLI, Zero-MCP & 1-Tool MCP scripts
    └── components/
        ├── HeaderBar.tsx                # Navigation tabs, EN/繁中 switcher, proactive status & rescan
        ├── ToolbarControls.tsx          # Workspace badge, search bar, hop depth & token budget
        ├── SymbolExplorer.tsx           # Left-hand file & symbol explorer
        ├── DependencyGraphView.tsx      # Interactive SVG dependency graph & minimap
        ├── SavingsDashboardView.tsx     # Token savings metrics, 10-turn chart & live benchmark
        ├── SkeletonDiffView.tsx         # Side-by-side raw vs. skeleton diff inspector
        ├── UniversalOutputPanel.tsx     # 4 integration modes, prompt builder & verify commands
        └── ImportModal.tsx              # Folder/multi-file importer & long-snippet paste modal
```

> **Privacy Guarantee**: All code parsing, dependency graphing, benchmarking, and context packet assembly run **100% locally in your browser's memory**. Your source code is never uploaded to any external server.

---

## 7. How to Prompt in AI Chats

When using ChatGPT, Claude Web, or Gemini with Web Copy outputs, try these structured prompts:

### Code Review
```text
# ContextSlice Pre-processed Result

Please review the following code slice for potential bugs, edge cases, or regressions:
[Paste ContextSlice output here]

# Focus on the FULL implementations first and use SKELETON blocks as interface contracts.
```

### Bug Fix
```text
# ContextSlice Relevant Code Slice

I'm hitting a bug inside `authService.validateToken()`.
Below is the sliced context (focal implementation preserved in full, direct dependencies folded into skeletons):
[Paste ContextSlice output here]

Please identify why token validation fails and propose a minimal fix.
```

### Feature / Refactor
```text
# ContextSlice Architectural Slice

I want to optimize the user login flow. Below is the `login` call slice selected within budget:
[Paste ContextSlice output here]

Please recommend the cleanest refactoring approach without breaking upstream callers.
```

---

## 8. Changelog

### `v0.3.3` (2026-11-27)

- **File Header & Top-Level Constants Preservation**: Added structural file header extraction (`extractFileHeader`, `<file_headers>`) across both the browser engine (`src/engine/contextAssembler.ts`) and standalone CLI / 1-Tool MCP scripts (`src/engine/scriptGenerators.ts`). Whenever any file is sliced into the output, top-level `import` blocks, module constants (e.g., `LANG_STORAGE_KEY`), and type/interface declarations are automatically preserved (up to ~50 lines, stopping cleanly before the first function, class, or >60-line object literal such as `zhTW`/`en`), fixing recall gaps when only partial functions or objects are selected.

### `v0.3.2` (2026-11-27)

- **Automated GitHub Pages Live Demo**: Configured subpath `base` resolution in `vite.config.ts` (`'/ContextSlice/'` on `GITHUB_ACTIONS`) and added `.github/workflows/deploy-pages.yml` to automatically deploy `dist/` to `https://grundy40.github.io/ContextSlice/` on every push to `main`.
- **Short CLI Alias (`contextslice`) & Version Bump**: Added `"contextslice": "./bin/ctxslice.mjs"` alongside `ctxslice` and `ctxslice-mcp` in `packages/cli/package.json`, bumped project & CLI versions to `0.3.2`, and added Live Demo badges and links across `README.md` and `README.zh-TW.md`.

### `v0.3.1` (2026-11-27)

- **Standalone Zero-Dependency npm Package (`@grundy40/contextslice`)**: Added `packages/cli/` with zero runtime `dependencies` and `bin` entries for `ctxslice` and `ctxslice-mcp`, enabling direct zero-install `npx @grundy40/contextslice` and Claude Code `npx -y -p @grundy40/contextslice ctxslice-mcp` usage.
- **Automated CLI Build Pipeline (`scripts/build-cli.mjs`)**: Added `npm run build:cli` to bundle and extract DOM-free `src/engine/scriptGenerators.ts` outputs into executable `packages/cli/bin/ctxslice.mjs` and `packages/cli/bin/ctxslice-mcp.mjs` binaries (`chmod 755`, `--help` & `--version` flags), with generated artifacts added to `.gitignore`.
- **Automated GitHub Actions Publishing (`.github/workflows/publish-npm.yml`)**: Automatically syncs tag version, verifies TypeScript + Vite + CLI/MCP builds, and publishes `@grundy40/contextslice` with `npm publish --access public` whenever a `v*` tag is pushed.

### `v0.3.0` (2026-11-27)

- **Internationalized Documentation & Bilingual Navigation**: Converted the main `README.md` into a global English edition while backing up the Traditional Chinese guide to `README.zh-TW.md` with bi-directional language navigation links; updated `index.html` and `metadata.json` titles and meta descriptions to English.
- **Bilingual `en` / `zh-TW` UI Switcher**: Added centralized `src/i18n.ts` dictionary with `navigator.language` auto-detection, `localStorage` persistence (`contextslice_lang_v1`), and an instant `EN / 繁中` toggle in `HeaderBar.tsx` covering `App.tsx`, all workspace views, prompt templates, semantic/assembly explanations, and offline A4 PDF exports without altering core AST or script generation behavior.
- **Version Bump to `v0.3.0`**: Updated `src/version.ts` (`APP_VERSION`) and `package.json` so the UI badge, PDF brief, `ctxslice.mjs`, and `ctxslice-mcp.mjs` (`--version` / `serverInfo.version`) stay synchronized.

### `v0.2.1` (2026-11-27)

- **Multi-Language CLI & MCP AST Extractors**: Added dedicated Go, Rust, Java, Kotlin, C#, and C/C++ declaration matchers in `scriptGenerators.ts`.
- **State-Machine `findBraceEnd`**: Added line-preserving masking (`maskCommentsAndStrings`) for `//`, `/*...*/`, `#`, and string literals so braces inside strings/comments never corrupt block boundaries.
- **True Call Graph (BFS 1-hop & 2-hop)**: Replaced naive substring matching with a workspace `SymbolMap` and word-boundary call regex (`\bfuncName\s*\(`) traversed via BFS.
- **Embedded WASM Tree-sitter + Lazy Cache + Offline Fallback**: Added `src/engine/treeSitterBundle.ts` (`web-tree-sitter@0.22.6` Base64 runtime + core WASM), auto-caching per-language `.wasm` files to `~/.contextslice/parsers/` with seamless fallback to the state-machine parser offline or when `CTXSLICE_DISABLE_WASM_FETCH=1`.
- **Unified Versioning & Dependency Fix**: Connected `scriptGenerators.ts` to `src/version.ts` (`--version` / `-v` flags), preserved the `200`-file browser import limit across UI and docs, and bumped `esbuild` to `^0.28.0` to resolve `npm install` peer conflicts with `vite@^8.3.0`.

### `v0.2.0` (2026-11-27)

- **Path Disambiguation & Directory Quota Cap**: Weights folder path segments during scoring and caps any single directory at 65% of token budget.
- **Omitted Top Matches Hint**: Appends `<omitted_top_matches>` listing top-3 budget-capped symbols so agents can fetch them on demand via `expand_skeleton_cluster`.
- **TF-IDF Keyword Scarcity Weighting**: Down-weights noisy generic terms (`data`, `id`, `error`) using document frequency across the workspace.
- **In-Memory `mtime` Cache, `subPath` Sandbox & Secret Filtering**: Skips unchanged files by `mtimeMs`, prevents directory traversal, and filters `.env` / `.pem` / `.key`.
- **Zero-Dependency Subword BPE Estimator & 32K Default Budget**: Improved token count accuracy and increased default budget to `32K`.

### `v0.1.4` (2026-11-23)

- **CJK Keyword Matching**: Added CJK 2-gram tokenization and 50+ bilingual CJK-English synonym mappings across UI and generated CLI / MCP scripts.

### `v0.1.3` (2026-11-22)

- **Cross-Platform Default Tool Path**: Changed default tool folder to `./tools` and added `~/.contextslice/tools` preset.

### `v0.1.2` (2026-11-22)

- **Universal Text Code Ingestion & Generic Slicer**: Enabled importing arbitrary text source files (including `Makefile`, `Dockerfile`, configs) with binary/minified filtering and generic structural slicing.

### `v0.1.1` (2026-11-21)

- Initial release: multi-language AST slicing, interactive dependency graph, 4 integration modes, token savings dashboard with live benchmarks, and offline PDF manual export.

---

## 9. License & Links

Released under the [MIT License](./LICENSE).

- **Live Web Demo (GitHub Pages)**: [https://grundy40.github.io/ContextSlice/](https://grundy40.github.io/ContextSlice/)
- **GitHub Repository**: [https://github.com/grundy40/ContextSlice](https://github.com/grundy40/ContextSlice)
- **Agensi Free Skill**: [https://www.agensi.io/r/GRUNDY40?to=/skills/context-slice](https://www.agensi.io/r/GRUNDY40?to=/skills/context-slice)
