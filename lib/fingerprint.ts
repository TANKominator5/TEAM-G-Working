import { digest } from "./security";

/** Passive HTTP-header fingerprint, not a device identity or TLS fingerprint.
 * Deliberately excludes cookies, authorization, IPs, and invasive browser probes.
 */
export function requestFingerprint(request: Request): string {
  const headers = ["user-agent", "accept-language", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform"];
  const values = headers.map(name => (request.headers.get(name) ?? "").trim().replace(/\s+/g, " ").slice(0, 512));
  return digest(`fingerprint:v1:${JSON.stringify(values)}`).slice(0, 32);
}
