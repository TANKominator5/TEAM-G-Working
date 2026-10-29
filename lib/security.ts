import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { ApiFailure } from "./errors";

function secret(): string {
  const value = process.env.GATEWAY_SECRET;
  if (!value || value.length < 32) {
    throw new ApiFailure(503, "SETUP_REQUIRED", "Configure GATEWAY_SECRET with at least 32 characters.");
  }
  return value;
}

export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function digest(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function signToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${digest(body)}`;
}

export function verifyToken(token: string | undefined, kind: string): Record<string, unknown> | null {
  if (!token || token.length > 2048) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra || !safeEqual(digest(body), signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.kind !== kind || typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    return payload;
  } catch { return null; }
}

export function cookie(request: Request, name: string): string | undefined {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function sessionCookie(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function clientKey(request: Request): string {
  let address = "local-development";
  if (process.env.VERCEL === "1") {
    // Vercel overwrites this platform-specific header. Do not accept caller-supplied IP headers.
    address = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "";
  } else if (process.env.TRUST_PROXY === "true") {
    address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  } else if (process.env.NODE_ENV === "production") {
    throw new ApiFailure(503, "SETUP_REQUIRED", "Deploy on Vercel or explicitly configure a trusted IP-overwriting proxy.");
  }
  if (address !== "local-development" && !isIP(address)) {
    throw new ApiFailure(503, "CLIENT_ADDRESS_UNAVAILABLE", "A trusted client address is unavailable.");
  }
  // Raw IP addresses are never persisted.
  return digest(`client:${address}`);
}

export function clearanceBinding(request: Request, key: string): string {
  return digest(`${key}:${request.headers.get("user-agent") ?? ""}`);
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  let matches = true;
  if (origin) {
    try {
      const internal = new URL(request.url);
      // Next.js may normalize request.url to localhost. Host is the actual
      // destination and cannot be changed by browser JavaScript making a CSRF request.
      const host = request.headers.get("host") ?? internal.host;
      if (/[\s/@?#\\]/.test(host)) throw new Error("Invalid host");
      const trustedProxy = process.env.VERCEL === "1" || process.env.TRUST_PROXY === "true";
      const forwarded = trustedProxy ? request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() : null;
      const protocol = forwarded === "https" || forwarded === "http" ? `${forwarded}:` : internal.protocol;
      const expected = new URL(`${protocol}//${host}`).origin;
      matches = origin === expected;
    } catch { matches = false; }
  }
  if (!matches || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiFailure(403, "CROSS_ORIGIN_DENIED", "Cross-origin mutations are not permitted.");
  }
}
