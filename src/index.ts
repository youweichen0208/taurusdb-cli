import { createHmac, createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as outputStream } from "node:process";

import chalk from "chalk";
import { Command } from "commander";
import yaml from "js-yaml";
import prompts from "prompts";

type OutputFormat = "table" | "json" | "yaml";

type LLMConfig = {
  base_url?: string;
  api_key?: string;
  model?: string;
  timeout_ms?: number;
  extra_headers?: Record<string, string>;
};

type TaurusConfig = {
  ak?: string;
  sk?: string;
  region?: string;
  project_id?: string;
  llm?: LLMConfig;
};

type RootOptions = {
  profile: string;
  output: OutputFormat;
  noColor: boolean;
};

export type InstanceCreateInput = {
  name: string;
  password: string;
  vpcId: string;
  subnetId: string;
  securityGroupId?: string;
  flavorRef: string;
  volumeSize?: number;
  azMode: "auto" | "single" | "multi";
  masterAz?: string;
  engineVersion: string;
  slaveCount: number;
  backupWindow: string;
  chargeMode: string;
  periodType: string;
  periodNum: number;
  autoRenew: boolean;
  autoPay: boolean;
};

const VERSION = "dev";
const COMMIT = "";
const BUILT_AT = "";

const CONFIG_DIR = ".taurusdb";
const CONFIG_FILE = "config.yaml";
const ENV_AK = "HW_AK";
const ENV_SK = "HW_SK";
const ENV_REGION = "HW_REGION";
const ENV_PROJECT_ID = "HW_PROJECT_ID";
const ENV_LLM_BASE_URL = "TAURUSDB_LLM_BASE_URL";
const ENV_LLM_API_KEY = "TAURUSDB_LLM_API_KEY";
const ENV_LLM_MODEL = "TAURUSDB_LLM_MODEL";

const regions = [
  "cn-north-4  (北京四)",
  "cn-east-3   (上海一)",
  "cn-south-1  (广州)",
  "cn-north-1  (北京一)",
  "ap-southeast-1 (香港)"
] as const;

const regionCodes: Record<string, string> = {
  "cn-north-4  (北京四)": "cn-north-4",
  "cn-east-3   (上海一)": "cn-east-3",
  "cn-south-1  (广州)": "cn-south-1",
  "cn-north-1  (北京一)": "cn-north-1",
  "ap-southeast-1 (香港)": "ap-southeast-1"
};

function c() {
  return chalk;
}

export function stripWrappingQuotes(s: string): string {
  let out = s.trim();
  while (out.length >= 2) {
    if ((out.startsWith("\"") && out.endsWith("\"")) || (out.startsWith("'") && out.endsWith("'"))) {
      out = out.slice(1, -1).trim();
      continue;
    }
    break;
  }
  return out;
}

function configDir(): string {
  return path.join(os.homedir(), CONFIG_DIR);
}

function configFilePath(): string {
  return path.join(configDir(), CONFIG_FILE);
}

export async function loadAllProfiles(): Promise<Record<string, TaurusConfig>> {
  const filePath = configFilePath();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("配置文件不存在，请先运行: taurusdb configure");
    }
    throw new Error(`读取配置文件失败: ${(err as Error).message}`);
  }
  const parsed = (yaml.load(raw) ?? {}) as Record<string, TaurusConfig>;
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("解析配置文件失败: 格式不正确");
  }
  return parsed;
}

export async function saveProfile(cfg: TaurusConfig, profile: string): Promise<void> {
  const dir = configDir();
  await fs.mkdir(dir, { mode: 0o700, recursive: true });
  const filePath = configFilePath();

  let all: Record<string, TaurusConfig> = {};
  try {
    const existing = await fs.readFile(filePath, "utf8");
    const parsed = yaml.load(existing);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      all = parsed as Record<string, TaurusConfig>;
    }
  } catch {
    all = {};
  }

  all[profile] = cfg;
  const dumped = yaml.dump(all);
  await fs.writeFile(filePath, dumped, { mode: 0o600 });
  await fs.chmod(filePath, 0o600);
}

export async function loadProfile(profile: string): Promise<TaurusConfig> {
  const all = await loadAllProfiles();
  const cfg = all[profile];
  if (!cfg) {
    throw new Error(`Profile "${profile}" 不存在，请先运行: taurusdb configure --profile ${profile}`);
  }

  const merged: TaurusConfig = { ...cfg, llm: cfg.llm ? { ...cfg.llm } : undefined };
  if (process.env[ENV_AK]) merged.ak = process.env[ENV_AK];
  if (process.env[ENV_SK]) merged.sk = process.env[ENV_SK];
  if (process.env[ENV_REGION]) merged.region = process.env[ENV_REGION];
  if (process.env[ENV_PROJECT_ID]) merged.project_id = process.env[ENV_PROJECT_ID];

  if (!merged.llm) merged.llm = {};
  if (process.env[ENV_LLM_BASE_URL]) merged.llm.base_url = process.env[ENV_LLM_BASE_URL];
  if (process.env[ENV_LLM_API_KEY]) merged.llm.api_key = process.env[ENV_LLM_API_KEY];
  if (process.env[ENV_LLM_MODEL]) merged.llm.model = process.env[ENV_LLM_MODEL];

  if (merged.llm) {
    merged.llm.base_url = stripWrappingQuotes((merged.llm.base_url ?? "").trim());
    merged.llm.api_key = stripWrappingQuotes((merged.llm.api_key ?? "").trim());
    merged.llm.model = stripWrappingQuotes((merged.llm.model ?? "").trim());
    const empty =
      !merged.llm.base_url &&
      !merged.llm.api_key &&
      !merged.llm.model &&
      !merged.llm.timeout_ms &&
      (!merged.llm.extra_headers || Object.keys(merged.llm.extra_headers).length === 0);
    if (empty) merged.llm = undefined;
  }
  return merged;
}

type ApiError = {
  error_code?: string;
  error_msg?: string;
};

const errorMap: Record<string, { friendly: string; hint?: string }> = {
  "APIGW.0301": { friendly: "AK/SK 认证失败", hint: "请运行 taurusdb configure 重新配置认证信息" },
  "APIGW.0302": { friendly: "权限不足，无法执行此操作", hint: "请检查 IAM 权限" },
  "DBS.200001": { friendly: "资源不存在", hint: "请运行 taurusdb instance list 查看实例" },
  "DBS.200025": { friendly: "可用区(AZ)参数不合法", hint: "请指定有效 master-az" },
  "DBS.200019": { friendly: "规格不存在", hint: "请运行 taurusdb flavor list 查看规格" },
  "DBS.200040": { friendly: "配额已超限", hint: "请联系华为云提升配额" },
  "DBS.200108": { friendly: "密码不符合规范", hint: "密码需包含至少三类字符且长度 8-32" },
  "DBS.200056": { friendly: "账户余额不足", hint: "请前往控制台充值" },
  "DBS.200023": { friendly: "VPC 或子网不存在", hint: "请检查 --vpc-id 和 --subnet-id" },
  "DBS.280475": { friendly: "按需实例不支持指定存储大小", hint: "请去掉 --volume-size" }
};

export function renderApiError(code?: string, message?: string): Error {
  if (code && errorMap[code]) {
    const t = errorMap[code];
    return new Error(t.hint ? `${t.friendly}\n  建议: ${t.hint}` : t.friendly);
  }
  if (code) return new Error(`API 错误 [${code}]: ${message ?? ""}`);
  return new Error(message ?? "未知 API 错误");
}

type SignedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};

function toSdkDate(date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function sha256Hex(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

function hmacHex(key: string, v: string): string {
  return createHmac("sha256", key).update(v).digest("hex");
}

function encodeRFC3986(v: string): string {
  return encodeURIComponent(v).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(searchParams: URLSearchParams): string {
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of searchParams.entries()) {
    pairs.push([encodeRFC3986(k), encodeRFC3986(v)]);
  }
  pairs.sort((a, b) => {
    if (a[0] === b[0]) return a[1].localeCompare(b[1]);
    return a[0].localeCompare(b[0]);
  });
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

function signRequest(req: SignedRequest, ak: string, sk: string): SignedRequest {
  const u = new URL(req.url);
  const xSdkDate = toSdkDate();
  const headers = {
    host: u.host,
    "content-type": req.headers["content-type"] ?? "application/json",
    "x-sdk-date": xSdkDate,
    ...Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v.trim()]))
  };

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${headers[k as keyof typeof headers]}\n`).join("");
  const signedHeaders = sortedHeaderKeys.join(";");
  const bodyHash = sha256Hex(req.body ?? "");
  const canonicalReq = [
    req.method.toUpperCase(),
    u.pathname || "/",
    canonicalQuery(u.searchParams),
    canonicalHeaders,
    signedHeaders,
    bodyHash
  ].join("\n");

  const stringToSign = ["SDK-HMAC-SHA256", xSdkDate, sha256Hex(canonicalReq)].join("\n");
  const signature = hmacHex(sk, stringToSign);
  const authorization = `SDK-HMAC-SHA256 Access=${ak}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...req,
    headers: {
      ...req.headers,
      Host: u.host,
      "X-Sdk-Date": xSdkDate,
      "Content-Type": headers["content-type"],
      Authorization: authorization
    }
  };
}

type HttpClient = {
  request<T = unknown>(service: "gaussdb" | "vpc" | "ces", method: string, apiPath: string, query?: Record<string, string>, body?: unknown): Promise<T>;
};

function endpointFor(service: "gaussdb" | "vpc" | "ces", region: string): string {
  switch (service) {
    case "gaussdb":
      return `https://gaussdb.${region}.myhuaweicloud.com`;
    case "vpc":
      return `https://vpc.${region}.myhuaweicloud.com`;
    case "ces":
      return `https://ces.${region}.myhuaweicloud.com`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeClient(cfg: TaurusConfig): HttpClient {
  const ak = cfg.ak?.trim();
  const sk = cfg.sk?.trim();
  const region = cfg.region?.trim();
  if (!ak || !sk || !region || !cfg.project_id?.trim()) {
    throw new Error("配置不完整，请先运行: taurusdb configure");
  }

  return {
    async request<T>(
      service: "gaussdb" | "vpc" | "ces",
      method: string,
      apiPath: string,
      query?: Record<string, string>,
      body?: unknown
    ): Promise<T> {
      const endpoint = endpointFor(service, region);
      const u = new URL(apiPath, endpoint);
      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v !== "") u.searchParams.set(k, v);
        }
      }

      const bodyStr = body ? JSON.stringify(body) : "";
      const signed = signRequest(
        {
          method,
          url: u.toString(),
          headers: {
            "content-type": "application/json"
          },
          body: bodyStr
        },
        ak,
        sk
      );

      const maxAttempts = 3;
      let lastErr: Error | undefined;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const resp = await fetch(signed.url, {
            method: signed.method,
            headers: signed.headers,
            body: method.toUpperCase() === "GET" || method.toUpperCase() === "DELETE" ? undefined : bodyStr
          });
          const text = await resp.text();
          if (!resp.ok) {
            let parsed: ApiError | undefined;
            try {
              parsed = text ? (JSON.parse(text) as ApiError) : undefined;
            } catch {
              parsed = undefined;
            }
            const err = renderApiError(parsed?.error_code, parsed?.error_msg || text || `HTTP ${resp.status}`);
            if ([429, 500, 502, 503, 504].includes(resp.status) && attempt < maxAttempts) {
              await sleep(300 * 2 ** (attempt - 1));
              continue;
            }
            throw err;
          }
          if (!text) return {} as T;
          return JSON.parse(text) as T;
        } catch (err) {
          lastErr = err as Error;
          if (attempt < maxAttempts) {
            await sleep(300 * 2 ** (attempt - 1));
            continue;
          }
        }
      }
      throw lastErr ?? new Error("请求失败");
    }
  };
}

type Instance = {
  id: string;
  name?: string;
  status?: string;
  datastore?: { type?: string; version?: string; kernel_version?: string };
  node_count?: number;
  az_mode?: string;
  master_az_code?: string;
  vpc_id?: string;
  subnet_id?: string;
  security_group_id?: string;
  private_write_ips?: string[];
  public_ips?: string;
  port?: string;
  private_dns_names?: string[];
  db_user_name?: string;
  nodes?: InstanceNode[];
  backup_strategy?: { start_time?: string; keep_days?: string };
};

type InstanceNode = {
  id?: string;
  name?: string;
  type?: string;
  status?: string;
  az_code?: string;
  private_read_ips?: string[];
  port?: number;
  flavor_ref?: string;
  vcpus?: string;
  ram?: string;
  max_connections?: string;
  volume?: { type?: string; size?: number; used?: string };
};

type Flavor = {
  spec_code: string;
  vcpus?: string;
  ram?: string;
  type?: string;
  az_status?: Record<string, string>;
};

type MetricPoint = {
  value: number;
  unit: string;
  timestamp_ms: number;
};

type InstanceMetrics = {
  cpu_util_pct?: MetricPoint;
  mem_util_pct?: MetricPoint;
  slow_queries?: MetricPoint;
  conn_count?: MetricPoint;
};

type VpcItem = {
  id: string;
  name?: string;
  cidr?: string;
  status?: string;
};

type SubnetItem = {
  id: string;
  name?: string;
  cidr?: string;
  availability_zone?: string;
  available_ip_address_count?: number;
};

type SecurityGroupItem = {
  id: string;
  name?: string;
};

async function listInstances(cfg: TaurusConfig): Promise<Instance[]> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const resp = await client.request<{ instances?: Instance[] }>("gaussdb", "GET", `/v3/${projectId}/instances`);
  return resp.instances ?? [];
}

async function listVpcs(cfg: TaurusConfig): Promise<VpcItem[]> {
  const client = makeClient(cfg);
  const resp = await client.request<{ vpcs?: VpcItem[] }>("vpc", "GET", "/v2.0/vpcs", { limit: "200" });
  return resp.vpcs ?? [];
}

async function listSubnets(cfg: TaurusConfig, vpcId: string): Promise<SubnetItem[]> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const resp = await client.request<{ subnets?: SubnetItem[] }>("vpc", "GET", `/v1/${projectId}/subnets`, {
    limit: "200",
    vpc_id: vpcId
  });
  return resp.subnets ?? [];
}

async function listSecurityGroups(cfg: TaurusConfig, vpcId: string): Promise<SecurityGroupItem[]> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const resp = await client.request<{ security_groups?: SecurityGroupItem[] }>("vpc", "GET", `/v1/${projectId}/security-groups`, {
    limit: "200",
    vpc_id: vpcId
  });
  return resp.security_groups ?? [];
}

async function showInstance(cfg: TaurusConfig, id: string): Promise<Instance | null> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const resp = await client.request<{ instance?: Instance }>("gaussdb", "GET", `/v3/${projectId}/instances/${id}`);
  return resp.instance ?? null;
}

async function listFlavors(cfg: TaurusConfig, databaseName: string, azMode: string, versionName?: string, specCode?: string): Promise<Flavor[]> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const resp = await client.request<{ flavors?: Flavor[] }>("gaussdb", "GET", `/v3/${projectId}/flavors`, {
    database_name: databaseName,
    availability_zone_mode: azMode,
    version_name: versionName ?? "",
    spec_code: specCode ?? ""
  });
  return resp.flavors ?? [];
}

async function showMetricData(
  cfg: TaurusConfig,
  opts: {
    namespace: string;
    metricName: string;
    dim0: string;
    dim1?: string;
    fromMs: number;
    toMs: number;
    periodSeconds: number;
    filter: "average" | "max" | "min" | "sum";
  }
): Promise<Array<{ average?: number; max?: number; min?: number; sum?: number; timestamp: number; unit?: string }>> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const query: Record<string, string> = {
    namespace: opts.namespace,
    metric_name: opts.metricName,
    "dim.0": opts.dim0,
    from: String(opts.fromMs),
    to: String(opts.toMs),
    period: String(opts.periodSeconds),
    filter: opts.filter
  };
  if (opts.dim1?.trim()) query["dim.1"] = opts.dim1.trim();
  const resp = await client.request<{ datapoints?: Array<{ average?: number; max?: number; min?: number; sum?: number; timestamp: number; unit?: string }> }>(
    "ces",
    "GET",
    `/V1.0/${projectId}/metric-data`,
    query
  );
  return resp.datapoints ?? [];
}

function pickMasterNode(inst: Instance): InstanceNode | null {
  const nodes = inst.nodes ?? [];
  if (nodes.length === 0) return null;
  const master = nodes.find((n) => (n.type ?? "").trim().toLowerCase() === "master");
  return master ?? nodes[0];
}

function pickDatapointValue(
  dp: { average?: number; max?: number; min?: number; sum?: number; timestamp: number; unit?: string },
  filter: "average" | "max" | "min" | "sum"
): number | undefined {
  switch (filter) {
    case "max":
      return dp.max;
    case "min":
      return dp.min;
    case "sum":
      return dp.sum;
    default:
      return dp.average;
  }
}

async function fetchLatestMetricPoint(
  cfg: TaurusConfig,
  opts: {
    namespace: string;
    metricName: string;
    dim0: string;
    dim1?: string;
    fromMs: number;
    toMs: number;
    periodSeconds: number;
    filter: "average" | "max" | "min" | "sum";
  }
): Promise<MetricPoint | undefined> {
  const datapoints = await showMetricData(cfg, opts);
  if (datapoints.length === 0) return undefined;
  const latest = datapoints.reduce((best, cur) => (cur.timestamp > best.timestamp ? cur : best));
  const value = pickDatapointValue(latest, opts.filter);
  if (value === undefined || Number.isNaN(value) || !Number.isFinite(value)) return undefined;
  return {
    value,
    unit: (latest.unit ?? "").trim(),
    timestamp_ms: latest.timestamp
  };
}

async function fetchInstanceMetrics(cfg: TaurusConfig, inst: Instance): Promise<InstanceMetrics> {
  const master = pickMasterNode(inst);
  if (!master?.id?.trim()) {
    throw new Error("无法确定 master 节点 ID");
  }

  const now = Date.now();
  const periodSeconds = 300;
  const fromMs = now - 60 * 60 * 1000;
  const dim0 = `gaussdb_mysql_instance_id,${inst.id}`;
  const dim1 = `gaussdb_mysql_node_id,${master.id}`;
  const ns = "SYS.GAUSSDB";

  const metrics: InstanceMetrics = {};
  metrics.cpu_util_pct = await fetchLatestMetricPoint(cfg, {
    namespace: ns,
    metricName: "gaussdb_mysql001_cpu_util",
    dim0,
    dim1,
    fromMs,
    toMs: now,
    periodSeconds,
    filter: "average"
  });
  metrics.mem_util_pct = await fetchLatestMetricPoint(cfg, {
    namespace: ns,
    metricName: "gaussdb_mysql002_mem_util",
    dim0,
    dim1,
    fromMs,
    toMs: now,
    periodSeconds,
    filter: "average"
  });
  metrics.slow_queries = await fetchLatestMetricPoint(cfg, {
    namespace: ns,
    metricName: "gaussdb_mysql074_slow_queries",
    dim0,
    dim1,
    fromMs,
    toMs: now,
    periodSeconds,
    filter: "sum"
  });
  metrics.conn_count = await fetchLatestMetricPoint(cfg, {
    namespace: ns,
    metricName: "gaussdb_mysql006_conn_count",
    dim0,
    dim1,
    fromMs,
    toMs: now,
    periodSeconds,
    filter: "average"
  });
  return metrics;
}

export function parseChargeMode(v: string): "postPaid" | "prePaid" {
  const s = v.trim().toLowerCase();
  if (s === "prepaid" || s === "pre_paid") {
    return "prePaid";
  }
  if (v.trim() === "prePaid") return "prePaid";
  return "postPaid";
}

export function normalizeAzMode(v: string): "auto" | "single" | "multi" {
  const s = v.trim().toLowerCase();
  if (s === "" || s === "auto") return "auto";
  if (s === "single" || s === "multi") return s;
  throw new Error("az-mode 仅支持 auto|single|multi");
}

export function normalizePeriodType(v: string): "month" | "year" {
  const s = v.trim().toLowerCase();
  if (s === "month" || s === "year") return s;
  throw new Error("period-type 仅支持 month|year");
}

export function validatePeriodNum(periodType: "month" | "year", n: number): void {
  if (periodType === "month" && (n < 1 || n > 9)) throw new Error("period-num（月付）需为 1~9");
  if (periodType === "year" && (n < 1 || n > 3)) throw new Error("period-num（年付）需为 1~3");
}

export function parseDurationToMs(v: string): number {
  const s = v.trim().toLowerCase();
  if (!s) throw new Error("duration 不能为空");
  if (/^\d+$/.test(s)) return Number(s) * 1000;

  const m = s.match(/^(\d+)(ms|s|m|h)$/);
  if (!m) throw new Error(`非法时长格式: ${v}（示例: 10s, 15m, 1h）`);
  const n = Number(m[1]);
  const unit = m[2];
  if (!Number.isFinite(n) || n <= 0) throw new Error(`非法时长: ${v}`);

  switch (unit) {
    case "ms":
      return n;
    case "s":
      return n * 1000;
    case "m":
      return n * 60 * 1000;
    case "h":
      return n * 60 * 60 * 1000;
    default:
      throw new Error(`非法时长单位: ${unit}`);
  }
}

export function validatePassword(pw: string): void {
  const s = pw.trim();
  if (s.length < 8 || s.length > 32) throw new Error("密码长度需为 8~32 位");
  const hasLower = /[a-z]/.test(s);
  const hasUpper = /[A-Z]/.test(s);
  const hasDigit = /[0-9]/.test(s);
  const hasSpecial = /[~!@#$%^*\-_=+?,()&]/.test(s);
  const cats = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (cats < 3) throw new Error("密码需至少包含以下字符中的三种：大小写字母、数字、特殊符号");
}

export function validateInstanceCreateInput(inputParams: InstanceCreateInput): void {
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

export function buildCreateRequestBody(cfg: TaurusConfig, inputParams: InstanceCreateInput): {
  body: Record<string, unknown>;
  mode: "postPaid" | "prePaid";
  warnings: string[];
} {
  const mode = parseChargeMode(inputParams.chargeMode);
  const warnings: string[] = [];
  const body: Record<string, unknown> = {
    charge_info: {
      charge_mode: mode
    },
    region: cfg.region,
    name: inputParams.name.trim(),
    datastore: {
      type: "gaussdb-mysql",
      version: inputParams.engineVersion.trim()
    },
    mode: "Cluster",
    flavor_ref: inputParams.flavorRef.trim(),
    vpc_id: inputParams.vpcId.trim(),
    subnet_id: inputParams.subnetId.trim(),
    password: inputParams.password,
    backup_strategy: {
      start_time: inputParams.backupWindow.trim()
    },
    availability_zone_mode: "multi",
    slave_count: inputParams.slaveCount
  };
  if (inputParams.securityGroupId?.trim()) body.security_group_id = inputParams.securityGroupId.trim();
  if (inputParams.masterAz?.trim()) body.master_availability_zone = inputParams.masterAz.trim();

  if (mode === "prePaid") {
    const pType = normalizePeriodType(inputParams.periodType);
    validatePeriodNum(pType, inputParams.periodNum);
    if (!inputParams.volumeSize || inputParams.volumeSize <= 0) {
      throw new Error("缺少必填参数: --volume-size（包周期 prePaid 时需要）");
    }
    (body.charge_info as Record<string, unknown>).period_type = pType;
    (body.charge_info as Record<string, unknown>).period_num = inputParams.periodNum;
    (body.charge_info as Record<string, unknown>).is_auto_renew = String(inputParams.autoRenew);
    (body.charge_info as Record<string, unknown>).is_auto_pay = String(inputParams.autoPay);
    body.volume = { size: String(inputParams.volumeSize) };
  } else if (inputParams.volumeSize && inputParams.volumeSize > 0) {
    warnings.push(`按需(postPaid)实例不支持指定存储大小，已忽略 --volume-size=${inputParams.volumeSize}`);
  }

  return { body, mode, warnings };
}

async function createInstance(
  cfg: TaurusConfig,
  inputParams: InstanceCreateInput
): Promise<{ instance?: { id: string }; job_id?: string; usedAzMode: string; warnings: string[] }> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const { body, warnings } = buildCreateRequestBody(cfg, inputParams);

  const tryModes = inputParams.azMode === "auto" ? ["multi", "single"] : [inputParams.azMode];
  let lastErr: Error | undefined;
  for (const m of tryModes) {
    body.availability_zone_mode = m;
    try {
      const resp = await client.request<{ instance?: { id: string }; job_id?: string }>("gaussdb", "POST", `/v3/${projectId}/instances`, undefined, body);
      return { ...resp, usedAzMode: m, warnings };
    } catch (err) {
      const e = err as Error;
      if (inputParams.azMode === "auto" && isAzModeUnsupportedError(e)) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error("未能使用 single/multi 创建实例");
}

async function waitInstanceReady(cfg: TaurusConfig, instanceId: string, timeoutMs: number, pollMs: number): Promise<Instance> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const inst = await showInstance(cfg, instanceId);
    if (!inst?.status) {
      await sleep(pollMs);
      continue;
    }
    const st = inst.status.toLowerCase().trim();
    if (["normal", "available", "active", "running"].includes(st)) return inst;
    if (["abnormal", "createfail", "failed", "error"].includes(st)) {
      throw new Error(`实例创建失败，状态=${st}（请用 taurusdb instance show ${instanceId}）`);
    }
    await sleep(pollMs);
  }
  throw new Error(`等待超时（${Math.floor(timeoutMs / 1000)}s）：请使用 taurusdb instance show ${instanceId}`);
}

function shortId(id: string, n = 8): string {
  return id.length <= n ? id : id.slice(0, n);
}

function pad(v: string, n: number): string {
  if (v.length >= n) return v;
  return v + " ".repeat(n - v.length);
}

function statusColored(status?: string): string {
  const s = (status ?? "-").trim();
  const low = s.toLowerCase();
  if (["normal", "available", "active", "running"].includes(low)) return c().green(`✓ ${s}`);
  if (["creating", "rebooting", "resizing"].includes(low)) return c().yellow(`⟳ ${s}`);
  if (["abnormal", "createfail", "failed", "error"].includes(low)) return c().redBright(`✗ ${s}`);
  if (s === "-") return c().gray("-");
  return c().red(`✗ ${s}`);
}

export function printInstanceTable(instances: Instance[], fullId: boolean): void {
  console.log("");
  console.log(`  ${c().bold("实例列表")}  共 ${c().cyan(String(instances.length))} 个实例`);
  console.log("  ═══════════════════════════════════════════════════════════════════════════");
  const idWidth = fullId ? 36 : 8;
  console.log(`  ${pad("#", 4)} ${pad("实例ID", idWidth)} ${pad("名称", 20)} ${pad("状态", 14)} ${pad("引擎", 10)}`);
  console.log("  ───────────────────────────────────────────────────────────────────────────");
  instances.forEach((it, idx) => {
    const id = fullId ? it.id : shortId(it.id, 8);
    const name = (it.name?.trim() || "-").slice(0, 18);
    const engine = it.datastore?.type ? `${it.datastore.type}${it.datastore.version ? ` ${it.datastore.version}` : ""}` : "-";
    console.log(`  ${pad(String(idx + 1), 4)} ${pad(c().cyan(id), idWidth)} ${pad(c().bold(name), 20)} ${pad(statusColored(it.status), 14)} ${pad(c().gray(engine), 10)}`);
  });
  console.log("  ═══════════════════════════════════════════════════════════════════════════");
  console.log("");
}

function parseNumber(v: string | undefined, def = 0): number {
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function printFlavorTable(flavors: Flavor[]): void {
  const sorted = [...flavors].sort((a, b) => {
    const vc = parseNumber(a.vcpus) - parseNumber(b.vcpus);
    if (vc !== 0) return vc;
    const ram = parseNumber(a.ram) - parseNumber(b.ram);
    if (ram !== 0) return ram;
    return a.spec_code.localeCompare(b.spec_code);
  });
  console.log("");
  console.log(`  ${c().bold("规格列表")}  共 ${c().cyan(String(sorted.length))} 个规格`);
  console.log("  ═══════════════════════════════════════════════════════════════════════════");
  console.log(`  ${pad("#", 4)} ${pad("规格编码", 40)} ${pad("vCPU", 6)} ${pad("内存(GB)", 8)} ${pad("类型", 12)}`);
  console.log("  ───────────────────────────────────────────────────────────────────────────");
  sorted.forEach((f, i) => {
    console.log(`  ${pad(String(i + 1), 4)} ${pad(c().cyan(f.spec_code || "-"), 40)} ${pad((f.vcpus || "-").trim(), 6)} ${pad((f.ram || "-").trim(), 8)} ${pad(c().gray((f.type || "-").trim()), 12)}`);
  });
  console.log("  ═══════════════════════════════════════════════════════════════════════════");
  console.log("");
}

export async function printJSON(data: unknown): Promise<void> {
  console.log(JSON.stringify(data, null, 2));
}

export async function printYAML(data: unknown): Promise<void> {
  console.log(yaml.dump(data));
}

export function connectionCommand(engine: string, host: string, port: number, user: string): string {
  if (!host || host === "-" || port <= 0) return "";
  const e = engine.toLowerCase();
  if (e.includes("postgres")) return `psql -h ${host} -p ${port} -U ${user} -d postgres`;
  if (e.includes("sqlserver") || e.includes("mssql")) return `sqlcmd -S ${host},${port} -U ${user}`;
  return `mysql -h ${host} -P ${port} -u ${user} -p`;
}

export function isAzModeUnsupportedError(err: unknown): boolean {
  const s = String((err as Error)?.message ?? err ?? "").toLowerCase();
  return (
    s.includes("dbs.05000085") ||
    s.includes("availability zone mode is not supported") ||
    s.includes("az mode is not supported") ||
    s.includes("availability_zone_mode is not supported")
  );
}

export const slashCommands = [
  "/instance list",
  "/instance create",
  "/instance show",
  "/instance delete",
  "/instance restart",
  "/ask",
  "/llm configure",
  "/llm test",
  "/llm show",
  "/flavor list",
  "/flavor pick",
  "/backup create",
  "/backup list",
  "/diagnose",
  "/chat",
  "/configure",
  "/connect",
  "/status",
  "/help",
  "/clear",
  "/exit"
];

export function fuzzyMatchCommand(input: string): string {
  const lower = input.toLowerCase();
  for (const s of slashCommands) {
    if (s.toLowerCase() === lower) return s;
  }
  const matches = slashCommands.filter((s) => s.toLowerCase().startsWith(lower));
  if (matches.length === 0) return input;
  const hasSub = matches.some((m) => m.includes(" "));
  let best = "";
  for (const m of matches) {
    if (hasSub && !m.includes(" ")) continue;
    if (!best || m.length < best.length) best = m;
  }
  return best || input;
}

function formatBarPct(pct: number, width: number): string {
  const v = Math.max(0, Math.min(100, pct));
  const filled = Math.round((v / 100) * width);
  const empty = Math.max(0, width - filled);
  const colorize = v >= 80 ? c().red : v >= 60 ? c().yellow : c().green;
  return `[${colorize("█".repeat(filled))}${"░".repeat(empty)}]`;
}

function formatMetricTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  const fmt = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return fmt.format(d).replace(/\//g, "-");
}

function formatUtilMetric(p: MetricPoint | undefined, total: number, totalUnit: string): string {
  if (!p) return "-";
  const unit = p.unit || "%";
  const ts = formatMetricTime(p.timestamp_ms);
  if (unit.includes("%")) {
    const used = (p.value / 100) * total;
    const bar = formatBarPct(p.value, 20);
    if (total > 0 && Number.isFinite(used)) {
      return `${bar} ${p.value.toFixed(2)}% (${used.toFixed(2)}/${total.toFixed(2)}${totalUnit}, ${ts})`;
    }
    return `${bar} ${p.value.toFixed(2)}% (${ts})`;
  }
  return `${p.value.toFixed(2)}${unit} (${ts})`;
}

function formatCountMetric(p: MetricPoint | undefined): string {
  if (!p) return "-";
  const ts = formatMetricTime(p.timestamp_ms);
  const n = Number.isInteger(p.value) ? `${p.value}` : p.value.toFixed(2);
  const unit = p.unit.toLowerCase().includes("count") ? " 个" : p.unit ? ` ${p.unit}` : "";
  return `${n}${unit} (${ts})`;
}

export function printInstanceDetail(inst: Instance, region = "-", metrics?: InstanceMetrics): void {
  const bold = c().bold;
  const dim = c().gray;
  console.log("");
  console.log(`  ${bold("实例详情")}`);
  console.log("  ═══════════════════════════════════════════════════════════════════════════");
  const kv = (k: string, v: string) => console.log(`  ${pad(`${k}:`, 13)}${v || "-"}`);

  kv("ID", c().cyan(inst.id));
  kv("Name", bold(inst.name?.trim() || "-"));
  kv("Status", statusColored(inst.status));
  const engine = inst.datastore?.type || "-";
  const version = inst.datastore?.version || "-";
  kv("Engine", `${engine}${version !== "-" ? ` ${version}` : ""}`);
  kv("Nodes", String(inst.node_count ?? 0));
  kv("Region", region || "-");
  kv("AZ Mode", inst.az_mode || "-");
  kv("Master AZ", inst.master_az_code || "-");
  kv("VPC", inst.vpc_id || "-");
  kv("Subnet", inst.subnet_id || "-");
  kv("Security Group", inst.security_group_id || "-");
  const privateIp = inst.private_write_ips?.[0] || "-";
  kv("Private IP", privateIp);
  kv("Public IP", inst.public_ips || "-");
  kv("Port", inst.port || "-");
  kv("Private DNS", (inst.private_dns_names || []).join(", ") || "-");
  const host = [privateIp, inst.public_ips, inst.private_dns_names?.[0]].find((v) => v && v !== "-") || "";
  const port = Number(inst.port ?? "0");
  const user = inst.db_user_name || "root";
  if (host && port > 0) kv("Command", c().cyan(connectionCommand(engine, host, port, user)));
  else kv("Command", dim("无法生成连接命令（缺少 IP/端口）"));

  if (metrics) {
    const master = pickMasterNode(inst);
    const cores = Number(master?.vcpus ?? "0") || 0;
    const ramGb = Number(master?.ram ?? "0") || 0;
    console.log("");
    console.log(`  ${bold("监控指标")}`);
    console.log("  ───────────────────────────────────────────────────────────────────────────");
    kv("CPU", formatUtilMetric(metrics.cpu_util_pct, cores, "Cores"));
    kv("Memory", formatUtilMetric(metrics.mem_util_pct, ramGb, "GB"));
    kv("Slow SQL", formatCountMetric(metrics.slow_queries));
    kv("Connections", formatCountMetric(metrics.conn_count));
  }

  console.log("  ═══════════════════════════════════════════════════════════════════════════");
  console.log("");
}

class LLMClient {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly extraHeaders: Record<string, string>;

  constructor(cfg: LLMConfig) {
    this.baseURL = (cfg.base_url ?? "").trim();
    this.apiKey = (cfg.api_key ?? "").trim().replace(/^Bearer\s+/i, "");
    this.model = (cfg.model ?? "").trim();
    this.timeoutMs = cfg.timeout_ms && cfg.timeout_ms > 0 ? cfg.timeout_ms : 30000;
    this.extraHeaders = cfg.extra_headers ?? {};
    if (!this.baseURL) throw new Error("llm base_url 不能为空");
    if (!this.model) throw new Error("llm model 不能为空");
  }

  private joinURL(p: string): string {
    const u = new URL(this.baseURL);
    u.pathname = path.posix.join(u.pathname || "/", p);
    return u.toString();
  }

  private stripMeta(s: string): string {
    const strip = (src: string, open: string, close: string): string => {
      let out = src;
      while (true) {
        const i = out.indexOf(open);
        if (i < 0) break;
        const j = out.indexOf(close, i + open.length);
        if (j < 0) break;
        out = out.slice(0, i) + out.slice(j + close.length);
      }
      return out;
    };
    return strip(strip(s, "<think>", "</think>"), "<analysis>", "</analysis>").trim();
  }

  private async chatCompletions(system: string, user: string): Promise<{ content: string; raw: string }> {
    const endpoint = this.joinURL("/chat/completions");
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0
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
          ...this.extraHeaders
        };
        if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
        const resp = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: ctrl.signal
        });
        const raw = await resp.text();
        lastRaw = raw;
        if (!resp.ok) {
          const err = new Error(`LLM 请求失败: ${resp.status} ${resp.statusText}`);
          if ([429, 500, 502, 503, 504, 529].includes(resp.status) && attempt < maxAttempts) {
            await sleep(300 * 2 ** (attempt - 1));
            continue;
          }
          throw err;
        }
        const parsed = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
        const content = this.stripMeta(parsed.choices?.[0]?.message?.content ?? "");
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
    throw new Error(lastError ? `${lastError.message}${lastRaw ? `\nraw=${lastRaw}` : ""}` : "LLM 请求失败");
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

  async suggestCommand(userText: string, allowed: string[]): Promise<{ command: string; explain?: string; confidence?: number; raw: string }> {
    const lines = [
      "你是 TaurusDB CLI 的命令助手。把自然语言转换成可执行命令。",
      "严格只输出 JSON，格式: {\"command\":\"...\",\"explain\":\"...\",\"confidence\":0.0}",
      "command 必须是不带前导斜杠的命令。",
      "只允许以下命令形态：",
      ...allowed.map((v) => `- ${v}`),
      "若信息不足，command 为空字符串，并在 explain 写缺少信息。"
    ];
    const { content, raw } = await this.chatCompletions(lines.join("\n"), userText);
    const candidates = [
      content,
      content.replace(/^```json/i, "").replace(/```$/i, "").trim()
    ];
    for (const can of candidates) {
      try {
        const out = JSON.parse(can) as { command?: string; explain?: string; confidence?: number };
        return { command: (out.command ?? "").trim(), explain: out.explain?.trim(), confidence: out.confidence, raw };
      } catch {
        continue;
      }
    }
    throw new Error(`模型输出不是 JSON: ${content}`);
  }
}

function getRootOptions(cmd: Command): RootOptions {
  return cmd.optsWithGlobals<RootOptions>();
}

function printBanner(profile: string, region: string): void {
  const red = c().redBright.bold;
  const yellow = c().yellow;
  const white = c().white.bold;
  const dim = c().gray;
  const taurus = [
    "  ████████╗ █████╗ ██╗   ██╗██████╗ ██╗   ██╗███████╗",
    "  ╚══██╔══╝██╔══██╗██║   ██║██╔══██╗██║   ██║██╔════╝",
    "     ██║   ███████║██║   ██║██████╔╝██║   ██║███████╗",
    "     ██║   ██╔══██║██║   ██║██╔══██╗██║   ██║╚════██║",
    "     ██║   ██║  ██║╚██████╔╝██║  ██║╚██████╔╝███████║",
    "     ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝"
  ];
  const db = [
    " ██████╗ ██████╗ ",
    " ██╔══██╗██╔══██╗",
    " ██║  ██║██████╔╝",
    " ██║  ██║██╔══██╗",
    " ██████╔╝██████╔╝",
    " ╚═════╝ ╚═════╝ "
  ];
  console.log("");
  for (let i = 0; i < taurus.length; i++) {
    console.log(`${red(taurus[i])}  ${yellow(db[i])}`);
  }
  console.log("");
  console.log(`${white("  华为云数据库命令行工具 + 智能 Agent")}    ${dim(versionLabel())}`);
  console.log(dim(`  Profile=${profile}  Region=${region || "-"}`));
  console.log("");
}

function versionLabel(): string {
  let v = VERSION.trim() || "dev";
  if (v === "dev") v = "vdev";
  if (v !== "vdev" && !v.startsWith("v")) v = `v${v}`;
  if (COMMIT.trim()) v = `${v} (build ${COMMIT.trim().slice(0, 7)})`;
  if (BUILT_AT.trim()) v = `${v} ${BUILT_AT.trim()}`;
  return v;
}

async function runAsk(profile: string, userText: string): Promise<void> {
  const cfg = await loadProfile(profile);
  if (!cfg.llm?.base_url || !cfg.llm?.model) {
    console.log(c().yellow("  ⚠ 未配置 LLM。请先运行: taurusdb llm configure"));
    return;
  }
  const client = new LLMClient(cfg.llm);
  const allowed = [
    "configure",
    "connect",
    "instance list [--full-id] [-o table|json|yaml]",
    "instance show <instance-id> [--metrics=false] [-o table|json|yaml]",
    "flavor list [--az-mode auto|single|multi]",
    "llm configure"
  ];
  const sug = await client.suggestCommand(userText, allowed);
  if (!sug.command) {
    console.log(c().yellow("  ⚠ 无法生成可靠命令。"));
    if (sug.explain) console.log(`  ${c().gray("说明:")} ${sug.explain}`);
    return;
  }
  console.log(`  ${c().gray("建议命令:")} ${c().cyan(sug.command)}`);
  if (sug.explain) console.log(`  ${c().gray("说明:")} ${c().gray(sug.explain)}`);
  if (sug.confidence) console.log(`  ${c().gray("置信度:")} ${sug.confidence.toFixed(2)}`);
}

async function runInteractiveInstanceCreate(profile: string): Promise<void> {
  const cfg = await loadProfile(profile);
  const now = new Date();
  const defaultName = `gaussdb-mysql-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(
    now.getHours()
  ).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;

  const base = await prompts([
    { type: "text", name: "name", message: "实例名称:", initial: defaultName, validate: (v: string) => (v.trim() ? true : "实例名称不能为空") },
    { type: "text", name: "engineVersion", message: "引擎版本:", initial: "8.0" },
    {
      type: "select",
      name: "azMode",
      message: "可用区模式:",
      choices: [
        { title: "auto", value: "auto" },
        { title: "single", value: "single" },
        { title: "multi", value: "multi" }
      ],
      initial: 0
    }
  ]);
  if (!base.name || !base.azMode) return;

  const mode = normalizeAzMode(base.azMode);
  const tryModes: Array<"auto" | "single" | "multi"> = mode === "auto" ? ["single", "multi"] : [mode];
  let flavors: Flavor[] = [];
  let usedMode: "auto" | "single" | "multi" = mode;
  let flavorErr: Error | undefined;
  for (const m of tryModes) {
    try {
      flavors = await listFlavors(cfg, "gaussdb-mysql", m, base.engineVersion, "");
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
      value: i
    }))
  });
  if (typeof flavorPick.idx !== "number") return;
  const selectedFlavor = flavors[flavorPick.idx];

  const billing = await prompts({
    type: "select",
    name: "chargeMode",
    message: "计费模式:",
    choices: [
      { title: "postPaid (按需)", value: "postPaid" },
      { title: "prePaid (包周期)", value: "prePaid" }
    ],
    initial: 0
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
          { title: "year", value: "year" }
        ],
        initial: 0
      },
      {
        type: "number",
        name: "periodNum",
        message: "包周期时长:",
        initial: 1,
        validate: (n: number) => (Number.isFinite(n) && n > 0 ? true : "请输入正整数")
      },
      {
        type: "number",
        name: "volumeSize",
        message: "存储大小(GB):",
        initial: 200,
        validate: (n: number) => (Number.isFinite(n) && n >= 10 && n % 10 === 0 ? true : "需 >=10 且为 10 的倍数")
      },
      { type: "toggle", name: "autoPay", message: "自动支付", initial: true, active: "是", inactive: "否" },
      { type: "toggle", name: "autoRenew", message: "自动续订", initial: false, active: "是", inactive: "否" }
    ]);
    if (!prepaid.periodType || !prepaid.periodNum || !prepaid.volumeSize) return;
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
      { title: "手动输入", value: "manual" }
    ],
    initial: 0
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
            title: `${v.name ?? "-"} (${v.cidr ?? "-"}) ${v.status ?? ""}`.trim(),
            value: i
          }))
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
              value: i
            }))
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
                value: i
              }))
            )
          });
          if (typeof pickedSg.idx === "number" && pickedSg.idx >= 0) {
            securityGroupId = groups[pickedSg.idx].id;
          }
        }
      }
    } catch (err) {
      console.log(`  ${c().yellow("⚠ 网络资源查询失败，将切换到手动输入:")} ${(err as Error).message}`);
    }
  }

  if (!vpcId || !subnetId) {
    const manual = await prompts([
      { type: "text", name: "vpcId", message: "VPC ID:", initial: vpcId, validate: (v: string) => (v.trim() ? true : "VPC ID 不能为空") },
      { type: "text", name: "subnetId", message: "子网 ID:", initial: subnetId, validate: (v: string) => (v.trim() ? true : "子网 ID 不能为空") },
      { type: "text", name: "securityGroupId", message: "安全组 ID（可选）:", initial: securityGroupId }
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
    }
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
    autoPay
  };

  validateInstanceCreateInput(createInput);
  const confirm = await prompts({
    type: "confirm",
    name: "ok",
    message: `确认创建实例 ${createInput.name} ?`,
    initial: false
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
  console.log(`  ${c().gray("提示: 可使用 taurusdb instance show <id> 查看创建进度")}`);
}

async function runInteractiveInstanceListAndShow(profile: string, dispatch: (cmd: string) => Promise<void>): Promise<void> {
  const cfg = await loadProfile(profile);
  const instances = await listInstances(cfg);
  if (instances.length === 0) {
    console.log(c().yellow("  ⚠ 当前 project 下没有 GaussDB 实例"));
    return;
  }

  if (instances.length === 1) {
    const only = instances[0];
    console.log(`  ${c().gray("仅发现 1 个实例，自动打开详情:")} ${c().cyan(only.id)}`);
    await dispatch(`instance show ${only.id}`);
    return;
  }

  const abnormal = instances.filter((it) => {
    const s = (it.status ?? "").trim().toLowerCase();
    return ["abnormal", "createfail", "failed", "error"].includes(s);
  });
  if (abnormal.length > 0) {
    const sample = abnormal.slice(0, 3).map((x) => x.id).join(", ");
    console.log(`  ${c().redBright(`⚠ 发现 ${abnormal.length} 个异常实例，建议优先查看详情`)}`);
    console.log(`  ${c().gray(`建议: 使用 /instance show <id> 查看详情（例如 ${sample}）`)}`);
  }

  const picked = await prompts({
    type: "select",
    name: "idx",
    message: "选择一个实例查看详情:",
    choices: instances.map((it, i) => ({
      title: `${it.name ?? "-"}  [${it.status ?? "-"}]  ${it.datastore?.type ?? "-"} ${it.datastore?.version ?? ""}`.trim(),
      description: it.id,
      value: i
    }))
  });
  if (typeof picked.idx !== "number") return;
  const instanceId = instances[picked.idx].id;
  await dispatch(`instance show ${instanceId}`);
}

function collectFlavorTypes(flavors: Flavor[]): string[] {
  const set = new Set<string>();
  for (const f of flavors) {
    const t = (f.type ?? "").trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function filterFlavorsByTypes(flavors: Flavor[], types: string[]): Flavor[] {
  if (types.length === 0) return flavors;
  const s = new Set(types);
  return flavors.filter((f) => s.has((f.type ?? "").trim()));
}

async function fetchFlavorsWithAutoMode(
  cfg: TaurusConfig,
  azMode: "auto" | "single" | "multi",
  engineVersion?: string,
  specCode?: string
): Promise<{ flavors: Flavor[]; usedMode: "auto" | "single" | "multi" }> {
  const tryModes: Array<"auto" | "single" | "multi"> = azMode === "auto" ? ["single", "multi"] : [azMode];
  let usedMode: "auto" | "single" | "multi" = azMode;
  let lastErr: Error | undefined;
  for (const m of tryModes) {
    try {
      const flavors = await listFlavors(cfg, "gaussdb-mysql", m, engineVersion, specCode);
      usedMode = m;
      return { flavors, usedMode };
    } catch (err) {
      lastErr = err as Error;
    }
  }
  throw lastErr ?? new Error("查询规格失败");
}

async function runInteractiveFlavorList(profile: string): Promise<void> {
  const cfg = await loadProfile(profile);
  const azAns = await prompts({
    type: "select",
    name: "azMode",
    message: "选择可用区模式:",
    choices: [
      { title: "auto", value: "auto" },
      { title: "single", value: "single" },
      { title: "multi", value: "multi" }
    ],
    initial: 0
  });
  if (!azAns.azMode) return;

  const mode = normalizeAzMode(azAns.azMode);
  const { flavors: all, usedMode } = await fetchFlavorsWithAutoMode(cfg, mode);
  if (all.length === 0) {
    console.log(c().yellow("  ⚠ 未查询到可用规格"));
    return;
  }
  if (mode === "auto") console.log(`  ${c().gray(`已自动选择 az-mode: ${usedMode}`)}`);

  const types = collectFlavorTypes(all);
  let flavors = all;
  if (types.length > 0) {
    const picked = await prompts({
      type: "multiselect",
      name: "types",
      message: "选择规格类型（可多选，不选=全部）:",
      choices: types.map((t) => ({ title: t, value: t })),
      instructions: false
    });
    const selected: string[] = Array.isArray(picked.types) ? picked.types : [];
    flavors = filterFlavorsByTypes(all, selected);
    if (selected.length > 0) {
      console.log(`  ${c().gray(`已筛选类型: ${selected.sort((a, b) => a.localeCompare(b)).join(", ")}`)}`);
    }
  }
  if (flavors.length === 0) {
    console.log(c().yellow("  ⚠ 筛选后没有匹配规格"));
    return;
  }
  printFlavorTable(flavors);
}

async function runInteractiveFlavorPick(profile: string): Promise<void> {
  const cfg = await loadProfile(profile);
  const azAns = await prompts({
    type: "select",
    name: "azMode",
    message: "选择可用区模式:",
    choices: [
      { title: "auto", value: "auto" },
      { title: "single", value: "single" },
      { title: "multi", value: "multi" }
    ],
    initial: 0
  });
  if (!azAns.azMode) return;

  const mode = normalizeAzMode(azAns.azMode);
  const { flavors: all, usedMode } = await fetchFlavorsWithAutoMode(cfg, mode);
  if (all.length === 0) {
    console.log(c().yellow("  ⚠ 未查询到可用规格"));
    return;
  }
  if (mode === "auto") console.log(`  ${c().gray(`已自动选择 az-mode: ${usedMode}`)}`);

  const types = collectFlavorTypes(all);
  let flavors = all;
  if (types.length > 0) {
    const picked = await prompts({
      type: "multiselect",
      name: "types",
      message: "选择规格类型（可多选，不选=全部）:",
      choices: types.map((t) => ({ title: t, value: t })),
      instructions: false
    });
    const selected: string[] = Array.isArray(picked.types) ? picked.types : [];
    flavors = filterFlavorsByTypes(all, selected);
  }
  if (flavors.length === 0) {
    console.log(c().yellow("  ⚠ 筛选后没有匹配规格"));
    return;
  }

  const pick = await prompts({
    type: "select",
    name: "idx",
    message: "选择规格:",
    choices: flavors.slice(0, 30).map((f, i) => ({
      title: `${f.spec_code}  vCPU=${f.vcpus ?? "-"} RAM=${f.ram ?? "-"} ${f.type ?? ""}`.trim(),
      value: i
    }))
  });
  if (typeof pick.idx !== "number") return;
  const chosen = flavors[pick.idx];

  console.log("");
  console.log(c().bold("  已选择:"));
  console.log(`  az-mode:   ${usedMode}`);
  console.log(`  spec-code: ${chosen.spec_code}`);
  console.log("");
  console.log(c().gray("  复制参数："));
  console.log(`  --az-mode ${usedMode} --spec-code ${chosen.spec_code}`);
}

async function startChat(profile: string, dispatch: (cmd: string) => Promise<void>): Promise<void> {
  const rl = readline.createInterface({ input, output: outputStream });
  printBanner(profile, "-");
  console.log(c().gray("输入 /help 查看指令；/exit 退出。"));
  while (true) {
    const line = (await rl.question("taurusdb> ")).trim();
    if (!line) continue;
    if (line === "/exit" || line === "/quit") break;
    if (line === "/help") {
      console.log("  /instance list");
      console.log("  /instance show <id>");
      console.log("  /instance create");
      console.log("  /flavor list");
      console.log("  /ask <自然语言>");
      console.log("  /chat <问题>");
      continue;
    }
    if (line === "/instance create") {
      try {
        await runInteractiveInstanceCreate(profile);
      } catch (err) {
        console.log(c().red(`  ✗ ${(err as Error).message}`));
      }
      continue;
    }
    if (line === "/instance list") {
      try {
        await runInteractiveInstanceListAndShow(profile, dispatch);
      } catch (err) {
        console.log(c().red(`  ✗ ${(err as Error).message}`));
      }
      continue;
    }
    if (line === "/flavor list") {
      try {
        await runInteractiveFlavorList(profile);
      } catch (err) {
        console.log(c().red(`  ✗ ${(err as Error).message}`));
      }
      continue;
    }
    if (line === "/flavor pick") {
      try {
        await runInteractiveFlavorPick(profile);
      } catch (err) {
        console.log(c().red(`  ✗ ${(err as Error).message}`));
      }
      continue;
    }
    if (line.startsWith("/ask ")) {
      await runAsk(profile, line.replace(/^\/ask\s+/, ""));
      continue;
    }
    if (line.startsWith("/chat ")) {
      try {
        const cfg = await loadProfile(profile);
        if (!cfg.llm?.base_url || !cfg.llm?.model) {
          console.log(c().yellow("  ⚠ 未配置 LLM。请先运行: taurusdb llm configure"));
          continue;
        }
        const client = new LLMClient(cfg.llm);
        const out = await client.chat(line.replace(/^\/chat\s+/, ""));
        console.log(`  ${out.content.trim()}`);
      } catch (err) {
        console.log(c().red(`  ✗ ${(err as Error).message}`));
      }
      continue;
    }
    if (line.startsWith("/")) {
      await dispatch(line.slice(1));
      continue;
    }
    await dispatch(line);
  }
  rl.close();
}

const program = new Command();
program
  .name("taurusdb")
  .description("TaurusDB CLI TypeScript 版")
  .version(versionLabel())
  .option("--profile <name>", "配置文件 Profile 名称", "default")
  .option("-o, --output <fmt>", "输出格式: table|json|yaml", "table")
  .option("--no-color", "禁用彩色输出", false);

program.action(async function () {
  const opts = getRootOptions(this);
  if (opts.noColor) chalk.level = 0;
  await startChat(opts.profile, async (cmdLine) => {
    const args = cmdLine.trim().split(/\s+/).filter(Boolean);
    if (args.length === 0) return;
    await program.parseAsync([process.argv[0], process.argv[1], ...args], { from: "user" });
  });
});

program
  .command("configure")
  .description("配置华为云认证信息")
  .action(async function () {
    const opts = getRootOptions(this);
    const answers = await prompts([
      { type: "text", name: "ak", message: "Access Key (AK):", validate: (v: string) => (v.trim() ? true : "AK 不能为空") },
      { type: "password", name: "sk", message: "Secret Key (SK):", validate: (v: string) => (v.trim() ? true : "SK 不能为空") },
      { type: "select", name: "regionLabel", message: "选择 Region:", choices: regions.map((r) => ({ title: r, value: r })) },
      { type: "text", name: "projectId", message: "Project ID:", validate: (v: string) => (v.trim() ? true : "Project ID 不能为空") }
    ]);
    if (!answers.ak || !answers.sk || !answers.regionLabel || !answers.projectId) {
      throw new Error("输入已取消");
    }
    const cfg: TaurusConfig = {
      ak: answers.ak.trim(),
      sk: answers.sk.trim(),
      region: regionCodes[answers.regionLabel],
      project_id: answers.projectId.trim()
    };
    await saveProfile(cfg, opts.profile);
    console.log(`✓ 配置已保存到 ~/.taurusdb/config.yaml (profile: ${opts.profile})`);
  });

program
  .command("connect")
  .description("验证华为云 GaussDB 连接")
  .action(async function () {
    const opts = getRootOptions(this);
    const cfg = await loadProfile(opts.profile);
    console.log(`正在连接华为云 TaurusDB [profile: ${opts.profile}, region: ${cfg.region ?? "-"}]...`);
    const instances = await listInstances(cfg);
    console.log(`✓ 连接成功 [profile: ${opts.profile}, region: ${cfg.region ?? "-"}] 共 ${instances.length} 个实例`);
  });

const instanceCmd = program.command("instance").description("管理数据库实例");

instanceCmd
  .command("list")
  .description("列出所有实例")
  .option("--full-id", "显示完整实例 ID", false)
  .action(async function () {
    const opts = getRootOptions(this);
    const cmdOpts = this.opts<{ fullId: boolean }>();
    const cfg = await loadProfile(opts.profile);
    const instances = await listInstances(cfg);
    if (instances.length === 0) {
      console.log(c().yellow("  ⚠ 当前 project 下没有 GaussDB 实例"));
      return;
    }
    const out = (opts.output || "table").toLowerCase() as OutputFormat;
    if (out === "json") return printJSON(instances);
    if (out === "yaml") return printYAML(instances);
    printInstanceTable(instances, cmdOpts.fullId);
  });

instanceCmd
  .command("show")
  .description("查看实例详情")
  .argument("<instance-id>", "实例 ID")
  .option("--metrics <bool>", "是否展示 Cloud Eye(CES) 监控指标（默认开启；可用 --metrics=false 关闭）", "true")
  .action(async function (instanceId: string) {
    const opts = getRootOptions(this);
    const cmdOpts = this.opts<{ metrics: string }>();
    const cfg = await loadProfile(opts.profile);
    const inst = await showInstance(cfg, instanceId);
    if (!inst) throw new Error(`实例 "${instanceId}" 不存在`);

    const metricsEnabled = !/^false$/i.test(cmdOpts.metrics ?? "true");
    const out = (opts.output || "table").toLowerCase() as OutputFormat;
    const source = (this as Command).getOptionValueSource?.("metrics");
    const metricsFlagChanged = source === "cli" || source === "env";
    const includeMetrics = metricsEnabled && (metricsFlagChanged || (out !== "json" && out !== "yaml"));

    let metrics: InstanceMetrics | undefined;
    if (includeMetrics) {
      try {
        metrics = await fetchInstanceMetrics(cfg, inst);
      } catch (err) {
        console.log(`  ${c().yellow("⚠ 指标获取失败:")} ${(err as Error).message}`);
      }
    }

    if (out === "json") {
      if (includeMetrics && metrics) return printJSON({ instance: inst, metrics });
      return printJSON(inst);
    }
    if (out === "yaml") {
      if (includeMetrics && metrics) return printYAML({ instance: inst, metrics });
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
  .option("--poll-interval <duration>", "轮询间隔（支持: 10 / 10s / 1m）", "10s")
  .action(async function () {
    const opts = getRootOptions(this);
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
      autoPay: !/^false$/i.test(f.autoPay)
    };
    validateInstanceCreateInput(createInput);
    const cfg = await loadProfile(opts.profile);
    const created = await createInstance(cfg, createInput);
    if (!created.instance?.id) throw new Error("创建实例成功但未返回实例 ID");
    for (const w of created.warnings) {
      console.log(`  ${c().yellow(`⚠ ${w}`)}`);
    }
    console.log(`  ${c().green("✓ 创建请求已提交")}`);
    console.log(`  ${c().gray("Instance ID:")} ${c().cyan(created.instance.id)}`);
    console.log(`  ${c().gray("az-mode:")} ${c().gray(created.usedAzMode)}`);
    if (created.job_id) console.log(`  ${c().gray("Job ID:")} ${c().gray(created.job_id)}`);

    const out = (opts.output || "table").toLowerCase() as OutputFormat;
    if (out === "json") return printJSON(created);
    if (out === "yaml") return printYAML(created);

    if (f.wait) {
      const timeoutMs = parseDurationToMs(f.timeout);
      const pollMs = parseDurationToMs(f.pollInterval);
      console.log(`  ${c().gray("等待实例就绪...")}`);
      const ready = await waitInstanceReady(cfg, created.instance.id, timeoutMs, pollMs);
      console.log(`  ${c().green("✓ 实例已就绪:")} ${c().cyan(created.instance.id)}`);
      console.log(`  ${c().gray("Status:")} ${c().gray(ready.status ?? "-")}`);
    } else {
      console.log(`  ${c().gray("提示: 可使用 taurusdb instance show <id> 查看创建进度")}`);
    }
  });

const flavorCmd = program.command("flavor").description("查询数据库规格");

flavorCmd
  .command("list")
  .description("列出可用规格")
  .option("--database-name <name>", "数据库引擎名称", "gaussdb-mysql")
  .option("--az-mode <mode>", "可用区模式: auto|single|multi", "auto")
  .option("--engine-version <ver>", "引擎版本号")
  .option("--spec-code <code>", "规格编码过滤")
  .action(async function () {
    const opts = getRootOptions(this);
    const f = this.opts<{ databaseName: string; azMode: string; engineVersion?: string; specCode?: string }>();
    const cfg = await loadProfile(opts.profile);
    const mode = normalizeAzMode(f.azMode);
    const tryModes: Array<"single" | "multi" | "auto"> = mode === "auto" ? ["single", "multi"] : [mode];
    let lastErr: Error | undefined;
    let flavors: Flavor[] = [];
    let usedMode: "auto" | "single" | "multi" = mode;
    for (const m of tryModes) {
      try {
        flavors = await listFlavors(cfg, f.databaseName, m, f.engineVersion, f.specCode);
        usedMode = m;
        break;
      } catch (err) {
        lastErr = err as Error;
      }
    }
    if (!flavors.length && lastErr) throw lastErr;
    if (mode === "auto") console.log(`  ${c().gray(`已自动选择 az-mode: ${usedMode}`)}`);
    if (flavors.length === 0) {
      console.log(c().yellow("  ⚠ 未查询到可用规格"));
      return;
    }
    const out = (opts.output || "table").toLowerCase() as OutputFormat;
    if (out === "json") return printJSON(flavors);
    if (out === "yaml") return printYAML(flavors);
    printFlavorTable(flavors);
  });

flavorCmd
  .command("pick")
  .description("交互式选择规格/可用区")
  .option("--database-name <name>", "数据库引擎名称", "gaussdb-mysql")
  .option("--az-mode <mode>", "可用区模式: auto|single|multi", "auto")
  .option("--engine-version <ver>", "引擎版本号")
  .option("--spec-code <code>", "规格编码过滤")
  .action(async function () {
    const opts = getRootOptions(this);
    const f = this.opts<{ databaseName: string; azMode: string; engineVersion?: string; specCode?: string }>();
    const cfg = await loadProfile(opts.profile);
    const mode = normalizeAzMode(f.azMode);
    const tryModes: Array<"single" | "multi" | "auto"> = mode === "auto" ? ["single", "multi"] : [mode];
    let flavors: Flavor[] = [];
    let usedMode: "auto" | "single" | "multi" = mode;
    for (const m of tryModes) {
      try {
        flavors = await listFlavors(cfg, f.databaseName, m, f.engineVersion, f.specCode);
        usedMode = m;
        break;
      } catch {
        continue;
      }
    }
    if (flavors.length === 0) throw new Error("未查询到可用规格");
    console.log(`  ${c().gray(`az-mode: ${usedMode}`)}`);
    const picked = await prompts({
      type: "select",
      name: "idx",
      message: "选择规格",
      choices: flavors.slice(0, 30).map((x, i) => ({
        title: `${x.spec_code}  vCPU=${x.vcpus ?? "-"} RAM=${x.ram ?? "-"}`,
        value: i
      }))
    });
    if (typeof picked.idx !== "number") return;
    const chosen = flavors[picked.idx];
    console.log("");
    console.log(c().bold("  已选择:"));
    console.log(`  az-mode:   ${usedMode}`);
    console.log(`  spec-code: ${chosen.spec_code}`);
    console.log("");
    console.log(c().gray("  复制参数："));
    console.log(`  --az-mode ${usedMode} --spec-code ${chosen.spec_code}`);
  });

const llmCmd = program.command("llm").description("配置/使用大模型（OpenAI-compatible）");

llmCmd
  .command("configure")
  .description("配置 LLM")
  .action(async function () {
    const opts = getRootOptions(this);
    let cfg: TaurusConfig;
    try {
      cfg = await loadProfile(opts.profile);
    } catch {
      cfg = {};
    }
    const answers = await prompts([
      {
        type: "text",
        name: "baseURL",
        message: "LLM Base URL (e.g. https://api.openai.com/v1):",
        validate: (v: string) => {
          try {
            const u = new URL(v.trim());
            if (!["http:", "https:"].includes(u.protocol) || !u.host) return "Base URL 格式不正确";
            return true;
          } catch {
            return "Base URL 格式不正确";
          }
        }
      },
      {
        type: "text",
        name: "model",
        message: "Model (e.g. gpt-5.4-mini):",
        validate: (v: string) => (v.trim() ? true : "Model 不能为空")
      },
      {
        type: "password",
        name: "apiKey",
        message: "API Key (可留空，改用环境变量 TAURUSDB_LLM_API_KEY):"
      }
    ]);
    if (!answers.baseURL || !answers.model) throw new Error("输入已取消");
    cfg.llm = cfg.llm ?? {};
    cfg.llm.base_url = stripWrappingQuotes(answers.baseURL.trim());
    cfg.llm.model = stripWrappingQuotes(answers.model.trim());
    cfg.llm.api_key = stripWrappingQuotes((answers.apiKey ?? "").trim());
    if (!cfg.llm.timeout_ms) cfg.llm.timeout_ms = 30000;
    await saveProfile(cfg, opts.profile);
    console.log(`✓ LLM 配置已保存到 ~/.taurusdb/config.yaml (profile: ${opts.profile})`);
    console.log(`  提示: 也可使用环境变量覆盖: ${ENV_LLM_BASE_URL} / ${ENV_LLM_API_KEY} / ${ENV_LLM_MODEL}`);
  });

llmCmd
  .command("show")
  .description("查看当前 LLM 配置（脱敏）")
  .action(async function () {
    const opts = getRootOptions(this);
    const cfg = await loadProfile(opts.profile);
    if (!cfg.llm) {
      console.log(c().gray("LLM: 未配置"));
      return;
    }
    const keyRaw = (cfg.llm.api_key ?? "").trim().replace(/^Bearer\s+/i, "");
    const masked = keyRaw.length <= 8 ? "********" : `${keyRaw.slice(0, 4)}...${keyRaw.slice(-4)}`;
    console.log(`${c().gray("LLM Base URL:")} ${c().cyan(cfg.llm.base_url ?? "")}`);
    console.log(`${c().gray("LLM Model:")} ${c().cyan(cfg.llm.model ?? "")}`);
    if (keyRaw) console.log(`${c().gray("LLM API Key:")} ${c().cyan(masked)}`);
    else console.log(`${c().gray("LLM API Key:")} ${c().gray("(empty; maybe using env TAURUSDB_LLM_API_KEY)")}`);
  });

llmCmd
  .command("test")
  .description("测试 LLM 连通性")
  .action(async function () {
    const opts = getRootOptions(this);
    const cfg = await loadProfile(opts.profile);
    if (!cfg.llm?.base_url || !cfg.llm?.model) {
      throw new Error("未配置 LLM，请先运行: taurusdb llm configure");
    }
    const client = new LLMClient(cfg.llm);
    console.log(`${c().gray("LLM Base URL:")} ${c().cyan(cfg.llm.base_url)}`);
    console.log(`${c().gray("LLM Model:")} ${c().cyan(cfg.llm.model)}`);
    console.log(c().gray("正在发送 Ping..."));
    try {
      const out = await client.ping();
      console.log(c().green("  ✓ 连接成功"));
      console.log(`${c().gray("响应:")} ${out.content.trim()}`);
    } catch (err) {
      console.log(c().red(`  ✗ 连接失败: ${(err as Error).message}`));
    }
  });

program
  .command("ask")
  .description("自然语言转命令（需要先配置 llm）")
  .argument("<text...>", "自然语言描述")
  .action(async function (parts: string[]) {
    const opts = getRootOptions(this);
    await runAsk(opts.profile, parts.join(" "));
  });

program
  .command("chat")
  .description("进入交互模式")
  .action(async function () {
    const opts = getRootOptions(this);
    await startChat(opts.profile, async (cmdLine) => {
      const args = cmdLine.trim().split(/\s+/).filter(Boolean);
      if (args.length === 0) return;
      await program.parseAsync([process.argv[0], process.argv[1], ...args], { from: "user" });
    });
  });

const isDirectRun = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return fileURLToPath(import.meta.url) === path.resolve(argv1);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  program.parseAsync(process.argv).catch((err) => {
    console.error(`  ${c().red("✗")} ${(err as Error).message}`);
    process.exit(1);
  });
}
