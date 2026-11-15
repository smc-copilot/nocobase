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
      'Query authorized Tencent meetings, import materials, and sync minutes to OA in later releases. This version provides sign-in, roles, and an empty meetings list gated by grants.',
  },
  meetings: {
    title: 'Meetings',
    empty: 'No meetings yet. Gateway query is not part of this version.',
    untitled: 'Untitled meeting',
    notProvided: 'Not provided',
    queryNotConnected:
      'This list only shows meetings already stored for you. It does not query a meeting gateway.',
    columns: {
      title: 'Name',
      meetingCode: 'Meeting number',
      createdAt: 'Created',
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
