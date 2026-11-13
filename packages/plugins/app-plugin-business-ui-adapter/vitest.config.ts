import { createNodeVitestConfig } from '@nocobase/dev-config/vitest/node';
import { defineConfig } from 'vitest/config';

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
