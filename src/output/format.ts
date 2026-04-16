import yaml from "js-yaml";

export async function printJSON(data: unknown): Promise<void> {
  console.log(JSON.stringify(data, null, 2));
}

export async function printYAML(data: unknown): Promise<void> {
  console.log(yaml.dump(data));
}