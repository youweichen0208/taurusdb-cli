package cmd

import (
	"fmt"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"github.com/youweichen/taurusdb-cli/internal/render"
	"github.com/youweichen/taurusdb-cli/internal/service"
)

// ==================== instance (parent) ====================

var instanceCmd = &cobra.Command{
	Use:   "instance",
	Short: "管理数据库实例",
	Long:  `管理华为云 TaurusDB (GaussDB) 数据库实例。`,
}

// ==================== instance list ====================

var instanceListCmd = &cobra.Command{
	Use:   "list",
	Short: "列出所有实例",
	Long: `列出当前 project 下的所有 GaussDB 实例。

示例：
  taurusdb instance list
  taurusdb instance list --output json
  taurusdb instance list --profile prod`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return runInstanceList(profile, output)
	},
}

func init() {
	rootCmd.AddCommand(instanceCmd)
	instanceCmd.AddCommand(instanceListCmd)
}

// ==================== 实现 ====================

func runInstanceList(profileName, outputFmt string) error {
	dim := color.New(color.FgHiBlack).SprintFunc()
	fmt.Printf("  %s\n", dim(fmt.Sprintf("正在查询实例列表 (profile: %s)...", profileName)))

	instances, err := service.ListInstances(profileName)
	if err != nil {
		return fmt.Errorf("查询实例失败: %w", err)
	}

	if len(instances) == 0 {
		fmt.Println(color.YellowString("  ⚠ 当前 project 下没有 GaussDB 实例"))
		return nil
	}

	switch strings.ToLower(outputFmt) {
	case "json":
		return render.JSON(instances)
	case "yaml":
		return render.YAML(instances)
	default:
		return render.InstanceTable(instances)
	}
}
