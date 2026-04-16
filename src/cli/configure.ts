import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import { regions, regionCodes } from "../constants/regions.js";
import { loadProfile, saveProfile } from "../config/profile.js";
import type { TaurusConfig } from "../types/config.js";
import type { RootOptions } from "../types/config.js";

function c() {
  return chalk;
}

export function registerConfigure(program: Command): void {
  program
    .command("configure")
    .description("配置华为云认证信息")
    .action(async function () {
      const opts = this.optsWithGlobals<RootOptions>();
      const answers = await prompts([
        {
          type: "text",
          name: "ak",
          message: "Access Key (AK):",
          validate: (v: string) => (v.trim() ? true : "AK 不能为空"),
        },
        {
          type: "password",
          name: "sk",
          message: "Secret Key (SK):",
          validate: (v: string) => (v.trim() ? true : "SK 不能为空"),
        },
        {
          type: "select",
          name: "regionLabel",
          message: "选择 Region:",
          choices: regions.map((r) => ({ title: r, value: r })),
        },
        {
          type: "text",
          name: "projectId",
          message: "Project ID:",
          validate: (v: string) => (v.trim() ? true : "Project ID 不能为空"),
        },
      ]);
      if (
        !answers.ak ||
        !answers.sk ||
        !answers.regionLabel ||
        !answers.projectId
      ) {
        throw new Error("输入已取消");
      }
      const cfg: TaurusConfig = {
        ak: answers.ak.trim(),
        sk: answers.sk.trim(),
        region: regionCodes[answers.regionLabel],
        project_id: answers.projectId.trim(),
      };
      await saveProfile(cfg, opts.profile);
      console.log(
        `✓ 配置已保存到 ~/.taurusdb/config.yaml (profile: ${opts.profile})`,
      );
    });
}