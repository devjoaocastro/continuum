# MCP Setup Guide

Continuum exposes your project memory via MCP (Model Context Protocol). Any AI tool that supports MCP can access your memories.

## Auto-configured (on `continuum init`)

### Claude Code

Config: `~/.claude.json`

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

### Cursor

Config: `~/.cursor/mcp.json`

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

## Manual setup

For any tool that supports MCP, add the same JSON block above to its config file.

### Cline / RooCline

Settings > MCP Servers > Add:

```json
{
  "continuum": {
    "command": "bunx",
    "args": ["continuum", "--mcp-only"]
  }
}
```

### Continue.dev

`~/.continue/config.json`:

```json
{
  "mcpServers": [
    {
      "name": "continuum",
      "command": "bunx",
      "args": ["continuum", "--mcp-only"]
    }
  ]
}
```

### Windsurf

Settings > MCP > Add server with command `bunx continuum --mcp-only`.

### Zed

Settings > Extensions > MCP:

```json
{
  "continuum": {
    "command": "bunx",
    "args": ["continuum", "--mcp-only"]
  }
}
```

## Available tools (7)

| Tool | Description |
|------|-------------|
| `get_context` | Load project memories at session start |
| `search_context` | Search with TF-IDF ranking |
| `add_memory` | Save a decision or insight |
| `list_projects` | List tracked projects |
| `cross_project_insights` | Knowledge from other projects |
| `developer_dna` | Your developer profile |
| `memory_timeline` | Chronological knowledge evolution |

## Transport modes

- **Stdio** (default): Used when AI tools spawn `bunx continuum --mcp-only`. JSON-RPC over stdin/stdout.
- **HTTP**: Available when running `continuum start` at `http://localhost:3100/mcp`. JSON-RPC over POST.
