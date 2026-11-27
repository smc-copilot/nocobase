import type { MeetingOaSsoConfig } from '../../config/meeting-oa-sso.js';
import type { OaSsoValidator } from '../../meetings/oa/sso-validator.js';

export interface MeetingOaSsoUserRow {
  readonly id: string;
  readonly username: string | null;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly image: string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
  readonly disabledAt: Date | string | null;
  readonly deletedAt: Date | string | null;
  readonly kind: string | null;
}

export interface MeetingOaSsoRuntime {
  resolveConfig(): MeetingOaSsoConfig;
  resolveValidator(): OaSsoValidator | undefined;
  /**
   * Looks up users by normalized employee number.
   * Returns every non-deleted row whose username matches after normalization.
   */
  findUsersByEmployeeNo(
    employeeNo: string,
  ): Promise<readonly MeetingOaSsoUserRow[]>;
  /** Returns the Meeting username for a user id, or null when missing. */
  findUsernameByUserId(userId: string): Promise<string | null>;
  audit(event: {
    readonly result: string;
    readonly reason?: string;
    readonly userId?: string;
    readonly oaElapsedMs?: number;
  }): void;
}

const defaultConfig: MeetingOaSsoConfig = {
  enabled: false,
  cookieName: 'LtpaToken',
  timeoutMs: 10_000,
  validateMethod: 'GET',
};

let runtime: MeetingOaSsoRuntime = {
  resolveConfig: () => defaultConfig,
  resolveValidator: () => undefined,
  findUsersByEmployeeNo: async () => [],
  findUsernameByUserId: async () => null,
  audit: () => undefined,
};

export function bindMeetingOaSsoRuntime(next: MeetingOaSsoRuntime): void {
  runtime = next;
}

export function getMeetingOaSsoRuntime(): MeetingOaSsoRuntime {
  return runtime;
}

export function resetMeetingOaSsoRuntimeForTests(): void {
  runtime = {
    resolveConfig: () => defaultConfig,
    resolveValidator: () => undefined,
    findUsersByEmployeeNo: async () => [],
    findUsernameByUserId: async () => null,
    audit: () => undefined,
  };
}
