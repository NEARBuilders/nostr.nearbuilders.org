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

export type NearNostrTargetType = "builder" | "project" | "scope" | "submission" | "page";

export type NearNostrTarget = {
  type: NearNostrTargetType;
  id: string;
  url?: string;
};

export type NearNostrComment = {
  eventId: string;
  pubkey: string;
  nearAccountId?: string;
  content: string;
  createdAt: number;
  parentId?: string;
  rootId?: string;
  target: NearNostrTarget;
  profile?: {
    name?: string;
    picture?: string;
  };
};

export const Kind = {
  METADATA: 0,
  TEXT_NOTE: 1,
  COMMENT: 1111,
} as const;

export const COMMENT_KINDS = [Kind.COMMENT, Kind.TEXT_NOTE] as const;

export const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];

export const parseTargetString = (
  raw: string,
  fallbackType: NearNostrTargetType = "project",
): NearNostrTarget | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf(":");
  if (idx === -1) return { type: fallbackType, id: trimmed };
  const type = trimmed.slice(0, idx);
  const id = trimmed.slice(idx + 1);
  if (!type || !id) return null;
  return { type: type as NearNostrTargetType, id };
};

export const formatTargetString = (target: NearNostrTarget): string =>
  `${target.type}:${target.id}`;
