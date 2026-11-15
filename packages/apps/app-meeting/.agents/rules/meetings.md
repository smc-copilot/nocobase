# Meeting domain (this application)

This application is a product App under `packages/apps/app-meeting`, not a create-app template. It was started from `@nocobase/app-template-default` (`nocobase.templatePackage`) and keeps native Auth, Users, Authorization, files, secrets and the application shell. Meeting records, access rows, pages, routes, services and migrations stay in this application. Do not move the meeting domain into `packages/plugins`, `app-server`, default, examples, Control or Integration Demo.

B0 is the runnable boundary: sign-in, users and roles, a `/meetings` page, and `GET /api/meetings` / `GET /api/meetings/{meetingId}` filtered by `meeting.granted` record access through `withPolicy`. The list is empty until a later batch imports access. Do not call a meeting gateway, OA, Agent, AnythingLLM or Casdoor from this application.

Page `meetings/access` and action `meeting/read` are separate grants. `meeting-operator` has both; `accounts-manager` has neither. Do not seed either set onto `authenticated:*`, `member`, or every signed-in user. Root remains the platform unrestricted administrator; a user who only has account-management grants must not read meetings.

Later batches (gateway bind, query, import, OA draft, execution check, on-site migration) are not started from B0. OA or gateway payloads that are not confirmed are not replaced with fake success results.
