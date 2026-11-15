import { z } from 'zod';
import type {
  GatewayBindingPublic,
  GatewayConfigPublic,
  GatewayStartResult,
} from '../meetings/gateway-service.js';
import type {
  MeetingParticipantPublic,
  MeetingPublic,
  MeetingRecordingPublic,
} from '../meetings/service.js';
import type { QueryRunPublic } from '../meetings/query-run-service.js';

export const MeetingId = z.string().min(1).max(64);

export const FetchStatusSchema = z.enum([
  'not_fetched',
  'fetched',
  'empty',
  'failed',
  'not_provided',
]);

export const MeetingSchema: z.ZodType<MeetingPublic> = z
  .object({
    id: MeetingId,
    title: z.string().nullable(),
    meetingCode: z.string().nullable(),
    startedAt: z.string().nullable(),
    endedAt: z.string().nullable(),
    participantFetchStatus: FetchStatusSchema,
    recordingFetchStatus: FetchStatusSchema,
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

export const MeetingParticipantSchema: z.ZodType<MeetingParticipantPublic> = z
  .object({
    id: MeetingId,
    displayName: z.string().nullable(),
    department: z.string().nullable(),
    joinedAt: z.string().nullable(),
  })
  .meta({ ref: 'MeetingParticipant' });

export const MeetingRecordingSchema: z.ZodType<MeetingRecordingPublic> = z
  .object({
    id: MeetingId,
    available: z.boolean(),
    format: z.string().nullable(),
    unavailableReason: z.string().nullable(),
  })
  .meta({ ref: 'MeetingRecording' });

export const TotalMeta = z.object({ total: z.number() });

export const GatewayConfigSchema: z.ZodType<GatewayConfigPublic> = z
  .object({
    configured: z.boolean(),
    originConfigured: z.boolean(),
    applicationConfigured: z.boolean(),
    identityIssuance: z.enum(['unavailable', 'test-adapter', 'stored']),
    testAdapter: z.boolean(),
    queryHttpContract: z.literal('unavailable'),
    disconnectRevokesUpstream: z.literal(false),
    rootUnrestrictedReadsAllMeetings: z.literal(true),
  })
  .meta({ ref: 'MeetingGatewayConfig' });

export const GatewayConnectionSchema = z.object({
  connectionId: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.string(),
});

export const GatewayBindingSchema: z.ZodType<GatewayBindingPublic> = z
  .object({
    id: z.string(),
    status: z.enum([
      'pending',
      'awaiting_connection',
      'active',
      'disconnected',
      'identity_unavailable',
      'not_configured',
    ]),
    connectionRef: z.string().nullable(),
    connectionName: z.string().nullable(),
    connectionType: z.string().nullable(),
    availableConnections: z.array(GatewayConnectionSchema),
    disconnectRevokesUpstream: z.literal(false),
    updatedAt: z.string(),
  })
  .meta({ ref: 'MeetingGatewayBinding' });

export const GatewayStartSchema: z.ZodType<GatewayStartResult> = z
  .object({
    authorizationUrl: z.string(),
    state: z.string(),
    expiresAt: z.string(),
  })
  .meta({ ref: 'MeetingGatewayStart' });

export const GatewayCompleteBody = z.strictObject({
  state: z.string().min(1).max(64),
});

export const GatewaySelectBody = z.strictObject({
  connectionId: z.string().min(1).max(128),
});

export const GatewayBindingParams = z.object({
  bindingId: z.string().min(1).max(64),
});

export const OauthCallbackQuery = z.object({
  state: z.string().max(128).optional(),
});

export const QueryRunSchema: z.ZodType<QueryRunPublic> = z
  .object({
    id: MeetingId,
    status: z.enum(['running', 'succeeded', 'failed', 'empty']),
    startedAt: z.string(),
    endedAt: z.string(),
    errorReason: z.string().nullable(),
    meetingCount: z.number().nullable(),
    finishedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ ref: 'MeetingQueryRun' });

export const QueryRunCreateBody = z.strictObject({
  startedAt: z.string().min(1),
  endedAt: z.string().min(1),
});

export const QueryRunParams = z.object({ queryRunId: MeetingId });
