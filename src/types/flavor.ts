export type Flavor = {
  spec_code: string;
  vcpus?: string;
  ram?: string;
  type?: string;
  az_status?: Record<string, string>;
};