package render

import (
	"encoding/json"
	"fmt"

	"gopkg.in/yaml.v3"
)

func JSON(v interface{}) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("JSON 序列化失败: %w", err)
	}
	fmt.Println(string(data))
	return nil
}

func YAML(v interface{}) error {
	data, err := yaml.Marshal(v)
	if err != nil {
		return fmt.Errorf("YAML 序列化失败: %w", err)
	}
	fmt.Println(string(data))
	return nil
}
