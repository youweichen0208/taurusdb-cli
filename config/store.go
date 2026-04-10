package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// TaurusConfig holds the authentication configuration for a profile.
type TaurusConfig struct {
	AK        string `yaml:"ak"`
	SK        string `yaml:"sk"`
	Region    string `yaml:"region"`
	ProjectID string `yaml:"project_id"`
}

func configDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("无法获取 Home 目录: %w", err)
	}
	return filepath.Join(home, ConfigDir), nil
}

func configFilePath() (string, error) {
	dir, err := configDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, ConfigFile), nil
}

// Save writes cfg under profile to the YAML config file.
func Save(cfg TaurusConfig, profile string) error {
	dir, err := configDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, DirPerm); err != nil {
		return fmt.Errorf("无法创建配置目录 %s: %w", dir, err)
	}

	filePath, err := configFilePath()
	if err != nil {
		return err
	}

	// Load existing data to preserve other profiles.
	all := make(map[string]TaurusConfig)
	if data, err := os.ReadFile(filePath); err == nil {
		_ = yaml.Unmarshal(data, &all)
	}

	all[profile] = cfg

	data, err := yaml.Marshal(all)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	if err := os.WriteFile(filePath, data, FilePerm); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}

	// Ensure strict permissions even if file already existed.
	return os.Chmod(filePath, FilePerm)
}

// Load reads the profile from the config file and applies env var overrides.
func Load(profile string) (TaurusConfig, error) {
	filePath, err := configFilePath()
	if err != nil {
		return TaurusConfig{}, err
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return TaurusConfig{}, fmt.Errorf("配置文件不存在，请先运行: taurusdb configure")
		}
		return TaurusConfig{}, fmt.Errorf("读取配置文件失败: %w", err)
	}

	all := make(map[string]TaurusConfig)
	if err := yaml.Unmarshal(data, &all); err != nil {
		return TaurusConfig{}, fmt.Errorf("解析配置文件失败: %w", err)
	}

	cfg, ok := all[profile]
	if !ok {
		return TaurusConfig{}, fmt.Errorf("Profile %q 不存在，请先运行: taurusdb configure --profile %s", profile, profile)
	}

	// Environment variables override file values.
	if v := os.Getenv(EnvAK); v != "" {
		cfg.AK = v
	}
	if v := os.Getenv(EnvSK); v != "" {
		cfg.SK = v
	}
	if v := os.Getenv(EnvRegion); v != "" {
		cfg.Region = v
	}
	if v := os.Getenv(EnvProjectID); v != "" {
		cfg.ProjectID = v
	}

	return cfg, nil
}

// LoadAll returns every profile stored in the config file.
func LoadAll() (map[string]TaurusConfig, error) {
	filePath, err := configFilePath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("配置文件不存在，请先运行: taurusdb configure")
		}
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}

	all := make(map[string]TaurusConfig)
	if err := yaml.Unmarshal(data, &all); err != nil {
		return nil, fmt.Errorf("解析配置文件失败: %w", err)
	}
	return all, nil
}
