package render

import (
	"strings"
	"testing"

	"github.com/huaweicloud/huaweicloud-sdk-go-v3/services/gaussdb/v3/model"
)

func TestInstanceTable(t *testing.T) {
	instances := []model.MysqlInstanceListInfoUnifyStatus{
		{
			Id:     "id-1",
			Name:   "prod-main-db",
			Status: stringPtr("normal"),
			Datastore: &model.MysqlDatastoreWithKernelVersion{
				Type:    "gaussdb-mysql",
				Version: "8.0",
			},
		},
		{
			Id:     "id-2",
			Name:   "creating-db",
			Status: stringPtr("creating"),
			Datastore: &model.MysqlDatastoreWithKernelVersion{
				Type:    "gaussdb-mysql",
				Version: "5.7",
			},
		},
	}

	out := captureStdout(t, func() {
		if err := InstanceTable(instances); err != nil {
			t.Fatalf("InstanceTable failed: %v", err)
		}
	})

	for _, needle := range []string{"实例列表", "prod-main-db", "creating-db", "gaussdb-mysql 8.0", "normal", "creating"} {
		if !strings.Contains(out, needle) {
			t.Fatalf("expected output to contain %q, got %q", needle, out)
		}
	}
}

func stringPtr(v string) *string {
	return &v
}
