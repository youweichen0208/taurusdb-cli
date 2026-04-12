package render

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/fatih/color"
	"github.com/huaweicloud/huaweicloud-sdk-go-v3/services/gaussdb/v3/model"
)

const kvKeyWidth = 13 // value starts at (roughly) column 14 after "  " indent

// InstanceDetail prints a human-friendly instance detail view.
func InstanceDetail(inst *model.MysqlInstanceInfoDetailUnifyStatus, region string) error {
	if inst == nil {
		return fmt.Errorf("实例详情为空")
	}

	bold := color.New(color.Bold).SprintFunc()
	dim := color.New(color.FgHiBlack).SprintFunc()
	cyan := color.New(color.FgHiCyan).SprintFunc()

	fmt.Println()
	fmt.Printf("  %s\n", bold("实例详情"))
	fmt.Println("  ═══════════════════════════════════════════════════════════════════════════")

	kv("ID", cyan(inst.Id))
	kv("Name", bold(emptyDash(inst.Name)))
	kv("Status", statusBadge(strPtr(inst.Status)))

	engine, version, kernel := "-", "-", "-"
	if inst.Datastore != nil {
		engine = emptyDash(inst.Datastore.Type)
		version = emptyDash(inst.Datastore.Version)
		kernel = emptyDash(inst.Datastore.KernelVersion)
	}
	engineStr := engine
	if version != "-" {
		engineStr = engineStr + " " + version
	}
	if kernel != "-" {
		engineStr = engineStr + dim(" (kernel "+kernel+")")
	}
	kv("Engine", engineStr)

	kv("Nodes", fmt.Sprintf("%d", intOrZero(inst.NodeCount)))

	flavor, vcpus, ram := "-", "-", "-"
	volType, volSize, volUsed := "-", "-", "-"
	if master := pickMasterNode(inst.Nodes); master != nil {
		flavor = strPtr(master.FlavorRef)
		vcpus = strPtr(master.Vcpus)
		ram = strPtr(master.Ram)
		if master.Volume != nil {
			volType = emptyDash(master.Volume.Type)
			volSize = fmt.Sprintf("%dGB", master.Volume.Size)
			volUsed = emptyDash(master.Volume.Used)
			if volUsed != "-" {
				volUsed = volUsed + "GB"
			}
		}
	}
	if flavor != "-" || vcpus != "-" || ram != "-" {
		spec := flavor
		if vcpus != "-" || ram != "-" {
			spec = fmt.Sprintf("%s (vCPU %s, RAM %sGB)", emptyDash(flavor), emptyDash(vcpus), emptyDash(ram))
		}
		kv("Flavor", spec)
	}
	if volType != "-" || volSize != "-" {
		storage := fmt.Sprintf("%s %s", emptyDash(volType), emptyDash(volSize))
		if volUsed != "-" {
			storage = storage + dim(" (used "+volUsed+")")
		}
		kv("Storage", storage)
	}

	fmt.Println()
	fmt.Printf("  %s\n", bold("网络信息"))
	fmt.Println("  ───────────────────────────────────────────────────────────────────────────")

	kv("Region", emptyDash(region))
	kv("AZ Mode", strPtr(inst.AzMode))
	kv("Master AZ", strPtr(inst.MasterAzCode))
	kv("VPC", strPtr(inst.VpcId))
	kv("Subnet", strPtr(inst.SubnetId))
	kv("Security Group", strPtr(inst.SecurityGroupId))

	privateIP := firstOrDash(inst.PrivateWriteIps)
	kv("Private IP", privateIP)
	kv("Public IP", strPtr(inst.PublicIps))
	kv("Port", strPtr(inst.Port))
	kv("Private DNS", strings.Join(ptrSliceOrEmpty(inst.PrivateDnsNames), ", "))

	fmt.Println()
	fmt.Printf("  %s\n", bold("备份策略"))
	fmt.Println("  ───────────────────────────────────────────────────────────────────────────")
	if inst.BackupStrategy == nil {
		kv("Auto Backup", dim("未配置"))
	} else {
		kv("Window", emptyDash(inst.BackupStrategy.StartTime))
		kv("Keep Days", strPtr(inst.BackupStrategy.KeepDays))
	}

	fmt.Println()
	fmt.Printf("  %s\n", bold("连接信息"))
	fmt.Println("  ───────────────────────────────────────────────────────────────────────────")

	host := pickBestHost(privateIP, strPtr(inst.PublicIps), ptrSliceFirst(inst.PrivateDnsNames))
	port := atoiOrZero(strPtr(inst.Port))
	user := strPtr(inst.DbUserName)
	if user == "-" {
		user = "root"
	}

	conn := ConnectionCommand(engine, host, port, user)
	if conn == "" {
		kv("Command", dim("无法生成连接命令（缺少 IP/端口）"))
	} else {
		kv("Command", cyan(conn))
	}

	fmt.Println("  ═══════════════════════════════════════════════════════════════════════════")
	fmt.Println()
	return nil
}

func kv(key, value string) {
	if value == "" {
		value = "-"
	}
	fmt.Printf("  %-*s%s\n", kvKeyWidth, key+":", value)
}

func statusBadge(status string) string {
	status = emptyDash(status)
	if status == "-" {
		return "-"
	}

	green := color.New(color.FgGreen).SprintFunc()
	red := color.New(color.FgRed).SprintFunc()
	yellow := color.New(color.FgYellow).SprintFunc()

	switch strings.ToLower(status) {
	case "normal", "available", "active", "running":
		return green("● " + status)
	case "creating", "rebooting", "resizing":
		return yellow("● " + status)
	default:
		return red("● " + status)
	}
}

func ConnectionCommand(engine, host string, port int, user string) string {
	if host == "" || host == "-" || port <= 0 {
		return ""
	}
	if user == "" || user == "-" {
		user = "root"
	}

	e := strings.ToLower(engine)
	switch {
	case strings.Contains(e, "postgres"):
		return fmt.Sprintf("psql -h %s -p %d -U %s -d postgres", host, port, user)
	case strings.Contains(e, "sqlserver") || strings.Contains(e, "mssql"):
		return fmt.Sprintf("sqlcmd -S %s,%d -U %s", host, port, user)
	default:
		// gaussdb-mysql / mysql
		return fmt.Sprintf("mysql -h %s -P %d -u %s -p", host, port, user)
	}
}

func atoiOrZero(s string) int {
	if s == "" || s == "-" {
		return 0
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return n
}

func emptyDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "-"
	}
	return s
}

func strPtr(p *string) string {
	if p == nil || strings.TrimSpace(*p) == "" {
		return "-"
	}
	return *p
}

func intOrZero(p *int32) int32 {
	if p == nil {
		return 0
	}
	return *p
}

func firstOrDash(p *[]string) string {
	if p == nil || len(*p) == 0 || strings.TrimSpace((*p)[0]) == "" {
		return "-"
	}
	return (*p)[0]
}

func ptrSliceFirst(p *[]string) string {
	if p == nil || len(*p) == 0 {
		return "-"
	}
	return emptyDash((*p)[0])
}

func ptrSliceOrEmpty(p *[]string) []string {
	if p == nil {
		return nil
	}
	var out []string
	for _, s := range *p {
		if strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

func pickBestHost(privateIP, publicIP, dns string) string {
	for _, v := range []string{privateIP, publicIP, dns} {
		if v != "" && v != "-" {
			return v
		}
	}
	return ""
}

func pickMasterNode(nodes *[]model.MysqlInstanceNodeInfo) *model.MysqlInstanceNodeInfo {
	if nodes == nil || len(*nodes) == 0 {
		return nil
	}
	for i := range *nodes {
		n := &(*nodes)[i]
		if n.Type != nil && strings.ToLower(*n.Type) == "master" {
			return n
		}
	}
	return &(*nodes)[0]
}
