#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import type { Database } from "bun:sqlite";
import { join } from "path";
import { randomUUID } from "crypto";
import { loadConfig, saveConfig, HOME, type Config } from "./config.js";
import { openDb, countMemories, addMemory, getProjects, getContext } from "./db.js";
import { startDaemon } from "./daemon.js";
import { createHttpHandler, runStdioMcp } from "./mcp.js";
import { findClaudeBin } from "./claude-bin.js";
import { generateSnapshot } from "./snapshot.js";
import { syncInit, syncPush, syncPull } from "./sync.js";

// ── Colors ────────────────────────────────────────────────────────────────────

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const gray = (s: string) => `\x1b[90m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ── Banner ────────────────────────────────────────────────────────────────────

function printBanner(port: number) {
  console.log(`
  ${bold("◉ Continuum")} ${gray("v0.1.0")}
  ${dim("Universal AI memory — your context, everywhere.")}

  ${cyan("MCP endpoint")}  http://localhost:${port}/mcp
  ${cyan("Health")}        http://localhost:${port}/health

  ${dim("Works with: Claude Code · Cursor · Cline · Windsurf · Continue.dev")}
`);
}

// ── Auto-detect git projects in common directories ────────────────────────────

function detectProjects(): { path: string; name: string }[] {
  const searchPaths = [
    join(HOME, "Desktop", "Projetos"),
    join(HOME, "Desktop", "Projects"),
    join(HOME, "Projects"),
    join(HOME, "projects"),
    join(HOME, "dev"),
    join(HOME, "workspace"),
    process.cwd(),
  ];

  const found: { path: string; name: string }[] = [];
  const seen = new Set<string>();

  for (const searchPath of searchPaths) {
    if (!existsSync(searchPath)) continue;
    try {
      const entries = readdirSync(searchPath, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const fullPath = join(searchPath, e.name);
        if (seen.has(fullPath)) continue;
        if (existsSync(join(fullPath, ".git"))) {
          seen.add(fullPath);
          found.push({ path: fullPath, name: e.name });
        }
      }
    } catch {}
  }

  return found;
}

// ── MCP config writers ────────────────────────────────────────────────────────

function configureClaudeCode(): boolean {
  const configPath = join(HOME, ".claude.json");
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, "utf8")); } catch {}
  }
  const servers = (config["mcpServers"] as Record<string, unknown> | undefined) ?? {};
  servers["continuum"] = { command: "bunx", args: ["continuum", "--mcp-only"] };
  config["mcpServers"] = servers;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  return true;
}

function configureCursor(): boolean {
  const cursorDir = join(HOME, ".cursor");
  if (!existsSync(cursorDir)) return false;
  const configPath = join(cursorDir, "mcp.json");
  let config: Record<string, unknown> = { mcpServers: {} };
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, "utf8")); } catch {}
  }
  const servers = (config["mcpServers"] as Record<string, unknown> | undefined) ?? {};
  servers["continuum"] = { command: "bunx", args: ["continuum", "--mcp-only"] };
  config["mcpServers"] = servers;
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  return true;
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdInit(): Promise<void> {
  console.log(`\n  ${bold("◉ Continuum")} ${gray("— setup\n")}`);

  const config = loadConfig();
  const claudeBin = config.claudeBin ?? findClaudeBin();

  if (!claudeBin) {
    console.error(`  ${red("✗")} Claude CLI not found.\n  Install from: https://claude.ai/download\n`);
    process.exit(1);
  }

  console.log(`  ${green("✓")} Claude CLI: ${gray(claudeBin)}\n`);

  // Detect projects
  const found = detectProjects();
  if (found.length > 0) {
    console.log(`  Found ${found.length} git project(s):\n`);
    for (const p of found) {
      console.log(`    ${cyan("+")} ${gray(p.path)}`);
      if (!config.projects.find((pr) => pr.path === p.path)) {
        config.projects.push(p);
      }
    }
  } else {
    console.log(`  ${yellow("!")} No git projects found in common directories.`);
    console.log(`  Add projects manually to ${gray("~/.continuum/config.json")}\n`);
  }

  config.claudeBin = claudeBin;
  saveConfig(config);
  console.log(`\n  ${green("✓")} Config saved → ${gray("~/.continuum/config.json")}`);

  // Configure MCP for AI tools
  console.log();
  if (configureClaudeCode()) console.log(`  ${green("✓")} Claude Code MCP configured`);
  if (configureCursor()) console.log(`  ${green("✓")} Cursor MCP configured`);

  console.log(`
  ${bold("Done!")} Start the daemon:

    ${cyan("continuum start")}

  ${dim("Every commit you make will be automatically extracted and")}
  ${dim("injected into all your AI tools via MCP.")}
`);
}

async function cmdStart(mcpOnly = false): Promise<void> {
  const config = loadConfig();
  const db = openDb();

  if (mcpOnly) {
    // Stdio transport — spawned by AI tools (Claude Code, Cursor, etc.)
    await runStdioMcp(db);
    return;
  }

  const claudeBin = config.claudeBin ?? findClaudeBin();
  if (!claudeBin) {
    console.error(`  ${red("✗")} Claude CLI not found. Run continuum init first.`);
    process.exit(1);
  }

  printBanner(config.port);

  if (config.projects.length === 0) {
    console.log(`  ${yellow("!")} No projects configured. Run ${cyan("continuum init")} first.\n`);
  }

  // Start git watcher daemon (async, runs in background)
  startDaemon(config, db, claudeBin).catch(console.error);

  // HTTP MCP server
  const handler = createHttpHandler(db);

  Bun.serve({
    port: config.port,
    fetch(req) {
      const { pathname } = new URL(req.url);

      if (pathname === "/mcp") return handler(req);

      if (pathname === "/health") {
        return Response.json({
          ok: true,
          projects: config.projects.length,
          memories: countMemories(db),
          version: "0.1.0",
        });
      }

      if (pathname === "/") {
        return new Response(buildDashboard(config, db), {
          headers: { "Content-Type": "text/html" },
        });
      }

      return Response.json({ error: "not found" }, { status: 404 });
    },
  });

  console.log(`  Daemon running. Commit something to see it work.\n`);
}

function cmdStatus(): void {
  const config = loadConfig();
  const db = openDb();
  const projects = config.projects;
  const total = countMemories(db);

  console.log(`\n  ${bold("◉ Continuum")} ${gray("status")}\n`);
  console.log(`  ${dim("Projects:")} ${projects.length}`);
  console.log(`  ${dim("Memories:")} ${total}`);
  console.log(`  ${dim("Model:")}    ${config.model}`);
  console.log(`  ${dim("Port:")}     ${config.port}\n`);

  for (const p of projects) {
    const n = countMemories(db, p.name);
    console.log(`  ${cyan("◉")} ${p.name} ${gray(`(${n} memories)`)} ${dim(p.path)}`);
  }
  console.log();
}

function cmdAdd(content: string, project: string): void {
  const db = openDb();
  addMemory(db, { id: randomUUID(), project, content, source: "manual" });
  console.log(`  ${green("✓")} Saved to ${project}`);
}

async function cmdSnapshot(projectName?: string): Promise<void> {
  const config = loadConfig();
  const db = openDb();
  const claudeBin = config.claudeBin ?? findClaudeBin();

  if (!claudeBin) {
    console.error(`  ${red("✗")} Claude CLI not found. Run continuum init first.`);
    process.exit(1);
  }

  const targets = projectName
    ? config.projects.filter((p) => p.name === projectName)
    : config.projects;

  if (targets.length === 0) {
    console.error(`  ${red("✗")} Project not found: ${projectName}`);
    process.exit(1);
  }

  for (const project of targets) {
    console.log(`\n  ${cyan("◉")} Synthesizing context for ${bold(project.name)}...`);
    console.log(`  ${dim("Using Claude to synthesize memories into a living document")}\n`);

    const result = await generateSnapshot(project.name, project.path, db, claudeBin, config.model);

    if (!result) {
      console.log(`  ${yellow("!")} No memories yet for ${project.name}. Make some commits first.`);
      continue;
    }

    console.log(`  ${green("✓")} CONTINUUM.md written → ${gray(result.path)}`);
    console.log(`\n${dim("─".repeat(60))}\n`);
    console.log(result.markdown.split("\n").map((l) => `  ${l}`).join("\n"));
    console.log(`\n${dim("─".repeat(60))}`);
    console.log(`\n  ${dim("Claude Code auto-loads this file. Your AI now knows everything.")}\n`);
  }
}

function installClaudeCodeHook(): void {
  // Write a hook that auto-injects context at session start
  const settingsPath = join(HOME, ".claude", "settings.json");
  let settings: Record<string, unknown> = {};

  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, "utf8")); } catch {}
  }

  const hooks = (settings["hooks"] as Record<string, unknown> | undefined) ?? {};
  // SessionStart hook: injects CONTINUUM.md into context by printing it
  // Claude Code reads hook stdout as additional context
  hooks["SessionStart"] = [
    {
      "hooks": [
        {
          "type": "command",
          "command": "continuum inject"
        }
      ]
    }
  ];
  settings["hooks"] = hooks;

  mkdirSync(join(HOME, ".claude"), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// ── Minimal dashboard HTML ────────────────────────────────────────────────────

function buildDashboard(config: Config, db: Database): string {
  const projects = getProjects(db);
  const rows = projects
    .map((p) => {
      const mems = getContext(db, p, 5);
      return `<details open><summary>${p} (${countMemories(db, p)} memories)</summary><ul>${mems.map((m) => `<li>${m.replace(/</g, "&lt;")}</li>`).join("")}</ul></details>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Continuum</title>
  <style>
    body { font-family: system-ui, monospace; background: #0f0f0f; color: #e5e5e5; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { color: #fff; } summary { cursor: pointer; color: #0ff; padding: 8px 0; }
    li { font-size: 13px; color: #aaa; margin: 4px 0; }
    details { border: 1px solid #222; border-radius: 8px; padding: 12px; margin: 12px 0; }
    .meta { color: #555; font-size: 12px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h1>◉ Continuum</h1>
  <p class="meta">MCP: <code>http://localhost:${config.port}/mcp</code> · ${projects.length} projects · ${countMemories(db)} memories</p>
  ${rows || "<p style='color:#555'>No memories yet. Make a git commit to start.</p>"}
</body>
</html>`;
}

// ── CLI routing ───────────────────────────────────────────────────────────────

const [, , cmd, ...rest] = process.argv;

if (cmd === "--mcp-only" || rest.includes("--mcp-only")) {
  cmdStart(true);
} else if (cmd === "init") {
  cmdInit();
} else if (cmd === "start" || !cmd) {
  cmdStart();
} else if (cmd === "status") {
  cmdStatus();
} else if (cmd === "add" && rest.length >= 2) {
  const [project, ...parts] = rest;
  cmdAdd(parts.join(" "), project);
} else if (cmd === "snapshot") {
  cmdSnapshot(rest[0]);
} else if (cmd === "sync") {
  const sub = rest[0];
  const db = openDb();
  if (sub === "init") {
    syncInit();
  } else if (sub === "push") {
    syncPush(db);
  } else if (sub === "pull") {
    syncPull(db);
  } else {
    console.log(`  Usage: continuum sync <init|push|pull>`);
  }
} else if (cmd === "--help" || cmd === "-h") {
  console.log(`
  ${bold("continuum")} — Universal AI memory daemon

  ${cyan("Commands:")}
    continuum init                    Detect projects + configure Claude Code & Cursor
    continuum start                   Start daemon + MCP server (port 3100)
    continuum status                  Show tracked projects and memory counts
    continuum snapshot [project]      Generate CONTINUUM.md — project consciousness
    continuum add <project> <text>    Manually save a memory
    continuum sync init               Setup GitHub sync (private repo)
    continuum sync push               Push memories to GitHub
    continuum sync pull               Pull memories from GitHub
    continuum --mcp-only              Stdio MCP (used by AI tools internally)

  ${cyan("MCP tools (available in any AI tool):")}
    get_context [project]       Load context — call at session start
    search_context <query>      Semantic search through memories
    add_memory <content>        Save a decision or insight
    list_projects               List tracked projects

  ${dim("After init, every git commit is automatically extracted and")}
  ${dim("injected into all your AI tools via MCP. Zero config.")}
`);
} else {
  console.error(`  Unknown command: ${cmd}. Run continuum --help`);
  process.exit(1);
}
