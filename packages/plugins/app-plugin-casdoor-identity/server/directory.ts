import type { CasdoorDirectoryConfig } from './config.js';
import type { IdentityProviderRecord } from './identity/model.js';

/** One user as the trusted directory reports it. */
export interface DirectoryUser {
  /** The stable subject, equal to the `sub` claim of that user's access tokens. */
  readonly subject: string;
  /** False when the directory says the account is forbidden, deleted or otherwise disabled. */
  readonly enabled: boolean;
  /** Verified attributes the admission policy and mapping rules read. */
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface DirectoryPage {
  readonly users: readonly DirectoryUser[];
  /** Opaque cursor for the next page; absent on the last page. */
  readonly nextCursor?: string;
}

/**
 * The source periodic sync reconciles against. Applications may register their own through
 * `identityDirectoryToken`; the Casdoor implementation below is the default when
 * `casdoorIdentity.directory` is configured.
 */
export interface IdentityDirectory {
  listUsers(
    provider: IdentityProviderRecord,
    input: { readonly cursor?: string; readonly pageSize: number },
  ): Promise<DirectoryPage>;
}

interface CasdoorUsersResponse {
  readonly status?: string;
  readonly msg?: string;
  readonly data?: readonly Record<string, unknown>[];
  readonly data2?: number;
}

/**
 * Reads users through Casdoor's `GET /api/get-users` with the application's client credentials.
 *
 * TODO(P1 evidence): verified against the documented API shape only; run the live Casdoor
 * acceptance step before relying on it in production. The cursor is the 1-based page number.
 */
export function createCasdoorDirectory(
  config: CasdoorDirectoryConfig,
  fetchImpl: typeof fetch = fetch,
): IdentityDirectory {
  return {
    async listUsers(_provider, { cursor, pageSize }) {
      const page = cursor ? Number.parseInt(cursor, 10) : 1;
      const url = new URL('/api/get-users', config.endpoint);
      url.searchParams.set('owner', config.organization);
      url.searchParams.set('p', String(page));
      url.searchParams.set('pageSize', String(pageSize));
      url.searchParams.set('clientId', config.clientId);
      url.searchParams.set('clientSecret', config.clientSecret);
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new DirectoryError(
          `Casdoor directory answered HTTP ${response.status}.`,
        );
      }
      const body = (await response.json()) as CasdoorUsersResponse;
      if (body.status && body.status !== 'ok') {
        throw new DirectoryError(
          `Casdoor directory error: ${body.msg ?? body.status}`,
        );
      }
      const rows = body.data ?? [];
      const users: DirectoryUser[] = [];
      for (const row of rows) {
        const subject = typeof row.id === 'string' ? row.id : undefined;
        if (!subject) continue;
        users.push({
          subject,
          enabled: row.isForbidden !== true && row.isDeleted !== true,
          attributes: row,
        });
      }
      const total = typeof body.data2 === 'number' ? body.data2 : undefined;
      const more =
        total !== undefined ? page * pageSize < total : rows.length >= pageSize;
      return {
        users,
        ...(more && rows.length > 0 ? { nextCursor: String(page + 1) } : {}),
      };
    },
  };
}

export class DirectoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectoryError';
  }
}
