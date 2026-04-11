package cmd

import "testing"

func TestFuzzyMatchCommand_ExactMatch(t *testing.T) {
	got := fuzzyMatchCommand("/connect")
	if got != "/connect" {
		t.Fatalf("unexpected match: %q", got)
	}
}

func TestFuzzyMatchCommand_PrefixMatch(t *testing.T) {
	got := fuzzyMatchCommand("/inst")
	if got != "/instance list" {
		t.Fatalf("unexpected match: %q", got)
	}
}

func TestFuzzyMatchCommand_CaseInsensitive(t *testing.T) {
	got := fuzzyMatchCommand("/Con")
	if got != "/connect" {
		t.Fatalf("unexpected match: %q", got)
	}
}

func TestFuzzyMatchCommand_Unknown(t *testing.T) {
	got := fuzzyMatchCommand("/not-found")
	if got != "/not-found" {
		t.Fatalf("unexpected match: %q", got)
	}
}
