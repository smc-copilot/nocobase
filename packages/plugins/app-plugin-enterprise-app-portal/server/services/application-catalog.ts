import { randomUUID } from 'node:crypto';

import type { DatabaseManager } from '@nocobase/db';

import type { PortalAppType } from '../config.js';
import { APP_TYPES } from '../config.js';
import { portalError } from '../errors.js';
import {
  assertPublicHttpsUrl,
  composeLaunchUrl,
  parseRelativeTargetPath,
  type DnsLookup,
} from './url-guard.js';
import type { AccessAuditLog } from './access-audit.js';
import { str, strOrNull, toBool, toDate } from './values.js';

export interface PortalApplicationInput {
  readonly appCode: string;
  readonly name: string;
  readonly appType: PortalAppType;
  readonly businessCenter?: string | null;
  readonly description?: string | null;
  readonly icon?: string | null;
  readonly baseUrl: string;
  readonly targetPath?: string;
  readonly healthUrl?: string | null;
  readonly casdoorAppKey?: string | null;
  readonly enabled?: boolean;
  readonly sortOrder?: number;
}

export type PortalApplicationPatch = Partial<
  Omit<PortalApplicationInput, 'appCode'>
>;

export interface PortalApplicationRecord {
  readonly id: string;
  readonly appCode: string;
  readonly name: string;
  readonly appType: PortalAppType;
  readonly businessCenter: string | null;
  readonly description: string | null;
  readonly icon: string | null;
  readonly baseUrl: string;
  readonly targetPath: string;
  readonly healthUrl: string | null;
  readonly casdoorAppKey: string | null;
  readonly enabled: boolean;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function asType(value: unknown): PortalAppType {
  const text = String(value);
  if ((APP_TYPES as readonly string[]).includes(text)) {
    return text as PortalAppType;
  }
  return 'https';
}

function toRecord(row: Record<string, unknown>): PortalApplicationRecord {
  return {
    id: str(row.id),
    appCode: str(row.appCode),
    name: str(row.name),
    appType: asType(row.appType),
    businessCenter: strOrNull(row.businessCenter),
    description: strOrNull(row.description),
    icon: strOrNull(row.icon),
    baseUrl: str(row.baseUrl),
    targetPath: str(row.targetPath) || '/',
    healthUrl: strOrNull(row.healthUrl),
    casdoorAppKey: strOrNull(row.casdoorAppKey),
    enabled: toBool(row.enabled),
    sortOrder: Number(row.sortOrder ?? 0),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
  };
}

export class ApplicationCatalogService {
  constructor(
    private readonly database: () => DatabaseManager,
    private readonly allowlist: () => readonly string[],
    private readonly audit: AccessAuditLog,
    private readonly lookup: DnsLookup | undefined = undefined,
  ) {}

  public async list(): Promise<readonly PortalApplicationRecord[]> {
    const rows = await this.database()
      .connection()
      .query.selectFrom('enterprisePortalApplications')
      .selectAll()
      .orderBy('sortOrder', 'asc')
      .orderBy('appCode', 'asc')
      .execute();
    return rows.map((row: Record<string, unknown>) => toRecord(row));
  }

  public async getByCode(
    appCode: string,
  ): Promise<PortalApplicationRecord | undefined> {
    const row = await this.database()
      .connection()
      .query.selectFrom('enterprisePortalApplications')
      .selectAll()
      .where('appCode', '=', appCode)
      .executeTakeFirst();
    return row ? toRecord(row) : undefined;
  }

  public async requireByCode(
    appCode: string,
  ): Promise<PortalApplicationRecord> {
    const record = await this.getByCode(appCode);
    if (!record) {
      throw portalError('NOT_FOUND', 'APP_NOT_FOUND', 'Unknown application.');
    }
    return record;
  }

  public launchUrlOf(record: PortalApplicationRecord): string {
    return composeLaunchUrl(record.baseUrl, record.targetPath);
  }

  public async create(
    input: PortalApplicationInput,
    actorId: string | null,
  ): Promise<PortalApplicationRecord> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(input.appCode)) {
      throw portalError(
        'INVALID_ARGUMENT',
        'INVALID_APP_CODE',
        'appCode must start with a letter or digit.',
      );
    }
    if (input.appCode === 'admin') {
      throw portalError(
        'INVALID_ARGUMENT',
        'RESERVED_APP_CODE',
        'appCode "admin" is reserved.',
      );
    }
    await this.validateUrls(input);
    if (await this.getByCode(input.appCode)) {
      throw portalError(
        'ALREADY_EXISTS',
        'APP_CODE_EXISTS',
        'appCode must be unique.',
      );
    }
    const now = new Date();
    const id = randomUUID();
    await this.database()
      .connection()
      .query.insertInto('enterprisePortalApplications')
      .values({
        id,
        appCode: input.appCode,
        name: input.name,
        appType: input.appType,
        businessCenter: input.businessCenter ?? null,
        description: input.description ?? null,
        icon: input.icon ?? null,
        baseUrl: new URL(input.baseUrl).toString(),
        targetPath: parseRelativeTargetPath(input.targetPath),
        healthUrl: input.healthUrl ? new URL(input.healthUrl).toString() : null,
        casdoorAppKey: input.casdoorAppKey ?? null,
        enabled: input.enabled ?? true,
        sortOrder: input.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await this.audit.record({
      actorUserId: actorId,
      appCode: input.appCode,
      action: 'catalog.create',
      result: 'success',
    });
    return (await this.getByCode(input.appCode))!;
  }

  public async update(
    appCode: string,
    patch: PortalApplicationPatch,
    actorId: string | null,
  ): Promise<PortalApplicationRecord> {
    const current = await this.requireByCode(appCode);
    const next = {
      ...current,
      ...patch,
      baseUrl: patch.baseUrl ?? current.baseUrl,
      targetPath: patch.targetPath ?? current.targetPath,
      healthUrl:
        patch.healthUrl === undefined ? current.healthUrl : patch.healthUrl,
    };
    await this.validateUrls(next);
    await this.database()
      .connection()
      .query.updateTable('enterprisePortalApplications')
      .set({
        name: next.name,
        appType: next.appType,
        businessCenter: next.businessCenter,
        description: next.description,
        icon: next.icon,
        baseUrl: new URL(next.baseUrl).toString(),
        targetPath: parseRelativeTargetPath(next.targetPath),
        healthUrl: next.healthUrl ? new URL(next.healthUrl).toString() : null,
        casdoorAppKey: next.casdoorAppKey,
        enabled: next.enabled,
        sortOrder: next.sortOrder,
        updatedAt: new Date(),
      })
      .where('appCode', '=', appCode)
      .execute();
    await this.audit.record({
      actorUserId: actorId,
      appCode,
      action: 'catalog.update',
      result: 'success',
    });
    return (await this.getByCode(appCode))!;
  }

  private async validateUrls(input: {
    readonly baseUrl: string;
    readonly targetPath?: string;
    readonly healthUrl?: string | null;
  }): Promise<void> {
    parseRelativeTargetPath(input.targetPath);
    await assertPublicHttpsUrl(input.baseUrl, this.allowlist(), this.lookup);
    if (input.healthUrl) {
      await assertPublicHttpsUrl(
        input.healthUrl,
        this.allowlist(),
        this.lookup,
      );
    }
  }
}
