package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
	"github.com/youweichen/taurusdb-cli/config"
	"github.com/youweichen/taurusdb-cli/internal/render"
	"github.com/youweichen/taurusdb-cli/internal/service"
	"github.com/youweichen/taurusdb-cli/sdk"
)

// ==================== instance show ====================

var instanceShowCmd = &cobra.Command{
	Use:   "show <instance-id>",
	Short: "查看单个实例完整详情",
	Long: `查看单个实例完整详情，包含连接信息。

示例：
  taurusdb instance show i-abc123
  taurusdb instance show i-abc123 --output json
  taurusdb instance show i-abc123 --profile prod`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		return runInstanceShow(profile, args[0], output)
	},
}

func init() {
	instanceCmd.AddCommand(instanceShowCmd)
}

// ==================== 实现 ====================

func runInstanceShow(profileName, instanceID, outputFmt string) error {
	inst, err := service.ShowInstance(profileName, instanceID)
	if err != nil {
		if apiErr, ok := err.(*sdk.ApiError); ok && apiErr.Code == "DBS.200001" {
			return fmt.Errorf("实例 %q 不存在", instanceID)
		}
		return fmt.Errorf("查询实例失败: %w", err)
	}
	if inst == nil {
		return fmt.Errorf("实例 %q 不存在", instanceID)
	}

	switch strings.ToLower(outputFmt) {
	case "json":
		return render.JSON(inst)
	case "yaml":
		return render.YAML(inst)
	default:
		cfg, err := config.Load(profileName)
		if err != nil {
			return fmt.Errorf("读取配置失败: %w", err)
		}
		return render.InstanceDetail(inst, cfg.Region)
	}
}
