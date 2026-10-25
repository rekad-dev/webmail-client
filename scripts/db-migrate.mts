import { readFile } from "node:fs/promises";
import postgres from "postgres";

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
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    console.error("Set DATABASE_URL to the application's PostgreSQL database.");
    process.exitCode = 1;
  } else {
    const sql = postgres(databaseUrl, {
      max: 1,
      idle_timeout: 5,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => undefined,
    });

    try {
      const migrationFiles = [
        "0001-oauth-sessions.sql",
        "0002-mail-send-attempts.sql",
        "0003-managed-mail-banners.sql",
      ];
      const migrations = await Promise.all(
        migrationFiles.map((file) =>
          readFile(new URL(`../db/migrations/${file}`, import.meta.url), "utf8"),
        ),
      );
      await sql.begin(async (transaction) => {
        for (const migration of migrations) {
          await transaction.unsafe(migration);
        }
      });
      console.log("Applied the application database schema.");
    } catch {
      console.error("Could not apply the application database schema.");
      process.exitCode = 1;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}
