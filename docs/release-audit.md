# Release Audit

## Final Private-Release Audit After Five-Indicator Seed

Audit date: 2026-07-01

Scope: private GitHub-ready repository state for `academyinfo-mcp` v0.1 after
the verified five-indicator `15118998` seed rebuild.

Rule: if any required gate fails, the release recommendation is `NO-GO`.
Publishing to npm and making the repository public remain out of scope and
require a separate human-approved step.

Evidence directory:
`.omo/ulw-loop/academyinfo-private-release-audit-20260701/evidence/`

### PASS/FAIL Table

| Gate | Result | Evidence |
| --- | --- | --- |
| `npm run build` | PASS | `command-results.json`, `build.txt`, exit code `0` |
| `npm run lint` | PASS | `command-results.json`, `lint.txt`, exit code `0` |
| `npm run test` | PASS | `command-results.json`, `test.txt`, exit code `0`; 5 files and 16 tests passed |
| `npm run doctor` | PASS | `command-results.json`, `doctor.txt`, exit code `0`; `api_key_required: false` |
| `npm run package:check` | PASS | `command-results.json`, `package-check.txt`, exit code `0` |
| `npm run prepublishOnly` | PASS | `command-results.json`, `prepublishOnly.txt`, exit code `0` |
| `npm pack --dry-run --json` package list safe | PASS | `package-scan.json`, 119 files |
| Required seed artifacts included | PASS | SQLite DB, manifest, and `LICENSE.15118998.md` present in package dry-run |
| Five default indicators have nonzero verified observations | PASS | `seed-observation-summary.json` |
| No default indicator points to `15139279` | PASS | `seed-observation-summary.json` |
| No `15139279` data artifacts bundled | PASS | `package-scan.json`, forbidden path count `0` |
| No raw XLSX/CSV bundled | PASS | `package-scan.json`, forbidden path count `0` |
| No `data/raw` or `data/external` bundled | PASS | `package-scan.json`, forbidden path count `0` |
| No `.env`, service key, credential, private path, local user name, or local absolute path bundled | PASS | `package-scan.json`, content hit counts `0` |
| Persisted audit logs do not contain service keys or local absolute paths | PASS | `log-safety-scan.json`; command output paths were redacted per AGENTS.md |
| OpenAPI runtime code absent from v0.1 | PASS | `source-policy-scan.json`, live OpenAPI/runtime call count `0` |
| README states v0.1 requires no API key | PASS | `docs-policy-scan.json` |
| README states `15118998` is bundled as normalized derivative | PASS | `docs-policy-scan.json` |
| README states `employment_rate` is sourced from `15118998` in v0.1 | PASS | `docs-policy-scan.json` |
| README states `15139279` is non-bundled and deferred to v0.3/local ingest for granular employment stats | PASS | `docs-policy-scan.json` |
| README includes non-affiliation disclaimer and does not claim official ranking/evaluation | PASS | `docs-policy-scan.json`; MCP comparison warning also states no official rankings |
| `compare_universities` returns real values for a verified university pair | PASS | `mcp-smoke.json`; `전남대학교 본교` and `서울대학교 본교` returned five metrics each |
| This audit document includes required release-audit sections | PASS | PASS/FAIL table, command summary, package summary, seed summary, remaining risks, recommendation |
| Publicizing and `npm publish` were not performed | PASS | No publish/public command was run |

### Command Output Summary

All command gates exited with code `0`:

- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run doctor`
- `npm run package:check`
- `npm run prepublishOnly`

`npm run test` reported 5 passing test files and 16 passing tests. The runtime
emitted Node's experimental `node:sqlite` warning during SQLite-backed checks;
that warning did not fail the gate but remains a release risk below.

`doctor` reported v0.1 API keys are not required and showed service-key status
only, without printing key values.

### Package File List Summary

`npm pack --dry-run --json` returned 119 files.

Required seed files included:

- `data/seed/academyinfo_15118998.sqlite`
- `data/seed/academyinfo_15118998.manifest.json`
- `data/seed/LICENSE.15118998.md`

Forbidden package findings:

- `data/raw`: 0
- `data/external`: 0
- raw `.xlsx`: 0
- raw `.csv`: 0
- `.env`: 0
- `15139279` data artifact paths: 0
- service key values: 0
- credential assignments: 0
- private/local absolute paths: 0
- local user path segments: 0

Documentation may mention `15139279` only as non-bundled v0.3 policy.

### Five-Indicator Seed Observation Summary

All default indicators are sourced from dataset `15118998`; all source columns
are verified from the header; no default indicator points to `15139279`.

| Indicator | Dataset | Year | Unit | Observation count |
| --- | --- | --- | --- | --- |
| `competition_rate` | `15118998` | 2025 | `:1` | 443 |
| `fill_rate` | `15118998` | 2025 | `%` | 488 |
| `employment_rate` | `15118998` | 2025 | `%` | 488 |
| `scholarship_per_student` | `15118998` | 2025 | `원` | 443 |
| `avg_tuition` | `15118998` | 2026 | `천원` | 488 |

Raw rows preserved in seed DB: 488.

### MCP Smoke Summary

The stdio MCP smoke used no service-key environment variables and returned
`status: ok` for the audited surfaces.

`compare_universities` returned real seed values for:

- `전남대학교 본교`: five metrics from `15118998`
- `서울대학교 본교`: five metrics from `15118998`

The smoke artifact also confirmed zero invalid stdout lines.

### Remaining Risks

- Public release and `npm publish` remain blocked until separate human approval.
- The current directory did not report as a git repository during this audit, so
  package and file safety are verified, but Git remote/private GitHub push
  safety could not be verified from local Git metadata.
- `node:sqlite` is experimental in the observed Node runtime. This is acceptable
  for the private audited state only if the maintainer accepts the driver risk;
  otherwise public release should wait for an explicit SQLite-driver decision.
- The seed manifest intentionally does not claim latest-source status:
  `seed_is_latest_claim=false`.
- Dataset `15139279` remains non-bundled and deferred to v0.3/local ingest for
  granular, per-department, or health-insurance-linked employment statistics.

### Recommendation

Recommendation: `GO-WITH-WARNINGS` for private repository handoff only.

It is safe to push the audited files to a private GitHub repository after
placing this folder under the intended private Git remote and rechecking `git
status`. It is still blocked for public release and npm publishing until human
approval and explicit acceptance or resolution of the SQLite driver warning.

---

Audit date: 2026-07-01

Scope: `academyinfo-mcp` v0.1 evidence lock, real `15118998` seed DB, MCP
smoke, and package-safety gate.

This audit supersedes the earlier metadata-only/missing-file audit from
2026-07-01.

Rule: if any required gate fails, the release recommendation is `NO-GO`.

## PASS/FAIL Table

| Gate | Result | Evidence |
| --- | --- | --- |
| Raw file exists at `data/raw/15118998/대학주요정보.xlsx` | PASS | `Get-FileHash` completed |
| Source sha256 equals expected digest | PASS | `53F7E7FBB446206A47FAB1ADC622D551BA88BA7F3C25AE0CDC8E41CDDC637621` |
| Header evidence generated | PASS | `evidence/header-snapshots/15118998.headers.json`, `Sheet1`, 24 columns |
| Sample/checksum evidence generated | PASS | `evidence/sample-rows/15118998.sample.json`, `evidence/checksums/15118998.checksums.json` |
| Real five-indicator seed DB generated | PASS | `data/seed/academyinfo_15118998.sqlite` |
| Raw rows preserved | PASS | `raw_rows=488` |
| Nonzero observations for all five default indicators | PASS | total observations `2350` |
| `employment_rate` enabled only from `15118998` | PASS | `employment_rate=488` observations from bundled seed |
| `15139279` data not bundled | PASS | package forbidden path count `0` |
| Raw XLSX/CSV not bundled | PASS | package forbidden path count `0` |
| `.env`, service keys, private paths not bundled | PASS | package forbidden path count `0`; API-key tests passed |
| No API key required | PASS | `doctor` reports `api_key_required: false` |
| OpenAPI not implemented | PASS | v0.1 tools operate from local seed DB |
| MCP smoke: `list_indicators` | PASS | status `ok`, count `5` |
| MCP smoke: `compare_universities` | PASS | `전남대학교 본교` returned five real metric values |
| `npm run build` | PASS | TypeScript build completed |
| `npm run test` | PASS | 5 files, 16 tests passed |
| `npm run doctor` | PASS | status `ok` |
| `npm run package:check` | PASS | build completed, `package_check: ok` |
| `npm run prepublishOnly` | PASS | build and package check completed |

## Command Output Summary

- `Get-FileHash -Algorithm SHA256 data/raw/15118998/대학주요정보.xlsx`
  returned `53F7E7FBB446206A47FAB1ADC622D551BA88BA7F3C25AE0CDC8E41CDDC637621`.
- `node dist/scripts/seed15118998.js` regenerated the real seed DB and evidence
  artifacts from the verified raw XLSX. DB smoke showed 488 raw rows inserted.
- DB smoke returned `raw_rows=488`, `observations=2350`, and per-indicator
  counts: `avg_tuition=488`, `competition_rate=443`, `employment_rate=488`,
  `fill_rate=488`, `scholarship_per_student=443`.
- MCP smoke returned five default indicators and real `전남대학교 본교` values:
  competition rate `7.4`, fill rate `99.9`, employment rate `57.6`,
  scholarship per student `3314028.3`, average tuition `4222.8`.
- `npm run build` passed.
- `npm run test` passed: 5 test files, 16 tests.
- `npm run doctor` passed and reported `api_key_required: false`.
- `npm run package:check` passed after build and reported all three seed
  artifacts present.
- `npm run prepublishOnly` passed.

## Package File List Summary

`npm pack --dry-run --json` returned 119 package files.

Required seed files included:

- `data/seed/academyinfo_15118998.sqlite`
- `data/seed/academyinfo_15118998.manifest.json`
- `data/seed/LICENSE.15118998.md`

Forbidden package paths matched: `0`.

The package file list did not include:

- `data/raw`
- `data/external`
- raw `.xlsx`
- raw `.csv`
- `.env`
- service key values
- `15139279` data artifacts
- local absolute private paths

Documentation text may mention `15139279` as non-bundled v0.3 backlog policy.

## Driver Note

`better-sqlite3` remains listed in the project dependency set, but this local
Windows/Node 24 environment could not use its native binding. `npm rebuild
better-sqlite3` failed because Visual Studio C++ build tools were unavailable.

The implemented seed/runtime DB access currently uses Node's built-in
`node:sqlite` with Windows long-path normalization. This is not an OpenAPI or
data-policy change, but it is a release engineering risk because `node:sqlite`
is experimental in the observed runtime.

## Remaining Risks

- Public release and npm publish remain out of scope until maintainer approval.
- The SQLite driver choice needs explicit maintainer review before public
  release because `better-sqlite3` could not run in this environment.
- The seed does not claim to be the latest source data:
  `seed_is_latest_claim=false`.
- Dataset `15139279` remains non-bundled and deferred to v0.3 for granular,
  per-department, or health-insurance-linked employment statistics.

## Recommendation

Recommendation: `GO-WITH-WARNINGS` for the local v0.1 file-first seed and MCP
verification gates.

Do not publish publicly or run `npm publish` until the SQLite driver warning is
resolved or explicitly accepted by the maintainer.
