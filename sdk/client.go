package sdk

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/youweichen/taurusdb-cli/config"
)

const (
	defaultTimeout = 30 * time.Second
	maxRetries     = 3
	retryBaseDelay = time.Second
	endpointFmt    = "https://rds.%s.myhuaweicloud.com"
)

// RdsClient is the HTTP client for the Huawei Cloud RDS API.
type RdsClient struct {
	endpoint   string
	ak         string
	sk         string
	projectID  string
	httpClient *http.Client
}

// NewRdsClient creates an RdsClient by loading the given profile.
func NewRdsClient(profile string) (*RdsClient, error) {
	cfg, err := config.Load(profile)
	if err != nil {
		return nil, err
	}
	return &RdsClient{
		endpoint:  fmt.Sprintf(endpointFmt, cfg.Region),
		ak:        cfg.AK,
		sk:        cfg.SK,
		projectID: cfg.ProjectID,
		httpClient: &http.Client{
			Timeout: defaultTimeout,
		},
	}, nil
}

// ProjectID returns the project ID loaded from configuration.
func (c *RdsClient) ProjectID() string {
	return c.projectID
}

// Get performs a signed GET request and returns the response body.
func (c *RdsClient) Get(path string) ([]byte, error) {
	return c.do(http.MethodGet, path, nil)
}

// Post performs a signed POST request with a JSON body and returns the response body.
func (c *RdsClient) Post(path string, body interface{}) ([]byte, error) {
	return c.do(http.MethodPost, path, body)
}

// Delete performs a signed DELETE request.
func (c *RdsClient) Delete(path string) error {
	_, err := c.do(http.MethodDelete, path, nil)
	return err
}

func (c *RdsClient) do(method, path string, body interface{}) ([]byte, error) {
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			delay := retryBaseDelay * (1 << (attempt - 1))
			time.Sleep(delay)
		}

		resp, err := c.executeOnce(method, path, body)
		if err != nil {
			// Network-level error: retry.
			lastErr = err
			continue
		}
		return resp, nil
	}
	return nil, lastErr
}

func (c *RdsClient) executeOnce(method, path string, body interface{}) ([]byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("序列化请求体失败: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	url := c.endpoint + path
	req, err := http.NewRequestWithContext(context.Background(), method, url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	if err := SignRequest(req, c.ak, c.sk); err != nil {
		return nil, fmt.Errorf("请求签名失败: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		if isTimeout(err) {
			return nil, timeoutError()
		}
		return nil, fmt.Errorf("网络请求失败: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusServiceUnavailable {
		// Signal caller to retry.
		return nil, rateLimitError()
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, parseApiError(resp.StatusCode, respBody)
	}

	return respBody, nil
}

func parseApiError(statusCode int, body []byte) error {
	var errResp struct {
		Code    string `json:"error_code"`
		Message string `json:"error_msg"`
	}
	if err := json.Unmarshal(body, &errResp); err == nil && errResp.Code != "" {
		return translateError(errResp.Code, errResp.Message)
	}
	return &ApiError{
		Code:     fmt.Sprintf("HTTP_%d", statusCode),
		Friendly: fmt.Sprintf("服务器返回错误 (HTTP %d)", statusCode),
		Hint:     "请稍后重试，或联系华为云客服",
	}
}

func isTimeout(err error) bool {
	return strings.Contains(err.Error(), "timeout") ||
		strings.Contains(err.Error(), "deadline exceeded")
}
