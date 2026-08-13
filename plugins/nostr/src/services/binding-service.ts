import { eq } from "drizzle-orm";
import type { NostrDatabase } from "../db/index";
import { nostrBindings } from "../db/schema";

export interface NostrBinding {
  nearAccountId: string;
  nostrPubkey: string;
  relay?: string;
  proofEventId?: string;
  boundAt: string;
}

function mapRow(row: typeof nostrBindings.$inferSelect): NostrBinding {
  return {
    nearAccountId: row.nearAccountId,
    nostrPubkey: row.nostrPubkey,
    relay: row.relay ?? undefined,
    proofEventId: row.proofEventId ?? undefined,
    boundAt: row.boundAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function createBinding(
  db: NostrDatabase,
  input: { nearAccountId: string; nostrPubkey: string; relay?: string },
): Promise<NostrBinding> {
  const rows = await db
    .insert(nostrBindings)
    .values({
      nearAccountId: input.nearAccountId,
      nostrPubkey: input.nostrPubkey,
      relay: input.relay,
    })
    .onConflictDoUpdate({
      target: nostrBindings.nearAccountId,
      set: {
        nostrPubkey: input.nostrPubkey,
        relay: input.relay,
        boundAt: new Date(),
      },
    })
    .returning();
  return mapRow(rows[0]!);
}

export async function getBinding(
  db: NostrDatabase,
  nearAccountId: string,
): Promise<NostrBinding | null> {
  const rows = await db
    .select()
    .from(nostrBindings)
    .where(eq(nostrBindings.nearAccountId, nearAccountId))
    .limit(1);
  return rows.length > 0 ? mapRow(rows[0]!) : null;
}

export async function deleteBinding(db: NostrDatabase, nearAccountId: string): Promise<void> {
  await db.delete(nostrBindings).where(eq(nostrBindings.nearAccountId, nearAccountId));
}
