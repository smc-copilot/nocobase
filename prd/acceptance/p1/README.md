# P1 — Control plane templates

Date: 2026-11-13 (Asia/Shanghai)
Branch: `feat/v3-smc-control` (worktree `D:\git\nocobase-wt-smc-control`)

## Delivered

| Item                              | Location                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| Control template                  | `packages/templates/app-template-smc-control`                                        |
| `releasesAccessToken` binding     | `server/providers/releases-access.ts`                                                |
| Releases + drive + secrets config | `config.example.yml`                                                                 |
| Managed demo template             | `packages/templates/app-template-integration-demo`                                   |
| create-app aliases                | `smc-control`, `integration-demo` in `packages/tools/create-app/src/lib/template.ts` |

## Acceptance notes

- **In-process Host**: enable `releases.host` in `config.yml` on a machine that can run child App Host processes. Local Windows can exercise API and access mapping without enabling the host child.
- **Docker Host**: deferred to remote `192.168.102.104` (Docker available). Marked environment-pending until an operator enables `releases.docker` there and records REC-02 evidence.
- **Frontend**: Control reuses the Releases plugin client pages; no new React pages were authored for P1. Future custom UI must not use Claude models for page implementation (team constraint 2026-11-13).

## How to verify access mapping

```bash
pnpm --filter @nocobase/app-template-smc-control exec vitest run tests/server/releases-access.test.ts
```
