import type { MetadataRoute } from "next";

// Only the sign-in page is public; every other route needs a session.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://webmail.rekad.id/", changeFrequency: "monthly", priority: 1 }];
}
