import { finalizeEvent, generateSecretKey, getEventHash, verifyEvent } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "../src/nostr-core/types";

function makeBindingEvent(content: string): NostrEvent {
  const sk = generateSecretKey();
  return finalizeEvent(
    {
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", "alice.near"],
        ["client", "nostr.nearbuilders.org"],
      ],
      content,
    },
    sk,
  ) as unknown as NostrEvent;
}

/**
 * Build a tampered copy of an event WITHOUT carrying over the
 * `verifiedSymbol` cache set by `finalizeEvent`. Spread + JSX-set Symbol
 * keys are inherited, so a fresh plain-object copy is needed for tamper
 * tests to actually exercise `verifyEvent`'s recomputation path.
 */
function cloneMinus<T extends object>(event: T, mutate: (e: any) => void): T {
  const out: any = {
    id: (event as any).id,
    pubkey: (event as any).pubkey,
    created_at: (event as any).created_at,
    kind: (event as any).kind,
    tags: (event as any).tags,
    content: (event as any).content,
    sig: (event as any).sig,
  };
  mutate(out);
  return out as T;
}

describe("kind-27235 Nostr event signing + verification", () => {
  it("verifies a valid signed event", () => {
    const event = makeBindingEvent("bind:alice.near:9999999999:near-nostr-bindings");
    expect(event.id).toHaveLength(64);
    expect(event.pubkey).toHaveLength(64);
    expect(verifyEvent(event as unknown as Parameters<typeof verifyEvent>[0])).toBe(true);
  });

  it("rejects when the signature is replaced with an all-zero signature", () => {
    const event = makeBindingEvent("bind:alice.near:9999999999:near-nostr-bindings");
    const tampered = cloneMinus(event, (e) => {
      e.sig = "0".repeat(128);
    });
    expect(verifyEvent(tampered as unknown as Parameters<typeof verifyEvent>[0])).toBe(false);
  });

  it("rejects when a tag is removed (id recomputation no longer matches)", () => {
    const event = makeBindingEvent("bind:alice.near:9999999999:near-nostr-bindings");
    const tampered = cloneMinus(event, (e) => {
      e.tags = e.tags.filter((t: string[]) => t[0] !== "client");
    });
    expect(getEventHash(tampered as unknown as Parameters<typeof getEventHash>[0])).not.toBe(
      tampered.id,
    );
    expect(verifyEvent(tampered as unknown as Parameters<typeof verifyEvent>[0])).toBe(false);
  });

  it("rejects when the content is changed (id recomputation no longer matches)", () => {
    const event = makeBindingEvent("bind:alice.near:9999999999:near-nostr-bindings");
    const tampered = cloneMinus(event, (e) => {
      e.content = "bind:mallory.near:9999999999:near-nostr-bindings";
    });
    expect(getEventHash(tampered as unknown as Parameters<typeof getEventHash>[0])).not.toBe(
      tampered.id,
    );
    expect(verifyEvent(tampered as unknown as Parameters<typeof verifyEvent>[0])).toBe(false);
  });

  it("rejects when the created_at is shifted (id recomputation no longer matches)", () => {
    const event = makeBindingEvent("bind:alice.near:9999999999:near-nostr-bindings");
    const tampered = cloneMinus(event, (e) => {
      e.created_at = e.created_at - 10;
    });
    expect(getEventHash(tampered as unknown as Parameters<typeof getEventHash>[0])).not.toBe(
      tampered.id,
    );
    expect(verifyEvent(tampered as unknown as Parameters<typeof verifyEvent>[0])).toBe(false);
  });

  it("rejects when a sig from a different message is grafted on", () => {
    const a = makeBindingEvent("bind:alice.near:9999999999:near-nostr-bindings");
    const b = makeBindingEvent("bind:bob.near:9999999999:near-nostr-bindings");
    const tampered = cloneMinus(a, (e) => {
      e.sig = b.sig;
    });
    expect(verifyEvent(tampered as unknown as Parameters<typeof verifyEvent>[0])).toBe(false);
  });

  it("rejects when the pubkey is replaced (sig was signed by a different key)", () => {
    const event = makeBindingEvent("bind:alice.near:9999999999:near-nostr-bindings");
    const other = makeBindingEvent("bind:alice.near:9999999999:near-nostr-bindings");
    const tampered = cloneMinus(event, (e) => {
      e.pubkey = other.pubkey;
    });
    expect(verifyEvent(tampered as unknown as Parameters<typeof verifyEvent>[0])).toBe(false);
  });
});
