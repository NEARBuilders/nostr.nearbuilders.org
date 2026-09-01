import { SimplePool } from "nostr-tools/pool";
import { generateSecretKey, getPublicKey, verifyEvent } from "nostr-tools/pure";
import type { NostrEvent, NostrFilter } from "./types";

export type NostrCoreConfig = {
  relays: string[];
};

export type PublishOptions = {
  event: NostrEvent;
  relays?: string[];
  timeoutMs?: number;
};

export type QueryOptions = {
  filters: NostrFilter | NostrFilter[];
  relays?: string[];
  timeoutMs?: number;
};

export type SubscribeOptions = {
  filters: NostrFilter | NostrFilter[];
  relays?: string[];
};

export class NostrCore {
  #relays: string[];
  readonly pool: SimplePool;

  constructor(config: NostrCoreConfig) {
    this.#relays = config.relays;
    this.pool = new SimplePool();
  }

  close(): void {
    this.pool.close(this.#relays);
  }

  get relays(): string[] {
    return this.#relays;
  }

  static generateKeys(): { secretKey: Uint8Array; publicKey: string } {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    return { secretKey: sk, publicKey: pk };
  }

  async publishEvent(opts: PublishOptions): Promise<Map<string, boolean>> {
    if (!verifyEvent(opts.event)) {
      throw new Error("Invalid Nostr event signature");
    }
    const relays = opts.relays ?? this.#relays;
    const results = this.pool.publish(relays, opts.event);
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
    return statuses;
  }

  async queryEvents(opts: QueryOptions): Promise<NostrEvent[]> {
    const relays = opts.relays ?? this.#relays;
    const filter = Array.isArray(opts.filters) ? opts.filters[0]! : opts.filters;
    const events = await this.pool.querySync(relays, filter);
    return events;
  }

  subscribe(opts: SubscribeOptions): NostrSubscription {
    const relays = opts.relays ?? this.#relays;
    const filter = Array.isArray(opts.filters) ? opts.filters[0]! : opts.filters;
    let closed = false;

    const closer = this.pool.subscribeMany(relays, filter, {
      onevent: (event: NostrEvent) => {
        if (!closed && eventCb) eventCb(event);
      },
      oneose: () => {
        if (!closed && eoseCb) eoseCb();
      },
    });

    let eventCb: ((event: NostrEvent) => void) | null = null;
    let eoseCb: (() => void) | null = null;

    return {
      on<K extends "event" | "eose">(
        type: K,
        handler: K extends "event" ? (event: NostrEvent) => void : () => void,
      ): NostrSubscription {
        if (type === "event") eventCb = handler as any;
        if (type === "eose") eoseCb = handler as any;
        return this;
      },
      close: () => {
        closed = true;
        closer.close();
      },
    };
  }
}

export interface NostrSubscription {
  on<K extends "event" | "eose">(
    type: K,
    handler: K extends "event" ? (event: NostrEvent) => void : () => void,
  ): NostrSubscription;
  close(): void;
}
