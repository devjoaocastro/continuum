import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { join } from "path";
import { CONFIG_DIR } from "./config.js";

let _db: Database | null = null;

export function openDb(): Database {
  if (_db) return _db;
  mkdirSync(CONFIG_DIR, { recursive: true });
  const db = new Database(join(CONFIG_DIR, "memories.db"));
  // Create base table
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

  // Migrate: add evolution columns if missing
  const cols = db.prepare(`PRAGMA table_info(memories)`).all() as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));

  const migrations: [string, string][] = [
    ["importance", "ALTER TABLE memories ADD COLUMN importance REAL NOT NULL DEFAULT 50.0"],
    ["reinforced_count", "ALTER TABLE memories ADD COLUMN reinforced_count INTEGER NOT NULL DEFAULT 0"],
    ["last_reinforced", "ALTER TABLE memories ADD COLUMN last_reinforced TEXT"],
    ["tags", "ALTER TABLE memories ADD COLUMN tags TEXT DEFAULT '[]'"],
    ["superseded_by", "ALTER TABLE memories ADD COLUMN superseded_by TEXT"],
    ["sentiment", "ALTER TABLE memories ADD COLUMN sentiment TEXT DEFAULT 'neutral'"],
  ];

  for (const [col, sql] of migrations) {
    if (!colNames.has(col)) {
      db.exec(sql);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_importance ON memories(project, importance DESC);
    CREATE INDEX IF NOT EXISTS idx_tags ON memories(tags);
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

// ── Evolution queries ──────────────────────────────────────────────────────────

export interface FullMemory {
  id: string;
  project: string;
  content: string;
  source: string;
  created_at: string;
  metadata: string;
  importance: number;
  reinforced_count: number;
  last_reinforced: string | null;
  tags: string;
  superseded_by: string | null;
  sentiment: string;
}

export function getFullMemories(db: Database, project?: string, limit = 200): FullMemory[] {
  if (project) {
    return db.prepare(
      `SELECT * FROM memories WHERE project = ? AND superseded_by IS NULL
       ORDER BY importance DESC, created_at DESC LIMIT ?`
    ).all(project, limit) as FullMemory[];
  }
  return db.prepare(
    `SELECT * FROM memories WHERE superseded_by IS NULL
     ORDER BY importance DESC, created_at DESC LIMIT ?`
  ).all(limit) as FullMemory[];
}

export function reinforceMemory(db: Database, id: string, boost = 10): void {
  db.prepare(
    `UPDATE memories SET
       reinforced_count = reinforced_count + 1,
       last_reinforced = datetime('now'),
       importance = MIN(100, importance + ?)
     WHERE id = ?`
  ).run(boost, id);
}

export function supersedeMemory(db: Database, oldId: string, newId: string): void {
  db.prepare(`UPDATE memories SET superseded_by = ? WHERE id = ?`).run(newId, oldId);
}

export function decayMemories(db: Database): number {
  const result = db.prepare(
    `UPDATE memories SET importance = MAX(5, importance - 2)
     WHERE superseded_by IS NULL
       AND importance > 5
       AND last_reinforced IS NULL
       AND created_at < datetime('now', '-30 days')`
  ).run();
  return result.changes;
}

export function getMemoriesByTag(db: Database, tag: string, limit = 20): FullMemory[] {
  return db.prepare(
    `SELECT * FROM memories
     WHERE tags LIKE ? AND superseded_by IS NULL
     ORDER BY importance DESC LIMIT ?`
  ).all(`%"${tag}"%`, limit) as FullMemory[];
}

export function getCrossProjectMemories(db: Database, tags: string[], excludeProject: string, limit = 10): FullMemory[] {
  const conditions = tags.map(() => `tags LIKE ?`).join(" OR ");
  if (!conditions) return [];
  const params = [...tags.map((t) => `%"${t}"%`), excludeProject, limit];
  return db.prepare(
    `SELECT * FROM memories
     WHERE (${conditions}) AND project != ? AND superseded_by IS NULL
     ORDER BY importance DESC LIMIT ?`
  ).all(...params) as FullMemory[];
}
