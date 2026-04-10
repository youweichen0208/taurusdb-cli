package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/youweichen/taurusdb-cli/sdk"
)

var connectCmd = &cobra.Command{
	Use:   "connect",
	Short: "验证华为云 GaussDB SDK 连接",
	Long: `测试当前 profile 的 AK/SK 是否能成功连接华为云 GaussDB。

示例：
  taurusdb connect
  taurusdb connect --profile prod`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runConnect(profile)
	},
}

func init() {
	rootCmd.AddCommand(connectCmd)
}

func runConnect(profileName string) error {
	fmt.Printf("正在连接华为云 TaurusDB (profile: %s)...\n", profileName)

	client, err := sdk.NewGaussDBClient(profileName)
	if err != nil {
		return fmt.Errorf("连接失败: %w", err)
	}

	resp, err := client.ListInstances()
	if err != nil {
		return fmt.Errorf("连接失败: %w", err)
	}

	count := 0
	if resp.Instances != nil {
		count = len(*resp.Instances)
	}

	fmt.Printf("✓ 连接成功！当前 pr¬oject 下共有 %d 个 GaussDB 实例\n", count)
	return nil
}
