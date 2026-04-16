import { describe, expect, it } from "vitest";

import { buildCreateRequestBody, parseChargeMode, parseDurationToMs, validateInstanceCreateInput } from "../index.js";

describe("instance create helpers", () => {
  it("parseChargeMode supports aliases", () => {
    expect(parseChargeMode("prePaid")).toBe("prePaid");
    expect(parseChargeMode("prepaid")).toBe("prePaid");
    expect(parseChargeMode("pre_paid")).toBe("prePaid");
    expect(parseChargeMode("postPaid")).toBe("postPaid");
    expect(parseChargeMode("")).toBe("postPaid");
  });

  it("parseDurationToMs supports plain seconds and units", () => {
    expect(parseDurationToMs("10")).toBe(10_000);
    expect(parseDurationToMs("10s")).toBe(10_000);
    expect(parseDurationToMs("15m")).toBe(900_000);
    expect(parseDurationToMs("1h")).toBe(3_600_000);
    expect(parseDurationToMs("500ms")).toBe(500);
    expect(() => parseDurationToMs("bad")).toThrow(/非法时长格式/);
  });

  it("buildCreateRequestBody ignores volume-size for postPaid with warning", () => {
    const { body, warnings, mode } = buildCreateRequestBody(
      { region: "cn-north-4" },
      {
        name: "prod",
        password: "Abcdef12!",
        vpcId: "vpc-1",
        subnetId: "subnet-1",
        flavorRef: "gaussdb.mysql.xlarge.arm.4",
        volumeSize: 200,
        azMode: "auto",
        engineVersion: "8.0",
        slaveCount: 1,
        backupWindow: "08:00-09:00",
        chargeMode: "postPaid",
        periodType: "month",
        periodNum: 1,
        autoRenew: false,
        autoPay: true
      }
    );
    expect(mode).toBe("postPaid");
    expect(body.volume).toBeUndefined();
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("按需(postPaid)");
  });

  it("validateInstanceCreateInput rejects invalid prePaid period", () => {
    expect(() =>
      validateInstanceCreateInput({
        name: "prod",
        password: "Abcdef12!",
        vpcId: "vpc-1",
        subnetId: "subnet-1",
        flavorRef: "gaussdb.mysql.xlarge.arm.4",
        volumeSize: 200,
        azMode: "single",
        engineVersion: "8.0",
        slaveCount: 1,
        backupWindow: "08:00-09:00",
        chargeMode: "prePaid",
        periodType: "month",
        periodNum: 10,
        autoRenew: false,
        autoPay: true
      })
    ).toThrow(/period-num/);
  });
});
