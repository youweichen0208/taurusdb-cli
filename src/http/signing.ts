import { createHmac, createHash } from "node:crypto";
import type { SignedRequest } from "../types/api.js";

export function toSdkDate(date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

export function sha256Hex(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export function hmacHex(key: string, v: string): string {
  return createHmac("sha256", key).update(v).digest("hex");
}

export function encodeRFC3986(v: string): string {
  return encodeURIComponent(v).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function canonicalQuery(searchParams: URLSearchParams): string {
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of searchParams.entries()) {
    pairs.push([encodeRFC3986(k), encodeRFC3986(v)]);
  }
  pairs.sort((a, b) => {
    if (a[0] === b[0]) return a[1].localeCompare(b[1]);
    return a[0].localeCompare(b[0]);
  });
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

export function signRequest(
  req: SignedRequest,
  ak: string,
  sk: string,
): SignedRequest {
  const u = new URL(req.url);
  const xSdkDate = toSdkDate();
  const headers = {
    host: u.host,
    "content-type": req.headers["content-type"] ?? "application/json",
    "x-sdk-date": xSdkDate,
    ...Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
    ),
  };

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${headers[k as keyof typeof headers]}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys.join(";");
  const bodyHash = sha256Hex(req.body ?? "");
  const canonicalReq = [
    req.method.toUpperCase(),
    u.pathname || "/",
    canonicalQuery(u.searchParams),
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join("\n");

  const stringToSign = [
    "SDK-HMAC-SHA256",
    xSdkDate,
    sha256Hex(canonicalReq),
  ].join("\n");
  const signature = hmacHex(sk, stringToSign);
  const authorization = `SDK-HMAC-SHA256 Access=${ak}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...req,
    headers: {
      ...req.headers,
      Host: u.host,
      "X-Sdk-Date": xSdkDate,
      "Content-Type": headers["content-type"],
      Authorization: authorization,
    },
  };
}