# @grundy40/contextslice

> **Zero-dependency multi-language AST code slicer & 1-Tool MCP server for AI coding agents.**

`ContextSlice` builds a lightweight local call graph of your repository, keeps **focal target functions complete**, folds direct `1-hop` / `2-hop` neighbors into **signature-only skeletons**, and drops unrelated noise — cutting token costs dramatically with **zero runtime dependencies**.

- **Zero runtime `dependencies`**: Uses only Node.js built-ins + an embedded `web-tree-sitter` WASM runtime with lazy grammar caching (`~/.contextslice/parsers/`) and automatic offline state-machine fallback.
- **Multi-language AST & Call Graph**: Supports TypeScript/JavaScript, Python, Go, Rust, Java, Kotlin, C#, C/C++, Swift, PHP, Ruby, SQL, and generic text files.
- **Smart Relevance & Quotas**: TF-IDF keyword scarcity weighting, directory quota cap (65%), CJK 2-gram + bilingual matching, and `<omitted_top_matches>` recovery hints.

---

## Quick Usage via `npx`

### 1. Run CLI Slicer Directly

Slice the current repository in one command without installing anything permanently:

```bash
npx @grundy40/contextslice "login token validation" --budget 32768
```

Slice a specific repository path:

```bash
npx @grundy40/contextslice "checkout discount" --root ./my-project --budget 16384
```

Check version or CLI options:

```bash
npx @grundy40/contextslice --version
npx @grundy40/contextslice --help
```

Or install globally (`npm install -g @grundy40/contextslice`) if you prefer short commands (`contextslice`, `ctxslice`, and `ctxslice-mcp`):

```bash
npm install -g @grundy40/contextslice
contextslice "retry queue" --budget 32768
```

Prefer a visual browser UI? Try the **Live Demo** at [https://grundy40.github.io/ContextSlice/](https://grundy40.github.io/ContextSlice/).

---

## Connect 1-Tool MCP to AI Coding Agents

`@grundy40/contextslice` exposes two MCP tools inside a single ultra-lean stdio server (`ctxslice-mcp`):
1. `get_context_slice` — Primary code-reading tool (Tree-sitter WASM / state-machine AST + True Call Graph + TF-IDF).
2. `expand_skeleton_cluster` — On-demand symbol expander for `<omitted_top_matches>` or folded skeleton hubs.

### Claude Code (`npx` Zero-Setup)

```bash
claude mcp add --scope user context-slice -- npx -y -p @grundy40/contextslice ctxslice-mcp
```

Or if installed globally (`npm i -g @grundy40/contextslice`):

```bash
claude mcp add --scope user context-slice -- ctxslice-mcp
```

Add to `~/.claude/CLAUDE.md` so Claude always slices first before reading raw files:

```markdown
When inspecting, debugging, or modifying code in any project folder, ALWAYS call the `get_context_slice` MCP tool first (passing `projectPath` and `query`) BEFORE reading raw files.
```

### Claude Desktop / Cursor / Windsurf (`mcpServers` JSON)

```json
{
  "mcpServers": {
    "context-slice": {
      "command": "npx",
      "args": ["-y", "-p", "@grundy40/contextslice", "ctxslice-mcp"]
    }
  }
}
```

### OpenCode (`~/.config/opencode/opencode.json`)

```json
{
  "mcp": {
    "context-slice": {
      "type": "local",
      "command": ["npx", "-y", "-p", "@grundy40/contextslice", "ctxslice-mcp"]
    }
  }
}
```

---

## Environment Variables

- `CTXSLICE_DISABLE_WASM_FETCH=1`: Skip downloading `.wasm` language parsers and run purely on the built-in zero-network state-machine AST parser.

---

## License

[MIT](https://github.com/grundy40/ContextSlice/blob/main/LICENSE)
