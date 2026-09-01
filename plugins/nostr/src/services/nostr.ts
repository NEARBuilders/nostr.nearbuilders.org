import { createHash } from "node:crypto";
import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { readKvBindingEntry } from "../lib/fastnear-kv";
import { NostrConfigTag } from "../lib/nostr-config";
import type { ChannelInfo, NostrComment, NostrProfile, PublishResult } from "../lib/schemas";
import { BuzzAdapter, StandardAdapter, StandardAdapterService } from "../nostr-core/adapters";
import type { NostrEvent, NostrFilter } from "../nostr-core/types";
import { findNearTargetTag, nearTargetKey } from "../nostr-core/types";

type AdapterType = "standard" | "buzz";

export interface NostrCommentServiceShape {
  readonly listComments: (opts: {
    target: string;
    targetType: string;
    adapterType: AdapterType;
    limit?: number;
    since?: number;
    enrich?: boolean;
    requireBound?: boolean;
    requireVerified?: boolean;
  }) => Effect.Effect<NostrComment[], ORPCError<"BAD_REQUEST", unknown>>;
  readonly publishSigned: (opts: {
    event: NostrEvent;
    target: string;
    targetType: string;
    adapterType: AdapterType;
  }) => Effect.Effect<PublishResult, ORPCError<"BAD_REQUEST", unknown>>;
  readonly listChannels: (adapterType?: AdapterType) => Effect.Effect<ChannelInfo[], never>;
  readonly rawQuery: (opts: {
    filter: NostrFilter;
    relays?: string[];
  }) => Effect.Effect<NostrEvent[], never>;
  readonly rawPublish: (opts: {
    event: NostrEvent;
    relays?: string[];
  }) => Effect.Effect<PublishResult, ORPCError<"BAD_REQUEST", unknown>>;
  readonly getProfile: (pubkey: string) => Effect.Effect<NostrProfile | null, never>;
}

export class NostrCommentService extends Context.Tag("nostr/NostrCommentService")<
  NostrCommentService,
  NostrCommentServiceShape
>() {}

const badRequest = (message: string): ORPCError<"BAD_REQUEST", unknown> =>
  new ORPCError("BAD_REQUEST", { message, data: {} });

/**
 * Reject a client-signed comment whose `near_target` tag does not match
 * the composite of (targetType, target) the request claims. Without this,
 * callers can publish events with tags that don't match the request body —
 * silently unfetchable, polluting relay indexes with miscategorized events.
 * Returns an ORPCError so the caller can short-circuit before publishing.
 */
export const assertCommentTagsMatchRequest = (
  event: NostrEvent,
  target: string,
  targetType: string,
): ORPCError<"BAD_REQUEST", unknown> | null => {
  const expected = nearTargetKey(targetType, target);
  const actual = findNearTargetTag(event);
  if (actual === undefined) {
    return badRequest(
      `Comment event is missing the required 'near_target' tag (expected '${expected}')`,
    );
  }
  if (actual !== expected) {
    return badRequest(
      `Comment event's 'near_target' tag ('${actual}') does not match the request ('${expected}')`,
    );
  }
  return null;
};

const toComment = (
  event: NostrEvent,
  target: string,
  targetType: string,
  source: AdapterType,
): NostrComment => ({
  id: event.id,
  pubkey: event.pubkey,
  content: event.content,
  target,
  targetType,
  nearAccountId: event.tags.find((t) => t[0] === "near_account")?.[1],
  parentEventId: event.tags.find((t) => t[0] === "e" && t[3] === "reply")?.[1],
  createdAt: event.created_at,
  tags: event.tags,
  source,
});

const emptyQueryResult: NostrEvent[] = [];
const emptyProfile: NostrProfile | null = null;

export const NostrCommentServiceLive = Layer.scoped(
  NostrCommentService,
  Effect.gen(function* () {
    const cfg = yield* NostrConfigTag;
    const standard = yield* StandardAdapterService;

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (cfg.buzzRelays.length && cfg.buzzSecretKey) {
          new BuzzAdapter({
            relays: cfg.buzzRelays,
            secretKey: cfg.buzzSecretKey,
            resolveChannel: (target: string) =>
              createHash("sha256").update(target).digest("hex").slice(0, 16),
          }).close();
        }
      }),
    );

    const getAdapter = (type: AdapterType): StandardAdapter | BuzzAdapter => {
      if (type === "standard") return standard;
      if (!cfg.buzzRelays.length || !cfg.buzzSecretKey) {
        throw badRequest(`Adapter 'buzz' is not configured`);
      }
      return new BuzzAdapter({
        relays: cfg.buzzRelays,
        secretKey: cfg.buzzSecretKey,
        resolveChannel: (target: string) =>
          createHash("sha256").update(target).digest("hex").slice(0, 16),
      });
    };

    const listComments: NostrCommentServiceShape["listComments"] = (opts) =>
      Effect.gen(function* () {
        const adapter = getAdapter(opts.adapterType);
        const queried = yield* Effect.tryPromise({
          try: () =>
            adapter.query({
              target: opts.target,
              targetType: opts.targetType,
              clientName: cfg.clientName,
              limit: opts.limit,
              since: opts.since,
            }),
          catch: () => ({ events: [] }) as { events: NostrEvent[] },
        }).pipe(Effect.orElseSucceed(() => ({ events: [] }) as { events: NostrEvent[] }));

        let filtered = queried.events.map((e) =>
          toComment(e, opts.target, opts.targetType, opts.adapterType),
        );

        if (opts.requireBound) {
          filtered = filtered.filter((c) => c.nearAccountId);
        }
        if (opts.requireVerified) {
          const accounts = [
            ...new Set(filtered.filter((c) => c.nearAccountId).map((c) => c.nearAccountId!)),
          ];
          const verifications = yield* Effect.forEach(
            accounts,
            (acc) => readKvBindingEntry(cfg, acc).pipe(Effect.map((e) => e !== null)),
            { concurrency: 5 },
          );
          const verified = new Set(accounts.filter((_, i) => verifications[i]));
          filtered = filtered.filter((c) => c.nearAccountId && verified.has(c.nearAccountId));
        }
        if (opts.enrich) {
          const pubkeys = [...new Set(filtered.map((c) => c.pubkey))];
          const profiles = yield* Effect.forEach(
            pubkeys,
            (pk) =>
              Effect.tryPromise({
                try: () => standard.getProfile(pk),
                catch: () => null as NostrProfile | null,
              }).pipe(Effect.orElseSucceed(() => null)),
            { concurrency: 5 },
          );
          const profileMap = new Map(pubkeys.map((pk, i) => [pk, profiles[i]] as const));
          for (const c of filtered) {
            const p = profileMap.get(c.pubkey);
            if (p) c.profile = p;
          }
        }
        return filtered;
      });

    const publishSigned: NostrCommentServiceShape["publishSigned"] = (opts) =>
      Effect.gen(function* () {
        const validationError = assertCommentTagsMatchRequest(
          opts.event,
          opts.target,
          opts.targetType,
        );
        if (validationError) {
          return yield* Effect.fail(validationError);
        }
        const adapter = getAdapter(opts.adapterType);
        if (!(adapter instanceof BuzzAdapter) && !(adapter instanceof StandardAdapter)) {
          return yield* Effect.fail(
            badRequest(`Adapter not supported for publish: ${opts.adapterType}`),
          );
        }
        const result = yield* Effect.tryPromise({
          try: () => adapter.publishSigned(opts.event),
          catch: (e: unknown) =>
            new ORPCError("BAD_REQUEST", {
              message: e instanceof Error ? e.message : String(e),
              data: {},
            }),
        });
        const statuses = [...result.statuses].map(([relay, success]) => ({
          relay,
          success,
        }));
        return { eventId: result.event.id, statuses };
      });

    const listChannels: NostrCommentServiceShape["listChannels"] = (adapterType) =>
      Effect.gen(function* () {
        const type: AdapterType = adapterType ?? "buzz";
        const adapter = getAdapter(type);
        if (!(adapter instanceof BuzzAdapter)) return [];
        const events = yield* Effect.tryPromise({
          try: () => adapter.listChannels(),
          catch: () => [] as NostrEvent[],
        }).pipe(Effect.orElseSucceed(() => [] as NostrEvent[]));
        return events.map((e) => {
          const id = e.tags.find((t) => t[0] === "d")?.[1];
          const name = e.tags.find((t) => t[0] === "name")?.[1];
          return { id: id ?? e.id, name: name ?? null };
        });
      });

    const rawQuery: NostrCommentServiceShape["rawQuery"] = (opts) =>
      Effect.tryPromise({
        try: () => standard.queryRaw(opts.filter, opts.relays),
        catch: () => emptyQueryResult,
      }).pipe(Effect.catchAll(() => Effect.succeed(emptyQueryResult)));

    const rawPublish: NostrCommentServiceShape["rawPublish"] = (opts) =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: () => standard.publishSigned(opts.event, opts.relays),
          catch: (e: unknown) =>
            new ORPCError("BAD_REQUEST", {
              message: e instanceof Error ? e.message : String(e),
              data: {},
            }),
        });
        const statuses = [...result.statuses].map(([relay, success]) => ({
          relay,
          success,
        }));
        return { eventId: result.event.id, statuses };
      });

    const getProfile: NostrCommentServiceShape["getProfile"] = (pubkey) =>
      Effect.tryPromise({
        try: () => standard.getProfile(pubkey),
        catch: () => emptyProfile,
      }).pipe(Effect.catchAll(() => Effect.succeed(emptyProfile)));

    return {
      listComments,
      publishSigned,
      listChannels,
      rawQuery,
      rawPublish,
      getProfile,
    } as const;
  }),
);
