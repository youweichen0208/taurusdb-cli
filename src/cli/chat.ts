import readline from "node:readline/promises";
import { stdin as input, stdout as outputStream } from "node:process";
import chalk from "chalk";
import { slashCommands } from "../constants/commands.js";
import { loadProfile } from "../config/profile.js";
import { listInstances } from "../api/instance.js";
import { printBanner, versionLabel } from "../interactive/banner.js";
import { runAsk } from "../interactive/ask.js";
import { runInteractiveInstanceCreate, runInteractiveInstanceListAndShow } from "../interactive/instance.js";
import { runInteractiveFlavorList, runInteractiveFlavorPick } from "../interactive/flavor.js";
import { LLMClient } from "../llm/client.js";
import { completeSlashCommand, fuzzyMatchCommand } from "./readline.js";
import type { RootOptions } from "./options.js";

function c() {
  return chalk;
}

export async function startChat(
  profile: string,
  dispatch: (cmd: string) => Promise<void>,
): Promise<void> {
  const rl = readline.createInterface({
    input,
    output: outputStream,
    completer: completeSlashCommand,
  });
  const cfg = await loadProfile(profile);
  printBanner(profile, cfg.region ?? "-");
  console.log(
    c().gray("输入 /help 查看指令；输入 / 后按 Tab 可补全；/exit 退出。"),
  );
  while (true) {
    const line = (await rl.question("taurusdb> ")).trim();
    if (!line) continue;
    if (line === "/") {
      for (const cmd of slashCommands) console.log(`  ${cmd}`);
      continue;
    }

    let normalized = line;
    if (normalized.startsWith("/")) {
      const matched = fuzzyMatchCommand(normalized);
      if (matched !== normalized) {
        console.log(
          `  ${c().gray("自动匹配:")} ${normalized} ${c().gray("->")} ${c().cyan(matched)}`,
        );
      }
      normalized = matched;
    }

    if (normalized === "/exit" || normalized === "/quit") break;
    if (normalized === "/help") {
      console.log("  /instance list");
      console.log("  /instance show <id>");
      console.log("  /instance create");
      console.log("  /flavor list");
      console.log("  /flavor pick");
      console.log("  /ask <自然语言>");
      console.log("  /chat <问题>");
      continue;
    }
    if (normalized === "/instance create") {
      try {
        await runInteractiveInstanceCreate(profile);
      } catch (err) {
        console.log(c().red(`  ✗ ${(err as Error).message}`));
      }
      continue;
    }
    if (normalized === "/instance list") {
      try {
        await runInteractiveInstanceListAndShow(profile, dispatch);
      } catch (err) {
        console.log(c().red(`  ✗ ${(err as Error).message}`));
      }
      continue;
    }
    if (normalized === "/flavor list") {
      try {
        await runInteractiveFlavorList(profile);
      } catch (err) {
        console.log(c().red(`  ✗ ${(err as Error).message}`));
      }
      continue;
    }
    if (normalized === "/flavor pick") {
      try {
        await runInteractiveFlavorPick(profile);
      } catch (err) {
        console.log(c().red(`  ✗ ${(err as Error).message}`));
      }
      continue;
    }
    if (normalized.startsWith("/ask ")) {
      await runAsk(profile, normalized.replace(/^\/ask\s+/, ""));
      continue;
    }
    if (normalized.startsWith("/chat ")) {
      try {
        const cfg = await loadProfile(profile);
        if (!cfg.llm?.base_url || !cfg.llm?.model) {
          console.log(
            c().yellow("  ⚠ 未配置 LLM。请先运行: taurusdb llm configure"),
          );
          continue;
        }
        const client = new LLMClient(cfg.llm);
        const out = await client.chat(normalized.replace(/^\/chat\s+/, ""));
        console.log(`  ${out.content.trim()}`);
      } catch (err) {
        console.log(c().red(`  ✗ ${(err as Error).message}`));
      }
      continue;
    }
    if (normalized.startsWith("/")) {
      await dispatch(normalized.slice(1));
      continue;
    }
    await dispatch(normalized);
  }
  rl.close();
}