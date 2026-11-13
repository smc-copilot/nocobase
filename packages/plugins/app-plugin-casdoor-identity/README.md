# @nocobase/app-plugin-casdoor-identity

Casdoor (and compatible OIDC) JWT credential resolution for NocoBase applications.

## P0 spike

At boot the server provider registers `Auth.addCredentialResolver()`:

1. Read `Authorization: Bearer` or `X-Casdoor-Access-Token`
2. Verify the JWT with JWKS (`casdoorIdentity.issuer`, `audience`, `jwksUri` or static `jwks`)
3. Map `iss` + `sub` through the `externalIdentities` collection
4. Return an issued credential for the bound local user

A demo route `GET /api/casdoorIdentity/me` uses `auth.required({ scopedKeys: true })` and returns the native user id.

## Configuration

```yaml
casdoorIdentity:
  issuer: https://sso.example.com
  audience: nocobase-app
  jwksUri: https://sso.example.com/.well-known/jwks
```

## Tests

```bash
pnpm --filter @nocobase/app-plugin-casdoor-identity test
```

CI uses an ephemeral RSA keypair and local JWKS. Live Casdoor verification is a separate evidence step; see `prd/acceptance/p0/README.md`.
