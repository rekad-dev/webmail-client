import { JmapAccountMismatchError, type JmapEventStreamResult } from "./client.mts";
import { createJmapSseParser, parseJmapStateChangeEvent } from "./event-source.mts";

const JSON_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

const SSE_RESPONSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
};

const DEFAULT_STREAM_LIFETIME_MS = 45_000;
const DEFAULT_KEEPALIVE_INTERVAL_MS = 20_000;
const MAX_UPSTREAM_SSE_CHUNK_BYTES = 256 * 1024;

type EventStreamOptions = Parameters<
  typeof import("./client.mts").openJmapOAuthEventStream
>[0];

export interface MailNotificationStreamSession {
  accessToken: string;
  accountId: string;
}

export interface MailNotificationStreamDependencies {
  getSessionId(request: Request): Promise<string | null>;
  getAuthenticatedSession(
    sessionId: string,
  ): Promise<MailNotificationStreamSession | null>;
  revokeSession(sessionId: string): Promise<void>;
  openEventStream(options: EventStreamOptions): Promise<JmapEventStreamResult>;
  getJmapSettings(): Pick<
    EventStreamOptions,
    "sessionUrl" | "trustedOrigins" | "allowInsecureHttp"
  >;
  isTrustedOrigin(request: Request): boolean;
  streamLifetimeMs?: number;
  keepaliveIntervalMs?: number;
}

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: JSON_RESPONSE_HEADERS });
}

function sseFrame(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function createMailNotificationStreamGetHandler(
  dependencies: MailNotificationStreamDependencies,
) {
  const streamLifetimeMs = dependencies.streamLifetimeMs ?? DEFAULT_STREAM_LIFETIME_MS;
  const keepaliveIntervalMs =
    dependencies.keepaliveIntervalMs ?? DEFAULT_KEEPALIVE_INTERVAL_MS;

  return async function GET(request: Request): Promise<Response> {
    if (request.headers.has("origin") && !dependencies.isTrustedOrigin(request)) {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }
    const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
    if (fetchSite === "cross-site") {
      return jsonResponse({ error: "origin_not_allowed" }, 403);
    }

    let sessionId: string | null;
    let session: MailNotificationStreamSession | null;
    try {
      sessionId = await dependencies.getSessionId(request);
      if (!sessionId) return jsonResponse({ error: "sign_in_required" }, 401);
      session = await dependencies.getAuthenticatedSession(sessionId);
      if (!session) return jsonResponse({ error: "sign_in_required" }, 401);
    } catch {
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    const upstreamController = new AbortController();
    const onRequestAbort = () => upstreamController.abort();
    if (request.signal.aborted) {
      return new Response(null, { status: 204, headers: JSON_RESPONSE_HEADERS });
    }
    request.signal.addEventListener("abort", onRequestAbort, { once: true });

    let streamResult: JmapEventStreamResult;
    try {
      streamResult = await dependencies.openEventStream({
        accessToken: session.accessToken,
        expectedAccountId: session.accountId,
        signal: upstreamController.signal,
        ...dependencies.getJmapSettings(),
      });
    } catch (error) {
      request.signal.removeEventListener("abort", onRequestAbort);
      if (error instanceof JmapAccountMismatchError) {
        try {
          await dependencies.revokeSession(sessionId);
        } catch {
          return jsonResponse({ error: "mail_unavailable" }, 503);
        }
        return jsonResponse({ error: "sign_in_required" }, 401);
      }
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    const encoder = new TextEncoder();

    if (!streamResult.supported) {
      request.signal.removeEventListener("abort", onRequestAbort);
      const unsupportedBody = encoder.encode(
        sseFrame("unsupported", { supported: false }),
      );
      return new Response(unsupportedBody, {
        status: 200,
        headers: SSE_RESPONSE_HEADERS,
      });
    }

    const upstreamBody = streamResult.response.body;
    if (!upstreamBody) {
      request.signal.removeEventListener("abort", onRequestAbort);
      return jsonResponse({ error: "mail_unavailable" }, 503);
    }

    const accountId = streamResult.accountId;
    const reader = upstreamBody.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let closed = false;
    let lifetimeTimer: ReturnType<typeof setTimeout> | undefined;
    let keepaliveTimer: ReturnType<typeof setInterval> | undefined;
    let closeActiveStream: (() => void) | undefined;

    function cleanup() {
      if (lifetimeTimer !== undefined) clearTimeout(lifetimeTimer);
      if (keepaliveTimer !== undefined) clearInterval(keepaliveTimer);
      request.signal.removeEventListener("abort", onRequestAbort);
      if (closeActiveStream) {
        request.signal.removeEventListener("abort", closeActiveStream);
      }
      upstreamController.abort();
      void reader.cancel().catch(() => undefined);
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        function closeStream() {
          if (closed) return;
          closed = true;
          cleanup();
          try {
            controller.close();
          } catch {
            // Stream already closed.
          }
        }
        closeActiveStream = closeStream;

        function enqueueText(text: string) {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            closeStream();
          }
        }

        enqueueText(sseFrame("ready", { supported: true }));

        const parser = createJmapSseParser((event) => {
          const change = parseJmapStateChangeEvent(
            event.event,
            event.data,
            accountId,
          );
          if (change) {
            enqueueText(sseFrame("state", change));
          }
        });

        keepaliveTimer = setInterval(() => {
          enqueueText(": keepalive\n\n");
        }, keepaliveIntervalMs);

        lifetimeTimer = setTimeout(() => {
          enqueueText(sseFrame("reconnect", {}));
          closeStream();
        }, streamLifetimeMs);

        request.signal.addEventListener("abort", closeStream, { once: true });

        void (async () => {
          try {
            while (!closed) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value && value.byteLength > MAX_UPSTREAM_SSE_CHUNK_BYTES) {
                break;
              }
              if (value) {
                parser.push(decoder.decode(value, { stream: true }));
              }
            }
            const tail = decoder.decode();
            if (tail) parser.push(tail);
            parser.flush();
          } catch {
            // Upstream closed or aborted; close cleanly so the client reconnects or polls.
          } finally {
            closeStream();
          }
        })();
      },
      cancel() {
        closed = true;
        cleanup();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: SSE_RESPONSE_HEADERS,
    });
  };
}
