package sdk

import (
	"errors"
	"testing"

	"github.com/huaweicloud/huaweicloud-sdk-go-v3/core/sdkerr"
)

func TestApiErrorError_WithHint(t *testing.T) {
	err := &ApiError{
		Code:     "APIGW.0301",
		Friendly: "AK/SK 认证失败",
		Hint:     "请运行 taurusdb configure 重新配置认证信息",
	}

	got := err.Error()
	want := "AK/SK 认证失败\n  建议: 请运行 taurusdb configure 重新配置认证信息"
	if got != want {
		t.Fatalf("unexpected error string: got %q want %q", got, want)
	}
}

func TestTranslateError_KnownCode(t *testing.T) {
	err := translateError("APIGW.0301", "auth failed")
	if err.Friendly != "AK/SK 认证失败" {
		t.Fatalf("unexpected friendly message: %q", err.Friendly)
	}
	if err.Hint == "" {
		t.Fatal("expected hint for known error code")
	}
}

func TestTranslateError_UnknownCode(t *testing.T) {
	err := translateError("UNKNOWN", "raw message")
	if err.Code != "UNKNOWN" {
		t.Fatalf("unexpected code: %q", err.Code)
	}
	if err.Message != "raw message" {
		t.Fatalf("unexpected message: %q", err.Message)
	}
	if err.Friendly != "" || err.Hint != "" {
		t.Fatalf("expected no translation for unknown code, got %+v", err)
	}
}

func TestTranslateSdkError_ServiceResponseError(t *testing.T) {
	src := &sdkerr.ServiceResponseError{
		ErrorCode:    "APIGW.0302",
		ErrorMessage: "denied",
	}

	err := translateSdkError(src)
	apiErr, ok := err.(*ApiError)
	if !ok {
		t.Fatalf("expected *ApiError, got %T", err)
	}
	if apiErr.Friendly != "权限不足，无法执行此操作" {
		t.Fatalf("unexpected friendly message: %q", apiErr.Friendly)
	}
}

func TestTranslateSdkError_GenericError(t *testing.T) {
	src := errors.New("boom")
	err := translateSdkError(src)
	apiErr, ok := err.(*ApiError)
	if !ok {
		t.Fatalf("expected *ApiError, got %T", err)
	}
	if apiErr.Code != "SDK_ERROR" {
		t.Fatalf("unexpected code: %q", apiErr.Code)
	}
	if apiErr.Friendly != "boom" {
		t.Fatalf("unexpected friendly message: %q", apiErr.Friendly)
	}
}
