/**
 * Named Docker sandbox used when Agent Grants installs a published expert.
 * Create and append both send this as the install body's top-level `backend`.
 * Octop resolves `name` to the preconfigured sandbox instead of a per-request
 * container spec.
 */
export const NAMED_SANDBOX_BACKEND = {
  type: 'named',
  name: 'sandbox',
} as const;

export function dockerSandboxBackend(): Record<string, unknown> {
  return { ...NAMED_SANDBOX_BACKEND };
}
