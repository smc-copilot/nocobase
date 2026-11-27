# AGENTS.md

Read the owning App's `AGENTS.md` and `<app-root>/.agents/skills/nocobase-app-plugin-development/SKILL.md` by path before implementation. The Skill comes from the App's installed `@nocobase/app-skills`; do not install a global copy or edit synchronized output. If missing, check the installed package and App upgrade guidance. In the NocoBase source repository, read the same Skill at `packages/app/app-skills/skills/nocobase-app-plugin-development/SKILL.md` and the repository's `.agents/rules/plugin-development.md`.

This is a NocoBase application plugin. Pages that render the catalog, identity binding and audit APIs belong to the installing application. Do not add Client routes here.

Casdoor is the application-access authority. This plugin never treats the administrator catalog or a local Permission Set as Casdoor application authorization.
