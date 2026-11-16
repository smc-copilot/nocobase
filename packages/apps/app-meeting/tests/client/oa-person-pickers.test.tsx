import { ApiClientError } from '@nocobase/app-client';
import { renderWithApp } from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactElement } from 'react';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import {
  uniqueOaPeople,
  type OaPersonChip,
} from '../../client/pages/meetings/oa-person.js';
import {
  OaPersonMultiSelect,
  OaPersonSelect,
} from '../../client/pages/meetings/oa-person-pickers.js';

const liSi: OaPersonChip = {
  fd_no: 'E0001',
  fd_name: 'Li Si',
  fd_department: 'Sales',
};
const zhang: OaPersonChip = {
  fd_no: 'E1001',
  fd_name: 'Zhang San',
  fd_department: 'R&D',
};
const wang: OaPersonChip = {
  fd_no: 'E2002',
  fd_name: 'Wang Wu',
  fd_department: 'Ops',
};

function resizeObserverStub() {
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
}

async function renderPicker(node: ReactElement) {
  await renderWithApp(node, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
  });
}

describe('OA person pickers', () => {
  beforeEach(resizeObserverStub);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dedupes people by employee number', () => {
    expect(
      uniqueOaPeople([zhang, zhang, { ...zhang, fd_name: 'Other' }]),
    ).toEqual([zhang]);
  });

  it('keeps remote name matches whose employee number does not contain the query', async () => {
    await renderPicker(
      <OaPersonMultiSelect
        id='attendees'
        label='Attendees'
        value={[liSi]}
        onChange={() => undefined}
        onSearch={async () => [zhang]}
      />,
    );
    await userEvent.type(
      screen.getByLabelText(`Attendees. ${enUS.meetingOa.peopleSearch}`),
      'Zh',
    );
    expect(
      await screen.findByRole('option', { name: 'Zhang San (E1001) R&D' }),
    ).toBeVisible();
  });

  it('does not list already selected people or leftover hits for a new query', async () => {
    await renderPicker(
      <OaPersonMultiSelect
        id='attendees'
        label='Attendees'
        value={[liSi]}
        onChange={() => undefined}
        onSearch={async (query) => (query.startsWith('Zh') ? [zhang] : [])}
      />,
    );
    const search = screen.getByLabelText(
      `Attendees. ${enUS.meetingOa.peopleSearch}`,
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
    await userEvent.clear(search);
    await userEvent.type(search, 'Ww');
    expect(await screen.findByText(enUS.meetingOa.peopleEmpty)).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'Zhang San (E1001) R&D' }),
    ).not.toBeInTheDocument();
  });

  it('replaces and clears a single-select value', async () => {
    function Harness(): ReactElement {
      const [value, setValue] = useState<OaPersonChip | null>(null);
      return (
        <OaPersonSelect
          id='emcee'
          label='Organizer'
          value={value}
          onChange={setValue}
          onSearch={async (query) =>
            query.startsWith('Zh')
              ? [zhang]
              : query.startsWith('Wa')
                ? [wang]
                : []
          }
        />
      );
    }
    await renderPicker(<Harness />);
    const search = screen.getByLabelText(
      `Organizer. ${enUS.meetingOa.peopleSearch}`,
    );
    await userEvent.type(search, 'Zh');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Zhang San (E1001) R&D' }),
    );
    expect(screen.getByText('Zhang San')).toBeVisible();
    await userEvent.clear(search);
    await userEvent.type(search, 'Wa');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Wang Wu (E2002) Ops' }),
    );
    expect(screen.getByText('Wang Wu')).toBeVisible();
    expect(screen.queryByText('Zhang San')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: enUS.meetingOa.clearPerson }),
    );
    expect(screen.queryByText('Wang Wu')).not.toBeInTheDocument();
  });

  it('appends, dedupes and removes multi-select people', async () => {
    function Harness(): ReactElement {
      const [value, setValue] = useState<OaPersonChip[]>([]);
      return (
        <OaPersonMultiSelect
          id='attendees'
          label='Attendees'
          value={value}
          onChange={setValue}
          onSearch={async () => [zhang, wang]}
        />
      );
    }
    await renderPicker(<Harness />);
    const search = screen.getByLabelText(
      `Attendees. ${enUS.meetingOa.peopleSearch}`,
    );
    await userEvent.type(search, 'Zh');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Zhang San (E1001) R&D' }),
    );
    expect(screen.getByText('Zhang San')).toBeVisible();
    await userEvent.type(search, 'Zh');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Wang Wu (E2002) Ops' }),
    );
    expect(screen.getByText('Zhang San')).toBeVisible();
    expect(screen.getByText('Wang Wu')).toBeVisible();
    expect(screen.getAllByText('Zhang San')).toHaveLength(1);
    const remove = document.querySelector('[data-slot="combobox-chip-remove"]');
    expect(remove).toBeInstanceOf(HTMLElement);
    await userEvent.click(remove as HTMLElement);
    expect(screen.queryByText('Zhang San')).not.toBeInTheDocument();
    expect(screen.getByText('Wang Wu')).toBeVisible();
  });

  it('keeps query and selection state independent across fields', async () => {
    const hostSearch = vi.fn(async () => [zhang]);
    const attendeeSearch = vi.fn(async () => [wang]);
    await renderPicker(
      <>
        <OaPersonSelect
          id='host'
          label='Host'
          value={null}
          onChange={() => undefined}
          onSearch={hostSearch}
        />
        <OaPersonMultiSelect
          id='attendees'
          label='Attendees'
          value={[]}
          onChange={() => undefined}
          onSearch={attendeeSearch}
        />
      </>,
    );
    await userEvent.type(
      screen.getByLabelText(`Host. ${enUS.meetingOa.peopleSearch}`),
      'Zh',
    );
    await waitFor(() => expect(hostSearch).toHaveBeenCalled());
    expect(attendeeSearch).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('option', { name: 'Zhang San (E1001) R&D' }),
    ).toBeVisible();
    await userEvent.type(
      screen.getByLabelText(`Attendees. ${enUS.meetingOa.peopleSearch}`),
      'Wa',
    );
    await waitFor(() => expect(attendeeSearch).toHaveBeenCalled());
    expect(
      await screen.findByRole('option', { name: 'Wang Wu (E2002) Ops' }),
    ).toBeVisible();
    expect(hostSearch.mock.calls.map((call) => call[0])).toEqual(['Zh']);
    expect(attendeeSearch.mock.calls.map((call) => call[0])).toEqual(['Wa']);
  });

  it('shows unconfigured copy instead of local users', async () => {
    await renderPicker(
      <OaPersonSelect
        id='host'
        label='Host'
        value={zhang}
        onChange={() => undefined}
        onSearch={async () =>
          Promise.reject(
            new ApiClientError('OA people search is not configured.', {
              status: 400,
              reason: 'OA_NOT_CONFIGURED',
              method: 'GET',
              url: '/api/meetingOa/people',
            }),
          )
        }
      />,
    );
    await userEvent.type(
      screen.getByLabelText(`Host. ${enUS.meetingOa.peopleSearch}`),
      'Zh',
    );
    expect(
      (await screen.findAllByText(enUS.meetingOa.peopleNotConfigured)).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Zhang San')).toBeVisible();
  });

  it('keeps the selected person when a later search fails', async () => {
    await renderPicker(
      <OaPersonSelect
        id='host'
        label='Host'
        value={zhang}
        onChange={() => undefined}
        onSearch={async () => Promise.reject(new Error('upstream'))}
      />,
    );
    await userEvent.type(
      screen.getByLabelText(`Host. ${enUS.meetingOa.peopleSearch}`),
      'Zh',
    );
    expect(
      (await screen.findAllByText(enUS.meetingOa.peopleErrorKept)).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Zhang San')).toBeVisible();
  });
});
