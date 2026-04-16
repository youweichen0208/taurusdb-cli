export function isAzModeUnsupportedError(err: unknown): boolean {
  const s = String((err as Error)?.message ?? err ?? "").toLowerCase();
  return (
    s.includes("dbs.05000085") ||
    s.includes("availability zone mode is not supported") ||
    s.includes("az mode is not supported") ||
    s.includes("availability_zone_mode is not supported")
  );
}