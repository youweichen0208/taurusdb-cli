package render

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/fatih/color"
	"github.com/huaweicloud/huaweicloud-sdk-go-v3/services/gaussdb/v3/model"
)

// InstanceTable prints a formatted table for instance list results.
func InstanceTable(instances []model.MysqlInstanceListInfoUnifyStatus) error {
	bold := color.New(color.Bold).SprintFunc()
	cyan := color.New(color.FgHiCyan).SprintFunc()
	green := color.New(color.FgGreen).SprintFunc()
	red := color.New(color.FgRed).SprintFunc()
	yellow := color.New(color.FgYellow).SprintFunc()
	dim := color.New(color.FgHiBlack).SprintFunc()

	data, err := json.Marshal(instances)
	if err != nil {
		return fmt.Errorf("格式化输出失败: %w", err)
	}

	var rows []map[string]interface{}
	if err := json.Unmarshal(data, &rows); err != nil {
		return fmt.Errorf("解析实例数据失败: %w", err)
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
		engine := getNestedStr(row, "datastore", "type")
		version := getNestedStr(row, "datastore", "version")

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
	return nil
}

func getStr(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok && v != nil {
		return fmt.Sprintf("%v", v)
	}
	return "-"
}

func getNestedStr(m map[string]interface{}, parent, key string) string {
	v, ok := m[parent]
	if !ok || v == nil {
		return "-"
	}

	child, ok := v.(map[string]interface{})
	if !ok {
		return "-"
	}

	return getStr(child, key)
}

func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen-1]) + "…"
}
