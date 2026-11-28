import { fileURLToPath } from 'node:url';

import { createDatabaseTest } from '@nocobase/app-testing/server';
import type { DatabaseManager } from '@nocobase/db';
import { expect } from 'vitest';

import { InMemoryOutboxPublisher } from '../../server/outbox.js';
import { HubRuntime } from '../../server/runtime.js';
import {
  createIdentityHubServices,
  type IdentityHubServices,
} from '../../server/services/create.js';
import { clearDatabaseEnv } from '../helpers/clear-db-env.js';

clearDatabaseEnv();

const test = createDatabaseTest({
  migrations: [
    {
      packageName: '@nocobase/app-plugin-identity-hub',
      directory: fileURLToPath(
        new URL('../../database/migrations', import.meta.url),
      ),
    },
  ],
});

function hub(database: DatabaseManager): IdentityHubServices & {
  outbox: InMemoryOutboxPublisher;
} {
  const outbox = new InMemoryOutboxPublisher();
  return {
    outbox,
    ...createIdentityHubServices(new HubRuntime(database, outbox)),
  };
}

async function written(services: IdentityHubServices): Promise<number> {
  return (await services.audit.list({ pageSize: 100 })).total;
}

test('creates a person and a manual identity without Casdoor', async ({
  database,
}) => {
  const services = hub(database);
  const before = await written(services);
  await services.providers.create({
    providerId: 'manual',
    providerType: 'manual',
    displayName: 'Manual',
  });
  const person = await services.persons.create({
    displayName: 'Ada Lovelace',
    manualIdentity: { providerId: 'manual', subject: 'ada' },
  });
  expect(person.status).toBe('active');
  expect(person.version).toBe(1);
  expect(person.manualIdentityId).toEqual(expect.any(String));
  const identities = await services.identities.listForPerson(person.personId);
  expect(identities).toHaveLength(1);
  expect(identities[0]).toMatchObject({
    providerId: 'manual',
    providerType: 'manual',
    subject: 'ada',
    status: 'active',
  });
  expect(await written(services)).toBe(before + 2);
  expect(services.outbox.messages).toHaveLength(2);
});

test('registers more than one provider of the same and different types', async ({
  database,
}) => {
  const services = hub(database);
  await services.providers.create({
    providerId: 'oidc-a',
    providerType: 'oidc',
    displayName: 'OIDC A',
    secretRef: 'vault://oidc-a',
  });
  await services.providers.create({
    providerId: 'oidc-b',
    providerType: 'oidc',
    displayName: 'OIDC B',
  });
  await services.providers.create({
    providerId: 'ldap-1',
    providerType: 'ldap',
    displayName: 'LDAP',
  });
  const page = await services.providers.list();
  expect(page.items.map((item) => item.providerType).sort()).toEqual([
    'ldap',
    'oidc',
    'oidc',
  ]);
  expect(page.items.find((item) => item.providerId === 'oidc-a')).toMatchObject(
    {
      secretConfigured: true,
    },
  );
  expect(JSON.stringify(page.items)).not.toContain('vault://oidc-a');
});

test('registers an application and revokes membership for that application only', async ({
  database,
}) => {
  const services = hub(database);
  const person = await services.persons.create({ displayName: 'Grace' });
  await services.apps.register({ appId: 'portal', displayName: 'Portal' });
  await services.apps.register({ appId: 'meeting', displayName: 'Meeting' });
  await services.memberships.grant({
    personId: person.personId,
    appId: 'portal',
  });
  await services.memberships.grant({
    personId: person.personId,
    appId: 'meeting',
  });
  const revoked = await services.memberships.revoke({
    personId: person.personId,
    appId: 'portal',
    reason: 'left the team',
  });
  expect(revoked).toMatchObject({
    appId: 'portal',
    status: 'revoked',
    revision: 2,
  });
  const meeting = await services.memberships.find(person.personId, 'meeting');
  expect(meeting).toMatchObject({ status: 'active', revision: 1 });
});

test('refuses a membership grant for a disabled person', async ({
  database,
}) => {
  const services = hub(database);
  const person = await services.persons.create({ displayName: 'Grace' });
  await services.apps.register({ appId: 'portal', displayName: 'Portal' });
  await services.persons.disable(person.personId);
  await expect(
    services.memberships.grant({ personId: person.personId, appId: 'portal' }),
  ).rejects.toMatchObject({ reason: 'IDENTITY_HUB_PERSON_NOT_ACTIVE' });
  expect(
    await services.memberships.find(person.personId, 'portal'),
  ).toBeUndefined();
});

test('queues a duplicate employee number instead of merging the person', async ({
  database,
}) => {
  const services = hub(database);
  const first = await services.persons.create({
    displayName: 'Ada',
    employeeNo: 'E-1',
  });
  await expect(
    services.persons.create({ displayName: 'Ada Two', employeeNo: 'E-1' }),
  ).rejects.toMatchObject({ reason: 'IDENTITY_HUB_DUPLICATE_EMPLOYEE_NO' });
  const conflicts = await services.conflicts.list({ status: 'open' });
  expect(conflicts.items).toHaveLength(1);
  expect(conflicts.items[0]).toMatchObject({
    conflictType: 'duplicate-employee-no',
    personId: first.personId,
  });
  expect((await services.persons.list()).total).toBe(1);
});

test('lets one of two concurrent duplicate links succeed', async ({
  database,
}) => {
  const services = hub(database);
  await services.providers.create({
    providerId: 'oidc',
    providerType: 'oidc',
    displayName: 'OIDC',
  });
  const ada = await services.persons.create({ displayName: 'Ada' });
  const grace = await services.persons.create({ displayName: 'Grace' });
  const link = (personId: string) =>
    services.identities.link({
      personId,
      providerId: 'oidc',
      subject: 'same-subject',
      issuer: 'https://idp.example',
    });
  const results = await Promise.allSettled([
    link(ada.personId),
    link(grace.personId),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  const rejected = results.find((result) => result.status === 'rejected');
  expect(rejected?.status).toBe('rejected');
  if (rejected?.status === 'rejected') {
    expect(rejected.reason).toMatchObject({
      reason: 'IDENTITY_HUB_IDENTITY_ALREADY_LINKED',
    });
  }
  const adaLinks = await services.identities.listForPerson(ada.personId);
  const graceLinks = await services.identities.listForPerson(grace.personId);
  expect(adaLinks.length + graceLinks.length).toBe(1);
});

test('does not merge two subjects that share an email', async ({
  database,
}) => {
  const services = hub(database);
  await services.providers.create({
    providerId: 'oidc',
    providerType: 'oidc',
    displayName: 'OIDC',
  });
  const ada = await services.persons.create({
    displayName: 'Ada',
    email: 'shared@example.com',
  });
  const grace = await services.persons.create({
    displayName: 'Grace',
    email: 'shared@example.com',
  });
  await services.identities.link({
    personId: ada.personId,
    providerId: 'oidc',
    subject: 'subject-ada',
    issuer: 'https://idp.example',
    email: 'shared@example.com',
  });
  const preview = await services.identities.linkPreview({
    providerId: 'oidc',
    subject: 'subject-grace',
    issuer: 'https://idp.example',
    email: 'shared@example.com',
  });
  expect(preview.existingIdentity).toBeNull();
  expect(preview.suggestedPersonId).toBeNull();
  expect(preview.emailMatchIgnored).toBe(true);
  await services.identities.link({
    personId: grace.personId,
    providerId: 'oidc',
    subject: 'subject-grace',
    issuer: 'https://idp.example',
    email: 'shared@example.com',
  });
  expect(await services.identities.listForPerson(ada.personId)).toHaveLength(1);
  expect(await services.identities.listForPerson(grace.personId)).toHaveLength(
    1,
  );
  expect((await services.persons.get(ada.personId)).personId).toBe(
    ada.personId,
  );
  expect((await services.persons.get(grace.personId)).personId).toBe(
    grace.personId,
  );
});

test('writes an audit event and an outbox message for every mutation', async ({
  database,
}) => {
  const services = hub(database);
  const expectWrite = async <T>(work: () => Promise<T>): Promise<T> => {
    const audits = await written(services);
    const messages = services.outbox.messages.length;
    const result = await work();
    expect(await written(services)).toBe(audits + 1);
    expect(services.outbox.messages).toHaveLength(messages + 1);
    return result;
  };

  await expectWrite(() =>
    services.providers.create({
      providerId: 'manual',
      providerType: 'manual',
      displayName: 'Manual',
      secretRef: 'vault://manual',
    }),
  );
  const person = await expectWrite(() =>
    services.persons.create({
      displayName: 'Ada',
      employeeNo: 'E-9',
      manualIdentity: { providerId: 'manual', subject: 'ada' },
    }),
  );
  const updated = await expectWrite(() =>
    services.persons.update(person.personId, { displayName: 'Ada L.' }),
  );
  expect(updated.version).toBe(2);
  const disabled = await expectWrite(() =>
    services.persons.disable(person.personId),
  );
  expect(disabled).toMatchObject({ status: 'disabled', version: 3 });
  const enabled = await expectWrite(() =>
    services.persons.enable(person.personId),
  );
  expect(enabled).toMatchObject({
    status: 'active',
    version: 4,
    disabledAt: null,
  });
  await expectWrite(() =>
    services.providers.create({
      providerId: 'oidc',
      providerType: 'oidc',
      displayName: 'OIDC',
    }),
  );
  const linked = await expectWrite(() =>
    services.identities.link({
      personId: person.personId,
      providerId: 'oidc',
      subject: 'ada-oidc',
      issuer: 'https://idp.example',
    }),
  );
  await expectWrite(() =>
    services.identities.unlink({
      providerId: 'oidc',
      identityId: linked.identityId,
    }),
  );
  expect(
    (await services.identities.listForPerson(person.personId)).find(
      (identity) => identity.identityId === linked.identityId,
    )?.status,
  ).toBe('unlinked');
  const organization = await expectWrite(() =>
    services.organizations.createOrganization({ displayName: 'Acme' }),
  );
  await expectWrite(() =>
    services.organizations.createDepartment({
      organizationId: organization.organizationId,
      displayName: 'Engineering',
    }),
  );
  await expectWrite(() =>
    services.apps.register({ appId: 'portal', displayName: 'Portal' }),
  );
  await expectWrite(() =>
    services.memberships.grant({
      personId: person.personId,
      appId: 'portal',
    }),
  );
  await expectWrite(() =>
    services.memberships.revoke({
      personId: person.personId,
      appId: 'portal',
    }),
  );
  const auditsBeforeConflict = await written(services);
  await expect(
    services.persons.create({ displayName: 'Other', employeeNo: 'E-9' }),
  ).rejects.toMatchObject({ reason: 'IDENTITY_HUB_DUPLICATE_EMPLOYEE_NO' });
  expect(await written(services)).toBe(auditsBeforeConflict + 1);
  const conflict = (await services.conflicts.list({ status: 'open' })).items[0];
  expect(conflict).toBeDefined();
  await expectWrite(() =>
    services.conflicts.resolve(conflict!.conflictId, 'resolved'),
  );
  const archived = await expectWrite(() =>
    services.persons.archive(person.personId),
  );
  expect(archived).toMatchObject({ status: 'archived', version: 5 });
  const redacted = services.outbox.messages.find(
    (message) => message.type === 'provider.created',
  );
  expect(redacted?.payload).toMatchObject({ secretRef: '[redacted]' });
});

test('redacts secret-like keys in an audit payload', async ({ database }) => {
  const services = hub(database);
  await database.transaction(async (connection) => {
    await services.audit.append(
      {
        action: 'test.redact',
        entityType: 'person',
        entityId: 'person-1',
        details: {
          displayName: 'Ada',
          secretRef: 'vault://x',
          nested: { accessToken: 'abc' },
        },
      },
      connection,
    );
  });
  const [event] = (await services.audit.list()).items;
  expect(event?.details).toEqual({
    displayName: 'Ada',
    secretRef: '[redacted]',
    nested: { accessToken: '[redacted]' },
  });
  expect(services.outbox.messages[0]?.payload).toEqual(event?.details);
});
