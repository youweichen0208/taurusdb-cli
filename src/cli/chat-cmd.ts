import { Command } from "commander";
import { startChat } from "./chat.js";
import type { RootOptions } from "./options.js";

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("进入交互模式")
    .action(async function () {
      const opts = this.optsWithGlobals<RootOptions>();
      await startChat(opts.profile, async (cmdLine) => {
        const args = cmdLine.trim().split(/\s+/).filter(Boolean);
        if (args.length === 0) return;
        await program.parseAsync([process.argv[0], process.argv[1], ...args], {
          from: "user",
        });
      });
    });
}