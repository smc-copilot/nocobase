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
  type MeetingContent,
  type MeetingImportRun,
  type MeetingRecording,
} from './resources.js';

export interface MeetingContentPublic {
  meetingId: string;
  contentVersion: number;
  sourceHash: string | null;
  originalTranscript: string | null;
  optimizedTranscript: string | null;
  minutes: { text: string; source: string };
  localMinutes: string | null;
  localTranscript: string | null;
  localMinutesEdited: boolean;
  localTranscriptEdited: boolean;
  sourceTodos: readonly SourceTodo[];
  importStatus: string;
  lastImportError: string | null;
  liveGatewayImport: 'unavailable' | 'test-adapter';
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function publicContent(row: MeetingContent): MeetingContentPublic {
  return {
    meetingId: row.meetingId,
    contentVersion: row.contentVersion,
    sourceHash: row.sourceHash,
    originalTranscript: row.localTranscriptEdited
      ? row.localTranscript
      : row.originalTranscript,
    optimizedTranscript: row.optimizedTranscript,
    minutes: resolveMinutes(row),
    localMinutes: row.localMinutes,
    localTranscript: row.localTranscript,
    localMinutesEdited: row.localMinutesEdited,
    localTranscriptEdited: row.localTranscriptEdited,
    sourceTodos: parseJsonField<SourceTodo[]>(row.sourceTodos ?? null) ?? [],
    importStatus: row.importStatus,
    lastImportError: row.lastImportError,
    liveGatewayImport:
      row.lastImportError === 'IMPORT_CONTRACT_UNAVAILABLE'
        ? 'unavailable'
        : row.importStatus === 'succeeded'
          ? 'test-adapter'
          : 'unavailable',
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

  async get(meetingId: string): Promise<MeetingContentPublic> {
    await requireReadableMeeting(this.connection, this.authz, meetingId);
    const row = await this.ensure(meetingId);
    return publicContent(row);
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
      await this.failRun(runId, 'IMPORT_CONTRACT_UNAVAILABLE');
      const content = await this.ensure(meetingId);
      await this.connection
        .repository<MeetingContent>(MEETING_CONTENTS)
        .updateOne({
          filter: { id: content.id },
          values: {
            lastImportError: 'IMPORT_CONTRACT_UNAVAILABLE',
            importStatus: content.sourceHash ? content.importStatus : 'failed',
            updatedAt: new Date(),
          },
        });
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
      const grouped = Object.fromEntries(
        artifacts.map((item) => [item.group, item.text]),
      ) as Record<string, string>;
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
              grouped.ai_meeting_transcripts ?? content.originalTranscript,
            optimizedTranscript:
              grouped.meeting_summary ?? content.optimizedTranscript,
            minutesAiDs: grouped.ai_ds_minutes ?? null,
            minutesAi: grouped.ai_minutes ?? null,
            minutesTopic: grouped.ai_topic_minutes ?? null,
            minutesSpeaker: grouped.ai_speaker_minutes ?? null,
            sourceTodos: [...extractSourceTodos(minutesText)],
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
        error instanceof MeetingOaError
          ? error.reason
          : 'IMPORT_CONTRACT_UNAVAILABLE';
      await this.failRun(runId, code);
    }
    return {
      data: await this.get(meetingId),
      importRun: await this.getRun(runId),
    };
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
