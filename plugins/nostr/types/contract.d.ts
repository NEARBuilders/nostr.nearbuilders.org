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
    rootId: z.ZodOptional<z.ZodString>;
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
        rootEventId: z.ZodOptional<z.ZodString>;
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
        rootId: z.ZodOptional<z.ZodString>;
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
};
export type ContractType = typeof contract;
