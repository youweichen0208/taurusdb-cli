package model

import "time"

// MetricPoint represents a single aggregated metric value at a timestamp.
// TimestampMs uses UNIX epoch milliseconds (consistent with CES API).
type MetricPoint struct {
	Value       float64 `json:"value" yaml:"value"`
	Unit        string  `json:"unit,omitempty" yaml:"unit,omitempty"`
	TimestampMs int64   `json:"timestamp_ms" yaml:"timestamp_ms"`
}

func (p MetricPoint) Time() time.Time {
	return time.UnixMilli(p.TimestampMs)
}

// InstanceMetrics is a small set of "dashboard-like" metrics for an instance.
// Fields are optional: nil means unavailable/no datapoints.
type InstanceMetrics struct {
	CPUUtilPct  *MetricPoint `json:"cpu_util_pct,omitempty" yaml:"cpu_util_pct,omitempty"`
	MemUtilPct  *MetricPoint `json:"mem_util_pct,omitempty" yaml:"mem_util_pct,omitempty"`
	SlowQueries *MetricPoint `json:"slow_queries,omitempty" yaml:"slow_queries,omitempty"`
	ConnCount   *MetricPoint `json:"conn_count,omitempty" yaml:"conn_count,omitempty"`
}
