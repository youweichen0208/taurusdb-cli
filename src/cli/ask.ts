import { Command } from "commander";
import { runAsk } from "../interactive/ask.js";
import type { RootOptions } from "./options.js";

export function registerAskCommand(program: Command): void {
  program
    .command("ask")
    .description("自然语言转命令（需要先配置 llm）")
    .argument("<text...>", "自然语言描述")
    .action(async function (parts: string[]) {
      const opts = this.optsWithGlobals<RootOptions>();
      await runAsk(opts.profile, parts.join(" "));
    });
}