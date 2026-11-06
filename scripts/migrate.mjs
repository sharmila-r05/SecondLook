// Applies db/migrations/*.sql in name order, each file once, each in its own transaction.
// Usage: DATABASE_URL=postgres://... node scripts/migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import postgres from "postgres";

const MIGRATIONS_DIR = new URL("../db/migrations/", import.meta.url);
const RETRY_FOR_MS = 2 * 60 * 1000;
const RETRY_EVERY_MS = 5 * 1000;
// On Render the first deploy can run before a brand-new database accepts connections; 57P03 is "starting up".
const NOT_READY_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "CONNECT_TIMEOUT", "57P03"]);

async function waitForDatabase(sql) {
  const deadline = Date.now() + RETRY_FOR_MS;
  for (;;) {
    try {
      await sql`select 1`;
      return;
    } catch (error) {
      if (!NOT_READY_CODES.has(error?.code) || Date.now() + RETRY_EVERY_MS > deadline) throw error;
      console.log(`database not ready (${error.code}), retrying in ${RETRY_EVERY_MS / 1000} s`);
      await sleep(RETRY_EVERY_MS);
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // max: 1 keeps the session-level advisory lock and every migration on the same connection.
  const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
  try {
    await waitForDatabase(sql);
    // Two deploys starting together would otherwise both try to apply the same file.
    await sql`select pg_advisory_lock(hashtext('secondlook-migrate'))`;
    await sql`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `;

    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
    const done = new Set((await sql`select name from schema_migrations`).map((row) => row.name));

    let applied = 0;
    for (const name of files) {
      if (done.has(name)) continue;
      const body = await readFile(new URL(name, MIGRATIONS_DIR), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${name})`;
      });
      console.log(`applied ${name}`);
      applied += 1;
    }

    console.log(`migrations up to date: ${files.length} file(s), ${applied} applied now`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  // Print the code and message only: connection errors can carry the host from DATABASE_URL in other fields.
  const code = error?.code ? `${error.code}: ` : "";
  console.error(`migration failed: ${code}${error?.message ?? error}`);
  process.exit(1);
});
