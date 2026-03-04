import { spawnSync } from "child_process";
import type { GitCommit } from "./git.js";

export interface ExtractedContext {
  decisions: string[];
  patterns: string[];
  summary: string;
}

const TRIVIAL_PATTERNS = [
  /^(bump|chore|style|format|lint|typo|whitespace)/i,
  /^v?\d+\.\d+\.\d+/,
  /^merge/i,
];

// Files whose diffs should be entirely stripped
const SECRET_FILE_PATTERNS = [
  /\.env(\..*)?$/i,
  /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i,
  /id_rsa/i, /id_ed25519/i, /id_dsa/i,
  /(secret|credential|password|token|private)[^/]*$/i,
  /\.netrc$/i, /\.npmrc$/i, /\.pypirc$/i,
  /kubeconfig/i, /service.?account.*\.json/i,
];

// Line patterns that look like leaked secrets
const SECRET_LINE_PATTERNS = [
  /api[_-]?key\s*[:=]\s*["']?\S{8,}/i,
  /secret\s*[:=]\s*["']?\S{8,}/i,
  /password\s*[:=]\s*["']?\S{4,}/i,
  /token\s*[:=]\s*["']?\S{8,}/i,
  /bearer\s+[a-zA-Z0-9\-._~+/]{20,}/i,
  /sk-[a-zA-Z0-9]{20,}/i,          // OpenAI keys
  /sk-ant-[a-zA-Z0-9\-]{20,}/i,    // Anthropic keys
  /AIza[0-9A-Za-z\-_]{35}/i,       // Google API keys
  /ghp_[a-zA-Z0-9]{36}/i,          // GitHub PAT
  /xox[baprs]-[0-9A-Za-z\-]{10,}/i, // Slack tokens
];

function sanitizeDiff(diff: string): string {
  // Split by file sections
  const sections = diff.split(/(?=^diff --git )/m);

  return sections.map((section) => {
    const fileMatch = section.match(/^diff --git a\/(.*) b\//m);
    if (fileMatch) {
      const filePath = fileMatch[1];
      if (SECRET_FILE_PATTERNS.some((p) => p.test(filePath))) {
        return `diff --git a/${filePath} b/${filePath}\n[REDACTED — sensitive file]\n`;
      }
    }

    // Redact secret-looking lines (only added/removed lines, not context)
    return section
      .split("\n")
      .map((line) => {
        const isChangeLine = (line.startsWith("+") || line.startsWith("-"))
          && !line.startsWith("+++")
          && !line.startsWith("---");
        if (isChangeLine && SECRET_LINE_PATTERNS.some((p) => p.test(line))) {
          return line[0] + " [REDACTED — possible secret]";
        }
        return line;
      })
      .join("\n");
  }).join("");
}

function isTrivial(commit: GitCommit): boolean {
  return TRIVIAL_PATTERNS.some((p) => p.test(commit.message)) && commit.diff.length < 200;
}

function buildPrompt(commit: GitCommit, sanitizedDiff: string): string {
  return `Analyze this git commit and extract developer context as JSON.

Commit message: ${commit.message}

Diff:
${sanitizedDiff.slice(0, 3000)}

Return ONLY valid JSON, no markdown fences, no explanation:
{
  "decisions": ["max 3 items under 100 chars — WHY this was done, not what"],
  "patterns": ["max 2 items under 100 chars — conventions or patterns established"],
  "summary": "one sentence under 120 chars describing the change"
}

Rules:
- Focus on WHY, not WHAT
- decisions = architectural choices, tradeoffs, reasoning
- patterns = reusable conventions others should follow
- NEVER include file paths, secrets, passwords, tokens
- If trivial change, return empty arrays and brief summary`.trim();
}

export function extractFromCommit(
  commit: GitCommit,
  claudeBin: string,
  model: string
): ExtractedContext | null {
  if (isTrivial(commit)) return null;

  const sanitizedDiff = sanitizeDiff(commit.diff);

  const env: Record<string, string | undefined> = { ...process.env };
  delete env["CLAUDECODE"];
  delete env["CLAUDE_CODE"];

  const result = spawnSync(claudeBin, ["-p", "--model", model], {
    input: buildPrompt(commit, sanitizedDiff),
    encoding: "utf8",
    timeout: 45_000,
    env: env as NodeJS.ProcessEnv,
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0 || !result.stdout) return null;

  const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ExtractedContext>;
    return {
      decisions: Array.isArray(parsed.decisions)
        ? parsed.decisions.filter((d) => typeof d === "string")
        : [],
      patterns: Array.isArray(parsed.patterns)
        ? parsed.patterns.filter((p) => typeof p === "string")
        : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : commit.message,
    };
  } catch {
    return null;
  }
}
