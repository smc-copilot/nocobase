# Phase 0 — Environment status

Date: 2026-11-13 (Asia/Shanghai)
Baseline: `feature/v3.0.1` @ `e1f584e6d514aca08c762f6cbba43a4848d5f363`

## Machine inventory

| Resource                             | Status        | Notes                                                                          |
| ------------------------------------ | ------------- | ------------------------------------------------------------------------------ |
| Local Node                           | OK            | v24.14.1                                                                       |
| Local pnpm                           | OK            | 11.7.0 (packageManager)                                                        |
| Local Go                             | OK            | installed Go 1.27.4 via winget for Casdoor                                     |
| Local Docker                         | Not installed | per grilling decision; Docker Host acceptance on remote                        |
| PostgreSQL `192.168.102.247:5432`    | OK            | PostgreSQL 16.13                                                               |
| Databases                            | OK            | created `smc_control`, `smc_demo_a`, `smc_demo_b`, `smc_casdoor`               |
| Remote `192.168.102.104`             | OK            | Ubuntu `cowork-001`, Docker 29.4.0, 16 CPU, ~31 GiB RAM, 913G disk (~40% used) |
| Remote Node                          | Present       | v22.22.1 (host OS)                                                             |
| Origin push (`smc-copilot/nocobase`) | BLOCKED       | `git@github.com: Permission denied (publickey)` — SSH key/PAT not configured   |
| `fix/v3-dev-config-win-spawn`        | Local only    | commit `f841116255`; push/PR pending origin access                             |
| Octop host materials                 | Pending user  | fixed plugin SHA `64689a5b…`; local checkout `D:\git_ai\octop` not on baseline |

## Rulings

1. **Origin push deferred** — product branches are created and committed locally; PR workflow resumes when SSH/PAT is available. Cost if wrong: delayed review only.
2. **Casdoor** — local source at `D:\git\casdoor` SHA `d61ee823196151e9c282d497a78ec66a800ea91f`; Go installed to enable `go run`. Token format JWT+JWKS.
3. **Credentials** — remote SSH password and DB password are not stored in this acceptance tree; they remain operator-held.

## Exit checklist

- [x] Remote SSH reachable and Docker available
- [x] PG databases planned and created
- [x] Casdoor JWKS fetch verified (`http://localhost:8000/.well-known/jwks` → 200; see `prd/acceptance/p0/live-casdoor-jwks.md`)
- [ ] Casdoor JWT access-token issuance for Control/Demo clients (admin password / clients still being finalized)
- [ ] Origin push unblocked (user)
- [ ] Octop fixed-SHA package prepared (user)
