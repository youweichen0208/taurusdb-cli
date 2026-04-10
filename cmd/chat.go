// cmd/chat.go
package cmd

import (
	"fmt"
	"os"
	"strings"

	prompt "github.com/c-bata/go-prompt"
	"github.com/fatih/color"
	"github.com/youweichen/taurusdb-cli/config"
)

// 定义所有斜杠指令
var slashCommands = []prompt.Suggest{
	{Text: "/instance list", Description: "列出所有实例"},
	{Text: "/instance create", Description: "创建新实例"},
	{Text: "/instance show", Description: "查看实例详情"},
	{Text: "/instance delete", Description: "删除实例"},
	{Text: "/instance restart", Description: "重启实例"},
	{Text: "/flavor list", Description: "查询可用规格"},
	{Text: "/backup create", Description: "创建备份"},
	{Text: "/backup list", Description: "列出备份"},
	{Text: "/diagnose", Description: "诊断数据库问题"},
	{Text: "/status", Description: "查看当前配置和连接状态"},
	{Text: "/help", Description: "显示帮助信息"},
	{Text: "/clear", Description: "清屏"},
	{Text: "/exit", Description: "退出"},
}

// 自动补全：输入 / 时弹出指令列表
func completer(d prompt.Document) []prompt.Suggest {
	text := d.TextBeforeCursor()
	if strings.HasPrefix(text, "/") {
		return prompt.FilterHasPrefix(slashCommands, text, true)
	}
	return nil
}

// chatDispatch 是 chat 模块调用 cobra 命令的入口，由 root.go 在启动时注入，避免循环依赖。
var chatDispatch func(input string)

func executor(input string) {
	input = strings.TrimSpace(input)
	if input == "" {
		return
	}

	// 单独输入 / 时打印可用指令列表
	if input == "/" {
		printChatHelp()
		fmt.Println("  💡 输入 / 后可用 ↑↓ 方向键选择指令")
		fmt.Println()
		return
	}

	handleSlashCommand(input)
}

func handleSlashCommand(input string) {
	cmdText := strings.ToLower(strings.TrimSpace(input))

	switch {
	case cmdText == "/exit" || cmdText == "/quit":
		fmt.Println(color.HiYellowString("  👋 正在退出 taurusdb-cli..."))
		os.Exit(0)

	case cmdText == "/clear":
		fmt.Print("\033[H\033[2J")
		printChatBanner()

	case cmdText == "/help":
		printChatHelp()

	case cmdText == "/status":
		showStatus()

	case strings.HasPrefix(cmdText, "/instance"),
		strings.HasPrefix(cmdText, "/flavor"),
		strings.HasPrefix(cmdText, "/backup"),
		cmdText == "/diagnose":
		rawArgs := strings.TrimPrefix(strings.TrimSpace(input), "/")
		fmt.Printf(color.CyanString("  ⚙️  执行: %s\n"), rawArgs)
		if chatDispatch != nil {
			chatDispatch(rawArgs)
		}

	default:
		if strings.HasPrefix(input, "/") {
			fmt.Printf(color.RedString("  ✗ 未知指令: %s\n"), input)
			fmt.Println("  输入 /help 查看可用指令")
		} else {
			// 自然语言，留给 Agent
			fmt.Println("  Agent is about to process...")
		}
	}
}

// printChatBanner 清屏后显示的精简 banner
func printChatBanner() {
	cyan := color.New(color.FgHiCyan, color.Bold).SprintFunc()
	dim := color.New(color.FgHiBlack).SprintFunc()
	fmt.Println()
	fmt.Printf("  %s  %s\n", cyan("🐂 TaurusDB CLI"), dim("华为云数据库命令行工具"))
	fmt.Printf("  %s\n", dim("输入 / 选择指令，输入 /exit 退出"))
	fmt.Println()
}

// showStatus 显示当前 profile 的配置信息
func showStatus() {
	bold := color.New(color.Bold).SprintFunc()
	cyan := color.New(color.FgHiCyan).SprintFunc()
	green := color.New(color.FgGreen).SprintFunc()
	dim := color.New(color.FgHiBlack).SprintFunc()

	cfg, err := config.Load(profile)
	fmt.Println()
	fmt.Printf("  %s\n", bold("当前连接状态"))
	fmt.Println("  ─────────────────────────────")
	fmt.Printf("  %-12s %s\n", dim("Profile:"), cyan(profile))
	if err != nil {
		fmt.Printf("  %-12s %s\n", dim("配置:"), color.RedString("未配置，请运行 taurusdb configure"))
	} else {
		fmt.Printf("  %-12s %s\n", dim("Region:"), cyan(cfg.Region))
		fmt.Printf("  %-12s %s\n", dim("Project ID:"), cyan(cfg.ProjectID))
		fmt.Printf("  %-12s %s\n", dim("AK:"), cyan(cfg.AK[:min(8, len(cfg.AK))]+strings.Repeat("*", max(0, len(cfg.AK)-8))))
		fmt.Printf("  %-12s %s\n", dim("状态:"), green("✓ 已配置"))
	}
	fmt.Println()
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func printChatHelp() {
	bold := color.New(color.Bold).SprintFunc()
	cyan := color.New(color.FgHiCyan).SprintFunc()
	dim := color.New(color.FgHiBlack).SprintFunc()

	fmt.Println()
	fmt.Printf("  %s\n", bold("可用指令"))
	fmt.Println("  ─────────────────────────────────────────")
	for _, s := range slashCommands {
		fmt.Printf("  %s  %s\n", cyan(fmt.Sprintf("%-25s", s.Text)), dim(s.Description))
	}
	fmt.Println()
}

func startChat() {
	printChatBanner()

	p := prompt.New(
		executor,
		completer,
		prompt.OptionPrefix("taurusdb> "),
		prompt.OptionTitle("TaurusDB CLI"),
		prompt.OptionPrefixTextColor(prompt.Cyan),
		prompt.OptionSuggestionBGColor(prompt.DarkGray),
		prompt.OptionSuggestionTextColor(prompt.White),
		prompt.OptionSelectedSuggestionBGColor(prompt.Purple),
		prompt.OptionSelectedSuggestionTextColor(prompt.White),
		prompt.OptionDescriptionBGColor(prompt.DarkGray),
		prompt.OptionDescriptionTextColor(prompt.LightGray),
	)
	p.Run()
}
