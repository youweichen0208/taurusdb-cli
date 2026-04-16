import { afterEach, describe, expect, it, vi } from "vitest";

import { printJSON, printYAML, renderApiError } from "../index.js";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  logSpy.mockClear();
});

describe("render output", () => {
  it("JSON", async () => {
    await printJSON({ name: "taurus" });
    const out = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(out).toContain('"name": "taurus"');
  });

  it("YAML", async () => {
    await printYAML({ name: "taurus" });
    const out = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(out).toContain("name: taurus");
  });
});

describe("api error translation", () => {
  it("known code has friendly message", () => {
    const err = renderApiError("APIGW.0301", "auth failed");
    expect(err.message).toContain("AK/SK 认证失败");
  });

  it("unknown code keeps raw info", () => {
    const err = renderApiError("UNKNOWN", "raw message");
    expect(err.message).toContain("API 错误 [UNKNOWN]: raw message");
  });
});
