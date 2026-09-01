import { getPublicKey } from "nostr-tools/pure";
import { describe, expect, it } from "vitest";
import {
  deriveNostrPubkey,
  deriveNostrSecretKey,
  deriveNostrSecretKeyFromHex,
  secretKeyToHex,
} from "../src/services/key-derivation";

describe("deriveNostrPubkey", () => {
  it("is deterministic for the same (accountId, signature) pair", () => {
    const sig = new Uint8Array(32).fill(0xab);
    const a = deriveNostrPubkey("alice.near", sig);
    const b = deriveNostrPubkey("alice.near", sig);
    expect(a).toBe(b);
  });

  it("produces different pubkeys for different NEAR accounts from the same signature", () => {
    const sig = new Uint8Array(32).fill(0xab);
    const alice = deriveNostrPubkey("alice.near", sig);
    const bob = deriveNostrPubkey("bob.near", sig);
    expect(alice).not.toBe(bob);
  });

  it("produces 64-char lowercase hex output", () => {
    const pk = deriveNostrPubkey("alice.near", new Uint8Array(32));
    expect(pk).toHaveLength(64);
    expect(pk).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches nostr-tools getPublicKey over the derived secret key", () => {
    const sig = new Uint8Array(32).fill(0x42);
    const sk = deriveNostrSecretKey("alice.near", sig);
    expect(deriveNostrPubkey("alice.near", sig)).toBe(getPublicKey(sk));
  });
});

describe("deriveNostrSecretKey", () => {
  it("returns a 32-byte secret key", () => {
    const sig = new Uint8Array(32).fill(0x01);
    const sk = deriveNostrSecretKey("alice.near", sig);
    expect(sk).toBeInstanceOf(Uint8Array);
    expect(sk.length).toBe(32);
  });

  it("is deterministic", () => {
    const sig = new Uint8Array(32).fill(0x01);
    const a = deriveNostrSecretKey("alice.near", sig);
    const b = deriveNostrSecretKey("alice.near", sig);
    expect(Buffer.from(a).toString("hex")).toBe(Buffer.from(b).toString("hex"));
  });

  it("produces different secret keys for different accounts", () => {
    const sig = new Uint8Array(32).fill(0x01);
    const alice = deriveNostrSecretKey("alice.near", sig);
    const bob = deriveNostrSecretKey("bob.near", sig);
    expect(Buffer.from(alice).toString("hex")).not.toBe(Buffer.from(bob).toString("hex"));
  });
});

describe("deriveNostrSecretKeyFromHex", () => {
  it("matches deriveNostrSecretKey with a hex-encoded input", () => {
    const hex = "ab".repeat(32);
    const a = deriveNostrSecretKey("alice.near", Buffer.from(hex, "hex"));
    const b = deriveNostrSecretKeyFromHex("alice.near", hex);
    expect(Buffer.from(a).toString("hex")).toBe(Buffer.from(b).toString("hex"));
  });
});

describe("secretKeyToHex", () => {
  it("returns the lowercase hex string of a 32-byte buffer", () => {
    const buf = new Uint8Array(32).fill(0x0f);
    expect(secretKeyToHex(buf)).toBe("0f".repeat(32));
  });
});
