import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export const HOME = process.env.HOME ?? "";
export const CONFIG_DIR = join(HOME, ".continuum");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export interface ProjectConfig {
  path: string;
  name: string;
}

export interface SyncConfig {
  enabled: boolean;
  repo: string;
  autoSync: boolean;
}

export interface Config {
  projects: ProjectConfig[];
  port: number;
  claudeBin?: string;
  model: string;
  ignore: string[];
  sync?: SyncConfig;
}

const DEFAULTS: Config = {
  projects: [],
  port: 3100,
  model: "claude-haiku-4-5-20251001",
  ignore: [".env", "*.pem", "*.key", "*.p12", "*secret*", "*password*", "*token*", "node_modules", ".git", "dist", ".next"],
};

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_PATH, "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getStateDir(): string {
  const dir = join(CONFIG_DIR, "state");
  mkdirSync(dir, { recursive: true });
  return dir;
}
