import { getPublicKey } from "nostr-tools/pure";
import { bytesToHex } from "nostr-tools/utils";
import { beforeAll, describe, expect, it } from "vitest";
import {
  clearSession,
  generateAndStore,
  importAndStore,
  loadSession,
  normalizeSecret,
  secretToNsec,
} from "./keys";
import { getNip07, signWithSigner, signerFromSession, signerPubkey } from "./signers";

// --- minimal browser stubs (node environment) ---

type Store = Record<string, string>;

const storage = (): Storage => {
  const store: Store = {};
  return {
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: () => null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
};

beforeAll(() => {
  (globalThis as Record<string, unknown>).localStorage = storage();
  // mirror browsers, where window === globalThis
  (globalThis as Record<string, unknown>).window = globalThis;
});

// --- helpers ---

// deterministic 32-byte secret for reproducible pubkeys
const skBytes = (n: number): Uint8Array => new Uint8Array(32).fill(n);

// --- keys ---

describe("normalizeSecret", () => {
  it("accepts 64-char hex and strips 0x", () => {
    const hex = bytesToHex(skBytes(7));
    expect(normalizeSecret(hex)).toBe(hex);
    expect(normalizeSecret(`0x${hex}`)).toBe(hex);
    expect(normalizeSecret(hex.toUpperCase())).toBe(hex);
  });

  it("accepts nsec and decodes to the same hex", () => {
    const hex = bytesToHex(skBytes(3));
    const nsec = secretToNsec({ secretKeyHex: hex, pubkey: "", source: "generated" });
    expect(nsec.startsWith("nsec1")).toBe(true);
    expect(normalizeSecret(nsec)).toBe(hex);
  });

  it("rejects garbage", () => {
    expect(() => normalizeSecret("")).toThrow();
    expect(() => normalizeSecret("not-a-key")).toThrow();
    expect(() => normalizeSecret("abcd1234")).toThrow();
  });
});

describe("session storage", () => {
  it("generateAndStore round-trips with source=generated", () => {
    const session = generateAndStore("alice.test");
    expect(session.source).toBe("generated");
    const loaded = loadSession("alice.test");
    expect(loaded?.pubkey).toBe(session.pubkey);
    expect(loaded?.source).toBe("generated");
    clearSession("alice.test");
    expect(loadSession("alice.test")).toBeNull();
  });

  it("importAndStore derives the pubkey of the imported key", () => {
    const hex = bytesToHex(skBytes(9));
    const session = importAndStore("bob.test", hex);
    expect(session.pubkey).toBe(getPublicKey(skBytes(9)));
    expect(session.source).toBe("imported");
  });

  it("importAndStore accepts nsec input", () => {
    const hex = bytesToHex(skBytes(11));
    const nsec = secretToNsec({ secretKeyHex: hex, pubkey: "", source: "generated" });
    const session = importAndStore("carol.test", nsec);
    expect(session.pubkey).toBe(getPublicKey(skBytes(11)));
  });

  it("legacy sessions without source load as generated", () => {
    const hex = bytesToHex(skBytes(13));
    localStorage.setItem(
      "nostr:session:dave.test",
      JSON.stringify({ secretKeyHex: hex, pubkey: getPublicKey(skBytes(13)) }),
    );
    const loaded = loadSession("dave.test");
    expect(loaded?.source).toBe("generated");
  });

  it("extension sessions (no secret) still load", () => {
    localStorage.setItem(
      "nostr:session:erin.test",
      JSON.stringify({ secretKeyHex: "", pubkey: "aa".repeat(32), source: "extension" }),
    );
    const loaded = loadSession("erin.test");
    expect(loaded?.pubkey).toBe("aa".repeat(32));
    expect(loaded?.source).toBe("extension");
  });
});

// --- signers ---

describe("signers", () => {
  it("local signer signs and the pubkey matches", async () => {
    const session = importAndStore("signer.test", bytesToHex(skBytes(5)));
    const signer = signerFromSession(session);
    expect(signer.kind).toBe("local");
    await expect(signerPubkey(signer)).resolves.toBe(session.pubkey);

    const event = await signWithSigner(signer, {
      kind: 1,
      created_at: 1,
      tags: [],
      content: "hello",
    });
    expect(event.pubkey).toBe(session.pubkey);
    expect(event.id).toBeTruthy();
    expect(event.sig).toBeTruthy();
  });

  it("extension session maps to nip07 signer", () => {
    const signer = signerFromSession({
      secretKeyHex: "",
      pubkey: "bb".repeat(32),
      source: "extension",
    });
    expect(signer.kind).toBe("nip07");
  });

  it("getNip07 returns null without extension", () => {
    expect(getNip07()).toBeNull();
  });

  it("signs through a NIP-07 provider", async () => {
    (globalThis as Record<string, unknown>).nostr = {
      getPublicKey: async () => getPublicKey(skBytes(21)),
      signEvent: async (template: {
        kind: number;
        content: string;
        tags: string[][];
        created_at: number;
      }) => {
        // real local signing under the hood so the id/sig are valid
        const { finalizeEvent } = await import("nostr-tools/pure");
        return finalizeEvent(template, skBytes(21));
      },
    };
    try {
      const provider = getNip07();
      expect(provider).not.toBeNull();
      const event = await signWithSigner(
        { kind: "nip07" },
        { kind: 1, created_at: 2, tags: [], content: "via extension" },
      );
      expect(event.pubkey).toBe(getPublicKey(skBytes(21)));
    } finally {
      delete (globalThis as Record<string, unknown>).nostr;
    }
  });
});
