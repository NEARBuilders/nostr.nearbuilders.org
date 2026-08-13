import type { EventTemplate, VerifiedEvent } from "nostr-tools/pure";

export interface NostrSigner {
  getPublicKey(): Promise<string>;
  signEvent(template: EventTemplate): Promise<VerifiedEvent>;
}
