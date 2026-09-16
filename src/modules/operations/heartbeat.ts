import { eq } from "drizzle-orm";

import { db } from "@/platform/db";

import { workerHeartbeat } from "./tables";

/** The record_heartbeat job (J10) — every 5 minutes, per system-architecture.md's Operations section. */
export async function recordHeartbeat(): Promise<void> {
  await db
    .insert(workerHeartbeat)
    .values({ singleton: true, lastSeenAt: new Date() })
    .onConflictDoUpdate({ target: workerHeartbeat.singleton, set: { lastSeenAt: new Date() } });
}

export async function getLastHeartbeat(): Promise<Date | null> {
  const [row] = await db.select().from(workerHeartbeat).where(eq(workerHeartbeat.singleton, true));
  return row?.lastSeenAt ?? null;
}
