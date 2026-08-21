import { getPublicKey, verifyEvent } from "nostr-tools/pure";
import type { RelayAdapter } from "../nostr-core/adapters/types";
import type { NostrCore, NostrSubscription } from "../nostr-core/core";
import type { NostrEvent } from "../nostr-core/types";
import type {
  NearNostrBinding,
  NearNostrComment,
  NearNostrConfig,
  NearNostrIdentity,
  NearNostrTarget,
} from "./types";

export class NearNostr {
  readonly core: NostrCore;
  readonly config: NearNostrConfig;
  readonly adapters: Map<string, RelayAdapter>;

  constructor(opts: {
    core: NostrCore;
    adapter?: RelayAdapter;
    config: NearNostrConfig;
  }) {
    this.core = opts.core;
    this.adapters = new Map();
    if (opts.adapter) {
      this.adapters.set(opts.adapter.type, opts.adapter);
    }
    this.config = opts.config;
  }

  useAdapter(adapter: RelayAdapter): this {
    this.adapters.set(adapter.type, adapter);
    return this;
  }

  getAdapter(type?: "standard" | "buzz"): RelayAdapter {
    if (type && this.adapters.has(type)) {
      return this.adapters.get(type)!;
    }
    if (this.adapters.size > 0) {
      return this.adapters.values().next().value!;
    }
    throw new Error("No adapter registered. Call .useAdapter() first.");
  }

  createBindingChallenge(nearAccountId: string): { challenge: string; expiresAt: number } {
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const challenge = `bind:${nearAccountId}:${expiresAt}:${this.config.clientName}`;
    return { challenge, expiresAt };
  }

  verifyBindingEvent(event: {
    id: string;
    pubkey: string;
    content: string;
    tags: string[][];
    created_at: number;
    sig: string;
  }): { nearAccountId: string; expiresAt: number; clientName: string; nostrPubkey: string } {
    if (!verifyEvent(event as any)) {
      throw new Error("Invalid Nostr event signature");
    }

    const challengeTag = event.tags.find((t) => t[0] === "challenge");
    const challenge = challengeTag?.[1] ?? event.content;
    if (!challenge?.startsWith("bind:")) {
      throw new Error("No binding challenge found in event");
    }

    const parts = challenge.split(":");
    if (parts.length !== 4 || parts[0] !== "bind") {
      throw new Error("Malformed binding challenge");
    }

    const expiresAt = parseInt(parts[2]!, 10);
    if (Math.floor(Date.now() / 1000) > expiresAt) {
      throw new Error("Binding challenge expired");
    }

    return {
      nearAccountId: parts[1]!,
      expiresAt,
      clientName: parts[3]!,
      nostrPubkey: event.pubkey,
    };
  }

  buildBindingEventTemplate(opts: { nostrPubkey: string; challenge: string }): {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  } {
    return {
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["challenge", opts.challenge],
        ["client", this.config.clientName],
      ],
      content: opts.challenge,
    };
  }

  async getIdentity(nearAccountId: string): Promise<NearNostrIdentity | null> {
    const binding = await this.#fetchBinding(nearAccountId);
    if (!binding) return null;

    const profile = await this.#fetchProfile(binding.nostrPubkey);

    return {
      nearAccountId,
      nostrPubkey: binding.nostrPubkey,
      profile,
      relay: binding.relay,
    };
  }

  async createComment(opts: {
    target: NearNostrTarget;
    content: string;
    nearAccountId: string;
    nostrSecretKey: Uint8Array;
    parentEventId?: string;
    relays?: string[];
    adapterType?: "standard" | "buzz";
  }): Promise<{ event: NostrEvent; statuses: Map<string, boolean> }> {
    const adapter = this.getAdapter(opts.adapterType);
    const targetKey = `${opts.target.type}:${opts.target.id}`;
    const pubkey = getPublicKey(opts.nostrSecretKey);

    const result = await adapter.publish({
      content: opts.content,
      target: targetKey,
      targetType: opts.target.type,
      clientName: this.config.clientName,
      pubkey,
      secretKey: opts.nostrSecretKey,
      parentEventId: opts.parentEventId,
      nearAccountId: opts.nearAccountId,
      targetUrl: opts.target.url,
      relays: opts.relays,
    });

    return { event: result.event, statuses: result.statuses };
  }

  async listComments(opts: {
    target: NearNostrTarget;
    limit?: number;
    until?: number;
    since?: number;
    relays?: string[];
    adapterType?: "standard" | "buzz";
    requireBound?: boolean;
    requireVerified?: boolean;
  }): Promise<NearNostrComment[]> {
    const adapter = this.getAdapter(opts.adapterType);
    const targetKey = `${opts.target.type}:${opts.target.id}`;

    const fetchLimit =
      opts.requireBound || opts.requireVerified ? (opts.limit ?? 50) * 3 : opts.limit;

    const { events } = await adapter.query({
      target: targetKey,
      targetType: opts.target.type,
      clientName: this.config.clientName,
      limit: fetchLimit,
      until: opts.until,
      since: opts.since,
      relays: opts.relays,
    });

    let comments: NearNostrComment[] = [];
    for (const event of events) {
      const parentTag = event.tags.find((t) => t[0] === "e" && t[3] === "reply");
      const nearAccount = event.tags.find((t) => t[0] === "near_account")?.[1];

      if (opts.requireBound && !nearAccount) continue;

      comments.push({
        eventId: event.id,
        pubkey: event.pubkey,
        nearAccountId: nearAccount,
        content: event.content,
        createdAt: event.created_at,
        parentId: parentTag?.[1],
        target: opts.target,
      });
    }

    if (opts.requireVerified) {
      const accounts = [
        ...new Set(comments.filter((c) => c.nearAccountId).map((c) => c.nearAccountId!)),
      ];
      const BATCH = 5;
      const verified = new Set<string>();
      for (let i = 0; i < accounts.length; i += BATCH) {
        const batch = accounts.slice(i, i + BATCH);
        const results = await Promise.allSettled(batch.map((acc) => this.#fetchBinding(acc)));
        results.forEach((r, idx) => {
          if (r.status === "fulfilled" && r.value) {
            verified.add(batch[idx]!);
          }
        });
      }
      comments = comments.filter((c) => c.nearAccountId && verified.has(c.nearAccountId));
    }

    comments.sort((a, b) => b.createdAt - a.createdAt);
    return comments.slice(0, opts.limit);
  }

  async enrichComments(
    comments: NearNostrComment[],
  ): Promise<(NearNostrComment & { profile?: NearNostrIdentity["profile"] })[]> {
    const uniquePubkeys = [...new Set(comments.map((c) => c.pubkey))];
    const profileMap = new Map<string, NearNostrIdentity["profile"]>();

    const BATCH = 5;
    for (let i = 0; i < uniquePubkeys.length; i += BATCH) {
      const batch = uniquePubkeys.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map((pk) => this.#fetchProfile(pk)));
      results.forEach((r, idx) => {
        if (r.status === "fulfilled" && r.value) {
          profileMap.set(batch[idx]!, r.value);
        }
      });
    }

    return comments.map((c) => ({
      ...c,
      profile: profileMap.get(c.pubkey),
    }));
  }

  subscribeComments(opts: {
    target: NearNostrTarget;
    relays?: string[];
    adapterType?: "standard" | "buzz";
  }): NostrSubscription {
    const adapter = this.getAdapter(opts.adapterType);
    const targetKey = `${opts.target.type}:${opts.target.id}`;

    return adapter.subscribe({
      target: targetKey,
      targetType: opts.target.type,
      clientName: this.config.clientName,
      relays: opts.relays,
    });
  }

  async #fetchBinding(nearAccountId: string): Promise<NearNostrBinding | null> {
    try {
      const res = await fetch(
        `${this.config.kvApiUrl}/v0/latest/${this.config.bindingContract}/${nearAccountId}/nostr/${nearAccountId}`,
      );
      if (!res.ok || res.status === 404) return null;
      const data: any = await res.json();
      const entry = data?.entries?.[0];
      if (!entry?.value) return null;
      const parsed = typeof entry.value === "string" ? JSON.parse(entry.value) : entry.value;
      return {
        nearAccountId,
        nostrPubkey: parsed.npub ?? parsed.value?.npub,
        relay: parsed.relay ?? parsed.value?.relay,
        proof: parsed.proof ?? parsed.value?.proof,
        boundAt: parsed.bound_at ?? parsed.value?.bound_at,
      };
    } catch {
      return null;
    }
  }

  async #fetchProfile(pubkey: string): Promise<NearNostrIdentity["profile"]> {
    try {
      const events = await this.core.queryEvents({
        filters: { kinds: [0], authors: [pubkey], limit: 1 },
      });
      if (events.length === 0) return undefined;
      return JSON.parse(events[0]!.content);
    } catch {
      return undefined;
    }
  }
}
