/**
 * Git-based cross-device sync.
 *
 * Memories are exported as JSON per project to a private GitHub repo.
 * No cloud backend. GitHub is the server. Free.
 *
 * Format: memories/<project>.json (one file per project, git-diffable)
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, basename } from "path";
import type { Database } from "bun:sqlite";
import { addMemory, getProjects } from "./db.js";
import { CONFIG_DIR, loadConfig, saveConfig } from "./config.js";

const SYNC_DIR = join(CONFIG_DIR, "sync");

interface SyncMemory {
  id: string;
  project: string;
  content: string;
  source: string;
  created_at: string;
  metadata: string;
}

function git(args: string, cwd: string): string {
  return execSync(`git -C "${cwd}" ${args}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  }).trim();
}

function hasGhCli(): boolean {
  try {
    execSync("gh --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getGhUser(): string | null {
  try {
    return execSync("gh api user --jq .login", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// ── Export memories as JSON files ──────────────────────────────────────────────

function exportMemories(db: Database, outDir: string): number {
  mkdirSync(outDir, { recursive: true });
  const projects = getProjects(db);
  let total = 0;

  for (const project of projects) {
    const rows = db
      .prepare(
        `SELECT id, project, content, source, created_at, metadata
         FROM memories WHERE project = ? ORDER BY created_at ASC`
      )
      .all(project) as SyncMemory[];

    if (rows.length === 0) continue;

    writeFileSync(
      join(outDir, `${project}.json`),
      JSON.stringify(rows, null, 2)
    );
    total += rows.length;
  }

  return total;
}

// ── Import memories from JSON files ───────────────────────────────────────────

function importMemories(db: Database, inDir: string): number {
  if (!existsSync(inDir)) return 0;

  const files = readdirSync(inDir).filter((f) => f.endsWith(".json"));
  let imported = 0;

  for (const file of files) {
    const raw = readFileSync(join(inDir, file), "utf8");
    const rows = JSON.parse(raw) as SyncMemory[];

    for (const row of rows) {
      // Upsert — don't duplicate
      const exists = db
        .prepare(`SELECT 1 FROM memories WHERE id = ?`)
        .get(row.id);
      if (exists) continue;

      db.prepare(
        `INSERT INTO memories (id, project, content, source, created_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(row.id, row.project, row.content, row.source, row.created_at, row.metadata);
      imported++;
    }
  }

  return imported;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export async function syncInit(): Promise<void> {
  if (!hasGhCli()) {
    console.error("  GitHub CLI (gh) is required for sync. Install: https://cli.github.com");
    process.exit(1);
  }

  const user = getGhUser();
  if (!user) {
    console.error("  Not logged into GitHub CLI. Run: gh auth login");
    process.exit(1);
  }

  const repoName = `${user}/continuum-memories`;

  // Check if repo already exists
  try {
    execSync(`gh repo view ${repoName} --json name`, { stdio: "ignore" });
    console.log(`  Repo ${repoName} already exists.`);
  } catch {
    // Create private repo
    console.log(`  Creating private repo: ${repoName}...`);
    execSync(
      `gh repo create ${repoName} --private --description "Continuum memory sync — auto-generated, do not edit manually"`,
      { stdio: ["pipe", "pipe", "ignore"] }
    );
  }

  // Clone to sync dir
  if (existsSync(join(SYNC_DIR, ".git"))) {
    console.log("  Sync directory already initialized.");
  } else {
    mkdirSync(SYNC_DIR, { recursive: true });
    execSync(`gh repo clone ${repoName} "${SYNC_DIR}" -- --depth=1`, {
      stdio: ["pipe", "pipe", "ignore"],
    });
  }

  // Update config
  const config = loadConfig();
  config.sync = { enabled: true, repo: repoName, autoSync: false };
  saveConfig(config);

  console.log(`  Sync initialized: ${repoName} (private)`);
  console.log(`  Run 'continuum sync push' to upload your memories.`);
}

export async function syncPush(db: Database): Promise<void> {
  if (!existsSync(join(SYNC_DIR, ".git"))) {
    console.error("  Sync not initialized. Run: continuum sync init");
    process.exit(1);
  }

  const memoriesDir = join(SYNC_DIR, "memories");
  const count = exportMemories(db, memoriesDir);

  if (count === 0) {
    console.log("  No memories to sync.");
    return;
  }

  try {
    git("add -A", SYNC_DIR);

    // Check if there are changes
    try {
      git("diff --cached --quiet", SYNC_DIR);
      console.log("  Already in sync. No new memories to push.");
      return;
    } catch {
      // Has changes — proceed
    }

    const date = new Date().toISOString().split("T")[0];
    git(`commit -m "sync: ${count} memories — ${date}"`, SYNC_DIR);
    git("push origin main", SYNC_DIR);
    console.log(`  Pushed ${count} memories to GitHub.`);
  } catch (error) {
    console.error("  Push failed:", error);
  }
}

export async function syncPull(db: Database): Promise<void> {
  if (!existsSync(join(SYNC_DIR, ".git"))) {
    console.error("  Sync not initialized. Run: continuum sync init");
    process.exit(1);
  }

  try {
    git("pull origin main", SYNC_DIR);
  } catch {
    console.log("  Nothing to pull.");
  }

  const memoriesDir = join(SYNC_DIR, "memories");
  const imported = importMemories(db, memoriesDir);

  if (imported === 0) {
    console.log("  Already up to date.");
  } else {
    console.log(`  Imported ${imported} new memories from remote.`);
  }
}

export async function syncAuto(db: Database): Promise<void> {
  if (!existsSync(join(SYNC_DIR, ".git"))) return;
  const config = loadConfig();
  if (!config.sync?.autoSync) return;

  try {
    const memoriesDir = join(SYNC_DIR, "memories");
    exportMemories(db, memoriesDir);
    git("add -A", SYNC_DIR);
    try {
      git("diff --cached --quiet", SYNC_DIR);
    } catch {
      const date = new Date().toISOString().split("T")[0];
      git(`commit -m "auto-sync: ${date}"`, SYNC_DIR);
      git("push origin main", SYNC_DIR);
    }
  } catch {
    // Silent fail on auto-sync
  }
}
