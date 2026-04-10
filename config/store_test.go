package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/youweichen/taurusdb-cli/config"
)

func setupTempHome(t *testing.T) string {
	t.Helper()
	tmpDir := t.TempDir()
	t.Setenv("HOME", tmpDir)
	return tmpDir
}

func TestSaveAndLoad(t *testing.T) {
	setupTempHome(t)

	cfg := config.TaurusConfig{
		AK:        "test-ak",
		SK:        "test-sk",
		Region:    "cn-north-4",
		ProjectID: "proj-123",
	}

	if err := config.Save(cfg, "test"); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	loaded, err := config.Load("test")
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	if loaded.AK != cfg.AK || loaded.SK != cfg.SK || loaded.Region != cfg.Region || loaded.ProjectID != cfg.ProjectID {
		t.Errorf("loaded config mismatch: got %+v, want %+v", loaded, cfg)
	}
}

func TestLoadProfileNotFound(t *testing.T) {
	setupTempHome(t)

	cfg := config.TaurusConfig{AK: "ak", SK: "sk", Region: "cn-north-4", ProjectID: "p"}
	_ = config.Save(cfg, "default")

	_, err := config.Load("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent profile")
	}
}

func TestEnvVarOverride(t *testing.T) {
	setupTempHome(t)

	cfg := config.TaurusConfig{AK: "file-ak", SK: "file-sk", Region: "cn-north-4", ProjectID: "p"}
	_ = config.Save(cfg, "default")

	t.Setenv(config.EnvAK, "override-ak")
	defer os.Unsetenv(config.EnvAK)

	loaded, err := config.Load("default")
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if loaded.AK != "override-ak" {
		t.Errorf("expected AK=override-ak, got %s", loaded.AK)
	}
}

func TestFilePermissions(t *testing.T) {
	tmpHome := setupTempHome(t)

	cfg := config.TaurusConfig{AK: "ak", SK: "sk", Region: "cn-north-4", ProjectID: "p"}
	if err := config.Save(cfg, "default"); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	cfgFile := filepath.Join(tmpHome, ".taurusdb", "config.yaml")
	info, err := os.Stat(cfgFile)
	if err != nil {
		t.Fatalf("stat failed: %v", err)
	}
	perm := info.Mode().Perm()
	if perm != 0600 {
		t.Errorf("expected file perm 0600, got %04o", perm)
	}
}

func TestOverwriteExistingProfile(t *testing.T) {
	setupTempHome(t)

	first := config.TaurusConfig{AK: "ak1", SK: "sk1", Region: "cn-north-4", ProjectID: "p1"}
	_ = config.Save(first, "default")

	second := config.TaurusConfig{AK: "ak2", SK: "sk2", Region: "cn-south-1", ProjectID: "p2"}
	_ = config.Save(second, "default")

	loaded, err := config.Load("default")
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if loaded.AK != "ak2" {
		t.Errorf("expected AK=ak2, got %s", loaded.AK)
	}
}

func TestMultipleProfiles(t *testing.T) {
	setupTempHome(t)

	_ = config.Save(config.TaurusConfig{AK: "dev-ak"}, "dev")
	_ = config.Save(config.TaurusConfig{AK: "prod-ak"}, "prod")

	all, err := config.LoadAll()
	if err != nil {
		t.Fatalf("LoadAll failed: %v", err)
	}
	if all["dev"].AK != "dev-ak" || all["prod"].AK != "prod-ak" {
		t.Errorf("profiles mismatch: %+v", all)
	}
}
