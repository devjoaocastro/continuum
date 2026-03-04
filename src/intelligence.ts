/**
 * Intelligence Engine — the brain of Continuum.
 *
 * Not a passive recorder. A living system that:
 * - Tracks how decisions evolve over time
 * - Detects contradictions and reversed decisions
 * - Transfers knowledge across projects
 * - Builds a developer DNA profile
 * - Decays stale memories, reinforces proven ones
 */

import type { Database } from "bun:sqlite";
import {
  type FullMemory,
  getFullMemories,
  reinforceMemory,
  supersedeMemory,
  decayMemories,
  getProjects,
  countMemories,
  getCrossProjectMemories,
} from "./db.js";
import { rankByRelevance } from "./search.js";

// ── Similarity detection ────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ── Evolution detection ──────────────────────────────────────────────────────────

const CONTRADICTION_SIGNALS = [
  /replaced?\s+\w+\s+with/i,
  /switched?\s+(from|to)/i,
  /moved?\s+(from|to|away)/i,
  /migrated?\s+(from|to)/i,
  /reverted?\s+/i,
  /removed?\s+/i,
  /dropped?\s+/i,
  /no longer\s+/i,
  /instead of/i,
  /over\s+(express|docker|mongo|mysql|redux|webpack)/i,
];

interface Evolution {
  oldMemory: FullMemory;
  newMemory: FullMemory;
  type: "superseded" | "reinforced" | "contradicted";
}

export function detectEvolution(
  newMemory: FullMemory,
  existing: FullMemory[]
): Evolution | null {
  const newTokens = tokenize(newMemory.content);
  const isContradiction = CONTRADICTION_SIGNALS.some((p) =>
    p.test(newMemory.content)
  );

  let bestMatch: FullMemory | null = null;
  let bestScore = 0;

  for (const mem of existing) {
    if (mem.id === newMemory.id) continue;
    const similarity = jaccardSimilarity(newTokens, tokenize(mem.content));
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = mem;
    }
  }

  if (!bestMatch || bestScore < 0.25) return null;

  // High similarity + contradiction signal = superseded
  if (isContradiction && bestScore > 0.3) {
    return { oldMemory: bestMatch, newMemory, type: "superseded" };
  }

  // High similarity without contradiction = reinforcement
  if (bestScore > 0.5) {
    return { oldMemory: bestMatch, newMemory, type: "reinforced" };
  }

  // Moderate similarity with contradiction words = contradicted
  if (isContradiction) {
    return { oldMemory: bestMatch, newMemory, type: "contradicted" };
  }

  return null;
}

// ── Process evolution after extraction ───────────────────────────────────────────

export function processEvolution(db: Database, newMemory: FullMemory): void {
  const existing = getFullMemories(db, newMemory.project, 100);
  const evolution = detectEvolution(newMemory, existing);

  if (!evolution) return;

  if (evolution.type === "reinforced") {
    reinforceMemory(db, evolution.oldMemory.id, 8);
  } else if (evolution.type === "superseded") {
    supersedeMemory(db, evolution.oldMemory.id, newMemory.id);
    // New memory inherits importance from the old one + bonus
    db.prepare(`UPDATE memories SET importance = MIN(100, ? + 15) WHERE id = ?`)
      .run(evolution.oldMemory.importance, newMemory.id);
  }
}

// ── Cross-project intelligence ──────────────────────────────────────────────────

export interface CrossProjectInsight {
  fromProject: string;
  memory: string;
  relevance: string;
}

export function getCrossProjectInsights(
  db: Database,
  project: string,
  limit = 5
): CrossProjectInsight[] {
  // Get tags from current project
  const projectMemories = getFullMemories(db, project, 50);
  const allTags = new Set<string>();

  for (const mem of projectMemories) {
    try {
      const tags = JSON.parse(mem.tags) as string[];
      for (const tag of tags) allTags.add(tag);
    } catch {}
  }

  if (allTags.size === 0) return [];

  // Find memories in OTHER projects with same tags
  const crossMemories = getCrossProjectMemories(
    db,
    [...allTags],
    project,
    limit * 2
  );

  // Rank by relevance to current project's recent work
  const recentContent = projectMemories
    .slice(0, 10)
    .map((m) => m.content)
    .join(" ");

  const ranked = rankByRelevance(
    recentContent,
    crossMemories.map((m) => m.content),
    limit
  );

  return ranked.map((content) => {
    const mem = crossMemories.find((m) => m.content === content)!;
    return {
      fromProject: mem.project,
      memory: mem.content,
      relevance: `Shared tags: ${[...allTags].filter((t) => {
        try {
          return (JSON.parse(mem.tags) as string[]).includes(t);
        } catch {
          return false;
        }
      }).join(", ")}`,
    };
  });
}

// ── Developer DNA ───────────────────────────────────────────────────────────────

export interface DeveloperDNA {
  totalMemories: number;
  totalProjects: number;
  topTags: { tag: string; count: number }[];
  decisionStyle: string;
  techStack: string[];
  patternStrength: { pattern: string; reinforcements: number }[];
  evolutionCount: number;
  oldestMemory: string | null;
  newestMemory: string | null;
}

export function getDeveloperDNA(db: Database): DeveloperDNA {
  const projects = getProjects(db);
  const allMemories = getFullMemories(db, undefined, 1000);

  // Count tags
  const tagCounts = new Map<string, number>();
  for (const mem of allMemories) {
    try {
      const tags = JSON.parse(mem.tags) as string[];
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    } catch {}
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }));

  // Tech stack = tags that appear in 2+ projects
  const tagProjects = new Map<string, Set<string>>();
  for (const mem of allMemories) {
    try {
      const tags = JSON.parse(mem.tags) as string[];
      for (const tag of tags) {
        const set = tagProjects.get(tag) ?? new Set();
        set.add(mem.project);
        tagProjects.set(tag, set);
      }
    } catch {}
  }
  const techStack = [...tagProjects.entries()]
    .filter(([, projs]) => projs.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([tag]) => tag);

  // Decision style analysis
  const decisions = allMemories.filter((m) => m.content.startsWith("[decision]"));
  const patterns = allMemories.filter((m) => m.content.startsWith("[pattern]"));
  const ratio = decisions.length / Math.max(patterns.length, 1);
  const decisionStyle = ratio > 2
    ? "Architecture-driven — you make many strategic decisions"
    : ratio > 1
      ? "Balanced — equal focus on decisions and patterns"
      : "Convention-driven — you establish patterns and stick to them";

  // Most reinforced patterns
  const patternStrength = allMemories
    .filter((m) => m.reinforced_count > 0)
    .sort((a, b) => b.reinforced_count - a.reinforced_count)
    .slice(0, 5)
    .map((m) => ({ pattern: m.content, reinforcements: m.reinforced_count }));

  // Evolution count (superseded memories)
  const evolutionCount = (
    db.prepare(`SELECT COUNT(*) as n FROM memories WHERE superseded_by IS NOT NULL`).get() as { n: number }
  ).n;

  // Time range
  const oldest = db.prepare(`SELECT created_at FROM memories ORDER BY created_at ASC LIMIT 1`).get() as { created_at: string } | null;
  const newest = db.prepare(`SELECT created_at FROM memories ORDER BY created_at DESC LIMIT 1`).get() as { created_at: string } | null;

  return {
    totalMemories: countMemories(db),
    totalProjects: projects.length,
    topTags,
    decisionStyle,
    techStack,
    patternStrength,
    evolutionCount,
    oldestMemory: oldest?.created_at ?? null,
    newestMemory: newest?.created_at ?? null,
  };
}

// ── Memory timeline ─────────────────────────────────────────────────────────────

export interface TimelineEvent {
  date: string;
  project: string;
  type: "decision" | "pattern" | "evolution" | "milestone";
  content: string;
}

export function getTimeline(db: Database, limit = 30): TimelineEvent[] {
  const memories = db.prepare(
    `SELECT * FROM memories ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as FullMemory[];

  return memories.map((mem) => {
    let type: TimelineEvent["type"] = "decision";
    if (mem.content.startsWith("[pattern]")) type = "pattern";
    if (mem.superseded_by) type = "evolution";
    if (mem.reinforced_count >= 3) type = "milestone";

    return {
      date: mem.created_at,
      project: mem.project,
      type,
      content: mem.content,
    };
  });
}

// ── Periodic maintenance ────────────────────────────────────────────────────────

export function runMaintenance(db: Database): { decayed: number } {
  const decayed = decayMemories(db);
  return { decayed };
}
