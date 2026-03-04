import { execSync } from "child_process";
import { existsSync } from "fs";

const CANDIDATES = [
  "/usr/local/bin/claude",
  "/usr/bin/claude",
  `${process.env.HOME}/.local/bin/claude`,
  `${process.env.HOME}/.nvm/versions/node/*/bin/claude`,
];

export function findClaudeBin(): string | null {
  // 1. $PATH first
  try {
    const which = execSync("which claude", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
    if (which && existsSync(which)) return which;
  } catch {}

  // 2. Known locations
  for (const candidate of CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

export function checkAuth(bin: string): boolean {
  try {
    const env = { ...process.env };
    delete env["CLAUDECODE"];
    delete env["CLAUDE_CODE"];
    execSync(`"${bin}" --version`, { encoding: "utf8", timeout: 5000, env, stdio: ["pipe", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}
