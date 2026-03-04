<h1 align="center">◉ Continuum</h1>

<p align="center">
<strong>Git remembers what you changed.<br/>Continuum remembers why.</strong>
</p>

<p align="center">
  <a href="https://github.com/devjoaocastro/continuum/blob/main/LICENSE"><img src="https://img.shields.io/badge/MIT-111111?style=flat-square&label=license&labelColor=00ffaa&color=111111" alt="License"/></a>
  <img src="https://img.shields.io/badge/Bun-111111?style=flat-square&label=runtime&labelColor=00ffaa&color=111111" alt="Bun"/>
  <img src="https://img.shields.io/badge/MCP-111111?style=flat-square&label=protocol&labelColor=00ffaa&color=111111" alt="MCP"/>
  <img src="https://img.shields.io/badge/SQLite-111111?style=flat-square&label=storage&labelColor=00ffaa&color=111111" alt="SQLite"/>
  <img src="https://img.shields.io/badge/none-111111?style=flat-square&label=cloud&labelColor=00ffaa&color=111111" alt="No cloud"/>
</p>

<br/>

<p align="center">
<code>bunx continuum init && bunx continuum start</code>
</p>

<p align="center">
Every commit becomes knowledge. Decisions, patterns, hard-won insights —<br/>
extracted automatically, stored locally, available in every AI tool you use.
</p>

<br/>

---

<br/>

## The problem

Your commit says `fix: queue deadlock`. But the real context was:

> *Spent 3 hours debugging a Bun ReadableStream deadlock. Async spawn causes freeze. Must spawn synchronously in start(). The fix is non-obvious.*

**That knowledge is gone.** Lost in a diff nobody will read again.

Open a project in 6 months. Your AI asks *"why is there a serial queue here?"* — and neither of you remembers.

**Continuum fixes this.**

<br/>

## What happens when you commit

```
  $ git commit -m "fix: replace Docker with E2B microVMs"

  ◉ myproject — 1 new commit(s)
  09:41:22  a1b2c3d  fix: replace Docker with E2B microVMs  ...✓ 3 memories

    [decision] Replaced Docker containers with E2B Firecracker microVMs —
               Docker cold start was 4-6s blocking UX, E2B boots in 400ms.
               10x improvement. Trade-off: E2B is a paid service.

    [pattern]  Sandbox execution: create → execute → read → destroy.
               Always set timeout (30s). Never reuse across requests.

    tags: docker, e2b, sandbox, performance
    sentiment: positive (improvement)
```

Every commit becomes structured knowledge. **Why**, not just what.

<br/>

## Your project's brain

After a few weeks, run `continuum snapshot`:

```markdown
# myproject — Living Context

## Architecture
- Hono on Cloudflare Workers (not Express — needs edge-compatible runtime)
- D1 SQLite (no RETURNING clause — pattern: INSERT then SELECT)
- E2B Firecracker microVMs (replaced Docker, 10x faster boot)

## Hard-won knowledge
- Bun ReadableStream requires sync spawn in start() — async causes deadlock
  (spent 3h debugging, the fix is non-obvious)
- D1 writes serialize through primary region — always batch
- Worker bundle limit 10MB — audit deps before adding anything

## Patterns that work here
- Serial queue for Claude CLI spawns (concurrent = race conditions)
- AES-256-GCM for OAuth tokens (PBKDF2 100K iterations)
- Zod validation at every API boundary, no exceptions
```

Open this project in 2 years. **Your AI already knows everything.**

<br/>

---

<br/>

## Intelligence — not just storage

Continuum doesn't just record. **It learns.**

### Temporal awareness
Memories decay over time. A decision from yesterday matters more than one from 6 months ago. But if the same pattern appears in 5 different commits — it gets **reinforced**. Proven knowledge rises. Noise fades.

### Evolution tracking
You switched from Docker to E2B? Continuum doesn't keep two separate facts. It knows Docker was **superseded** by E2B. Your context stays clean, not cluttered with outdated decisions.

### Cross-project knowledge
Working on auth in project B? Continuum knows you solved a Safari ITP cookie issue in project A. It surfaces that knowledge automatically — even though you forgot about it.

### Developer DNA
Your aggregate profile across all projects. Technologies you've mastered, patterns you always follow, your decision-making style. A living portrait of how you build software.

```
$ continuum search "rate limiting"

Found in 3 projects:
  ◉ api-gateway    [pattern] Token bucket with Redis Lua scripts — atomic operations
  ◉ chat-service   [decision] Rate limit at edge, not app layer — 10x fewer requests hit origin
  ◉ webhook-proxy  [gotcha] Stripe webhook retries bypass rate limits — whitelist by signature
```

**Your entire development career, searchable.**

<br/>

---

<br/>

## Works with everything

MCP is the USB-C of AI tools. One protocol, every tool.

| Tool | Setup |
|------|-------|
| **Claude Code** | Automatic on `init` |
| **Cursor** | Automatic on `init` |
| **Cline / RooCline** | 2 lines of JSON |
| **Continue.dev** | 2 lines of JSON |
| **Windsurf** | 2 lines of JSON |
| **Claude Desktop** | 2 lines of JSON |
| **Zed** | 2 lines of JSON |

<details>
<summary><strong>Manual MCP setup</strong></summary>

```json
{
  "mcpServers": {
    "continuum": {
      "command": "bunx",
      "args": ["continuum", "--mcp-only"]
    }
  }
}
```

Claude Code: `~/.claude.json` · Cursor: `~/.cursor/mcp.json` · Others: check their docs.

</details>

<br/>

---

<br/>

## How it works

```
git commit
    │
    ▼
┌──────────────────────────────────────────────────┐
│  Continuum daemon (FSEvents, real-time)          │
├──────────────────────────────────────────────────┤
│                                                  │
│  1. Read diff (secrets auto-redacted)            │
│  2. Claude CLI extracts decisions + patterns     │
│  3. Tag with technologies and sentiment          │
│  4. Detect evolution (reinforced / superseded)   │
│  5. Store in local SQLite with importance score  │
│  6. Expose via MCP to all AI tools               │
│                                                  │
└──────────────────────────────────────────────────┘
    │
    ▼
Every AI tool you use knows your project history
```

<br/>

## What you're NOT paying for

| | |
|---|---|
| **Cloud** | None. `~/.continuum/` on your machine. |
| **API keys** | None. Uses `claude -p` from your existing CLI. |
| **Subscriptions** | None. Zero cost beyond what you already have. |
| **Data leaving your machine** | Never. Unless you opt into git sync. |

<br/>

---

<br/>

## Quick start

**Requires:** [Bun](https://bun.sh) + [Claude Code CLI](https://claude.ai/download)

```bash
bunx continuum init      # Detect projects, configure AI tools
bunx continuum start     # Start daemon — watches commits in real-time
```

That's it. Make commits normally. Continuum does the rest.

<br/>

## Commands

```bash
continuum init                      # Setup — detect projects, configure AI tools
continuum start                     # Start daemon + MCP server (port 3100)
continuum status                    # Show projects and memory count
continuum snapshot [project]        # Generate CONTINUUM.md — your project's brain
continuum add <project> <text>      # Manually save a decision or insight
continuum sync init                 # Setup cross-device sync (private GitHub repo)
continuum sync push                 # Push memories to GitHub
continuum sync pull                 # Pull memories from another machine
```

<br/>

## MCP tools (available in any AI tool)

| Tool | Description |
|------|-------------|
| `get_context` | Load project memories — call at session start |
| `search_context` | Search through all memories with TF-IDF ranking |
| `add_memory` | Save a decision or insight for future sessions |
| `list_projects` | List tracked projects with memory counts |
| `cross_project_insights` | Get relevant knowledge from other projects |
| `developer_dna` | Your developer profile — tech stack, patterns, style |
| `memory_timeline` | Chronological knowledge evolution |

<br/>

---

<br/>

## Cross-device sync

Memories travel between machines via a private GitHub repo. No cloud.

```bash
continuum sync init    # Creates private repo: <you>/continuum-memories
continuum sync push    # Export & push
continuum sync pull    # Pull on another machine
```

Auto-sync: set `"autoSync": true` in `~/.continuum/config.json`.

<br/>

## Security

| Threat | Protection |
|--------|------------|
| Secrets in diffs | 20+ patterns auto-redact API keys, tokens, passwords |
| Sensitive files | `.env`, `.pem`, `.key`, `*secret*` — never read |
| Data exfiltration | Everything stays in `~/.continuum/`. No network calls. |
| Supply chain | Zero runtime dependencies. Pure Bun + SQLite. |

<br/>

## Configuration

`~/.continuum/config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `projects` | `[]` | Git repos to watch |
| `port` | `3100` | MCP server port |
| `model` | `claude-haiku-4-5-20251001` | Model for extraction |
| `ignore` | `.env, *.pem...` | Patterns to skip |
| `sync.autoSync` | `false` | Auto-push after extraction |

<br/>

---

<br/>

## The bigger picture

This isn't just a context tool.

It's a **permanent, searchable record of your entire development career.**

Every project. Every hard decision. Every pattern that worked. Every bug that took 3 days to find. Knowledge that evolves, gets reinforced, supersedes itself — just like your thinking does.

In 5 years, you'll have a memory of everything you built. Not a portfolio. A *memory*.

<br/>

## Roadmap

- [ ] **[sqlite-vec](https://github.com/asg017/sqlite-vec)** — semantic vector search
- [ ] **Knowledge graph** — entity relationships across projects
- [ ] **Career stats** — "you solved 73 race conditions, 41 auth systems"
- [ ] **More backends** — Gemini CLI, Ollama, local models
- [ ] **Team sync** — shared knowledge across team members
- [ ] **Menu bar app** — native macOS/Windows UI
- [ ] **VS Code extension** — inline memory annotations

<br/>

## Contributing

The core is ~1,800 lines of TypeScript. Read it in an afternoon.

```bash
git clone https://github.com/devjoaocastro/continuum
cd continuum && bun install && bun dev
```

<br/>

---

<p align="center">
<strong>MIT License</strong> · Built by <a href="https://github.com/devjoaocastro">@devjoaocastro</a>
</p>
<p align="center">
<em>The missing memory layer for software development.</em>
</p>
