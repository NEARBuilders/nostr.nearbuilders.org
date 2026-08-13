import {
  type EventTemplate,
  finalizeEvent,
  getPublicKey as nostrGetPubkey,
  type VerifiedEvent,
} from "nostr-tools/pure";
import type { NostrSigner } from "./types";

export class LocalSigner implements NostrSigner {
  private secretKey: Uint8Array;
  public readonly pubkey: string;

  constructor(secretKey: Uint8Array) {
    this.secretKey = secretKey;
    this.pubkey = nostrGetPubkey(secretKey);
  }

  async getPublicKey(): Promise<string> {
    return this.pubkey;
  }

  async signEvent(template: EventTemplate): Promise<VerifiedEvent> {
    return finalizeEvent(template, this.secretKey);
  }
}
