import { Cause, Effect, Exit, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import { NostrConfigLive, type NostrResolvedConfig } from "../src/lib/nostr-config";
import type { NostrEvent } from "../src/nostr-core/types";
import { BindingService, BindingServiceLive } from "../src/services/binding";

const CFG: NostrResolvedConfig = {
  relays: [],
  clientName: "test",
  kvApiUrl: "https://kv.test",
  bindingContract: "contextual.near",
  standardRelays: ["wss://relay.test"],
  buzzRelays: [],
  buzzSecretKey: undefined,
  challengeExpirySeconds: 300,
};

const TestLayer = Layer.provide(BindingServiceLive, NostrConfigLive(CFG));

async function runBinding<A, E>(effect: Effect.Effect<A, E, never>): Promise<Exit.Exit<A, E>> {
  return Effect.runPromiseExit(effect);
}

function runBindingSync<A, E>(effect: Effect.Effect<A, E, never>): Exit.Exit<A, E> {
  return Effect.runSyncExit(effect);
}

function withBinding<A, E>(
  build: (svc: typeof BindingService.Service) => Effect.Effect<A, E, never>,
): Effect.Effect<A, E, never> {
  return Effect.flatMap(BindingService, build).pipe(Effect.provide(TestLayer));
}

async function expectBadRequest<A>(
  build: (
    svc: typeof BindingService.Service,
  ) => Effect.Effect<A, ORPCError<"BAD_REQUEST", unknown>, never>,
) {
  const exit = await runBinding(withBinding(build));
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const squashed = Cause.squash(exit.cause);
    expect(squashed).toBeInstanceOf(ORPCError);
    expect((squashed as ORPCError<string, unknown>).code).toBe("BAD_REQUEST");
  }
}

function makeBindingEvent(content: string): NostrEvent {
  const sk = generateSecretKey();
  return finalizeEvent(
    {
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", "alice.near"]],
      content,
    },
    sk,
  ) as unknown as NostrEvent;
}

const NEAR = "alice.near";

describe("BindingService.createChallenge", () => {
  it("issues a challenge string of the expected shape", () => {
    const exit = runBindingSync(withBinding((svc) => svc.createChallenge(NEAR)));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.challenge).toMatch(/^bind:alice\.near:\d+:near-nostr-bindings$/);
      expect(exit.value.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });

  it("uses challengeExpirySeconds=300 by default", () => {
    const exit = runBindingSync(withBinding((svc) => svc.createChallenge(NEAR)));
    if (Exit.isSuccess(exit)) {
      const ttl = exit.value.expiresAt - Math.floor(Date.now() / 1000);
      expect(ttl).toBeGreaterThanOrEqual(295);
      expect(ttl).toBeLessThanOrEqual(300);
    }
  });
});

describe("BindingService.verifyChallenge", () => {
  it("verifies a valid challenge for the matching account", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const content = `bind:${NEAR}:${expiresAt}:near-nostr-bindings`;
    const event = makeBindingEvent(content);
    const exit = await runBinding(withBinding((svc) => svc.verifyChallenge(event, NEAR)));
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.valid).toBe(true);
      expect(exit.value.nostrPubkey).toBe(event.pubkey);
      const proof = JSON.parse(exit.value.proof) as Record<string, unknown>;
      expect(proof.nostrPubkey).toBe(event.pubkey);
      expect(proof.challenge).toBe(content);
    }
  });

  it("rejects when content does not start with 'bind:'", async () => {
    const event = makeBindingEvent("garbage-content");
    await expectBadRequest((svc) => svc.verifyChallenge(event, NEAR));
  });

  it("rejects when the challenge belongs to a different account", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const content = `bind:bob.near:${expiresAt}:near-nostr-bindings`;
    const event = makeBindingEvent(content);
    await expectBadRequest((svc) => svc.verifyChallenge(event, NEAR));
  });

  it("rejects expired challenges", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 10;
    const content = `bind:${NEAR}:${expiresAt}:near-nostr-bindings`;
    const event = makeBindingEvent(content);
    await expectBadRequest((svc) => svc.verifyChallenge(event, NEAR));
  });

  it("rejects when expiresAt parses to NaN", async () => {
    const content = `bind:${NEAR}:NaN:near-nostr-bindings`;
    const event = makeBindingEvent(content);
    await expectBadRequest((svc) => svc.verifyChallenge(event, NEAR));
  });

  it("rejects when the challenge has fewer than 4 segments", async () => {
    const content = `bind:${NEAR}:1234`;
    const event = makeBindingEvent(content);
    await expectBadRequest((svc) => svc.verifyChallenge(event, NEAR));
  });
});

describe("BindingService.prepareBindingWrite", () => {
  it("builds tx args for the KV write with current timestamp", () => {
    const exit = runBindingSync(
      withBinding((svc) =>
        svc.prepareBindingWrite({
          nostrPubkey: "npub1abc",
          relay: "wss://relay.test",
          proof: "proof-json",
          nearAccountId: NEAR,
        }),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.contractId).toBe("contextual.near");
      expect(exit.value.methodName).toBe("__fastdata_kv");
      expect(exit.value.key).toBe(`nostr/${NEAR}`);
      expect(exit.value.attachedDeposit).toBe("10000000000000000000000");
      expect(exit.value.gas).toBe("300000000000000");
      const parsed = JSON.parse(exit.value.value);
      expect(parsed.npub).toBe("npub1abc");
      expect(parsed.relay).toBe("wss://relay.test");
      expect(parsed.bound_at).toBeGreaterThan(Math.floor(Date.now() / 1000) - 5);
    }
  });
});
