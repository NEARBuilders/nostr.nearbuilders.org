import { createHash } from "node:crypto";
import { getPublicKey } from "nostr-tools/pure";

export function deriveNostrSecretKey(
  nearAccountId: string,
  signature: Uint8Array,
): Uint8Array {
  const hash = createHash("sha256");
  hash.update(Buffer.from(signature));
  hash.update(Buffer.from(nearAccountId, "utf-8"));
  return new Uint8Array(hash.digest());
}

export function deriveNostrSecretKeyFromHex(
  nearAccountId: string,
  signatureHex: string,
): Uint8Array {
  return deriveNostrSecretKey(nearAccountId, Buffer.from(signatureHex, "hex"));
}

export function deriveNostrPubkey(
  nearAccountId: string,
  signature: Uint8Array,
): string {
  const sk = deriveNostrSecretKey(nearAccountId, signature);
  return getPublicKey(sk);
}

export function secretKeyToHex(sk: Uint8Array): string {
  return Buffer.from(sk).toString("hex");
}
