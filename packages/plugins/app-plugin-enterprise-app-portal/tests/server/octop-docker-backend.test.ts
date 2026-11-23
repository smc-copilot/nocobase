import { describe, expect, it } from 'vitest';

import {
  dockerSandboxBackend,
  workspaceDirectoryName,
} from '../../server/services/octop-docker-backend.js';

describe('docker sandbox backend', () => {
  it('builds the Octop docker config for the expert name', () => {
    expect(dockerSandboxBackend('TEST01')).toEqual({
      type: 'docker',
      image: 'python:3.12-slim',
      sandbox_scope: 'agent',
      sandbox_prefix: 'octop_sandbox',
      workspace_path: '/workspace',
      volumes: {
        '/home/smc/.octop/agent-workspaces/TEST01': {
          bind: '/workspace',
          mode: 'rw',
        },
      },
      allow_network: true,
      memory: '1g',
      cpus: 2,
      pids_limit: 256,
    });
  });

  it('keeps the host directory to one path segment', () => {
    expect(workspaceDirectoryName('  a/b\\c  ')).toBe('a_b_c');
    expect(workspaceDirectoryName('..')).toBe('agent');
    expect(workspaceDirectoryName('')).toBe('agent');
  });
});
