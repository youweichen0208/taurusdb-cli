package sdk

import (
	"fmt"
	"strings"

	"github.com/huaweicloud/huaweicloud-sdk-go-v3/core/auth/basic"
	ces "github.com/huaweicloud/huaweicloud-sdk-go-v3/services/ces/v1"
	cesModel "github.com/huaweicloud/huaweicloud-sdk-go-v3/services/ces/v1/model"
	cesRegion "github.com/huaweicloud/huaweicloud-sdk-go-v3/services/ces/v1/region"

	"github.com/youweichen/taurusdb-cli/config"
)

// CESClient wraps the official Huawei Cloud CES (Cloud Eye) SDK client.
type CESClient struct {
	inner *ces.CesClient
}

func NewCESClient(profile string) (*CESClient, error) {
	cfg, err := config.Load(profile)
	if err != nil {
		return nil, err
	}

	auth, err := basic.NewCredentialsBuilder().
		WithAk(cfg.AK).
		WithSk(cfg.SK).
		WithProjectId(cfg.ProjectID).
		SafeBuild()
	if err != nil {
		return nil, &ApiError{
			Code:     "AUTH_BUILD_FAILED",
			Friendly: "构建认证信息失败",
			Hint:     "请运行 taurusdb configure 重新配置认证信息",
		}
	}

	hcClient, err := ces.CesClientBuilder().
		WithRegion(cesRegion.ValueOf(cfg.Region)).
		WithCredential(auth).
		SafeBuild()
	if err != nil {
		return nil, &ApiError{
			Code:     "CLIENT_BUILD_FAILED",
			Friendly: "构建 CES 客户端失败",
			Hint:     "请检查 Region 配置是否正确",
		}
	}

	return &CESClient{inner: ces.NewCesClient(hcClient)}, nil
}

type MetricFilter string

const (
	MetricFilterAverage MetricFilter = "average"
	MetricFilterMax     MetricFilter = "max"
	MetricFilterMin     MetricFilter = "min"
	MetricFilterSum     MetricFilter = "sum"
)

func toCESFilter(f MetricFilter) (cesModel.ShowMetricDataRequestFilter, error) {
	e := cesModel.GetShowMetricDataRequestFilterEnum()
	switch strings.ToLower(string(f)) {
	case "", "average":
		return e.AVERAGE, nil
	case "max":
		return e.MAX, nil
	case "min":
		return e.MIN, nil
	case "sum":
		return e.SUM, nil
	default:
		return cesModel.ShowMetricDataRequestFilter{}, fmt.Errorf("unsupported filter %q", f)
	}
}

func toCESPeriod(seconds int32) (cesModel.ShowMetricDataRequestPeriod, error) {
	e := cesModel.GetShowMetricDataRequestPeriodEnum()
	switch seconds {
	case 1:
		return e.E_1, nil
	case 60:
		return e.E_60, nil
	case 300:
		return e.E_300, nil
	case 1200:
		return e.E_1200, nil
	case 3600:
		return e.E_3600, nil
	case 14400:
		return e.E_14400, nil
	case 86400:
		return e.E_86400, nil
	default:
		return cesModel.ShowMetricDataRequestPeriod{}, fmt.Errorf("unsupported period %d", seconds)
	}
}

type MetricDataOptions struct {
	Namespace  string
	MetricName string
	Dim0       string
	Dim1       *string

	FromMs int64
	ToMs   int64

	PeriodSeconds int32
	Filter        MetricFilter
}

func (c *CESClient) ShowMetricData(opts MetricDataOptions) (*cesModel.ShowMetricDataResponse, error) {
	if c == nil || c.inner == nil {
		return nil, fmt.Errorf("CES client is nil")
	}
	filter, err := toCESFilter(opts.Filter)
	if err != nil {
		return nil, err
	}
	period, err := toCESPeriod(opts.PeriodSeconds)
	if err != nil {
		return nil, err
	}

	req := &cesModel.ShowMetricDataRequest{
		Namespace:  opts.Namespace,
		MetricName: opts.MetricName,
		Dim0:       opts.Dim0,
		Dim1:       opts.Dim1,
		Filter:     filter,
		Period:     period,
		From:       opts.FromMs,
		To:         opts.ToMs,
	}

	resp, err := c.inner.ShowMetricData(req)
	if err != nil {
		return nil, translateSdkError(err)
	}
	return resp, nil
}
