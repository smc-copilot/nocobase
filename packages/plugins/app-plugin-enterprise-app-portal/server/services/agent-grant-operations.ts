import { randomUUID } from 'node:crypto';

import type { DatabaseManager } from '@nocobase/db';

import {
  AGENT_GRANT_TERMINAL_STATUSES,
  type AgentGrantExpertItemStatus,
  type AgentGrantOperationMode,
  type AgentGrantStatus,
} from '../config.js';
import { portalError } from '../errors.js';
import { str, strOrNull, toBool, toDate } from './values.js';

export interface AgentGrantOperationRecord {
  readonly id: string;
  readonly appCode: string;
  readonly casdoorUserId: string;
  readonly username: string;
  readonly actorUserId: string;
  readonly status: AgentGrantStatus;
  readonly operationMode: AgentGrantOperationMode | null;
  readonly selectedExpertCount: number;
  readonly completedExpertCount: number;
  readonly failedExpertCount: number;
  readonly skippedExpertCount: number;
  readonly expertTemplateId: string | null;
  readonly createOptionsSnapshot: Readonly<Record<string, unknown>>;
  readonly octopUserId: string | null;
  readonly agentId: string | null;
  readonly bootstrapStatus: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly lockKey: string | null;
  readonly startedAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
}

export interface AgentGrantExpertItemRecord {
  readonly id: string;
  readonly operationId: string;
  readonly expertTemplateId: string;
  readonly expertName: string;
  readonly status: AgentGrantExpertItemStatus;
  readonly agentId: string | null;
  readonly bootstrapPending: boolean | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
}

export interface AgentGrantOperationDraft {
  readonly appCode: string;
  readonly casdoorUserId: string;
  readonly username: string;
  readonly actorUserId: string;
  readonly operationMode?: AgentGrantOperationMode | null;
  readonly selectedExpertCount?: number;
  readonly expertTemplateId?: string | null;
  readonly createOptionsSnapshot: unknown;
}

export interface AgentGrantOperationPatch {
  readonly status?: AgentGrantStatus;
  readonly operationMode?: AgentGrantOperationMode | null;
  readonly selectedExpertCount?: number;
  readonly completedExpertCount?: number;
  readonly failedExpertCount?: number;
  readonly skippedExpertCount?: number;
  readonly expertTemplateId?: string | null;
  readonly createOptionsSnapshot?: unknown;
  readonly octopUserId?: string | null;
  readonly agentId?: string | null;
  readonly bootstrapStatus?: string | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
}

export interface AgentGrantExpertItemDraft {
  readonly operationId: string;
  readonly expertTemplateId: string;
  readonly expertName: string;
  readonly status?: AgentGrantExpertItemStatus;
}

export interface AgentGrantExpertItemPatch {
  readonly status?: AgentGrantExpertItemStatus;
  readonly expertName?: string;
  readonly agentId?: string | null;
  readonly bootstrapPending?: boolean | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly startedAt?: Date | null;
  readonly completedAt?: Date | null;
}

const TERMINAL = new Set<string>(AGENT_GRANT_TERMINAL_STATUSES);

export function agentGrantLockKey(
  appCode: string,
  casdoorUserId: string,
): string {
  return `${appCode}:${casdoorUserId}`;
}

export function isTerminalAgentGrantStatus(status: string): boolean {
  return TERMINAL.has(status);
}

/**
 * Drops password, token, and secret fields before an operation snapshot is stored.
 * `token_quota` is a quota number and is kept.
 */
export function sanitizeCreateOptionsSnapshot(
  value: unknown,
): Record<string, unknown> {
  const stripped = stripSecrets(value);
  if (!stripped || typeof stripped !== 'object' || Array.isArray(stripped)) {
    return {};
  }
  return stripped as Record<string, unknown>;
}

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => stripSecrets(entry));
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSecretKey(key)) continue;
    result[key] = stripSecrets(child);
  }
  return result;
}

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, '');
  if (normalized === 'tokenquota') return false;
  return (
    normalized === 'password' ||
    normalized.endsWith('password') ||
    normalized === 'confirmpassword' ||
    normalized === 'secret' ||
    normalized.endsWith('secret') ||
    normalized === 'token' ||
    normalized.endsWith('accesstoken') ||
    normalized.endsWith('refreshtoken') ||
    normalized.endsWith('apitoken') ||
    normalized.endsWith('authtoken') ||
    normalized === 'authorization' ||
    normalized.endsWith('authorization') ||
    normalized === 'clientsecret'
  );
}

function toInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toRecord(row: Record<string, unknown>): AgentGrantOperationRecord {
  return {
    id: str(row.id),
    appCode: str(row.appCode),
    casdoorUserId: str(row.casdoorUserId),
    username: str(row.username),
    actorUserId: str(row.actorUserId),
    status: str(row.status) as AgentGrantStatus,
    operationMode: strOrNull(
      row.operationMode,
    ) as AgentGrantOperationMode | null,
    selectedExpertCount: toInt(row.selectedExpertCount),
    completedExpertCount: toInt(row.completedExpertCount),
    failedExpertCount: toInt(row.failedExpertCount),
    skippedExpertCount: toInt(row.skippedExpertCount),
    expertTemplateId: strOrNull(row.expertTemplateId),
    createOptionsSnapshot: parseSnapshot(row.createOptionsSnapshot),
    octopUserId: strOrNull(row.octopUserId),
    agentId: strOrNull(row.agentId),
    bootstrapStatus: strOrNull(row.bootstrapStatus),
    errorCode: strOrNull(row.errorCode),
    errorMessage: strOrNull(row.errorMessage),
    lockKey: strOrNull(row.lockKey),
    startedAt: toDate(row.startedAt),
    updatedAt: toDate(row.updatedAt),
    completedAt: row.completedAt == null ? null : toDate(row.completedAt),
  };
}

function toExpertItem(
  row: Record<string, unknown>,
): AgentGrantExpertItemRecord {
  return {
    id: str(row.id),
    operationId: str(row.operationId),
    expertTemplateId: str(row.expertTemplateId),
    expertName: str(row.expertName),
    status: str(row.status) as AgentGrantExpertItemStatus,
    agentId: strOrNull(row.agentId),
    bootstrapPending:
      row.bootstrapPending == null ? null : toBool(row.bootstrapPending),
    errorCode: strOrNull(row.errorCode),
    errorMessage: strOrNull(row.errorMessage),
    startedAt: row.startedAt == null ? null : toDate(row.startedAt),
    completedAt: row.completedAt == null ? null : toDate(row.completedAt),
  };
}

function parseSnapshot(value: unknown): Record<string, unknown> {
  if (typeof value === 'string' && value.length > 0) {
    try {
      return sanitizeCreateOptionsSnapshot(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return sanitizeCreateOptionsSnapshot(value);
}

function isUniqueViolation(error: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    parts.push(current.message);
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') parts.push(code);
    current = current.cause;
  }
  return /unique|duplicate key/iu.test(parts.join(' '));
}

export class AgentGrantOperationStore {
  public constructor(private readonly database: () => DatabaseManager) {}

  public async getById(
    id: string,
  ): Promise<AgentGrantOperationRecord | undefined> {
    const row = await this.database()
      .connection()
      .query.selectFrom('enterprisePortalAgentGrantOperations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRecord(row) : undefined;
  }

  public async requireById(id: string): Promise<AgentGrantOperationRecord> {
    const record = await this.getById(id);
    if (!record) {
      throw portalError(
        'NOT_FOUND',
        'AGENT_GRANT_OPERATION_NOT_FOUND',
        'Unknown agent grant operation.',
      );
    }
    return record;
  }

  /**
   * Inserts a PREFLIGHTING row and takes `appCode:casdoorUserId`.
   * A unique violation means another operation still holds the lock.
   * Nothing is sent to Octop when this throws.
   */
  public async acquire(
    draft: AgentGrantOperationDraft,
    now: Date = new Date(),
  ): Promise<AgentGrantOperationRecord> {
    const id = randomUUID();
    const snapshot = sanitizeCreateOptionsSnapshot(draft.createOptionsSnapshot);
    try {
      await this.database()
        .connection()
        .query.insertInto('enterprisePortalAgentGrantOperations')
        .values({
          id,
          appCode: draft.appCode,
          casdoorUserId: draft.casdoorUserId,
          username: draft.username,
          actorUserId: draft.actorUserId,
          status: 'PREFLIGHTING',
          operationMode: draft.operationMode ?? null,
          selectedExpertCount: draft.selectedExpertCount ?? 0,
          completedExpertCount: 0,
          failedExpertCount: 0,
          skippedExpertCount: 0,
          expertTemplateId: draft.expertTemplateId ?? null,
          createOptionsSnapshot: JSON.stringify(snapshot),
          octopUserId: null,
          agentId: null,
          bootstrapStatus: null,
          errorCode: null,
          errorMessage: null,
          lockKey: agentGrantLockKey(draft.appCode, draft.casdoorUserId),
          startedAt: now,
          updatedAt: now,
          completedAt: null,
        })
        .execute();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw portalError(
          'ABORTED',
          'AGENT_GRANT_OPERATION_IN_PROGRESS',
          'An agent grant operation is already in progress for this employee.',
        );
      }
      throw portalError(
        'UNAVAILABLE',
        'AGENT_GRANT_OPERATION_PERSIST_FAILED',
        'The agent grant operation could not be stored. No Octop user was created.',
      );
    }
    return this.requireById(id);
  }

  public async transition(
    id: string,
    patch: AgentGrantOperationPatch,
    now: Date = new Date(),
  ): Promise<AgentGrantOperationRecord> {
    const current = await this.requireById(id);
    const status = patch.status ?? current.status;
    const terminal = isTerminalAgentGrantStatus(status);
    const snapshot =
      patch.createOptionsSnapshot === undefined
        ? undefined
        : JSON.stringify(
            sanitizeCreateOptionsSnapshot(patch.createOptionsSnapshot),
          );
    await this.database()
      .connection()
      .query.updateTable('enterprisePortalAgentGrantOperations')
      .set({
        status,
        operationMode:
          patch.operationMode === undefined
            ? current.operationMode
            : patch.operationMode,
        selectedExpertCount:
          patch.selectedExpertCount === undefined
            ? current.selectedExpertCount
            : patch.selectedExpertCount,
        completedExpertCount:
          patch.completedExpertCount === undefined
            ? current.completedExpertCount
            : patch.completedExpertCount,
        failedExpertCount:
          patch.failedExpertCount === undefined
            ? current.failedExpertCount
            : patch.failedExpertCount,
        skippedExpertCount:
          patch.skippedExpertCount === undefined
            ? current.skippedExpertCount
            : patch.skippedExpertCount,
        expertTemplateId:
          patch.expertTemplateId === undefined
            ? current.expertTemplateId
            : patch.expertTemplateId,
        ...(snapshot === undefined ? {} : { createOptionsSnapshot: snapshot }),
        octopUserId:
          patch.octopUserId === undefined
            ? current.octopUserId
            : patch.octopUserId,
        agentId: patch.agentId === undefined ? current.agentId : patch.agentId,
        bootstrapStatus:
          patch.bootstrapStatus === undefined
            ? current.bootstrapStatus
            : patch.bootstrapStatus,
        errorCode:
          patch.errorCode === undefined ? current.errorCode : patch.errorCode,
        errorMessage:
          patch.errorMessage === undefined
            ? current.errorMessage
            : patch.errorMessage,
        lockKey: terminal ? null : current.lockKey,
        updatedAt: now,
        completedAt: terminal ? now : current.completedAt,
      })
      .where('id', '=', id)
      .execute();
    return this.requireById(id);
  }

  public async listExpertItems(
    operationId: string,
  ): Promise<readonly AgentGrantExpertItemRecord[]> {
    const rows = await this.database()
      .connection()
      .query.selectFrom('enterprisePortalAgentGrantExpertItems')
      .selectAll()
      .where('operationId', '=', operationId)
      .execute();
    return rows.map((row) => toExpertItem(row));
  }

  public async createExpertItem(
    draft: AgentGrantExpertItemDraft,
  ): Promise<AgentGrantExpertItemRecord> {
    const id = randomUUID();
    await this.database()
      .connection()
      .query.insertInto('enterprisePortalAgentGrantExpertItems')
      .values({
        id,
        operationId: draft.operationId,
        expertTemplateId: draft.expertTemplateId,
        expertName: draft.expertName,
        status: draft.status ?? 'PENDING',
        agentId: null,
        bootstrapPending: null,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      })
      .execute();
    return this.requireExpertItem(id);
  }

  public async requireExpertItem(
    id: string,
  ): Promise<AgentGrantExpertItemRecord> {
    const row = await this.database()
      .connection()
      .query.selectFrom('enterprisePortalAgentGrantExpertItems')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw portalError(
        'NOT_FOUND',
        'AGENT_GRANT_EXPERT_ITEM_NOT_FOUND',
        'Unknown agent grant expert item.',
      );
    }
    return toExpertItem(row);
  }

  public async updateExpertItem(
    id: string,
    patch: AgentGrantExpertItemPatch,
  ): Promise<AgentGrantExpertItemRecord> {
    const current = await this.requireExpertItem(id);
    await this.database()
      .connection()
      .query.updateTable('enterprisePortalAgentGrantExpertItems')
      .set({
        status: patch.status ?? current.status,
        expertName: patch.expertName ?? current.expertName,
        agentId: patch.agentId === undefined ? current.agentId : patch.agentId,
        bootstrapPending:
          patch.bootstrapPending === undefined
            ? current.bootstrapPending
            : patch.bootstrapPending,
        errorCode:
          patch.errorCode === undefined ? current.errorCode : patch.errorCode,
        errorMessage:
          patch.errorMessage === undefined
            ? current.errorMessage
            : patch.errorMessage,
        startedAt:
          patch.startedAt === undefined ? current.startedAt : patch.startedAt,
        completedAt:
          patch.completedAt === undefined
            ? current.completedAt
            : patch.completedAt,
      })
      .where('id', '=', id)
      .execute();
    return this.requireExpertItem(id);
  }
}
