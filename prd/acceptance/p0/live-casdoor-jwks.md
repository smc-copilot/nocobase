# P0 live Casdoor JWKS evidence

Date: 2026-11-13 (Asia/Shanghai)

## Instance

| Field              | Value                                              |
| ------------------ | -------------------------------------------------- |
| Source checkout    | `D:\git\casdoor`                                   |
| Source SHA         | `d61ee823196151e9c282d497a78ec66a800ea91f`         |
| Runtime            | `go run .` with local Go 1.27.4                    |
| Database           | PostgreSQL `smc_casdoor` on `192.168.102.247:5432` |
| Base URL           | `http://localhost:8000`                            |
| Issuer (discovery) | `http://localhost:8000`                            |

## Probes

- `GET /.well-known/openid-configuration` → 200, includes `issuer`, `jwks`/`jwks_uri` related endpoints, token and userinfo endpoints.
- `GET /.well-known/jwks` → 200.
- Automated plugin tests use an ephemeral RSA JWKS (see plugin test suite); they do not depend on this live instance.

## Remaining live steps

- Set built-in admin password (first-start prompt) and create Control/Demo OAuth clients with JWT access tokens.
- Record client IDs, redirect URIs, and audience/scope in the P2 acceptance folder once issued.
- Origin push for `feat/v3-smc-casdoor-identity` remains blocked until SSH/PAT is configured.
