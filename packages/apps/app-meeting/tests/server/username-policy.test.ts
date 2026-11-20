import { describe, expect, it } from 'vitest';

import { isMeetingUsername } from '../../server/config/auth.js';

describe('meeting username policy', () => {
  it('accepts a Chinese name and a hyphenated employee id', () => {
    expect(isMeetingUsername('王冬辉')).toBe(true);
    expect(isMeetingUsername('smc-sz-hr21007')).toBe(true);
    expect(isMeetingUsername('managed.user')).toBe(true);
  });

  it('rejects blank, spaced, and symbol-only names', () => {
    expect(isMeetingUsername('王 冬辉')).toBe(false);
    expect(isMeetingUsername('smc sz')).toBe(false);
    expect(isMeetingUsername('name@host')).toBe(false);
    expect(isMeetingUsername('')).toBe(false);
  });
});
