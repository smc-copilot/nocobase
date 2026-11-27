# Local development start (Meeting)

Read this before starting or restarting this application on a developer machine.

This is an instance of the repository-wide agent rule `.cursor/rules/agent-scripts-and-ops.mdc`: every start/restart/one-click script the agent writes must encode known order, env hygiene, and readiness checks — not only for Meeting.

## Required entry

Use only:

- `start-dev.cmd` in this application root, or
- `pnpm dev:one` (runs `scripts/start-dev.ps1`)

Do not start Meeting from an agent shell with bare `pnpm dev` / `nocobase dev` on Windows when that path has already shown a Vite readiness hang.

## Required order

`scripts/start-dev.ps1` must keep this order:

1. Stop previous Meeting / Meeting-proxy node processes and free Meeting ports they own.
2. Clear parent-shell overrides that would replace `.env` (`DB_DIALECT`, `DB_STORAGE`, other `DB_*`, `PROXY_TARGET_URL`, `DEBUG`).
3. Start Vite and wait until `http://127.0.0.1:<vitePort>/main/` answers.
4. Start the application server and wait until `.../main/api/healthz` returns ok.
5. Start the public entry proxy (`13000` → backend) and wait until the public healthz answers.
6. Print the `Local:` URL from the successful public entry (normally `http://127.0.0.1:13000/main/`).

## Why

On this Windows workspace, starting Vite concurrently with the Hono server under `nocobase dev` has repeatedly left Vite unbound for 120 seconds; the supervisor then stops the stack. Vite alone becomes ready in about one second. Cursor agent shells have also injected `DB_DIALECT=sqlite` / `DB_STORAGE=:memory:`, which override `packages/apps/app-meeting/.env` and silently drop Postgres.

## Failure handling

If startup fails, fix `scripts/start-dev.ps1` or stop and ask. Do not invent a third unofficial launch path that reintroduces concurrent Vite start or polluted `DB_*` env.
