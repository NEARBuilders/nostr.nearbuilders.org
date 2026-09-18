import { finalizeEvent, type EventTemplate } from "nostr-tools/pure";
import { getPublicKey } from "nostr-tools/pure";
import { hexToBytes } from "nostr-tools/utils";
import type { NostrSession } from "./keys";

/** Minimal event shape returned by both local signing and NIP-07 signEvent. */
export type SignedNostrEvent = {
  id: string;
  pubkey: string;
  sig: string;
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
};

/** NIP-07 provider surface (Alby, nos2x, etc. inject window.nostr). */
export type Nip07Provider = {
  getPublicKey: () => Promise<string>;
  signEvent: (template: EventTemplate) => Promise<SignedNostrEvent>;
};

export function getNip07(): Nip07Provider | null {
  if (typeof window === "undefined") return null;
  const provider = (window as unknown as { nostr?: Nip07Provider }).nostr;
  return provider ?? null;
}

export type NostrSigner =
  | { kind: "local"; secretKey: Uint8Array }
  | { kind: "nip07" };

export function signerFromSession(session: NostrSession): NostrSigner {
  if (session.source === "extension") return { kind: "nip07" };
  if (!session.secretKeyHex) throw new Error("No local secret key stored");
  return { kind: "local", secretKey: hexToBytes(session.secretKeyHex) };
}

export async function signerPubkey(signer: NostrSigner): Promise<string> {
  if (signer.kind === "local") return getPublicKey(signer.secretKey);
  const provider = getNip07();
  if (!provider) throw new Error("No NIP-07 extension found");
  return provider.getPublicKey();
}

export async function signWithSigner(
  signer: NostrSigner,
  template: EventTemplate,
): Promise<SignedNostrEvent> {
  if (signer.kind === "local") {
    return finalizeEvent(template, signer.secretKey) as SignedNostrEvent;
  }
  const provider = getNip07();
  if (!provider) throw new Error("No NIP-07 extension found — install Alby or nos2x, or use a local key");
  return provider.signEvent(template);
}
