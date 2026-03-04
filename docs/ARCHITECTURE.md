# Architecture

Continuum is ~1,800 lines of TypeScript. Zero runtime dependencies. Bun-native.

## Pipeline

```
git commit
    │
    ▼
daemon.ts ── watches .git/COMMIT_EDITMSG (FSEvents)
    │
    ▼
git.ts ── reads new commits + diffs
    │
    ▼
extractor.ts ── sanitizes diff → Claude CLI extracts context
    │
    ▼
intelligence.ts ── evolution detection, reinforcement, decay
    │
    ▼
db.ts ── stores in SQLite (~/.continuum/memories.db)
    │
    ▼
mcp.ts ── exposes via MCP (stdio + HTTP)
    │
    ▼
AI tools (Claude Code, Cursor, Cline, etc.)
```

## Modules

### `index.ts` — CLI + server
- Command routing (init, start, search, dna, snapshot, sync)
- HTTP server (Bun.serve) with MCP endpoint, health check, dashboard
- Auto-configures Claude Code and Cursor MCP on `init`

### `daemon.ts` — Git watcher
- Watches `.git/COMMIT_EDITMSG` via `fs.watch` (FSEvents on macOS)
- Fallback: 5-minute polling for `git pull` scenarios
- Tracks last-seen hash per project in `~/.continuum/state/`
- Runs intelligence engine after extraction
- Hourly memory maintenance (temporal decay)

### `extractor.ts` — Context extraction
- Sanitizes diffs: 20+ secret patterns redacted (API keys, tokens, .env files)
- Skips trivial commits (bump, chore, format, merge)
- Calls Claude CLI (`claude -p --model <model>`) with structured prompt
- Extracts: decisions, patterns, summary, tags, sentiment
- 45s timeout, 1MB buffer

### `intelligence.ts` — The brain
- **Evolution detection**: Jaccard similarity between memories
  - > 0.5 similarity → reinforcement (boost importance)
  - Contradiction signals + > 0.3 similarity → supersession
- **Temporal decay**: Unreinforced memories lose importance after 30 days
- **Cross-project**: Finds relevant memories from other projects via shared tags
- **Developer DNA**: Aggregate stats, tech stack, decision style, proven patterns

### `db.ts` — SQLite storage
- Single table: `memories` with evolution columns
- Columns: id, project, content, source, created_at, metadata, importance, reinforced_count, last_reinforced, tags, superseded_by, sentiment
- Auto-migration for existing databases (ALTER TABLE)
- Indexes: project, created_at, importance, tags

### `mcp.ts` — MCP server
- Protocol: JSON-RPC 2.0, version 2025-03-26
- 7 tools: get_context, search_context, add_memory, list_projects, cross_project_insights, developer_dna, memory_timeline
- Dual transport: stdio (spawned by AI tools) + HTTP (localhost:3100/mcp)

### `search.ts` — TF-IDF ranking
- Pure TypeScript, zero deps
- Tokenizes with stopwords (EN + PT)
- IDF weighting + exact phrase boost (1.5x)

### `snapshot.ts` — CONTINUUM.md generation
- Sends top 80 memories to Claude CLI
- Generates structured markdown: architecture, conventions, decisions, gotchas, active context
- Writes to project root + `~/.continuum/snapshots/`
- Auto-triggers every 10 new memories

### `sync.ts` — Cross-device sync
- Uses GitHub CLI (`gh`) to create private repo
- Exports memories as JSON per project (git-diffable)
- Bidirectional: push/pull with dedup on import
- Optional auto-sync after extraction

### `config.ts` — Configuration
- `~/.continuum/config.json`
- Defaults: port 3100, model claude-haiku-4-5-20251001
- Ignore patterns for secrets

### `claude-bin.ts` — CLI discovery
- Finds `claude` binary (which, known paths, nvm paths)
- Auth check via `claude --version`

## Design decisions

- **Zero dependencies**: Only Bun built-ins. No npm packages at runtime.
- **SQLite over Postgres**: Local-first, zero setup, portable.
- **Claude CLI over API**: Uses existing subscription, no API keys needed.
- **FSEvents over polling**: Instant commit detection on macOS.
- **TF-IDF over embeddings**: Works offline, zero cost. sqlite-vec planned for semantic search.
- **MCP over custom protocol**: Universal compatibility with AI tools.
- **JSON sync over cloud**: Git as the sync backend. Free, private, auditable.
