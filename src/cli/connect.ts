import chalk from "chalk";
import { Command } from "commander";
import { loadProfile } from "../config/profile.js";
import { listInstances } from "../api/instance.js";
import type { RootOptions } from "../types/config.js";

function c() {
  return chalk;
}

export function registerConnect(program: Command): void {
  program
    .command("connect")
    .description("验证华为云 GaussDB 连接")
    .action(async function () {
      const opts = this.optsWithGlobals<RootOptions>();
      const cfg = await loadProfile(opts.profile);
      console.log(
        `正在连接华为云 GaussDB [profile: ${opts.profile}, region: ${cfg.region ?? "-"}]...`,
      );
      const instances = await listInstances(cfg);
      console.log(
        `✓ 连接成功 [profile: ${opts.profile}, region: ${cfg.region ?? "-"}] 共 ${instances.length} 个实例`,
      );
    });
}