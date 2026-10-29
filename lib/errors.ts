export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiFailure) {
    return Response.json({ error: error.message, code: error.code }, {
      status: error.status, headers: { "Cache-Control": "no-store" },
    });
  }
  console.error("Unexpected gateway failure", error instanceof Error ? error.name : "unknown");
  return Response.json({ error: "An unexpected server error occurred.", code: "INTERNAL_ERROR" }, {
    status: 500, headers: { "Cache-Control": "no-store" },
  });
}

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiFailure(415, "INVALID_CONTENT_TYPE", "Send application/json.");
  }
  // Bound reads even when the caller omits Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new ApiFailure(400, "INVALID_JSON", "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new ApiFailure(413, "BODY_TOO_LARGE", "Request body exceeds 8 KB.");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure(400, "INVALID_JSON", "Request body must contain valid JSON.");
  } finally { reader.releaseLock(); }
}
