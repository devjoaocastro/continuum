<h1 align="center">◉ Continuum</h1>
<p align="center"><strong>Your development memory. For life.</strong></p>

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
Every commit you make is captured, understood, and kept.<br/>
Forever. Locally. Privately. Across every AI tool you use.
</p>

<br/>

---

<br/>

## The problem

You open a project you haven't touched in 6 months. Your AI assistant asks:

> *"What framework is this? What's the auth strategy? Why is there a serial queue here?"*

You spent **3 days** figuring out that serial queue. You remember the pain, but not the solution.

**It's gone.** Lost in a commit message that says `fix: streaming deadlock`.

<br/>

## What Continuum does

```
  $ git commit -m "fix: replace Docker with E2B microVMs"

  ◉ myproject — 1 new commit(s)
  09:41:22  a1b2c3d  fix: replace Docker with E2B microVMs  ...✓ 3 memories

    [decision] Replaced Docker containers with E2B Firecracker microVMs —
               Docker cold start was 4-6s blocking UX, E2B boots in 400ms.
               10x improvement. Trade-off: E2B is a paid service but the
               UX gain justifies it for this use case.

    [pattern]  Sandbox execution pattern: create sandbox → execute code →
               read output → destroy. Always set timeout (30s default).
               Never reuse sandboxes across requests.

    [commit]   Migrated code execution from Docker to E2B Firecracker
               microVMs for faster sandbox boot times.
```

That's it. You commit. Continuum extracts **why**, not just what. Using the Claude CLI you already have.

<br/>

## After a few weeks

```bash
continuum snapshot myproject
```

Generates a living `CONTINUUM.md` — your project's entire brain:

```markdown
# myproject — Living Context

## Architecture
- Hono on Cloudflare Workers (not Express — needs edge-compatible runtime)
- D1 SQLite for persistence (no RETURNING clause — pattern: INSERT then SELECT)
- E2B Firecracker microVMs for code execution (replaced Docker, 10x faster boot)

## Hard-won knowledge
- Bun ReadableStream requires sync spawn in start() — async causes deadlock
  (spent 3 hours debugging this, the fix is non-obvious)
- D1 writes serialize through primary region — always batch writes
- Worker bundle limit is 10MB — audit deps before adding anything

## Patterns that work here
- Serial queue for Claude CLI spawns (concurrent = race conditions)
- AES-256-GCM for OAuth tokens (PBKDF2 100K iterations)
- Zod validation at every API boundary, no exceptions
```

Open this project in 2 years. **Everything is still there.**

Your AI tools load this automatically. They know *everything* about your project from day one.

<br/>

---

<br/>

## Works with everything

Continuum uses MCP — the universal protocol. One memory, every tool.

| Tool | Setup |
|------|-------|
| **Claude Code** | Automatic on `init` |
| **Cursor** | Automatic on `init` |
| **Cline / RooCline** | 2 lines of JSON |
| **Continue.dev** | 2 lines of JSON |
| **Windsurf** | 2 lines of JSON |
| **Claude Desktop** | 2 lines of JSON |
| **Zed** | 2 lines of JSON |
| **Any MCP client** | 2 lines of JSON |

<details>
<summary><strong>Manual MCP setup</strong> (for tools not auto-configured)</summary>

Add to your tool's MCP config:

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
┌─────────────────────────────────────────────┐
│  Continuum daemon (watching .git via FSEvents)  │
├─────────────────────────────────────────────┤
│                                             │
│  1. Read diff (secrets auto-redacted)       │
│  2. Claude CLI extracts decisions/patterns  │
│  3. Store in local SQLite                   │
│  4. Expose via MCP to all AI tools          │
│                                             │
└─────────────────────────────────────────────┘
    │
    ▼
Claude Code, Cursor, Cline, Windsurf...
all have your full project context instantly
```

<br/>

## What you're NOT paying for

| | |
|---|---|
| **Cloud backend** | None. `~/.continuum/` on your machine. |
| **API keys** | None. Uses `claude -p` from your existing subscription. |
| **New subscriptions** | None. Zero cost beyond what you already have. |
| **Data leaving your machine** | Never. Unless you opt into git sync. |

<br/>

---

<br/>

## Quick start

**Requires:** [Bun](https://bun.sh) + [Claude Code CLI](https://claude.ai/download)

```bash
# Detects your git projects, configures Claude Code & Cursor
bunx continuum init

# Starts the daemon — watches commits in real-time
bunx continuum start

# That's it. Make commits normally. Continuum does the rest.
```

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

---

<br/>

## Cross-device sync

Your memories travel between machines. No cloud service — just a private GitHub repo.

```bash
continuum sync init    # Creates private repo: <you>/continuum-memories
continuum sync push    # Export & push
continuum sync pull    # Pull & import on another machine
```

Enable auto-sync to push after every extraction:

```json
{
  "sync": { "enabled": true, "autoSync": true }
}
```

Memories are stored as git-diffable JSON — you get full version history of your memory evolution for free.

**Requires:** [GitHub CLI](https://cli.github.com) (`gh`) installed and authenticated.

<br/>

---

<br/>

## Security

| Threat | Protection |
|--------|------------|
| Secrets in diffs | 20+ regex patterns auto-redact API keys, tokens, passwords before extraction |
| Sensitive files | `.env`, `.pem`, `.key`, `*secret*`, `*token*` — never read |
| Data exfiltration | Everything stays in `~/.continuum/`. No network calls except MCP + optional sync |
| Supply chain | Zero runtime dependencies. Pure Bun + SQLite |
| Extraction privacy | Uses `claude -p` locally — your subscription, your machine |

<br/>

---

<br/>

## Configuration

`~/.continuum/config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `projects` | `[]` | Git repos to watch (auto-detected on `init`) |
| `port` | `3100` | MCP server port |
| `model` | `claude-haiku-4-5-20251001` | Model for extraction |
| `ignore` | `.env, *.pem, *.key...` | File patterns to skip |
| `sync.enabled` | `false` | Enable GitHub sync |
| `sync.autoSync` | `false` | Auto-push after extraction |

<br/>

---

<br/>

## The bigger picture

This isn't just an AI context tool.

It's a **permanent, searchable record of your entire career as a developer.**

Every project. Every hard decision. Every pattern that worked. Every bug that took 3 days to find.

In 5 years, you'll have a memory of everything you built. Not a portfolio — a *memory*. The reasoning, the tradeoffs, the moments that shaped how you think about software.

That's what Continuum is actually building.

<br/>

---

<br/>

## Roadmap

- [ ] **[sqlite-vec](https://github.com/asg017/sqlite-vec)** — semantic vector search
- [ ] **Knowledge graph** — entity relationships across projects
- [ ] **More backends** — Gemini CLI, Ollama, local models (no subscription needed)
- [ ] **Team sync** — shared context across team members
- [ ] **Menu bar app** — native macOS/Windows UI
- [ ] **VS Code extension** — inline memory annotations
- [ ] **Auto-tagging** — ML-powered categorization
- [ ] **Memory decay** — smart forgetting of irrelevant details

<br/>

## Contributing

PRs welcome. The core is ~800 lines of TypeScript. Read it in an afternoon.

```bash
git clone https://github.com/devjoaocastro/continuum
cd continuum
bun install
bun dev
```

<br/>

---

<p align="center">
<strong>MIT License</strong> · Built by <a href="https://github.com/devjoaocastro">@devjoaocastro</a>
</p>
<p align="center">
<em>The kind of tool you wish had existed 5 years ago.</em>
</p>
