# Release Audit

Audit date: 2026-07-02

Scope: pre-public hardening review for `academyinfo-mcp` v0.1 after the GPT-5.5 Pro review fixes. This audit supports private `origin/main` push only. It does not approve `npm publish` and does not approve making the repository public.

Recommendation: `GO-WITH-WARNINGS` for private GitHub push.

## Current Package State

| Item | Result |
| --- | --- |
| Package version | `0.1.0`, aligned with `src/server.ts` |
| Code license | `MIT` in `package.json`; code license remains separate from bundled data license |
| Runtime | `node:sqlite` retained; no `better-sqlite3` dependency or type shim |
| Node engine | `>=24.15.0` because v0.1 uses the built-in `node:sqlite` release-candidate API |
| Runtime mode | file-first, no API key required |
| OpenAPI | not implemented in v0.1 |
| Bundled data | only normalized derivative seed for dataset `15118998` |
| Non-bundled data | dataset `15139279` remains v0.3/local-ingest backlog only |

## Fix Verification Matrix

| Gate | Status | Evidence |
| --- | --- | --- |
| Invalid indicators fail closed | PASS | `get_university_metrics` and `compare_universities` return `status: invalid_request`, `data.error`, and `invalid_indicators` for unknown indicator names. |
| Empty compare input fails closed | PASS | `compare_universities` returns `status: invalid_request` when `university_names` is empty or absent. |
| Ambiguous responses include `data.error` | PASS | `search_university` ambiguous results include `data.error.code=ambiguous` with candidates and count metadata. |
| Search truncation exposes totals | PASS | Broad search returns `returned_count`, `total_matched`, and `truncated` instead of reporting only the sliced count. |
| Blank source values are surfaced | PASS | Metrics responses expose `missing_metrics[]` with `reason: blank_in_source`, `value: null`, source `raw_value`, and `source_column`. |
| Package metadata | PASS | `package.json` now has `version=0.1.0`, `license=MIT`, `engines.node=>=24.15.0`, caret-pinned runtime deps, and no `better-sqlite3`. |
| Package license gate | PASS | `scripts/package-check-config.ts` enforces `LICENSE`, `DATA_LICENSE.md`, `NOTICE.md`, and `data/seed/LICENSE.15118998.md`. |
| Package scan hardening | PASS | Text `.map`, `.json`, `.md`, and `.txt` files are scanned regardless of size; `.insane-review/` is ignored locally and forbidden if presented as a package path. |
| README | PASS | README states Node requirement, `node:sqlite`, no API key, point-in-time data refresh policy, and `missing_metrics` behavior. |

## External Verification Already Recorded

The GPT-5.5 Pro pre-public review states that git-history secret scan and DB re-query were verified externally before this fix pass. This repository-side audit records that external verification as supporting evidence, not as a substitute for the local package gate below.

## Five-Indicator Seed Counts

Observed via read-only `node:sqlite` query against `data/seed/academyinfo_15118998.sqlite`.

| Indicator | Source dataset | Year | Unit | Observation count |
| --- | --- | --- | --- | --- |
| `competition_rate` | `15118998` | 2025 | `:1` | 443 |
| `fill_rate` | `15118998` | 2025 | `%` | 488 |
| `employment_rate` | `15118998` | 2025 | `%` | 488 |
| `scholarship_per_student` | `15118998` | 2025 | `원` | 443 |
| `avg_tuition` | `15118998` | 2026 | `천원` | 488 |

Raw rows in seed DB: 488.

## Required Serial Gate

Commands run serially before push:

| Command | Result |
| --- | --- |
| `npm run build` | PASS |
| `npm run test` | PASS, 5 test files and 19 tests |
| `npm run doctor` | PASS, `status: ok` and `api_key_required: false` |
| `npm run package:check` | PASS, `package_check: ok` |
| `npm run prepublishOnly` | PASS; no publish was run |
| `npm pack --dry-run` | PASS |
| `npm pack --dry-run --json` | PASS, 128 files |

Dry-run package includes the three required seed artifacts:

- `data/seed/academyinfo_15118998.sqlite`
- `data/seed/academyinfo_15118998.manifest.json`
- `data/seed/LICENSE.15118998.md`

Forbidden dry-run matches: 0 for `data/raw`, `data/external`, `15139279` data artifacts, raw spreadsheets, raw CSV files, `.env`, credentials, service keys, local paths, local user names, `.omo`, `.ultrawork`, `.insane-review`, and `node_modules`.

Additional MCP stdio surface check: PASS. The direct MCP harness returned `invalid_request` for `indicators:["not_real"]`, ambiguous search counts with `returned_count=20`, `total_matched=482`, `truncated=true`, and `missing_metrics[0].reason=blank_in_source` for a source `-` marker.

## Remaining Risks

- The project intentionally keeps `node:sqlite`; Node documents this as a release-candidate API. v0.1 requires Node `>=24.15.0`.
- The local development machine may emit Node/npm engine or `node:sqlite` warnings if it runs below the documented release floor; public release verification should run on Node `>=24.15.0`.
- The bundled seed is a point-in-time snapshot and does not claim to be latest. Refresh requires source-file, checksum, manifest, DB, and package dry-run review.
- Public repository conversion and `npm publish` remain out of scope for this audit.
