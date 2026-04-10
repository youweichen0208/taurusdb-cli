package cmd

import (
	"fmt"

	survey "github.com/AlecAivazis/survey/v2"
	"github.com/spf13/cobra"
	"github.com/youweichen/taurusdb-cli/config"
)

var regions = []string{
	"cn-north-4  (北京四)",
	"cn-east-3   (上海一)",
	"cn-south-1  (广州)",
	"cn-north-1  (北京一)",
	"ap-southeast-1 (香港)",
}

var regionCodes = map[string]string{
	"cn-north-4  (北京四)":   "cn-north-4",
	"cn-east-3   (上海一)":   "cn-east-3",
	"cn-south-1  (广州)":    "cn-south-1",
	"cn-north-1  (北京一)":   "cn-north-1",
	"ap-southeast-1 (香港)": "ap-southeast-1",
}

var configureCmd = &cobra.Command{
	Use:   "configure",
	Short: "配置华为云认证信息",
	Long: `交互式配置 AK/SK/Region/ProjectID，保存到本地。

	示例：
	  taurusdb configure
	  taurusdb configure --profile prod`,
	RunE: func(cmd *cobra.Command, args []string) error {
		profileName, _ := cmd.Flags().GetString("profile")
		return runConfigure(profileName)
	},
}

func init() {
	rootCmd.AddCommand(configureCmd)
}

func runConfigure(profileName string) error {
	var answers struct {
		AK        string
		SK        string
		Region    string
		ProjectID string
	}

	qs := []*survey.Question{
		{
			Name:   "AK",
			Prompt: &survey.Input{Message: "Access Key (AK):"},
			Validate: func(val interface{}) error {
				if v, ok := val.(string); !ok || len(v) == 0 {
					return fmt.Errorf("AK 不能为空")
				}
				return nil
			},
		},
		{
			Name:   "SK",
			Prompt: &survey.Password{Message: "Secret Key (SK):"},
			Validate: func(val interface{}) error {
				if v, ok := val.(string); !ok || len(v) == 0 {
					return fmt.Errorf("SK 不能为空")
				}
				return nil
			},
		},
		{
			Name:   "Region",
			Prompt: &survey.Select{Message: "选择 Region:", Options: regions},
		},
		{
			Name:   "ProjectID",
			Prompt: &survey.Input{Message: "Project ID:"},
			Validate: func(val interface{}) error {
				if v, ok := val.(string); !ok || len(v) == 0 {
					return fmt.Errorf("Project ID 不能为空")
				}
				return nil
			},
		},
	}

	if err := survey.Ask(qs, &answers); err != nil {
		return fmt.Errorf("输入已取消: %w", err)
	}

	cfg := config.TaurusConfig{
		AK:        answers.AK,
		SK:        answers.SK,
		Region:    regionCodes[answers.Region],
		ProjectID: answers.ProjectID,
	}

	if err := config.Save(cfg, profileName); err != nil {
		return err
	}

	fmt.Printf("✓ 配置已保存到 ~/.taurusdb/config.yaml (profile: %s)\n", profileName)
	return nil
}
