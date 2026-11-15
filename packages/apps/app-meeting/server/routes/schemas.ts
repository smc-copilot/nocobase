import { z } from 'zod';
import type { MeetingPublic } from '../meetings/service.js';

export const MeetingId = z.string().min(1).max(64);

export const MeetingSchema: z.ZodType<MeetingPublic> = z
  .object({
    id: MeetingId,
    title: z.string().nullable(),
    meetingCode: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ ref: 'Meeting' });

export const MeetingListQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const MeetingListMeta = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

export const MeetingParams = z.object({ meetingId: MeetingId });
