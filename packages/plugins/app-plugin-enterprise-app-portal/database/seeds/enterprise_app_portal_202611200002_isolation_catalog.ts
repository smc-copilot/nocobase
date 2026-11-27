import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Isolation-only catalog rows for local screenshots. They point at public example.com
 * URLs and are labeled as non-live IdP fixtures. Production deployments should not
 * enable `app.sampleData`.
 */
const seed: SeedDefinition = defineSeed({
  name: 'enterprise_app_portal_202611200002_isolation_catalog',
  sample: true,

  async run({ query }) {
    const now = new Date();
    const rows = [
      {
        id: 'portal-app-octop-isolation',
        appCode: 'octop',
        name: 'Octop 知识助手（隔离夹具）',
        appType: 'octop',
        businessCenter: '知识中心',
        description:
          '本地隔离测试应用，不是真实 Casdoor / Octop 联调。授权卡片来自 contractFixture。',
        icon: null,
        baseUrl: 'https://example.com/apps/octop',
        targetPath: '/',
        healthUrl: 'https://example.com/',
        casdoorAppKey: 'octop-isolation',
        enabled: true,
        sortOrder: 10,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'portal-app-weknora-isolation',
        appCode: 'weknora',
        name: 'Weknora（隔离夹具）',
        appType: 'weknora',
        businessCenter: '研发中心',
        description: '本地隔离测试应用，默认应用候选。非真实联调。',
        icon: null,
        baseUrl: 'https://example.com/apps/weknora',
        targetPath: '/',
        healthUrl: 'https://example.com/',
        casdoorAppKey: 'weknora-isolation',
        enabled: true,
        sortOrder: 20,
        createdAt: now,
        updatedAt: now,
      },
    ];
    for (const row of rows) {
      const existing = await query
        .selectFrom('enterprisePortalApplications')
        .select('id')
        .where('appCode', '=', row.appCode)
        .executeTakeFirst();
      if (!existing) {
        await query
          .insertInto('enterprisePortalApplications')
          .values(row)
          .execute();
      }
    }
  },
});

export default seed;
