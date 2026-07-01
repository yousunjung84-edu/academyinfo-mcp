# Release Audit

Audit date: 2026-07-02

Scope: public-transition audit for `academyinfo-mcp` v0.1 after the GPT-5.5 Pro pre-public review fixes and follow-up documentation cleanup.

Recommendation: `GitHub public GO`; `npm publish HOLD`.

This audit supports switching the GitHub repository from private to public after owner approval. It does not approve publishing the package to npm.

## Current Package State

| Item | Result |
| --- | --- |
| Package version | `0.1.0`, aligned with `src/server.ts` |
| Code license | `MIT` in `package.json`; code license remains separate from bundled data license |
| Runtime | `node:sqlite` retained; no `better-sqlite3` dependency or type shim |
| Node engine | `>=24.15.0` because v0.1 uses the built-in `node:sqlite` release-candidate API |
| Dependencies | Explicit semver ranges using caret notation for runtime and dev dependencies |
| Runtime mode | File-first, no API key required |
| OpenAPI | Not implemented in v0.1 |
| Bundled data | Only normalized derivative seed for dataset `15118998` |
| Non-bundled data | Dataset `15139279` remains v0.3/local-ingest backlog only |

## Public-Transition Evidence

| Gate | Status | Evidence |
| --- | --- | --- |
| `.insane-review` tracked files | PASS | `git ls-files .insane-review` returned no tracked files. |
| `.insane-review` ignore policy | PASS | `.gitignore` includes `.insane-review/`; local check-ignore output maps `.insane-review/test.md` to that rule. |
| Git-history secret/private-path scan | PASS | Externally verified scan result: 0 hits. |
| Raw/private data tracking | PASS | Externally verified: `data/raw` and `.env` were never tracked. Local path-history spot check also returned no tracked entries for `data/raw` or `.env`. |
| Public docs posture | PASS | README includes non-affiliation, Node requirement, no-key operation, KOGL-1 attribution, data snapshot policy, and code/data license separation. |
| Package artifact posture | PASS | Package allowlist excludes raw files, external data, `.env`, `.omo`, `.insane-review`, service keys, local paths, local user names, and `15139279` data artifacts. |

## Fix Verification Matrix

| Gate | Status | Evidence |
| --- | --- | --- |
| Invalid indicators fail closed | PASS | `get_university_metrics` and `compare_universities` return `status: invalid_request`, `data.error`, and `invalid_indicators` for unknown indicator names. |
| Empty compare input fails closed | PASS | `compare_universities` returns `status: invalid_request` when `university_names` is empty or absent. |
| Ambiguous responses include `data.error` | PASS | `search_university` ambiguous results include `data.error.code=ambiguous` with candidates and count metadata. |
| Search truncation exposes totals | PASS | Broad search returns `returned_count`, `total_matched`, and `truncated` instead of reporting only the sliced count. |
| Blank source values are surfaced | PASS | Metrics responses expose `missing_metrics[]` with `reason: blank_in_source`, `value: null`, source `raw_value`, and `source_column`. |
| Package metadata | PASS | `package.json` has `version=0.1.0`, `license=MIT`, `engines.node >=24.15.0`, explicit caret semver ranges, and no `better-sqlite3`. |
| Package license gate | PASS | `scripts/package-check-config.ts` enforces `LICENSE`, `DATA_LICENSE.md`, `NOTICE.md`, and `data/seed/LICENSE.15118998.md`. |
| Package scan hardening | PASS | Text `.map`, `.json`, `.md`, and `.txt` files are scanned regardless of size; local review artifacts and sensitive package paths (`.env`, `.env.*`, `.npmrc`, `.pem`, `service-account.json`) are forbidden. |
| README | PASS | README states Node requirement, `node:sqlite`, no API key, point-in-time data refresh policy, and `missing_metrics` behavior. |

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

Commands run before this audit update:

| Command | Result |
| --- | --- |
| `npm run build` | PASS |
| `npm run test` | PASS, 5 test files and 20 tests |
| `npm run package:check` | PASS, `package_check: ok` |
| `npm pack --dry-run --json` | PASS, 128 files; required seed artifacts present; forbidden artifacts absent |
| `npm audit --omit=dev --audit-level=high` | PASS, 0 vulnerabilities |

Dry-run package must include:

- `data/seed/academyinfo_15118998.sqlite`
- `data/seed/academyinfo_15118998.manifest.json`
- `data/seed/LICENSE.15118998.md`

Dry-run package must exclude `data/raw`, `data/external`, `15139279` data artifacts, raw spreadsheets, raw CSV files, `.env`, `.env.*`, `.npmrc`, `.pem`, `service-account.json`, credentials, service keys, local paths, local user names, `.omo`, `.ultrawork`, `.insane-review`, and `node_modules`.

## Remaining Risks

- `npm publish` remains on hold until an independent clean-environment install, MCP client smoke test, and npm account/package-name checks pass.
- The project intentionally keeps `node:sqlite`; Node documents this as a release-candidate API. v0.1 requires Node `>=24.15.0`.
- The bundled seed is a point-in-time snapshot and does not claim to be latest. Refresh requires source-file, checksum, manifest, DB, and package dry-run review.
- Optional history scrub remains a human decision. Current public-transition evidence supports public GO without treating scrub as a blocker.
