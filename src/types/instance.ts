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

export type Instance = {
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

export type InstanceNode = {
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

export type MetricPoint = {
  value: number;
  unit: string;
  timestamp_ms: number;
};

export type InstanceMetrics = {
  cpu_util_pct?: MetricPoint;
  mem_util_pct?: MetricPoint;
  slow_queries?: MetricPoint;
  conn_count?: MetricPoint;
};
