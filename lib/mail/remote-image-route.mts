import { RemoteImageError, type RemoteImage } from "./remote-image-fetch.mts";

export interface RemoteImageRouteDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(sessionId: string): Promise<unknown | null>;
  fetchImage(url: string): Promise<RemoteImage>;
}

const COMMON_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

function failure(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { ...COMMON_HEADERS, "Cache-Control": "no-store" } });
}

/** Serves remote email images through the app so senders never see the reader's address. */
export function createRemoteImageHandler(dependencies: RemoteImageRouteDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const targets = new URL(request.url).searchParams.getAll("url");
    if (targets.length !== 1 || !targets[0]) return failure("invalid_request", 400);

    try {
      const sessionId = await dependencies.getSessionId(request);
      if (!sessionId || !(await dependencies.getAuthenticatedSession(sessionId))) return failure("sign_in_required", 401);
    } catch {
      return failure("mail_unavailable", 503);
    }

    try {
      const image = await dependencies.fetchImage(targets[0]);
      return new Response(new Uint8Array(image.bytes).buffer, {
        status: 200,
        headers: {
          ...COMMON_HEADERS,
          "Content-Type": image.type,
          "Content-Length": String(image.bytes.byteLength),
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Cache-Control": "private, max-age=86400",
        },
      });
    } catch (error) {
      if (error instanceof RemoteImageError) {
        const status = error.reason === "invalid_url" ? 400 : error.reason === "blocked" ? 403 : error.reason === "too_large" ? 413 : error.reason === "not_image" ? 415 : 502;
        return failure(error.reason, status);
      }
      return failure("image_unavailable", 502);
    }
  };
}
