export function connectionCommand(
  engine: string,
  host: string,
  port: number,
  user: string,
): string {
  if (!host || host === "-" || port <= 0) return "";
  const e = engine.toLowerCase();
  if (e.includes("postgres"))
    return `psql -h ${host} -p ${port} -U ${user} -d postgres`;
  if (e.includes("sqlserver") || e.includes("mssql"))
    return `sqlcmd -S ${host},${port} -U ${user}`;
  return `mysql -h ${host} -P ${port} -u ${user} -p`;
}