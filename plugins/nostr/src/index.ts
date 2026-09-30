import { createPlugin } from "every-plugin";
import { Effect, Layer } from "every-plugin/effect";
import type { DecoratedMiddleware } from "every-plugin/orpc";
import { ORPCError } from "every-plugin/orpc";
import type { z } from "every-plugin/zod";
import { contract } from "./contract";
import type { AuthContext } from "./lib/auth";
import { createAuthMiddleware } from "./lib/auth";
import { ContextSchema, runEffect } from "./lib/context";
import {
  NostrConfigLive,
  NostrSecretsSchema,
  NostrVariablesSchema,
  resolveNostrConfig,
} from "./lib/nostr-config";
import type { PluginsClient } from "./lib/plugins-client.gen";
import type { NostrFilterSchema } from "./lib/schemas";
import { BuzzAdapterLive, StandardAdapterLive } from "./nostr-core/adapters";
import type { NostrFilter } from "./nostr-core/types";
import { BindingService, BindingServiceLive } from "./services/binding";
import { NostrCommentService, NostrCommentServiceLive } from "./services/nostr";

export default createPlugin.withPlugins<PluginsClient>()({
  variables: NostrVariablesSchema,

  secrets: NostrSecretsSchema,

  context: ContextSchema,

  contract,

  initialize: (config, _plugins, tools) =>
    Effect.gen(function* () {
      const resolved = resolveNostrConfig(config.variables, config.secrets);
      const configLayer = NostrConfigLive(resolved);

      const binding = yield* tools.buildService(
        BindingService,
        BindingServiceLive.pipe(Layer.provide(configLayer)),
      );

      const comments = yield* tools.buildService(
        NostrCommentService,
        NostrCommentServiceLive.pipe(
          Layer.provide(BuzzAdapterLive),
          Layer.provide(StandardAdapterLive),
          Layer.provide(configLayer),
        ),
      );

      yield* Effect.logInfo("[Nostr] Services Initialized");

      return { relays: resolved.relays, binding, comments };
    }),

  shutdown: () =>
    Effect.gen(function* () {
      yield* Effect.logInfo("[Nostr] Shutdown");
    }),

  createRouter: (services, builder) => {
    const { binding, comments } = services;
    const mw = createAuthMiddleware(builder);

    const requireNearAccount = builder.middleware(
      async ({ context, next }: { context: AuthContext; next: any }) => {
        const nearAccountId = context.near?.primaryAccountId;
        if (!nearAccountId) {
          throw new ORPCError("UNAUTHORIZED", {
            message: "NEAR account required. Connect a NEAR wallet first.",
          });
        }
        return next({ context: { nearAccountId } });
      },
    ) as DecoratedMiddleware<AuthContext, { nearAccountId: string }, any, any, any, any>;

    return {
      listRelays: builder.listRelays.handler(async () => ({
        relays: services.relays,
      })),

      ping: builder.ping.handler(async () => ({
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      })),

      getBinding: builder.getBinding.handler(({ input }) =>
        runEffect(binding.getBindingOutput(input.nearAccountId)),
      ),

      getIdentity: builder.getIdentity.handler(({ input }) =>
        runEffect(binding.getIdentity(input.nearAccountId, input.enrichProfile)),
      ),

      createChallenge: builder.createChallenge
        .use(mw.requireAuth)
        .use(requireNearAccount)
        .handler(({ context }) => runEffect(binding.createChallenge(context.nearAccountId))),

      verifyBinding: builder.verifyBinding
        .use(mw.requireAuth)
        .use(requireNearAccount)
        .handler(async ({ input, context }) => {
          const result = await runEffect(
            binding.verifyChallenge(input.event, context.nearAccountId),
          );
          return {
            valid: result.valid,
            nearAccountId: context.nearAccountId,
            nostrPubkey: result.nostrPubkey,
            proof: result.proof,
          };
        }),

      prepareBindingWrite: builder.prepareBindingWrite
        .use(mw.requireAuth)
        .use(requireNearAccount)
        .handler(({ input, context }) =>
          runEffect(
            binding.prepareBindingWrite({
              nostrPubkey: input.nostrPubkey,
              relay: input.relay,
              proof: input.proof,
              nearAccountId: context.nearAccountId,
            }),
          ),
        ),

      listComments: builder.listComments.handler(({ input }) =>
        runEffect(
          comments.listComments({
            target: input.target,
            targetType: input.targetType,
            adapterType: input.adapterType ?? "standard",
            limit: input.limit,
            since: input.since,
            enrich: input.enrich,
            requireBound: input.requireBound,
            requireVerified: input.requireVerified,
          }),
        ).then((result) => ({ data: result, meta: { count: result.length } })),
      ),

      createComment: builder.createComment
        .use(mw.requireAuth)
        .use(requireNearAccount)
        .handler(({ input }) =>
          runEffect(
            comments.publishSigned({
              event: input.event,
              target: input.target,
              targetType: input.targetType,
              adapterType: input.adapterType ?? "standard",
            }),
          ),
        ),

      listChannels: builder.listChannels.handler(() =>
        runEffect(comments.listChannels("buzz")).then((data) => ({ data })),
      ),

      queryEvents: builder.queryEvents.handler(({ input, signal }) =>
        runEffect(
          comments.rawQuery({ filter: toRelayFilter(input.filter), relays: input.relays, signal }),
        ),
      ),

      subscribeEvents: builder.subscribeEvents.handler(async function* ({ input, signal }) {
        const stream = await runEffect(
          comments.rawSubscribe({
            filter: toRelayFilter(input.filter),
            relays: input.relays,
            signal,
          }),
        );
        yield* stream;
      }),

      publishEvent: builder.publishEvent.handler(({ input }) =>
        runEffect(comments.rawPublish({ event: input.event, relays: input.relays })),
      ),

      getProfile: builder.getProfile.handler(({ input }) =>
        runEffect(comments.getProfile(input.pubkey)),
      ),
    };
  },
});

function toRelayFilter(input: z.infer<typeof NostrFilterSchema>): NostrFilter {
  const { tags, ...filter } = input;
  const result: NostrFilter = { ...filter };
  for (const { tag, values } of tags ?? []) {
    const key = `#${tag}` as const;
    result[key] = [...new Set([...(result[key] ?? []), ...values])];
  }
  return result;
}
