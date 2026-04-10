package sdk

import (
	"fmt"

	"github.com/huaweicloud/huaweicloud-sdk-go-v3/core/sdkerr"
)

// ApiError represents a structured error from the Huawei Cloud API.
type ApiError struct {
	Code    string
	Message string
	// The friendly Chinese message after translation.
	Friendly string
	// Hint is the suggested next action.
	Hint string
}

func (e *ApiError) Error() string {
	if e.Friendly != "" {
		if e.Hint != "" {
			return fmt.Sprintf("%s\n  建议: %s", e.Friendly, e.Hint)
		}
		return e.Friendly
	}
	return fmt.Sprintf("API 错误 [%s]: %s", e.Code, e.Message)
}

// errorMap translates well-known Huawei Cloud error codes to human-readable messages.
var errorMap = map[string]struct{ friendly, hint string }{
	"APIGW.0301": {"AK/SK 认证失败", "请运行 taurusdb configure 重新配置认证信息"},
	"APIGW.0302": {"权限不足，无法执行此操作", "请检查您的 IAM 权限"},
	"DBS.200001": {"资源不存在", "请运行 taurusdb instance list 查看当前实例"},
	"DBS.200019": {"规格不存在", "请运行 taurusdb flavor list --engine <引擎> 查看可用规格"},
	"DBS.200040": {"配额已超限", "请联系华为云客服提升资源配额"},
	"DBS.200108": {"密码不符合规范", "密码需包含大小写字母和数字，且不少于 8 位"},
	"DBS.200056": {"账户余额不足", "请前往华为云控制台充值"},
	"DBS.200023": {"VPC 或子网不存在", "请检查 --vpc-id 和 --subnet-id 参数"},
}

// translateError converts a raw API error code and message to a friendly ApiError.
func translateError(code, msg string) *ApiError {
	e := &ApiError{Code: code, Message: msg}
	if t, ok := errorMap[code]; ok {
		e.Friendly = t.friendly
		e.Hint = t.hint
	}
	return e
}

// timeoutError returns a formatted timeout error.
func timeoutError() error {
	return &ApiError{
		Code:     "TIMEOUT",
		Friendly: "请求超时",
		Hint:     "请检查网络连接后重试",
	}
}

// rateLimitError returns a formatted rate-limit error.
func rateLimitError() error {
	return &ApiError{
		Code:     "429",
		Friendly: "请求过于频繁，已自动重试",
	}
}

// translateSdkError converts an error from the official Huawei Cloud SDK into an ApiError.
func translateSdkError(err error) error {
	if err == nil {
		return nil
	}
	if se, ok := err.(*sdkerr.ServiceResponseError); ok {
		return translateError(se.ErrorCode, se.ErrorMessage)
	}
	return &ApiError{
		Code:     "SDK_ERROR",
		Friendly: err.Error(),
	}
}
