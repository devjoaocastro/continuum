import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { join } from "path";
import { CONFIG_DIR } from "./config.js";

let _db: Database | null = null;

export function openDb(): Database {
  if (_db) return _db;
  mkdirSync(CONFIG_DIR, { recursive: true });
  const db = new Database(join(CONFIG_DIR, "memories.db"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_project ON memories(project);
    CREATE INDEX IF NOT EXISTS idx_created ON memories(project, created_at DESC);
  `);
  _db = db;
  return db;
}

export function addMemory(
  db: Database,
  memory: { id: string; project: string; content: string; source: string; metadata?: Record<string, unknown> }
): void {
  db.prepare(
    `INSERT OR REPLACE INTO memories (id, project, content, source, metadata)
     VALUES (?, ?, ?, ?, ?)`
  ).run(memory.id, memory.project, memory.content, memory.source, JSON.stringify(memory.metadata ?? {}));
}

export function getContext(db: Database, project: string, limit = 20): string[] {
  return (
    db.prepare(
      `SELECT content FROM memories WHERE project = ? ORDER BY created_at DESC LIMIT ?`
    ).all(project, limit) as { content: string }[]
  ).map((r) => r.content);
}

export function searchMemories(db: Database, query: string, project?: string): string[] {
  const pattern = `%${query}%`;
  if (project) {
    return (
      db.prepare(
        `SELECT content FROM memories WHERE project = ? AND content LIKE ? ORDER BY created_at DESC LIMIT 10`
      ).all(project, pattern) as { content: string }[]
    ).map((r) => r.content);
  }
  return (
    db.prepare(
      `SELECT content FROM memories WHERE content LIKE ? ORDER BY created_at DESC LIMIT 10`
    ).all(pattern) as { content: string }[]
  ).map((r) => r.content);
}

export function getProjects(db: Database): string[] {
  return (
    db.prepare(`SELECT DISTINCT project FROM memories ORDER BY project`).all() as { project: string }[]
  ).map((r) => r.project);
}

export function getMostRecentProject(db: Database): string | null {
  const row = db.prepare(
    `SELECT project FROM memories ORDER BY created_at DESC LIMIT 1`
  ).get() as { project: string } | null;
  return row?.project ?? null;
}

export function getAllMemories(db: Database, limit = 500): string[] {
  return (
    db.prepare(`SELECT content FROM memories ORDER BY created_at DESC LIMIT ?`).all(limit) as { content: string }[]
  ).map((r) => r.content);
}

export function countMemories(db: Database, project?: string): number {
  if (project) {
    return (db.prepare(`SELECT COUNT(*) as n FROM memories WHERE project = ?`).get(project) as { n: number }).n;
  }
  return (db.prepare(`SELECT COUNT(*) as n FROM memories`).get() as { n: number }).n;
}
