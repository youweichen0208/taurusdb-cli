import chalk from "chalk";

export function c() {
  return chalk;
}

export function statusColored(status?: string): string {
  const s = (status ?? "-").trim();
  const low = s.toLowerCase();
  if (["normal", "available", "active", "running"].includes(low))
    return c().green(`✓ ${s}`);
  if (["creating", "rebooting", "resizing"].includes(low))
    return c().yellow(`⟳ ${s}`);
  if (["abnormal", "createfail", "failed", "error"].includes(low))
    return c().redBright(`✗ ${s}`);
  if (s === "-") return c().gray("-");
  return c().red(`✗ ${s}`);
}