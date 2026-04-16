import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import { loadProfile } from "../config/profile.js";
import { listFlavors } from "../api/flavor.js";
import { normalizeAzMode } from "../validation/normalize.js";
import { printJSON, printYAML, printFlavorTable } from "../output/index.js";
import { c } from "../output/chalk.js";
import type { OutputFormat, Flavor } from "../types/index.js";
import type { RootOptions } from "./options.js";

export function registerFlavorCommands(program: Command): void {
  const flavorCmd = program.command("flavor").description("查询数据库规格");

  flavorCmd
    .command("list")
    .description("列出可用规格")
    .option("--database-name <name>", "数据库引擎名称", "gaussdb-mysql")
    .option("--az-mode <mode>", "可用区模式: auto|single|multi", "auto")
    .option("--engine-version <ver>", "引擎版本号")
    .option("--spec-code <code>", "规格编码过滤")
    .action(async function () {
      const opts = this.optsWithGlobals<RootOptions>();
      const f = this.opts<{
        databaseName: string;
        azMode: string;
        engineVersion?: string;
        specCode?: string;
      }>();
      const cfg = await loadProfile(opts.profile);
      const mode = normalizeAzMode(f.azMode);
      const tryModes: Array<"single" | "multi" | "auto"> =
        mode === "auto" ? ["single", "multi"] : [mode];
      let lastErr: Error | undefined;
      let flavors: Flavor[] = [];
      let usedMode: "auto" | "single" | "multi" = mode;
      for (const m of tryModes) {
        try {
          flavors = await listFlavors(
            cfg,
            f.databaseName,
            m,
            f.engineVersion,
            f.specCode,
          );
          usedMode = m;
          break;
        } catch (err) {
          lastErr = err as Error;
        }
      }
      if (!flavors.length && lastErr) throw lastErr;
      if (mode === "auto")
        console.log(`  ${c().gray(`已自动选择 az-mode: ${usedMode}`)}`);
      if (flavors.length === 0) {
        console.log(c().yellow("  ⚠ 未查询到可用规格"));
        return;
      }
      const out = (opts.output || "table").toLowerCase() as OutputFormat;
      if (out === "json") return printJSON(flavors);
      if (out === "yaml") return printYAML(flavors);
      printFlavorTable(flavors);
    });

  flavorCmd
    .command("pick")
    .description("交互式选择规格/可用区")
    .option("--database-name <name>", "数据库引擎名称", "gaussdb-mysql")
    .option("--az-mode <mode>", "可用区模式: auto|single|multi", "auto")
    .option("--engine-version <ver>", "引擎版本号")
    .option("--spec-code <code>", "规格编码过滤")
    .action(async function () {
      const opts = this.optsWithGlobals<RootOptions>();
      const f = this.opts<{
        databaseName: string;
        azMode: string;
        engineVersion?: string;
        specCode?: string;
      }>();
      const cfg = await loadProfile(opts.profile);
      const mode = normalizeAzMode(f.azMode);
      const tryModes: Array<"single" | "multi" | "auto"> =
        mode === "auto" ? ["single", "multi"] : [mode];
      let flavors: Flavor[] = [];
      let usedMode: "auto" | "single" | "multi" = mode;
      for (const m of tryModes) {
        try {
          flavors = await listFlavors(
            cfg,
            f.databaseName,
            m,
            f.engineVersion,
            f.specCode,
          );
          usedMode = m;
          break;
        } catch {
          continue;
        }
      }
      if (flavors.length === 0) throw new Error("未查询到可用规格");
      console.log(`  ${c().gray(`az-mode: ${usedMode}`)}`);
      const picked = await prompts({
        type: "select",
        name: "idx",
        message: "选择规格",
        choices: flavors.slice(0, 30).map((x, i) => ({
          title: `${x.spec_code}  vCPU=${x.vcpus ?? "-"} RAM=${x.ram ?? "-"}`,
          value: i,
        })),
      });
      if (typeof picked.idx !== "number") return;
      const chosen = flavors[picked.idx];
      console.log("");
      console.log(c().bold("  已选择:"));
      console.log(`  az-mode:   ${usedMode}`);
      console.log(`  spec-code: ${chosen.spec_code}`);
      console.log("");
      console.log(c().gray("  复制参数："));
      console.log(`  --az-mode ${usedMode} --spec-code ${chosen.spec_code}`);
    });
}