const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

const EVENT_SOURCE_PARAMS: Record<string, string> = {
  types: "Email,Mailbox",
  closeafter: "no",
  ping: "25",
};

export interface JmapSseEvent {
  event: string;
  data: string;
  id?: string;
}

export interface JmapAccountStateChange {
  emailState: string | null;
  mailboxState: string | null;
}

function isValidStateToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !CONTROL_CHARS.test(value)
  );
}

/**
 * Expands RFC 8620 Section 7.3 `eventSourceUrl` template placeholders safely and
 * confirms the resulting URL stays within the trusted JMAP origins.
 */
export function expandJmapEventSourceUrl(
  templateUrl: URL,
  trustedOrigins: Set<string>,
  allowInsecureHttp: boolean,
): URL {
  // WHATWG URL encodes braces in the path as %7B / %7D (e.g. /{?types,...}).
  let raw = templateUrl
    .toString()
    .replace(/%7b/gi, "{")
    .replace(/%7d/gi, "}");

  // Replace RFC 6570 query expressions such as {?types,closeafter,ping} or {&types,closeafter,ping}.
  raw = raw.replace(/\{([?&])([A-Za-z0-9_,]+)\}/g, (_match, prefix: string, names: string) => {
    const pairs = names
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name in EVENT_SOURCE_PARAMS)
      .map((name) => `${name}=${encodeURIComponent(EVENT_SOURCE_PARAMS[name]!)}`);
    return pairs.length > 0 ? `${prefix}${pairs.join("&")}` : "";
  });

  // Replace simple {var} placeholders such as ?types={types}&closeafter={closeafter}&ping={ping}.
  raw = raw.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => {
    if (name in EVENT_SOURCE_PARAMS) {
      return encodeURIComponent(EVENT_SOURCE_PARAMS[name]!);
    }
    return match;
  });

  if (/\{[^}]*\}/.test(raw)) {
    throw new Error("The JMAP eventSourceUrl contains an unsupported template expression.");
  }

  const expanded = new URL(raw);
  const expectedProtocol = allowInsecureHttp && expanded.protocol === "http:" ? "http:" : "https:";
  if (expanded.protocol !== expectedProtocol) {
    throw new Error("The JMAP eventSourceUrl uses an insecure protocol.");
  }
  if (expanded.username || expanded.password) {
    throw new Error("The JMAP eventSourceUrl cannot include credentials.");
  }
  if (!trustedOrigins.has(expanded.origin)) {
    throw new Error("The JMAP eventSourceUrl uses an untrusted origin.");
  }

  for (const [key, value] of Object.entries(EVENT_SOURCE_PARAMS)) {
    if (!expanded.searchParams.has(key)) {
      expanded.searchParams.set(key, value);
    }
  }
  return expanded;
}

/**
 * Incremental Server-Sent Events parser compliant with the WHATWG EventSource
 * line framing rules (`\r\n`, `\n`, `\r`, multi-line `data:`, comments).
 */
export function createJmapSseParser(onEvent: (event: JmapSseEvent) => void): {
  push(chunk: string): void;
  flush(): void;
} {
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];
  let lastEventId: string | undefined;

  function dispatch() {
    if (dataLines.length === 0) {
      eventName = "";
      return;
    }
    const event = eventName || "message";
    const data = dataLines.join("\n");
    eventName = "";
    dataLines = [];
    onEvent({
      event,
      data,
      ...(lastEventId !== undefined ? { id: lastEventId } : {}),
    });
  }

  function processLine(line: string) {
    if (line.length === 0) {
      dispatch();
      return;
    }
    if (line.startsWith(":")) {
      return;
    }
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") {
      eventName = value;
    } else if (field === "data") {
      dataLines.push(value);
    } else if (field === "id" && !value.includes("\u0000")) {
      lastEventId = value;
    }
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      while (true) {
        const match = /\r\n|\r|\n/.exec(buffer);
        if (!match) break;
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        processLine(line);
      }
    },
    flush() {
      if (buffer.length > 0) {
        processLine(buffer);
        buffer = "";
      }
      dispatch();
    },
  };
}

/**
 * Extracts Email/Mailbox state changes for the authenticated account from a
 * JMAP `StateChange` SSE payload without leaking unrelated accounts.
 */
export function parseJmapStateChangeEvent(
  eventName: string,
  dataText: string,
  expectedAccountId: string,
): JmapAccountStateChange | null {
  if (eventName !== "state" && eventName !== "message") return null;
  if (dataText.length === 0 || dataText.length > 64 * 1024) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const payload = parsed as Record<string, unknown>;
  if (payload["@type"] !== "StateChange") return null;

  const changed = payload.changed;
  if (!changed || typeof changed !== "object" || Array.isArray(changed)) return null;
  const accountChange = (changed as Record<string, unknown>)[expectedAccountId];
  if (!accountChange || typeof accountChange !== "object" || Array.isArray(accountChange)) {
    return null;
  }
  const typeState = accountChange as Record<string, unknown>;
  const emailState = isValidStateToken(typeState.Email) ? typeState.Email : null;
  const mailboxState = isValidStateToken(typeState.Mailbox) ? typeState.Mailbox : null;
  if (!emailState && !mailboxState) return null;
  return { emailState, mailboxState };
}
