// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  createAllowlistAccessChecker,
  createNativeBusinessAccessChecker,
  denyWithoutPermissionRef,
  parsePermissionRef,
} from '../../server/business-access.js';

describe('parsePermissionRef', () => {
  it('parses colon and slash separators', () => {
    expect(parsePermissionRef('generic.request:edit')).toEqual({
      resourceType: 'generic.request',
      action: 'edit',
    });
    expect(parsePermissionRef('generic.request/view')).toEqual({
      resourceType: 'generic.request',
      action: 'view',
    });
  });

  it('rejects empty and unparseable refs', () => {
    expect(parsePermissionRef('')).toBeUndefined();
    expect(parsePermissionRef('nosep')).toBeUndefined();
    expect(parsePermissionRef(':edit')).toBeUndefined();
    expect(parsePermissionRef('type:')).toBeUndefined();
  });
});

describe('denyWithoutPermissionRef', () => {
  it('denies every request including when permissionRef is set', async () => {
    expect(
      await denyWithoutPermissionRef({
        userId: 'u1',
        permissionRef: 'generic.request:edit',
        action: 'issue',
      }),
    ).toBe(false);
    expect(
      await denyWithoutPermissionRef({
        userId: 'u1',
        permissionRef: null,
        action: 'issue',
      }),
    ).toBe(false);
  });
});

describe('createAllowlistAccessChecker', () => {
  it('allows only listed users for a permissionRef', async () => {
    const checker = createAllowlistAccessChecker(
      new Map([['generic.request:edit', new Set(['alice'])]]),
    );
    expect(
      await checker({
        userId: 'alice',
        permissionRef: 'generic.request:edit',
        action: 'issue',
      }),
    ).toBe(true);
    expect(
      await checker({
        userId: 'bob',
        permissionRef: 'generic.request:edit',
        action: 'issue',
      }),
    ).toBe(false);
  });
});

describe('createNativeBusinessAccessChecker', () => {
  it('maps permissionRef onto authz.for().can() and denies unparseable refs', async () => {
    const can = vi.fn().mockResolvedValue(true);
    const resolveFor = vi.fn().mockResolvedValue([]);
    const forFn = vi.fn().mockReturnValue({ can });
    const authz = {
      for: forFn,
      subjects: { resolveFor },
    } as never;

    const checker = createNativeBusinessAccessChecker(authz);
    expect(
      await checker({
        userId: 'u1',
        permissionRef: 'generic.request:edit',
        action: 'issue',
        recordId: 'rec-1',
      }),
    ).toBe(true);
    expect(forFn).toHaveBeenCalledWith({
      principal: { type: 'user', id: 'u1' },
      subjects: [{ type: 'authenticated', id: '*' }],
    });
    expect(can).toHaveBeenCalledWith({
      resource: { type: 'generic.request', id: 'rec-1' },
      action: 'edit',
    });

    expect(
      await checker({
        userId: 'u1',
        permissionRef: 'not-a-ref',
        action: 'issue',
      }),
    ).toBe(false);
    expect(
      await checker({
        userId: 'u1',
        permissionRef: null,
        action: 'issue',
      }),
    ).toBe(false);
  });

  it('uses * resource id when recordId is absent', async () => {
    const can = vi.fn().mockResolvedValue(false);
    const authz = {
      for: vi.fn().mockReturnValue({ can }),
      subjects: { resolveFor: vi.fn().mockResolvedValue([]) },
    } as never;
    await createNativeBusinessAccessChecker(authz)({
      userId: 'u1',
      permissionRef: 'generic.request:view',
      action: 'view',
    });
    expect(can).toHaveBeenCalledWith({
      resource: { type: 'generic.request', id: '*' },
      action: 'view',
    });
  });
});
