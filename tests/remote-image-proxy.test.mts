import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import {
  fetchRemoteImage,
  isPublicAddress,
  parseRemoteImageUrl,
  RemoteImageError,
} from "../lib/mail/remote-image-fetch.mts";
import { createRemoteImageHandler } from "../lib/mail/remote-image-route.mts";

const png = Buffer.from("89504e470d0a1a0a", "hex");

test("only globally routable addresses are public", () => {
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(address), true, address);
  for (const address of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::1", "not-an-ip"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

test("rejects proxy targets that are not plain public http(s) URLs", () => {
  for (const value of ["", "ftp://example.com/a.png", "javascript:alert(1)", "https://user:pw@example.com/a.png", "http://localhost/a.png", "http://intranet/a.png", "http://127.0.0.1/a.png", "http://[::1]/a.png", "https://example.com:8443/a.png", "https://printer.local/a.png", `https://example.com/${"a".repeat(3000)}`]) {
    assert.equal(parseRemoteImageUrl(value), null, value);
  }
  assert.ok(parseRemoteImageUrl("https://cdn.example.com/a.png?x=1"));
});

async function withServer(handler: http.RequestListener, run: (base: string) => Promise<void>) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("never connects to internal addresses unless the test override is set", async () => {
  await withServer((_req, res) => { res.writeHead(200, { "Content-Type": "image/png" }); res.end(png); }, async (base) => {
    await assert.rejects(fetchRemoteImage(`${base}/a.png`), (error) => error instanceof RemoteImageError && error.reason === "invalid_url");
  });
});

test("returns raster images and enforces type, size, and redirect rules", async () => {
  const options = { unsafeAllowPrivateNetwork: true };
  await withServer((req, res) => {
    if (req.url === "/ok") { res.writeHead(200, { "Content-Type": "image/png; charset=binary" }); res.end(png); }
    else if (req.url === "/svg") { res.writeHead(200, { "Content-Type": "image/svg+xml" }); res.end("<svg onload=alert(1)/>"); }
    else if (req.url === "/html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<script>1</script>"); }
    else if (req.url === "/big") { res.writeHead(200, { "Content-Type": "image/png" }); res.end(Buffer.alloc(5 * 1024 * 1024 + 1)); }
    else if (req.url === "/hop") { res.writeHead(302, { Location: "/ok" }); res.end(); }
    else if (req.url === "/loop") { res.writeHead(302, { Location: "/loop" }); res.end(); }
    else if (req.url === "/to-file") { res.writeHead(302, { Location: "file:///etc/passwd" }); res.end(); }
    else { res.writeHead(404); res.end(); }
  }, async (base) => {
    const image = await fetchRemoteImage(`${base}/ok`, options);
    assert.equal(image.type, "image/png");
    assert.deepEqual(Buffer.from(image.bytes), png);
    assert.equal((await fetchRemoteImage(`${base}/hop`, options)).type, "image/png");
    for (const [path, reason] of [["/svg", "not_image"], ["/html", "not_image"], ["/big", "too_large"], ["/loop", "unreachable"], ["/to-file", "blocked"], ["/missing", "unreachable"]] as const) {
      await assert.rejects(fetchRemoteImage(`${base}${path}`, options), (error) => error instanceof RemoteImageError && error.reason === reason, path);
    }
  });
});

function makeHandler(overrides = {}) {
  return createRemoteImageHandler({
    getSessionId: async () => "session",
    getAuthenticatedSession: async () => ({}),
    fetchImage: async () => ({ bytes: png, type: "image/png" }),
    ...overrides,
  });
}
const req = (query = "url=https%3A%2F%2Fcdn.example.com%2Fa.png") => new Request(`https://app.test/api/mail/remote-image?${query}`);

test("the proxy route requires a session and returns locked-down image responses", async () => {
  assert.equal((await makeHandler({ getSessionId: async () => null })(req())).status, 401);
  assert.equal((await makeHandler({ getAuthenticatedSession: async () => null })(req())).status, 401);
  assert.equal((await makeHandler()(req(""))).status, 400);
  assert.equal((await makeHandler()(req("url=a&url=b"))).status, 400);
  const response = await makeHandler()(req());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.match(response.headers.get("Content-Security-Policy") ?? "", /sandbox/);
  const blocked = await makeHandler({ fetchImage: async () => { throw new RemoteImageError("blocked"); } })(req());
  assert.equal(blocked.status, 403);
});
