import { ApiClientError } from '@nocobase/app-client';

import type { OaPeopleSearchBy, OaPersonChip } from './oa-person.js';

/** Authorized App proxy to the OA people search URL. The browser never calls OA. */
export function createOaPeopleSearch(api: {
  request<TResponse>(options: {
    path: string;
    query?: Record<string, string>;
  }): Promise<TResponse>;
}) {
  return async (
    query: string,
    by: OaPeopleSearchBy = 'name',
  ): Promise<OaPersonChip[]> => {
    const result = await api.request<{ data: OaPersonChip[] }>({
      path: 'meetingOa/people',
      query: { q: query, by },
    });
    return result.data;
  };
}

export function isOaPeopleUnconfigured(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    return error.reason === 'OA_NOT_CONFIGURED';
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'reason' in error &&
    (error as { reason?: string }).reason === 'OA_NOT_CONFIGURED'
  );
}

export function isOaPeopleAmbiguous(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    return error.reason === 'INVALID_OA_QUERY';
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'reason' in error &&
    (error as { reason?: string }).reason === 'INVALID_OA_QUERY'
  );
}
