import { makeClient } from "../http/client.js";
import type {
  TaurusConfig,
  Instance,
  InstanceNode,
  InstanceMetrics,
  MetricPoint,
} from "../types/index.js";

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
  },
): Promise<
  Array<{
    average?: number;
    max?: number;
    min?: number;
    sum?: number;
    timestamp: number;
    unit?: string;
  }>
> {
  const client = makeClient(cfg);
  const projectId = cfg.project_id!.trim();
  const query: Record<string, string> = {
    namespace: opts.namespace,
    metric_name: opts.metricName,
    "dim.0": opts.dim0,
    from: String(opts.fromMs),
    to: String(opts.toMs),
    period: String(opts.periodSeconds),
    filter: opts.filter,
  };
  if (opts.dim1?.trim()) query["dim.1"] = opts.dim1.trim();
  const resp = await client.request<{
    datapoints?: Array<{
      average?: number;
      max?: number;
      min?: number;
      sum?: number;
      timestamp: number;
      unit?: string;
    }>;
  }>("ces", "GET", `/V1.0/${projectId}/metric-data`, query);
  return resp.datapoints ?? [];
}

function pickMasterNode(inst: Instance): InstanceNode | null {
  const nodes = inst.nodes ?? [];
  if (nodes.length === 0) return null;
  const master = nodes.find(
    (n) => (n.type ?? "").trim().toLowerCase() === "master",
  );
  return master ?? nodes[0];
}

function pickDatapointValue(
  dp: {
    average?: number;
    max?: number;
    min?: number;
    sum?: number;
    timestamp: number;
    unit?: string;
  },
  filter: "average" | "max" | "min" | "sum",
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
  },
): Promise<MetricPoint | undefined> {
  const datapoints = await showMetricData(cfg, opts);
  if (datapoints.length === 0) return undefined;
  const latest = datapoints.reduce((best, cur) =>
    cur.timestamp > best.timestamp ? cur : best,
  );
  const value = pickDatapointValue(latest, opts.filter);
  if (value === undefined || Number.isNaN(value) || !Number.isFinite(value))
    return undefined;
  return {
    value,
    unit: (latest.unit ?? "").trim(),
    timestamp_ms: latest.timestamp,
  };
}

export async function fetchInstanceMetrics(
  cfg: TaurusConfig,
  inst: Instance,
): Promise<InstanceMetrics> {
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
    filter: "average",
  });
  metrics.mem_util_pct = await fetchLatestMetricPoint(cfg, {
    namespace: ns,
    metricName: "gaussdb_mysql002_mem_util",
    dim0,
    dim1,
    fromMs,
    toMs: now,
    periodSeconds,
    filter: "average",
  });
  metrics.slow_queries = await fetchLatestMetricPoint(cfg, {
    namespace: ns,
    metricName: "gaussdb_mysql074_slow_queries",
    dim0,
    dim1,
    fromMs,
    toMs: now,
    periodSeconds,
    filter: "sum",
  });
  metrics.conn_count = await fetchLatestMetricPoint(cfg, {
    namespace: ns,
    metricName: "gaussdb_mysql006_conn_count",
    dim0,
    dim1,
    fromMs,
    toMs: now,
    periodSeconds,
    filter: "average",
  });
  return metrics;
}