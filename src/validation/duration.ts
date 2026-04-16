export function parseDurationToMs(v: string): number {
  const s = v.trim().toLowerCase();
  if (!s) throw new Error("duration 不能为空");
  if (/^\d+$/.test(s)) return Number(s) * 1000;

  const m = s.match(/^(\d+)(ms|s|m|h)$/);
  if (!m) throw new Error(`非法时长格式: ${v}（示例: 10s, 15m, 1h）`);
  const n = Number(m[1]);
  const unit = m[2];
  if (!Number.isFinite(n) || n <= 0) throw new Error(`非法时长: ${v}`);

  switch (unit) {
    case "ms":
      return n;
    case "s":
      return n * 1000;
    case "m":
      return n * 60 * 1000;
    case "h":
      return n * 60 * 60 * 1000;
    default:
      throw new Error(`非法时长单位: ${unit}`);
  }
}

export function validatePeriodNum(
  periodType: "month" | "year",
  n: number,
): void {
  if (periodType === "month" && (n < 1 || n > 9))
    throw new Error("period-num（月付）需为 1~9");
  if (periodType === "year" && (n < 1 || n > 3))
    throw new Error("period-num（年付）需为 1~3");
}