export function parseChargeMode(v: string): "postPaid" | "prePaid" {
  const s = v.trim().toLowerCase();
  if (s === "prepaid" || s === "pre_paid") {
    return "prePaid";
  }
  if (v.trim() === "prePaid") return "prePaid";
  return "postPaid";
}

export function normalizeAzMode(v: string): "auto" | "single" | "multi" {
  const s = v.trim().toLowerCase();
  if (s === "" || s === "auto") return "auto";
  if (s === "single" || s === "multi") return s;
  throw new Error("az-mode 仅支持 auto|single|multi");
}

export function normalizePeriodType(v: string): "month" | "year" {
  const s = v.trim().toLowerCase();
  if (s === "month" || s === "year") return s;
  throw new Error("period-type 仅支持 month|year");
}