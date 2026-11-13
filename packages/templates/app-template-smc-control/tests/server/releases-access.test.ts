import { describe, expect, it } from 'vitest';

import {
  PUBLISHER_SET,
  permissionsForSets,
  publisherAuthorizationGrants,
} from '../../server/lib/releases-permissions.js';

describe('permissionsForSets', () => {
  it('gives unrestricted access to root and platform-admin', () => {
    const root = permissionsForSets(['root'], 'u1');
    expect(root.scopes['rel.apps/view']).toBe('all');
    expect(root.settings['rel.environments/manage']).toBe(true);

    const admin = permissionsForSets(['platform-admin'], 'u1');
    expect(admin.scopes['rel.apps/delete']).toBe('all');
  });

  it('gives publishers related-app scopes without delete', () => {
    const publisher = permissionsForSets([PUBLISHER_SET], 'pub-1');
    expect(publisher.scopes['rel.apps/create']).toBe('all');
    expect(publisher.scopes['rel.apps/deploy']).toEqual({ users: ['pub-1'] });
    expect(publisher.scopes['rel.apps/delete']).toBe('none');
    expect(publisher.settings['rel.environments/read']).toBe(true);
    expect(publisher.pages['rel-apps']).toBe(true);
  });

  it('denies callers with no matching set', () => {
    const none = permissionsForSets(['member'], 'u2');
    expect(none.scopes['rel.apps/view']).toBe('none');
    expect(none.pages['rel-apps']).toBe(false);
  });
});

describe('publisherAuthorizationGrants', () => {
  it('includes page:rel-apps/access alongside Releases business grants (FIX-16 dual config)', () => {
    const grants = publisherAuthorizationGrants();
    expect(grants).toEqual(
      expect.arrayContaining([
        {
          resource: { type: 'page', id: 'rel-apps' },
          actions: [{ action: 'access' }],
        },
        expect.objectContaining({
          resource: { type: 'rel', id: 'rel.apps' },
        }),
        {
          resource: { type: 'settings', id: 'rel.environments' },
          actions: [{ action: 'read' }],
        },
      ]),
    );
    const pageGrant = grants.find(
      (grant) =>
        grant.resource.type === 'page' && grant.resource.id === 'rel-apps',
    );
    expect(pageGrant?.actions.map((action) => action.action)).toEqual([
      'access',
    ]);
  });
});
