import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';
import { defineConfig } from 'vitest/config';

// Tests are grouped by the source directory they cover: tests/server/ and tests/database/ run under Node.
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      createNodeVitestConfig({
        test: {
          name: 'node',
          include: ['tests/**/*.test.{ts,tsx}'],
          exclude: ['tests/client/**'],
        },
      }),
    ],
  },
});
