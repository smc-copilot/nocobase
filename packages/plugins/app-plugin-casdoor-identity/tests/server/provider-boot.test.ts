import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import type { Auth } from '@nocobase/app-plugin-authentication/server';
import type {
  ScheduleDefinition,
  ScheduleTargetType,
} from '@nocobase/app-plugin-scheduler/server';
import {
  schedulerServiceToken,
  type SchedulerService,
} from '@nocobase/app-plugin-scheduler/server/tokens';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { createDatabaseManager, databaseManagerToken } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import type { CasdoorIdentityConfig } from '../../server/config.js';
import type { IdentityDirectory } from '../../server/directory.js';
import { CasdoorIdentityProvider } from '../../server/providers/casdoor-identity.js';
import {
  casdoorIdentityAdminToken,
  identityDirectoryToken,
} from '../../server/tokens.js';

function setup(
  config: CasdoorIdentityConfig,
  options: { scheduler?: boolean; directory?: boolean } = {},
) {
  const container = new ServiceContainer();
  container.instance(
    databaseManagerToken,
    createDatabaseManager({
      default: 'main',
      connections: { main: { dialect: 'sqlite', storage: ':memory:' } },
    }),
  );
  const resolvers: unknown[] = [];
  container.instance(authenticationToken, {
    addCredentialResolver: (resolver: unknown) => {
      resolvers.push(resolver);
      return () => undefined;
    },
  } as unknown as Auth);
  const targets: ScheduleTargetType[] = [];
  const schedules: ScheduleDefinition[] = [];
  if (options.scheduler !== false) {
    container.instance(schedulerServiceToken, {
      registerTarget: (target: ScheduleTargetType) => {
        targets.push(target);
        return { type: target.type, reportCompletion: () => Promise.resolve() };
      },
      defineSchedule: (definition: ScheduleDefinition) => {
        schedules.push(definition);
      },
      drain: () => Promise.resolve(),
    } as unknown as SchedulerService);
  }
  if (options.directory) {
    container.instance(identityDirectoryToken, {
      listUsers: () => Promise.resolve({ users: [] }),
    } satisfies IdentityDirectory);
  }
  const provider = new CasdoorIdentityProvider({
    container,
    config: {
      get: (key: string) => (key === 'casdoorIdentity' ? config : undefined),
    },
  } as unknown as AppPluginApplication);
  provider.register();
  return { container, provider, resolvers, targets, schedules };
}

describe('CasdoorIdentityProvider boot', () => {
  it('registers the credential resolver and, with a directory, the Scheduler target and schedule', async () => {
    const { container, provider, resolvers, targets, schedules } = setup({
      directory: {
        endpoint: 'https://sso.test',
        organization: 'acme',
        clientId: 'c',
        clientSecret: 's',
      },
    });
    await provider.boot();
    expect(resolvers).toHaveLength(1);
    expect(targets).toHaveLength(1);
    expect(schedules[0]).toMatchObject({ key: 'casdoor-identity-sync' });
    expect(
      container.resolve(casdoorIdentityAdminToken).sync.schedulerMode,
    ).toBe('scheduler');
    await provider.shutdown();
  });

  it('registers nothing for sync without a directory, unless sync is forced on', async () => {
    const quiet = setup({});
    await quiet.provider.boot();
    expect(quiet.schedules).toHaveLength(0);
    expect(
      quiet.container.resolve(casdoorIdentityAdminToken).sync.schedulerMode,
    ).toBe('none');

    const forced = setup({ sync: { enabled: true } });
    await forced.provider.boot();
    expect(forced.schedules).toHaveLength(1);

    const off = setup({ sync: { enabled: false } }, { directory: true });
    await off.provider.boot();
    expect(off.schedules).toHaveLength(0);
  });

  it('uses an application-registered directory', async () => {
    const { schedules, provider } = setup({}, { directory: true });
    await provider.boot();
    expect(schedules).toHaveLength(1);
  });

  it('falls back to a timer only when the Scheduler plugin is absent and an interval is configured', async () => {
    const withTimer = setup(
      { sync: { fallbackIntervalSeconds: 3600 } },
      { scheduler: false, directory: true },
    );
    await withTimer.provider.boot();
    expect(
      withTimer.container.resolve(casdoorIdentityAdminToken).sync.schedulerMode,
    ).toBe('timer');
    await withTimer.provider.start();
    await withTimer.provider.shutdown();

    const none = setup({}, { scheduler: false, directory: true });
    await none.provider.boot();
    expect(
      none.container.resolve(casdoorIdentityAdminToken).sync.schedulerMode,
    ).toBe('none');
  });
});
