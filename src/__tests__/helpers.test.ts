import { describe, expect, it } from "vitest";

import { connectionCommand, fuzzyMatchCommand, isAzModeUnsupportedError, normalizeAzMode } from "../index.js";

describe("normalizeAzMode", () => {
  it("normalizes legal values", () => {
    expect(normalizeAzMode("")).toBe("auto");
    expect(normalizeAzMode("auto")).toBe("auto");
    expect(normalizeAzMode("single")).toBe("single");
    expect(normalizeAzMode("multi")).toBe("multi");
    expect(normalizeAzMode(" SINGLE ")).toBe("single");
  });

  it("rejects illegal values", () => {
    expect(() => normalizeAzMode("bad")).toThrow(/az-mode 仅支持/);
  });
});

describe("isAzModeUnsupportedError", () => {
  it("detects unsupported az mode error", () => {
    const err = new Error("API 错误 [DBS.05000085]: The availability zone mode is not supported: [single].");
    expect(isAzModeUnsupportedError(err)).toBe(true);
  });
});

describe("fuzzyMatchCommand", () => {
  it("exact match", () => {
    expect(fuzzyMatchCommand("/connect")).toBe("/connect");
  });
  it("prefix match", () => {
    expect(fuzzyMatchCommand("/inst")).toBe("/instance list");
  });
  it("case insensitive", () => {
    expect(fuzzyMatchCommand("/Con")).toBe("/connect");
  });
  it("unknown returns original", () => {
    expect(fuzzyMatchCommand("/not-found")).toBe("/not-found");
  });
});

describe("connectionCommand", () => {
  it("mysql default", () => {
    expect(connectionCommand("gaussdb-mysql", "10.0.0.1", 3306, "root")).toBe("mysql -h 10.0.0.1 -P 3306 -u root -p");
  });
  it("postgres", () => {
    expect(connectionCommand("PostgreSQL", "db.local", 5432, "admin")).toBe("psql -h db.local -p 5432 -U admin -d postgres");
  });
  it("missing host or port", () => {
    expect(connectionCommand("mysql", "-", 3306, "root")).toBe("");
    expect(connectionCommand("mysql", "10.0.0.1", 0, "root")).toBe("");
  });
});
