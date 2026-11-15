---
'@nocobase/app-plugin-authentication': patch
'@nocobase/app-plugin-agent-authorization': patch
---

Run user-disable hooks on the same database connection as the disable write, fail closed when a critical hook such as agent credential revocation errors, and keep OAuth revoke confidential-client authenticated for Octop-shaped client_secret_post bodies.
