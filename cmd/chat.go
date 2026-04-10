// cmd/chat.go
package cmd

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	prompt "github.com/c-bata/go-prompt"
	"github.com/fatih/color"
	"github.com/youweichen/taurusdb-cli/config"
	"github.com/youweichen/taurusdb-cli/sdk"
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
	{Text: "/configure", Description: "配置华为云认证信息"},
	{Text: "/connect", Description: "验证连接"},
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

	// 单独输入 / 时，直接执行第一个指令（等同于默认选中第一个）
	if input == "/" {
		first := slashCommands[0]
		dim := color.New(color.FgHiBlack).SprintFunc()
		fmt.Printf("  %s %s\n", dim("自动选择:"), color.CyanString(first.Text))
		handleSlashCommand(first.Text)
		return
	}

	// 模糊匹配：输入不完整的指令时自动匹配首选
	if strings.HasPrefix(input, "/") {
		matched := fuzzyMatchCommand(input)
		if matched != input {
			dim := color.New(color.FgHiBlack).SprintFunc()
			fmt.Printf("  %s %s → %s\n", dim("自动匹配:"), input, color.CyanString(matched))
		}
		input = matched
	}

	handleSlashCommand(input)
}

// fuzzyMatchCommand 模糊匹配斜杠指令。
// 输入不完整的指令（如 "/lis"、"/ins"）时，自动匹配第一个前缀匹配的完整指令。
func fuzzyMatchCommand(input string) string {
	lower := strings.ToLower(input)
	// 先找完全匹配
	for _, s := range slashCommands {
		if strings.ToLower(s.Text) == lower {
			return s.Text
		}
	}
	// 再找前缀匹配，返回第一个
	for _, s := range slashCommands {
		if strings.HasPrefix(strings.ToLower(s.Text), lower) {
			return s.Text
		}
	}
	return input
}

// readNumberInput 在 go-prompt 的 raw 模式下逐字节读取数字输入。
// 返回值: >0 = 用户选择的编号, 0 = 直接按 Enter（空输入）, -1 = 取消(Ctrl+C)。
func readNumberInput(maxChoice int) int {
	buf := make([]byte, 1)
	var input []byte

	for {
		n, err := os.Stdin.Read(buf)
		if err != nil || n == 0 {
			return -1
		}
		b := buf[0]

		switch {
		case b == 3: // Ctrl+C
			fmt.Println()
			return -1
		case b == '\r' || b == '\n': // Enter
			fmt.Println()
			if len(input) == 0 {
				return 0 // 空输入，由调用方决定默认值
			}
			num, err := strconv.Atoi(string(input))
			if err != nil || num < 1 || num > maxChoice {
				fmt.Printf(color.RedString("  ✗ 无效选择，请输入 1-%d\n"), maxChoice)
				return -1
			}
			return num
		case b == 127 || b == 8: // Backspace / DEL
			if len(input) > 0 {
				input = input[:len(input)-1]
				fmt.Print("\b \b") // 回退光标并清除字符
			}
		case b >= '0' && b <= '9': // 数字
			input = append(input, b)
			fmt.Print(string(b)) // 回显
		}
		// 其他字符静默忽略
	}
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

	case cmdText == "/configure":
		fmt.Println()
		if chatDispatch != nil {
			chatDispatch("configure")
		}

	case cmdText == "/connect":
		fmt.Println()
		if chatDispatch != nil {
			chatDispatch("connect")
		}

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
	checkConfigOnStartup()

	p := prompt.New(
		executor,
		completer,
		prompt.OptionPrefix("taurusdb> "),
		prompt.OptionTitle("TaurusDB CLI"),
		prompt.OptionPrefixTextColor(prompt.Cyan),
		prompt.OptionCompletionOnDown(), // 允许用 ↓ 箭头触发/导航补全
		prompt.OptionSuggestionBGColor(prompt.DarkGray),
		prompt.OptionSuggestionTextColor(prompt.White),
		prompt.OptionSelectedSuggestionBGColor(prompt.Purple),
		prompt.OptionSelectedSuggestionTextColor(prompt.White),
		prompt.OptionDescriptionBGColor(prompt.DarkGray),
		prompt.OptionDescriptionTextColor(prompt.LightGray),
	)
	p.Run()
}

// checkConfigOnStartup 启动时检查配置和连接状态
func checkConfigOnStartup() {
	dim := color.New(color.FgHiBlack).SprintFunc()
	yellow := color.New(color.FgYellow).SprintFunc()
	green := color.New(color.FgGreen).SprintFunc()
	red := color.New(color.FgRed).SprintFunc()

	// 1. 检查配置文件
	cfg, err := config.Load(profile)
	if err != nil {
		fmt.Printf("  %s %s\n", red("✗"), "未检测到有效配置")
		fmt.Printf("  %s\n", yellow("  请运行 /configure 配置华为云认证信息"))
		fmt.Println()
		return
	}

	// 2. 检查关键字段是否为空
	missing := []string{}
	if cfg.AK == "" {
		missing = append(missing, "AK")
	}
	if cfg.SK == "" {
		missing = append(missing, "SK")
	}
	if cfg.Region == "" {
		missing = append(missing, "Region")
	}
	if cfg.ProjectID == "" {
		missing = append(missing, "ProjectID")
	}
	if len(missing) > 0 {
		fmt.Printf("  %s 配置不完整，缺少: %s\n", red("✗"), strings.Join(missing, ", "))
		fmt.Printf("  %s\n", yellow("  请运行 /configure 补充配置"))
		fmt.Println()
		return
	}

	// 3. 尝试连接验证
	fmt.Printf("  %s\n", dim("正在验证华为云连接..."))
	client, err := sdk.NewGaussDBClient(profile)
	if err != nil {
		fmt.Printf("  %s 连接失败: %v\n", red("✗"), err)
		fmt.Printf("  %s\n", yellow("  请运行 /configure 检查配置，或 /connect 重试"))
		fmt.Println()
		return
	}

	resp, err := client.ListInstances()
	if err != nil {
		fmt.Printf("  %s 连接失败: %v\n", red("✗"), err)
		fmt.Printf("  %s\n", yellow("  请运行 /configure 检查配置，或 /connect 重试"))
		fmt.Println()
		return
	}

	count := 0
	if resp.Instances != nil {
		count = len(*resp.Instances)
	}
	fmt.Printf("  %s 连接成功！当前 project 下共有 %s 个实例\n", green("✓"), green(fmt.Sprintf("%d", count)))
	fmt.Println()
}
