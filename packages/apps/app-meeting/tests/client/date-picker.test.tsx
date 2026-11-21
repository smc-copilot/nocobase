import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DatePicker } from '#components/date-picker';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';

describe('DatePicker', () => {
  it('shows the selected date as yyyy-MM-dd', async () => {
    const runtime = await createTestI18nRuntime({
      locale: 'en-US',
      application: {
        namespace: packageMetadata.name,
        resources: enUS,
      },
    });
    render(
      <TestI18nProvider runtime={runtime}>
        <label htmlFor='from'>From</label>
        <DatePicker
          id='from'
          value={new Date(2026, 9, 1)}
          onChange={() => {}}
        />
      </TestI18nProvider>,
    );
    expect(screen.getByLabelText('From')).toHaveTextContent('2026-10-01');
  });
});
