import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { BusinessUiAdapterProvider } from './business-ui-adapter.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  BusinessUiAdapterProvider,
];

export default serviceProviders;
