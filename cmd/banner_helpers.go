package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/youweichen/taurusdb-cli/config"
	"golang.org/x/term"
)

func terminalWidth() int {
	w, _, err := term.GetSize(int(os.Stdout.Fd()))
	if err != nil {
		return 0
	}
	return w
}

func bannerRule(width int) string {
	n := 62
	if width > 0 {
		n = max(30, min(width-4, 78))
	}
	return strings.Repeat("─", n)
}

func versionLabel() string {
	v := strings.TrimSpace(Version)
	if v == "" {
		v = "dev"
	}
	if v == "dev" {
		v = "vdev"
	}
	if v != "vdev" && !strings.HasPrefix(v, "v") {
		v = "v" + v
	}
	return appendBuild(v)
}

func appendBuild(version string) string {
	commit := strings.TrimSpace(Commit)
	if commit != "" {
		if len(commit) > 7 {
			commit = commit[:7]
		}
		version = fmt.Sprintf("%s (build %s)", version, commit)
	}
	if built := strings.TrimSpace(BuiltAt); built != "" {
		version = fmt.Sprintf("%s %s", version, built)
	}
	return version
}

func bannerMeta() string {
	cfg, err := config.Load(profile)
	if err != nil {
		return fmt.Sprintf("Profile=%s  Region=-  (未配置)", profile)
	}
	region := strings.TrimSpace(cfg.Region)
	if region == "" {
		region = "-"
	}
	return fmt.Sprintf("Profile=%s  Region=%s", profile, region)
}
