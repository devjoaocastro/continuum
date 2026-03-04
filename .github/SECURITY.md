# Security Policy

## Reporting vulnerabilities

If you discover a security issue, please email **dev@joaocastro.com** instead of opening a public issue.

## How Continuum handles security

- **Diffs are sanitized** before sending to Claude CLI for extraction. 20+ regex patterns redact API keys, tokens, passwords, and secrets.
- **Sensitive files are skipped**: `.env`, `.pem`, `.key`, `.p12`, `*secret*`, `*password*`, `*token*`, `credentials.*`, `id_rsa`, etc.
- **All data stays local** at `~/.continuum/`. No network calls except MCP responses and optional git sync.
- **Zero runtime dependencies** — no supply chain risk from npm packages.
- **Git sync** (optional) uses a private GitHub repo. Memories are exported as JSON files.

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
