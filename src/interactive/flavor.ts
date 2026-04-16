import prompts from "prompts";
import { loadProfile } from "../config/profile.js";
import { normalizeAzMode } from "../validation/normalize.js";
import { printFlavorTable } from "../output/tables.js";
import {
  collectFlavorTypes,
  filterFlavorsByTypes,
  fetchFlavorsWithAutoMode,
} from "./flavor-helpers.js";
import { c } from "./banner.js";

export async function runInteractiveFlavorList(profile: string): Promise<void> {
  const cfg = await loadProfile(profile);
  const azAns = await prompts({
    type: "select",
    name: "azMode",
    message: "选择可用区模式:",
    choices: [
      { title: "auto", value: "auto" },
      { title: "single", value: "single" },
      { title: "multi", value: "multi" },
    ],
    initial: 0,
  });
  if (!azAns.azMode) return;

  const mode = normalizeAzMode(azAns.azMode);
  const { flavors: all, usedMode } = await fetchFlavorsWithAutoMode(cfg, mode);
  if (all.length === 0) {
    console.log(c().yellow("  ⚠ 未查询到可用规格"));
    return;
  }
  if (mode === "auto")
    console.log(`  ${c().gray(`已自动选择 az-mode: ${usedMode}`)}`);

  const types = collectFlavorTypes(all);
  let flavors = all;
  if (types.length > 0) {
    const picked = await prompts({
      type: "multiselect",
      name: "types",
      message: "选择规格类型（可多选，不选=全部）:",
      choices: types.map((t) => ({ title: t, value: t })),
      instructions: false,
    });
    const selected: string[] = Array.isArray(picked.types) ? picked.types : [];
    flavors = filterFlavorsByTypes(all, selected);
    if (selected.length > 0) {
      console.log(
        `  ${c().gray(`已筛选类型: ${selected.sort((a, b) => a.localeCompare(b)).join(", ")}`)}`,
      );
    }
  }
  if (flavors.length === 0) {
    console.log(c().yellow("  ⚠ 筛选后没有匹配规格"));
    return;
  }
  printFlavorTable(flavors);
}

export async function runInteractiveFlavorPick(profile: string): Promise<void> {
  const cfg = await loadProfile(profile);
  const azAns = await prompts({
    type: "select",
    name: "azMode",
    message: "选择可用区模式:",
    choices: [
      { title: "auto", value: "auto" },
      { title: "single", value: "single" },
      { title: "multi", value: "multi" },
    ],
    initial: 0,
  });
  if (!azAns.azMode) return;

  const mode = normalizeAzMode(azAns.azMode);
  const { flavors: all, usedMode } = await fetchFlavorsWithAutoMode(cfg, mode);
  if (all.length === 0) {
    console.log(c().yellow("  ⚠ 未查询到可用规格"));
    return;
  }
  if (mode === "auto")
    console.log(`  ${c().gray(`已自动选择 az-mode: ${usedMode}`)}`);

  const types = collectFlavorTypes(all);
  let flavors = all;
  if (types.length > 0) {
    const picked = await prompts({
      type: "multiselect",
      name: "types",
      message: "选择规格类型（可多选，不选=全部）:",
      choices: types.map((t) => ({ title: t, value: t })),
      instructions: false,
    });
    const selected: string[] = Array.isArray(picked.types) ? picked.types : [];
    flavors = filterFlavorsByTypes(all, selected);
  }
  if (flavors.length === 0) {
    console.log(c().yellow("  ⚠ 筛选后没有匹配规格"));
    return;
  }

  const pick = await prompts({
    type: "select",
    name: "idx",
    message: "选择规格:",
    choices: flavors.slice(0, 30).map((f, i) => ({
      title:
        `${f.spec_code}  vCPU=${f.vcpus ?? "-"} RAM=${f.ram ?? "-"} ${f.type ?? ""}`.trim(),
      value: i,
    })),
  });
  if (typeof pick.idx !== "number") return;
  const chosen = flavors[pick.idx];

  console.log("");
  console.log(c().bold("  已选择:"));
  console.log(`  az-mode:   ${usedMode}`);
  console.log(`  spec-code: ${chosen.spec_code}`);
  console.log("");
  console.log(c().gray("  复制参数："));
  console.log(`  --az-mode ${usedMode} --spec-code ${chosen.spec_code}`);
}