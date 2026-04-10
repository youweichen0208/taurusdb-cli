package sdk_test

import (
	"bytes"
	"net/http"
	"testing"

	"github.com/youweichen/taurusdb-cli/sdk"
)

func TestSignRequest_AddsRequiredHeaders(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "https://rds.cn-north-4.myhuaweicloud.com/v3/proj/flavors", nil)

	if err := sdk.SignRequest(req, "test-ak", "test-sk"); err != nil {
		t.Fatalf("SignRequest failed: %v", err)
	}

	for _, h := range []string{"X-Sdk-Date", "Authorization", "Host", "X-Sdk-Content-Sha256"} {
		if req.Header.Get(h) == "" {
			t.Errorf("missing header: %s", h)
		}
	}

	auth := req.Header.Get("Authorization")
	if len(auth) < 20 {
		t.Errorf("Authorization header too short: %s", auth)
	}
}

func TestSignRequest_POST_WithBody(t *testing.T) {
	body := bytes.NewBufferString(`{"engine":"MySQL"}`)
	req, _ := http.NewRequest(http.MethodPost, "https://rds.cn-north-4.myhuaweicloud.com/v3/proj/instances", body)

	if err := sdk.SignRequest(req, "ak", "sk"); err != nil {
		t.Fatalf("SignRequest failed: %v", err)
	}

	if req.Header.Get("Authorization") == "" {
		t.Error("Authorization header missing after POST sign")
	}
}

func TestSignRequest_AuthContainsAK(t *testing.T) {
	req, _ := http.NewRequest(http.MethodGet, "https://rds.cn-north-4.myhuaweicloud.com/v3/proj/flavors?database_name=MySQL", nil)
	_ = sdk.SignRequest(req, "MY-AK-VALUE", "sk")

	auth := req.Header.Get("Authorization")
	if auth == "" {
		t.Fatal("Authorization missing")
	}
	// Auth must embed the AK.
	expected := "Access=MY-AK-VALUE"
	if len(auth) == 0 || !contains(auth, expected) {
		t.Errorf("Authorization %q does not contain %q", auth, expected)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
