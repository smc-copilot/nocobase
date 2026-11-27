import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import HomePage from '../../client/pages/home/index.js';

const catalog = {
  applications: [
    {
      appCode: 'octop',
      name: 'Octop 知识助手（隔离夹具）',
      appType: 'octop',
      businessCenter: '知识中心',
      description: 'Isolation fixture',
      enabled: true,
      health: 'healthy',
      isDefault: true,
    },
  ],
  autoLaunchMode: 'disabled',
  suggestedAppCode: null,
  isolationNotice: true,
};

describe('employee portal home', () => {
  it('shows isolation-labeled authorized application cards', async () => {
    await renderWithApp(<HomePage />, {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi(async ({ path }) => {
        if (path === 'enterpriseAppPortal/applications') {
          return { data: catalog };
        }
        if (path === 'authorization/permissions') {
          return { data: { unrestricted: true, permissions: [] } };
        }
        return new Response(null, { status: 404 });
      }),
    });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: enUS.portal.title,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(enUS.portal.isolationTitle)).toBeVisible();
    expect(screen.getByText('Octop 知识助手（隔离夹具）')).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.portal.open }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: enUS.portal.userConfigLink }),
    ).toHaveAttribute('href', '/settings/users');
  });
});
