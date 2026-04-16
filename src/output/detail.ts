import { c, statusColored } from "./chalk.js";
import { connectionCommand } from "./connection.js";
import type { Instance, InstanceMetrics } from "../types/index.js";

export function printInstanceDetail(
  inst: Instance,
  region: string,
  metrics?: InstanceMetrics,
): void {
  console.log("");
  console.log(c().bold("  实例详情"));
  console.log(
    "  ═══════════════════════════════════════════════════════════════════════════",
  );
  console.log(`  ${c().gray("ID:")}         ${c().cyan(inst.id)}`);
  console.log(`  ${c().gray("名称:")}       ${c().bold(inst.name ?? "-")}`);
  console.log(`  ${c().gray("状态:")}       ${statusColored(inst.status)}`);
  console.log(
    `  ${c().gray("引擎:")}       ${inst.datastore?.type ?? "-"} ${inst.datastore?.version ?? ""} ${inst.datastore?.kernel_version ?? ""}`.trim(),
  );
  console.log(`  ${c().gray("节点数:")}     ${inst.node_count ?? "-"}`);
  console.log(`  ${c().gray("AZ模式:")}     ${inst.az_mode ?? "-"}`);
  console.log(`  ${c().gray("主AZ:")}       ${inst.master_az_code ?? "-"}`);
  console.log(`  ${c().gray("Region:")}     ${region}`);
  console.log(
    "  ───────────────────────────────────────────────────────────────────────────",
  );
  console.log(`  ${c().gray("VPC:")}        ${inst.vpc_id ?? "-"}`);
  console.log(`  ${c().gray("子网:")}       ${inst.subnet_id ?? "-"}`);
  console.log(`  ${c().gray("安全组:")}     ${inst.security_group_id ?? "-"}`);
  console.log(
    "  ───────────────────────────────────────────────────────────────────────────",
  );
  const writeIp = inst.private_write_ips?.[0] ?? "-";
  const port = Number(inst.port ?? 3306);
  const cmd = connectionCommand(
    inst.datastore?.type ?? "gaussdb-mysql",
    writeIp,
    port,
    inst.db_user_name ?? "root",
  );
  if (cmd) {
    console.log(`  ${c().gray("连接命令:")}   ${c().cyan(cmd)}`);
  } else {
    console.log(
      `  ${c().gray("连接命令:")}   ${c().yellow("无法生成连接命令（缺少 IP/端口）")}`,
    );
  }
  console.log(
    `  ${c().gray("私网IP:")}     ${inst.private_write_ips?.join(", ") ?? "-"}`,
  );
  console.log(`  ${c().gray("公网IP:")}     ${inst.public_ips ?? "-"}`);
  console.log(`  ${c().gray("端口:")}       ${inst.port ?? "-"}`);
  console.log(
    `  ${c().gray("私网DNS:")}    ${inst.private_dns_names?.join(", ") ?? "-"}`,
  );

  if (metrics) {
    console.log(
      "  ───────────────────────────────────────────────────────────────────────────",
    );
    console.log(c().bold("  监控指标 (最近 1 小时)"));
    console.log(
      `  ${c().gray("CPU:")}        ${metrics.cpu_util_pct ? `${metrics.cpu_util_pct.value.toFixed(1)}%` : "-"}`,
    );
    console.log(
      `  ${c().gray("Memory:")}     ${metrics.mem_util_pct ? `${metrics.mem_util_pct.value.toFixed(1)}%` : "-"}`,
    );
    console.log(
      `  ${c().gray("Slow SQL:")}   ${metrics.slow_queries ? String(metrics.slow_queries.value) : "-"}`,
    );
    console.log(
      `  ${c().gray("Connections:")} ${metrics.conn_count ? String(metrics.conn_count.value) : "-"}`,
    );
  }

  console.log(
    "  ═══════════════════════════════════════════════════════════════════════════",
  );
  console.log("");
}