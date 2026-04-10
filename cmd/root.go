package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var (
	profile string
	output  string
	noColor bool
	Version = "dev" // 构建时注入: go build -ldflags "-X taurusdb/cmd.Version=v1.0.0"
)

var interactiveMode bool

var rootCmd = &cobra.Command{
	Use:           "taurusdb",
	Short:         "TaurusDB CLI — 华为云数据库命令行工具 + 智能 Agent",
	SilenceUsage:  true,
	SilenceErrors: true,
	Run: func(cmd *cobra.Command, args []string) {
		if len(args) == 0 && !interactiveMode {
			interactiveMode = true
			startInteractiveMode(cmd)
			interactiveMode = false
		}
	},
}

func init() {
	cobra.OnInitialize(initConfig)

	rootCmd.PersistentFlags().StringVar(&profile, "profile", "default", "配置文件 Profile 名称")
	rootCmd.PersistentFlags().StringVarP(&output, "output", "o", "table", "输出格式: table|json|yaml")
	rootCmd.PersistentFlags().BoolVar(&noColor, "no-color", false, "禁用彩色输出")
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		errIcon := color.New(color.FgRed).Sprint("✗")
		fmt.Fprintf(os.Stderr, "  %s %v\n", errIcon, err)
		os.Exit(1)
	}
}

func initConfig() {
	if noColor {
		color.NoColor = true
	}
}

// ==================== Banner ====================

func printBanner() {
	// 华为云经典红
	hwRed := color.New(color.FgHiRed, color.Bold).SprintFunc()
	// 华为云辅助橙/金
	hwOrange := color.New(color.FgYellow).SprintFunc()

	dim := color.New(color.FgHiBlack).SprintFunc()
	white := color.New(color.FgWhite, color.Bold).SprintFunc()

	// 1. 定义左侧 TAURUS 图案
	taurus := []string{
		"  ████████╗ █████╗ ██╗   ██╗██████╗ ██╗   ██╗███████╗",
		"  ╚══██╔══╝██╔══██╗██║   ██║██╔══██╗██║   ██║██╔════╝",
		"     ██║   ███████║██║   ██║██████╔╝██║   ██║███████╗",
		"     ██║   ██╔══██║██║   ██║██╔══██╗██║   ██║╚════██║",
		"     ██║   ██║  ██║╚██████╔╝██║  ██║╚██████╔╝███████║",
		"     ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝",
	}

	// 2. 定义右侧 DB 图案
	db := []string{
		" ██████╗ ██████╗ ",
		" ██╔══██╗██╔══██╗",
		" ██║  ██║██████╔╝",
		" ██║  ██║██╔══██╗",
		" ██████╔╝██████╔╝",
		" ╚═════╝ ╚═════╝ ",
	}

	fmt.Println()

	// 3. 拼接输出：左红右橙
	for i := 0; i < len(taurus); i++ {
		// 使用红色的 TAURUS 搭配橙色的 DB，模仿品牌标志的色调感
		fmt.Printf("%s  %s\n", hwRed(taurus[i]), hwOrange(db[i]))
	}

	fmt.Println()

	// 4. 底部文字
	// 既然换成了品牌色，底部描述可以保持洁净的白色或带一点灰色
	desc := white("  华为云数据库命令行工具 + 智能 Agent")
	versionInfo := dim("v" + Version)

	fmt.Printf("%s    %s\n", desc, versionInfo)
	fmt.Println()
}

func startInteractiveMode(root *cobra.Command) {
	// 注入 dispatch 函数，让 chat 模块能调用 cobra 命令，避免循环依赖
	chatDispatch = func(input string) {
		executeCommand(root, input)
	}
	printBanner()
	startChat()
}

func executeCommand(root *cobra.Command, input string) {
	args := strings.Fields(input)
	if len(args) == 0 {
		return
	}

	if args[0] == "help" {
		printUsage()
		return
	}

	cmd, _, err := root.Find(args)
	if err != nil || cmd == root {
		fmt.Fprintf(os.Stderr, "未知命令: %s\n", args[0])
		return
	}
	cmd.SetArgs(args[1:])
	if err := cmd.Execute(); err != nil {
		errIcon := color.New(color.FgRed).Sprint("✗")
		fmt.Fprintf(os.Stderr, "  %s %v\n", errIcon, err)
	}
}

// ==================== Usage ====================

func printUsage() {
	bold := color.New(color.Bold).SprintFunc()
	dim := color.New(color.FgHiBlack).SprintFunc()
	cyan := color.New(color.FgHiCyan).SprintFunc()

	fmt.Printf("%s\n", bold("Usage:"))
	fmt.Printf("  taurusdb <command> [subcommand] [flags]\n\n")

	fmt.Printf("%s\n", bold("Commands:"))
	fmt.Printf("  %s     配置华为云认证信息\n", cyan("configure"))
	fmt.Printf("  %s      管理数据库实例\n", cyan("instance "))
	fmt.Printf("  %s      查询数据库规格\n", cyan("flavor   "))
	fmt.Printf("  %s      管理备份\n", cyan("backup   "))
	fmt.Printf("  %s      智能 Agent 对话\n", cyan("chat     "))
	fmt.Println()

	fmt.Printf("%s\n", bold("Flags:"))
	fmt.Printf("  %s     使用指定的配置 Profile\n", dim("--profile"))
	fmt.Printf("  %s      输出格式: table|json|yaml\n", dim("--output "))
	fmt.Printf("  %s    禁用彩色输出\n", dim("--no-color"))
	fmt.Printf("  %s        帮助信息\n", dim("-h, --help"))
	fmt.Printf("  %s     版本信息\n", dim("-v, --version"))
	fmt.Println()

	fmt.Printf("  Use %s for more information.\n\n",
		dim("\"taurusdb <command> --help\""))
}
