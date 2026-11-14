import { createNodeLibraryConfig } from '@nocobase/dev-config/eslint';

export default createNodeLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  // Vendored Octop consumer sources are integrity-checked by MANIFEST.json; do not re-lint them.
  ignores: ['tests/fixtures/**'],
});
