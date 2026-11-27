import { randomUUID } from 'node:crypto';
import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection } from '@nocobase/db';
import { isUniqueConstraintViolation } from '@nocobase/db';
import { buildFilter } from '@nocobase/repository-input';
import {
  requireMeetingAction,
  requireReadableMeeting,
  requireUser,
  toIso,
} from '../access.js';
import {
  MEETING_OA_OPERATIONS,
  MEETING_OA_OUTBOX,
  MEETING_OA_RECONCILE_RECORDS,
  MEETING_OA_STEPS,
  MEETING_OA_TASK_RESULTS,
  type MeetingOaOperation,
  type MeetingOaOutbox,
  type MeetingOaReconcileRecord,
  type MeetingOaStep,
  type MeetingOaTaskResult,
  type OaOperationStatus,
  type OaStepStatus,
} from '../resources.js';
import { MeetingOaDraftService } from './draft-service.js';
import { MeetingOaError } from './errors.js';
import { MeetingOaExecutor } from './executor.js';
import { MeetingOaIdentityService } from './identity-service.js';

const STEP_KEYS = [
  'createMeeting',
  'uploadSummary',
  'createTaskByMeeting',
] as const;

const OA_TARGET = 'default';

export interface OperationPublic {
  id: string;
  meetingId: string;
  oaTarget: string;
  requestId: string;
  status: OaOperationStatus;
  draftVersion: number;
  creatorUserId: string;
  creatorEmployeeNo: string;
  actorUserId: string;
  denyReason: string | null;
  steps: readonly StepPublic[];
  tasks: readonly TaskResultPublic[];
  writesOaOnGet: false;
  isolationAdapter: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StepPublic {
  stepKey: string;
  status: OaStepStatus | 'unknown';
  externalId: string | null;
  errorCode: string | null;
}

export interface TaskResultPublic {
  clientTaskId: string;
  status: string;
  externalTaskId: string | null;
  errorCode: string | null;
}

export class MeetingOaOperationService {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly authz: AuthorizationContext,
    private readonly drafts: MeetingOaDraftService,
    private readonly identity: MeetingOaIdentityService,
    private readonly executor: MeetingOaExecutor,
    private readonly userId: string | undefined,
    private readonly isolationAdapter: boolean,
  ) {}

  async get(id: string): Promise<OperationPublic> {
    const row = await this.connection
      .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
      .findOne({ filter: { id } });
    if (!row) {
      throw new MeetingOaError(
        'ACCESS_DENIED',
        'This OA operation is unavailable.',
        'PERMISSION_DENIED',
      );
    }
    await requireReadableMeeting(this.connection, this.authz, row.meetingId);
    return this.publicOperation(row);
  }

  async listUnknown(): Promise<readonly OperationPublic[]> {
    await requireMeetingAction(this.authz, 'oaReconcile');
    const rows = await this.connection
      .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
      .findMany({
        filter: buildFilter((filter) =>
          filter.or([
            filter.string('status').eq('unknown'),
            filter.string('status').eq('partial'),
          ]),
        ),
        sort: (sort) => sort.field('updatedAt').desc(),
      });
    return Promise.all(rows.map((row) => this.publicOperation(row)));
  }

  async submit(input: {
    meetingId: string;
    requestId: string;
    expectedDraftVersion: number;
    asPrincipalUserId?: string;
  }): Promise<OperationPublic> {
    await requireMeetingAction(this.authz, 'oaSync');
    const meeting = await requireReadableMeeting(
      this.connection,
      this.authz,
      input.meetingId,
    );
    const actor = requireUser(this.userId);
    const requestId = input.requestId.trim();
    if (!requestId) {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        'requestId is required.',
        'INVALID_ARGUMENT',
      );
    }
    const existingByRequest = await this.connection
      .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
      .findOne({ filter: { requestId } });
    if (existingByRequest) {
      return this.publicOperation(existingByRequest);
    }
    const creator = await this.identity.resolveCreator({
      asPrincipalUserId: input.asPrincipalUserId,
    });
    if ('denyReason' in creator) {
      throw new MeetingOaError(
        creator.denyReason as 'OA_MAPPING_MISSING' | 'OA_DELEGATION_DENIED',
        creator.denyReason === 'OA_DELEGATION_DENIED'
          ? 'Controlled OA delegation is not in effect for this caller.'
          : 'The signed-in user has no trusted OA employee mapping. The draft was not written to OA.',
        'FAILED_PRECONDITION',
        'NONE',
      );
    }
    const frozen = await this.drafts.freeze(meeting.id, creator);
    if (frozen.draft.version !== input.expectedDraftVersion) {
      throw new MeetingOaError(
        'OA_DRAFT_VERSION_CONFLICT',
        'The OA draft was changed by another request.',
        'ABORTED',
      );
    }
    const now = new Date();
    const operationId = randomUUID();
    try {
      await this.connection.transaction(async (trx) => {
        await trx
          .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
          .createOne({
            values: {
              id: operationId,
              meetingId: meeting.id,
              oaTarget: OA_TARGET,
              requestId,
              status: 'pending',
              draftVersion: frozen.draft.version,
              frozenPayload: frozen.payload as unknown as Record<
                string,
                unknown
              >,
              creatorUserId: creator.creatorUserId,
              creatorEmployeeNo: creator.creatorEmployeeNo,
              actorUserId: actor,
              denyReason: null,
              createdAt: now,
              updatedAt: now,
            },
          });
        for (const [index, stepKey] of STEP_KEYS.entries()) {
          await trx.repository<MeetingOaStep>(MEETING_OA_STEPS).createOne({
            values: {
              id: randomUUID(),
              operationId,
              stepKey,
              sequence: index + 1,
              status: 'pending',
              externalId: null,
              errorCode: null,
              sentAt: null,
              createdAt: now,
              updatedAt: now,
            },
          });
        }
        for (const task of frozen.payload.tasks) {
          await trx
            .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
            .createOne({
              values: {
                id: randomUUID(),
                operationId,
                clientTaskId: task.clientTaskId,
                status: 'pending',
                externalTaskId: null,
                errorCode: null,
                createdAt: now,
                updatedAt: now,
              },
            });
        }
        await trx.repository<MeetingOaOutbox>(MEETING_OA_OUTBOX).createOne({
          values: {
            id: randomUUID(),
            operationId,
            wakeStatus: 'pending',
            leaseVersion: 0,
            leaseUntil: null,
            leaseOwner: null,
            createdAt: now,
            updatedAt: now,
          },
        });
        await trx.repository('meetingAuditEvents').createOne({
          values: {
            id: randomUUID(),
            meetingId: meeting.id,
            operationId,
            action: 'OA_SYNC_INTENDED',
            actorUserId: actor,
            details: { requestId, oaTarget: OA_TARGET },
            createdAt: now,
          },
        });
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const replay = await this.connection
        .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
        .findOne({ filter: { requestId } });
      if (replay) return this.publicOperation(replay);
      const intent = await this.connection
        .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
        .findOne({ filter: { meetingId: meeting.id, oaTarget: OA_TARGET } });
      if (intent) {
        throw new MeetingOaError(
          'OA_INTENT_EXISTS',
          'This meeting already has a create intent for the OA target. A new requestId cannot open another.',
          'ALREADY_EXISTS',
        );
      }
      throw error;
    }
    await this.executor.drive(operationId);
    return this.get(operationId);
  }

  async resume(id: string): Promise<OperationPublic> {
    await requireMeetingAction(this.authz, 'oaResume');
    const row = await this.requireOperation(id);
    if (row.status === 'unknown' || row.status === 'partial') {
      throw new MeetingOaError(
        'OA_RECONCILE_REQUIRED',
        'UNKNOWN and PARTIAL operations are not resent. Record reconcile evidence first.',
        'FAILED_PRECONDITION',
      );
    }
    if (row.status === 'failed_confirmed') {
      const steps = await this.connection
        .repository<MeetingOaStep>(MEETING_OA_STEPS)
        .findMany({ filter: { operationId: id } });
      const now = new Date();
      for (const step of steps) {
        if (step.status === 'failed_confirmed') {
          await this.connection
            .repository<MeetingOaStep>(MEETING_OA_STEPS)
            .updateOne({
              filter: { id: step.id },
              values: {
                status: 'pending',
                errorCode: null,
                sentAt: null,
                updatedAt: now,
              },
            });
        }
      }
      await this.connection
        .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
        .updateOne({
          filter: { id },
          values: { status: 'pending', updatedAt: now },
        });
    } else if (row.status !== 'pending') {
      throw new MeetingOaError(
        'OA_STEP_NOT_RESUMABLE',
        'This OA operation cannot be resumed.',
        'FAILED_PRECONDITION',
      );
    }
    await this.executor.drive(id);
    return this.get(id);
  }

  async reconcile(
    id: string,
    input: {
      conclusion: MeetingOaReconcileRecord['conclusion'];
      evidence: string;
    },
  ): Promise<OperationPublic> {
    await requireMeetingAction(this.authz, 'oaReconcile');
    const row = await this.requireOperation(id);
    const evidence = input.evidence.trim();
    if (!evidence) {
      throw new MeetingOaError(
        'OA_DRAFT_INVALID',
        'Reconcile evidence is required and is not written to OA.',
        'INVALID_ARGUMENT',
      );
    }
    await this.connection
      .repository<MeetingOaReconcileRecord>(MEETING_OA_RECONCILE_RECORDS)
      .createOne({
        values: {
          id: randomUUID(),
          operationId: row.id,
          conclusion: input.conclusion,
          evidence,
          createdBy: requireUser(this.userId),
          createdAt: new Date(),
        },
      });
    return this.get(id);
  }

  async recover(id: string): Promise<OperationPublic> {
    await requireMeetingAction(this.authz, 'oaResume');
    await this.requireOperation(id);
    const latest = (
      await this.connection
        .repository<MeetingOaReconcileRecord>(MEETING_OA_RECONCILE_RECORDS)
        .findMany({
          filter: { operationId: id },
          sort: (sort) => sort.field('createdAt').desc(),
          limit: 1,
        })
    )[0];
    if (!latest || latest.conclusion !== 'not_sent') {
      throw new MeetingOaError(
        'OA_RECONCILE_REQUIRED',
        'Recovery keeps the frozen intent and only continues when reconcile evidence says the write was not sent.',
        'FAILED_PRECONDITION',
      );
    }
    const steps = await this.connection
      .repository<MeetingOaStep>(MEETING_OA_STEPS)
      .findMany({ filter: { operationId: id } });
    const now = new Date();
    for (const step of steps) {
      if (step.status === 'unknown' || step.status === 'in_flight') {
        await this.connection
          .repository<MeetingOaStep>(MEETING_OA_STEPS)
          .updateOne({
            filter: { id: step.id },
            values: {
              status: 'pending',
              errorCode: null,
              sentAt: null,
              updatedAt: now,
            },
          });
      }
    }
    const tasks = await this.connection
      .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
      .findMany({ filter: { operationId: id } });
    for (const task of tasks) {
      if (task.status === 'unknown') {
        await this.connection
          .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
          .updateOne({
            filter: { id: task.id },
            values: {
              status: 'pending',
              errorCode: null,
              updatedAt: now,
            },
          });
      }
    }
    await this.connection
      .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
      .updateOne({
        filter: { id },
        values: { status: 'pending', updatedAt: now },
      });
    await this.executor.drive(id);
    return this.get(id);
  }

  private async requireOperation(id: string): Promise<MeetingOaOperation> {
    const row = await this.connection
      .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
      .findOne({ filter: { id } });
    if (!row) {
      throw new MeetingOaError(
        'ACCESS_DENIED',
        'This OA operation is unavailable.',
        'PERMISSION_DENIED',
      );
    }
    await requireReadableMeeting(this.connection, this.authz, row.meetingId);
    return row;
  }

  private async publicOperation(
    row: MeetingOaOperation,
  ): Promise<OperationPublic> {
    const steps = await this.connection
      .repository<MeetingOaStep>(MEETING_OA_STEPS)
      .findMany({
        filter: { operationId: row.id },
        sort: (sort) => sort.field('sequence').asc(),
      });
    const tasks = await this.connection
      .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
      .findMany({ filter: { operationId: row.id } });
    return {
      id: row.id,
      meetingId: row.meetingId,
      oaTarget: row.oaTarget,
      requestId: row.requestId,
      status: row.status,
      draftVersion: row.draftVersion,
      creatorUserId: row.creatorUserId,
      creatorEmployeeNo: row.creatorEmployeeNo,
      actorUserId: row.actorUserId,
      denyReason: row.denyReason,
      steps: steps.map((step) => ({
        stepKey: step.stepKey,
        status: step.status === 'in_flight' ? 'unknown' : step.status,
        externalId: step.externalId,
        errorCode: step.errorCode,
      })),
      tasks: tasks.map((task) => ({
        clientTaskId: task.clientTaskId,
        status: task.status,
        externalTaskId: task.externalTaskId,
        errorCode: task.errorCode,
      })),
      writesOaOnGet: false,
      isolationAdapter: this.isolationAdapter,
      createdAt: toIso(row.createdAt) as string,
      updatedAt: toIso(row.updatedAt) as string,
    };
  }
}
