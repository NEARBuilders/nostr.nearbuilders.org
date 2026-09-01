import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { NostrConfigTag, type NostrResolvedConfig } from "../lib/nostr-config";
import type { NostrEvent } from "../nostr-core/types";

export interface BindingEntry {
  npub: string;
  relay: string;
  proof: string;
  bound_at: number;
}

export interface Identity {
  nearAccountId: string;
  nostrPubkey: string;
  relay: string;
  proof: string;
  boundAt: number;
  profile?: {
    name?: string | null;
    picture?: string | null;
    about?: string | null;
    nip05?: string | null;
    website?: string | null;
  } | null;
}

export interface BindingWriteArgs {
  contractId: string;
  methodName: "__fastdata_kv";
  key: string;
  value: string;
  args: Record<string, string>;
  gas: string;
  attachedDeposit: string;
}

export interface Challenge {
  challenge: string;
  expiresAt: number;
}

export interface VerifiedChallenge {
  valid: boolean;
  nostrPubkey: string;
  proof: string;
}

export interface BindingServiceShape {
  readonly getBinding: (nearAccountId: string) => Effect.Effect<BindingEntry | null, never>;
  readonly getBindingOutput: (
    nearAccountId: string,
  ) => Effect.Effect<
    { npub: string; relay: string; proof: string; boundAt: number } | null,
    ORPCError<"BAD_REQUEST", unknown>
  >;
  readonly getIdentity: (
    nearAccountId: string,
    enrichProfile?: boolean,
  ) => Effect.Effect<Identity | null, ORPCError<"BAD_REQUEST", unknown>>;
  readonly getProfile: (pubkey: string) => Effect.Effect<Identity["profile"] | null, never>;
  readonly createChallenge: (nearAccountId: string) => Effect.Effect<Challenge, never>;
  readonly verifyChallenge: (
    event: NostrEvent,
    nearAccountId: string,
  ) => Effect.Effect<VerifiedChallenge, ORPCError<"BAD_REQUEST", unknown>>;
  readonly prepareBindingWrite: (params: {
    nostrPubkey: string;
    relay: string;
    proof: string;
    nearAccountId: string;
  }) => Effect.Effect<BindingWriteArgs, never>;
}

export class BindingService extends Context.Tag("nostr/BindingService")<
  BindingService,
  BindingServiceShape
>() {}

const KV_TIMEOUT_MS = 5_000;

const readKv = (
  cfg: NostrResolvedConfig,
  nearAccountId: string,
): Effect.Effect<BindingEntry | null, never> =>
  Effect.tryPromise({
    try: async () => {
      const url = `${cfg.kvApiUrl}/v0/latest/${cfg.bindingContract}/${nearAccountId}/nostr/${nearAccountId}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(KV_TIMEOUT_MS) });
      if (!res.ok || res.status === 404) return null;
      const data = (await res.json()) as {
        entries?: Array<{ value?: unknown }>;
      };
      const entry = data?.entries?.[0];
      if (!entry?.value) return null;
      return typeof entry.value === "string"
        ? (JSON.parse(entry.value) as BindingEntry)
        : (entry.value as BindingEntry);
    },
    catch: () => null as BindingEntry | null,
  }).pipe(Effect.orElseSucceed(() => null));

const readProfile = (
  relays: string[],
  pubkey: string,
): Effect.Effect<Identity["profile"] | null, never> =>
  Effect.tryPromise({
    try: async () => {
      const relay = relays[0];
      if (!relay) return null;
      const res = await fetch(relay, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(["REQ", "profile", { kinds: [0], authors: [pubkey], limit: 1 }]),
      });
      if (!res.ok) return null;
      const text = await res.text();
      const line = text.split("\n").find((l) => l.startsWith('["EVENT"'));
      if (!line) return null;
      const event = JSON.parse(line) as { content?: string };
      if (!event.content) return null;
      return JSON.parse(event.content) as Identity["profile"];
    },
    catch: () => null as Identity["profile"] | null,
  }).pipe(Effect.orElseSucceed(() => null));

const badRequest = (message: string): ORPCError<"BAD_REQUEST", unknown> =>
  new ORPCError("BAD_REQUEST", { message, data: {} });

export const BindingServiceLive = Layer.effect(
  BindingService,
  Effect.gen(function* () {
    const cfg = yield* NostrConfigTag;

    const getBinding = (nearAccountId: string) => readKv(cfg, nearAccountId);

    const getBindingOutput: BindingServiceShape["getBindingOutput"] = (nearAccountId) =>
      Effect.gen(function* () {
        const entry = yield* getBinding(nearAccountId);
        if (!entry) return null;
        return {
          npub: entry.npub,
          relay: entry.relay,
          proof: entry.proof,
          boundAt: entry.bound_at,
        };
      });

    const getIdentity: BindingServiceShape["getIdentity"] = (nearAccountId, enrichProfile = true) =>
      Effect.gen(function* () {
        const binding = yield* getBinding(nearAccountId);
        if (!binding) return null;
        const result: Identity = {
          nearAccountId,
          nostrPubkey: binding.npub,
          relay: binding.relay,
          proof: binding.proof,
          boundAt: binding.bound_at,
        };
        if (enrichProfile) {
          result.profile = yield* readProfile(cfg.standardRelays, binding.npub);
        }
        return result;
      });

    const getProfile = (pubkey: string) => readProfile(cfg.standardRelays, pubkey);

    const createChallenge: BindingServiceShape["createChallenge"] = (nearAccountId) =>
      Effect.sync(() => {
        const expiresAt = Math.floor(Date.now() / 1000) + cfg.challengeExpirySeconds;
        return {
          challenge: `bind:${nearAccountId}:${expiresAt}:near-nostr-bindings`,
          expiresAt,
        };
      });

    const verifyChallenge: BindingServiceShape["verifyChallenge"] = (event, nearAccountId) =>
      Effect.gen(function* () {
        const challenge = event.content;
        if (!challenge?.startsWith("bind:")) {
          return yield* Effect.fail(badRequest("No binding challenge found in event content"));
        }
        const parts = challenge.split(":");
        if (parts.length !== 4 || parts[0] !== "bind" || parts[1] !== nearAccountId) {
          return yield* Effect.fail(
            badRequest("Challenge does not match the authenticated account"),
          );
        }
        const expiresAt = parseInt(parts[2]!, 10);
        if (Number.isNaN(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) {
          return yield* Effect.fail(badRequest("Challenge expired"));
        }
        const proof = JSON.stringify({
          nostrPubkey: event.pubkey,
          challenge,
          eventId: event.id,
          verifiedBy: nearAccountId,
          verifiedAt: Math.floor(Date.now() / 1000),
        });
        return {
          valid: true,
          nostrPubkey: event.pubkey,
          proof,
        };
      });

    const prepareBindingWrite: BindingServiceShape["prepareBindingWrite"] = (params) =>
      Effect.sync(() => {
        const key = `nostr/${params.nearAccountId}`;
        const value = JSON.stringify({
          npub: params.nostrPubkey,
          relay: params.relay,
          proof: params.proof,
          bound_at: Math.floor(Date.now() / 1000),
        });
        return {
          contractId: cfg.bindingContract,
          methodName: "__fastdata_kv",
          key,
          value,
          args: { [key]: value },
          gas: "300000000000000",
          attachedDeposit: "10000000000000000000000",
        };
      });

    return {
      getBinding,
      getBindingOutput,
      getIdentity,
      getProfile,
      createChallenge,
      verifyChallenge,
      prepareBindingWrite,
    } as const;
  }),
);
