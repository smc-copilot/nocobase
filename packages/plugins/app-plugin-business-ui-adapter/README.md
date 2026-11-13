# @nocobase/app-plugin-business-ui-adapter

Octop `business-ui.v1` protocol adapter for NocoBase applications: connection registry, form whitelist, OAuth code handoff, tickets, embed sessions, document save/submit, operations, and receipts.

## Protocol mount

Per-connection routes live under:

`/business-ui/connections/{connectionId}/v1/*`

Protocol responses are top-level JSON (or HTML for ticket redeem). Management APIs stay under `/api/businessUiAdapter/*` with the standard `{ data }` envelope.

## Forms

Only whitelisted handlers may be registered. This package ships `generic-request` for `generic.request.edit` / `generic.request.detail` (title, description, quantity). Arbitrary URLs as `formRef` are rejected. The redeem endpoint returns server-rendered HTML; there is no React client page in this plugin.

## Identity

User access tokens are admitted through Authentication issued credentials (Casdoor via `@nocobase/app-plugin-casdoor-identity`). Subject pre-bindings come from `businessUiSubjectBindings` owned by that plugin.

## Develop

```bash
pnpm --filter @nocobase/app-plugin-business-ui-adapter test
pnpm --filter @nocobase/app-plugin-business-ui-adapter typecheck
```
