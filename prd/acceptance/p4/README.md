# P4 acceptance — remote integration (status)

Date: 2026-11-13  
Hosts: Control / demo Apps (local code), Casdoor (`D:\git\casdoor`), remote Docker `192.168.102.104`, PG `192.168.102.247`

## DoD matrix (PRD §19.2)

| Item                                                               | Status                         | Notes                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| A–F business scenarios on remote Octop + dual demos                | 环境待确认                     | Octop plugin package at fixed SHA `64689a5b…` and origin push still blocked for the user; no forged run evidence. |
| UNKNOWN sequences (first submit / save-then-submit / lost receipt) | Unit/integration covered in P3 | Remote browser confirmation pending Octop host.                                                                   |
| SEC-01..09                                                         | Partial                        | Identity negatives covered in P0/P2 tests; remote SEC matrix pending.                                             |
| CON-01..03                                                         | 环境待确认                     | Connection isolation paths implemented; remote multi-connection hosts pending.                                    |
| REC-01..05                                                         | 环境待确认                     | Digest/pull/restore need remote Docker registry credentials.                                                      |
| HTTPS + iframe cookies                                             | 环境待确认                     | Dev remains HTTP; P4 must install TLS before claiming Cookie embed.                                               |
| Backup / restore + secret rotation                                 | 环境待确认                     | Manual ops checklist below; not executed on remote yet.                                                           |
| Ops handbook (D10)                                                 | Draft                          | See `ops-handbook.md` in this folder.                                                                             |
| Browser versions                                                   | Not recorded                   | Record when remote UI runs.                                                                                       |

## What is ready locally

- Phase 0 inventory + Casdoor JWKS probe (`prd/acceptance/phase0-environment.md`, `prd/acceptance/p0/`).
- Casdoor identity IAM (`prd/acceptance/p2/`).
- Control + integration-demo templates (`feat/v3-smc-control`).
- Business UI Adapter protocol + tests (`prd/acceptance/p3/`).

## Blockers owned by the user

1. Restore `origin` push permission for `smc-copilot/nocobase` (SSH key or PAT).
2. Provide Octop host install package pinned to SHA `64689a5b9863d974783f0605ed7673a7d5f73b22`.
3. Casdoor admin password / client credentials for live JWT issuance (JWKS already probed).
4. Remote HTTPS material (self-signed + hosts, or real subdomains) and Casdoor redirect URI registration per connection.
