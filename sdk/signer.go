package sdk

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
)

const (
	algorithm      = "SDK-HMAC-SHA256"
	headerDate     = "X-Sdk-Date"
	headerAuth     = "Authorization"
	headerHost     = "Host"
	headerSHA256   = "X-Sdk-Content-Sha256"
	dateTimeFormat = "20060102T150405Z"
)

// SignRequest adds AK/SK authentication headers to the request following
// the Huawei Cloud SDK-HMAC-SHA256 signing spec.
func SignRequest(req *http.Request, ak, sk string) error {
	// 1. Set required headers before signing.
	t := time.Now().UTC()
	req.Header.Set(headerDate, t.Format(dateTimeFormat))
	req.Header.Set(headerHost, req.URL.Host)
	if req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	// 2. Read body and compute its SHA-256 hash.
	bodyHash, err := hashBody(req)
	if err != nil {
		return err
	}
	req.Header.Set(headerSHA256, bodyHash)

	// 3. Build CanonicalRequest.
	signedHeaders, canonicalHeaders := buildCanonicalHeaders(req)
	canonicalQueryString := buildCanonicalQueryString(req)
	canonicalURI := buildCanonicalURI(req)

	canonicalRequest := strings.Join([]string{
		req.Method,
		canonicalURI,
		canonicalQueryString,
		canonicalHeaders,
		signedHeaders,
		bodyHash,
	}, "\n")

	// 4. Build StringToSign.
	hashedCanonical := sha256Hex([]byte(canonicalRequest))
	stringToSign := fmt.Sprintf("%s\n%s\n%s", algorithm, t.Format(dateTimeFormat), hashedCanonical)

	// 5. Compute HMAC-SHA256 signature.
	mac := hmac.New(sha256.New, []byte(sk))
	mac.Write([]byte(stringToSign))
	signature := hex.EncodeToString(mac.Sum(nil))

	// 6. Set Authorization header.
	authHeader := fmt.Sprintf(
		"%s Access=%s, SignedHeaders=%s, Signature=%s",
		algorithm, ak, signedHeaders, signature,
	)
	req.Header.Set(headerAuth, authHeader)

	return nil
}

func hashBody(req *http.Request) (string, error) {
	if req.Body == nil {
		return sha256Hex([]byte{}), nil
	}
	body, err := io.ReadAll(req.Body)
	if err != nil {
		return "", fmt.Errorf("读取请求体失败: %w", err)
	}
	req.Body = io.NopCloser(bytes.NewReader(body))
	return sha256Hex(body), nil
}

func sha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func buildCanonicalHeaders(req *http.Request) (signedHeaders, canonicalHeaders string) {
	// Collect headers that must be signed.
	required := map[string]struct{}{
		strings.ToLower(headerDate):   {},
		strings.ToLower(headerHost):   {},
		strings.ToLower(headerSHA256): {},
		"content-type":                {},
	}

	headerMap := make(map[string]string)
	for k, v := range req.Header {
		lk := strings.ToLower(k)
		if _, ok := required[lk]; ok {
			headerMap[lk] = strings.TrimSpace(strings.Join(v, ","))
		}
	}

	keys := make([]string, 0, len(headerMap))
	for k := range headerMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	lines := make([]string, len(keys))
	for i, k := range keys {
		lines[i] = k + ":" + headerMap[k]
	}

	signedHeaders = strings.Join(keys, ";")
	canonicalHeaders = strings.Join(lines, "\n") + "\n"
	return
}

func buildCanonicalQueryString(req *http.Request) string {
	params := req.URL.Query()
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		vals := params[k]
		sort.Strings(vals)
		for _, v := range vals {
			parts = append(parts, uriEncode(k)+"="+uriEncode(v))
		}
	}
	return strings.Join(parts, "&")
}

func buildCanonicalURI(req *http.Request) string {
	path := req.URL.EscapedPath()
	if path == "" {
		path = "/"
	}
	return path
}

// uriEncode percent-encodes a string per RFC 3986 but leaves '/' unencoded.
func uriEncode(s string) string {
	var buf strings.Builder
	for _, c := range s {
		if isUnreserved(byte(c)) {
			buf.WriteRune(c)
		} else {
			buf.WriteString(fmt.Sprintf("%%%02X", byte(c)))
		}
	}
	return buf.String()
}

func isUnreserved(c byte) bool {
	return (c >= 'A' && c <= 'Z') ||
		(c >= 'a' && c <= 'z') ||
		(c >= '0' && c <= '9') ||
		c == '-' || c == '_' || c == '.' || c == '~'
}
