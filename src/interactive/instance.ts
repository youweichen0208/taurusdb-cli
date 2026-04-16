import prompts from "prompts";
import { loadProfile } from "../config/profile.js";
import {
  listInstances,
  listFlavors,
  listVpcs,
  listSubnets,
  listSecurityGroups,
  createInstance,
} from "../api/index.js";
import {
  normalizeAzMode,
  validatePassword,
  validateInstanceCreateInput,
} from "../validation/index.js";
import { printFlavorTable } from "../output/tables.js";
import { c } from "./banner.js";
import type { TaurusConfig, InstanceCreateInput, Flavor } from "../types/index.js";

export async function runInteractiveInstanceCreate(
  profile: string,
): Promise<void> {
  const cfg = await loadProfile(profile);
  const now = new Date();
  const defaultName = `gaussdb-mysql-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(
    now.getHours(),
  ).padStart(
    2,
    "0",
  )}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;

  const base = await prompts([
    {
      type: "text",
      name: "name",
      message: "实例名称:",
      initial: defaultName,
      validate: (v: string) => (v.trim() ? true : "实例名称不能为空"),
    },
    {
      type: "text",
      name: "engineVersion",
      message: "引擎版本:",
      initial: "8.0",
    },
    {
      type: "select",
      name: "azMode",
      message: "可用区模式:",
      choices: [
        { title: "auto", value: "auto" },
        { title: "single", value: "single" },
        { title: "multi", value: "multi" },
      ],
      initial: 0,
    },
  ]);
  if (!base.name || !base.azMode) return;

  const mode = normalizeAzMode(base.azMode);
  const tryModes: Array<"auto" | "single" | "multi"> =
    mode === "auto" ? ["single", "multi"] : [mode];
  let flavors: Flavor[] = [];
  let usedMode: "auto" | "single" | "multi" = mode;
  let flavorErr: Error | undefined;
  for (const m of tryModes) {
    try {
      flavors = await listFlavors(
        cfg,
        "gaussdb-mysql",
        m,
        base.engineVersion,
        "",
      );
      usedMode = m;
      break;
    } catch (err) {
      flavorErr = err as Error;
    }
  }
  if (flavors.length === 0) throw flavorErr ?? new Error("未查询到可用规格");
  if (mode === "auto") {
    console.log(`  ${c().gray(`已自动选择 az-mode: ${usedMode}`)}`);
  }

  const flavorPick = await prompts({
    type: "select",
    name: "idx",
    message: "选择规格:",
    choices: flavors.slice(0, 30).map((x, i) => ({
      title: `${x.spec_code}  vCPU=${x.vcpus ?? "-"} RAM=${x.ram ?? "-"} ${x.type ?? ""}`,
      value: i,
    })),
  });
  if (typeof flavorPick.idx !== "number") return;
  const selectedFlavor = flavors[flavorPick.idx];

  const billing = await prompts({
    type: "select",
    name: "chargeMode",
    message: "计费模式:",
    choices: [
      { title: "postPaid (按需)", value: "postPaid" },
      { title: "prePaid (包周期)", value: "prePaid" },
    ],
    initial: 0,
  });
  if (!billing.chargeMode) return;

  let periodType = "month";
  let periodNum = 1;
  let volumeSize: number | undefined = undefined;
  let autoRenew = false;
  let autoPay = true;

  if (billing.chargeMode === "prePaid") {
    const prepaid = await prompts([
      {
        type: "select",
        name: "periodType",
        message: "包周期类型:",
        choices: [
          { title: "month", value: "month" },
          { title: "year", value: "year" },
        ],
        initial: 0,
      },
      {
        type: "number",
        name: "periodNum",
        message: "包周期时长:",
        initial: 1,
        validate: (n: number) =>
          Number.isFinite(n) && n > 0 ? true : "请输入正整数",
      },
      {
        type: "number",
        name: "volumeSize",
        message: "存储大小(GB):",
        initial: 200,
        validate: (n: number) =>
          Number.isFinite(n) && n >= 10 && n % 10 === 0
            ? true
            : "需 >=10 且为 10 的倍数",
      },
      {
        type: "toggle",
        name: "autoPay",
        message: "自动支付",
        initial: true,
        active: "是",
        inactive: "否",
      },
      {
        type: "toggle",
        name: "autoRenew",
        message: "自动续订",
        initial: false,
        active: "是",
        inactive: "否",
      },
    ]);
    if (!prepaid.periodType || !prepaid.periodNum || !prepaid.volumeSize)
      return;
    periodType = prepaid.periodType;
    periodNum = Number(prepaid.periodNum);
    volumeSize = Number(prepaid.volumeSize);
    autoPay = Boolean(prepaid.autoPay);
    autoRenew = Boolean(prepaid.autoRenew);
  }

  const networkMode = await prompts({
    type: "select",
    name: "mode",
    message: "网络配置方式:",
    choices: [
      { title: "从列表选择", value: "pick" },
      { title: "手动输入", value: "manual" },
    ],
    initial: 0,
  });
  if (!networkMode.mode) return;

  let vpcId = "";
  let subnetId = "";
  let securityGroupId = "";

  if (networkMode.mode === "pick") {
    try {
      const vpcs = await listVpcs(cfg);
      if (vpcs.length > 0) {
        const pickedVpc = await prompts({
          type: "select",
          name: "idx",
          message: "选择 VPC:",
          choices: vpcs.slice(0, 30).map((v, i) => ({
            title:
              `${v.name ?? "-"} (${v.cidr ?? "-"}) ${v.status ?? ""}`.trim(),
            value: i,
          })),
        });
        if (typeof pickedVpc.idx === "number") {
          vpcId = vpcs[pickedVpc.idx].id;
        }
      }
      if (vpcId) {
        const subnets = await listSubnets(cfg, vpcId);
        if (subnets.length > 0) {
          const pickedSubnet = await prompts({
            type: "select",
            name: "idx",
            message: "选择子网:",
            choices: subnets.slice(0, 30).map((s, i) => ({
              title: `${s.name ?? "-"} (${s.cidr ?? "-"}) az=${s.availability_zone ?? "-"}`,
              value: i,
            })),
          });
          if (typeof pickedSubnet.idx === "number") {
            subnetId = subnets[pickedSubnet.idx].id;
          }
        }
      }
      if (vpcId) {
        const groups = await listSecurityGroups(cfg, vpcId);
        if (groups.length > 0) {
          const pickedSg = await prompts({
            type: "select",
            name: "idx",
            message: "选择安全组（可选）:",
            choices: [{ title: "(跳过)", value: -1 }].concat(
              groups.slice(0, 30).map((g, i) => ({
                title: `${g.name ?? "-"} (${g.id})`,
                value: i,
              })),
            ),
          });
          if (typeof pickedSg.idx === "number" && pickedSg.idx >= 0) {
            securityGroupId = groups[pickedSg.idx].id;
          }
        }
      }
    } catch (err) {
      console.log(
        `  ${c().yellow("⚠ 网络资源查询失败，将切换到手动输入:")} ${(err as Error).message}`,
      );
    }
  }

  if (!vpcId || !subnetId) {
    const manual = await prompts([
      {
        type: "text",
        name: "vpcId",
        message: "VPC ID:",
        initial: vpcId,
        validate: (v: string) => (v.trim() ? true : "VPC ID 不能为空"),
      },
      {
        type: "text",
        name: "subnetId",
        message: "子网 ID:",
        initial: subnetId,
        validate: (v: string) => (v.trim() ? true : "子网 ID 不能为空"),
      },
      {
        type: "text",
        name: "securityGroupId",
        message: "安全组 ID（可选）:",
        initial: securityGroupId,
      },
    ]);
    if (!manual.vpcId || !manual.subnetId) return;
    vpcId = manual.vpcId.trim();
    subnetId = manual.subnetId.trim();
    securityGroupId = (manual.securityGroupId ?? "").trim();
  }

  const passwordAns = await prompts({
    type: "password",
    name: "password",
    message: "root 密码:",
    validate: (v: string) => {
      try {
        validatePassword(v);
        return true;
      } catch (err) {
        return (err as Error).message;
      }
    },
  });
  if (!passwordAns.password) return;

  const createInput: InstanceCreateInput = {
    name: base.name.trim(),
    password: passwordAns.password,
    vpcId,
    subnetId,
    securityGroupId: securityGroupId || undefined,
    flavorRef: selectedFlavor.spec_code,
    volumeSize,
    azMode: usedMode,
    engineVersion: (base.engineVersion ?? "8.0").trim() || "8.0",
    slaveCount: 1,
    backupWindow: "08:00-09:00",
    chargeMode: billing.chargeMode,
    periodType,
    periodNum,
    autoRenew,
    autoPay,
  };

  validateInstanceCreateInput(createInput);
  const confirm = await prompts({
    type: "confirm",
    name: "ok",
    message: `确认创建实例 ${createInput.name} ?`,
    initial: false,
  });
  if (!confirm.ok) {
    console.log(c().gray("已取消"));
    return;
  }

  const created = await createInstance(cfg, createInput);
  if (!created.instance?.id) throw new Error("创建实例成功但未返回实例 ID");
  for (const w of created.warnings) {
    console.log(`  ${c().yellow(`⚠ ${w}`)}`);
  }
  console.log(`  ${c().green("✓ 创建请求已提交")}`);
  console.log(`  ${c().gray("Instance ID:")} ${c().cyan(created.instance.id)}`);
  console.log(`  ${c().gray("az-mode:")} ${c().gray(created.usedAzMode)}`);
  if (created.job_id) {
    console.log(`  ${c().gray("Job ID:")} ${c().gray(created.job_id)}`);
  }
  console.log(
    `  ${c().gray("提示: 可使用 taurusdb instance show <id> 查看创建进度")}`,
  );
}

export async function runInteractiveInstanceListAndShow(
  profile: string,
  dispatch: (cmd: string) => Promise<void>,
): Promise<void> {
  const cfg = await loadProfile(profile);
  const instances = await listInstances(cfg);
  if (instances.length === 0) {
    console.log(c().yellow("  ⚠ 当前 project 下没有 GaussDB 实例"));
    return;
  }

  if (instances.length === 1) {
    const only = instances[0];
    console.log(
      `  ${c().gray("仅发现 1 个实例，自动打开详情:")} ${c().cyan(only.id)}`,
    );
    await dispatch(`instance show ${only.id}`);
    return;
  }

  const abnormal = instances.filter((it) => {
    const s = (it.status ?? "").trim().toLowerCase();
    return ["abnormal", "createfail", "failed", "error"].includes(s);
  });
  if (abnormal.length > 0) {
    const sample = abnormal
      .slice(0, 3)
      .map((x) => x.id)
      .join(", ");
    console.log(
      `  ${c().redBright(`⚠ 发现 ${abnormal.length} 个异常实例，建议优先查看详情`)}`,
    );
    console.log(
      `  ${c().gray(`建议: 使用 /instance show <id> 查看详情（例如 ${sample}）`)}`,
    );
  }

  const picked = await prompts({
    type: "select",
    name: "idx",
    message: "选择一个实例查看详情:",
    choices: instances.map((it, i) => ({
      title:
        `${it.name ?? "-"}  [${it.status ?? "-"}]  ${it.datastore?.type ?? "-"} ${it.datastore?.version ?? ""}`.trim(),
      description: it.id,
      value: i,
    })),
  });
  if (typeof picked.idx !== "number") return;
  const instanceId = instances[picked.idx].id;
  await dispatch(`instance show ${instanceId}`);
}