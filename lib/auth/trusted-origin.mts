const PRODUCTION_APP_ORIGIN = "https://webmail.rekad.id";

export function isTrustedAppOrigin(
  request: Request,
  isProduction = process.env.NODE_ENV === "production",
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let parsedOrigin: URL;
  let requestOrigin: string;
  try {
    parsedOrigin = new URL(origin);
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }

  if (
    parsedOrigin.origin !== origin ||
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.pathname !== "/" ||
    parsedOrigin.search ||
    parsedOrigin.hash
  ) {
    return false;
  }

  if (parsedOrigin.origin !== requestOrigin) return false;
  if (requestOrigin === PRODUCTION_APP_ORIGIN) return true;
  if (isProduction || parsedOrigin.protocol !== "http:") return false;

  return ["localhost", "127.0.0.1", "[::1]"].includes(
    parsedOrigin.hostname,
  );
}
