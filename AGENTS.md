# AGENTS.md — academyinfo-mcp

## Project Identity

This repository implements `academyinfo-mcp`, a public, read-only, file-first MCP server for Korean university disclosure indicators.

The server lets Claude Desktop, Cursor, Codex, and other MCP clients query and compare Korean university disclosure indicators from a normalized local database.

This project is not affiliated with, endorsed by, or officially maintained by the Ministry of Education, KCUE, KEDI, data.go.kr, or academyinfo.go.kr.

## Core Release Decision

v0.1 is file-first.

v0.1 must run without any API key.

v0.1 must not implement live OpenAPI calls.

OpenAPI support is reserved for future v0.3.

## Dataset Policy

### Bundled Dataset

Only dataset `15118998` may be bundled in v0.1.

Dataset `15118998` is used for the default indicators:

- freshman competition rate
- freshman fill rate
- average undergraduate tuition
- scholarship per undergraduate student

The bundled data must be a normalized derivative seed DB, not raw XLSX/CSV files.

The bundled data must include attribution and license metadata.

### Non-Bundled Dataset

Dataset `15139279` is employment data.

Dataset `15139279` must not be bundled in v0.1.

Do not include raw, normalized, seed, sample, fixture, SQLite, CSV, JSON, or derived data from `15139279` in package artifacts.

`employment_rate` must be disabled by default.

`employment_rate` may be supported only through explicit local ingest.

## Source Map Basis

The project source map currently treats:

- `15118998` as the file source for competition rate, fill rate, average undergraduate tuition, and scholarship indicators.
- `15139279` as the file source for employment rate.
- OpenAPI operation names, request parameters, response fields, and file columns as requiring verification before implementation.

Do not treat unverified source-map notes as final schema. Verify actual downloaded headers before mapping columns.

## API Key Policy

v0.1 requires no API key.

The following environment variables are optional and reserved for future v0.3 OpenAPI bridge only:

- `DATA_GO_KR_SERVICE_KEY`
- `ACADEMYINFO_SERVICE_KEY`

Default v0.1 tools must work when both variables are empty.

Missing service keys must never fail file-first tools.

Never expose service keys, API keys, credentials, private paths, or local user names in:

- logs
- MCP responses
- test snapshots
- README examples
- manifests
- package artifacts
- error messages

If future OpenAPI tools are implemented, missing keys must produce structured errors only for those OpenAPI tools.

## Non-Negotiable Rules

1. Do not invent public-data API endpoints, operation names, request parameters, response fields, file columns, or units.
2. Verify all source columns from downloaded headers or official documentation.
3. If a field, unit, endpoint, or column is not verified, mark it as `NotVerified`.
4. Do not scrape websites in v0.1.
5. Do not implement live OpenAPI calls in v0.1.
6. Do not require API keys in v0.1.
7. Do not redistribute `15139279` in v0.1.
8. Do not mutate raw source files.
9. Preserve raw rows for auditability.
10. Fail closed with structured warnings instead of returning guessed values.
11. Never guess a university when there are ambiguous matches.
12. Do not create official rankings or imply official evaluation.
13. Do not claim official endorsement.
14. Keep code license and data license separate.
15. Do not apply the code license to bundled public data.

## MCP Response Contract

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
- `source_column` when applicable
- `year` or `base_year` when applicable
- `unit` when applicable

For indicator values, every MCP response must expose source, license, year or base year, unit, source column, derived database, bundled status, and warnings either in the top-level response or in the relevant source object.

## Stdio Safety

The MCP server uses stdio transport.

Do not write logs to stdout in stdio MCP mode.

Use stderr or a file logger only.

`console.log()` is forbidden in MCP server runtime code unless explicitly used for JSON-RPC protocol output by the SDK.

## Package Safety

The npm package may include:

- `dist/**`
- `data/seed/academyinfo_15118998.sqlite`
- `data/seed/academyinfo_15118998.manifest.json`
- `data/seed/LICENSE.15118998.md`
- `README.md`
- `LICENSE`
- `NOTICE.md`
- `DATA_LICENSE.md`

The npm package must exclude:

- `data/raw/**`
- `data/external/**`
- any path containing `15139279`
- raw `*.xlsx`
- raw `*.csv`
- `.env`
- credentials
- local absolute paths
- private paths
- local user names
- real service keys

## Required Tests

Tests must cover:

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

## Development Commands

Use these commands when available:

```bash
npm run build
npm run test
npm run lint
npm run doctor
npm run package:check
npm run prepublishOnly
```
