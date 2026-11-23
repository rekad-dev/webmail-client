import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

export const MAX_REMOTE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_URL_LENGTH = 2_048;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

export class RemoteImageError extends Error {
  reason: "invalid_url" | "blocked" | "unreachable" | "not_image" | "too_large";
  constructor(reason: RemoteImageError["reason"]) {
    super(reason);
    this.reason = reason;
  }
}

export interface RemoteImage {
  bytes: Uint8Array;
  type: string;
}

export interface RemoteImageOptions {
  /** Tests only: allows loopback targets and any port. */
  unsafeAllowPrivateNetwork?: boolean;
}

function ipv4Octets(address: string): number[] | null {
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

/** True only for globally routable unicast addresses. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = ipv4Octets(address);
    if (!octets) return false;
    const [a, b, c] = octets as [number, number, number, number];
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    const mapped = /^(?:::ffff:|::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
    if (mapped) return isPublicAddress(mapped[1]!);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
    if (hex) {
      const high = parseInt(hex[1]!, 16);
      const low = parseInt(hex[2]!, 16);
      return isPublicAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    const first = parseInt(lower.split(":")[0] || "0", 16);
    return !(
      lower === "::" || lower === "::1" ||
      (first & 0xfe00) === 0xfc00 || // unique local
      (first & 0xffc0) === 0xfe80 || // link local
      (first & 0xff00) === 0xff00 || // multicast
      lower.startsWith("64:ff9b:") || lower.startsWith("2001:db8:") || lower.startsWith("2002:") || lower.startsWith("100:")
    );
  }
  return false;
}

/** Parses a proxy target, accepting only plain http(s) URLs without credentials. */
export function parseRemoteImageUrl(value: string, options: RemoteImageOptions = {}): URL | null {
  if (!value || value.length > MAX_URL_LENGTH || /[\u0000-\u001f\u007f\s]/.test(value)) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || !url.hostname) return null;
  if (!options.unsafeAllowPrivateNetwork && url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) return options.unsafeAllowPrivateNetwork || isPublicAddress(host) ? url : null;
  if (!options.unsafeAllowPrivateNetwork && (!host.includes(".") || /\.(?:localhost|local|internal|lan|home|corp)$/.test(host))) return null;
  return url;
}

function guardedLookup(allowPrivate: boolean) {
  return (hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    dnsLookup(hostname, { all: true }, (error, addresses: LookupAddress[]) => {
      if (error) return callback(error);
      // Every answer must be public so a mixed record cannot smuggle in an internal address.
      if (!addresses.length || (!allowPrivate && !addresses.every((entry) => isPublicAddress(entry.address)))) {
        return callback(new RemoteImageError("blocked"));
      }
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0]!.address, addresses[0]!.family);
    });
  };
}

function requestOnce(url: URL, allowPrivate: boolean): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: http.IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(url, {
      method: "GET",
      lookup: guardedLookup(allowPrivate) as never,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9", "User-Agent": "Mozilla/5.0 (compatible; rekad-mail-image-proxy)", "Accept-Encoding": "identity" },
      agent: false,
    }, (response) => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: response }));
    request.on("timeout", () => request.destroy(new RemoteImageError("unreachable")));
    request.on("error", (error) => reject(error instanceof RemoteImageError ? error : new RemoteImageError("unreachable")));
    request.end();
  });
}

async function readLimited(body: http.IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of body) {
      total += (chunk as Buffer).byteLength;
      if (total > MAX_REMOTE_IMAGE_BYTES) throw new RemoteImageError("too_large");
      chunks.push(chunk as Buffer);
    }
  } catch (error) {
    body.destroy();
    throw error instanceof RemoteImageError ? error : new RemoteImageError("unreachable");
  }
  return Buffer.concat(chunks);
}

/**
 * Fetches an image on behalf of the reader so the sender only ever sees this
 * server. Targets are validated before every hop, DNS answers must be public,
 * and only raster image types under the size cap are returned.
 */
export async function fetchRemoteImage(value: string, options: RemoteImageOptions = {}): Promise<RemoteImage> {
  let url = parseRemoteImageUrl(value, options);
  if (!url) throw new RemoteImageError("invalid_url");
  const allowPrivate = options.unsafeAllowPrivateNetwork === true;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await requestOnce(url, allowPrivate);
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      response.body.destroy();
      const next = parseRemoteImageUrl(new URL(response.headers.location, url).href, options);
      if (!next) throw new RemoteImageError("blocked");
      url = next;
      continue;
    }
    if (response.status !== 200) { response.body.destroy(); throw new RemoteImageError("unreachable"); }
    const type = String(response.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) { response.body.destroy(); throw new RemoteImageError("not_image"); }
    const declared = Number(response.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_REMOTE_IMAGE_BYTES) { response.body.destroy(); throw new RemoteImageError("too_large"); }
    return { bytes: await readLimited(response.body), type };
  }
  throw new RemoteImageError("unreachable");
}
