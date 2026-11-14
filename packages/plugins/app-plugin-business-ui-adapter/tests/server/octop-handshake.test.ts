import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONNECTION_ID,
  createAdapterHarness,
  SERVICE_SECRET,
  type AdapterHarness,
} from '../helpers/harness.js';

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/octop',
);
const MANIFEST_PATH = path.join(FIXTURE_ROOT, 'MANIFEST.json');
const OUTBOUND_PATH = path.join(FIXTURE_ROOT, 'business_ui/outbound.py');
const RECEIPT_PATH = path.join(FIXTURE_ROOT, 'business_ui/receipt.py');

interface OctopManifest {
  readonly octop_commit: string;
  readonly octop_commit_short: string;
  readonly files: Readonly<Record<string, string>>;
}

function requireFixture(): OctopManifest {
  expect(
    existsSync(MANIFEST_PATH),
    `Octop fixture missing at ${MANIFEST_PATH}`,
  ).toBe(true);
  expect(
    existsSync(OUTBOUND_PATH),
    `Octop outbound.py missing at ${OUTBOUND_PATH}`,
  ).toBe(true);
  expect(
    existsSync(RECEIPT_PATH),
    `Octop receipt.py missing at ${RECEIPT_PATH}`,
  ).toBe(true);
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as OctopManifest;
}

function requirePython(): string {
  for (const candidate of ['python', 'python3']) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) {
      return candidate;
    }
  }
  throw new Error(
    'Python is required for Octop handshake/receipt consumer tests (N29); install Python 3 and retry.',
  );
}

function runConsumer(
  python: string,
  script: string,
  payload: unknown,
): {
  ok: boolean;
  why: string | null;
  missing: string[];
  status?: string;
  result_type?: string;
  receipt_sequence?: number;
} {
  const result = spawnSync(python, ['-c', script, JSON.stringify(payload)], {
    encoding: 'utf8',
  });
  expect(
    result.status,
    `Python consumer failed: ${result.stderr || result.stdout}`,
  ).toBe(0);
  return JSON.parse(result.stdout.trim()) as {
    ok: boolean;
    why: string | null;
    missing: string[];
    status?: string;
    result_type?: string;
    receipt_sequence?: number;
  };
}

const HANDSHAKE_SCRIPT = `
import sys, json
sys.path.insert(0, ${JSON.stringify(FIXTURE_ROOT)})
from business_ui.outbound import evaluate_handshake
body = json.loads(sys.argv[1])
ok, why, missing = evaluate_handshake(body)
print(json.dumps({"ok": ok, "why": why, "missing": missing}))
`;

const RECEIPT_SCRIPT = `
import sys, json
sys.path.insert(0, ${JSON.stringify(FIXTURE_ROOT)})
from business_ui.receipt import merge_receipt
payload = json.loads(sys.argv[1])
merged = merge_receipt(payload["current"], payload["incoming"])
result = merged.get("result") if isinstance(merged.get("result"), dict) else {}
print(json.dumps({
  "ok": True,
  "why": None,
  "missing": [],
  "status": merged.get("status"),
  "result_type": result.get("type"),
  "receipt_sequence": merged.get("receipt_sequence"),
}))
`;

describe('Octop evaluate_handshake / merge_receipt contract (N29)', () => {
  let harness: AdapterHarness;

  afterEach(async () => {
    await harness?.close();
  });

  it('loads the pinned fixture without personal absolute paths', () => {
    const manifest = requireFixture();
    expect(manifest.octop_commit_short).toBe('64689a5b');
    expect(manifest.files['business_ui/outbound.py']).toMatch(
      /^[a-f0-9]{64}$/i,
    );
    expect(FIXTURE_ROOT.includes('git_ai')).toBe(false);
  });

  it('returns a top-level handshake body that Octop accepts', async () => {
    const python = requirePython();
    requireFixture();
    harness = await createAdapterHarness();
    await harness.seedDefaults();
    const handshake = await harness.services.handshake(
      CONNECTION_ID,
      `Bearer ${SERVICE_SECRET}`,
      { protocol: 'business-ui.v1' },
    );

    const verdict = runConsumer(python, HANDSHAKE_SCRIPT, handshake);
    expect(verdict).toEqual({ ok: true, why: null, missing: [] });
  });

  it('rejects malformed handshake bodies (negative)', () => {
    const python = requirePython();
    requireFixture();
    const verdict = runConsumer(python, HANDSHAKE_SCRIPT, {
      protocol: 'business-ui.v1',
      kind: 'other-adapter',
      features: { form_registry: true },
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toBe('unsupported_service_kind');
  });

  it('merges a newer receipt and ignores a stale sequence (receipt positive/negative)', () => {
    const python = requirePython();
    requireFixture();
    const positive = runConsumer(python, RECEIPT_SCRIPT, {
      current: {
        status: 'draft',
        receipt_sequence: 0,
        record_version: 0,
        result: null,
      },
      incoming: {
        status: 'submitted',
        receipt_sequence: 1,
        record_version: 1,
        record_id: 'rec-1',
        result: {
          type: 'SUCCESS',
          status: 'SUCCESS',
          code: null,
          message: null,
          disclosable: true,
          safe_retry: false,
          idempotent: true,
          side_effect: 'committed',
        },
      },
    });
    expect(positive.ok).toBe(true);
    expect(positive.result_type).toBe('SUCCESS');
    expect(positive.receipt_sequence).toBe(1);

    const stale = runConsumer(python, RECEIPT_SCRIPT, {
      current: {
        status: 'submitted',
        receipt_sequence: 2,
        record_version: 1,
        record_id: 'rec-1',
        result: {
          type: 'SUCCESS',
          status: 'SUCCESS',
          code: null,
          message: null,
          disclosable: true,
          safe_retry: false,
          idempotent: true,
          side_effect: 'committed',
        },
      },
      incoming: {
        status: 'submitted',
        receipt_sequence: 1,
        record_version: 1,
        record_id: 'rec-1',
        result: {
          type: 'FAILED',
          status: 'FAILED',
          code: 'X',
          message: 'stale',
          disclosable: true,
          safe_retry: true,
          idempotent: false,
          side_effect: null,
        },
      },
    });
    expect(stale.ok).toBe(true);
    expect(stale.result_type).toBe('SUCCESS');
    expect(stale.receipt_sequence).toBe(2);
  });
});
