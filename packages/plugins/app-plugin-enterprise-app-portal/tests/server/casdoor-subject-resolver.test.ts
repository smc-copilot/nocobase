import { describe, expect, it, vi } from 'vitest';

import { CasdoorSubjectResolver } from '../../server/services/casdoor-subject-resolver.js';

function fakeDatabase(rows: readonly Record<string, unknown>[]) {
  return {
    connection: () => ({
      query: {
        selectFrom: () => ({
          select: () => ({
            where: () => ({
              where: () => ({
                execute: async () => rows,
              }),
            }),
          }),
        }),
      },
    }),
  };
}

describe('CasdoorSubjectResolver', () => {
  it('requires a configured issuer', async () => {
    const resolver = new CasdoorSubjectResolver(
      () => fakeDatabase([]) as never,
      () => undefined,
      () => undefined,
    );
    await expect(resolver.requireForUser('u1')).rejects.toMatchObject({
      reason: 'IDENTITY_BINDING_REQUIRED',
    });
  });

  it('fails when no binding exists', async () => {
    const resolver = new CasdoorSubjectResolver(
      () => fakeDatabase([]) as never,
      () => 'https://casdoor.example',
      () => undefined,
    );
    await expect(resolver.requireForUser('u1')).rejects.toMatchObject({
      reason: 'IDENTITY_BINDING_REQUIRED',
    });
  });

  it('fails when bindings conflict', async () => {
    const resolver = new CasdoorSubjectResolver(
      () =>
        fakeDatabase([
          {
            providerIssuer: 'https://casdoor.example',
            providerSubject: 'smartcore/a',
            localUserId: 'u1',
          },
          {
            providerIssuer: 'https://casdoor.example',
            providerSubject: 'smartcore/b',
            localUserId: 'u1',
          },
        ]) as never,
      () => 'https://casdoor.example',
      () => undefined,
    );
    await expect(resolver.requireForUser('u1')).rejects.toMatchObject({
      reason: 'IDENTITY_BINDING_AMBIGUOUS',
    });
  });

  it('returns owner/name subjects without a management lookup', async () => {
    const resolver = new CasdoorSubjectResolver(
      () =>
        fakeDatabase([
          {
            providerIssuer: 'https://casdoor.example',
            providerSubject: 'smartcore/alice',
            localUserId: 'u1',
          },
        ]) as never,
      () => 'https://casdoor.example',
      () => undefined,
    );
    await expect(resolver.requireForUser('u1')).resolves.toMatchObject({
      casdoorUserId: 'smartcore/alice',
      providerSubject: 'smartcore/alice',
    });
  });

  it('resolves non-owner subjects through Casdoor user lookup', async () => {
    const findUserByIdOrName = vi.fn(async () => ({
      id: 'uuid-1',
      owner: 'smartcore',
      name: 'alice',
    }));
    const resolver = new CasdoorSubjectResolver(
      () =>
        fakeDatabase([
          {
            providerIssuer: 'https://casdoor.example',
            providerSubject: 'uuid-1',
            localUserId: 'u1',
          },
        ]) as never,
      () => 'https://casdoor.example',
      () =>
        ({
          findUserByIdOrName,
        }) as never,
    );
    await expect(resolver.requireForUser('u1')).resolves.toMatchObject({
      casdoorUserId: 'smartcore/alice',
    });
    expect(findUserByIdOrName).toHaveBeenCalledWith('uuid-1');
  });
});
