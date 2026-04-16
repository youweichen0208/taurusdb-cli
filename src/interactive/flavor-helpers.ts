import type { Flavor, TaurusConfig } from "../types/index.js";
import { listFlavors } from "../api/flavor.js";

export function collectFlavorTypes(flavors: Flavor[]): string[] {
  const set = new Set<string>();
  for (const f of flavors) {
    const t = (f.type ?? "").trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function filterFlavorsByTypes(
  flavors: Flavor[],
  types: string[],
): Flavor[] {
  if (types.length === 0) return flavors;
  const s = new Set(types);
  return flavors.filter((f) => s.has((f.type ?? "").trim()));
}

export async function fetchFlavorsWithAutoMode(
  cfg: TaurusConfig,
  azMode: "auto" | "single" | "multi",
  engineVersion?: string,
  specCode?: string,
): Promise<{ flavors: Flavor[]; usedMode: "auto" | "single" | "multi" }> {
  const tryModes: Array<"auto" | "single" | "multi"> =
    azMode === "auto" ? ["single", "multi"] : [azMode];
  let usedMode: "auto" | "single" | "multi" = azMode;
  let lastErr: Error | undefined;
  for (const m of tryModes) {
    try {
      const flavors = await listFlavors(
        cfg,
        "gaussdb-mysql",
        m,
        engineVersion,
        specCode,
      );
      usedMode = m;
      return { flavors, usedMode };
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr ?? new Error("查询规格失败");
}