---
'@nocobase/app-plugin-agent-authorization': patch
'@nocobase/app-plugin-business-ui-adapter': patch
'@nocobase/app-plugin-authentication': patch
'@nocobase/app-template-smc-control': patch
---

Fail closed on embeds and tickets without a scope snapshot, stamp client and credential epochs so disable never revives old tokens or embeds, hook native user disable into agent credential revocation, and complete Control client registration and edit fields.
