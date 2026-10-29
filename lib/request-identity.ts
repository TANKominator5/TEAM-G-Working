import { isAuthenticated } from "./auth";
import { DEMO_HEADER, isDemoRunId } from "./contracts";
import { clientKey, digest } from "./security";

/** Only an authenticated operator can create isolated demonstration windows.
 * Public callers cannot rotate their rate-limit identity by supplying a header.
 */
export function requestIdentity(request: Request) {
  const realKey = clientKey(request);
  const runId = request.headers.get(DEMO_HEADER);
  if (isDemoRunId(runId) && isAuthenticated(request)) {
    return { key: digest(`demo:${realKey}:${runId.toLowerCase()}`), realKey, isDemo: true };
  }
  return { key: realKey, realKey, isDemo: false };
}
