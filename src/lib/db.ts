import postgres from "postgres";

type Sql = postgres.Sql;

// Kept on globalThis so hot reloads in `next dev` reuse one pool instead of opening a new one per edit.
const shared = globalThis as typeof globalThis & { secondLookSql?: Sql };

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** The one shared Postgres client. Created on first use so builds and tests run without a database. */
export function db(): Sql {
  if (!shared.secondLookSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    shared.secondLookSql = postgres(url, { max: 5, idle_timeout: 20, connect_timeout: 10 });
  }
  return shared.secondLookSql;
}
