/**
 * Docker sandbox passed when Agent Grants installs a published expert.
 * Octop `POST /api/agents` wraps the same object as `config.backend`.
 * The install API takes it as a top-level `backend`.
 * The host directory is one segment under the Octop workspace root and
 * matches the expert name sent as `name`.
 */
export const OCTOP_AGENT_WORKSPACE_ROOT = '/home/smc/.octop/agent-workspaces';

export function workspaceDirectoryName(name: string): string {
  const segment = name.trim().replace(/[\\/]/g, '_').replace(/\0/g, '');
  if (segment === '' || segment === '.' || segment === '..') return 'agent';
  return segment;
}

export function dockerSandboxBackend(
  agentName: string,
): Record<string, unknown> {
  const directory = workspaceDirectoryName(agentName);
  const hostPath = `${OCTOP_AGENT_WORKSPACE_ROOT}/${directory}`;
  return {
    type: 'docker',
    image: 'python:3.12-slim',
    sandbox_scope: 'agent',
    sandbox_prefix: 'octop_sandbox',
    workspace_path: '/workspace',
    volumes: {
      [hostPath]: {
        bind: '/workspace',
        mode: 'rw',
      },
    },
    allow_network: true,
    memory: '1g',
    cpus: 2,
    pids_limit: 256,
  };
}
