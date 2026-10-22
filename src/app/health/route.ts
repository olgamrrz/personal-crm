import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";

// Smoke check for deploys and uptime monitors: 200 only when the app can reach the database
export async function GET() {
  await connection();

  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("Health check failed:", error);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
