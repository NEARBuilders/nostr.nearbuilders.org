import { z } from "every-plugin/zod";
export declare const NearNostrTargetSchema: z.ZodObject<{
    type: z.ZodEnum<{
        builder: "builder";
        project: "project";
        scope: "scope";
        submission: "submission";
        page: "page";
    }>;
    id: z.ZodString;
    url: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type NostrTargetInput = z.infer<typeof NearNostrTargetSchema>;
export declare const NostrEventSchema: z.ZodObject<{
    id: z.ZodString;
    pubkey: z.ZodString;
    created_at: z.ZodNumber;
    kind: z.ZodNumber;
    tags: z.ZodArray<z.ZodArray<z.ZodString>>;
    content: z.ZodString;
    sig: z.ZodString;
}, z.core.$strip>;
export declare const NearNostrCommentSchema: z.ZodObject<{
    eventId: z.ZodString;
    pubkey: z.ZodString;
    nearAccountId: z.ZodOptional<z.ZodString>;
    content: z.ZodString;
    createdAt: z.ZodNumber;
    parentId: z.ZodOptional<z.ZodString>;
    target: z.ZodObject<{
        type: z.ZodEnum<{
            builder: "builder";
            project: "project";
            scope: "scope";
            submission: "submission";
            page: "page";
        }>;
        id: z.ZodString;
        url: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    profile: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        picture: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const NearNostrIdentitySchema: z.ZodObject<{
    nearAccountId: z.ZodString;
    nostrPubkey: z.ZodString;
    profile: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        picture: z.ZodOptional<z.ZodString>;
        about: z.ZodOptional<z.ZodString>;
        nip05: z.ZodOptional<z.ZodString>;
        website: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    relay: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const NostrProfileSchema: z.ZodObject<{
    pubkey: z.ZodString;
    name: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    picture: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    about: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    nip05: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    website: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export declare const NostrBindingSchema: z.ZodObject<{
    nearAccountId: z.ZodString;
    nostrPubkey: z.ZodString;
    relay: z.ZodOptional<z.ZodString>;
    proofEventId: z.ZodOptional<z.ZodString>;
    boundAt: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const contract: {
    getPublicKey: import("@orpc/contract").ContractProcedure<import("@orpc/contract").Schema<unknown, unknown>, z.ZodObject<{
        pubkey: z.ZodString;
        hasBinding: z.ZodBoolean;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        UNAUTHORIZED: {
            status: number;
            message: string;
        };
        NOT_FOUND: {
            status: number;
            message: string;
        };
        BAD_REQUEST: {
            status: number;
            message: string;
        };
    }>>, Record<never, never>>;
    listRelays: import("@orpc/contract").ContractProcedure<import("@orpc/contract").Schema<unknown, unknown>, z.ZodObject<{
        relays: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, Record<never, never>>, Record<never, never>>;
    getProfile: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        pubkey: z.ZodString;
    }, z.core.$strip>, z.ZodNullable<z.ZodObject<{
        pubkey: z.ZodString;
        name: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        picture: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        about: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        nip05: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        website: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, z.core.$strip>>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        UNAUTHORIZED: {
            status: number;
            message: string;
        };
        NOT_FOUND: {
            status: number;
            message: string;
        };
        BAD_REQUEST: {
            status: number;
            message: string;
        };
    }>>, Record<never, never>>;
    getIdentity: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        nearAccountId: z.ZodString;
    }, z.core.$strip>, z.ZodNullable<z.ZodObject<{
        nearAccountId: z.ZodString;
        nostrPubkey: z.ZodString;
        profile: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            picture: z.ZodOptional<z.ZodString>;
            about: z.ZodOptional<z.ZodString>;
            nip05: z.ZodOptional<z.ZodString>;
            website: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        relay: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        UNAUTHORIZED: {
            status: number;
            message: string;
        };
        NOT_FOUND: {
            status: number;
            message: string;
        };
        BAD_REQUEST: {
            status: number;
            message: string;
        };
    }>>, Record<never, never>>;
    publishComment: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        target: z.ZodObject<{
            type: z.ZodEnum<{
                builder: "builder";
                project: "project";
                scope: "scope";
                submission: "submission";
                page: "page";
            }>;
            id: z.ZodString;
            url: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        content: z.ZodString;
        parentEventId: z.ZodOptional<z.ZodString>;
        relays: z.ZodOptional<z.ZodArray<z.ZodString>>;
        adapterType: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
            standard: "standard";
            buzz: "buzz";
        }>>>;
    }, z.core.$strip>, z.ZodObject<{
        event: z.ZodObject<{
            id: z.ZodString;
            pubkey: z.ZodString;
            created_at: z.ZodNumber;
            kind: z.ZodNumber;
            tags: z.ZodArray<z.ZodArray<z.ZodString>>;
            content: z.ZodString;
            sig: z.ZodString;
        }, z.core.$strip>;
        statuses: z.ZodRecord<z.ZodString, z.ZodBoolean>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        UNAUTHORIZED: {
            status: number;
            message: string;
        };
        NOT_FOUND: {
            status: number;
            message: string;
        };
        BAD_REQUEST: {
            status: number;
            message: string;
        };
    }>>, Record<never, never>>;
    listComments: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        target: z.ZodObject<{
            type: z.ZodEnum<{
                builder: "builder";
                project: "project";
                scope: "scope";
                submission: "submission";
                page: "page";
            }>;
            id: z.ZodString;
            url: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        limit: z.ZodDefault<z.ZodNumber>;
        since: z.ZodOptional<z.ZodNumber>;
        until: z.ZodOptional<z.ZodNumber>;
        relays: z.ZodOptional<z.ZodArray<z.ZodString>>;
        adapterType: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
            standard: "standard";
            buzz: "buzz";
        }>>>;
        requireBound: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    }, z.core.$strip>, z.ZodArray<z.ZodObject<{
        eventId: z.ZodString;
        pubkey: z.ZodString;
        nearAccountId: z.ZodOptional<z.ZodString>;
        content: z.ZodString;
        createdAt: z.ZodNumber;
        parentId: z.ZodOptional<z.ZodString>;
        target: z.ZodObject<{
            type: z.ZodEnum<{
                builder: "builder";
                project: "project";
                scope: "scope";
                submission: "submission";
                page: "page";
            }>;
            id: z.ZodString;
            url: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        profile: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            picture: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        UNAUTHORIZED: {
            status: number;
            message: string;
        };
        NOT_FOUND: {
            status: number;
            message: string;
        };
        BAD_REQUEST: {
            status: number;
            message: string;
        };
    }>>, Record<never, never>>;
    createBinding: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        nostrPubkey: z.ZodString;
        relay: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        nearAccountId: z.ZodString;
        nostrPubkey: z.ZodString;
        relay: z.ZodOptional<z.ZodString>;
        proofEventId: z.ZodOptional<z.ZodString>;
        boundAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        UNAUTHORIZED: {
            status: number;
            message: string;
        };
        NOT_FOUND: {
            status: number;
            message: string;
        };
        BAD_REQUEST: {
            status: number;
            message: string;
        };
    }>>, Record<never, never>>;
    deleteBinding: import("@orpc/contract").ContractProcedure<import("@orpc/contract").Schema<unknown, unknown>, z.ZodObject<{
        success: z.ZodLiteral<true>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        UNAUTHORIZED: {
            status: number;
            message: string;
        };
        NOT_FOUND: {
            status: number;
            message: string;
        };
        BAD_REQUEST: {
            status: number;
            message: string;
        };
    }>>, Record<never, never>>;
    getBinding: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        nearAccountId: z.ZodString;
    }, z.core.$strip>, z.ZodNullable<z.ZodObject<{
        nearAccountId: z.ZodString;
        nostrPubkey: z.ZodString;
        relay: z.ZodOptional<z.ZodString>;
        proofEventId: z.ZodOptional<z.ZodString>;
        boundAt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        UNAUTHORIZED: {
            status: number;
            message: string;
        };
        NOT_FOUND: {
            status: number;
            message: string;
        };
        BAD_REQUEST: {
            status: number;
            message: string;
        };
    }>>, Record<never, never>>;
    ping: import("@orpc/contract").ContractProcedure<import("@orpc/contract").Schema<unknown, unknown>, z.ZodObject<{
        status: z.ZodLiteral<"ok">;
        timestamp: z.ZodString;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, Record<never, never>>, Record<never, never>>;
    getBindingV1: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        nearAccountId: z.ZodString;
    }, z.core.$strip>, z.ZodNullable<z.ZodObject<{
        npub: z.ZodString;
        relay: z.ZodString;
        proof: z.ZodString;
        boundAt: z.ZodNumber;
    }, z.core.$strip>>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>>, Record<never, never>>;
    getIdentityV1: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        nearAccountId: z.ZodString;
        enrichProfile: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    }, z.core.$strip>, z.ZodNullable<z.ZodObject<{
        nearAccountId: z.ZodString;
        nostrPubkey: z.ZodString;
        relay: z.ZodString;
        proof: z.ZodString;
        boundAt: z.ZodNumber;
        profile: z.ZodNullable<z.ZodOptional<z.ZodObject<{
            name: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            picture: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            about: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            nip05: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            website: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>>, Record<never, never>>;
    createChallenge: import("@orpc/contract").ContractProcedure<z.ZodObject<{}, z.core.$strip>, z.ZodObject<{
        challenge: z.ZodString;
        expiresAt: z.ZodNumber;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
    }>>, Record<never, never>>;
    verifyBinding: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        event: z.ZodObject<{
            id: z.ZodString;
            pubkey: z.ZodString;
            content: z.ZodString;
            tags: z.ZodArray<z.ZodArray<z.ZodString>>;
            created_at: z.ZodNumber;
            sig: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        valid: z.ZodBoolean;
        nearAccountId: z.ZodString;
        nostrPubkey: z.ZodString;
        proof: z.ZodString;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        UNAUTHORIZED: {
            readonly status: 401;
            readonly data: z.ZodObject<{
                apiKeyProvided: z.ZodBoolean;
                provider: z.ZodOptional<z.ZodString>;
                authType: z.ZodOptional<z.ZodEnum<{
                    apiKey: "apiKey";
                    oauth: "oauth";
                    token: "token";
                }>>;
            }, z.core.$strip>;
        };
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>>, Record<never, never>>;
    prepareBindingWrite: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        nostrPubkey: z.ZodString;
        relay: z.ZodString;
        proof: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        contractId: z.ZodString;
        methodName: z.ZodLiteral<"__fastdata_kv">;
        key: z.ZodString;
        value: z.ZodString;
        args: z.ZodRecord<z.ZodString, z.ZodString>;
        gas: z.ZodString;
        attachedDeposit: z.ZodString;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>>, Record<never, never>>;
    listCommentsV1: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        target: z.ZodString;
        targetType: z.ZodDefault<z.ZodString>;
        adapterType: z.ZodOptional<z.ZodEnum<{
            standard: "standard";
            buzz: "buzz";
        }>>;
        limit: z.ZodOptional<z.ZodNumber>;
        since: z.ZodOptional<z.ZodNumber>;
        enrich: z.ZodOptional<z.ZodBoolean>;
        requireBound: z.ZodOptional<z.ZodBoolean>;
        requireVerified: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>, z.ZodObject<{
        data: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            pubkey: z.ZodString;
            content: z.ZodString;
            target: z.ZodString;
            targetType: z.ZodString;
            nearAccountId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            parentEventId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            createdAt: z.ZodNumber;
            tags: z.ZodOptional<z.ZodArray<z.ZodArray<z.ZodString>>>;
            source: z.ZodEnum<{
                standard: "standard";
                buzz: "buzz";
            }>;
            profile: z.ZodNullable<z.ZodOptional<z.ZodObject<{
                name: z.ZodNullable<z.ZodOptional<z.ZodString>>;
                picture: z.ZodNullable<z.ZodOptional<z.ZodString>>;
                about: z.ZodNullable<z.ZodOptional<z.ZodString>>;
                nip05: z.ZodNullable<z.ZodOptional<z.ZodString>>;
                website: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            }, z.core.$strip>>>;
        }, z.core.$strip>>;
        meta: z.ZodObject<{
            count: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>>, Record<never, never>>;
    createComment: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        event: z.ZodObject<{
            id: z.ZodString;
            pubkey: z.ZodString;
            kind: z.ZodDefault<z.ZodNumber>;
            content: z.ZodString;
            tags: z.ZodArray<z.ZodArray<z.ZodString>>;
            created_at: z.ZodNumber;
            sig: z.ZodString;
        }, z.core.$strip>;
        target: z.ZodString;
        targetType: z.ZodDefault<z.ZodString>;
        adapterType: z.ZodOptional<z.ZodEnum<{
            standard: "standard";
            buzz: "buzz";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        eventId: z.ZodString;
        statuses: z.ZodArray<z.ZodObject<{
            relay: z.ZodString;
            success: z.ZodBoolean;
        }, z.core.$strip>>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>>, Record<never, never>>;
    listChannels: import("@orpc/contract").ContractProcedure<import("@orpc/contract").Schema<unknown, unknown>, z.ZodObject<{
        data: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodNullable<z.ZodOptional<z.ZodString>>;
            members: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
        }, z.core.$strip>>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, Record<never, never>>, Record<never, never>>;
    queryEvents: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        filter: z.ZodObject<{
            kinds: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
            authors: z.ZodOptional<z.ZodArray<z.ZodString>>;
            ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
            since: z.ZodOptional<z.ZodNumber>;
            until: z.ZodOptional<z.ZodNumber>;
            limit: z.ZodOptional<z.ZodNumber>;
            tags: z.ZodOptional<z.ZodArray<z.ZodObject<{
                tag: z.ZodString;
                values: z.ZodArray<z.ZodString>;
            }, z.core.$strip>>>;
        }, z.core.$strip>;
        relays: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>, z.ZodObject<{
        events: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            pubkey: z.ZodString;
            created_at: z.ZodNumber;
            kind: z.ZodNumber;
            tags: z.ZodArray<z.ZodArray<z.ZodString>>;
            content: z.ZodString;
            sig: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>>, Record<never, never>>;
    publishEvent: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        event: z.ZodObject<{
            id: z.ZodString;
            pubkey: z.ZodString;
            created_at: z.ZodNumber;
            kind: z.ZodNumber;
            tags: z.ZodArray<z.ZodArray<z.ZodString>>;
            content: z.ZodString;
            sig: z.ZodString;
        }, z.core.$strip>;
        relays: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>, z.ZodObject<{
        eventId: z.ZodString;
        statuses: z.ZodArray<z.ZodObject<{
            relay: z.ZodString;
            success: z.ZodBoolean;
        }, z.core.$strip>>;
    }, z.core.$strip>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>>, Record<never, never>>;
    getProfileV1: import("@orpc/contract").ContractProcedure<z.ZodObject<{
        pubkey: z.ZodString;
    }, z.core.$strip>, z.ZodNullable<z.ZodObject<{
        pubkey: z.ZodString;
        name: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        picture: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        about: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        nip05: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        website: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, z.core.$strip>>, import("@orpc/contract").MergedErrorMap<Record<never, never>, import("@orpc/contract").MergedErrorMap<Record<never, never>, {
        BAD_REQUEST: {
            readonly status: 400;
            readonly data: z.ZodObject<{
                invalidFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
                validationErrors: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    field: z.ZodString;
                    message: z.ZodString;
                    code: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>>;
            }, z.core.$strip>;
        };
    }>>, Record<never, never>>;
};
export type ContractType = typeof contract;
