import { afterEach, describe, expect, it, vi } from "vitest";

import {
  printFlavorTable,
  printInstanceTable,
  validatePassword,
} from "../index.js";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  logSpy.mockClear();
});

function getOutput(): string {
  return logSpy.mock.calls
    .map((c) => c.map((x) => String(x)).join(" "))
    .join("\n");
}

describe("table rendering", () => {
  it("InstanceTable contains key fields", () => {
    printInstanceTable(
      [
        {
          id: "id-1",
          name: "prod-main-db",
          status: "normal",
          datastore: { type: "gaussdb-mysql", version: "8.0" },
        },
        {
          id: "id-2",
          name: "creating-db",
          status: "creating",
          datastore: { type: "gaussdb-mysql", version: "5.7" },
        },
      ],
      false,
    );
    const out = getOutput();
    for (const needle of [
      "实例列表",
      "prod-main-db",
      "creating-db",
      "gaussdb-mysql 8.0",
      "normal",
      "creating",
    ]) {
      expect(out).toContain(needle);
    }
  });

  it("FlavorTable contains key fields", () => {
    printFlavorTable([
      {
        spec_code: "gaussdb.mysql.large.x86.2",
        vcpus: "2",
        ram: "8",
        type: "x86",
      },
      {
        spec_code: "gaussdb.mysql.xlarge.x86.4",
        vcpus: "4",
        ram: "16",
        type: "x86",
      },
    ]);
    const out = getOutput();
    for (const needle of [
      "规格列表",
      "gaussdb.mysql.large.x86.2",
      "gaussdb.mysql.xlarge.x86.4",
      "vCPU",
      "内存",
    ]) {
      expect(out).toContain(needle);
    }
  });
});

describe("validatePassword", () => {
  it("accepts valid password", () => {
    expect(() => validatePassword("Abcdef12!")).not.toThrow();
  });

  it("rejects short password", () => {
    expect(() => validatePassword("Ab1!")).toThrow(/8~32/);
  });

  it("rejects weak categories", () => {
    expect(() => validatePassword("abcdefgh")).toThrow(/至少包含/);
    expect(() => validatePassword("ABCDEFGH")).toThrow(/至少包含/);
    expect(() => validatePassword("12345678")).toThrow(/至少包含/);
  });
});
