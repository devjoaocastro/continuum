import { watch, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { Database } from "bun:sqlite";
import { isGitRepo, getCurrentHash, getNewCommits } from "./git.js";
import { extractFromCommit } from "./extractor.js";
import { addMemory } from "./db.js";
import { getStateDir } from "./config.js";
import type { Config, ProjectConfig } from "./config.js";
import { syncAuto } from "./sync.js";
import { processEvolution, runMaintenance } from "./intelligence.js";
import type { FullMemory } from "./db.js";

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

function getLastHash(project: string): string | undefined {
  const path = join(getStateDir(), `${project}.json`);
  if (!existsSync(path)) return undefined;
  try {
    return (JSON.parse(readFileSync(path, "utf8")) as { lastHash?: string }).lastHash;
  } catch {
    return undefined;
  }
}

function setLastHash(project: string, hash: string): void {
  writeFileSync(join(getStateDir(), `${project}.json`), JSON.stringify({ lastHash: hash }));
}

async function processProject(
  project: ProjectConfig,
  db: Database,
  config: Config,
  claudeBin: string
): Promise<void> {
  if (!isGitRepo(project.path)) return;

  const currentHash = getCurrentHash(project.path);
  if (!currentHash) return;

  const lastHash = getLastHash(project.name);
  if (lastHash === currentHash) return;

  const commits = getNewCommits(project.path, lastHash);
  if (commits.length === 0) {
    setLastHash(project.name, currentHash);
    return;
  }

  console.log(`\n  ${c.cyan("◉")} ${c.cyan(project.name)} — ${commits.length} new commit(s)`);

  for (const commit of [...commits].reverse()) {
    const t = new Date().toLocaleTimeString("en", { hour12: false });
    process.stdout.write(
      `  ${c.gray(t)}  ${c.dim(commit.hash.slice(0, 7))} ${c.gray(commit.message.slice(0, 55))} ...`
    );

    const extracted = extractFromCommit(commit, claudeBin, config.model);

    if (!extracted) {
      process.stdout.write(` ${c.gray("skip")}\n`);
      continue;
    }

    const items = [
      ...extracted.decisions.map((d) => `[decision] ${d}`),
      ...extracted.patterns.map((p) => `[pattern] ${p}`),
      extracted.summary ? `[commit] ${extracted.summary}` : "",
    ].filter(Boolean);

    const savedIds: string[] = [];
    for (const content of items) {
      const memId = randomUUID();
      savedIds.push(memId);

      // Store with tags and sentiment
      db.prepare(
        `INSERT OR REPLACE INTO memories (id, project, content, source, metadata, tags, sentiment)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        memId,
        project.name,
        content,
        "git_commit",
        JSON.stringify({ hash: commit.hash, message: commit.message }),
        JSON.stringify(extracted.tags),
        extracted.sentiment,
      );
    }

    // Run evolution detection on each new memory
    for (const memId of savedIds) {
      const row = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(memId) as FullMemory | null;
      if (row) processEvolution(db, row);
    }

    process.stdout.write(` ${c.green("✓")} ${items.length} memories\n`);
  }

  setLastHash(project.name, currentHash);

  // Auto-sync after extraction
  syncAuto(db).catch(() => {});
}

export async function startDaemon(config: Config, db: Database, claudeBin: string): Promise<void> {
  console.log(`\n  ${c.dim("Watching")} ${config.projects.length} project(s)...\n`);

  // Initial scan of all projects
  for (const project of config.projects) {
    await processProject(project, db, config, claudeBin);
  }

  // Watch .git/COMMIT_EDITMSG for each project — fires on every commit
  for (const project of config.projects) {
    const commitMsgPath = join(project.path, ".git", "COMMIT_EDITMSG");
    if (!existsSync(commitMsgPath)) {
      console.log(`  ${c.yellow("!")} ${project.name}: not a git repo yet, skipping watch`);
      continue;
    }

    watch(commitMsgPath, () => {
      processProject(project, db, config, claudeBin).catch(console.error);
    });

    console.log(`  ${c.green("✓")} ${c.dim("watching")} ${project.name}`);
  }

  // Periodic rescan every 5 min (catches manual git pulls, etc.)
  setInterval(async () => {
    for (const project of config.projects) {
      await processProject(project, db, config, claudeBin);
    }
  }, 5 * 60 * 1000);

  // Memory maintenance every hour (temporal decay)
  setInterval(() => {
    const { decayed } = runMaintenance(db);
    if (decayed > 0) {
      console.log(`  ${c.dim("⟳")} ${c.gray(`Memory maintenance: ${decayed} memories decayed`)}`);
    }
  }, 60 * 60 * 1000);
}
