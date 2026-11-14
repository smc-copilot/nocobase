# Octop consumer fixture (pinned SHA `64689a5b`)

Vendored sources from the Octop `business-ui` plugin at commit `64689a5b9863d974783f0605ed7673a7d5f73b22`. Used by `tests/server/octop-handshake.test.ts` so Gate A does not depend on a sibling checkout under a personal absolute path.

## Integrity

`MANIFEST.json` records the commit SHA and a SHA-256 digest for each file. Re-extract with a binary-safe write (do not use PowerShell `Out-File`):

```bash
python -c "..."  # see Gate A report / agent notes: git -C <octop> show <sha>:<path> → write_bytes
```

## Runtime

`evaluate_handshake` lives in `business_ui/outbound.py` and imports `business_ui.security` plus `httpx`. Install Python 3 with `httpx` available. Missing Python or fixture fails the test (N29); there is no silent skip.
