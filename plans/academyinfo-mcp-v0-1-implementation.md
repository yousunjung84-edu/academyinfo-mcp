# academyinfo-mcp v0.1 Implementation Plan

Status: planning only  
Scope: file-first read-only MCP server  
Repository rule layer: root `AGENTS.md`  
This ticket may modify only this plan file.

## Fixed Decisions

- v0.1 is a file-first, read-only MCP server and must run without API keys.
- Dataset `15118998` is the only bundled seed dataset in v0.1.
- Dataset `15118998` license policy is KOGL-1 / 공공누리 제1유형(출처표시); release must lock the exact license evidence before packaging.
- Default bundled indicators from `15118998`: 신입생경쟁률, 신입생충원율, 연평균등록금, 학생1인당장학금.
- Dataset `15139279` is employment data and is non-bundled / local ingest only.
- `employment_rate` is disabled by default.
- OpenAPI is v0.3 backlog only. v0.1 must not implement live OpenAPI calls.
- `DATA_GO_KR_SERVICE_KEY` and `ACADEMYINFO_SERVICE_KEY` are optional reserved values for a future v0.3 OpenAPI bridge and are not required by v0.1 default tools.
- Service keys, `.env`, credentials, local absolute paths, and local user names must never appear in logs, MCP responses, manifests, test snapshots, docs examples, or package artifacts.
- No endpoint, operation name, request parameter, response field, file column, or unit may be inferred.

## Fixed Stack

- Language/runtime: TypeScript on Node.js.
- MCP SDK: stable `@modelcontextprotocol/sdk` stdio server API.
- Validation: `zod`.
- Database: SQLite with `better-sqlite3` as the v0.1 implementation target. If `better-sqlite3` cannot satisfy the supported runtime, mark the release path `NO-GO` and return to scope decision; do not let the executor silently choose another driver.
- Driver decision note: if `better-sqlite3` fails on target environments, compare `better-sqlite3`, `node:sqlite`, `sql.js`, and `duckdb`; mark release `NO-GO`; wait for maintainer decision before changing drivers.
- Tests: `vitest`.
- Logging: `pino` configured for stderr only in stdio MCP runtime.
- Package manager/package target: npm package with `package.json` `files` allowlist.

Dependency installation is not part of this planning ticket. Exact versions are chosen during the implementation ticket after checking current package metadata and official SDK docs.

## v0.1 MCP Tools

v0.1 exposes exactly seven read-only tools:

- `list_sources`
- `list_indicators`
- `search_university`
- `get_university_metrics`
- `compare_universities`
- `explain_indicator`
- `validate_source_coverage`

No write tools, scraping tools, or live OpenAPI tools are in v0.1.

## Universal MCP Response Contract

Every MCP tool response must include:

- `status`
- `tool`
- `query`
- `source` or `sources`
- `data`
- `warnings`
- `generated_at`

Every source object must include:

- `dataset_id`
- `dataset_name`
- `provider`
- `source_url`
- `license`
- `derived_database`
- `bundled`

Indicator responses must include, when applicable:

- `source_column`
- `year` or `base_year`
- `unit`

Behavioral requirements:

- Ambiguous university matches return `status='ambiguous'` and `candidates`; the server must not guess.
- Missing or unverified units return `unit='NotVerified'` and a warning.
- Missing or unverified source columns return `source_column='NotVerified'`, `source_column_verified=false`, and a warning.
- `employment_rate` is not returned by default.
- stdout logging is forbidden in stdio MCP runtime.

## Phase 0: Planning And Governance Lock

Purpose: lock the implementation plan without changing product code.

Create or modify:

- `plans/academyinfo-mcp-v0-1-implementation.md`

Test strategy:

- Read-only text checks for fixed decisions, gates, tool names, stack names, and prohibitions.
- Read-only file inventory check proving no product code, DB, package, OpenAPI code, or employment data was created by this planning ticket.

Commands:

- `Get-Content -Raw AGENTS.md`
- `Get-Content -Raw plans/academyinfo-mcp-v0-1-implementation.md`
- plan-gate text scans for required phrases
- file inventory scan for forbidden generated artifacts

Risk gate:

- Reject the plan if it adds implementation files, seed DB files, package artifacts, raw data, OpenAPI code, or `15139279` data during this ticket.

Acceptance criteria:

- The plan is saved at `plans/academyinfo-mcp-v0-1-implementation.md`.
- The plan preserves all fixed decisions from `AGENTS.md` and the user request.
- The plan contains the eight acceptance buckets: license, package, API key, evidence lock, MCP response contract, data model, CLI/UX, release audit.
- No product code is modified.

Failure recovery:

- Revert only the planning-file edit and rewrite the plan from the fixed user requirements.
- Do not touch product files while recovering.

## Phase 1: Project Scaffold And Dependency Baseline

Purpose: create only the minimal TypeScript/npm skeleton after planning is approved. Phase 1 may create process entry points, config loading, stderr logging, and build/test wiring; actual MCP tool registration belongs to Phase 7 only.

Create or modify:

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `src/index.ts`
- `src/server.ts`
- `src/config/index.ts`
- `src/logging.ts`
- `test/`
- `scripts/`
- optional `.omo/rules/package-safety.md`
- optional `.omo/rules/mcp-stdio-safety.md`
- optional `.omo/rules/data-license-policy.md`

Test strategy:

- RED tests first for no-key startup, stderr-only logging, and absent OpenAPI runtime.
- TypeScript compile smoke test.
- Vitest setup smoke test.
- Test-directory consistency check proving `test/` is the only test directory.

Commands:

- `npm install --save @modelcontextprotocol/sdk zod better-sqlite3 pino`
- `npm install --save-dev typescript vitest @types/node`
- `npm run build`
- `npm run test`
- `npm run lint`
- `npm run doctor`

Risk gate:

- Do not rely on optional `.omo/rules` unless auto-loading is verified by `doctor` or an actual agent session.
- No dependency script may require `DATA_GO_KR_SERVICE_KEY` or `ACADEMYINFO_SERVICE_KEY`.
- No OpenAPI client package or generated OpenAPI source may be added.
- Do not register the seven MCP tools in Phase 1; tool registration starts in Phase 7.
- Do not create both `test/` and `tests/`; use `test/` consistently.

Acceptance criteria:

- `npm run build`, `npm run test`, `npm run lint`, `npm run doctor`, `npm run package:check`, and `npm run prepublishOnly` exist.
- `pino` writes to stderr in stdio MCP runtime.
- `console.log()` is absent from MCP runtime code except SDK-owned protocol output.
- v0.1 startup works with both service-key env vars unset.
- Package safety is controlled by `package.json` `files` allowlist, not by `.gitignore`.
- Phase 1 server skeleton can start without registering product tools.
- All tests live under `test/`; no `tests/` directory exists.

Failure recovery:

- Remove or replace any dependency that forces keys, OpenAPI, stdout logging, or package inclusion outside the allowlist.
- If `better-sqlite3` cannot be installed on target platforms, document the blocker, compare `better-sqlite3`, `node:sqlite`, `sql.js`, and `duckdb`, mark the implementation gate `NO-GO`, and request an explicit maintainer decision before any SQLite driver change.

## Phase 2: License Gate

Purpose: prove redistribution is allowed before any seed DB is generated or packaged.

Create or modify:

- `LICENSE`
- `DATA_LICENSE.md`
- `NOTICE.md`
- `data/seed/LICENSE.15118998.md`
- `evidence/licenses/15118998.license-snapshot.md`
- `evidence/licenses/15139279.license-snapshot.md`
- `docs/license-gate.md`
- `scripts/check-license-gate.ts`
- `test/license-gate.test.ts`

Test strategy:

- Snapshot tests for required license documents.
- Package-list tests proving `15139279` is non-bundled.
- Secret/private-path scans over license and notice artifacts.
- Disclaimer scan proving no official endorsement claim.

Commands:

- `npm run test -- license-gate`
- `npm run doctor`
- `npm run package:check`

Risk gate:

- `15118998` license evidence must match KOGL-1 / 공공누리 제1유형(출처표시) before seed packaging.
- Code license and data license must remain separate.
- The code license must not be applied to bundled public data.
- `15139279` must be documented as non-bundled/local-ingest only.

Acceptance criteria:

- `DATA_LICENSE.md` exists and separates code license from bundled data license.
- `NOTICE.md` exists and includes attribution/non-affiliation language.
- `data/seed/LICENSE.15118998.md` exists before seed packaging.
- `evidence/licenses/15118998.license-snapshot.md` exists.
- `evidence/licenses/15139279.license-snapshot.md` exists.
- The gate states `15139279` is non-bundled.
- Tests fail if package artifacts include employment data, raw files, `.env`, credentials, service keys, private paths, or local user names.

Failure recovery:

- If license evidence is incomplete or conflicts with the fixed policy, stop seed packaging and mark release `NO-GO`.
- If attribution text is missing, update license docs and seed manifest before continuing.

## Phase 3: Evidence Lock And Header Verification

Purpose: lock source headers, units, and year/base-year semantics before schema mapping or ingestion.

Create or modify:

- `evidence/sources/15118998.headers.md`
- `evidence/sources/15118998.source-map.md`
- `evidence/header-snapshots/15118998.headers.json`
- `evidence/sample-rows/15118998.sample.json`
- `evidence/checksums/15118998.checksums.json`
- `docs/source-evidence.md`
- `src/evidence/types.ts`
- `src/evidence/registry.ts`
- `scripts/snapshot-headers.ts`
- `scripts/snapshot-sample-rows.ts`
- `scripts/checksum-source-files.ts`
- `scripts/check-evidence-lock.ts`
- `test/evidence-lock.test.ts`

Test strategy:

- Header detection tests using verified downloaded headers or official documentation.
- Missing-column tests.
- Unit verification tests.
- Source-map tests that reject unverified mappings.
- Private-path scans over evidence files and generated manifests.
- Reproducibility tests that regenerate header snapshots, sample-row snapshots, and source-file checksums from manually placed raw files.

Commands:

- `npm run test -- evidence-lock`
- `npm run snapshot:headers`
- `npm run snapshot:sample-rows`
- `npm run checksum:source-files`
- `npm run doctor`
- `npm run build`

Risk gate:

- Before header verification, every source mapping must have `source_column_verified=false`.
- Only actual downloaded headers or official documentation may promote a column to verified.
- Unit values remain `NotVerified` until verified.
- Endpoint, operation, request parameter, response field, file column, and unit names must not be guessed.
- Raw source files must not be mutated.
- Raw rows must be preserved later for auditability.
- Evidence, manifests, and DB rows must not store local absolute paths.
- Header verification must be reproducible from manually placed raw files and checksums.
- Snapshot scripts must record relative evidence names and checksums, not private local paths.

Acceptance criteria:

- Every indicator has `dataset_id`, `dataset_name`, `provider`, `source_url`, `license`, `source_column`, `source_column_verified`, `year` or `base_year`, `unit`, and warnings metadata.
- Unverified columns use `source_column='NotVerified'` and `source_column_verified=false`.
- Unverified units use `unit='NotVerified'` and warnings.
- Tests reject any mapping whose column is absent from verified headers.
- Tests reject any local absolute path in evidence, manifest, or DB metadata.
- `scripts/snapshot-headers.ts` produces `evidence/header-snapshots/15118998.headers.json`.
- `scripts/snapshot-sample-rows.ts` produces `evidence/sample-rows/15118998.sample.json`.
- `scripts/checksum-source-files.ts` produces `evidence/checksums/15118998.checksums.json`.
- Header verification can be rerun from manually placed raw files whose checksums match `evidence/checksums/15118998.checksums.json`.

Failure recovery:

- Downgrade unverifiable fields to `NotVerified` with warnings.
- Remove inferred mappings and block dependent ingestion/tool work until evidence is available.
- If checksums do not match, reject the evidence run and require fresh manual source-file placement and checksum snapshot.

## Phase 4: SQLite Schema And Indicator Dictionary

Purpose: define the normalized local database and indicator metadata.

Create or modify:

- `src/db/schema.ts`
- `src/db/connection.ts`
- `src/db/readonly.ts`
- `src/indicators/indicators.json`
- `src/indicators/types.ts`
- `docs/indicator-dictionary.md`
- `test/schema.test.ts`
- `test/indicator-dictionary.test.ts`

Data model:

- `source_files`
- `institutions`
- `indicators`
- `observations`
- `raw_rows`
- `join_audits`

Test strategy:

- Schema migration tests.
- Dictionary consistency tests.
- Raw-row preservation tests.
- Join-audit tests.
- Employment-data separation tests.

Commands:

- `npm run test -- schema`
- `npm run test -- indicator-dictionary`
- `npm run build`

Risk gate:

- `15139279` data must not enter the seed DB.
- `indicators.json` may include `employment_rate` only as disabled/non-bundled/local-ingest metadata.
- Default indicator listings must include only the four `15118998` indicators.
- Unknown units or columns stay `NotVerified`.

Acceptance criteria:

- SQLite schema includes `source_files`, `institutions`, `indicators`, `observations`, `raw_rows`, and `join_audits`.
- `indicators.json` includes 신입생경쟁률, 신입생충원율, 연평균등록금, 학생1인당장학금 from `15118998`.
- `indicators.json` includes disabled `employment_rate` metadata without bundled data.
- Every observation can trace to source metadata and raw-row audit data.
- Tests fail if a bundled/default indicator points to `15139279`.

Failure recovery:

- Remove any schema/dictionary field that implies bundled employment data.
- Restore `employment_rate` to disabled/non-bundled metadata only.

## Phase 5: `15118998` Ingestion And Seed DB Build

Purpose: create a normalized derivative seed DB only from verified `15118998` evidence.

Create or modify:

- `src/ingest/dataset-15118998.ts`
- `src/ingest/header-detection.ts`
- `src/ingest/normalize.ts`
- `src/ingest/raw-rows.ts`
- `src/ingest/join-audit.ts`
- `scripts/build-seed-db.ts`
- `data/seed/academyinfo_15118998.sqlite`
- `data/seed/academyinfo_15118998.manifest.json`
- `data/seed/LICENSE.15118998.md`
- `test/ingest-15118998.test.ts`
- `test/seed-db-validity.test.ts`

Test strategy:

- Header detection tests.
- Missing column handling tests.
- Unit verification tests.
- Raw-row preservation tests.
- Join mismatch tests.
- Seed DB validity tests.
- Manifest privacy scan.

Commands:

- `npm run test -- ingest-15118998`
- `npm run test -- seed-db-validity`
- `npm run build:seed`
- `npm run doctor`

Risk gate:

- Ingestion must fail closed if a required verified column is absent.
- Raw source files must not be committed or packaged.
- Raw source files must not be mutated.
- The seed DB must include no `15139279` rows, fixtures, or derived observations.
- Local absolute paths must not appear in the seed DB or manifest.

Acceptance criteria:

- `data/seed/academyinfo_15118998.sqlite` exists only after license and evidence gates pass.
- `data/seed/academyinfo_15118998.manifest.json` exists and contains dataset/source/license/warning metadata without private paths.
- Seed manifest includes `source_file_name`.
- Seed manifest includes `source_file_downloaded_at`.
- Seed manifest includes `source_file_modified_or_observed_at`.
- Seed manifest includes `source_page_observed_at`.
- Seed manifest includes `source_file_checksum_sha256`.
- Seed manifest includes `header_snapshot_checksum_sha256`.
- Seed manifest includes `seed_db_checksum_sha256`.
- Seed manifest includes `seed_is_latest_claim=false`.
- `data/seed/LICENSE.15118998.md` exists.
- Bundled seed DB must not claim to be the latest unless explicitly verified and recorded in the release audit.
- Raw rows are preserved in `raw_rows`.
- Join mismatches are recorded in `join_audits`.
- Derived observations are generated only from verified columns or marked unavailable with warnings.

Failure recovery:

- Delete generated seed artifacts from the failed run.
- Keep raw source files unchanged.
- Fix header/evidence mapping or mark fields `NotVerified`; do not guess replacement columns.

## Phase 6: Read-Only Repository Layer

Purpose: expose safe local query primitives for MCP tools.

Create or modify:

- `src/repository/sources.ts`
- `src/repository/indicators.ts`
- `src/repository/institutions.ts`
- `src/repository/observations.ts`
- `src/repository/coverage.ts`
- `src/repository/search.ts`
- `test/repository.test.ts`
- `test/search-ambiguity.test.ts`
- `test/campus-ambiguity.test.ts`

Test strategy:

- Duplicate university name tests.
- Campus ambiguity tests.
- Missing observation tests.
- Coverage mismatch tests.
- Read-only operation tests.

Commands:

- `npm run test -- repository`
- `npm run test -- ambiguity`
- `npm run build`

Risk gate:

- Repository functions must not mutate DB state.
- Search must not guess on ambiguous names.
- Missing values must return structured warnings.
- No repository query may require API keys.

Acceptance criteria:

- Ambiguous search returns `status='ambiguous'` and candidate rows.
- Campus ambiguity returns warnings.
- Missing observations return unavailable status with warnings.
- Repository layer exposes no write methods for MCP runtime.
- Queries use bundled seed DB when `ACADEMYINFO_DB_PATH` is absent.

Failure recovery:

- Tighten search matching and return ambiguity instead of broadening guesses.
- Add coverage warnings instead of synthesizing missing metrics.

## Phase 7: MCP Server And Seven Tools

Purpose: implement stdio MCP runtime tool registration and the seven v0.1 read-only tools. Phase 1 creates only the minimal server skeleton; actual MCP tool registration starts here.

Create or modify:

- `src/server.ts`
- `src/tools/response-contract.ts`
- `src/tools/list-sources.ts`
- `src/tools/list-indicators.ts`
- `src/tools/search-university.ts`
- `src/tools/get-university-metrics.ts`
- `src/tools/compare-universities.ts`
- `src/tools/explain-indicator.ts`
- `src/tools/validate-source-coverage.ts`
- `src/tools/warnings.ts`
- `test/mcp-response-contract.test.ts`
- `test/tools-list-sources.test.ts`
- `test/tools-list-indicators.test.ts`
- `test/tools-search-university.test.ts`
- `test/tools-get-university-metrics.test.ts`
- `test/tools-compare-universities.test.ts`
- `test/tools-explain-indicator.test.ts`
- `test/tools-validate-source-coverage.test.ts`
- `test/no-stdout-logging.test.ts`

Test strategy:

- Contract tests for all response fields.
- Per-tool tests.
- stdio smoke test.
- no-stdout logging test.
- disabled employment indicator tests.

Commands:

- `npm run test -- tools`
- `npm run test -- mcp-response-contract`
- `npm run test -- no-stdout`
- `npm run build`

Risk gate:

- MCP responses must always include `status`, `tool`, `query`, `source` or `sources`, `data`, `warnings`, and `generated_at`.
- Source objects must always include `dataset_id`, `dataset_name`, `provider`, `source_url`, `license`, `derived_database`, and `bundled`.
- Indicator responses must include `source_column`, `year` or `base_year`, and `unit` when applicable.
- stdout logging is banned in stdio MCP runtime.
- `compare_universities` must not produce official rankings.
- Tool registration must remain limited to the seven v0.1 read-only tools.

Acceptance criteria:

- `list_sources` returns bundled `15118998` metadata and does not return bundled `15139279`.
- `list_indicators` returns the four default indicators and does not enable `employment_rate`.
- `search_university` returns candidates instead of guesses for ambiguity.
- `get_university_metrics` returns per-metric provenance and warnings.
- `compare_universities` preserves provenance and warns about non-comparable coverage.
- `explain_indicator` reports definition, source, license, verification, unit, year/base year, and warnings without inferred fields.
- `validate_source_coverage` flags verified, `NotVerified`, disabled, bundled, and non-bundled states.

Failure recovery:

- Centralize response formatting in `response-contract.ts`.
- Convert missing data or ambiguity into structured warnings/status instead of returning guessed values.

## Phase 8: CLI, Doctor, And API-Key Gate

Purpose: provide user-facing startup and prove v0.1 has no key dependency.

Create or modify:

- `src/cli.ts`
- `src/config/api-keys.ts`
- `src/config/database.ts`
- `scripts/doctor.ts`
- `scripts/check-api-key-gate.ts`
- `test/cli.test.ts`
- `test/doctor.test.ts`
- `test/api-key-gate.test.ts`
- `test/secret-masking.test.ts`

Test strategy:

- CLI smoke test.
- Doctor output test.
- Empty-key tests for all seven tools.
- Sentinel secret masking tests.
- Bundled DB fallback tests.

Commands:

- `npm run doctor`
- `npm run test -- cli`
- `npm run test -- doctor`
- `npm run test -- api-key-gate`
- `npm run test -- secret-masking`

Risk gate:

- `DATA_GO_KR_SERVICE_KEY` and `ACADEMYINFO_SERVICE_KEY` are optional reserved env vars only.
- Missing service keys cannot fail file-first tools.
- Doctor may show key status but never key values.
- `ACADEMYINFO_DB_PATH` absence must fall back to bundled seed DB.
- Quickstart must work without API keys.

Acceptance criteria:

- `academyinfo-mcp` CLI starts the stdio server.
- `academyinfo-mcp doctor` exists.
- All seven v0.1 tools work with both service-key env vars unset.
- Doctor exposes only presence/absence or reserved status, not values.
- Logs, manifests, snapshots, docs examples, and package artifacts contain zero real or sentinel key values.
- File-first tools never fail because `serviceKey` is missing.

Failure recovery:

- Remove key reads from file-first code paths.
- Mask or suppress any environment value before it reaches logs, errors, snapshots, docs, or manifests.

## Phase 9: Optional Non-Bundled Employment Local-Ingest Skeleton

Purpose: support explicit local employment ingest without bundling `15139279` data.

Create or modify:

- `src/ingest/local-employment.ts`
- `src/config/employment.ts`
- `docs/local-employment-ingest.md`
- `test/employment-disabled.test.ts`
- `test/employment-local-ingest-skeleton.test.ts`
- `test/employment-package-separation.test.ts`

Test strategy:

- Disabled-by-default tests.
- Local-path privacy tests.
- Header validation tests with synthetic column-name fixtures that do not contain real `15139279` data.
- Package exclusion tests.

Commands:

- `npm run test -- employment`
- `npm run package:check`
- `npm run doctor`

Risk gate:

- Do not include raw, normalized, seed, sample, fixture, SQLite, CSV, JSON, or derived data from `15139279`.
- Do not add package artifact paths containing `15139279`.
- Do not put local absolute paths in responses, logs, snapshots, manifests, docs examples, or package artifacts.
- Keep `employment_rate` disabled unless explicit local ingest is configured at runtime.

Acceptance criteria:

- Default `list_indicators` and metric tools do not return active `employment_rate`.
- Local ingest skeleton validates headers before enabling any local employment observation.
- Package inspection returns zero artifacts containing `15139279`.
- Tests reject any bundled employment data or fixture.

Failure recovery:

- Remove generated employment artifacts.
- Re-disable `employment_rate`.
- Keep only non-bundled policy metadata and local-ingest instructions.

## Phase 10: Package Gate

Purpose: ensure the npm package contains only allowed v0.1 artifacts.

Create or modify:

- `package.json`
- `scripts/package-check.ts`
- `docs/package-gate.md`
- `test/package-gate.test.ts`
- `test/package-dry-run.test.ts`

Test strategy:

- Parse `npm pack --dry-run` output.
- Assert allowlisted files are present.
- Assert forbidden paths and file patterns are absent.
- Scan package dry-run output for secret values and local absolute paths.
- Account for npm's implicitly included standard package metadata files, such as `package.json`, without treating them as forbidden artifacts.

Commands:

- `npm pack --dry-run`
- `npm run package:check`
- `npm run test -- package`

Risk gate:

- Distribution must be controlled by `package.json` `files` allowlist, not `.gitignore`.
- `npm pack --dry-run` must have zero hits for `15139279`, `data/raw`, `data/external`, `.env`, raw `*.xlsx`, raw `*.csv`, service key values, and local absolute paths.
- Package checks must reject forbidden artifacts but must not fail merely because npm includes standard package metadata such as `package.json`.
- Package must include the required seed 3종 once the seed phase is complete.

Acceptance criteria:

- `package.json` has a strict `files` allowlist.
- The explicit `package.json` `files` allowlist is constrained to allowed package artifacts: `dist/**`, `data/seed/academyinfo_15118998.sqlite`, `data/seed/academyinfo_15118998.manifest.json`, `data/seed/LICENSE.15118998.md`, `README.md`, `LICENSE`, `NOTICE.md`, and `DATA_LICENSE.md`.
- Package dry-run checks treat npm's standard implicit metadata files, including `package.json`, as allowed metadata while still rejecting forbidden data, secrets, raw files, private paths, and non-bundled datasets.
- `npm pack --dry-run` includes `data/seed/academyinfo_15118998.sqlite`.
- `npm pack --dry-run` includes `data/seed/academyinfo_15118998.manifest.json`.
- `npm pack --dry-run` includes `data/seed/LICENSE.15118998.md`.
- `npm pack --dry-run` includes `dist/**`, `README.md`, `LICENSE`, `NOTICE.md`, and `DATA_LICENSE.md`.
- `npm pack --dry-run` includes zero raw source files, employment-data files, `.env` files, service keys, credentials, private paths, or local user names.

Failure recovery:

- Tighten `package.json` `files` allowlist.
- Remove forbidden generated artifacts.
- Rerun `npm pack --dry-run` and `npm run package:check` before continuing.

## Phase 11: Public Docs And Quickstart

Purpose: document no-key, file-first use without exposing secrets or private paths.

Create or modify:

- `README.md`
- `docs/usage.md`
- `docs/source-coverage.md`
- `docs/troubleshooting.md`
- `docs/non-affiliation.md`
- `test/docs-safety.test.ts`

Test strategy:

- Docs safety scan.
- Quickstart command smoke test.
- Non-affiliation text scan.
- No official ranking/endorsement scan.

Commands:

- `npm run test -- docs`
- `npm run doctor`
- quickstart smoke command with empty key env vars

Risk gate:

- Docs examples must not include real local absolute paths, `.env` values, credentials, service keys, or local user names.
- Docs must not imply official endorsement by the Ministry of Education, KCUE, KEDI, data.go.kr, or academyinfo.go.kr.
- Docs must not claim official rankings or official evaluation.

Acceptance criteria:

- Quickstart works without API keys.
- README states file-first v0.1.
- README states no API key required.
- README states only `15118998` is bundled.
- README states `15139279` is non-bundled/local-ingest only.
- README includes non-affiliation disclaimer.
- Docs explain `ACADEMYINFO_DB_PATH` fallback to bundled seed DB.

Failure recovery:

- Replace private or key-like examples with placeholders.
- Remove official ranking or endorsement language.

## Phase 12: Release Audit And Backlog Split

Purpose: make the publish/no-publish decision and preserve v0.2/v0.3 backlog boundaries.

Create or modify:

- `docs/release-audit.md`
- `docs/backlog-v0.2-v0.3.md`
- `scripts/release-audit.ts`
- `test/release-audit.test.ts`

Test strategy:

- Full release audit test.
- Gate summary generation test.
- NO-GO-on-any-failure test.
- Backlog boundary scan proving OpenAPI remains v0.3-only.

Commands:

- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run doctor`
- `npm run package:check`
- `npm run prepublishOnly`
- `npm pack --dry-run`

Risk gate:

- If any gate fails, release must not be recommended.
- OpenAPI runtime code must be absent from v0.1.
- `15139279` data must be absent from package artifacts.
- Raw source files must be absent from package artifacts.

Acceptance criteria:

- `docs/release-audit.md` exists.
- `docs/release-audit.md` contains a PASS/FAIL table.
- `docs/release-audit.md` contains command output summary.
- `docs/release-audit.md` contains package file list summary.
- `docs/release-audit.md` contains remaining risks.
- `docs/release-audit.md` contains a `GO`, `GO-WITH-WARNINGS`, or `NO-GO` recommendation.
- Any failed gate results in no release recommendation.
- v0.2/v0.3 backlog contains OpenAPI bridge work only as future work.

Failure recovery:

- Mark audit `NO-GO`.
- Fix the failing gate in its owning phase.
- Regenerate release audit only after all gates pass.

## Acceptance Criteria Buckets

### 1. License Gate

- `DATA_LICENSE.md` exists.
- `NOTICE.md` exists.
- `data/seed/LICENSE.15118998.md` exists before seed packaging.
- `evidence/licenses/15118998.license-snapshot.md` exists.
- `evidence/licenses/15139279.license-snapshot.md` exists.
- `15139279` is explicitly non-bundled.
- Code license and data license are separated.
- Bundled `15118998` license evidence is KOGL-1 / 공공누리 제1유형(출처표시), or release is `NO-GO` until corrected.

### 2. Package Gate

- Distribution is controlled by `package.json` `files` allowlist, not `.gitignore`.
- `npm pack --dry-run` has zero hits for `15139279`.
- `npm pack --dry-run` has zero hits for `data/raw`.
- `npm pack --dry-run` has zero hits for `data/external`.
- `npm pack --dry-run` has zero hits for `.env`.
- `npm pack --dry-run` has zero hits for raw `*.xlsx`.
- `npm pack --dry-run` has zero hits for raw `*.csv`.
- `npm pack --dry-run` has zero service key values.
- `npm pack --dry-run` has zero local absolute paths.
- `npm pack --dry-run` may include standard npm metadata such as `package.json`; this does not fail the gate by itself.
- `npm pack --dry-run` includes `dist/**`.
- `npm pack --dry-run` includes `data/seed/academyinfo_15118998.sqlite`.
- `npm pack --dry-run` includes `data/seed/academyinfo_15118998.manifest.json`.
- `npm pack --dry-run` includes `data/seed/LICENSE.15118998.md`.

### 3. API-Key Gate

- With `DATA_GO_KR_SERVICE_KEY` and `ACADEMYINFO_SERVICE_KEY` unset, all seven v0.1 tools work.
- `academyinfo-mcp doctor` does not expose key values.
- Logs, manifests, snapshots, docs examples, and package artifacts contain zero key values.
- Missing `serviceKey` cannot fail file-first tools.
- Future OpenAPI-only code must fail gracefully if keys are missing, but no such code exists in v0.1.

### 4. Evidence Lock

- Header verification starts with `source_column_verified=false`.
- Only actual downloaded headers or official documentation can verify columns.
- Unit uncertainty returns `unit='NotVerified'` and warnings.
- Endpoint, operation, request parameter, response field, file column, and unit names are never inferred.
- Raw rows are preserved.
- Local absolute paths are absent from evidence, manifests, and DB metadata.

### 5. MCP Response Contract

- All responses include `status`, `tool`, `query`, `source` or `sources`, `data`, `warnings`, and `generated_at`.
- All source objects include `dataset_id`, `dataset_name`, `provider`, `source_url`, `license`, `derived_database`, and `bundled`.
- Indicator responses include `source_column`, `year` or `base_year`, and `unit` when applicable.
- Ambiguous university matches return `status='ambiguous'` and `candidates`.
- `employment_rate` is not returned by default.
- stdout logging is forbidden in stdio MCP runtime.

### 6. Data Model

- SQLite schema includes `source_files`, `institutions`, `indicators`, `observations`, `raw_rows`, and `join_audits`.
- `indicators.json` includes the four default `15118998` indicators.
- `indicators.json` includes disabled `employment_rate`.
- `15139279` data is absent from the seed DB.

### 7. CLI/UX

- `academyinfo-mcp` CLI exists.
- `academyinfo-mcp doctor` exists.
- If `ACADEMYINFO_DB_PATH` is absent, bundled seed DB is used.
- Quickstart works without API keys.

### 8. Release Audit

- `docs/release-audit.md` exists.
- It includes PASS/FAIL table, command output summary, package file list summary, remaining risks, and `GO` / `GO-WITH-WARNINGS` / `NO-GO` recommendation.
- Any failed gate blocks release recommendation.

## Consolidated Planned File List

Current ticket may modify only:

- `plans/academyinfo-mcp-v0-1-implementation.md`

Future implementation tickets may create or modify:

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `README.md`
- `LICENSE`
- `NOTICE.md`
- `DATA_LICENSE.md`
- `data/seed/academyinfo_15118998.sqlite`
- `data/seed/academyinfo_15118998.manifest.json`
- `data/seed/LICENSE.15118998.md`
- `docs/license-gate.md`
- `docs/source-evidence.md`
- `docs/indicator-dictionary.md`
- `docs/local-employment-ingest.md`
- `docs/package-gate.md`
- `docs/usage.md`
- `docs/source-coverage.md`
- `docs/troubleshooting.md`
- `docs/non-affiliation.md`
- `docs/release-audit.md`
- `docs/backlog-v0.2-v0.3.md`
- `evidence/licenses/15118998.license-snapshot.md`
- `evidence/licenses/15139279.license-snapshot.md`
- `evidence/sources/15118998.headers.md`
- `evidence/sources/15118998.source-map.md`
- `evidence/header-snapshots/15118998.headers.json`
- `evidence/sample-rows/15118998.sample.json`
- `evidence/checksums/15118998.checksums.json`
- `src/index.ts`
- `src/server.ts`
- `src/cli.ts`
- `src/logging.ts`
- `src/config/index.ts`
- `src/config/api-keys.ts`
- `src/config/database.ts`
- `src/config/employment.ts`
- `src/db/schema.ts`
- `src/db/connection.ts`
- `src/db/readonly.ts`
- `src/evidence/types.ts`
- `src/evidence/registry.ts`
- `src/indicators/indicators.json`
- `src/indicators/types.ts`
- `src/ingest/dataset-15118998.ts`
- `src/ingest/header-detection.ts`
- `src/ingest/normalize.ts`
- `src/ingest/raw-rows.ts`
- `src/ingest/join-audit.ts`
- `src/ingest/local-employment.ts`
- `src/repository/sources.ts`
- `src/repository/indicators.ts`
- `src/repository/institutions.ts`
- `src/repository/observations.ts`
- `src/repository/coverage.ts`
- `src/repository/search.ts`
- `src/tools/response-contract.ts`
- `src/tools/list-sources.ts`
- `src/tools/list-indicators.ts`
- `src/tools/search-university.ts`
- `src/tools/get-university-metrics.ts`
- `src/tools/compare-universities.ts`
- `src/tools/explain-indicator.ts`
- `src/tools/validate-source-coverage.ts`
- `src/tools/warnings.ts`
- `scripts/check-license-gate.ts`
- `scripts/snapshot-headers.ts`
- `scripts/snapshot-sample-rows.ts`
- `scripts/checksum-source-files.ts`
- `scripts/check-evidence-lock.ts`
- `scripts/build-seed-db.ts`
- `scripts/doctor.ts`
- `scripts/check-api-key-gate.ts`
- `scripts/package-check.ts`
- `scripts/release-audit.ts`
- tests named for the gates and behaviors listed in this plan
- optional `.omo/rules/package-safety.md`
- optional `.omo/rules/mcp-stdio-safety.md`
- optional `.omo/rules/data-license-policy.md`

Test-directory policy:

- Use `test/` consistently for all tests.
- Do not create a `tests/` directory.

Forbidden v0.1 package artifacts:

- `data/raw/**`
- `data/external/**`
- any package artifact path containing `15139279`
- raw `*.xlsx`
- raw `*.csv`
- `.env`
- credentials
- service keys
- local absolute paths
- private paths
- local user names

## Test Strategy Summary

Required tests:

- license gate
- API key gate
- package artifact exclusion
- header detection
- missing column handling
- duplicate university names
- campus ambiguity
- employment-data source separation
- join mismatch
- unit verification
- MCP response schema
- source/license/year/unit/warnings presence
- no stdout logging
- secret masking
- seed DB validity
- package dry-run inspection
- release audit
- evidence snapshot reproducibility
- seed manifest checksum and latest-claim policy

Real-surface commands before release:

- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run doctor`
- `npm run package:check`
- `npm run prepublishOnly`
- `npm pack --dry-run`
- MCP stdio smoke test with both service-key env vars unset

## Release Audit Standard

Release recommendation rules:

- `GO`: every gate passes and remaining risks are documentation-only or backlog-only.
- `GO-WITH-WARNINGS`: every blocking gate passes, but non-blocking known limitations are documented.
- `NO-GO`: any gate fails, any evidence is unverifiable but required for values returned by default tools, any secret/private path appears in artifacts, any raw or employment data is packaged, or any OpenAPI runtime code appears in v0.1.

`docs/release-audit.md` must include:

- PASS/FAIL table
- command output summary
- package file list summary
- remaining risks
- final recommendation

## Stop Conditions

Stop and do not proceed to the next ticket if:

- License evidence for `15118998` is not locked.
- Any `15139279` data appears in package candidates.
- Any source column or unit is unverified but returned as verified.
- Any v0.1 tool requires API keys.
- Any v0.1 code performs live OpenAPI calls.
- Any MCP runtime log writes to stdout.
- Any response, manifest, snapshot, docs example, or package artifact exposes keys, credentials, private paths, or local user names.
- Release audit has any failed gate.
