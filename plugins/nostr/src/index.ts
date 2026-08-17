import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

import { contract } from "./contract";
import type { NostrDatabase } from "./db/index";
import { ContextSchema } from "./lib/context";
import { NearNostr } from "./near-nostr/core";
import { NostrCore, StandardAdapter } from "./nostr-core";
import type { PluginsClient } from "./plugins-client.gen";
import { createBinding, deleteBinding, getBinding } from "./services/binding-service";
import { deriveNostrPubkey, deriveNostrSecretKey } from "./services/key-derivation";

function initDb(url: string): Promise<NostrDatabase> {
  return (async () => {
    const { createDatabaseDriver } = await import("./db/index");
    const driver = await createDatabaseDriver(url);

    const migrations = await import("virtual:drizzle-migrations.sql");
    const { migrate } = await import("./db/migrator");
    await migrate(driver.db, migrations.default);

    return driver.db;
  })();
}

export default createPlugin.withPlugins<PluginsClient>()({
  variables: z.object({
    relays: z
      .array(z.string())
      .default(["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"])
      .describe("Default Nostr relay URLs"),
    clientName: z
      .string()
      .default("nostr.nearbuilders.org")
      .describe("Client identifier tag attached to each published event"),
  }),

  secrets: z.object({
    NOSTR_DATABASE_URL: z
      .string()
      .default("pglite:.bos/nostr/:memory:")
      .describe("Database connection string for Nostr binding storage"),
  }),

  context: ContextSchema,

  contract,

  initialize: (config, _plugins, _tools) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("[Nostr] Initializing");

      const core = new NostrCore({ relays: config.variables.relays });
      const adapter = new StandardAdapter(config.variables.relays);
      const nearNostr = new NearNostr({
        relays: config.variables.relays,
        clientName: config.variables.clientName,
      });
      nearNostr.useAdapter(adapter);

      const db = yield* Effect.promise(() => initDb(config.secrets.NOSTR_DATABASE_URL));

      yield* Effect.logInfo("[Nostr] Ready");

      return { core, adapter, nearNostr, db };
    }),

  shutdown: () =>
    Effect.gen(function* () {
      yield* Effect.logInfo("[Nostr] Shutdown");
    }),

  createRouter: (context, builder) => {
    const { adapter, nearNostr, db } = context;

    function requireNearSession(ctx: {
      near?: { primaryAccountId?: string | null; hasNearAccount?: boolean };
    }): string {
      const nearAccountId = ctx.near?.primaryAccountId;
      if (!nearAccountId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "NEAR account required. Connect a NEAR wallet first.",
        });
      }
      return nearAccountId;
    }

    return {
      getPublicKey: builder.getPublicKey.handler(async ({ context: ctx }) => {
        const nearAccountId = requireNearSession(ctx);
        const seed = new TextEncoder().encode(nearAccountId + (ctx.userId ?? ""));
        const pubkey = deriveNostrPubkey(nearAccountId, seed);
        const binding = await getBinding(db, nearAccountId);
        return { pubkey, hasBinding: binding !== null };
      }),

      listRelays: builder.listRelays.handler(async () => ({
        relays: nearNostr.config.relays,
      })),

      getProfile: builder.getProfile.handler(async ({ input }) => {
        const profile = await adapter.getProfile(input.pubkey);
        if (!profile) {
          throw new ORPCError("NOT_FOUND", { message: "Profile not found" });
        }
        return profile;
      }),

      getIdentity: builder.getIdentity.handler(async ({ input }) => {
        const identity = await nearNostr.getIdentity(input.nearAccountId);
        return identity;
      }),

      publishComment: builder.publishComment.handler(async ({ input, context: ctx }) => {
        const nearAccountId = requireNearSession(ctx);
        const seed = new TextEncoder().encode(nearAccountId + (ctx.userId ?? ""));
        const secretKey = deriveNostrSecretKey(nearAccountId, seed);

        const event = await nearNostr.createComment({
          target: input.target as any,
          content: input.content,
          nearAccountId,
          nostrSecretKey: secretKey,
          parentEventId: input.parentEventId,
          relays: input.relays,
          adapterType: input.adapterType,
        });

        const statuses: Record<string, boolean> = {};
        return { event, statuses };
      }),

      listComments: builder.listComments.handler(async ({ input }) => {
        const comments = await nearNostr.listComments({
          target: input.target as any,
          limit: input.limit,
          since: input.since,
          until: input.until,
          relays: input.relays,
          adapterType: input.adapterType,
          requireBound: input.requireBound,
        });

        const enriched = await nearNostr.enrichComments(comments);
        return enriched;
      }),

      createBinding: builder.createBinding.handler(async ({ input }) => {
        const binding = await createBinding(db, {
          nearAccountId: input.nearAccountId,
          nostrPubkey: input.nostrPubkey,
          relay: input.relay,
        });
        return binding;
      }),

      deleteBinding: builder.deleteBinding.handler(async ({ input }) => {
        await deleteBinding(db, input.nearAccountId);
        return { success: true as const };
      }),

      getBinding: builder.getBinding.handler(async ({ input }) => {
        const binding = await getBinding(db, input.nearAccountId);
        return binding;
      }),

      ping: builder.ping.handler(async () => ({
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      })),
    };
  },
});
