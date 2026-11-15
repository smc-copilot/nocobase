import fileUi from '../extensions/nocobase-file-component-ui/locales/en-US.js';
import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  ...fileUi,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  navigation: {
    ...systemEnUS.navigation,
    meetings: 'Meetings',
  },
  home: {
    ...systemEnUS.home,
    platform: 'Meeting',
    title: 'Meetings in this application',
    description:
      'Bind the meeting gateway, query authorized meetings, and open stored details. OA import and sync are not in this version.',
  },
  meetings: {
    title: 'Meetings',
    empty:
      'No meetings stored for you yet. Query the bound gateway to import them.',
    untitled: 'Untitled meeting',
    notProvided: 'Not provided',
    loading: 'Loading…',
    unavailable: 'This meeting is unavailable.',
    queryNotConnected:
      'This list only shows meetings already stored for you. Use Query to call the bound gateway; opening the page does not sync by itself.',
    query: 'Query',
    queryStart: 'From',
    queryEnd: 'To',
    queryStarted: 'Query finished',
    queryFailed: 'The gateway query could not be completed.',
    detailDescription:
      'Stored basic information, people, and recording availability. Missing fields stay as not provided.',
    participantsEmpty: 'No participant rows are stored for this meeting.',
    recordingsEmpty: 'No recording rows are stored for this meeting.',
    recordingAvailable: 'Recording available',
    recordingUnavailable: 'Recording not available',
    tabs: {
      overview: 'Overview',
      participants: 'People',
      recordings: 'Recordings',
    },
    fetchStatus: {
      not_fetched: 'Not fetched yet',
      fetched: 'Fetched',
      empty: 'Upstream returned none',
      failed: 'Fetch failed; earlier rows were kept',
      not_provided: 'Not provided',
    },
    columns: {
      title: 'Name',
      meetingCode: 'Meeting number',
      createdAt: 'Created',
      startedAt: 'Started',
      endedAt: 'Ended',
      participants: 'People',
      recordings: 'Recordings',
    },
  },
  meetingConnections: {
    title: 'Meeting gateway',
    description:
      'Bind this application to your authorized Tencent meeting connections. Tokens stay on the server.',
    binding: 'Current binding',
    bind: 'Bind gateway',
    select: 'Use this connection',
    selected: 'Connection selected',
    disconnect: 'Disconnect this app',
    disconnected:
      'This app can no longer call the gateway with the old credential.',
    disconnectScope:
      'Disconnect stops later remote access from this application. It does not revoke the upstream Tencent or gateway grant; that revoke API is not supported here.',
    noConnection: 'No connection is selected yet.',
    currentConnection: 'Selected connection: {{name}}',
    notConfigured:
      'The meeting gateway origin and application are not configured. This app is not connected.',
    identityUnavailable:
      'The first gateway access token comes from account-login and token exchange in the published gateway client. This app does not collect a gateway password or a pasted token, so live OAuth start stays blocked until that contract is confirmed.',
    rootUnrestricted:
      'A platform root (unrestricted) user can read every stored meeting. Ordinary administrators and members do not receive that bypass.',
    completing: 'Finishing gateway authorization…',
    status: {
      pending: 'Waiting for authorization',
      awaiting_connection: 'Choose an authorized connection',
      active: 'Connected',
      disconnected: 'Disconnected from this app',
      identity_unavailable: 'Gateway identity token is unavailable',
      not_configured: 'Gateway is not configured',
    },
  },
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
