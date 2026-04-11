package render

import (
	"bytes"
	"io"
	"os"
	"strings"
	"testing"
)

func TestJSON(t *testing.T) {
	out := captureStdout(t, func() {
		if err := JSON(map[string]string{"name": "taurus"}); err != nil {
			t.Fatalf("JSON failed: %v", err)
		}
	})

	if !strings.Contains(out, `"name": "taurus"`) {
		t.Fatalf("unexpected JSON output: %q", out)
	}
}

func TestYAML(t *testing.T) {
	out := captureStdout(t, func() {
		if err := YAML(map[string]string{"name": "taurus"}); err != nil {
			t.Fatalf("YAML failed: %v", err)
		}
	})

	if !strings.Contains(out, "name: taurus") {
		t.Fatalf("unexpected YAML output: %q", out)
	}
}

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()

	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe failed: %v", err)
	}
	defer r.Close()

	os.Stdout = w
	defer func() {
		os.Stdout = old
	}()

	fn()

	if err := w.Close(); err != nil {
		t.Fatalf("close failed: %v", err)
	}

	var buf bytes.Buffer
	if _, err := io.Copy(&buf, r); err != nil {
		t.Fatalf("copy failed: %v", err)
	}

	return buf.String()
}
