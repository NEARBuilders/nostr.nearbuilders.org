import { z } from "every-plugin/zod";

export const ProfileSchema = z.object({
  pubkey: z.string(),
  name: z.string().optional().nullable(),
  picture: z.string().optional().nullable(),
  about: z.string().optional().nullable(),
  nip05: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
});
export type NostrProfile = z.infer<typeof ProfileSchema>;

export const CommentProfileSchema = z.object({
  name: z.string().optional().nullable(),
  picture: z.string().optional().nullable(),
  about: z.string().optional().nullable(),
  nip05: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
});
export type CommentProfile = z.infer<typeof CommentProfileSchema>;

export const NostrCommentSchema = z.object({
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
  profile: CommentProfileSchema.optional().nullable(),
});
export type NostrComment = z.infer<typeof NostrCommentSchema>;

export const RelayStatusSchema = z.object({
  relay: z.string(),
  success: z.boolean(),
});
export type RelayStatus = z.infer<typeof RelayStatusSchema>;

export const PublishResultSchema = z.object({
  eventId: z.string(),
  statuses: z.array(RelayStatusSchema),
});
export type PublishResult = z.infer<typeof PublishResultSchema>;

export const ChannelInfoSchema = z.object({
  id: z.string(),
  name: z.string().optional().nullable(),
  members: z.number().int().optional().nullable(),
});
export type ChannelInfo = z.infer<typeof ChannelInfoSchema>;
