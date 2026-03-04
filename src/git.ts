import { execSync } from "child_process";

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  diff: string;
}

export function isGitRepo(path: string): boolean {
  try {
    execSync(`git -C "${path}" rev-parse --git-dir`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function getCurrentHash(path: string): string | null {
  try {
    return execSync(`git -C "${path}" rev-parse HEAD`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function getNewCommits(path: string, sinceHash?: string): GitCommit[] {
  try {
    const rangeArg = sinceHash ? `${sinceHash}..HEAD` : "-5";
    const logCmd = sinceHash
      ? `git -C "${path}" log ${rangeArg} --format="%H|%s|%an" --no-merges`
      : `git -C "${path}" log ${rangeArg} --format="%H|%s|%an" --no-merges`;

    const output = execSync(logCmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    if (!output) return [];

    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, message, author] = line.split("|");
        let diff = "";
        try {
          diff = execSync(`git -C "${path}" show ${hash} --format="" --unified=2`, {
            encoding: "utf8",
            stdio: ["pipe", "pipe", "ignore"],
            maxBuffer: 200 * 1024,
          }).slice(0, 4000); // cap at 4KB
        } catch {}
        return { hash, message: message ?? "", author: author ?? "", diff };
      });
  } catch {
    return [];
  }
}
