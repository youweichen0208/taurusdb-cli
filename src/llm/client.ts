import { sleep } from "../http/utils.js";
import type { LLMConfig } from "../types/config.js";

export class LLMClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private timeoutMs: number;
  private extraHeaders: Record<string, string>;

  constructor(cfg: LLMConfig) {
    this.baseUrl = (cfg.base_url ?? "").trim().replace(/\/+$/, "");
    this.apiKey = (cfg.api_key ?? "").trim();
    this.model = (cfg.model ?? "").trim();
    this.timeoutMs = cfg.timeout_ms ?? 30000;
    this.extraHeaders = cfg.extra_headers ?? {};
    if (!this.baseUrl || !this.model) {
      throw new Error("LLM 配置不完整: 缺少 base_url 或 model");
    }
  }

  private joinURL(path: string): string {
    return `${this.baseUrl}${path.startsWith("/") ? path : "/" + path}`;
  }

  private stripMeta(content: string): string {
    return content
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<analysis>[\s\S]*?<\/analysis>/gi, "")
      .trim();
  }

  private async chatCompletions(
    system: string,
    user: string,
  ): Promise<{ content: string; raw: string }> {
    const endpoint = this.joinURL("/chat/completions");
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
    };
    const maxAttempts = 3;
    let lastError: Error | undefined;
    let lastRaw = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...this.extraHeaders,
        };
        if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
        const resp = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const raw = await resp.text();
        lastRaw = raw;
        if (!resp.ok) {
          const err = new Error(
            `LLM 请求失败: ${resp.status} ${resp.statusText}`,
          );
          if (
            [429, 500, 502, 503, 504, 529].includes(resp.status) &&
            attempt < maxAttempts
          ) {
            await sleep(300 * 2 ** (attempt - 1));
            continue;
          }
          throw err;
        }
        const parsed = JSON.parse(raw) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = this.stripMeta(
          parsed.choices?.[0]?.message?.content ?? "",
        );
        return { content, raw };
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxAttempts) {
          await sleep(300 * 2 ** (attempt - 1));
          continue;
        }
      } finally {
        clearTimeout(t);
      }
    }
    throw new Error(
      lastError
        ? `${lastError.message}${lastRaw ? `\nraw=${lastRaw}` : ""}`
        : "LLM 请求失败",
    );
  }

  async ping(): Promise<{ content: string; raw: string }> {
    return this.chatCompletions("只回复 OK，不要输出其他内容。", "ping");
  }

  async chat(userText: string): Promise<{ content: string; raw: string }> {
    const system =
      "你是 TaurusDB CLI 的对话助手。用简洁中文回答；不要输出 JSON；不要输出 <think>/<analysis>。\n" +
      "如果用户问 CLI 命令，只推荐本 CLI 已支持命令。";
    return this.chatCompletions(system, userText);
  }

  async suggestCommand(
    userText: string,
    allowed: string[],
  ): Promise<{
    command: string;
    explain?: string;
    confidence?: number;
    raw: string;
  }> {
    const lines = [
      "你是 TaurusDB CLI 的命令助手。把自然语言转换成可执行命令。",
      '严格只输出 JSON，格式: {"command":"...","explain":"...","confidence":0.0}',
      "command 必须是不带前导斜杠的命令。",
      "只允许以下命令形态：",
      ...allowed.map((v) => `- ${v}`),
      "若信息不足，command 为空字符串，并在 explain 写缺少信息。",
    ];
    const { content, raw } = await this.chatCompletions(
      lines.join("\n"),
      userText,
    );
    const candidates = [
      content,
      content
        .replace(/^```json/i, "")
        .replace(/```$/i, "")
        .trim(),
    ];
    for (const can of candidates) {
      try {
        const out = JSON.parse(can) as {
          command?: string;
          explain?: string;
          confidence?: number;
        };
        return {
          command: (out.command ?? "").trim(),
          explain: out.explain?.trim(),
          confidence: out.confidence,
          raw,
        };
      } catch {
        continue;
      }
    }
    throw new Error(`模型输出不是 JSON: ${content}`);
  }
}