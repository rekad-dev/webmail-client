import assert from "node:assert/strict";
import { after, test } from "node:test";

import { isManagedBannerAdmin } from "../lib/mail/managed-banner-store.mts";
import { createAdminBannerHandlers } from "../lib/mail/managed-banner-route.mts";

const originalAdminSubjects = process.env.REKAD_BANNER_ADMIN_SUBJECTS;

after(() => {
  if (originalAdminSubjects === undefined) {
    delete process.env.REKAD_BANNER_ADMIN_SUBJECTS;
  } else {
    process.env.REKAD_BANNER_ADMIN_SUBJECTS = originalAdminSubjects;
  }
});

test("banner administration allowlist matches exact OAuth subjects", () => {
  process.env.REKAD_BANNER_ADMIN_SUBJECTS = " oidc-sub-ravel ,oidc-sub-indira ";

  assert.equal(isManagedBannerAdmin("oidc-sub-ravel"), true);
  assert.equal(isManagedBannerAdmin("oidc-sub-indira"), true);
  assert.equal(isManagedBannerAdmin("ravel@rekad.id"), false);
  assert.equal(isManagedBannerAdmin("oidc-sub-ravel-extra"), false);
  assert.equal(isManagedBannerAdmin("OIDC-SUB-RAVEL"), false);
  assert.equal(isManagedBannerAdmin(""), false);

  delete process.env.REKAD_BANNER_ADMIN_SUBJECTS;
  assert.equal(isManagedBannerAdmin("oidc-sub-ravel"), false);
});

test("banner API uses the authenticated OAuth subject for allow and deny decisions", async () => {
  process.env.REKAD_BANNER_ADMIN_SUBJECTS = "oidc-sub-ravel";

  let authenticatedSubject: string | null = null;
  let saved = false;
  const handlers = createAdminBannerHandlers({
    getSessionId: async () => "session-id",
    getAuthenticatedSession: async () =>
      authenticatedSubject === null ? null : { subject: authenticatedSubject },
    isAdmin: isManagedBannerAdmin,
    isTrustedOrigin: () => true,
    getBanners: async () => ({ headerHtml: "", footerHtml: "", version: 1 }),
    saveBanners: async (input) => {
      saved = true;
      return { ...input, version: 2 };
    },
  });

  const signedOut = await handlers.GET(new Request("https://webmail.rekad.id/api/admin/banners"));
  assert.equal(signedOut.status, 401);

  authenticatedSubject = "ravel@rekad.id";
  const emailIsNotAnOAuthSubject = await handlers.GET(
    new Request("https://webmail.rekad.id/api/admin/banners"),
  );
  assert.equal(emailIsNotAnOAuthSubject.status, 403);

  const unauthorizedUpdate = await handlers.PUT(
    new Request("https://webmail.rekad.id/api/admin/banners", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ headerHtml: "<p>Denied</p>", footerHtml: "" }),
    }),
  );
  assert.equal(unauthorizedUpdate.status, 403);
  assert.equal(saved, false);

  authenticatedSubject = "oidc-sub-ravel";
  const allowed = await handlers.GET(new Request("https://webmail.rekad.id/api/admin/banners"));
  assert.equal(allowed.status, 200);

  const allowedUpdate = await handlers.PUT(
    new Request("https://webmail.rekad.id/api/admin/banners", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        origin: "https://webmail.rekad.id",
      },
      body: JSON.stringify({ headerHtml: "<p>Allowed</p>", footerHtml: "" }),
    }),
  );
  assert.equal(allowedUpdate.status, 200);
  assert.equal(saved, true);
});
