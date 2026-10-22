import { JmapPocError, runJmapPoc } from "../lib/jmap/phase0-poc.mts";

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

try {
  process.loadEnvFile(".env.local");
} catch (error) {
  if (!isMissingFileError(error)) {
    console.error("Could not load .env.local.");
    process.exitCode = 1;
  }
}

if (process.exitCode !== 1) {
  const sessionUrl = process.env.STALWART_JMAP_SESSION_URL;
  if (!sessionUrl) {
    console.error("Set STALWART_JMAP_SESSION_URL in .env.local first.");
    process.exitCode = 1;
  } else {
    const allowInsecureHttp =
      process.env.STALWART_JMAP_ALLOW_INSECURE_HTTP === "true";
    const trustedOrigins = (process.env.STALWART_JMAP_TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const discoveryOnly = process.argv.includes("--discover-only");

    try {
      const result = await runJmapPoc({
        sessionUrl,
        trustedOrigins,
        allowInsecureHttp,
        username: process.env.JMAP_TEST_USERNAME,
        password: process.env.JMAP_TEST_PASSWORD,
        discoveryOnly,
      });

      if (result.authenticated) {
        console.log(
          `Authenticated JMAP Mailbox/get succeeded: ${result.mailboxCount} mailboxes; roles: ${result.roles.join(", ") || "none"}.`,
        );
      } else {
        console.log(
          `JMAP session discovery succeeded. Validated endpoints: ${Object.keys(result.endpointOrigins).join(", ")}.`,
        );
        console.log(
          "No account data was requested. Configure a dedicated test account to run pnpm jmap:smoke.",
        );
      }
    } catch (error) {
      const message =
        error instanceof JmapPocError
          ? error.message
          : "The JMAP proof of concept failed unexpectedly.";
      console.error(`JMAP proof of concept failed: ${message}`);
      process.exitCode = 1;
    }
  }
}
