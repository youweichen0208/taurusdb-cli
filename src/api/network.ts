import { makeClient } from "../http/client.js";
import type { TaurusConfig, VpcItem, SubnetItem, SecurityGroupItem } from "../types/index.js";

export async function listVpcs(cfg: TaurusConfig): Promise<VpcItem[]> {
  const client = makeClient(cfg);
  const resp = await client.request<{ vpcs?: VpcItem[] }>(
    "vpc",
    "GET",
    "/v2.0/vpcs",
    { limit: "200" },
  );
  return resp.vpcs ?? [];
}

export async function listSubnets(
  cfg: TaurusConfig,
  vpcId: string,
): Promise<SubnetItem[]> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const resp = await client.request<{ subnets?: SubnetItem[] }>(
    "vpc",
    "GET",
    `/v1/${projectId}/subnets`,
    {
      limit: "200",
      vpc_id: vpcId,
    },
  );
  return resp.subnets ?? [];
}

export async function listSecurityGroups(
  cfg: TaurusConfig,
  vpcId: string,
): Promise<SecurityGroupItem[]> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const resp = await client.request<{ security_groups?: SecurityGroupItem[] }>(
    "vpc",
    "GET",
    `/v1/${projectId}/security-groups`,
    {
      limit: "200",
      vpc_id: vpcId,
    },
  );
  return resp.security_groups ?? [];
}