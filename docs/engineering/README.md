# Multi-app engineering

This directory is the team entry for running more than one business application in the `smc-copilot/nocobase` monorepo. Product documentation for NocoBase itself stays under `docs/docs/`; the files here are operational contracts for agents and maintainers.

## Unified integration branch

All integration work targets `develop/v3.0.1`. Do not treat GitHub's default branch (`v3-develop`) or upstream `v3` as the merge destination for this fork's business apps.

## Application catalog

`deployment/apps.json` is the only identity map from App key → directory → npm package name. Tools must call `scripts/lib/app-catalog.mjs` (`readAppCatalog`, `resolveApp`) and fail closed on unknown keys, missing paths, path escape, schema mismatches, or package name drift. Never silently build another app or a template when the requested app is absent.

```bash
node scripts/check-app-engineering.mjs
node scripts/check-app-engineering.mjs --app meeting
```

## Package manager

The repository root `packageManager` is authoritative (`pnpm@11.11.0` as of the P1 integration). Business apps must not carry a second lockfile or a conflicting `packageManager` field.

## Documents in this folder

| File | Topic |
| --- | --- |
| [application-architecture.md](application-architecture.md) | App / public-layer boundaries and identity options |
| [acceptance/](acceptance/) | Run-scoped evidence for integrations and releases |

Further topics (branching, create-business-app, migrations, platform upgrades, releases) land here as later PRs land their mechanisms.
