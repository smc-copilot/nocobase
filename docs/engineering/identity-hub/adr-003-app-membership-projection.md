# ADR-003: App Membership and local projection

| Field    | Value                                                         |
| -------- | ------------------------------------------------------------- |
| Status   | Proposed                                                      |
| Date     | 2026-11-28                                                    |
| Branch   | `feat/v3-enterprise-identity-hub`                             |
| Baseline | `e4d399b6ee` (P0 commit `95e7b0cc60`)                         |
| PRD      | 17.3, with 6.5, 6.6, 6.7, 9.2, 9.3, 9.5 through 9.7, and 11.4 |

## Context

A Person who exists in the Hub is not thereby a user of every business app. Portal, Meeting, and later apps each have their own database, their own Better Auth session, and their own permission sets. PRD 17.3 asks this ADR to fix who grants membership, where the local user lives, how events travel, and how disable differs from a single-app revoke.

The current Casdoor plugin can provision a local user inside the app that completed login. It does not record an App Membership that another app can revoke, and it does not publish a Hub lifecycle event. This pass did not execute a grant or a revoke against any live system.

## Decision

### Membership and permission sets

App Membership answers one question: may this Person open this app in this environment. Permission sets answer a different question, inside that app: what may the local user do.

The Hub grants and revokes membership. The Hub does not assign application roles, and it does not grant a platform superuser. A group or claim may map onto a permission set only through an explicit per-app allow list. That mapping is configured separately from membership. It never targets `root`. It may revoke only grants that the same rule created and still owns. Grants an administrator made by hand stay in place. Membership alone does not add a permission set.

Default posture is closed. A new Person receives no app until a grant or an explicit group rule says so.

### Who may grant and revoke

An authorized Hub administrator, or a Hub service identity recorded as the actor, grants and revokes membership. The Person does not grant their own membership. Every change stores the actor, a reason, and a monotonic `revision`.

A grant moves membership toward `active` (from `invited` when a two-step invite is used). A revoke sets `revoked` on one membership row. Suspend sets `suspended`. Person disable is a different operation: the Person status becomes `disabled`, and every registered app must stop accepting that Person. Revoke of Meeting leaves Portal membership and Portal sessions untouched.

### App identity

`appId` is the stable business key, such as `portal` or `meeting`. It is not the directory name, the npm package name, or the deploy instance name. Those mappings already differ in this fork (`enterprise-portal` versus `@superice/app-enterprise-portal`).

Each AppRegistry row is one business app in one environment (`dev`, `test`, `staging`, `prod`). Membership references that row, so a test grant does not open production. The PRD unique key is (`personId`, `appId`) with environment stored on the registry. This ADR proposes the implemented unique key be (`personId`, registry row), and the registry row be unique on (`appId`, `environment`). P2 should encode that so two environments cannot collapse into one membership.

Suggested membership fields are the PRD 6.6 set: `membershipId`, `personId`, registry reference, `status` (`invited`, `active`, `suspended`, `revoked`), `source` (`manual`, `group-rule`, `migration`), `validFrom`, `validTo`, `revision`, actors, `reason`, and timestamps.

Person `active` plus membership `active` allows a new session in that app. Person `active` plus membership `revoked` refuses that app only. Person `disabled` refuses every app. A disabled or retired app refuses new sessions for everyone.

### Where AppUserBinding lives

`AppUserBinding` lives in each business app's database. The Hub does not store local user ids, and a business app does not read another app's user table.

Proposed columns match PRD 6.7: local binding id, `personId`, `localUserId`, `status` (`active`, `disabled`, `pending`), `membershipRevision`, `personRevision`, `sourceRevision`, `lastSyncedAt`, and timestamps. Inside one app, `personId` is unique and `localUserId` is unique. The same Person may have a different local user id in Meeting than in Portal. The binding stores no upstream password and no refresh token.

The Hub learns that a projection exists only through its own audit and through reconciliation reports the app is willing to expose. It does not join the app database.

### Events travel through the existing outbox

Lifecycle events are published with `@nocobase/app-plugin-message-broker`. The write to Person or App Membership and the `publish(message, { transaction })` call commit in the same database transaction. The plugin's collection is `messageBrokerOutbox`. This design uses that collection. It does not add a second outbox table such as the PRD's illustrative `provisioningOutbox`.

Event types are the PRD 9.6 list: `PersonCreated`, `PersonUpdated`, `PersonDisabled`, `PersonEnabled`, `PersonArchived`, `IdentityLinked`, `IdentityUnlinked`, `AppMembershipGranted`, `AppMembershipSuspended`, `AppMembershipRevoked`, `OrganizationChanged`, `DepartmentChanged`.

The payload follows PRD 11.4: `eventId`, `eventType`, `aggregateType`, `aggregateId`, `aggregateVersion`, `targetAppId`, `payloadVersion`, `occurredAt`, and a small `payload`. `payloadVersion` starts at 1. `eventId` is the broker `messageId` consumers use for idempotency. Payloads carry no passwords, cookies, authorization codes, access tokens, or client secrets. A membership event names one target app. A Person disable names every registered app, as one message per app or one fan-out the dispatcher records per app. P2 picks one of those shapes and tests it. Consumers check the target app id and drop a message aimed at someone else.

Delivery is at least once. The plugin README states that a crash after the middleware accepts a message and before the row is marked sent will send it again. Consumers subscribe with `inbox: true` and treat a repeated `messageId` as success. Handlers write their own database work through the inbox transaction. HTTP side effects need their own idempotency.

Publishers set the ordering key to `personId`. The relay already holds back later messages with the same publisher and key inside a round when a send fails. Consumers still apply revision checks: a `PersonDisabled` or membership revoke for revision N wins over an attribute update at an older revision, even if the older update is seen later.

The administrative HTTP namespace, when P2 adds routes, follows the repository rule: a camelCase plugin namespace and no version segment. That is `/api/identityHub/...`, in place of the PRD's illustrative `/api/identity/v1/...`. The event contract above is the semantic payload, independent of that path.

### Disable and session revoke

These are expectations for the Hub and the later identity client. They are not live behavior, and the 30 second figure from PRD 9.7 is a target SLO, not a measurement.

When a Person is disabled, the Hub refuses new authentication and new token issuance as soon as the Broker is in the loop. Until a Broker exists, the Hub's own status is the authority and there is no central token service to stop. Each app that consumes `PersonDisabled` marks the local projection disabled and revokes that app's sessions. `UserAdministrationService.disable` already sets `disabledAt` and calls `internalAdapter.deleteUserSessions` on the app database. The client uses that service for session revoke. Enabling the Person does not restore old sessions.

When one App Membership is revoked, only the target app revokes sessions. Other apps keep their sessions and their local users. Logout inside one app revokes that app's Better Auth session only. A global logout depends on Broker end-session plus each app's revoke, and Broker logout was not tested. A short access token is not a substitute for session revoke. High-risk app operations may re-read Person and membership status. That live read is optional until the client exists.

### Reconciliation and repair

Each binding stores the revisions it has applied. A reconcile compares Hub `version` and membership `revision` with `personRevision`, `membershipRevision`, and `sourceRevision` on the binding. Drift is repaired by re-applying the latest Hub fact, idempotently. An operator can re-drive a single Person for a single app. P1 does not define a screen for that repair. P2 records conflicts in Hub storage. The cross-app repair action lands with the client.

## Replay and dead-letter gaps

The message-broker README describes retry without a dead-letter state. A row that cannot be sent waits 2 seconds, then doubles up to 5 minutes, with no attempt limit. `attempts` and `lastError` stay on the row. Sent rows are deleted after `outboxRetention` (default 24 hours). This pass found no dead-letter status and no operator API that replays an already-sent or exhausted message.

PRD 11.4 asks for a dead-letter record, manual replay, per-app reconciliation, and failure alerts. Those gaps stay open. P2 must not invent a second outbox table to paper over them. Acceptable later answers are an extension of `@nocobase/app-plugin-message-broker`, or a Hub audit row that an operator uses as the source when they publish a new message with a new `messageId`. Neither answer is selected here.

Other open transport facts: the production middleware behind the broker is not chosen, and an in-process memory backend is not durable. Cross-app delivery from a future identity-center process to Portal and Meeting is therefore undesigned. Several relay instances need a shared lock backend; process-local locks duplicate delivery, which the inbox deduplicates.

## Consequences

P2 can grant and revoke membership inside the Hub and publish those changes through the existing outbox in the same transaction. P2 does not project local users into Portal or Meeting and does not claim the 30 second SLO. Session revoke in each app waits for the identity client in ADR-004.

## Open questions

Dead letter and manual replay, as above. One message per app versus a fan-out record for Person disable. Whether membership uniqueness is (`personId`, `appId`) only, or (`personId`, `appId`, `environment`) as proposed here. Which service credential an app accepts when the internal provisioning route from ADR-004 is built.
