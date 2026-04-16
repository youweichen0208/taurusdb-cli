export type OutputFormat = "table" | "json" | "yaml";

export type LLMConfig = {
  base_url?: string;
  api_key?: string;
  model?: string;
  timeout_ms?: number;
  extra_headers?: Record<string, string>;
};

export type TaurusConfig = {
  ak?: string;
  sk?: string;
  region?: string;
  project_id?: string;
  llm?: LLMConfig;
};

export type RootOptions = {
  profile: string;
  output: OutputFormat;
  noColor: boolean;
};