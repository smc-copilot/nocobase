# P1 — Control and integration-demo templates (Gate A)

Branch: `fix/v3-smc-integration-readiness`  
Packages: `@nocobase/app-template-smc-control`, `@nocobase/app-template-integration-demo`

## Delivered

| Item                                            | Location                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Control template                                | `packages/templates/app-template-smc-control`                                            |
| Integration demo template                       | `packages/templates/app-template-integration-demo`                                       |
| Casdoor identity + Business UI Adapter assembly | template `server/plugins.ts`, `package.json`, `config.example.yml`                       |
| `genericOAuth` wiring                           | `server/config/auth.ts` + `client/config/auth.ts` per plugin docs                        |
| Users / Permission Set pages                    | `client/pages/settings/routes.ts` registered from `client/routes.ts` (FIX-16)            |
| ReleasesAccess binding                          | `server/providers/releases-access.ts` + `publisherAuthorizationGrants()` dual page grant |

## Verify

```bash
pnpm --filter @nocobase/app-template-smc-control test
pnpm --filter @nocobase/app-template-integration-demo test
pnpm --filter @nocobase/app-template-smc-control exec vitest run tests/server/publisher-releases-boundary.test.ts
```

Non-root publisher evidence (R35): Authorization `page:rel-apps/access` plus ReleasesAccess related scopes — see `tests/server/publisher-releases-boundary.test.ts`.

## Environment notes

- In-process Host and Docker Host remain Gate B / operator-owned (`192.168.102.104`).
- Frontend constraint: no new Claude-authored React admin pages for IdP/mapping/connection UI; Gate A initializes via authenticated APIs. See `FRONTEND_MODEL_CONSTRAINT.md`.
