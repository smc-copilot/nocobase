import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@nocobase/db';
import { isRecordNotFound } from '../access.js';
import {
  MEETING_OA_OPERATIONS,
  MEETING_OA_OUTBOX,
  MEETING_OA_STEPS,
  MEETING_OA_TASK_RESULTS,
  type MeetingOaOperation,
  type MeetingOaOutbox,
  type MeetingOaStep,
  type MeetingOaTaskResult,
  type OaOperationStatus,
} from '../resources.js';
import type { FrozenOaPayload, MeetingOaAdapter } from './adapter.js';
import { MeetingOaError } from './errors.js';
import { parseJsonField } from '../minutes.js';

const LEASE_MS = 30_000;

export class MeetingOaExecutor {
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly adapter: MeetingOaAdapter,
  ) {}

  async drive(operationId: string): Promise<void> {
    const owner = randomUUID();
    const leased = await this.acquire(operationId, owner);
    if (!leased) return;
    try {
      await this.run(operationId);
    } finally {
      await this.release(operationId, owner);
    }
  }

  private async run(operationId: string): Promise<void> {
    const operation = await this.connection
      .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
      .findOne({ filter: { id: operationId } });
    if (!operation) return;
    const payload = parseJsonField<FrozenOaPayload>(operation.frozenPayload);
    if (!payload) return;
    let token;
    try {
      token = await this.adapter.getToken(operation.creatorEmployeeNo);
    } catch (error) {
      await this.failStep(
        operationId,
        'createMeeting',
        error,
        operation.status,
      );
      return;
    }
    const create = await this.step(operationId, 'createMeeting');
    if (create && create.status === 'pending') {
      await this.markInFlight(create);
      try {
        const result = await this.adapter.createMeeting(token, payload);
        await this.succeedStep(create, result.externalMeetingId);
      } catch (error) {
        await this.failStep(
          operationId,
          'createMeeting',
          error,
          operation.status,
        );
        return;
      }
    }
    const createNow = await this.step(operationId, 'createMeeting');
    if (!createNow?.externalId || createNow.status !== 'succeeded') {
      await this.refreshStatus(operationId);
      return;
    }
    const upload = await this.step(operationId, 'uploadSummary');
    if (upload && upload.status === 'pending') {
      await this.markInFlight(upload);
      try {
        const uploaded = await this.adapter.uploadSummary(
          token,
          payload,
          createNow.externalId,
        );
        await this.succeedStep(upload, uploaded.externalSummaryId);
      } catch (error) {
        await this.failStep(
          operationId,
          'uploadSummary',
          error,
          operation.status,
        );
        return;
      }
    }
    const uploadNow = await this.step(operationId, 'uploadSummary');
    if (uploadNow?.status !== 'succeeded') {
      await this.refreshStatus(operationId);
      return;
    }
    const tasks = await this.step(operationId, 'createTaskByMeeting');
    if (tasks && tasks.status === 'pending') {
      const open = await this.openTasks(operationId);
      const sendPayload = {
        ...payload,
        tasks: payload.tasks.filter((task) =>
          open.some((row) => row.clientTaskId === task.clientTaskId),
        ),
      };
      await this.markInFlight(tasks);
      try {
        const results =
          sendPayload.tasks.length === 0
            ? []
            : await this.adapter.createTaskByMeeting(
                token,
                sendPayload,
                createNow.externalId,
              );
        const now = new Date();
        const known = new Set(
          (await this.openTasks(operationId)).map((row) => row.clientTaskId),
        );
        for (const result of results) {
          if (!known.has(result.clientTaskId)) continue;
          const row = await this.connection
            .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
            .findOne({
              filter: {
                operationId,
                clientTaskId: result.clientTaskId,
              },
            });
          if (!row || row.status === 'succeeded') continue;
          await this.connection
            .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
            .updateOne({
              filter: { id: row.id },
              values: {
                status: result.status,
                externalTaskId: result.externalTaskId,
                errorCode: result.errorCode,
                updatedAt: now,
              },
            });
        }
        await this.markPendingTasks(operationId, 'unknown', 'OA_LOST_RESPONSE');
        const remaining = await this.connection
          .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
          .findMany({ filter: { operationId } });
        const hasUnknown = remaining.some((row) => row.status === 'unknown');
        const hasFailed = remaining.some(
          (row) => row.status === 'failed_confirmed',
        );
        const allSucceeded =
          remaining.length === 0 ||
          remaining.every((row) => row.status === 'succeeded');
        await this.connection
          .repository<MeetingOaStep>(MEETING_OA_STEPS)
          .updateOne({
            filter: { id: tasks.id },
            values: {
              status: allSucceeded
                ? 'succeeded'
                : hasUnknown
                  ? 'unknown'
                  : hasFailed
                    ? 'failed_confirmed'
                    : 'succeeded',
              errorCode: allSucceeded ? null : 'PARTIAL_TASKS',
              updatedAt: now,
            },
          });
      } catch (error) {
        await this.failStep(
          operationId,
          'createTaskByMeeting',
          error,
          operation.status,
        );
        return;
      }
    }
    await this.refreshStatus(operationId);
  }

  private async refreshStatus(operationId: string): Promise<void> {
    const steps = await this.connection
      .repository<MeetingOaStep>(MEETING_OA_STEPS)
      .findMany({ filter: { operationId } });
    const tasks = await this.connection
      .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
      .findMany({ filter: { operationId } });
    let status: OaOperationStatus = 'succeeded';
    if (
      steps.some(
        (step) => step.status === 'unknown' || step.status === 'in_flight',
      )
    ) {
      status = 'unknown';
    } else if (tasks.some((task) => task.status === 'unknown')) {
      status = 'unknown';
    } else if (
      tasks.some((task) => task.status === 'succeeded') &&
      tasks.some(
        (task) =>
          task.status === 'failed_confirmed' || task.status === 'pending',
      )
    ) {
      status = 'partial';
    } else if (steps.some((step) => step.status === 'failed_confirmed')) {
      status = 'failed_confirmed';
    } else if (steps.some((step) => step.status === 'pending')) {
      status = 'pending';
    }
    await this.connection
      .repository<MeetingOaOperation>(MEETING_OA_OPERATIONS)
      .updateOne({
        filter: { id: operationId },
        values: { status, updatedAt: new Date() },
      });
  }

  private async step(
    operationId: string,
    stepKey: string,
  ): Promise<MeetingOaStep | undefined> {
    return this.connection
      .repository<MeetingOaStep>(MEETING_OA_STEPS)
      .findOne({ filter: { operationId, stepKey } });
  }

  private async markInFlight(step: MeetingOaStep): Promise<void> {
    await this.connection
      .repository<MeetingOaStep>(MEETING_OA_STEPS)
      .updateOne({
        filter: { id: step.id, status: 'pending' },
        values: {
          status: 'in_flight',
          sentAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  private async succeedStep(
    step: MeetingOaStep,
    externalId: string,
  ): Promise<void> {
    await this.connection
      .repository<MeetingOaStep>(MEETING_OA_STEPS)
      .updateOne({
        filter: { id: step.id },
        values: {
          status: 'succeeded',
          externalId,
          errorCode: null,
          updatedAt: new Date(),
        },
      });
  }

  private async failStep(
    operationId: string,
    stepKey: string,
    error: unknown,
    _current: OaOperationStatus,
  ): Promise<void> {
    const step = await this.step(operationId, stepKey);
    if (!step) return;
    const oaError =
      error instanceof MeetingOaError
        ? error
        : new MeetingOaError(
            'OA_UNKNOWN',
            'The OA adapter failed before a confirmed result.',
            'UNAVAILABLE',
            'UNKNOWN',
          );
    const status =
      oaError.writeOutcome === 'NONE'
        ? 'failed_confirmed'
        : oaError.writeOutcome === 'CONFIRMED_FAILURE'
          ? 'failed_confirmed'
          : 'unknown';
    const clue =
      stepKey === 'createMeeting'
        ? oaError.details.externalMeetingId
        : stepKey === 'uploadSummary'
          ? oaError.details.externalSummaryId
          : null;
    await this.connection
      .repository<MeetingOaStep>(MEETING_OA_STEPS)
      .updateOne({
        filter: { id: step.id },
        values: {
          status,
          errorCode: oaError.reason,
          ...(clue ? { externalId: clue } : {}),
          updatedAt: new Date(),
        },
      });
    if (stepKey === 'createTaskByMeeting' && oaError.details.tasks?.length) {
      const now = new Date();
      for (const item of oaError.details.tasks) {
        if (!item.clientTaskId || !item.taskId) continue;
        const row = await this.connection
          .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
          .findOne({
            filter: { operationId, clientTaskId: item.clientTaskId },
          });
        if (!row || row.status === 'succeeded') continue;
        await this.connection
          .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
          .updateOne({
            filter: { id: row.id },
            values: {
              status: 'unknown',
              externalTaskId: item.taskId,
              errorCode: oaError.reason,
              updatedAt: now,
            },
          });
      }
    }
    if (stepKey === 'createTaskByMeeting' && status === 'unknown') {
      await this.markPendingTasks(operationId, 'unknown', oaError.reason);
    }
    await this.refreshStatus(operationId);
  }

  private async openTasks(operationId: string): Promise<MeetingOaTaskResult[]> {
    const rows = await this.connection
      .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
      .findMany({ filter: { operationId } });
    return rows.filter(
      (row) => row.status === 'pending' || row.status === 'unknown',
    );
  }

  private async markPendingTasks(
    operationId: string,
    status: MeetingOaTaskResult['status'],
    errorCode: string,
  ): Promise<void> {
    const now = new Date();
    const rows = await this.connection
      .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
      .findMany({ filter: { operationId } });
    for (const row of rows) {
      if (row.status !== 'pending') continue;
      await this.connection
        .repository<MeetingOaTaskResult>(MEETING_OA_TASK_RESULTS)
        .updateOne({
          filter: { id: row.id },
          values: { status, errorCode, updatedAt: now },
        });
    }
  }

  private async acquire(
    operationId: string,
    owner: string,
  ): Promise<MeetingOaOutbox | undefined> {
    const outbox = await this.connection
      .repository<MeetingOaOutbox>(MEETING_OA_OUTBOX)
      .findOne({ filter: { operationId } });
    if (!outbox) return undefined;
    const now = Date.now();
    const leaseUntil = outbox.leaseUntil
      ? new Date(outbox.leaseUntil).getTime()
      : 0;
    if (outbox.leaseOwner && leaseUntil > now && outbox.leaseOwner !== owner) {
      return undefined;
    }
    try {
      await this.connection
        .repository<MeetingOaOutbox>(MEETING_OA_OUTBOX)
        .updateOne({
          filter: { id: outbox.id, leaseVersion: outbox.leaseVersion },
          values: {
            leaseVersion: outbox.leaseVersion + 1,
            leaseOwner: owner,
            leaseUntil: new Date(now + LEASE_MS),
            wakeStatus: 'idle',
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      if (isRecordNotFound(error)) return undefined;
      throw error;
    }
    return this.connection
      .repository<MeetingOaOutbox>(MEETING_OA_OUTBOX)
      .findOne({ filter: { operationId } });
  }

  private async release(operationId: string, owner: string): Promise<void> {
    const outbox = await this.connection
      .repository<MeetingOaOutbox>(MEETING_OA_OUTBOX)
      .findOne({ filter: { operationId } });
    if (!outbox || outbox.leaseOwner !== owner) return;
    try {
      await this.connection
        .repository<MeetingOaOutbox>(MEETING_OA_OUTBOX)
        .updateOne({
          filter: { id: outbox.id, leaseVersion: outbox.leaseVersion },
          values: {
            leaseOwner: null,
            leaseUntil: null,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      if (isRecordNotFound(error)) return;
      throw error;
    }
  }
}
