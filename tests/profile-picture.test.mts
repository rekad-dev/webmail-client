import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PROFILE_PICTURE_BYTES,
  validateProfilePicture,
} from "../lib/profile/profile-picture-image.mts";
import { createProfilePictureHandlers } from "../lib/profile/profile-picture-route.mts";

const decode = (value: string) => new Uint8Array(Buffer.from(value, "base64"));
const PNG = decode("iVBORw0KGgoAAAANSUhEUgAAAEAAAABAEAIAAAB1mzrKAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRP///////wlY99wAAAAHdElNRQfqChwMLDgzXUiWAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTEwLTI4VDEyOjQ0OjU2KzAwOjAw03S0JwAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMC0yOFQxMjo0NDo1NiswMDowMKIpDJsAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMTAtMjhUMTI6NDQ6NTYrMDA6MDD1PC1EAAABFklEQVR42u3c0Q2DMAwA0RY8Bx2D8ZI1wjLshRSnHx7iPrg3ARI6SnCa7/Pc93l+BInsa2w/+jLeK2bLsR30ZbyXBcBitmUBoMieFgCyAFhkz7FbAMYCYL4FwWod4A3AVAE+gjAWALMAWEx/hFGRLcduARgLgEX6ORplAbDI5g0gxew+gkgWALMAmAXAYvblQgxU6wALwNQ6wAIw7oqA1UzYG4BxHgBzIgazAFjMlpcbszgWAPMtCFbrAAvAWADMlTDMb0Ew5wEwJ2KwyLb8hwzIAmD+BsB8C4I5E4a5NxTm7miYBcBqHWABmFoHWADGiRjMXREwC4A5EYM5EYN5XhDME7NgFgDzxCyYJ+fCLABmATALgP0BrCXO/ntHZY0AAAAASUVORK5CYII=");
const JPEG = decode("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAAwAEADAREAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAUI/8QAFhAAAwAAAAAAAAAAAAAAAAAAABRh/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAcJ/8QAFhEAAwAAAAAAAAAAAAAAAAAAABVh/9oADAMBAAIRAxEAPwDNbNJcphpszoZoUwM6GaFMDOhmhTAzoZoUwM6GaFMDOhmhTAzoZoUwM6SmaU1TCeNKGaFMDShmhTA0oZoUwNKGaFMDShmhTA0oZoUwNKGaFMDSklmlOUwnjOhmhTAzoZoUwM6GaFMDOhmhTAzoZoUwM6GaFMDOhmhTAzpKZpTVMJ4zoZoUwM6GaFMDOhmhTAzoZoUwM6GaFMDOhmhTAzoZoUwM6SmaU5TCds6GaFMDOhmhTAzoZoUwM6GaFMDOhmhTAzoZoUwM6GaFMDOklmlNUwnjOhmhTAzoZoUwM6GaFMDOhmhTAzoZoUwM6GaFMDOhmhTAzp//2Q==");
const WEBP = decode("UklGRqoAAABXRUJQVlA4IJ4AAADwBwCdASpAAEAAPpE8mUkloyWhKBQN+LASCWUA0MAcHfkDWBD3sGhJyCIBVWfttB7eVGba4ulWJTy2v0/EJ8nncOJU9QyJR3oA/uoBv8mG/rbMEKVX/n7erS3Hf/w13sW8/N0QBVPD0ZXCwi/MmLheCfZ3iJIzdHA/tG79EKIKgZdEyXWfJkTxruPh/tLF1PNjTJAknNYb46mxrbKAAA==");
const BIG_PNG = decode("iVBORw0KGgoAAAANSUhEUgAAAlgAAAJYAQMAAACEqAqfAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAADUExURf8AABniCTcAAAAHdElNRQfqChwMLDgzXUiWAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTEwLTI4VDEyOjQ0OjU2KzAwOjAw03S0JwAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMC0yOFQxMjo0NDo1NiswMDowMKIpDJsAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMTAtMjhUMTI6NDQ6NTYrMDA6MDD1PC1EAAAAQ0lEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvg2yIAABW5v6kQAAAABJRU5ErkJggg==");
const SMALL_PNG = decode("iVBORw0KGgoAAAANSUhEUgAAABQAAAAUAQMAAAC3R49OAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAADUExURf8AABniCTcAAAAHdElNRQfqChwMLDgzXUiWAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTEwLTI4VDEyOjQ0OjU2KzAwOjAw03S0JwAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMC0yOFQxMjo0NDo1NiswMDowMKIpDJsAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMTAtMjhUMTI6NDQ6NTYrMDA6MDD1PC1EAAAADElEQVQI12NgoC4AAABQAAEiE+h1AAAAAElFTkSuQmCC");
const GIF = decode("R0lGODlhQABAAPAAAP8AAAAAACH5BAAAAAAALAAAAABAAEAAAAJFhI+py+0Po5y02ouz3rz7D4biSJbmiabqyrbuC8fyTNf2jef6zvf+DwwKh8Si8YhMKpfMpvMJjUqn1Kr1is1qt9yuF1AAADs=");

test("accepts PNG, JPEG, and WebP and reads their size from the file", () => {
  assert.deepEqual(
    { type: validateProfilePicture(PNG)?.type, width: validateProfilePicture(PNG)?.width },
    { type: "image/png", width: 64 },
  );
  const jpeg = validateProfilePicture(JPEG);
  assert.equal(jpeg?.type, "image/jpeg");
  assert.deepEqual([jpeg?.width, jpeg?.height], [64, 48]);
  assert.equal(validateProfilePicture(WEBP)?.type, "image/webp");
});

test("rejects other formats, odd sizes, truncated files, and oversized files", () => {
  assert.equal(validateProfilePicture(GIF), null);
  assert.equal(validateProfilePicture(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(validateProfilePicture(BIG_PNG), null);
  assert.equal(validateProfilePicture(SMALL_PNG), null);
  assert.equal(validateProfilePicture(PNG.subarray(0, 20)), null);
  assert.equal(validateProfilePicture(new Uint8Array(0)), null);
  const padded = new Uint8Array(MAX_PROFILE_PICTURE_BYTES + 1);
  padded.set(PNG);
  assert.equal(validateProfilePicture(padded), null);
});

function makeHandlers(overrides: Partial<Parameters<typeof createProfilePictureHandlers>[0]> = {}) {
  const saved: Array<{ subject: string; type: string; size: number }> = [];
  const deleted: string[] = [];
  const handlers = createProfilePictureHandlers({
    getSessionId: async () => "session-1",
    getSessionSummary: async () => ({ subject: "subject-1" }),
    isTrustedOrigin: () => true,
    getPicture: async (subject) =>
      subject === "subject-1" ? { type: "image/png", bytes: PNG, updatedAt: new Date(1_700_000_000_000) } : null,
    savePicture: async (subject, type, bytes) => {
      saved.push({ subject, type, size: bytes.byteLength });
      return 1_700_000_000_123;
    },
    deletePicture: async (subject) => {
      deleted.push(subject);
    },
    ...overrides,
  });
  return { handlers, saved, deleted };
}

const url = "https://app.example.test/api/profile/picture";
const put = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request(url, { method: "PUT", body, headers: { "content-type": "image/png", ...headers } });

test("serves the person's own picture with safe headers and supports ETag", async () => {
  const { handlers } = makeHandlers();
  const response = await handlers.GET(new Request(url));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy") ?? "", /sandbox/);
  const etag = response.headers.get("etag");
  assert.ok(etag);
  assert.equal(new Uint8Array(await response.arrayBuffer()).byteLength, PNG.byteLength);
  const cached = await handlers.GET(new Request(url, { headers: { "if-none-match": etag } }));
  assert.equal(cached.status, 304);
});

test("requires a session and returns 404 when no picture is set", async () => {
  assert.equal((await makeHandlers({ getSessionId: async () => null }).handlers.GET(new Request(url))).status, 401);
  assert.equal((await makeHandlers({ getSessionSummary: async () => null }).handlers.GET(new Request(url))).status, 401);
  const none = makeHandlers({ getSessionSummary: async () => ({ subject: "other" }) });
  assert.equal((await none.handlers.GET(new Request(url))).status, 404);
});

test("stores a valid upload under the session's own subject", async () => {
  const { handlers, saved } = makeHandlers();
  const response = await handlers.PUT(put(PNG));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { version: 1_700_000_000_123 });
  assert.deepEqual(saved, [{ subject: "subject-1", type: "image/png", size: PNG.byteLength }]);
});

test("rejects bad uploads without storing them", async () => {
  const { handlers, saved } = makeHandlers();
  assert.equal((await handlers.PUT(put(GIF))).status, 400);
  assert.equal((await handlers.PUT(put(BIG_PNG))).status, 400);
  assert.equal((await handlers.PUT(put(new Uint8Array(MAX_PROFILE_PICTURE_BYTES + 5)))).status, 413);
  assert.equal(
    (await handlers.PUT(put(PNG, { "content-length": String(MAX_PROFILE_PICTURE_BYTES + 1) }))).status,
    413,
  );
  assert.equal((await handlers.PUT(put(null))).status, 400);
  assert.deepEqual(saved, []);
});

test("changes need a trusted origin and a session", async () => {
  const untrusted = makeHandlers({ isTrustedOrigin: () => false });
  assert.equal((await untrusted.handlers.PUT(put(PNG))).status, 403);
  assert.equal((await untrusted.handlers.DELETE(new Request(url, { method: "DELETE" }))).status, 403);
  assert.deepEqual(untrusted.saved, []);
  const signedOut = makeHandlers({ getSessionId: async () => null });
  assert.equal((await signedOut.handlers.PUT(put(PNG))).status, 401);
  assert.equal((await signedOut.handlers.DELETE(new Request(url, { method: "DELETE" }))).status, 401);
});

test("removes only the session's own picture and hides storage failures", async () => {
  const { handlers, deleted } = makeHandlers();
  assert.equal((await handlers.DELETE(new Request(url, { method: "DELETE" }))).status, 200);
  assert.deepEqual(deleted, ["subject-1"]);
  const failing = makeHandlers({ savePicture: async () => { throw new Error("db password leaked"); } });
  const response = await failing.handlers.PUT(put(PNG));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "profile_unavailable" });
});

test("crops the centered square of a wide, tall, or square image", async () => {
  const { centeredSquare } = await import("../components/profile/crop.ts");
  assert.deepEqual(centeredSquare(400, 200), { x: 100, y: 0, side: 200 });
  assert.deepEqual(centeredSquare(200, 301), { x: 0, y: 50, side: 200 });
  assert.deepEqual(centeredSquare(256, 256), { x: 0, y: 0, side: 256 });
});
