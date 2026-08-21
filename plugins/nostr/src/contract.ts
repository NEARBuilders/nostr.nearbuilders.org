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

  deleteBinding: oc
    .route({
      method: "DELETE",
      path: "/nostr/bindings",
      summary: "Remove the authenticated NEAR account's Nostr binding",
      tags: ["Identity"],
    })
    .output(z.object({ success: z.literal(true) }))
    .errors(Errors),

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
});

export type ContractType = typeof contract;
