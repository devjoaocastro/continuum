# Installation

## Requirements

- [Bun](https://bun.sh) v1.0+ (runtime)
- [Claude Code CLI](https://claude.ai/download) (extraction engine — uses your existing subscription)

## Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

## Install Claude Code CLI

Download from [claude.ai/download](https://claude.ai/download) and follow the setup.

Verify it's working:

```bash
claude --version
```

## Run Continuum

No installation needed — run directly with `bunx`:

```bash
bunx continuum init     # Detect projects, configure AI tools
bunx continuum start    # Start daemon
```

## Build from source

```bash
git clone https://github.com/devjoaocastro/continuum
cd continuum
bun install
bun dev                 # Development mode (auto-reload)
bun run build           # Compile to native binary
```

## Data location

All data lives in `~/.continuum/`:

```
~/.continuum/
├── config.json          # Configuration
├── memories.db          # SQLite database
├── state/               # Per-project commit tracking
├── snapshots/           # Generated CONTINUUM.md backups
└── sync/                # Git sync repo (if enabled)
```
