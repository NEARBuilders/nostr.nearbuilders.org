export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export type UnsignedNostrEvent = Omit<NostrEvent, "id" | "sig">;

export type NostrFilter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  "#e"?: string[];
  "#p"?: string[];
  "#a"?: string[];
  "#d"?: string[];
  "#t"?: string[];
  "#r"?: string[];
  [key: `#${string}`]: string[] | undefined;
};

export type RelayMessage =
  | ["EVENT", string, NostrEvent]
  | ["OK", string, boolean, string]
  | ["EOSE", string]
  | ["NOTICE", string];

export const Kind = {
  METADATA: 0,
  TEXT_NOTE: 1,
  RELAY_LIST: 2,
  CONTACT_LIST: 3,
  DELETION: 5,
  REACTION: 7,
  CHANNEL_CREATE: 40,
  CHANNEL_META: 41,
  CHANNEL_MSG: 42,
} as const;

export type ConnectionResult = {
  ok: boolean;
  relay: string;
  message?: string;
};
