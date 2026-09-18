import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { bytesToHex, hexToBytes } from "nostr-tools/utils";
import { decode, nsecEncode, type DecodedNsec } from "nostr-tools/nip19";

const STORAGE_PREFIX = "nostr:session:";

export interface NostrSession {
  secretKeyHex: string;
  pubkey: string;
  source: NostrKeySource;
}

export type NostrKeySource = "generated" | "imported" | "extension";

export function loadSession(nearAccountId: string): NostrSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + nearAccountId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NostrSession>;
    if (!parsed.pubkey) return null;
    return {
      secretKeyHex: parsed.secretKeyHex ?? "",
      pubkey: parsed.pubkey,
      source: parsed.source ?? "generated",
    };
  } catch {
    return null;
  }
}

export function saveSession(
  nearAccountId: string,
  secretKeyHex: string,
  pubkey: string,
  source: NostrKeySource = "generated",
) {
  localStorage.setItem(
    STORAGE_PREFIX + nearAccountId,
    JSON.stringify({ secretKeyHex, pubkey, source } satisfies NostrSession),
  );
}

export function clearSession(nearAccountId: string) {
  localStorage.removeItem(STORAGE_PREFIX + nearAccountId);
}

export function generateAndStore(nearAccountId: string): NostrSession {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const hex = bytesToHex(sk);
  saveSession(nearAccountId, hex, pk, "generated");
  return { secretKeyHex: hex, pubkey: pk, source: "generated" };
}

/** Accepts nsec… or 64-char hex; stores normalized hex. Throws on invalid input. */
export function importAndStore(nearAccountId: string, secretInput: string): NostrSession {
  const secretKeyHex = normalizeSecret(secretInput);
  const sk = hexToBytes(secretKeyHex);
  const pk = getPublicKey(sk);
  saveSession(nearAccountId, secretKeyHex, pk, "imported");
  return { secretKeyHex, pubkey: pk, source: "imported" };
}

export function normalizeSecret(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Empty key");
  if (trimmed.startsWith("nsec1")) {
    const decoded = decode(trimmed) as DecodedNsec;
    if (decoded.type !== "nsec") throw new Error("Not an nsec key");
    return bytesToHex(decoded.data);
  }
  const hex = trimmed.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error("Key must be nsec… or 64-char hex");
  }
  return hex;
}

export function secretToNsec(session: NostrSession): string {
  return nsecEncode(hexToBytes(session.secretKeyHex));
}

export function secretKeyBytes(session: NostrSession): Uint8Array {
  return hexToBytes(session.secretKeyHex);
}
