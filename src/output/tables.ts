import { c, statusColored } from "./chalk.js";
import type { Instance, Flavor } from "../types/index.js";

function shortId(id: string, n = 8): string {
  return id.length <= n ? id : id.slice(0, n);
}

function pad(v: string, n: number): string {
  if (v.length >= n) return v;
  return v + " ".repeat(n - v.length);
}

export function printInstanceTable(
  instances: Instance[],
  fullId: boolean,
): void {
  console.log("");
  console.log(
    `  ${c().bold("实例列表")}  共 ${c().cyan(String(instances.length))} 个实例`,
  );
  console.log(
    "  ═══════════════════════════════════════════════════════════════════════════",
  );
  const idWidth = fullId ? 36 : 8;
  console.log(
    `  ${pad("#", 4)} ${pad("实例ID", idWidth)} ${pad("名称", 20)} ${pad("状态", 14)} ${pad("引擎", 10)}`,
  );
  console.log(
    "  ───────────────────────────────────────────────────────────────────────────",
  );
  instances.forEach((it, idx) => {
    const id = fullId ? it.id : shortId(it.id, 8);
    const name = (it.name?.trim() || "-").slice(0, 18);
    const engine = it.datastore?.type
      ? `${it.datastore.type}${it.datastore.version ? ` ${it.datastore.version}` : ""}`
      : "-";
    console.log(
      `  ${pad(String(idx + 1), 4)} ${pad(c().cyan(id), idWidth)} ${pad(c().bold(name), 20)} ${pad(statusColored(it.status), 14)} ${pad(c().gray(engine), 10)}`,
    );
  });
  console.log(
    "  ═══════════════════════════════════════════════════════════════════════════",
  );
  console.log("");
}

function parseNumber(v: string | undefined, def = 0): number {
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function printFlavorTable(flavors: Flavor[]): void {
  const sorted = [...flavors].sort((a, b) => {
    const vc = parseNumber(a.vcpus) - parseNumber(b.vcpus);
    if (vc !== 0) return vc;
    const ram = parseNumber(a.ram) - parseNumber(b.ram);
    if (ram !== 0) return ram;
    return a.spec_code.localeCompare(b.spec_code);
  });
  console.log("");
  console.log(
    `  ${c().bold("规格列表")}  共 ${c().cyan(String(sorted.length))} 个规格`,
  );
  console.log(
    "  ═══════════════════════════════════════════════════════════════════════════",
  );
  console.log(
    `  ${pad("#", 4)} ${pad("规格编码", 40)} ${pad("vCPU", 6)} ${pad("内存(GB)", 8)} ${pad("类型", 12)}`,
  );
  console.log(
    "  ───────────────────────────────────────────────────────────────────────────",
  );
  sorted.forEach((f, i) => {
    console.log(
      `  ${pad(String(i + 1), 4)} ${pad(c().cyan(f.spec_code || "-"), 40)} ${pad((f.vcpus || "-").trim(), 6)} ${pad((f.ram || "-").trim(), 8)} ${pad(c().gray((f.type || "-").trim()), 12)}`,
    );
  });
  console.log(
    "  ═══════════════════════════════════════════════════════════════════════════",
  );
  console.log("");
}