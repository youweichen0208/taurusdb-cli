import { makeClient } from "../http/client.js";
import { sleep } from "../http/utils.js";
import { buildCreateRequestBody } from "../validation/instance.js";
import { isAzModeUnsupportedError } from "./error-check.js";
import type { TaurusConfig, Instance, InstanceCreateInput } from "../types/index.js";

export async function listInstances(cfg: TaurusConfig): Promise<Instance[]> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const resp = await client.request<{ instances?: Instance[] }>(
    "gaussdb",
    "GET",
    `/v3/${projectId}/instances`,
  );
  return resp.instances ?? [];
}

export async function showInstance(
  cfg: TaurusConfig,
  id: string,
): Promise<Instance | null> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const resp = await client.request<{ instance?: Instance }>(
    "gaussdb",
    "GET",
    `/v3/${projectId}/instances/${id}`,
  );
  return resp.instance ?? null;
}

export async function createInstance(
  cfg: TaurusConfig,
  inputParams: InstanceCreateInput,
): Promise<{
  instance?: { id: string };
  job_id?: string;
  usedAzMode: string;
  warnings: string[];
}> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const { body, warnings } = buildCreateRequestBody(cfg, inputParams);

  const tryModes =
    inputParams.azMode === "auto" ? ["multi", "single"] : [inputParams.azMode];
  let lastErr: Error | undefined;
  for (const m of tryModes) {
    body.availability_zone_mode = m;
    try {
      const resp = await client.request<{
        instance?: { id: string };
        job_id?: string;
      }>("gaussdb", "POST", `/v3/${projectId}/instances`, undefined, body);
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

export async function waitInstanceReady(
  cfg: TaurusConfig,
  instanceId: string,
  timeoutMs: number,
  pollMs: number,
): Promise<Instance> {
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
      throw new Error(
        `实例创建失败，状态=${st}（请用 taurusdb instance show ${instanceId}）`,
      );
    }
    await sleep(pollMs);
  }
  throw new Error(
    `等待超时（${Math.floor(timeoutMs / 1000)}s）：请使用 taurusdb instance show ${instanceId}`,
  );
}