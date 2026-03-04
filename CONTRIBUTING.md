# Contributing to Continuum

The core is ~1,800 lines of TypeScript. You can read it all in an afternoon.

## Setup

```bash
git clone https://github.com/devjoaocastro/continuum
cd continuum
bun install
bun dev   # Starts with --watch (auto-reload)
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full module breakdown.

## Making changes

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Test locally: `bun src/index.ts --help`, `bun src/index.ts status`
5. Commit with conventional format: `feat: add X`, `fix: Y`, `docs: Z`
6. Open a PR

## What's welcome

- Bug fixes
- New extraction backends (Gemini CLI, Ollama, local models)
- Better search (sqlite-vec integration)
- Platform support (Windows `fs.watch` fixes)
- Documentation improvements
- MCP tool ideas

## What's out of scope

- Cloud backends or SaaS features
- Heavy dependencies (keep it zero-dep at runtime)
- Breaking changes to the CLI interface
