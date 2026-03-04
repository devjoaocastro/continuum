import { randomUUID } from "crypto";
import type { Database } from "bun:sqlite";
import { getContext, searchMemories, addMemory, getProjects, getMostRecentProject, countMemories, getAllMemories } from "./db.js";
import { rankByRelevance } from "./search.js";

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = { name: "continuum", version: "0.1.0" };

const TOOLS = [
  {
    name: "get_context",
    description:
      "Load memory and context for the current project. Call this at the start of any conversation to recall past decisions, patterns, and insights. Returns the most recent memories grouped by project.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Project name (e.g. 'pulso', 'claude-local'). Omit to get context from all projects.",
        },
        limit: {
          type: "number",
          description: "Max number of memories to return per project (default: 15)",
        },
      },
    },
  },
  {
    name: "search_context",
    description: "Search through all saved memories and decisions using keywords.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to search for" },
        project: { type: "string", description: "Limit search to a specific project (optional)" },
      },
      required: ["query"],
    },
  },
  {
    name: "add_memory",
    description:
      "Save an important decision, insight, or pattern for future sessions. Use this when a significant architectural choice or non-obvious decision is made.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The decision or insight to remember" },
        project: { type: "string", description: "Project this memory belongs to" },
      },
      required: ["content", "project"],
    },
  },
  {
    name: "list_projects",
    description: "List all projects Continuum is tracking, with memory counts.",
    inputSchema: { type: "object", properties: {} },
  },
];

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function ok(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcErr(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function dispatch(req: JsonRpcRequest, db: Database): Promise<unknown> {
  const { id, method, params = {} } = req;

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, { tools: TOOLS });

    case "tools/call": {
      const toolName = params["name"] as string;
      const args = (params["arguments"] ?? {}) as Record<string, unknown>;

      switch (toolName) {
        case "get_context": {
          const project = args["project"] as string | undefined;
          const limit = Math.min((args["limit"] as number | undefined) ?? 15, 50);

          if (!project) {
            const projects = getProjects(db);
            if (projects.length === 0) {
              return ok(id, {
                content: [{ type: "text", text: "No context yet. Continuum is watching — make a commit to start building memory." }],
              });
            }
            const perProject = Math.max(Math.ceil(limit / projects.length), 5);
            const sections = projects
              .map((p) => {
                const mems = getContext(db, p, perProject);
                return mems.length ? `## ${p}\n${mems.join("\n")}` : null;
              })
              .filter(Boolean)
              .join("\n\n");
            return ok(id, { content: [{ type: "text", text: sections || "No memories yet." }] });
          }

          const memories = getContext(db, project, limit);
          const text = memories.length
            ? `## ${project}\n\n${memories.join("\n")}`
            : `No context found for "${project}" yet. Continuum will extract it automatically after the next commit.`;
          return ok(id, { content: [{ type: "text", text }] });
        }

        case "search_context": {
          const query = args["query"] as string;
          const project = args["project"] as string | undefined;
          if (!query?.trim()) return rpcErr(id, -32602, "query is required");
          // Get candidate pool then rank by TF-IDF
          const candidates = searchMemories(db, query, project);
          const allMemories = project ? getContext(db, project, 200) : getAllMemories(db, 200);
          const pool = [...new Set([...candidates, ...allMemories])];
          const ranked = rankByRelevance(query, pool);
          const text = ranked.length ? ranked.join("\n") : `No memories found matching "${query}".`;
          return ok(id, { content: [{ type: "text", text }] });
        }

        case "add_memory": {
          const content = args["content"] as string;
          const project = args["project"] as string;
          if (!content?.trim() || !project?.trim()) return rpcErr(id, -32602, "content and project are required");
          addMemory(db, { id: randomUUID(), project, content: content.trim(), source: "manual" });
          return ok(id, { content: [{ type: "text", text: `Saved to ${project}` }] });
        }

        case "list_projects": {
          const projects = getProjects(db);
          if (projects.length === 0) return ok(id, { content: [{ type: "text", text: "No projects tracked yet." }] });
          const lines = projects.map((p) => `${p} (${countMemories(db, p)} memories)`);
          return ok(id, { content: [{ type: "text", text: lines.join("\n") }] });
        }

        default:
          return rpcErr(id, -32602, `Unknown tool: ${toolName}`);
      }
    }

    default:
      return rpcErr(id, -32601, `Method not found: ${method}`);
  }
}

// ── HTTP transport (for continuum start) ──────────────────────────────────────

export function createHttpHandler(db: Database) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  return async function handleHttp(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const body = (await req.json()) as JsonRpcRequest;
      const result = await dispatch(body, db);
      return Response.json(result, { headers: cors });
    } catch {
      return Response.json(rpcErr(null, -32700, "Parse error"), { status: 400, headers: cors });
    }
  };
}

// ── Stdio transport (for bunx continuum --mcp-only) ───────────────────────────

export async function runStdioMcp(db: Database): Promise<void> {
  process.stdin.setEncoding("utf8");
  let buf = "";

  process.stdin.on("data", async (chunk: string) => {
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const req = JSON.parse(trimmed) as JsonRpcRequest;
        const result = await dispatch(req, db);
        // Skip null responses (notifications)
        if (result !== null) {
          process.stdout.write(JSON.stringify(result) + "\n");
        }
      } catch {
        process.stdout.write(JSON.stringify(rpcErr(null, -32700, "Parse error")) + "\n");
      }
    }
  });

  process.stdin.on("end", () => process.exit(0));
}
