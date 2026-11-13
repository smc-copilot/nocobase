---
name: nocobase-app-plugin-business-ui-adapter
description: Wire the Octop business-ui.v1 adapter into a NocoBase application — connections, forms, tickets, embed HTML, save/submit, and receipts.
---

# Business UI Adapter

## When to use

Use this Skill when an application must speak Octop `business-ui.v1` against registered connections without modifying Octop or Casdoor.

## Install

- Server plugin `@nocobase/app-plugin-business-ui-adapter/server`.
- Peer `@nocobase/app-plugin-casdoor-identity` for subject bindings and token resolution.
- Configure `businessUiAdapter.publicBaseUrl` for absolute `redeem_url` values.

## Contracts

- Protocol paths: `/business-ui/connections/{connectionId}/v1/{handshake|oauth|tickets|documents|interactions|operations}`.
- Seven-field receipts emit camelCase and snake_case from one serializer; `record_id` and `record_version` are mandatory.
- `operationId` is persisted before side effects; UNKNOWN is query-only; retries of UNKNOWN are rejected.
- Embed UI is server HTML from ticket redeem — do not add Claude-authored React pages for the generic form.

## Admin API

`POST /api/businessUiAdapter/connections` and `POST /api/businessUiAdapter/forms` register connections (service secret hashed) and whitelisted forms.
