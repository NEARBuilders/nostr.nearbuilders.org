import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { DatabaseTag } from "../db/layer";
import { nostrBindings } from "../db/schema";

export interface NostrBinding {
  nearAccountId: string;
  nostrPubkey: string;
  relay?: string;
  proofEventId?: string;
  boundAt: string;
}

type BindingsError = ORPCError<"INTERNAL_SERVER_ERROR", unknown>;

function toIsoString(value: Date | string | null | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : value.toISOString();
}

function mapRow(row: typeof nostrBindings.$inferSelect): NostrBinding {
  return {
    nearAccountId: row.nearAccountId,
    nostrPubkey: row.nostrPubkey,
    relay: row.relay ?? undefined,
    proofEventId: row.proofEventId ?? undefined,
    boundAt: toIsoString(row.boundAt),
  };
}

export class BindingsService extends Context.Tag("nostr/BindingsService")<
  BindingsService,
  {
    createBinding: (input: {
      nearAccountId: string;
      nostrPubkey: string;
      relay?: string;
    }) => Effect.Effect<NostrBinding, BindingsError>;

    getBinding: (nearAccountId: string) => Effect.Effect<NostrBinding | null, BindingsError>;

    deleteBinding: (nearAccountId: string) => Effect.Effect<void, BindingsError>;
  }
>() {
  static Live = Layer.effect(
    BindingsService,
    Effect.gen(function* () {
      const db = yield* DatabaseTag;

      const internalError = (error: unknown): BindingsError =>
        new ORPCError("INTERNAL_SERVER_ERROR", {
          message: error instanceof Error ? error.message : String(error),
        });

      const query = <A>(operation: () => Promise<A>) =>
        Effect.tryPromise({
          try: operation,
          catch: internalError,
        });

      return {
        createBinding: (input) =>
          query(() =>
            db
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
              .returning(),
          ).pipe(
            Effect.flatMap((rows) => {
              const row = rows[0];
              if (!row) {
                return Effect.fail(
                  new ORPCError("INTERNAL_SERVER_ERROR", {
                    message: `Failed to create binding for ${input.nearAccountId}`,
                  }),
                );
              }
              return Effect.succeed(mapRow(row));
            }),
          ),

        getBinding: (nearAccountId) =>
          query(() =>
            db
              .select()
              .from(nostrBindings)
              .where(eq(nostrBindings.nearAccountId, nearAccountId))
              .limit(1),
          ).pipe(
            Effect.flatMap((rows) => Effect.succeed(rows.length > 0 ? mapRow(rows[0]!) : null)),
          ),

        deleteBinding: (nearAccountId) =>
          query(() =>
            db.delete(nostrBindings).where(eq(nostrBindings.nearAccountId, nearAccountId)),
          ).pipe(Effect.asVoid),
      };
    }),
  );
}
