import { ApiFailure } from "./errors";
import { cookie, verifyToken } from "./security";

export const ADMIN_COOKIE = "sentinel_admin";

export function authRequired(): boolean {
  if (!process.env.DASHBOARD_PASSWORD && process.env.NODE_ENV === "production") {
    throw new ApiFailure(503, "SETUP_REQUIRED", "Set DASHBOARD_PASSWORD before exposing the dashboard in production.");
  }
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

export function isAuthenticated(request: Request): boolean {
  return !authRequired() || verifyToken(cookie(request, ADMIN_COOKIE), "admin") !== null;
}

export function requireAdmin(request: Request): void {
  if (!isAuthenticated(request)) throw new ApiFailure(401, "UNAUTHORIZED", "Sign in to view gateway telemetry.");
}
