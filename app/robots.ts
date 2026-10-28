import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/message/", "/local-preview"],
      },
    ],
    sitemap: "https://webmail.rekad.id/sitemap.xml",
    host: "https://webmail.rekad.id",
  };
}
