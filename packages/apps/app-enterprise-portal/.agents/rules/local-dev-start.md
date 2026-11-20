# Enterprise portal local start (Windows)

On this Windows workspace, concurrent Vite + Hono from `pnpm nocobase dev` hangs Vite for ~120s. Do not wrap bare `pnpm dev` as the one-click path.

## Entry points

- `start-dev.cmd`
- `pnpm dev:one` (`scripts/start-dev.ps1`)

## Required order

1. Stop portal-owned node processes and free ports `13000` / `14001` / `5173` / `5174`.
2. Clear parent-shell env overrides (`DB_*`, `PROXY_TARGET_URL`, `DEBUG`, …) so `.env` / `config.yml` win.
3. Start Vite alone and wait until `http://127.0.0.1:5173/main/` answers.
4. Start `server/standalone.ts` with `APP_VITE_DEV_*` pointing at that Vite and `APP_SERVER_PORT=13000`.
5. Wait until `http://127.0.0.1:13000/main/api/healthz` returns `{"ok":true}` before declaring ready.

## Local URL

Application entry: `http://127.0.0.1:13000/main/` (Hono proxies Vite). Do not send users to the Vite port alone.
