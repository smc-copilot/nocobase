# Identity Hub App Plugin

The Identity Hub plugin is the provider-neutral record of persons, linked identities, identity providers, organizations, applications, and per-application memberships. It does not install itself into an application (`pluginPolicy: do-not-preinstall`) and it does not replace the Casdoor identity plugin.

Register the Server entry only in an application that is ready to own enterprise identity master data. Authentication and Authorization are peers: every `/api/identityHub` route requires a session and an `identityHub.*` settings grant. Migrations live in `database/migrations` and run against the installing application's default connection.

Writes commit the row, an `identityHubAuditEvents` record, and an outbox message in one database transaction. This cut publishes through an `OutboxPublisher` port. The production adapter should call message-broker `publisher('identity-hub').publish(message, { transaction })`. The default publisher is a no-op so the hub does not create a second outbox table. See `reports/identity-hub/p2-core-report.md`.
