import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  mergeAppEnvWithProcess,
  readAppEnvFiles,
} from '../../server/services/app-env-files.js';

describe('readAppEnvFiles', () => {
  it('reads unquoted passwords that contain #', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'portal-env-'));
    writeFileSync(
      path.join(dir, '.env'),
      [
        'OCTOP_API_USERNAME_99170=admin',
        'OCTOP_API_PASSWORD_99170=Octop#18688923180',
        'OCTOP_API_HOST_ALLOWLIST=ai.superic.com # comment',
        '',
      ].join('\n'),
      'utf8',
    );

    const env = readAppEnvFiles([dir]);
    expect(env.OCTOP_API_USERNAME_99170).toBe('admin');
    expect(env.OCTOP_API_PASSWORD_99170).toBe('Octop#18688923180');
    expect(env.OCTOP_API_HOST_ALLOWLIST).toBe('ai.superic.com');
  });

  it('lets non-empty process values override file values', () => {
    const merged = mergeAppEnvWithProcess(
      { OCTOP_API_USERNAME_99170: 'from-file', KEEP: 'file' },
      {
        OCTOP_API_USERNAME_99170: 'from-process',
        EMPTY: '',
        KEEP: undefined,
      },
    );
    expect(merged.OCTOP_API_USERNAME_99170).toBe('from-process');
    expect(merged.KEEP).toBe('file');
    expect(merged.EMPTY).toBeUndefined();
  });
});
