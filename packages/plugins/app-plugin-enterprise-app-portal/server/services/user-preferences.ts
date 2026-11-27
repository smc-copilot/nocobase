import { randomUUID } from 'node:crypto';

import type { DatabaseManager } from '@nocobase/db';

import { str, strOrNull, toDate } from './values.js';

import { AUTO_LAUNCH_MODES, type AutoLaunchMode } from '../config.js';
import { portalError } from '../errors.js';

export interface PortalUserPreferences {
  readonly userId: string;
  readonly autoLaunchMode: AutoLaunchMode;
  readonly defaultAppCode: string | null;
  readonly updatedAt: Date;
}

const DEFAULT_MODE: AutoLaunchMode = 'disabled';

function asMode(value: unknown): AutoLaunchMode {
  const text = str(value) || DEFAULT_MODE;
  if ((AUTO_LAUNCH_MODES as readonly string[]).includes(text)) {
    return text as AutoLaunchMode;
  }
  return DEFAULT_MODE;
}

function toRecord(row: Record<string, unknown>): PortalUserPreferences {
  return {
    userId: str(row.userId),
    autoLaunchMode: asMode(row.autoLaunchMode),
    defaultAppCode: strOrNull(row.defaultAppCode),
    updatedAt: toDate(row.updatedAt),
  };
}

export class UserPreferenceService {
  constructor(private readonly database: () => DatabaseManager) {}

  public async get(userId: string): Promise<PortalUserPreferences> {
    const row = await this.database()
      .connection()
      .query.selectFrom('enterprisePortalUserPreferences')
      .selectAll()
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (!row) {
      return {
        userId,
        autoLaunchMode: DEFAULT_MODE,
        defaultAppCode: null,
        updatedAt: new Date(0),
      };
    }
    return toRecord(row);
  }

  public async upsert(
    userId: string,
    patch: {
      readonly autoLaunchMode?: AutoLaunchMode;
      readonly defaultAppCode?: string | null;
    },
  ): Promise<PortalUserPreferences> {
    if (
      patch.autoLaunchMode &&
      !(AUTO_LAUNCH_MODES as readonly string[]).includes(patch.autoLaunchMode)
    ) {
      throw portalError(
        'INVALID_ARGUMENT',
        'INVALID_AUTO_LAUNCH_MODE',
        'autoLaunchMode must be disabled, if_single or default_if_valid.',
      );
    }
    const current = await this.get(userId);
    const next = {
      autoLaunchMode: patch.autoLaunchMode ?? current.autoLaunchMode,
      defaultAppCode:
        patch.defaultAppCode === undefined
          ? current.defaultAppCode
          : patch.defaultAppCode,
    };
    const now = new Date();
    const existing = await this.database()
      .connection()
      .query.selectFrom('enterprisePortalUserPreferences')
      .select('id')
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (existing) {
      await this.database()
        .connection()
        .query.updateTable('enterprisePortalUserPreferences')
        .set({ ...next, updatedAt: now })
        .where('userId', '=', userId)
        .execute();
    } else {
      await this.database()
        .connection()
        .query.insertInto('enterprisePortalUserPreferences')
        .values({
          id: randomUUID(),
          userId,
          ...next,
          updatedAt: now,
        })
        .execute();
    }
    return this.get(userId);
  }
}
