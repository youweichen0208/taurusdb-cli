import { signRequest } from "./signing.js";
import { endpointFor } from "./endpoints.js";
import { sleep } from "./utils.js";
import { renderApiError } from "../errors/render.js";
import type { TaurusConfig, HttpClient, ApiError } from "../types/index.js";

export function makeClient(cfg: TaurusConfig): HttpClient {
  const ak = cfg.ak?.trim();
  const sk = cfg.sk?.trim();
  const region = cfg.region?.trim();
  if (!ak || !sk || !region || !cfg.project_id?.trim()) {
    throw new Error("配置不完整，请先运行: taurusdb configure");
  }

  return {
    async request<T>(
      service: "gaussdb" | "vpc" | "ces",
      method: string,
      apiPath: string,
      query?: Record<string, string>,
      body?: unknown,
    ): Promise<T> {
      const endpoint = endpointFor(service, region);
      const u = new URL(apiPath, endpoint);
      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v !== "") u.searchParams.set(k, v);
        }
      }

      const bodyStr = body ? JSON.stringify(body) : "";
      const signed = signRequest(
        {
          method,
          url: u.toString(),
          headers: {
            "content-type": "application/json",
          },
          body: bodyStr,
        },
        ak,
        sk,
      );

      const maxAttempts = 3;
      let lastErr: Error | undefined;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const resp = await fetch(signed.url, {
            method: signed.method,
            headers: signed.headers,
            body:
              method.toUpperCase() === "GET" ||
              method.toUpperCase() === "DELETE"
                ? undefined
                : bodyStr,
          });
          const text = await resp.text();
          if (!resp.ok) {
            let parsed: ApiError | undefined;
            try {
              parsed = text ? (JSON.parse(text) as ApiError) : undefined;
            } catch {
              parsed = undefined;
            }
            const err = renderApiError(
              parsed?.error_code,
              parsed?.error_msg || text || `HTTP ${resp.status}`,
            );
            if (
              [429, 500, 502, 503, 504].includes(resp.status) &&
              attempt < maxAttempts
            ) {
              await sleep(300 * 2 ** (attempt - 1));
              continue;
            }
            throw err;
          }
          if (!text) return {} as T;
          return JSON.parse(text) as T;
        } catch (err) {
          lastErr = err as Error;
          if (attempt < maxAttempts) {
            await sleep(300 * 2 ** (attempt - 1));
            continue;
          }
        }
      }
      throw lastErr ?? new Error("请求失败");
    },
  };
}