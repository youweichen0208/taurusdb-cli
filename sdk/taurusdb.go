package sdk

import (
	"github.com/huaweicloud/huaweicloud-sdk-go-v3/core/auth/basic"
	gaussdb "github.com/huaweicloud/huaweicloud-sdk-go-v3/services/gaussdb/v3"
	"github.com/huaweicloud/huaweicloud-sdk-go-v3/services/gaussdb/v3/model"
	region "github.com/huaweicloud/huaweicloud-sdk-go-v3/services/gaussdb/v3/region"

	"github.com/youweichen/taurusdb-cli/config"
)

// TaurusDBClient wraps the official Huawei Cloud GaussDB SDK client.
type TaurusDBClient struct {
	inner *gaussdb.GaussDBClient
}

// NewGaussDBClient creates a GaussDBClient from the given profile.
func NewGaussDBClient(profile string) (*TaurusDBClient, error) {
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

	hcClient, err := gaussdb.GaussDBClientBuilder().
		WithRegion(region.ValueOf(cfg.Region)).
		WithCredential(auth).
		SafeBuild()
	if err != nil {
		return nil, &ApiError{
			Code:     "CLIENT_BUILD_FAILED",
			Friendly: "构建 GaussDB 客户端失败",
			Hint:     "请检查 Region 配置是否正确",
		}
	}

	return &TaurusDBClient{inner: gaussdb.NewGaussDBClient(hcClient)}, nil
}

// ListInstances returns all TaurusDB instances under the configured project.
func (c *TaurusDBClient) ListInstances() (*model.ListGaussMySqlInstancesUnifyStatusResponse, error) {
	request := &model.ListGaussMySqlInstancesUnifyStatusRequest{}
	response, err := c.inner.ListGaussMySqlInstancesUnifyStatus(request)
	if err != nil {
		return nil, translateSdkError(err)
	}
	return response, nil
}
