import { renderWithApp } from '@nocobase/app-testing/client';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactElement } from 'react';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import {
  PersonChips,
  type OaPersonChip,
} from '../../client/pages/meetings/person-chips.js';

const selected: OaPersonChip = {
  fd_no: 'E0001',
  fd_name: 'Li Si',
  fd_department: 'Sales',
};
const zhang: OaPersonChip = {
  fd_no: 'E1001',
  fd_name: 'Zhang San',
  fd_department: 'R&D',
};

function Harness({
  onSearch,
}: {
  readonly onSearch: (query: string) => Promise<OaPersonChip[]>;
}): ReactElement {
  const [value, setValue] = useState<OaPersonChip[]>([selected]);
  return (
    <PersonChips
      id='attendees'
      mode='multi'
      value={value}
      onChange={setValue}
      onSearch={onSearch}
    />
  );
}

describe('PersonChips', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(): void {
          this.callback([], this as unknown as ResizeObserver);
        }
        unobserve(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderChips(
    onSearch: (query: string) => Promise<OaPersonChip[]>,
  ) {
    await renderWithApp(<Harness onSearch={onSearch} />, {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
    });
    return screen.getByLabelText(enUS.meetingOa.peopleSearch);
  }

  it('keeps remote name matches whose employee number does not contain the query', async () => {
    const search = await renderChips(async () => [zhang]);
    await userEvent.type(search, 'Zh');
    expect(
      await screen.findByRole('option', { name: 'Zhang San (E1001) R&D' }),
    ).toBeVisible();
  });

  it('does not list already selected people or leftover hits for a new query', async () => {
    const search = await renderChips(async (query) =>
      query.startsWith('Zh') ? [zhang] : [],
    );
    expect(screen.getByText('Li Si')).toBeVisible();
    await userEvent.type(search, 'Z');
    expect(
      await screen.findByText(enUS.meetingOa.peopleNeedChars),
    ).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'Li Si (E0001) Sales' }),
    ).not.toBeInTheDocument();
    await userEvent.type(search, 'h');
    expect(
      await screen.findByRole('option', { name: 'Zhang San (E1001) R&D' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'Li Si (E0001) Sales' }),
    ).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, 'Ww');
    expect(await screen.findByText(enUS.meetingOa.peopleEmpty)).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'Zhang San (E1001) R&D' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Li Si (E0001) Sales' }),
    ).not.toBeInTheDocument();
  });
});
