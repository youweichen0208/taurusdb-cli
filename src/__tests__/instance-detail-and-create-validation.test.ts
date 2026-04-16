import { afterEach, describe, expect, it, vi } from "vitest";

import { printInstanceDetail, validateInstanceCreateInput } from "../index.js";

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => {
  logSpy.mockClear();
});

function out(): string {
  return logSpy.mock.calls.map((c) => c.map((x) => String(x)).join(" ")).join("\n");
}

describe("instance detail rendering", () => {
  it("contains connection command and metrics section", () => {
    printInstanceDetail(
      {
        id: "i-abc123",
        name: "prod-db",
        status: "normal",
        datastore: { type: "gaussdb-mysql", version: "8.0" },
        node_count: 2,
        private_write_ips: ["10.0.0.8"],
        port: "3306",
        nodes: [{ id: "node-master-1", type: "master", vcpus: "4", ram: "16" }]
      },
      "cn-north-4",
      {
        cpu_util_pct: { value: 42.5, unit: "%", timestamp_ms: Date.now() },
        mem_util_pct: { value: 55.1, unit: "%", timestamp_ms: Date.now() },
        slow_queries: { value: 3, unit: "Count", timestamp_ms: Date.now() },
        conn_count: { value: 17, unit: "Count", timestamp_ms: Date.now() }
      }
    );
    const text = out();
    expect(text).toContain("实例详情");
    expect(text).toContain("mysql -h 10.0.0.8 -P 3306 -u root -p");
    expect(text).toContain("监控指标");
    expect(text).toContain("CPU");
    expect(text).toContain("Memory");
    expect(text).toContain("Slow SQL");
    expect(text).toContain("Connections");
  });

  it("shows missing command hint when host/port unavailable", () => {
    printInstanceDetail(
      {
        id: "i-no-host",
        status: "normal",
        datastore: { type: "gaussdb-mysql", version: "8.0" }
      },
      "cn-north-4"
    );
    expect(out()).toContain("无法生成连接命令（缺少 IP/端口）");
  });
});

describe("instance create input validation", () => {
  it("rejects missing required flags", () => {
    expect(() =>
      validateInstanceCreateInput({
        name: "",
        password: "",
        vpcId: "",
        subnetId: "",
        flavorRef: "",
        azMode: "auto",
        engineVersion: "8.0",
        slaveCount: 1,
        backupWindow: "08:00-09:00",
        chargeMode: "postPaid",
        periodType: "month",
        periodNum: 1,
        autoRenew: false,
        autoPay: true
      })
    ).toThrow(/缺少必填参数/);
  });

  it("rejects prePaid without volume-size", () => {
    expect(() =>
      validateInstanceCreateInput({
        name: "prod",
        password: "Abcdef12!",
        vpcId: "vpc-1",
        subnetId: "subnet-1",
        flavorRef: "gaussdb.mysql.xlarge.arm.4",
        azMode: "multi",
        engineVersion: "8.0",
        slaveCount: 1,
        backupWindow: "08:00-09:00",
        chargeMode: "prePaid",
        periodType: "month",
        periodNum: 1,
        autoRenew: false,
        autoPay: true
      })
    ).toThrow(/--volume-size/);
  });

  it("accepts valid postPaid input", () => {
    expect(() =>
      validateInstanceCreateInput({
        name: "prod",
        password: "Abcdef12!",
        vpcId: "vpc-1",
        subnetId: "subnet-1",
        flavorRef: "gaussdb.mysql.xlarge.arm.4",
        azMode: "auto",
        engineVersion: "8.0",
        slaveCount: 1,
        backupWindow: "08:00-09:00",
        chargeMode: "postPaid",
        periodType: "month",
        periodNum: 1,
        autoRenew: false,
        autoPay: true
      })
    ).not.toThrow();
  });
});
