export function endpointFor(
  service: "gaussdb" | "vpc" | "ces",
  region: string,
): string {
  switch (service) {
    case "gaussdb":
      return `https://gaussdb.${region}.myhuaweicloud.com`;
    case "vpc":
      return `https://vpc.${region}.myhuaweicloud.com`;
    case "ces":
      return `https://ces.${region}.myhuaweicloud.com`;
  }
}