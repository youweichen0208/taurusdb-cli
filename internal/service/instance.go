package service

import (
	"github.com/huaweicloud/huaweicloud-sdk-go-v3/services/gaussdb/v3/model"

	"github.com/youweichen/taurusdb-cli/sdk"
)

// ListInstances loads instances for the given profile through the official SDK.
func ListInstances(profile string) ([]model.MysqlInstanceListInfoUnifyStatus, error) {
	client, err := sdk.NewGaussDBClient(profile)
	if err != nil {
		return nil, err
	}

	resp, err := client.ListInstances()
	if err != nil {
		return nil, err
	}
	if resp.Instances == nil {
		return nil, nil
	}

	return *resp.Instances, nil
}
