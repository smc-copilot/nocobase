import { z } from 'zod';
import type { RecordingDetailPublic } from '../meetings/content-service.js';
import type {
  GatewayBindingPublic,
  GatewayConfigPublic,
  GatewayStartResult,
} from '../meetings/gateway-service.js';
import type { QueryRunPublic } from '../meetings/query-run-service.js';
import type {
  MeetingParticipantPublic,
  MeetingPublic,
  MeetingRecordingPublic,
} from '../meetings/service.js';

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
    queryAnomaly: z.string().nullable(),
    importState: z.string(),
    oaMeetingCreated: z.boolean(),
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

export const RecordingDetailParams = z.object({
  meetingId: MeetingId,
  recordFileId: z.string().min(1).max(128),
});

export const MeetingParticipantSchema: z.ZodType<MeetingParticipantPublic> = z
  .object({
    id: MeetingId,
    joinName: z.string().nullable(),
    displayName: z.string().nullable(),
    department: z.string().nullable(),
    joinedAt: z.string().nullable(),
    jobTitle: z.string().nullable(),
    isCorpMember: z.boolean().nullable(),
  })
  .meta({ ref: 'MeetingParticipant' });

export const MeetingRecordingSchema: z.ZodType<MeetingRecordingPublic> = z
  .object({
    id: MeetingId,
    recordFileId: z.string(),
    available: z.boolean(),
    format: z.string().nullable(),
    unavailableReason: z.string().nullable(),
    sharingUrl: z.string().nullable(),
    allowDownload: z.boolean().nullable(),
    importability: z.string(),
  })
  .meta({ ref: 'MeetingRecording' });

const RecordingDetailDocSchema = z.object({
  fileType: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  available: z.boolean(),
});

const RecordingDetailInfoSchema = z.object({
  userId: z.string().nullable(),
  topic: z.string().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
});

export const RecordingDetailSchema: z.ZodType<RecordingDetailPublic> = z
  .object({
    meetingId: MeetingId,
    recordFileId: z.string(),
    viewAddress: z.string().nullable(),
    downloadAddress: z.string().nullable(),
    downloadAddressFileType: z.string().nullable(),
    audioAddress: z.string().nullable(),
    audioAddressFileType: z.string().nullable(),
    meetingSummary: z.array(RecordingDetailDocSchema),
    aiMeetingTranscripts: z.array(RecordingDetailDocSchema),
    aiMinutes: z.array(RecordingDetailDocSchema),
    aiTopicMinutes: z.array(RecordingDetailDocSchema),
    aiSpeakerMinutes: z.array(RecordingDetailDocSchema),
    aiDsMinutes: z.array(RecordingDetailDocSchema),
    recordInfo: z.array(RecordingDetailInfoSchema),
    fetchedAt: z.string(),
  })
  .meta({ ref: 'RecordingDetail' });

export const TotalMeta = z.object({ total: z.number() });

export const GatewayOriginBody = z
  .object({
    enabled: z.boolean().optional(),
    origin: z.string().nullable().optional(),
    resource: z.string().nullable().optional(),
    instanceId: z.string().nullable().optional(),
    allowedOrigin: z.string().nullable().optional(),
    contractRevision: z.string().nullable().optional(),
    contractSha256: z.string().nullable().optional(),
    bridgeHmacKey: z.string().nullable().optional(),
    bridgeKeyringJson: z.string().nullable().optional(),
  })
  .meta({ ref: 'MeetingGatewayOriginBody' });

export const GatewayConfigSchema: z.ZodType<GatewayConfigPublic> = z
  .object({
    configured: z.boolean(),
    enabled: z.boolean(),
    origin: z.string().nullable(),
    resource: z.string().nullable(),
    instanceId: z.string().nullable(),
    allowedOrigin: z.string().nullable(),
    contractRevision: z.string().nullable(),
    hasContractSha256: z.boolean(),
    hasBridgeHmacKey: z.boolean(),
    hasBridgeKeyring: z.boolean(),
    originSource: z.enum(['settings', 'env', 'none']),
    originConfigured: z.boolean(),
    contractReady: z.boolean(),
    missingContract: z.array(z.string()),
    applicationConfigured: z.boolean(),
    identityIssuance: z.enum([
      'unavailable',
      'test-adapter',
      'stored',
      'ready',
    ]),
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

export const GatewayCompleteBody = z
  .strictObject({
    state: z.string().min(1).max(64),
    // Optional continue_to callback fields. When the gateway embeds the
    // authorization result in the redirect URL, the done page forwards them
    // once so the server can seal the bridge without the hanging
    // transaction_id poll. All-or-nothing when any field is present.
    accessToken: z.string().min(4).max(4096).optional(),
    tokenType: z.string().min(1).max(32).optional(),
    expiresIn: z.number().int().min(1).max(86_400).optional(),
    connectionId: z.string().uuid().optional(),
    memberId: z.string().uuid().optional(),
    status: z.string().min(1).max(64).optional(),
  })
  .superRefine((value, context) => {
    const hasCallback =
      value.accessToken !== undefined ||
      value.tokenType !== undefined ||
      value.expiresIn !== undefined ||
      value.connectionId !== undefined ||
      value.memberId !== undefined ||
      value.status !== undefined;
    if (!hasCallback) return;
    for (const key of [
      'accessToken',
      'tokenType',
      'expiresIn',
      'connectionId',
      'memberId',
      'status',
    ] as const) {
      if (value[key] === undefined) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Callback authorization fields must be sent together.',
        });
      }
    }
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

export const MeetingContentSchema = z
  .object({
    meetingId: MeetingId,
    contentVersion: z.number(),
    sourceHash: z.string().nullable(),
    originalTranscript: z.string().nullable(),
    optimizedTranscript: z.string().nullable(),
    minutes: z.object({ text: z.string(), source: z.string() }),
    localMinutes: z.string().nullable(),
    localTranscript: z.string().nullable(),
    localMinutesEdited: z.boolean(),
    localTranscriptEdited: z.boolean(),
    sourceTodos: z.array(
      z.object({ title: z.string(), description: z.string() }),
    ),
    tencentMinutes: z.object({
      ai_ds_minutes: z.string(),
      ai_minutes: z.string(),
      ai_speaker_minutes: z.string(),
      ai_topic_minutes: z.string(),
    }),
    tencentDialogues: z.object({
      original: z.string(),
      optimized: z.string(),
    }),
    importStatus: z.string(),
    lastImportError: z.string().nullable(),
    transcriptProvenance: z
      .object({
        mappingVersion: z.string(),
        originalGroup: z.string().nullable(),
        optimizedGroup: z.string().nullable(),
        repairedAt: z.string().optional(),
        skippedReason: z.string().optional(),
      })
      .nullable(),
    liveGatewayImport: z.enum(['unavailable', 'test-adapter', 'http']),
  })
  .meta({ ref: 'MeetingContent' });

export const MeetingContentEditBody = z.strictObject({
  expectedContentVersion: z.number().int().min(0),
  localMinutes: z.string().optional(),
  localTranscript: z.string().optional(),
});

export const TranscriptRepairSchema = z
  .object({
    id: z.string(),
    meetingId: MeetingId,
    contentId: z.string(),
    action: z.string(),
    reason: z.string(),
    createdAt: z.string(),
  })
  .meta({ ref: 'MeetingTranscriptRepair' });

export const TranscriptRepairRunSchema = z
  .object({
    repaired: z.number(),
    skipped: z.number(),
  })
  .meta({ ref: 'MeetingTranscriptRepairRun' });

export const MeetingImportBody = z.strictObject({
  recordFileId: z.string().min(1).max(128),
});

export const MeetingImportRunSchema = z
  .object({
    id: z.string(),
    meetingId: MeetingId,
    recordFileId: z.string(),
    status: z.string(),
    progress: z.number(),
    errorCode: z.string().nullable(),
    sourceHash: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ ref: 'MeetingImportRun' });

const OaPersonSnapshotSchema = z.object({
  fd_no: z.string(),
  fd_name: z.string(),
  fd_department: z.string(),
});

export const OaDraftTaskSchema = z.object({
  clientTaskId: z.string(),
  title: z.string(),
  assigneeEmployeeNo: z.string().nullable(),
  assigneeName: z.string().nullable(),
  appointEmployeeNo: z.string().nullable(),
  appointName: z.string().nullable(),
  attentionEmployeeNos: z.array(z.string()),
  attentionSnapshots: z.array(OaPersonSnapshotSchema),
  startAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  description: z.string().nullable(),
  fromSourceTodo: z.boolean(),
});

export const OaDraftSchema = z
  .object({
    meetingId: MeetingId,
    version: z.number(),
    title: z.string().nullable(),
    startAt: z.string().nullable(),
    endAt: z.string().nullable(),
    location: z.string().nullable(),
    purpose: z.string().nullable(),
    remark: z.string().nullable(),
    otherAttendPerson: z.string().nullable(),
    attendeeEmployeeNos: z.array(z.string()),
    attendeeSnapshots: z.array(OaPersonSnapshotSchema),
    emceeSnapshot: OaPersonSnapshotSchema.nullable(),
    hostSnapshot: OaPersonSnapshotSchema.nullable(),
    actualAttendSnapshots: z.array(OaPersonSnapshotSchema),
    copyToSnapshots: z.array(OaPersonSnapshotSchema),
    summaryTitle: z.string().nullable(),
    summary: z.string().nullable(),
    summaryCompleteTime: z.string().nullable(),
    tasks: z.array(OaDraftTaskSchema),
    filledFromContentVersion: z.number().nullable(),
    frozen: z.boolean(),
    operationId: z.string().nullable(),
    writesOa: z.literal(false),
    isolationAdapter: z.boolean(),
  })
  .meta({ ref: 'MeetingOaDraft' });

export const OaDraftSaveBody = z.strictObject({
  expectedVersion: z.number().int().min(1),
  title: z.string().nullable().optional(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  remark: z.string().nullable().optional(),
  otherAttendPerson: z.string().nullable().optional(),
  attendeeEmployeeNos: z.array(z.string()).optional(),
  attendeeSnapshots: z.array(OaPersonSnapshotSchema).optional(),
  emceeSnapshot: OaPersonSnapshotSchema.nullable().optional(),
  hostSnapshot: OaPersonSnapshotSchema.nullable().optional(),
  actualAttendSnapshots: z.array(OaPersonSnapshotSchema).optional(),
  copyToSnapshots: z.array(OaPersonSnapshotSchema).optional(),
  summaryTitle: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  summaryCompleteTime: z.string().nullable().optional(),
  tasks: z
    .array(
      z.object({
        clientTaskId: z.string().optional(),
        title: z.string(),
        assigneeEmployeeNo: z.string().nullable().optional(),
        assigneeName: z.string().nullable().optional(),
        appointEmployeeNo: z.string().nullable().optional(),
        appointName: z.string().nullable().optional(),
        attentionEmployeeNos: z.array(z.string()).optional(),
        attentionSnapshots: z.array(OaPersonSnapshotSchema).optional(),
        startAt: z.string().nullable().optional(),
        dueAt: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

export const OaIdentitySchema = z
  .object({
    userId: z.string(),
    employeeNo: z.string().nullable(),
    displayName: z.string().nullable(),
    status: z.string().nullable(),
    canSync: z.boolean(),
    denyReason: z.string().nullable(),
    liveVerified: z.boolean(),
    liveVerifyReason: z.string().nullable(),
  })
  .meta({ ref: 'MeetingOaIdentity' });

export const OaMapBody = z.strictObject({
  userId: z.string().min(1).max(64),
  employeeNo: z.string().min(1).max(64),
  displayName: z.string().max(255).nullable().optional(),
  status: z.enum(['active', 'revoked']).optional(),
});

export const OaPeopleQuery = z
  .object({
    q: z.string().min(1).max(100),
    by: z.enum(['name', 'employeeNo']).optional(),
  })
  .superRefine((value, ctx) => {
    const by = value.by ?? 'name';
    if (by === 'name' && value.q.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['q'],
        message: 'Name search requires at least 2 characters',
      });
    }
  });

export const OaPersonSchema = z.object({
  fd_no: z.string(),
  fd_name: z.string(),
  fd_department: z.string(),
});

export const OaSettingsSchema = z
  .object({
    tokenUrl: z.string().nullable(),
    peopleUrl: z.string().nullable(),
    meetingUrl: z.string().nullable(),
    viewUrl: z.string().nullable(),
    scope: z.string().nullable(),
    clientId: z.string().nullable(),
    tokenUrlConfigured: z.boolean(),
    peopleUrlConfigured: z.boolean(),
    meetingUrlConfigured: z.boolean(),
    clientIdConfigured: z.boolean(),
    hasSecret: z.boolean(),
    writeContract: z.enum(['unavailable', 'test', 'configured']),
    tokenContract: z.enum(['unavailable', 'test', 'configured']),
    peopleContract: z.enum(['oaPeople.js', 'test']),
    peopleUrlSource: z.enum(['env', 'test', 'none']),
    testAdapter: z.boolean(),
    isolationNote: z.string().nullable(),
    liveVerified: z.boolean(),
    liveVerifyReason: z.string().nullable(),
    updatedAt: z.string().nullable(),
  })
  .meta({ ref: 'MeetingOaSettings' });

export const OaSettingsBody = z.strictObject({
  tokenUrl: z.string().max(500).nullable().optional(),
  peopleUrl: z.string().max(500).nullable().optional(),
  meetingUrl: z.string().max(500).nullable().optional(),
  viewUrl: z.string().max(500).nullable().optional(),
  scope: z.string().max(255).nullable().optional(),
  clientId: z.string().max(128).nullable().optional(),
  clientSecret: z.string().max(500).nullable().optional(),
});

export const SupplementalFileSchema = z
  .object({
    id: MeetingId,
    meetingId: MeetingId,
    fileName: z.string(),
    mimeType: z.string().nullable(),
    sizeBytes: z.number(),
    contentHash: z.string(),
    parseStatus: z.string(),
    parseError: z.string().nullable(),
    createdAt: z.string(),
    tencentSource: z.literal(false),
  })
  .meta({ ref: 'MeetingSupplementalFile' });

export const SupplementalFileParams = z.object({
  meetingId: MeetingId,
  fileId: MeetingId,
});

export const SupplementalUploadBody = z.strictObject({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(128).nullable().optional(),
  contentBase64: z.string().min(1),
});

export const SupplementalFileContentSchema = z.object({
  fileName: z.string(),
  mimeType: z.string().nullable(),
  contentBase64: z.string(),
});

export const SupplementalFileDeletedSchema = z.object({
  id: MeetingId,
  deleted: z.literal(true),
});

export const SupplementalListMeta = z.object({
  total: z.number(),
  totalBytes: z.number(),
});

export const OaOperationSchema = z
  .object({
    id: MeetingId,
    meetingId: MeetingId,
    oaTarget: z.string(),
    requestId: z.string(),
    status: z.string(),
    draftVersion: z.number(),
    creatorUserId: z.string(),
    creatorEmployeeNo: z.string(),
    actorUserId: z.string(),
    denyReason: z.string().nullable(),
    steps: z.array(
      z.object({
        stepKey: z.string(),
        status: z.string(),
        externalId: z.string().nullable(),
        errorCode: z.string().nullable(),
      }),
    ),
    tasks: z.array(
      z.object({
        clientTaskId: z.string(),
        status: z.string(),
        externalTaskId: z.string().nullable(),
        errorCode: z.string().nullable(),
      }),
    ),
    writesOaOnGet: z.literal(false),
    isolationAdapter: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'MeetingOaOperation' });

export const OaSyncBody = z.strictObject({
  meetingId: MeetingId,
  requestId: z.string().min(1).max(64),
  expectedDraftVersion: z.number().int().min(1),
  asPrincipalUserId: z.string().max(64).optional(),
});

export const OaOperationParams = z.object({ operationId: MeetingId });

export const OaReconcileBody = z.strictObject({
  conclusion: z.enum(['not_sent', 'sent_or_unknown', 'external_confirmed']),
  evidence: z.string().min(1).max(4000),
});
