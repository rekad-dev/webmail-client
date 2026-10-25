import "server-only";

import postgres from "postgres";

import {
  sanitizeComposedHtml,
  type ManagedMailBanners,
} from "./composed-content.mts";

type SqlClient = ReturnType<typeof postgres>;

interface BannerRow {
  header_html: string;
  footer_html: string;
  version: number;
}

const runtimeGlobal = globalThis as typeof globalThis & {
  __rekadManagedBannerSql?: SqlClient;
};

function getSql(): SqlClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("A PostgreSQL DATABASE_URL is required for banner settings.");
  }
  runtimeGlobal.__rekadManagedBannerSql ??= postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => undefined,
  });
  return runtimeGlobal.__rekadManagedBannerSql;
}

function toBanners(row: BannerRow | undefined): ManagedMailBanners {
  if (!row) return { headerHtml: "", footerHtml: "", version: 0 };
  if (
    typeof row.header_html !== "string" ||
    typeof row.footer_html !== "string" ||
    !Number.isSafeInteger(row.version) ||
    row.version < 0
  ) {
    throw new Error("Stored banner settings are invalid.");
  }
  const headerHtml = sanitizeComposedHtml(row.header_html);
  const footerHtml = sanitizeComposedHtml(row.footer_html);
  if (
    Buffer.byteLength(headerHtml, "utf8") > 32 * 1024 ||
    Buffer.byteLength(footerHtml, "utf8") > 32 * 1024
  ) {
    throw new Error("Stored banner settings exceed the allowed size.");
  }
  return {
    headerHtml,
    footerHtml,
    version: row.version,
  };
}

export async function getManagedMailBanners(): Promise<ManagedMailBanners> {
  const sql = getSql();
  const rows = await sql<BannerRow[]>`
    SELECT header_html, footer_html, version
    FROM app_managed_mail_banners
    WHERE id = 1
  `;
  return toBanners(rows[0]);
}

export async function saveManagedMailBanners(
  banners: Pick<ManagedMailBanners, "headerHtml" | "footerHtml">,
): Promise<ManagedMailBanners> {
  const headerHtml = sanitizeComposedHtml(banners.headerHtml);
  const footerHtml = sanitizeComposedHtml(banners.footerHtml);
  const sql = getSql();
  const rows = await sql<BannerRow[]>`
    INSERT INTO app_managed_mail_banners (id, header_html, footer_html, version)
    VALUES (1, ${headerHtml}, ${footerHtml}, 1)
    ON CONFLICT (id) DO UPDATE SET
      header_html = EXCLUDED.header_html,
      footer_html = EXCLUDED.footer_html,
      version = app_managed_mail_banners.version + 1,
      updated_at = now()
    RETURNING header_html, footer_html, version
  `;
  return toBanners(rows[0]);
}

export function isManagedBannerAdmin(subject: string): boolean {
  if (subject.length === 0 || subject.length > 512) return false;
  const configured = process.env.REKAD_BANNER_ADMIN_SUBJECTS;
  if (!configured) return false;
  return configured.split(",").some((entry) => {
    const allowed = entry.trim();
    return allowed.length > 0 && allowed.length <= 512 && allowed === subject;
  });
}
