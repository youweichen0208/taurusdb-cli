import os from "node:os";
import path from "node:path";
import { CONFIG_DIR, CONFIG_FILE } from "../constants/config.js";

export function stripWrappingQuotes(s: string): string {
  let out = s.trim();
  while (out.length >= 2) {
    if (
      (out.startsWith('"') && out.endsWith('"')) ||
      (out.startsWith("'") && out.endsWith("'"))
    ) {
      out = out.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return out;
}

export function configDir(): string {
  return path.join(os.homedir(), CONFIG_DIR);
}

export function configFilePath(): string {
  return path.join(configDir(), CONFIG_FILE);
}