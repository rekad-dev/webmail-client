export function getJmapSettings() {
  return {
    sessionUrl:
      process.env.STALWART_JMAP_SESSION_URL ??
      "https://mail.rekad.id/.well-known/jmap",
    trustedOrigins: (
      process.env.STALWART_JMAP_TRUSTED_ORIGINS ?? "https://mail.rekad.id"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    allowInsecureHttp:
      process.env.STALWART_JMAP_ALLOW_INSECURE_HTTP === "true",
  };
}
