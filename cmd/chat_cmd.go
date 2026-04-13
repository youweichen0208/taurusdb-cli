package cmd

import "github.com/spf13/cobra"

var chatCmd = &cobra.Command{
	Use:   "chat",
	Short: "进入交互模式（斜杠指令 + 自然语言占位）",
	Long: `进入交互模式（斜杠指令补全、交互选择等）。

示例：
  taurusdb
  taurusdb chat
  taurusdb chat --profile prod`,
	Run: func(cmd *cobra.Command, args []string) {
		interactiveMode = true
		startInteractiveMode(cmd.Root())
		interactiveMode = false
	},
}

func init() {
	rootCmd.AddCommand(chatCmd)
}
