# Octop OIDC integration gaps

Octop is out of this repository. The notes below are from a read-only public TencentCloud/Octop review and do not claim BC01/BC02 end-to-end.

## What Octop does today

- Binds `provider_id + subject`.
- JIT-creates a local user when the subject is new.
- Username is taken from `preferred_username` or the e-mail local-part.
- Default role is a normal user. Groups are not mapped to admin.

## What this portal requires

- Trusted `employeeNo` exact unique match to NocoBase `user.username`.
- No e-mail auto-merge.
- Casdoor `issuer + sub` is the only external identity key.

## Gaps

1. Octop does not read `employeeNo`.
2. The Octop browser callback lands on `/login/oidc/complete#code=...`; the frontend auto-exchange file is a 404 in the reviewed tree.
3. Per-instance JWT issuance stays in Octop. This portal launches an allowlisted HTTPS URL after Casdoor access, health and enabled rechecks; it does not mint Octop tokens.

Do not claim a live Octop login until those gaps are closed in the Octop repository.
