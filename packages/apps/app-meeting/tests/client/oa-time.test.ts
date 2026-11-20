import { describe, expect, it } from 'vitest';

import {
  defaultBeijingCompleteInput,
  formatBeijingInstant,
} from '../../client/pages/meetings/oa-time.js';

describe('formatBeijingInstant', () => {
  it('formats an ISO instant as Beijing yyyy-MM-dd HH:mm:ss', () => {
    expect(formatBeijingInstant('2026-10-19T08:12:34.000Z')).toBe(
      '2026-10-19 16:12:34',
    );
  });

  it('returns N/A for empty or invalid values', () => {
    expect(formatBeijingInstant(null)).toBe('N/A');
    expect(formatBeijingInstant(undefined)).toBe('N/A');
    expect(formatBeijingInstant('')).toBe('N/A');
    expect(formatBeijingInstant('not-a-date')).toBe('N/A');
  });
});

describe('defaultBeijingCompleteInput', () => {
  it('uses the Beijing calendar day at 17:00', () => {
    // 2026-11-20 01:00 UTC == 2026-11-20 09:00 Beijing
    expect(
      defaultBeijingCompleteInput(new Date('2026-11-20T01:00:00.000Z')),
    ).toBe('2026-11-20T17:00');
  });
});
