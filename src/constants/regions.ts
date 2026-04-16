export const regions = [
  "cn-north-4  (北京四)",
  "cn-east-3   (上海一)",
  "cn-south-1  (广州)",
  "cn-north-1  (北京一)",
  "ap-southeast-1 (香港)",
] as const;

export const regionCodes: Record<string, string> = {
  "cn-north-4  (北京四)": "cn-north-4",
  "cn-east-3   (上海一)": "cn-east-3",
  "cn-south-1  (广州)": "cn-south-1",
  "cn-north-1  (北京一)": "cn-north-1",
  "ap-southeast-1 (香港)": "ap-southeast-1",
};