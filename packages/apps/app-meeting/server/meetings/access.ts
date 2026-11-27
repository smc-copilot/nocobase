import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import { ApiError } from '@nocobase/app-server/router';
import type { DatabaseConnection } from '@nocobase/db';
import {
  MEETING_RESOURCE,
  MEETINGS,
  type Meeting,
  type MeetingOaAction,
} from './resources.js';

export function requireUser(userId: string | undefined): string {
  if (!userId) {
    throw new ApiError({
      status: 'UNAUTHENTICATED',
      reason: 'AUTH_REQUIRED',
      domain: 'meetings',
      message: 'Sign in to continue.',
    });
  }
  return userId;
}

export function meetingsForbidden(): ApiError {
  return new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'ACCESS_DENIED',
    domain: 'meetings',
    message: 'This meeting is unavailable.',
  });
}

export async function requireMeetingAction(
  authz: AuthorizationContext,
  action: MeetingOaAction,
): Promise<void> {
  const decision = await authz.authorize({
    resource: { type: 'composite', id: MEETING_RESOURCE },
    action,
  });
  if (decision.effect === 'deny') {
    throw new ApiError({
      status: 'PERMISSION_DENIED',
      reason: 'ACCESS_DENIED',
      domain: 'meetings',
      message: 'This meeting action is unavailable.',
    });
  }
}

export async function requireReadableMeeting(
  connection: DatabaseConnection,
  authz: AuthorizationContext,
  meetingId: string,
): Promise<Meeting> {
  await requireMeetingAction(authz, 'read');
  const decision = await authz.authorize({
    resource: { type: 'composite', id: MEETING_RESOURCE },
    action: 'read',
  });
  if (decision.effect === 'deny') throw meetingsForbidden();
  const policy = decision.conditions?.database?.[MEETINGS];
  const repository = policy?.read
    ? connection.repository<Meeting>(MEETINGS).withPolicy(policy)
    : connection.repository<Meeting>(MEETINGS);
  const row = await repository.findOne({ filter: { id: meetingId } });
  if (!row?.id) throw meetingsForbidden();
  return row as Meeting;
}

export function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function isRecordNotFound(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'RECORD_NOT_FOUND',
  );
}
