# Adapter error codes (PRD §10.7)

Stable local error codes for the NocoBase Business UI Adapter and Casdoor identity path. Clients branch on `reason` (and HTTP status), not on human-readable messages. Octop is not required to translate every code into a dedicated UI.

| Code                       | HTTP mapping                                                     | When                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_REQUIRED`            | 401                                                              | Missing, invalid, or expired user access token; unactivated subject; handshake without a usable credential. Do not return document content.      |
| `ACCOUNT_DISABLED`         | 403                                                              | Local user is disabled after successful token verification and binding lookup. Emit a security audit event.                                      |
| `SUBJECT_BINDING_REQUIRED` | 403                                                              | Valid external token but no `externalIdentities` (or subject-binding) row maps issuer+subject to a local user.                                   |
| `SUBJECT_MISMATCH`         | 403                                                              | Token or binding subject does not match the interaction, ticket, or resource owner. Prefer anti-enumeration where applicable.                    |
| `FORM_NOT_REGISTERED`      | 400 or 404                                                       | `formRef` (and version) is unknown, disabled, or not registered for this App.                                                                    |
| `TICKET_EXPIRED`           | 403                                                              | One-time ticket past `expiresAt`. Caller must obtain a new ticket.                                                                               |
| `TICKET_REPLAYED`          | 403                                                              | Ticket already consumed (`consumedAt` set) or otherwise not atomically claimable.                                                                |
| `VERSION_CONFLICT`         | 409                                                              | Optimistic lock failure on `recordVersion` / `record_version`. Caller must reload and reconcile; do not overwrite.                               |
| `OPERATION_NOT_FOUND`      | 404                                                              | Queried `operationId` does not exist for the authenticated subject/interaction.                                                                  |
| `RETRY_NOT_SAFE`           | 200 with technical/business result, or 409 when refusing a write | Confirmed failure or unknown outcome where a second submit is not safe; client may only query the original operation when `safe_retry` is false. |

## Related HTTP behaviours (not separate codes)

| Situation                                       | HTTP / receipt handling                                              |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| Invalid connection service credentials          | 401 or 403; handshake fails                                          |
| Recognized business rule rejection              | HTTP 200 with authoritative receipt `result` `BUSINESS_REJECTED`     |
| Confirmed technical failure without side effect | `TECHNICAL_ERROR` / `FAILED` with `safe_retry` only when truly safe  |
| Result uncertain or response lost               | `TECHNICAL_ERROR` / `UNKNOWN`; query only, never create a new submit |

Management APIs may use native NocoBase `ApiError` shapes. Protocol endpoints must keep the HTTP status and body behaviour above so Octop’s existing plugin can branch correctly.
