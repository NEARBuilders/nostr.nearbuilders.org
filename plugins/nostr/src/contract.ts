import { BAD_REQUEST, UNAUTHORIZED } from "every-plugin/errors";
import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

const Errors = {
  UNAUTHORIZED: { status: 401, message: "Authentication required" },
  NOT_FOUND: { status: 404, message: "Resource not found" },
  BAD_REQUEST: { status: 400, message: "Bad request" },
};

// ── V1 parity schemas (from nearbuilders.org nostr-bindings / nostr-comments) ──

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
        hasBinding: z.boolean().describe("Whether a KV binding exists"),
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

  // ── V1 parity routes (mirror nearbuilders.org nostr-bindings + nostr-comments) ──

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
