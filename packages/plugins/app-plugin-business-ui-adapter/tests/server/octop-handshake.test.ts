import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  CONNECTION_ID,
  createAdapterHarness,
  SERVICE_SECRET,
  type AdapterHarness,
} from '../helpers/harness.js';

const OCTOP_PLUGIN = path.resolve('D:/git_ai/octop/plugins/business-ui');

describe('Octop evaluate_handshake contract', () => {
  let harness: AdapterHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('returns a top-level handshake body that Octop accepts', async () => {
    if (!existsSync(OCTOP_PLUGIN)) {
      // Gate B / local Octop checkout is optional for CI that lacks the sibling tree.
      return;
    }
    harness = await createAdapterHarness();
    await harness.seedDefaults();
    const handshake = await harness.services.handshake(
      CONNECTION_ID,
      `Bearer ${SERVICE_SECRET}`,
      { protocol: 'business-ui.v1' },
    );

    const script = `
import sys, json
sys.path.insert(0, ${JSON.stringify(OCTOP_PLUGIN)})
from business_ui.outbound import evaluate_handshake
body = json.loads(sys.argv[1])
ok, why, missing = evaluate_handshake(body)
print(json.dumps({"ok": ok, "why": why, "missing": missing}))
`;
    const result = spawnSync(
      'python',
      ['-c', script, JSON.stringify(handshake)],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    const verdict = JSON.parse(result.stdout.trim()) as {
      ok: boolean;
      why: string | null;
      missing: string[];
    };
    expect(verdict).toEqual({ ok: true, why: null, missing: [] });
  });
});
