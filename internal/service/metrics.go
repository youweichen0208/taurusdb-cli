package service

import (
	"fmt"
	"math"
	"strings"
	"time"

	cesModel "github.com/huaweicloud/huaweicloud-sdk-go-v3/services/ces/v1/model"
	gaussModel "github.com/huaweicloud/huaweicloud-sdk-go-v3/services/gaussdb/v3/model"

	cliModel "github.com/youweichen/taurusdb-cli/internal/model"
	"github.com/youweichen/taurusdb-cli/sdk"
)

// FetchInstanceMetrics queries Cloud Eye (CES) for a few key metrics that match
// the console "instance overview" style: CPU/Memory/SlowQueries/Connections.
//
// Notes:
// - GaussDB(for MySQL) uses namespace "SYS.GAUSSDB".
// - Dimensions are typically: gaussdb_mysql_instance_id, gaussdb_mysql_node_id.
// - Metric names are from the official GaussDB(for MySQL) monitoring doc.
func FetchInstanceMetrics(profile string, inst *gaussModel.MysqlInstanceInfoDetailUnifyStatus) (*cliModel.InstanceMetrics, error) {
	if inst == nil {
		return nil, fmt.Errorf("实例为空")
	}
	node := pickMasterNode(inst.Nodes)
	if node == nil || strings.TrimSpace(node.Id) == "" {
		return nil, fmt.Errorf("无法确定 master 节点 ID")
	}

	client, err := sdk.NewCESClient(profile)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	to := now.UnixMilli()
	// Fetch a small window and take the latest datapoint to avoid "aggregation not ready" empties.
	period := int32(300) // 5m
	window := 60 * time.Minute
	from := now.Add(-window).UnixMilli()

	dim0 := fmt.Sprintf("%s,%s", "gaussdb_mysql_instance_id", inst.Id)
	dim1 := fmt.Sprintf("%s,%s", "gaussdb_mysql_node_id", node.Id)

	ns := "SYS.GAUSSDB"
	out := &cliModel.InstanceMetrics{}
	var firstErr error

	cpu, err := fetchLatestPoint(client, sdk.MetricDataOptions{
		Namespace:     ns,
		MetricName:    "gaussdb_mysql001_cpu_util",
		Dim0:          dim0,
		Dim1:          &dim1,
		FromMs:        from,
		ToMs:          to,
		PeriodSeconds: period,
		Filter:        sdk.MetricFilterAverage,
	}, pickValue("average"))
	if err != nil && firstErr == nil {
		firstErr = err
	}
	out.CPUUtilPct = cpu

	mem, err := fetchLatestPoint(client, sdk.MetricDataOptions{
		Namespace:     ns,
		MetricName:    "gaussdb_mysql002_mem_util",
		Dim0:          dim0,
		Dim1:          &dim1,
		FromMs:        from,
		ToMs:          to,
		PeriodSeconds: period,
		Filter:        sdk.MetricFilterAverage,
	}, pickValue("average"))
	if err != nil && firstErr == nil {
		firstErr = err
	}
	out.MemUtilPct = mem

	slow, err := fetchLatestPoint(client, sdk.MetricDataOptions{
		Namespace:     ns,
		MetricName:    "gaussdb_mysql074_slow_queries",
		Dim0:          dim0,
		Dim1:          &dim1,
		FromMs:        from,
		ToMs:          to,
		PeriodSeconds: period,
		Filter:        sdk.MetricFilterSum,
	}, pickValue("sum"))
	if err != nil && firstErr == nil {
		firstErr = err
	}
	out.SlowQueries = slow

	conn, err := fetchLatestPoint(client, sdk.MetricDataOptions{
		Namespace:     ns,
		MetricName:    "gaussdb_mysql006_conn_count",
		Dim0:          dim0,
		Dim1:          &dim1,
		FromMs:        from,
		ToMs:          to,
		PeriodSeconds: period,
		Filter:        sdk.MetricFilterAverage,
	}, pickValue("average"))
	if err != nil && firstErr == nil {
		firstErr = err
	}
	out.ConnCount = conn

	return out, firstErr
}

func pickMasterNode(nodes *[]gaussModel.MysqlInstanceNodeInfo) *gaussModel.MysqlInstanceNodeInfo {
	if nodes == nil || len(*nodes) == 0 {
		return nil
	}
	for i := range *nodes {
		n := &(*nodes)[i]
		if n.Type != nil && strings.ToLower(strings.TrimSpace(*n.Type)) == "master" {
			return n
		}
	}
	return &(*nodes)[0]
}

type datapointValuePicker func(dp cesModel.Datapoint) *float64

func pickValue(filter string) datapointValuePicker {
	switch strings.ToLower(filter) {
	case "max":
		return func(dp cesModel.Datapoint) *float64 { return dp.Max }
	case "min":
		return func(dp cesModel.Datapoint) *float64 { return dp.Min }
	case "sum":
		return func(dp cesModel.Datapoint) *float64 { return dp.Sum }
	case "variance":
		return func(dp cesModel.Datapoint) *float64 { return dp.Variance }
	default:
		return func(dp cesModel.Datapoint) *float64 { return dp.Average }
	}
}

func fetchLatestPoint(client *sdk.CESClient, opts sdk.MetricDataOptions, pick datapointValuePicker) (*cliModel.MetricPoint, error) {
	resp, err := client.ShowMetricData(opts)
	if err != nil {
		return nil, err
	}
	if resp == nil || resp.Datapoints == nil || len(*resp.Datapoints) == 0 {
		return nil, nil
	}

	var best *cesModel.Datapoint
	for i := range *resp.Datapoints {
		dp := &(*resp.Datapoints)[i]
		if best == nil || dp.Timestamp > best.Timestamp {
			best = dp
		}
	}
	if best == nil {
		return nil, nil
	}
	vp := pick(*best)
	if vp == nil {
		return nil, nil
	}
	unit := ""
	if best.Unit != nil {
		unit = *best.Unit
	}
	v := *vp
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return nil, nil
	}
	return &cliModel.MetricPoint{
		Value:       v,
		Unit:        unit,
		TimestampMs: best.Timestamp,
	}, nil
}
