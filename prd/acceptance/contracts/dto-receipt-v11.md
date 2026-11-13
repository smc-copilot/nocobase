# Receipt DTO v1.1 — seven-field contract

This document freezes the Business UI Adapter receipt DTO used by SMC Enterprise Integration (PRD §10.5–§10.6). Implementations must generate both camelCase and snake_case field names from a single DTO; never hand-copy the two shapes independently.

## Required seven fields

| camelCase        | snake_case alias  | Notes                                                                                                              |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `documentType`   | `document_type`   | Logical document type, for example `generic.request`.                                                              |
| `recordId`       | `record_id`       | Persistent record identifier. **Mandatory on every receipt response** (`record_id` must always be present).        |
| `formRef`        | `form_ref`        | Registered form reference used to open edit or detail.                                                             |
| `schemaVersion`  | `schema_version`  | Form schema version string.                                                                                        |
| `recordVersion`  | `record_version`  | Optimistic concurrency version. **Mandatory on every receipt response** (`record_version` must always be present). |
| `allowedActions` | `allowed_actions` | Server-authorized action list for the current subject and context; never trust client-supplied values.             |
| `interactionId`  | `interaction_id`  | Stable interaction identifier tying ticket, operation, and receipt.                                                |

## Generation rule

One internal DTO (or serializer) emits both naming styles in the same response body. Values for each pair must be identical. Adding a field in only one naming style is a contract violation.

## Mandatory aliases

Current Octop Business UI plugin compatibility requires `record_id` and `record_version` on the wire even when the camelCase forms are also present. Omitting either snake_case field is a failure regardless of camelCase output.

## Related receipt fields (not part of the seven)

Receipts may also carry protocol fields such as `status`, `result`, `operation_id` / `operationId`, `receipt_sequence`, `summary`, and `navigation`. Those fields follow the same dual-naming discipline where both forms are documented for the protocol, but they are outside the frozen seven-field core.
