// ── Signer abstraction for Nostr key management ──

export { ExtensionSigner } from "./extension-signer.js";
export { LocalSigner } from "./local-signer.js";
export type { NostrSigner, WindowNostr } from "./types.js";
export { detectNostrExtension, waitForNostrExtension } from "./types.js";
