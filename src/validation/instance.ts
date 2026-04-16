import { parseChargeMode, normalizeAzMode, normalizePeriodType } from "./normalize.js";
import { validatePeriodNum } from "./duration.js";
import { validatePassword } from "./password.js";
import type { InstanceCreateInput, TaurusConfig } from "../types/index.js";

export function validateInstanceCreateInput(
  inputParams: InstanceCreateInput,
): void {
  const missing: string[] = [];
  if (!inputParams.name.trim()) missing.push("--name");
  if (!inputParams.password.trim()) missing.push("--password");
  if (!inputParams.vpcId.trim()) missing.push("--vpc-id");
  if (!inputParams.subnetId.trim()) missing.push("--subnet-id");
  if (!inputParams.flavorRef.trim()) missing.push("--flavor");
  if (missing.length > 0) {
    throw new Error(`缺少必填参数: ${missing.join(", ")}`);
  }
  validatePassword(inputParams.password);
  normalizeAzMode(inputParams.azMode);
  const mode = parseChargeMode(inputParams.chargeMode);
  if (mode === "prePaid") {
    const pType = normalizePeriodType(inputParams.periodType);
    validatePeriodNum(pType, inputParams.periodNum);
    if (!inputParams.volumeSize || inputParams.volumeSize <= 0) {
      throw new Error("缺少必填参数: --volume-size（包周期 prePaid 时需要）");
    }
  }
}

export function buildCreateRequestBody(
  cfg: TaurusConfig,
  inputParams: InstanceCreateInput,
): {
  body: Record<string, unknown>;
  mode: "postPaid" | "prePaid";
  warnings: string[];
} {
  const mode = parseChargeMode(inputParams.chargeMode);
  const warnings: string[] = [];
  const body: Record<string, unknown> = {
    charge_info: {
      charge_mode: mode,
    },
    region: cfg.region,
    name: inputParams.name.trim(),
    datastore: {
      type: "gaussdb-mysql",
      version: inputParams.engineVersion.trim(),
    },
    mode: "Cluster",
    flavor_ref: inputParams.flavorRef.trim(),
    vpc_id: inputParams.vpcId.trim(),
    subnet_id: inputParams.subnetId.trim(),
    password: inputParams.password,
    backup_strategy: {
      start_time: inputParams.backupWindow.trim(),
    },
    availability_zone_mode: "multi",
    slave_count: inputParams.slaveCount,
  };
  if (inputParams.securityGroupId?.trim())
    body.security_group_id = inputParams.securityGroupId.trim();
  if (inputParams.masterAz?.trim())
    body.master_availability_zone = inputParams.masterAz.trim();

  if (mode === "prePaid") {
    const pType = normalizePeriodType(inputParams.periodType);
    validatePeriodNum(pType, inputParams.periodNum);
    if (!inputParams.volumeSize || inputParams.volumeSize <= 0) {
      throw new Error("缺少必填参数: --volume-size（包周期 prePaid 时需要）");
    }
    (body.charge_info as Record<string, unknown>).period_type = pType;
    (body.charge_info as Record<string, unknown>).period_num =
      inputParams.periodNum;
    (body.charge_info as Record<string, unknown>).is_auto_renew = String(
      inputParams.autoRenew,
    );
    (body.charge_info as Record<string, unknown>).is_auto_pay = String(
      inputParams.autoPay,
    );
    body.volume = { size: String(inputParams.volumeSize) };
  } else if (inputParams.volumeSize && inputParams.volumeSize > 0) {
    warnings.push(
      `按需(postPaid)实例不支持指定存储大小，已忽略 --volume-size=${inputParams.volumeSize}`,
    );
  }

  return { body, mode, warnings };
}