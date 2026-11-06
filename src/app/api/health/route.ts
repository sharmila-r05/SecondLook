import { db, isDatabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

type DatabaseStatus = "ok" | "not configured" | "unreachable";

export async function GET() {
  let database: DatabaseStatus = "not configured";

  if (isDatabaseConfigured()) {
    try {
      await db()`select 1`;
      database = "ok";
    } catch (error) {
      // Only the error code: the message can echo the host from DATABASE_URL.
      const code = (error as { code?: unknown }).code;
      console.error("health: database unreachable", typeof code === "string" ? code : "unknown error");
      database = "unreachable";
    }
  }

  const ok = database !== "unreachable";
  return Response.json(
    { ok, paypalEnv: process.env.PAYPAL_ENV ?? null, database },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
