# academyinfo-mcp

`academyinfo-mcp` is a public, read-only, file-first MCP server for Korean
university disclosure indicators. It is intended for Claude Desktop, Cursor,
Codex, and generic MCP clients that need to query a normalized local database.

This project is not affiliated with, endorsed by, or officially maintained by
the Ministry of Education, KCUE, KEDI, data.go.kr, or academyinfo.go.kr.

## v0.1 Policy

v0.1 requires no API key.

v0.1 is file-first and does not call live OpenAPI endpoints. The default MCP
tools must work when `DATA_GO_KR_SERVICE_KEY` and `ACADEMYINFO_SERVICE_KEY`
are unset. Those environment variable names are reserved only for a future
v0.3 OpenAPI bridge.

## Bundled Data

Dataset `15118998` is the only bundled v0.1 dataset. It is bundled only as a
normalized derivative seed database, not as raw XLSX or CSV source files.

Bundled seed artifacts:

- `data/seed/academyinfo_15118998.sqlite`
- `data/seed/academyinfo_15118998.manifest.json`
- `data/seed/LICENSE.15118998.md`

Dataset `15118998` is documented as KOGL-1 / 공공누리 제1유형(출처표시).
The source-code license and bundled data license are separate.

Default indicators sourced from `15118998`:

- freshman competition rate
- freshman fill rate
- average undergraduate tuition
- scholarship per undergraduate student

The bundled seed manifest must not claim that the seed is the latest source
data unless that claim is explicitly verified.

## Non-Bundled Employment Data

Dataset `15139279` is employment data. It is non-bundled / local ingest only.

No raw, normalized, seed, sample, fixture, SQLite, CSV, JSON, or derived data
from `15139279` may be included in npm package artifacts. `employment_rate` is
disabled by default.

## MCP Tools

v0.1 exposes read-only tools for local data access:

- `list_sources`
- `list_indicators`
- `search_university`
- `get_university_metrics`
- `compare_universities`
- `explain_indicator`
- `validate_source_coverage`

Every MCP response must include status, tool, query, source or sources, data,
warnings, and generated_at. Source objects must include dataset_id,
dataset_name, provider, source_url, license, derived_database, and bundled.
Indicator responses include source_column, year or base_year, and unit when
applicable. Unknown or unverified fields must be returned as `NotVerified`
with structured warnings instead of guessed values.

## Package Safety

Package contents are controlled by the `package.json` `files` allowlist.
Release checks must reject package artifacts containing:

- `15139279`
- `data/raw`
- `data/external`
- `.env`
- raw `.xlsx` files
- raw `.csv` files
- service key values
- credentials or private local paths

## Local Checks

Run the release gates from the repository root:

```bash
npm run build
npm run test
npm run doctor
npm run package:check
npm run prepublishOnly
npm pack --dry-run --json
```

`doctor` must report that API keys are not required for v0.1 and must not print
secret values.
