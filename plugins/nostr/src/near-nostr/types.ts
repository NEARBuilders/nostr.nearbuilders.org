export type NearNostrTargetType = "builder" | "project" | "scope" | "submission" | "page";

export type NearNostrTarget = {
  type: NearNostrTargetType;
  id: string;
  url?: string;
};

export type NearNostrBinding = {
  nearAccountId: string;
  nostrPubkey: string;
  relay?: string;
  proof?: string;
  boundAt?: number;
};

export type NearNostrIdentity = {
  nearAccountId: string;
  nostrPubkey: string;
  profile?: {
    name?: string;
    picture?: string;
    about?: string;
    nip05?: string;
    website?: string;
  };
  relay?: string;
};

export type NearNostrComment = {
  eventId: string;
  pubkey: string;
  nearAccountId?: string;
  content: string;
  createdAt: number;
  parentId?: string;
  target: NearNostrTarget;
  profile?: {
    name?: string;
    picture?: string;
  };
};

export type NearNostrConfig = {
  relays: string[];
  kvApiUrl?: string;
  nearRpc?: string;
  bindingContract?: string;
  clientName?: string;
};
