import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, verifyEvent } from "nostr-tools/pure";
import type { NostrProfile } from "../../lib/schemas";
import type { NostrSubscription } from "../core";
import type { NostrEvent, NostrFilter } from "../types";
import type {
  AdapterPublishResult,
  PublishAdapterOptions,
  QueryAdapterOptions,
  RelayAdapter,
  SubscribeAdapterOptions,
} from "./types";

/** Comment kinds: NIP-22 dedicated comment kind + legacy kind 1 */
const COMMENT_KINDS = [1111, 1] as const;
const PUBLISH_KIND = 1111;

export class StandardAdapter implements RelayAdapter {
  readonly type = "standard" as const;
  readonly pool: SimplePool;

  constructor(
    public relays: string[] = ["wss://nos.lol", "wss://relay.damus.io", "wss://relay.primal.net"],
  ) {
    this.pool = new SimplePool();
  }

  async publish(opts: PublishAdapterOptions): Promise<AdapterPublishResult> {
    const tags = this.#buildTags(opts);
    const event = finalizeEvent(
      {
        kind: PUBLISH_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: opts.content,
      },
      opts.secretKey,
    );

    const relays = opts.relays ?? this.relays;
    const results = this.pool.publish(relays, event);
    const statuses = new Map<string, boolean>();
    await Promise.allSettled(
      results.map(async (p, i) => {
        try {
          await p;
          statuses.set(relays[i]!, true);
        } catch {
          statuses.set(relays[i]!, false);
        }
      }),
    );

    return { event, statuses };
  }

  async publishSigned(event: NostrEvent, relays?: string[]): Promise<AdapterPublishResult> {
    if (!verifyEvent(event)) {
      throw new Error("Invalid Nostr event signature");
    }
    const relayList = relays ?? this.relays;
    const results = this.pool.publish(relayList, event);
    const statuses = new Map<string, boolean>();
    await Promise.allSettled(
      results.map(async (p, i) => {
        try {
          await p;
          statuses.set(relayList[i]!, true);
        } catch {
          statuses.set(relayList[i]!, false);
        }
      }),
    );
    return { event, statuses };
  }

  async query(opts: QueryAdapterOptions): Promise<{ events: NostrEvent[] }> {
    const relays = opts.relays ?? this.relays;
    const filter: NostrFilter = {
      kinds: [...COMMENT_KINDS],
      "#t": [opts.targetType, opts.clientName],
      limit: opts.limit ?? 100,
    };
    if (opts.until) filter.until = opts.until;
    if (opts.since) filter.since = opts.since;

    const events = await this.pool.querySync(relays, filter);
    const filtered = events.filter((e: NostrEvent) =>
      e.tags.some((t: string[]) => t[0] === "near_target" && t[1] === opts.target),
    );
    return { events: filtered };
  }

  subscribe(opts: SubscribeAdapterOptions): NostrSubscription {
    const relays = opts.relays ?? this.relays;
    let closed = false;
    let eventCb: ((event: NostrEvent) => void) | null = null;
    let eoseCb: (() => void) | null = null;

    const closer = this.pool.subscribeMany(
      relays,
      { kinds: [...COMMENT_KINDS], "#t": [opts.targetType], limit: 100 },
      {
        onevent: (event: NostrEvent) => {
          if (closed || !eventCb) return;
          const hasTarget = event.tags.some(
            (t: string[]) => t[0] === "near_target" && t[1] === opts.target,
          );
          if (hasTarget) eventCb(event);
        },
        oneose: () => {
          if (closed || !eoseCb) return;
          eoseCb();
        },
      },
    );

    return {
      on: (type: string, handler: any) => {
        if (type === "event") eventCb = handler;
        if (type === "eose") eoseCb = handler;
        return {} as NostrSubscription;
      },
      close: () => {
        closed = true;
        closer.close();
      },
    };
  }

  close(): void {
    this.pool.close(this.relays);
  }

  async queryRaw(filter: NostrFilter, relays?: string[]): Promise<NostrEvent[]> {
    const relayList = relays ?? this.relays;
    return this.pool.querySync(relayList, filter);
  }

  async getProfile(pubkey: string): Promise<NostrProfile | null> {
    try {
      const events = await this.pool.querySync(this.relays, {
        kinds: [0],
        authors: [pubkey],
        limit: 1,
      });
      if (events.length === 0) return null;
      const content = events[0]!.content;
      const parsed = JSON.parse(content);
      return { pubkey, ...parsed };
    } catch {
      return null;
    }
  }

  #buildTags(opts: PublishAdapterOptions): string[][] {
    const tags: string[][] = [];
    tags.push(["t", opts.targetType]);
    tags.push(["t", opts.clientName]);
    tags.push(["p", opts.pubkey]);
    if (opts.nearAccountId) {
      tags.push(["p", `_near:${opts.nearAccountId}`]);
    }
    if (opts.parentEventId) {
      tags.push(["e", opts.parentEventId, "", "reply"]);
    }
    if (opts.targetUrl) {
      tags.push(["r", opts.targetUrl]);
    }
    tags.push(["client", opts.clientName]);
    tags.push(["near_target", opts.target]);
    if (opts.nearAccountId) {
      tags.push(["near_account", opts.nearAccountId]);
    }
    if (opts.extraTags) {
      tags.push(...opts.extraTags);
    }
    return tags;
  }
}
