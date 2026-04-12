package render

import "testing"

func TestConnectionCommand_MySQLDefault(t *testing.T) {
	got := ConnectionCommand("gaussdb-mysql", "10.0.0.1", 3306, "root")
	want := "mysql -h 10.0.0.1 -P 3306 -u root -p"
	if got != want {
		t.Fatalf("unexpected command: got %q want %q", got, want)
	}
}

func TestConnectionCommand_PostgreSQL(t *testing.T) {
	got := ConnectionCommand("PostgreSQL", "db.local", 5432, "admin")
	want := "psql -h db.local -p 5432 -U admin -d postgres"
	if got != want {
		t.Fatalf("unexpected command: got %q want %q", got, want)
	}
}

func TestConnectionCommand_MissingHostOrPort(t *testing.T) {
	if got := ConnectionCommand("mysql", "-", 3306, "root"); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
	if got := ConnectionCommand("mysql", "10.0.0.1", 0, "root"); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}
