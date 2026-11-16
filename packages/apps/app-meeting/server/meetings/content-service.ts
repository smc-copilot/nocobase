import { createHash, randomUUID } from 'node:crypto';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection } from '@nocobase/db';
import type { MeetingGatewayAdapter } from './gateway/adapter.js';
import { MeetingGatewayService } from './gateway-service.js';
import {
  extractSourceTodos,
  parseJsonField,
  resolveMinutes,
  type SourceTodo,
} from './minutes.js';
import { MeetingOaError } from './oa/errors.js';
import {
  requireMeetingAction,
  requireReadableMeeting,
  requireUser,
  toIso,
} from './access.js';
import {
  MEETING_CONTENTS,
  MEETING_IMPORT_RUNS,
  MEETING_RECORDINGS,
  MEETING_TRANSCRIPT_REPAIRS,
  type MeetingContent,
  type MeetingImportRun,
  type MeetingRecording,
  type MeetingTranscriptRepair,
} from './resources.js';
import {
  alignedProvenance,
  concatenateGroupTexts,
  LEGACY_REPAIRED,
  LEGACY_REVERSED,
  TENCENT_GROUPS_V1,
  type TranscriptProvenance,
} from './tencent-groups.js';

export interface MeetingContentPublic {
  meetingId: string;
  contentVersion: number;
  sourceHash: string | null;
  originalTranscript: string | null;
  optimizedTranscript: string | null;
  minutes: { text: string; source: string };
  tencentMinutes: {
    ai_ds_minutes: string;
    ai_minutes: string;
    ai_speaker_minutes: string;
    ai_topic_minutes: string;
  };
  tencentDialogues: {
    original: string;
    optimized: string;
  };
  localMinutes: string | null;
  localTranscript: string | null;
  localMinutesEdited: boolean;
  localTranscriptEdited: boolean;
  sourceTodos: readonly SourceTodo[];
  importStatus: string;
  lastImportError: string | null;
  transcriptProvenance: TranscriptProvenance | null;
  liveGatewayImport: 'unavailable' | 'test-adapter' | 'http';
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function emptyToNull(value: string): string | null {
  return value.trim() ? value : null;
}

function publicContent(
  row: MeetingContent,
  liveGatewayImport: MeetingContentPublic['liveGatewayImport'],
): MeetingContentPublic {
  const original = row.originalTranscript ?? '';
  const optimized = row.optimizedTranscript ?? '';
  return {
    meetingId: row.meetingId,
    contentVersion: row.contentVersion,
    sourceHash: row.sourceHash,
    originalTranscript: row.localTranscriptEdited
      ? row.localTranscript
      : row.originalTranscript,
    optimizedTranscript: row.optimizedTranscript,
    minutes: resolveMinutes(row),
    tencentMinutes: {
      ai_ds_minutes: row.minutesAiDs ?? '',
      ai_minutes: row.minutesAi ?? '',
      ai_speaker_minutes: row.minutesSpeaker ?? '',
      ai_topic_minutes: row.minutesTopic ?? '',
    },
    tencentDialogues: {
      original,
      optimized,
    },
    localMinutes: row.localMinutes,
    localTranscript: row.localTranscript,
    localMinutesEdited: row.localMinutesEdited,
    localTranscriptEdited: row.localTranscriptEdited,
    sourceTodos: parseJsonField<SourceTodo[]>(row.sourceTodos ?? null) ?? [],
    importStatus: row.importStatus,
    lastImportError: row.lastImportError,
    transcriptProvenance: parseJsonField<TranscriptProvenance>(
      row.transcriptProvenance ?? null,
    ),
    liveGatewayImport,
  };
}

export class MeetingContentService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly authz: AuthorizationContext,
    private readonly gateway: MeetingGatewayService,
    private readonly adapter: MeetingGatewayAdapter,
    private readonly userId: string | undefined,
  ) {}

  private liveImport(): MeetingContentPublic['liveGatewayImport'] {
    if (typeof this.adapter.importRecordingContent !== 'function') {
      return 'unavailable';
    }
    if (this.adapter.kind === 'test') return 'test-adapter';
    return 'http';
  }

  async get(meetingId: string): Promise<MeetingContentPublic> {
    await requireReadableMeeting(this.connection, this.authz, meetingId);
    const row = await this.ensure(meetingId);
    return publicContent(row, this.liveImport());
  }

  async edit(
    meetingId: string,
    input: {
      expectedContentVersion: number;
      localMinutes?: string;
      localTranscript?: string;
    },
  ): Promise<MeetingContentPublic> {
    await requireMeetingAction(this.authz, 'edit');
    await requireReadableMeeting(this.connection, this.authz, meetingId);
    const userId = requireUser(this.userId);
    const now = new Date();
    const current = await this.ensure(meetingId);
    if (current.contentVersion !== input.expectedContentVersion) {
      throw new MeetingOaError(
        'CONTENT_VERSION_CONFLICT',
        'Meeting content was changed by another request.',
        'ABORTED',
      );
    }
    const values: Partial<MeetingContent> = {
      contentVersion: current.contentVersion + 1,
      updatedAt: now,
    };
    if (input.localMinutes !== undefined) {
      values.localMinutes = input.localMinutes;
      values.localMinutesEdited = true;
    }
    if (input.localTranscript !== undefined) {
      values.localTranscript = input.localTranscript;
      values.localTranscriptEdited = true;
    }
    await this.connection
      .repository<MeetingContent>(MEETING_CONTENTS)
      .updateOne({
        filter: { id: current.id, contentVersion: current.contentVersion },
        values,
      });
    await this.audit(meetingId, userId, 'CONTENT_EDITED', {
      contentVersion: values.contentVersion,
    });
    return this.get(meetingId);
  }

  async importRecording(
    meetingId: string,
    recordFileId: string,
  ): Promise<{
    data: MeetingContentPublic;
    importRun: MeetingImportRunPublic;
  }> {
    await requireMeetingAction(this.authz, 'import');
    await requireReadableMeeting(this.connection, this.authz, meetingId);
    const userId = requireUser(this.userId);
    if (!recordFileId.trim() || recordFileId.includes('://')) {
      throw new MeetingOaError(
        'IMPORT_RECORDING_REJECTED',
        'Import uses a stored recording id, not a download URL.',
        'INVALID_ARGUMENT',
      );
    }
    const recording = await this.connection
      .repository<MeetingRecording>(MEETING_RECORDINGS)
      .findOne({ filter: { meetingId, recordFileId } });
    if (!recording) {
      throw new MeetingOaError(
        'IMPORT_RECORDING_REJECTED',
        'The recording is not stored for this meeting.',
        'FAILED_PRECONDITION',
      );
    }
    const now = new Date();
    const runId = randomUUID();
    await this.connection
      .repository<MeetingImportRun>(MEETING_IMPORT_RUNS)
      .createOne({
        values: {
          id: runId,
          meetingId,
          recordFileId,
          status: 'running',
          progress: 10,
          errorCode: null,
          sourceHash: null,
          requestedBy: userId,
          createdAt: now,
          updatedAt: now,
        },
      });
    if (typeof this.adapter.importRecordingContent !== 'function') {
      await this.failImport(meetingId, runId, 'IMPORT_CONTRACT_UNAVAILABLE');
      return {
        data: await this.get(meetingId),
        importRun: await this.getRun(runId),
      };
    }
    try {
      const binding = await this.gateway.requireActiveBinding();
      const artifacts = await this.adapter.importRecordingContent({
        accessToken: this.gateway.openBindingToken(binding),
        connectionRef: binding.connectionRef ?? '',
        recordFileId,
      });
      const grouped = concatenateGroupTexts(artifacts);
      const sourceHash = sha256(
        artifacts.map((item) => `${item.group}\n${item.text}`).join('\n'),
      );
      const minutesText =
        grouped.ai_ds_minutes ||
        grouped.ai_minutes ||
        grouped.ai_topic_minutes ||
        grouped.ai_speaker_minutes ||
        '';
      await this.connection.transaction(async (trx) => {
        const content = await this.ensure(meetingId, trx);
        await trx.repository<MeetingContent>(MEETING_CONTENTS).updateOne({
          filter: { id: content.id },
          values: {
            contentVersion: content.contentVersion + 1,
            sourceHash,
            originalTranscript:
              emptyToNull(grouped.meeting_summary) ??
              content.originalTranscript,
            optimizedTranscript:
              emptyToNull(grouped.ai_meeting_transcripts) ??
              content.optimizedTranscript,
            minutesAiDs: emptyToNull(grouped.ai_ds_minutes),
            minutesAi: emptyToNull(grouped.ai_minutes),
            minutesTopic: emptyToNull(grouped.ai_topic_minutes),
            minutesSpeaker: emptyToNull(grouped.ai_speaker_minutes),
            sourceTodos: [...extractSourceTodos(minutesText)],
            transcriptProvenance: {
              ...alignedProvenance(),
            } as Record<string, unknown>,
            importStatus: 'succeeded',
            lastImportError: null,
            updatedAt: new Date(),
          },
        });
        await trx.repository<MeetingImportRun>(MEETING_IMPORT_RUNS).updateOne({
          filter: { id: runId },
          values: {
            status: 'succeeded',
            progress: 100,
            sourceHash,
            errorCode: null,
            updatedAt: new Date(),
          },
        });
      });
      await this.audit(meetingId, userId, 'CONTENT_IMPORTED', {
        recordFileId,
        sourceHash,
      });
    } catch (error) {
      const code =
        error instanceof MeetingOaError ? error.reason : 'IMPORT_FAILED';
      await this.failImport(meetingId, runId, code);
    }
    return {
      data: await this.get(meetingId),
      importRun: await this.getRun(runId),
    };
  }

  async listTranscriptRepairs(): Promise<
    readonly {
      id: string;
      meetingId: string;
      contentId: string;
      action: string;
      reason: string;
      createdAt: string;
    }[]
  > {
    await requireMeetingAction(this.authz, 'read');
    const rows = await this.connection
      .repository<MeetingTranscriptRepair>(MEETING_TRANSCRIPT_REPAIRS)
      .findMany({
        sort: (sort) => sort.field('createdAt').desc(),
      });
    return rows.map((row) => ({
      id: row.id,
      meetingId: row.meetingId,
      contentId: row.contentId,
      action: row.action,
      reason: row.reason,
      createdAt: toIso(row.createdAt) as string,
    }));
  }

  async repairLegacyTranscripts(): Promise<{
    repaired: number;
    skipped: number;
  }> {
    await requireMeetingAction(this.authz, 'import');
    const rows = await this.connection
      .repository<MeetingContent>(MEETING_CONTENTS)
      .findMany();
    let repaired = 0;
    let skipped = 0;
    for (const row of rows) {
      const result = this.planRepair(row);
      await this.connection
        .repository<MeetingTranscriptRepair>(MEETING_TRANSCRIPT_REPAIRS)
        .createOne({
          values: {
            id: randomUUID(),
            meetingId: row.meetingId,
            contentId: row.id,
            action: result.action,
            reason: result.reason,
            createdAt: new Date(),
          },
        });
      if (result.action !== 'swapped') {
        skipped += 1;
        continue;
      }
      await this.connection
        .repository<MeetingContent>(MEETING_CONTENTS)
        .updateOne({
          filter: { id: row.id },
          values: {
            originalTranscript: row.optimizedTranscript,
            optimizedTranscript: row.originalTranscript,
            transcriptProvenance: {
              mappingVersion: LEGACY_REPAIRED,
              originalGroup: 'meeting_summary',
              optimizedGroup: 'ai_meeting_transcripts',
              repairedAt: new Date().toISOString(),
            } as Record<string, unknown>,
            updatedAt: new Date(),
          },
        });
      repaired += 1;
    }
    return { repaired, skipped };
  }

  planRepair(row: MeetingContent): { action: string; reason: string } {
    const provenance = parseJsonField<TranscriptProvenance>(
      row.transcriptProvenance ?? null,
    );
    if (provenance?.mappingVersion === TENCENT_GROUPS_V1) {
      return { action: 'skipped', reason: 'already-aligned' };
    }
    if (provenance?.mappingVersion === LEGACY_REPAIRED) {
      return { action: 'skipped', reason: 'already-repaired' };
    }
    if (row.localTranscriptEdited) {
      return { action: 'skipped', reason: 'local-transcript-edit' };
    }
    if (!row.sourceHash || row.importStatus !== 'succeeded') {
      return { action: 'skipped', reason: 'no-import-evidence' };
    }
    const original = String(row.originalTranscript ?? '').trim();
    const optimized = String(row.optimizedTranscript ?? '').trim();
    if (!original || !optimized || original === optimized) {
      return { action: 'skipped', reason: 'ambiguous-fields' };
    }
    if (
      provenance?.mappingVersion &&
      provenance.mappingVersion !== LEGACY_REVERSED
    ) {
      return { action: 'skipped', reason: 'unknown-provenance' };
    }
    return { action: 'swapped', reason: 'legacy-reversed-import' };
  }

  private async failRun(runId: string, errorCode: string): Promise<void> {
    await this.connection
      .repository<MeetingImportRun>(MEETING_IMPORT_RUNS)
      .updateOne({
        filter: { id: runId },
        values: {
          status: 'failed',
          progress: 100,
          errorCode,
          updatedAt: new Date(),
        },
      });
  }

  private async failImport(
    meetingId: string,
    runId: string,
    errorCode: string,
  ): Promise<void> {
    await this.failRun(runId, errorCode);
    const content = await this.ensure(meetingId);
    await this.connection
      .repository<MeetingContent>(MEETING_CONTENTS)
      .updateOne({
        filter: { id: content.id },
        values: {
          lastImportError: errorCode,
          importStatus: content.sourceHash ? content.importStatus : 'failed',
          updatedAt: new Date(),
        },
      });
  }

  private async getRun(runId: string): Promise<MeetingImportRunPublic> {
    const row = await this.connection
      .repository<MeetingImportRun>(MEETING_IMPORT_RUNS)
      .findOne({ filter: { id: runId } });
    if (!row) {
      throw new MeetingOaError(
        'IMPORT_RECORDING_REJECTED',
        'The import run is unavailable.',
        'FAILED_PRECONDITION',
      );
    }
    return {
      id: row.id,
      meetingId: row.meetingId,
      recordFileId: row.recordFileId,
      status: row.status,
      progress: row.progress,
      errorCode: row.errorCode,
      sourceHash: row.sourceHash,
      createdAt: toIso(row.createdAt) as string,
    };
  }

  private async ensure(
    meetingId: string,
    connection: DatabaseConnection = this.connection,
  ): Promise<MeetingContent> {
    const existing = await connection
      .repository<MeetingContent>(MEETING_CONTENTS)
      .findOne({ filter: { meetingId } });
    if (existing) return existing;
    const now = new Date();
    const id = randomUUID();
    await connection.repository<MeetingContent>(MEETING_CONTENTS).createOne({
      values: {
        id,
        meetingId,
        contentVersion: 0,
        sourceHash: null,
        originalTranscript: null,
        optimizedTranscript: null,
        minutesAiDs: null,
        minutesAi: null,
        minutesTopic: null,
        minutesSpeaker: null,
        localMinutes: null,
        localTranscript: null,
        localMinutesEdited: false,
        localTranscriptEdited: false,
        sourceTodos: [],
        transcriptProvenance: null,
        importStatus: 'empty',
        lastImportError: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return (await connection
      .repository<MeetingContent>(MEETING_CONTENTS)
      .findOne({ filter: { id } })) as MeetingContent;
  }

  private async audit(
    meetingId: string,
    actorUserId: string,
    action: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.connection.repository('meetingAuditEvents').createOne({
      values: {
        id: randomUUID(),
        meetingId,
        operationId: null,
        action,
        actorUserId,
        details,
        createdAt: new Date(),
      },
    });
  }
}

export interface MeetingImportRunPublic {
  id: string;
  meetingId: string;
  recordFileId: string;
  status: string;
  progress: number;
  errorCode: string | null;
  sourceHash: string | null;
  createdAt: string;
}
