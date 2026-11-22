import type { PortalAppType } from '../config.js';
import { OCTOP_API_AUTH_MODES, type OctopApiAuthMode } from '../config.js';
import { portalError } from '../errors.js';
import type { PortalApplicationRecord } from './application-catalog.js';
import type { OctopClientAuth } from './octop-management-client.js';
import {
  assertOctopApiBaseUrl,
  formatOctopApiBaseUrl,
  type OctopUrlGuardOptions,
} from './octop-url-guard.js';

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u;

export interface ResolvedOctopConnection {
  readonly baseUrl: string;
  readonly auth: OctopClientAuth;
  readonly authMode: OctopApiAuthMode;
}

export interface OctopInstanceFields {
  readonly agentGrantsEnabled?: boolean;
  readonly apiBaseUrl?: string | null;
  readonly apiAuthMode?: OctopApiAuthMode | null;
  readonly apiTokenEnv?: string | null;
  readonly apiUsernameEnv?: string | null;
  readonly apiPasswordEnv?: string | null;
}

/**
 * Resolves one Octop management connection from catalog field names and
 * process environment values. Secret values are not returned except inside
 * the in-memory auth object the client uses for the next request.
 */
export async function resolveOctopInstance(
  app: PortalApplicationRecord,
  env: Readonly<Record<string, string | undefined>>,
  allowlist: readonly string[],
  options: OctopUrlGuardOptions = {},
): Promise<ResolvedOctopConnection> {
  assertGrantApplication(app);
  if (!app.apiBaseUrl || !app.apiAuthMode) {
    throw portalError(
      'FAILED_PRECONDITION',
      'OCTOP_API_NOT_CONFIGURED',
      'This Octop application has no management API URL or auth mode.',
    );
  }
  if (!isAuthMode(app.apiAuthMode)) {
    throw portalError(
      'FAILED_PRECONDITION',
      'OCTOP_API_NOT_CONFIGURED',
      'The Octop API auth mode is not a supported mode.',
    );
  }
  const url = await assertOctopApiBaseUrl(app.apiBaseUrl, allowlist, options);
  const auth = readAuth(app, app.apiAuthMode, env);
  return {
    baseUrl: formatOctopApiBaseUrl(url),
    auth,
    authMode: app.apiAuthMode,
  };
}

export function assertGrantApplication(app: {
  readonly appType: PortalAppType;
  readonly agentGrantsEnabled: boolean;
}): void {
  if (app.appType !== 'octop') {
    throw portalError(
      'FAILED_PRECONDITION',
      'APP_TYPE_NOT_SUPPORTED',
      'Agent Grants only supports Octop applications.',
    );
  }
  if (!app.agentGrantsEnabled) {
    throw portalError(
      'FAILED_PRECONDITION',
      'OCTOP_API_NOT_CONFIGURED',
      'Agent Grants is not enabled for this application.',
    );
  }
}

export function assertEnvName(name: string | null | undefined): string {
  const text = name?.trim() ?? '';
  if (!ENV_NAME.test(text)) {
    throw portalError(
      'FAILED_PRECONDITION',
      'OCTOP_API_NOT_CONFIGURED',
      'The credential environment variable name is missing or invalid.',
    );
  }
  return text;
}

function readAuth(
  app: PortalApplicationRecord,
  mode: OctopApiAuthMode,
  env: Readonly<Record<string, string | undefined>>,
): OctopClientAuth {
  if (mode === 'bearer_env') {
    const name = assertEnvName(app.apiTokenEnv);
    const token = env[name]?.trim();
    if (!token) {
      throw portalError(
        'FAILED_PRECONDITION',
        'OCTOP_CREDENTIAL_UNAVAILABLE',
        'The Octop API token environment variable is empty.',
      );
    }
    return { mode: 'bearer', token };
  }
  const usernameName = assertEnvName(app.apiUsernameEnv);
  const passwordName = assertEnvName(app.apiPasswordEnv);
  const username = env[usernameName]?.trim();
  const password = env[passwordName]?.trim();
  if (!username || !password) {
    throw portalError(
      'FAILED_PRECONDITION',
      'OCTOP_CREDENTIAL_UNAVAILABLE',
      'The Octop API username or password environment variable is empty.',
    );
  }
  return { mode: 'password', username, password };
}

function isAuthMode(value: string): value is OctopApiAuthMode {
  return (OCTOP_API_AUTH_MODES as readonly string[]).includes(value);
}
