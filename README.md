# academyinfo-mcp

`academyinfo-mcp` is a public, read-only, file-first MCP server for Korean
university disclosure indicators. It lets Claude Desktop, Cursor, Codex, and
generic MCP clients query a normalized local database.

This project is not affiliated with, endorsed by, or officially maintained by
the Ministry of Education, KCUE, KEDI, data.go.kr, or academyinfo.go.kr.

## v0.1 Policy

v0.1 requires no API key.

v0.1 is file-first and does not call live OpenAPI endpoints. The default MCP
tools work when `DATA_GO_KR_SERVICE_KEY` and `ACADEMYINFO_SERVICE_KEY` are
unset. Those environment variable names are reserved only for a future v0.3
OpenAPI bridge.

## Bundled Data

Dataset `15118998` is the only bundled v0.1 dataset. It is bundled as a
normalized derivative seed database, not as raw XLSX or CSV source files.

Bundled seed artifacts:

- `data/seed/academyinfo_15118998.sqlite`
- `data/seed/academyinfo_15118998.manifest.json`
- `data/seed/LICENSE.15118998.md`

Dataset `15118998` is documented as KOGL-1 / 공공누리 제1유형(출처표시).
The source-code license and bundled data license are separate.

Default indicators sourced from `15118998`:

- `competition_rate`: 신입생 경쟁률, year `2025`, unit `:1`
- `fill_rate`: 신입생 충원율, year `2025`, unit `%`
- `employment_rate`: 취업률, year `2025`, unit `%`
- `scholarship_per_student`: 학생 1인당 연간 장학금, year `2025`, unit `원`
- `avg_tuition`: 평균 등록금, year `2026`, unit `천원`

The verified `15118998` header embeds year and unit in each indicator column
suffix. There is no single 공시년도 column, so v0.1 treats year and unit as
per-indicator metadata. The verified column names do not contain `(학부)`, so
the default indicators must not be described as undergraduate-only unless a
future verified source says so.

The bundled seed manifest sets `seed_is_latest_claim=false`.

## Non-Bundled Employment Data

Dataset `15139279` is employment data. It is non-bundled and deferred to the
v0.3 backlog only.

No raw, normalized, seed, sample, fixture, SQLite, CSV, JSON, or derived data
from `15139279` may be included in npm package artifacts.

`employment_rate` is enabled by default only when sourced from bundled dataset
`15118998`. Dataset `15139279` is deferred to the v0.3 backlog for granular,
per-department, or health-insurance-linked employment statistics.

## MCP Tools

v0.1 exposes read-only tools for local data access:

- `list_sources`
- `list_indicators`
- `search_university`
- `get_university_metrics`
- `compare_universities`
- `explain_indicator`
- `validate_source_coverage`

Every MCP response includes status, tool, query, source or sources, data,
warnings, and generated_at. Source objects include dataset_id, dataset_name,
provider, source_url, license, derived_database, bundled, source_column,
year/base_year, and unit when applicable.

Ambiguous university names are not guessed. Include campus text such as `본교`
when a school has multiple campus rows.

## Package Safety

Package contents are controlled by the `package.json` `files` allowlist.
Release checks reject package artifacts containing:

- `15139279` data artifacts
- `data/raw`
- `data/external`
- `.env`
- raw `.xlsx` files
- raw `.csv` files
- service key values
- credentials or private local paths

Documentation text may mention `15139279` policy. The package gate rejects
`15139279` data artifacts, not policy documentation.

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

`doctor` reports that API keys are not required for v0.1 and must not print
secret values.
