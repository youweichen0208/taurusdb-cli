import chalk from "chalk";
import { Command } from "commander";
import { loadProfile } from "../config/profile.js";
import {
  listInstances,
  showInstance,
  createInstance,
  waitInstanceReady,
  fetchInstanceMetrics,
} from "../api/index.js";
import { normalizeAzMode, validateInstanceCreateInput, parseDurationToMs } from "../validation/index.js";
import { printJSON, printYAML, printInstanceTable, printInstanceDetail } from "../output/index.js";
import { c } from "../output/chalk.js";
import type { OutputFormat, InstanceCreateInput } from "../types/index.js";
import type { RootOptions } from "./options.js";

export function registerInstanceCommands(program: Command): void {
  const instanceCmd = program.command("instance").description("管理数据库实例");

  instanceCmd
    .command("list")
    .description("列出所有实例")
    .option("--full-id", "显示完整实例 ID", false)
    .action(async function () {
      const opts = this.optsWithGlobals<RootOptions & { fullId: boolean }>();
      const cfg = await loadProfile(opts.profile);
      const instances = await listInstances(cfg);
      if (instances.length === 0) {
        console.log(c().yellow("  ⚠ 当前 project 下没有 GaussDB 实例"));
        return;
      }
      const out = (opts.output || "table").toLowerCase() as OutputFormat;
      if (out === "json") return printJSON(instances);
      if (out === "yaml") return printYAML(instances);
      printInstanceTable(instances, opts.fullId);
    });

  instanceCmd
    .command("show")
    .description("查看实例详情")
    .argument("<instance-id>", "实例 ID")
    .option(
      "--metrics <bool>",
      "是否展示 Cloud Eye(CES) 监控指标（默认开启；可用 --metrics=false 关闭）",
      "true",
    )
    .action(async function (instanceId: string) {
      const opts = this.optsWithGlobals<RootOptions & { metrics: string }>();
      const cfg = await loadProfile(opts.profile);
      const inst = await showInstance(cfg, instanceId);
      if (!inst) throw new Error(`实例 "${instanceId}" 不存在`);

      const metricsEnabled = !/^false$/i.test(opts.metrics ?? "true");
      const out = (opts.output || "table").toLowerCase() as OutputFormat;
      const source = (this as Command).getOptionValueSource?.("metrics");
      const metricsFlagChanged = source === "cli" || source === "env";
      const includeMetrics =
        metricsEnabled &&
        (metricsFlagChanged || (out !== "json" && out !== "yaml"));

      let metrics: import("../types/instance.js").InstanceMetrics | undefined;
      if (includeMetrics) {
        try {
          metrics = await fetchInstanceMetrics(cfg, inst);
        } catch (err) {
          console.log(
            `  ${c().yellow("⚠ 指标获取失败:")} ${(err as Error).message}`,
          );
        }
      }

      if (out === "json") {
        if (includeMetrics && metrics)
          return printJSON({ instance: inst, metrics });
        return printJSON(inst);
      }
      if (out === "yaml") {
        if (includeMetrics && metrics)
          return printYAML({ instance: inst, metrics });
        return printYAML(inst);
      }
      printInstanceDetail(inst, cfg.region ?? "-", metrics);
    });

  instanceCmd
    .command("create")
    .description("创建新实例")
    .requiredOption("--name <name>", "实例名称")
    .requiredOption("--password <password>", "root 密码")
    .requiredOption("--vpc-id <id>", "VPC ID")
    .requiredOption("--subnet-id <id>", "子网 ID")
    .option("--security-group-id <id>", "安全组 ID")
    .requiredOption("--flavor <code>", "规格编码")
    .option("--volume-size <size>", "存储大小(GB)")
    .option("--az-mode <mode>", "可用区模式: auto|single|multi", "auto")
    .option("--master-az <id>", "主可用区 ID")
    .option("--engine-version <ver>", "引擎版本号", "8.0")
    .option("--slave-count <n>", "只读节点个数", "1")
    .option("--backup-window <window>", "备份时间窗口", "08:00-09:00")
    .option("--charge-mode <mode>", "计费模式: postPaid|prePaid", "postPaid")
    .option("--period-type <type>", "包周期类型: month|year", "month")
    .option("--period-num <n>", "包周期时长", "1")
    .option("--auto-renew <bool>", "是否自动续订", "false")
    .option("--auto-pay <bool>", "是否自动支付", "true")
    .option("--wait", "创建后等待实例可用", false)
    .option("--timeout <duration>", "等待超时（支持: 900 / 15m / 1h）", "15m")
    .option(
      "--poll-interval <duration>",
      "轮询间隔（支持: 10 / 10s / 1m）",
      "10s",
    )
    .action(async function () {
      const opts = this.optsWithGlobals<RootOptions>();
      const f = this.opts<{
        name: string;
        password: string;
        vpcId: string;
        subnetId: string;
        securityGroupId?: string;
        flavor: string;
        volumeSize?: string;
        azMode: string;
        masterAz?: string;
        engineVersion: string;
        slaveCount: string;
        backupWindow: string;
        chargeMode: string;
        periodType: string;
        periodNum: string;
        autoRenew: string;
        autoPay: string;
        wait: boolean;
        timeout: string;
        pollInterval: string;
      }>();
      const createInput: InstanceCreateInput = {
        name: f.name,
        password: f.password,
        vpcId: f.vpcId,
        subnetId: f.subnetId,
        securityGroupId: f.securityGroupId,
        flavorRef: f.flavor,
        volumeSize: f.volumeSize ? Number(f.volumeSize) : undefined,
        azMode: normalizeAzMode(f.azMode),
        masterAz: f.masterAz,
        engineVersion: f.engineVersion,
        slaveCount: Number(f.slaveCount || "1"),
        backupWindow: f.backupWindow,
        chargeMode: f.chargeMode,
        periodType: f.periodType,
        periodNum: Number(f.periodNum || "1"),
        autoRenew: /^true$/i.test(f.autoRenew),
        autoPay: !/^false$/i.test(f.autoPay),
      };
      validateInstanceCreateInput(createInput);
      const cfg = await loadProfile(opts.profile);
      const created = await createInstance(cfg, createInput);
      if (!created.instance?.id) throw new Error("创建实例成功但未返回实例 ID");
      for (const w of created.warnings) {
        console.log(`  ${c().yellow(`⚠ ${w}`)}`);
      }
      console.log(`  ${c().green("✓ 创建请求已提交")}`);
      console.log(
        `  ${c().gray("Instance ID:")} ${c().cyan(created.instance.id)}`,
      );
      console.log(`  ${c().gray("az-mode:")} ${c().gray(created.usedAzMode)}`);
      if (created.job_id)
        console.log(`  ${c().gray("Job ID:")} ${c().gray(created.job_id)}`);

      const out = (opts.output || "table").toLowerCase() as OutputFormat;
      if (out === "json") return printJSON(created);
      if (out === "yaml") return printYAML(created);

      if (f.wait) {
        const timeoutMs = parseDurationToMs(f.timeout);
        const pollMs = parseDurationToMs(f.pollInterval);
        console.log(`  ${c().gray("等待实例就绪...")}`);
        const ready = await waitInstanceReady(
          cfg,
          created.instance.id,
          timeoutMs,
          pollMs,
        );
        console.log(
          `  ${c().green("✓ 实例已就绪:")} ${c().cyan(created.instance.id)}`,
        );
        console.log(`  ${c().gray("Status:")} ${c().gray(ready.status ?? "-")}`);
      } else {
        console.log(
          `  ${c().gray("提示: 可使用 taurusdb instance show <id> 查看创建进度")}`,
        );
      }
    });
}