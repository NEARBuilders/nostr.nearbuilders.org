import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const nostrBindings = pgTable("nostr_bindings", {
  nearAccountId: text("near_account_id").primaryKey(),
  nostrPubkey: text("nostr_pubkey").notNull(),
  relay: text("relay"),
  proofEventId: text("proof_event_id"),
  boundAt: timestamp("bound_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
});
