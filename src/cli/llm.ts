import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import { loadProfile, saveProfile, stripWrappingQuotes } from "../config/index.js";
import {
  ENV_LLM_BASE_URL,
  ENV_LLM_API_KEY,
  ENV_LLM_MODEL,
} from "../constants/config.js";
import { LLMClient } from "../llm/client.js";
import { c } from "../output/chalk.js";
import type { TaurusConfig } from "../types/config.js";
import type { RootOptions } from "./options.js";

export function registerLlmCommands(program: Command): void {
  const llmCmd = program
    .command("llm")
    .description("配置/使用大模型（OpenAI-compatible）");

  llmCmd
    .command("configure")
    .description("配置 LLM")
    .action(async function () {
      const opts = this.optsWithGlobals<RootOptions>();
      let cfg: TaurusConfig;
      try {
        cfg = await loadProfile(opts.profile);
      } catch {
        cfg = {};
      }
      const answers = await prompts([
        {
          type: "text",
          name: "baseURL",
          message: "LLM Base URL (e.g. https://api.openai.com/v1):",
          validate: (v: string) => {
            try {
              const u = new URL(v.trim());
              if (!["http:", "https:"].includes(u.protocol) || !u.host)
                return "Base URL 格式不正确";
              return true;
            } catch {
              return "Base URL 格式不正确";
            }
          },
        },
        {
          type: "text",
          name: "model",
          message: "Model (e.g. gpt-4o-mini):",
          validate: (v: string) => (v.trim() ? true : "Model 不能为空"),
        },
        {
          type: "password",
          name: "apiKey",
          message: "API Key (可留空，改用环境变量 TAURUSDB_LLM_API_KEY):",
        },
      ]);
      if (!answers.baseURL || !answers.model) throw new Error("输入已取消");
      cfg.llm = cfg.llm ?? {};
      cfg.llm.base_url = stripWrappingQuotes(answers.baseURL.trim());
      cfg.llm.model = stripWrappingQuotes(answers.model.trim());
      cfg.llm.api_key = stripWrappingQuotes((answers.apiKey ?? "").trim());
      if (!cfg.llm.timeout_ms) cfg.llm.timeout_ms = 30000;
      await saveProfile(cfg, opts.profile);
      console.log(
        `✓ LLM 配置已保存到 ~/.taurusdb/config.yaml (profile: ${opts.profile})`,
      );
      console.log(
        `  提示: 也可使用环境变量覆盖: ${ENV_LLM_BASE_URL} / ${ENV_LLM_API_KEY} / ${ENV_LLM_MODEL}`,
      );
    });

  llmCmd
    .command("show")
    .description("查看当前 LLM 配置（脱敏）")
    .action(async function () {
      const opts = this.optsWithGlobals<RootOptions>();
      const cfg = await loadProfile(opts.profile);
      if (!cfg.llm) {
        console.log(c().gray("LLM: 未配置"));
        return;
      }
      const keyRaw = (cfg.llm.api_key ?? "").trim().replace(/^Bearer\s+/i, "");
      const masked =
        keyRaw.length <= 8
          ? "********"
          : `${keyRaw.slice(0, 4)}...${keyRaw.slice(-4)}`;
      console.log(
        `${c().gray("LLM Base URL:")} ${c().cyan(cfg.llm.base_url ?? "")}`,
      );
      console.log(`${c().gray("LLM Model:")} ${c().cyan(cfg.llm.model ?? "")}`);
      if (keyRaw)
        console.log(`${c().gray("LLM API Key:")} ${c().cyan(masked)}`);
      else
        console.log(
          `${c().gray("LLM API Key:")} ${c().gray("(empty; maybe using env TAURUSDB_LLM_API_KEY)")}`,
        );
    });

  llmCmd
    .command("test")
    .description("测试 LLM 连通性")
    .action(async function () {
      const opts = this.optsWithGlobals<RootOptions>();
      const cfg = await loadProfile(opts.profile);
      if (!cfg.llm?.base_url || !cfg.llm?.model) {
        throw new Error("未配置 LLM，请先运行: taurusdb llm configure");
      }
      const client = new LLMClient(cfg.llm);
      console.log(`${c().gray("LLM Base URL:")} ${c().cyan(cfg.llm.base_url)}`);
      console.log(`${c().gray("LLM Model:")} ${c().cyan(cfg.llm.model)}`);
      console.log(c().gray("正在发送 Ping..."));
      try {
        const out = await client.ping();
        console.log(c().green("  ✓ 连接成功"));
        console.log(`${c().gray("响应:")} ${out.content.trim()}`);
      } catch (err) {
        console.log(c().red(`  ✗ 连接失败: ${(err as Error).message}`));
      }
    });
}