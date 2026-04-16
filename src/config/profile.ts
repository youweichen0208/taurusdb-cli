import fs from "node:fs/promises";
import process from "node:process";
import yaml from "js-yaml";
import { configFilePath, configDir, stripWrappingQuotes } from "./utils.js";
import {
  ENV_AK,
  ENV_SK,
  ENV_REGION,
  ENV_PROJECT_ID,
  ENV_LLM_BASE_URL,
  ENV_LLM_API_KEY,
  ENV_LLM_MODEL,
} from "../constants/config.js";
import type { TaurusConfig } from "../types/config.js";

export async function loadAllProfiles(): Promise<Record<string, TaurusConfig>> {
  const filePath = configFilePath();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("配置文件不存在，请先运行: taurusdb configure");
    }
    throw new Error(`读取配置文件失败: ${(err as Error).message}`);
  }
  const parsed = (yaml.load(raw) ?? {}) as Record<string, TaurusConfig>;
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("解析配置文件失败: 格式不正确");
  }
  return parsed;
}

export async function saveProfile(
  cfg: TaurusConfig,
  profile: string,
): Promise<void> {
  const dir = configDir();
  await fs.mkdir(dir, { mode: 0o700, recursive: true });
  const filePath = configFilePath();

  let all: Record<string, TaurusConfig> = {};
  try {
    const existing = await fs.readFile(filePath, "utf8");
    const parsed = yaml.load(existing);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      all = parsed as Record<string, TaurusConfig>;
    }
  } catch {
    all = {};
  }

  all[profile] = cfg;
  const dumped = yaml.dump(all);
  await fs.writeFile(filePath, dumped, { mode: 0o600 });
  await fs.chmod(filePath, 0o600);
}

export async function loadProfile(profile: string): Promise<TaurusConfig> {
  const all = await loadAllProfiles();
  const cfg = all[profile];
  if (!cfg) {
    throw new Error(
      `Profile "${profile}" 不存在，请先运行: taurusdb configure --profile ${profile}`,
    );
  }

  const merged: TaurusConfig = {
    ...cfg,
    llm: cfg.llm ? { ...cfg.llm } : undefined,
  };
  if (process.env[ENV_AK]) merged.ak = process.env[ENV_AK];
  if (process.env[ENV_SK]) merged.sk = process.env[ENV_SK];
  if (process.env[ENV_REGION]) merged.region = process.env[ENV_REGION];
  if (process.env[ENV_PROJECT_ID])
    merged.project_id = process.env[ENV_PROJECT_ID];

  if (!merged.llm) merged.llm = {};
  if (process.env[ENV_LLM_BASE_URL])
    merged.llm.base_url = process.env[ENV_LLM_BASE_URL];
  if (process.env[ENV_LLM_API_KEY])
    merged.llm.api_key = process.env[ENV_LLM_API_KEY];
  if (process.env[ENV_LLM_MODEL]) merged.llm.model = process.env[ENV_LLM_MODEL];

  if (merged.llm) {
    merged.llm.base_url = stripWrappingQuotes(
      (merged.llm.base_url ?? "").trim(),
    );
    merged.llm.api_key = stripWrappingQuotes((merged.llm.api_key ?? "").trim());
    merged.llm.model = stripWrappingQuotes((merged.llm.model ?? "").trim());
    const empty =
      !merged.llm.base_url &&
      !merged.llm.api_key &&
      !merged.llm.model &&
      !merged.llm.timeout_ms &&
      (!merged.llm.extra_headers ||
        Object.keys(merged.llm.extra_headers).length === 0);
    if (empty) merged.llm = undefined;
  }
  return merged;
}