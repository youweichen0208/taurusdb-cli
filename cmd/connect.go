package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/youweichen/taurusdb-cli/internal/service"
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

	count, err := service.CheckConnection(profileName)
	if err != nil {
		return fmt.Errorf("连接失败: %w", err)
	}

	fmt.Printf("✓ 连接成功！当前 project 下共有 %d 个 GaussDB 实例\n", count)
	return nil
}
