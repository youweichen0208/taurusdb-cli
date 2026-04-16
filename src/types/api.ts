export type ApiError = {
  error_code?: string;
  error_msg?: string;
};

export type SignedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};

export type HttpClient = {
  request<T = unknown>(
    service: "gaussdb" | "vpc" | "ces",
    method: string,
    apiPath: string,
    query?: Record<string, string>,
    body?: unknown,
  ): Promise<T>;
};