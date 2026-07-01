# Release Audit

Audit date: 2026-07-01

Scope: private GitHub push readiness for `academyinfo-mcp` v0.1 after the final five-indicator `15118998` seed audit.

Recommendation: `GO-WITH-WARNINGS` for private GitHub push only.

This audit does not approve making the repository public and does not approve `npm publish`.

## Evidence Summary

| Gate | Result | Evidence |
| --- | --- | --- |
| Git status shown | PASS | `git status --short --branch` returned `## main...origin/main` before audit edits. |
| Release audit recommendation | PASS | This document records `GO-WITH-WARNINGS` for private GitHub push preparation. |
| Seed DB has nonzero observations for all five defaults | PASS | `competition_rate=443`, `fill_rate=488`, `employment_rate=488`, `scholarship_per_student=443`, `avg_tuition=488`. |
| `list_indicators` returns five defaults | PASS | CLI invocation of `handleListIndicators({})` returned five indicators and `default_indicator_count=5`. |
| `employment_rate` source is `15118998` | PASS | `handleExplainIndicator({indicator:"employment_rate"})` returned `dataset_id=15118998`. |
| No default indicator points to `15139279` | PASS | DB `indicators` rows all use `source_dataset_id=15118998`; package dry-run had no `15139279` paths. |
| Stale claim scan | PASS | No stale default-state, default-count, or wrong-source claims found. README/AGENTS source-scope hits are guardrail text, not stale claims. |
| `package.json` version reviewed | WARNING | Version is `0.0.0`; blocker for public/npm release, acceptable for private GitHub push preparation. |
| `npm run build` | PASS | Exit code `0`. |
| `npm run test` | PASS | 5 test files and 16 tests passed. |
| `npm run doctor` | PASS | `status: ok`; `api_key_required: false`; service keys unset. |
| `npm run package:check` | PASS | `package_check: ok`; required seed artifacts present. |
| `npm run prepublishOnly` | PASS | Exit code `0`; ran build and package check. |
| `npm pack --dry-run --json` checked | PASS | `entryCount=120`, package size `152496`, unpacked size `1094511`. |
| Required seed files included in dry-run | PASS | SQLite DB, manifest, and `LICENSE.15118998.md` all present. |
| Forbidden package artifacts excluded | PASS | No dry-run paths matched `data/raw`, `data/external`, `15139279`, raw `.xlsx`, raw `.csv`, `.env`, service keys, credentials, local absolute paths, local user names, or `.omo/ulw-loop`. |
| Staged forbidden artifact policy | PASS | No staging was performed. Candidate staging is listed below and excludes forbidden artifacts. |
| Commit/push/publish safety | PASS | No commit, no push, and no publish were run during this audit. |

## Five-Indicator Observation Counts

Observed via read-only `node:sqlite` query against `data/seed/academyinfo_15118998.sqlite`.

| Indicator | Source dataset | Year | Unit | Observation count |
| --- | --- | --- | --- | --- |
| `competition_rate` | `15118998` | 2025 | `:1` | 443 |
| `fill_rate` | `15118998` | 2025 | `%` | 488 |
| `employment_rate` | `15118998` | 2025 | `%` | 488 |
| `scholarship_per_student` | `15118998` | 2025 | `원` | 443 |
| `avg_tuition` | `15118998` | 2026 | `천원` | 488 |

Raw rows in seed DB: 488.

## `list_indicators` Result

`handleListIndicators({})` returned these default indicators:

- `competition_rate`
- `fill_rate`
- `employment_rate`
- `scholarship_per_student`
- `avg_tuition`

All five returned `dataset_id=15118998`, `enabled=true`, and verified source columns.

`handleExplainIndicator({indicator:"employment_rate"})` returned `dataset_id=15118998` with source column `취업률\n(2025,%)`.

## Stale-Claim Scan

Files checked:

- `README.md`
- `AGENTS.md`
- `docs/release-audit.md`
- `docs/indicator-dictionary.md`

Claim families checked:

- disabled-default wording for a currently enabled default indicator
- wrong-source wording that assigns a default indicator to the non-bundled employment dataset
- four-indicator wording for a five-indicator default set
- source-scope wording that overstates the verified source header

Result: no stale claims found.

Notes:

- `README.md` and `AGENTS.md` contain guardrail text about source-scope limits. This is not a stale claim.
- `docs/indicator-dictionary.md` was added so the scanned documentation set has an explicit current indicator dictionary.

## Package Dry-Run Summary

`npm pack --dry-run --json` summary:

- package: `academyinfo-mcp@0.0.0`
- `entryCount`: 120
- `size`: 152496
- `unpackedSize`: 1094511

Required files present:

- `data/seed/academyinfo_15118998.sqlite`
- `data/seed/academyinfo_15118998.manifest.json`
- `data/seed/LICENSE.15118998.md`

Forbidden dry-run hits: 0.

Excluded by observed dry-run:

- `data/raw`
- `data/external`
- `15139279` data artifacts
- raw `*.xlsx`
- raw `*.csv`
- `.env`
- service keys
- credentials
- local absolute paths
- local user names
- `.omo/ulw-loop`

## Command Results

Commands run and passed:

- `npm run build`
- `npm run test`
- `npm run lint`
- `npm run doctor`
- `npm run package:check`
- `npm run prepublishOnly`
- `npm pack --dry-run --json`

The SQLite-backed commands emitted Node's experimental `node:sqlite` warning. This is acceptable for private GitHub push preparation but remains a public/npm release risk.

Verification note: one `npm test` invocation failed while build/package commands were running concurrently and rebuilding `dist`. A subsequent standalone `npm test` invocation passed with 5 test files and 16 tests. Run test gates serially during release checks.

## Safe Commit Message Proposal

Recommended message:

```text
docs: refresh private release audit for five-indicator seed
```

This message fits the current repository history style and describes a private-push preparation change without claiming public release.

## Files That Should Be Staged

Stage exactly:

- `docs/release-audit.md`
- `docs/indicator-dictionary.md`
- `STALE_MOVED.md` deletion

## Files That Must Not Be Staged

Do not stage:

- `.omo/ulw-loop/**`
- `data/raw/**`
- `data/external/**`
- `*.xlsx`
- `*.csv`
- `.env`
- service keys
- credentials
- `node_modules/**`
- `node_modules.broken-*`
- `15139279` data artifacts
- local machine handoff files

## Remaining Risks

- `package.json` version is `0.0.0`; this blocks public/npm release unless explicitly changed and approved.
- `node:sqlite` is experimental in the observed Node runtime; public release needs explicit acceptance or a driver decision.
- The recommendation is only for private GitHub push preparation.
- Public repository conversion and `npm publish` remain out of scope and require separate approval.
- Release verification commands should be run serially; concurrent rebuilds can interfere with stdio MCP tests.
- No commit, push, or publish has been performed by this audit.
