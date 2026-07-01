# Release Audit

Audit date: 2026-07-01

Scope: `academyinfo-mcp` v0.1 final release gate for file-first, read-only MCP
behavior, no-key operation, package safety, and public documentation.

Rule: if any required gate fails, the release recommendation is `NO-GO`.

## PASS/FAIL Table

| Gate | Result | Evidence |
| --- | --- | --- |
| `npm run build` exits 0 | PASS | `C001-command-gates.json` |
| `npm run test` exits 0 | PASS | `C001-command-gates.json` |
| `npm run doctor` exits 0 | PASS | `C001-command-gates.json` |
| `npm run package:check` exits 0 | PASS | `C001-command-gates.json` |
| `npm run prepublishOnly` exits 0 | PASS | `C001-command-gates.json` |
| `npm pack --dry-run --json` completes and parses | PASS | `C002-package-safety.json` |
| Package includes required `15118998` seed artifacts | PASS | `C002-package-safety.json` |
| Package excludes `15139279` paths/data | PASS | `C002-package-safety.json` |
| Package excludes raw XLSX/CSV files | PASS | `C002-package-safety.json` |
| Package excludes `.env` and service key values | PASS | `C002-package-safety.json` |
| README states v0.1 requires no API key | PASS | `C003-docs-audit.json` |
| README states `15118998` is bundled as normalized derivative | PASS | `C003-docs-audit.json` |
| README states `15139279` is non-bundled / local ingest only | PASS | `C003-docs-audit.json` |
| Release audit includes required sections and recommendation | PASS | `C003-docs-audit.json` |

## Command Output Summary

Evidence was captured from actual command execution with local absolute paths
masked in stored artifacts.

- `npm run build`: exit 0; TypeScript compilation completed.
- `npm run test`: exit 0; Vitest reported 4 test files passed and 13 tests passed.
- `npm run doctor`: exit 0; reported `api_key_required: false` and
  `api_key_policy: not_required_for_v0.1`; both reserved service-key variables
  were reported as unset; all three seed artifacts were present.
- `npm run package:check`: exit 0; required seed SQLite, manifest, and data
  license files were present; `package_check: ok`.
- `npm run prepublishOnly`: exit 0; build and package check both passed.

## Package File List Summary

`npm pack --dry-run --json` completed with exit 0 and produced a parsed file
list of 47 package entries.

Required seed artifacts included:

- `data/seed/academyinfo_15118998.sqlite`
- `data/seed/academyinfo_15118998.manifest.json`
- `data/seed/LICENSE.15118998.md`

Required policy/docs artifacts included:

- `README.md`
- `DATA_LICENSE.md`
- `NOTICE.md`
- `package.json`

Forbidden artifact checks returned zero matches for:

- `15139279`
- `data/raw`
- `data/external`
- `.env`
- raw `.xlsx`
- raw `.csv`
- service key values

The package list also contains built `dist/**` files and npm's standard
metadata file `package.json`. Standard npm metadata inclusion is expected and
is not treated as a package-safety failure.

## Remaining Risks

- Source columns, units, and raw file headers remain `NotVerified` until the
  evidence-lock ingestion phase verifies actual downloaded headers or official
  documentation.
- The current seed manifest marks `seed_is_latest_claim=false`; this release
  must not claim that the bundled seed is the latest source data.
- The seed manifest currently records `seed_content_status` as
  `metadata_only_no_observations`; value-serving release gates must replace it
  with a normalized derivative seed DB before serving real indicator values.
- OpenAPI remains future v0.3 work. v0.1 must continue to work without service
  keys and must not implement live OpenAPI calls.
- A source-code `LICENSE` file has not been selected in this audit. Data
  licensing is separated through `DATA_LICENSE.md` and
  `data/seed/LICENSE.15118998.md`; maintainers should choose a code license
  before public publication if one is required.

## Recommendation

Recommendation: `GO-WITH-WARNINGS`.

All required final release audit gates passed. The warning is limited to
release scope: the bundled seed is currently metadata-only and must not be
represented as verified, latest, or value-serving data until the evidence-lock
and ingestion gates complete.
