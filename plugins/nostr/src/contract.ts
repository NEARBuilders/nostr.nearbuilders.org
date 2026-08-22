import { BAD_REQUEST, UNAUTHORIZED } from "every-plugin/errors";
import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

const Errors = {
  UNAUTHORIZED: { status: 401, message: "Authentication required" },
  NOT_FOUND: { status: 404, message: "Resource not found" },
  BAD_REQUEST: { status: 400, message: "Bad request" },
};

export const NearNostrTargetSchema = z.object({
  type: z.enum(["builder", "project", "scope", "submission", "page"]),
  id: z.string().min(1),
  url: z.string().optional(),
});

export type NostrTargetInput = z.infer<typeof NearNostrTargetSchema>;

export const NostrEventSchema = z.object({
  id: z.string(),
  pubkey: z.string(),
  created_at: z.number(),
  kind: z.number(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string(),
});

export const NearNostrCommentSchema = z.object({
  eventId: z.string(),
  pubkey: z.string(),
  nearAccountId: z.string().optional(),
  content: z.string(),
  createdAt: z.number(),
  parentId: z.string().optional(),
  target: NearNostrTargetSchema,
  profile: z
    .object({
      name: z.string().optional(),
      picture: z.string().optional(),
    })
    .optional(),
});

export const NearNostrIdentitySchema = z.object({
  nearAccountId: z.string(),
  nostrPubkey: z.string(),
  profile: z
    .object({
      name: z.string().optional(),
      picture: z.string().optional(),
      about: z.string().optional(),
      nip05: z.string().optional(),
      website: z.string().optional(),
    })
    .optional(),
  relay: z.string().optional(),
});

export const NostrProfileSchema = z.object({
  pubkey: z.string(),
  name: z.string().optional().nullable(),
  picture: z.string().optional().nullable(),
  about: z.string().optional().nullable(),
  nip05: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
});

export const NostrBindingSchema = z.object({
  nearAccountId: z.string(),
  nostrPubkey: z.string(),
  relay: z.string().optional(),
  proofEventId: z.string().optional(),
  boundAt: z.string().datetime().optional(),
});

// ── V1 parity schemas (ported verbatim from nearbuilders.org nostr-bindings / nostr-comments, PR #162) ──

const BindingOutput = z.object({
  npub: z.string(),
  relay: z.string(),
  proof: z.string(),
  boundAt: z.number().int(),
});

const IdentityOutput = z.object({
  nearAccountId: z.string(),
  nostrPubkey: z.string(),
  relay: z.string(),
  proof: z.string(),
  boundAt: z.number().int(),
  profile: z
    .object({
      name: z.string().optional().nullable(),
      picture: z.string().optional().nullable(),
      about: z.string().optional().nullable(),
      nip05: z.string().optional().nullable(),
      website: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

const NostrCommentOutput = z.object({
  id: z.string(),
  pubkey: z.string(),
  content: z.string(),
  target: z.string(),
  targetType: z.string(),
  nearAccountId: z.string().optional().nullable(),
  parentEventId: z.string().optional().nullable(),
  createdAt: z.number().int(),
  tags: z.array(z.array(z.string())).optional(),
  source: z.enum(["standard", "buzz"]),
  profile: z
    .object({
      name: z.string().optional().nullable(),
      picture: z.string().optional().nullable(),
      about: z.string().optional().nullable(),
      nip05: z.string().optional().nullable(),
      website: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

const RelayStatusOutput = z.object({
  relay: z.string(),
  success: z.boolean(),
});

const PublishResultOutput = z.object({
  eventId: z.string(),
  statuses: z.array(RelayStatusOutput),
});

export const contract = oc.router({
  getPublicKey: oc
    .route({
      method: "GET",
      path: "/nostr/keys",
      summary: "Get derived Nostr public key",
      description: "Returns the user's Nostr pubkey derived from their NEAR session.",
      tags: ["Keys"],
    })
    .output(
      z.object({
        pubkey: z.string().describe("Nostr public key (64-char hex)"),
        hasBinding: z.boolean().describe("Whether a DB binding record exists"),
      }),
    )
    .errors(Errors),

  listRelays: oc
    .route({
      method: "GET",
      path: "/nostr/relays",
      summary: "List configured relays",
      tags: ["Relays"],
    })
    .output(
      z.object({
        relays: z.array(z.string()),
      }),
    ),

  // DEPRECATED: superseded by GET /v1/nostr/profile/{pubkey} (getProfileV1), remove after UIs migrate
  getProfile: oc
    .route({
      method: "GET",
      path: "/nostr/profile/{pubkey}",
      summary: "Fetch Nostr kind 0 profile",
      tags: ["Profiles"],
    })
    .input(
      z.object({
        pubkey: z.string().describe("64-char hex Nostr public key"),
      }),
    )
    .output(NostrProfileSchema.nullable())
    .errors(Errors),

  // DEPRECATED: superseded by GET /v1/identity/{nearAccountId} (getIdentityV1), remove after UIs migrate
  getIdentity: oc
    .route({
      method: "GET",
      path: "/nostr/identity/{nearAccountId}",
      summary: "Resolve NEAR account to Nostr identity",
      tags: ["Identity"],
    })
    .input(
      z.object({
        nearAccountId: z.string().describe("NEAR account ID (e.g. example.near)"),
      }),
    )
    .output(NearNostrIdentitySchema.nullable())
    .errors(Errors),

  // DEPRECATED: superseded by POST /v1/comments (createComment, client-signed events), remove after UIs migrate
  publishComment: oc
    .route({
      method: "POST",
      path: "/nostr/comments",
      summary: "Publish a Nostr comment",
      description: "Creates and publishes a signed kind 1 comment event to configured relays.",
      tags: ["Comments"],
    })
    .input(
      z.object({
        target: NearNostrTargetSchema,
        content: z.string().min(1).max(64000),
        parentEventId: z.string().optional(),
        relays: z.array(z.string()).optional(),
        adapterType: z.enum(["standard", "buzz"]).optional().default("standard"),
      }),
    )
    .output(
      z.object({
        event: NostrEventSchema,
        statuses: z.record(z.string(), z.boolean()),
      }),
    )
    .errors(Errors),

  // DEPRECATED: superseded by GET /v1/comments (listCommentsV1), remove after UIs migrate
  listComments: oc
    .route({
      method: "GET",
      path: "/nostr/comments",
      summary: "List comments for a target",
      tags: ["Comments"],
    })
    .input(
      z.object({
        target: NearNostrTargetSchema,
        limit: z.number().min(1).max(200).default(50),
        since: z.number().optional(),
        until: z.number().optional(),
        relays: z.array(z.string()).optional(),
        adapterType: z.enum(["standard", "buzz"]).optional().default("standard"),
        requireBound: z.boolean().optional().default(false),
      }),
    )
    .output(z.array(NearNostrCommentSchema))
    .errors(Errors),

  // DEPRECATED: superseded by the KV binding flow (POST /v1/binding/challenge → POST /v1/binding/verify → POST /v1/binding/prepare), remove after UIs migrate
  createBinding: oc
    .route({
      method: "POST",
      path: "/nostr/bindings",
      summary: "Create a NEAR ↔ Nostr binding",
      description:
        "Store a binding between the authenticated NEAR account and a Nostr pubkey in the database.",
      tags: ["Identity"],
    })
    .input(
      z.object({
        nostrPubkey: z.string(),
        relay: z.string().optional(),
      }),
    )
    .output(NostrBindingSchema)
    .errors(Errors),

  // DEPRECATED: DB-backed bindings are superseded by the FastNear KV flow; no KV unbind route yet, remove after UIs migrate
  deleteBinding: oc
    .route({
      method: "DELETE",
      path: "/nostr/bindings",
      summary: "Remove the authenticated NEAR account's Nostr binding",
      tags: ["Identity"],
    })
    .output(z.object({ success: z.literal(true) }))
    .errors(Errors),

  // DEPRECATED: superseded by GET /v1/binding/{nearAccountId} (getBindingV1, FastNear KV-backed), remove after UIs migrate
  getBinding: oc
    .route({
      method: "GET",
      path: "/nostr/bindings/{nearAccountId}",
      summary: "Get a NEAR ↔ Nostr binding",
      tags: ["Identity"],
    })
    .input(
      z.object({
        nearAccountId: z.string(),
      }),
    )
    .output(NostrBindingSchema.nullable())
    .errors(Errors),

  ping: oc
    .route({
      method: "GET",
      path: "/nostr/ping",
      summary: "Health check",
      tags: ["Health"],
    })
    .output(
      z.object({
        status: z.literal("ok"),
        timestamp: z.string().datetime(),
      }),
    ),

  // ── V1 parity routes (mirror nearbuilders.org nostr-bindings + nostr-comments, PR #162) ──
  // Paths and zod shapes are identical to the nearbuilders.org contracts.

  // From nostr-bindings: FastNear KV-backed bindings + challenge/verify
  getBindingV1: oc
    .route({ method: "GET", path: "/v1/binding/{nearAccountId}" })
    .input(z.object({ nearAccountId: z.string().min(1) }))
    .output(BindingOutput.nullable())
    .errors({ BAD_REQUEST }),

  getIdentityV1: oc
    .route({ method: "GET", path: "/v1/identity/{nearAccountId}" })
    .input(
      z.object({
        nearAccountId: z.string().min(1),
        enrichProfile: z.boolean().optional().default(true),
      }),
    )
    .output(IdentityOutput.nullable())
    .errors({ BAD_REQUEST }),

  createChallenge: oc
    .route({ method: "POST", path: "/v1/binding/challenge" })
    .input(z.object({}))
    .output(
      z.object({
        challenge: z.string(),
        expiresAt: z.number().int(),
      }),
    )
    .errors({ UNAUTHORIZED }),

  verifyBinding: oc
    .route({ method: "POST", path: "/v1/binding/verify" })
    .input(
      z.object({
        event: z.object({
          id: z.string(),
          pubkey: z.string(),
          content: z.string(),
          tags: z.array(z.array(z.string())),
          created_at: z.number().int(),
          sig: z.string(),
        }),
      }),
    )
    .output(
      z.object({
        valid: z.boolean(),
        nearAccountId: z.string(),
        nostrPubkey: z.string(),
        proof: z.string(),
      }),
    )
    .errors({ UNAUTHORIZED, BAD_REQUEST }),

  prepareBindingWrite: oc
    .route({ method: "POST", path: "/v1/binding/prepare" })
    .input(
      z.object({
        nostrPubkey: z.string(),
        relay: z.string(),
        proof: z.string(),
      }),
    )
    .output(
      z.object({
        contractId: z.string(),
        methodName: z.literal("__fastdata_kv"),
        key: z.string(),
        value: z.string(),
        args: z.record(z.string(), z.string()),
        gas: z.string(),
        attachedDeposit: z.string(),
      }),
    )
    .errors({ BAD_REQUEST }),

  // From nostr-comments: relay-adapter-backed comments + low-level relay access
  listCommentsV1: oc
    .route({ method: "GET", path: "/v1/comments" })
    .input(
      z.object({
        target: z.string().min(1),
        targetType: z.string().default("project"),
        adapterType: z.enum(["standard", "buzz"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        since: z.number().int().optional(),
        enrich: z.boolean().optional(),
        requireBound: z.boolean().optional(),
        requireVerified: z.boolean().optional(),
      }),
    )
    .output(
      z.object({
        data: z.array(NostrCommentOutput),
        meta: z.object({ count: z.number().int() }),
      }),
    )
    .errors({ BAD_REQUEST }),

  createComment: oc
    .route({ method: "POST", path: "/v1/comments" })
    .input(
      z.object({
        event: z.object({
          id: z.string(),
          pubkey: z.string(),
          kind: z.number().int().default(1111),
          content: z.string(),
          tags: z.array(z.array(z.string())),
          created_at: z.number().int(),
          sig: z.string(),
        }),
        target: z.string().min(1),
        targetType: z.string().default("project"),
        adapterType: z.enum(["standard", "buzz"]).optional(),
      }),
    )
    .output(PublishResultOutput)
    .errors({ BAD_REQUEST }),

  listChannels: oc.route({ method: "GET", path: "/v1/buzz/channels" }).output(
    z.object({
      data: z.array(
        z.object({
          id: z.string(),
          name: z.string().optional().nullable(),
          members: z.number().int().optional().nullable(),
        }),
      ),
    }),
  ),

  queryEvents: oc
    .route({ method: "POST", path: "/v1/nostr/query" })
    .input(
      z.object({
        filter: z.object({
          kinds: z.array(z.number().int()).optional(),
          authors: z.array(z.string()).optional(),
          ids: z.array(z.string()).optional(),
          since: z.number().int().optional(),
          until: z.number().int().optional(),
          limit: z.number().int().min(1).max(500).optional(),
          tags: z.array(z.object({ tag: z.string(), values: z.array(z.string()) })).optional(),
        }),
        relays: z.array(z.string()).optional(),
      }),
    )
    .output(
      z.object({
        events: z.array(
          z.object({
            id: z.string(),
            pubkey: z.string(),
            created_at: z.number().int(),
            kind: z.number().int(),
            tags: z.array(z.array(z.string())),
            content: z.string(),
            sig: z.string(),
          }),
        ),
      }),
    )
    .errors({ BAD_REQUEST }),

  publishEvent: oc
    .route({ method: "POST", path: "/v1/nostr/publish" })
    .input(
      z.object({
        event: z.object({
          id: z.string(),
          pubkey: z.string(),
          created_at: z.number().int(),
          kind: z.number().int(),
          tags: z.array(z.array(z.string())),
          content: z.string(),
          sig: z.string(),
        }),
        relays: z.array(z.string()).optional(),
      }),
    )
    .output(PublishResultOutput)
    .errors({ BAD_REQUEST }),

  getProfileV1: oc
    .route({ method: "GET", path: "/v1/nostr/profile/{pubkey}" })
    .input(z.object({ pubkey: z.string().min(1) }))
    .output(
      z
        .object({
          pubkey: z.string(),
          name: z.string().optional().nullable(),
          picture: z.string().optional().nullable(),
          about: z.string().optional().nullable(),
          nip05: z.string().optional().nullable(),
          website: z.string().optional().nullable(),
        })
        .nullable(),
    )
    .errors({ BAD_REQUEST }),
});

export type ContractType = typeof contract;
