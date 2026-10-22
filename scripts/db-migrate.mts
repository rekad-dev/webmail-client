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
      const migration = await readFile(
        new URL("../db/migrations/0001-oauth-sessions.sql", import.meta.url),
        "utf8",
      );
      await sql.begin(async (transaction) => {
        await transaction.unsafe(migration);
      });
      console.log("Applied the OAuth session schema.");
    } catch {
      console.error("Could not apply the OAuth session schema.");
      process.exitCode = 1;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
}
