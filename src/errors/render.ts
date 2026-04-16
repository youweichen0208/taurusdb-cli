import { errorMap } from "../constants/errors.js";

export function renderApiError(code?: string, message?: string): Error {
  if (code && errorMap[code]) {
    const t = errorMap[code];
    return new Error(t.hint ? `${t.friendly}\n  建议: ${t.hint}` : t.friendly);
  }
  if (code) return new Error(`API 错误 [${code}]: ${message ?? ""}`);
  return new Error(message ?? "未知 API 错误");
}