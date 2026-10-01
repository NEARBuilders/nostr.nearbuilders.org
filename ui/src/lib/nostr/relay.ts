import { SimplePool } from "nostr-tools/pool";
import { type EventTemplate, finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { COMMENT_KINDS, Kind, type NearNostrComment, type NearNostrTarget } from "./types";
import { type NostrSigner, signWithSigner } from "./signers";

const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];

function pool() {
  return new SimplePool();
}

export function buildCommentTags(opts: {
  target: NearNostrTarget;
  nearAccountId: string;
  pubkey: string;
  clientName: string;
  parentEventId?: string;
  rootEventId?: string;
  parentPubkey?: string;
}): string[][] {
  const targetKey = `${opts.target.type}:${opts.target.id}`;
  const tags: string[][] = [
    ["t", opts.target.type],
    ["t", opts.clientName],
    ["p", opts.pubkey],
  ];
  if (opts.parentEventId) {
    tags.push(["e", opts.rootEventId ?? opts.parentEventId, "", "root"]);
    tags.push(["e", opts.parentEventId, "", "reply"]);
    if (opts.parentPubkey) {
      tags.push(["p", opts.parentPubkey]);
    }
  }
  if (opts.target.url) {
    tags.push(["r", opts.target.url]);
  }
  tags.push(["client", opts.clientName]);
  tags.push(["near_target", targetKey]);
  tags.push(["near_account", opts.nearAccountId]);
  return tags;
}

export function publishComment(opts: {
  target: NearNostrTarget;
  content: string;
  secretKey: Uint8Array;
  nearAccountId: string;
  parentEventId?: string;
  rootEventId?: string;
  parentPubkey?: string;
  clientName?: string;
  relays?: string[];
}): Promise<{ id: string; statuses: Map<string, boolean> }> {
  const relays = opts.relays ?? DEFAULT_RELAYS;
  const clientName = opts.clientName ?? "nostr.nearbuilders.org";
  const pubkey = getPublicKey(opts.secretKey);

  const tags = buildCommentTags({
    target: opts.target,
    nearAccountId: opts.nearAccountId,
    pubkey,
    clientName,
    parentEventId: opts.parentEventId,
    rootEventId: opts.rootEventId,
    parentPubkey: opts.parentPubkey,
  });

  const event = finalizeEvent(
    {
      kind: Kind.COMMENT,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: opts.content,
    },
    opts.secretKey,
  );

  const p = pool();
  const results = p.publish(relays, event as any);
  const statuses = new Map<string, boolean>();

  return Promise.allSettled(
    results.map(async (pr, i) => {
      try {
        await pr;
        statuses.set(relays[i]!, true);
      } catch {
        statuses.set(relays[i]!, false);
      }
    }),
  ).then(() => {
    p.close(relays);
    return { id: event.id, statuses };
  });
}

export async function listComments(opts: {
  target: NearNostrTarget;
  clientName?: string;
  limit?: number;
  relays?: string[];
}): Promise<NearNostrComment[]> {
  const relays = opts.relays ?? DEFAULT_RELAYS;
  const targetKey = `${opts.target.type}:${opts.target.id}`;
  const clientName = opts.clientName ?? "nostr.nearbuilders.org";

  const p = pool();
  const events = await p.querySync(relays, {
    kinds: [...COMMENT_KINDS],
    "#t": [opts.target.type, clientName],
    limit: opts.limit ?? 50,
  } as any);

  p.close(relays);

  const filtered = (
    events as unknown as {
      id: string;
      pubkey: string;
      content: string;
      created_at: number;
      tags: string[][];
    }[]
  ).filter((e) => e.tags?.some((t) => t[0] === "near_target" && t[1] === targetKey));

  return filtered.map((e) => {
    const parentId = e.tags?.find((t) => t[0] === "e" && t[3] === "reply")?.[1];
    const rootId = e.tags?.find((t) => t[0] === "e" && t[3] === "root")?.[1] ?? parentId;
    return {
      eventId: e.id,
      pubkey: e.pubkey,
      nearAccountId: e.tags?.find((t) => t[0] === "near_account")?.[1],
      content: e.content,
      createdAt: e.created_at,
      parentId,
      rootId,
      target: opts.target,
    };
  });
}

export async function getProfile(
  pubkey: string,
  relays?: string[],
): Promise<{
  name?: string;
  picture?: string;
  about?: string;
} | null> {
  const relayList = relays ?? DEFAULT_RELAYS;
  const p = pool();
  try {
    const events = await p.querySync(relayList, [
      { kinds: [0], authors: [pubkey], limit: 1 },
    ] as any);
    if (events.length === 0) return null;
    return JSON.parse((events[0] as any).content);
  } catch {
    return null;
  } finally {
    p.close(relayList);
  }
}

// --- signer-based event signing (PR: key lifecycle) ---
export type SignedNostrEvent = import("./signers").SignedNostrEvent;

const CLIENT_NAME = "nostr.nearbuilders.org";

const nearTargetKey = (targetType: string, target: string): string => `${targetType}:${target}`;

export type SignCommentEventOptions = {
  content: string;
  target: NearNostrTarget;
  nearAccountId: string;
  signer: NostrSigner;
  parentEventId?: string;
};

/**
 * Build & sign a kind-1 comment event whose tags match what the plugin's
 * `createComment` validator expects:
 *
 *   - `near_target` = `<targetType>:<id>`  (composite, validated server-side)
 *   - `near_account` = `<NEAR account>`     (so requireBound/requireVerified work)
 *   - `t` × 2 -- targetType + clientName -- keeps relay-side filtering (#t) useful
 *   - `client` = clientName (NIP-24)
 *   - `e` reply marker -- NIP-10 parent link when present
 *
 * Signing runs through a NostrSigner: either a locally stored secret key or a
 * NIP-07 browser extension. The plugin then verifies the signature, re-asserts
 * the near_target tag, and publishes via the relay transport.
 */
export async function signCommentEvent(opts: SignCommentEventOptions): Promise<SignedNostrEvent> {
  const tags: string[][] = [
    ["t", opts.target.type],
    ["t", CLIENT_NAME],
    ["client", CLIENT_NAME],
    ["near_target", nearTargetKey(opts.target.type, opts.target.id)],
    ["near_account", opts.nearAccountId],
  ];
  if (opts.parentEventId) {
    tags.push(["e", opts.parentEventId, "", "reply"]);
  }

  const template: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: opts.content,
  };
  return signWithSigner(opts.signer, template);
}
