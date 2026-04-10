package cmd

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"github.com/youweichen/taurusdb-cli/sdk"
	"gopkg.in/yaml.v3"
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

	client, err := sdk.NewGaussDBClient(profileName)
	if err != nil {
		return fmt.Errorf("初始化客户端失败: %w", err)
	}

	resp, err := client.ListInstances()
	if err != nil {
		return fmt.Errorf("查询实例失败: %w", err)
	}

	if resp.Instances == nil || len(*resp.Instances) == 0 {
		fmt.Println(color.YellowString("  ⚠ 当前 project 下没有 GaussDB 实例"))
		return nil
	}

	instances := *resp.Instances

	switch strings.ToLower(outputFmt) {
	case "json":
		return printJSON(instances)
	case "yaml":
		return printYAML(instances)
	default:
		printInstanceTable(instances)
		return nil
	}
}

// ==================== 输出格式 ====================

// instanceRow 提取每个实例的关键字段用于展示
type instanceRow struct {
	ID      string `json:"id" yaml:"id"`
	Name    string `json:"name" yaml:"name"`
	Status  string `json:"status" yaml:"status"`
	Engine  string `json:"engine" yaml:"engine"`
	Version string `json:"version" yaml:"version"`
	Type    string `json:"type" yaml:"type"`
}

func printInstanceTable(instances interface{}) {
	bold := color.New(color.Bold).SprintFunc()
	cyan := color.New(color.FgHiCyan).SprintFunc()
	green := color.New(color.FgGreen).SprintFunc()
	red := color.New(color.FgRed).SprintFunc()
	yellow := color.New(color.FgYellow).SprintFunc()
	dim := color.New(color.FgHiBlack).SprintFunc()

	// 使用类型断言处理华为云 SDK 的实例列表
	type instanceLike interface {
		GetId() string
		GetName() string
		GetStatus() string
	}

	// 通过 JSON 序列化/反序列化提取字段（兼容 SDK model 的不同版本）
	data, err := json.Marshal(instances)
	if err != nil {
		fmt.Println(color.RedString("  ✗ 格式化输出失败: %v", err))
		return
	}

	var rows []map[string]interface{}
	if err := json.Unmarshal(data, &rows); err != nil {
		fmt.Println(color.RedString("  ✗ 解析实例数据失败: %v", err))
		return
	}

	fmt.Println()
	fmt.Printf("  %s  共 %s 个实例\n", bold("实例列表"), cyan(fmt.Sprintf("%d", len(rows))))
	fmt.Println("  ═══════════════════════════════════════════════════════════════════════════")
	fmt.Printf("  %-4s %-36s %-20s %-12s %-10s\n",
		dim("#"), dim("实例ID"), dim("名称"), dim("状态"), dim("引擎"))
	fmt.Println("  ───────────────────────────────────────────────────────────────────────────")

	for i, row := range rows {
		id := getStr(row, "id")
		name := getStr(row, "name")
		status := getStr(row, "status")
		engine := getStr(row, "engine")
		version := getStr(row, "engine_version")

		// 状态着色
		var statusColored string
		switch strings.ToLower(status) {
		case "available", "active", "running":
			statusColored = green("✓ " + status)
		case "creating", "rebooting", "resizing":
			statusColored = yellow("⟳ " + status)
		default:
			statusColored = red("✗ " + status)
		}

		engineStr := engine
		if version != "" {
			engineStr = engine + " " + version
		}

		fmt.Printf("  %-4d %-36s %-20s %-12s %-10s\n",
			i+1, cyan(id), bold(truncate(name, 18)), statusColored, dim(engineStr))
	}

	fmt.Println("  ═══════════════════════════════════════════════════════════════════════════")
	fmt.Println()
}

func printJSON(v interface{}) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("JSON 序列化失败: %w", err)
	}
	fmt.Println(string(data))
	return nil
}

func printYAML(v interface{}) error {
	data, err := yaml.Marshal(v)
	if err != nil {
		return fmt.Errorf("YAML 序列化失败: %w", err)
	}
	fmt.Println(string(data))
	return nil
}

// ==================== 工具函数 ====================

func getStr(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok && v != nil {
		return fmt.Sprintf("%v", v)
	}
	return "-"
}

func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen-1]) + "…"
}
