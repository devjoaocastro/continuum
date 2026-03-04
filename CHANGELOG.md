# Changelog

All notable changes to Continuum will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-03-04

### Added
- Core daemon: watches git commits via FSEvents, extracts context via Claude CLI
- Intelligence engine: temporal decay, evolution tracking, reinforcement, cross-project knowledge
- 7 MCP tools: get_context, search_context, add_memory, list_projects, cross_project_insights, developer_dna, memory_timeline
- CLI commands: init, start, status, snapshot, search, dna, add, sync
- TF-IDF search with stopwords (EN + PT)
- CONTINUUM.md snapshot generation
- Git-based cross-device sync (private GitHub repo)
- Secret redaction: 20+ patterns for API keys, tokens, passwords
- Auto-configuration for Claude Code and Cursor MCP
- Enriched extraction: tags, sentiment, importance scoring
- DB migration support for schema evolution
- HTML dashboard at localhost:3100

### Security
- Diffs sanitized before extraction (file patterns + line patterns)
- Sensitive files never read (.env, .pem, .key, etc.)
- Zero network calls except MCP and optional sync
