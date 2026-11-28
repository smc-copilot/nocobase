# AGENTS.md

Read the repository `AGENTS.md`, `.agents/rules/plugin-development.md`, and `packages/app/app-skills/skills/nocobase-app-plugin-development/SKILL.md` before changing this plugin.

This package is a server-only NocoBase application plugin. It owns `identityHub*` tables. It does not import `@nocobase/app-plugin-casdoor-identity`. Do not register it into Portal or Meeting from this package.

Identity-sensitive packages (`@nocobase/app-server`, `@nocobase/db`, `@nocobase/service-provider`, and other `@nocobase/app-plugin-*`) stay in `peerDependencies`. `hono` and `zod` stay in `dependencies`.

Migrations are self-contained and immutable once merged. The migration `name` matches its filename. Routes live under `/api/identityHub` and declare `describeRoute()`.
