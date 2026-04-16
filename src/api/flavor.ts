import { makeClient } from "../http/client.js";
import type { TaurusConfig, Flavor } from "../types/index.js";

export async function listFlavors(
  cfg: TaurusConfig,
  databaseName: string,
  azMode: string,
  versionName?: string,
  specCode?: string,
): Promise<Flavor[]> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const resp = await client.request<{ flavors?: Flavor[] }>(
    "gaussdb",
    "GET",
    `/v3/${projectId}/flavors`,
    {
      database_name: databaseName,
      availability_zone_mode: azMode,
      version_name: versionName ?? "",
      spec_code: specCode ?? "",
    },
  );
  return resp.flavors ?? [];
}