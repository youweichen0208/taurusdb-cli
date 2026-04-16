import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { versionLabel } from "../interactive/banner.js";
import { registerConfigure } from "./configure.js";
import { registerConnect } from "./connect.js";
import { registerInstanceCommands } from "./instance.js";
import { registerFlavorCommands } from "./flavor.js";
import { registerLlmCommands } from "./llm.js";
import { registerAskCommand } from "./ask.js";
import { registerChatCommand } from "./chat-cmd.js";
import { startChat } from "./chat.js";
import type { RootOptions } from "./options.js";

function c() {
  return chalk;
}

export const program = new Command();
program
  .name("taurusdb")
  .description("TaurusDB CLI TypeScript 版")
  .version(versionLabel())
  .option("--profile <name>", "配置文件 Profile 名称", "default")
  .option("-o, --output <fmt>", "输出格式: table|json|yaml", "table")
  .option("--no-color", "禁用彩色输出", false);

program.action(async function () {
  const opts = this.optsWithGlobals<RootOptions>();
  if (opts.noColor) chalk.level = 0;
  await startChat(opts.profile, async (cmdLine) => {
    const args = cmdLine.trim().split(/\s+/).filter(Boolean);
    if (args.length === 0) return;
    await program.parseAsync([process.argv[0], process.argv[1], ...args], {
      from: "user",
    });
  });
});

registerConfigure(program);
registerConnect(program);
registerInstanceCommands(program);
registerFlavorCommands(program);
registerLlmCommands(program);
registerAskCommand(program);
registerChatCommand(program);

export const isDirectRun = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return fileURLToPath(import.meta.url) === path.resolve(argv1);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  program.parseAsync(process.argv).catch((err) => {
    console.error(`  ${c().red("✗")} ${(err as Error).message}`);
    process.exit(1);
  });
}