# academyinfo-mcp

Query and compare **Korean university disclosure indicators (대학알리미)** from Claude
Desktop, Cursor, Codex, and other MCP clients — **no API key, works offline** from a
bundled, attribution-compliant dataset.

> Not affiliated with, endorsed by, or maintained by the Ministry of Education, KCUE,
> KEDI, data.go.kr, or academyinfo.go.kr. This is an independent open-source tool.

## What it does

Ask your MCP client to compare universities on official public-disclosure metrics —
admission competition, enrollment fill rate, employment rate, scholarship per student,
and average tuition — served from a normalized local database. No account, no key, no
network call.

Example prompt: *"전남대학교 본교와 부산대학교를 5개 지표로 비교해줘"*

## Indicators (v0.1)

All five default indicators come from data.go.kr dataset `15118998` (교육부 대학알리미
대학주요정보), covering 488 institutions:

| indicator | 지표 | year | unit |
|---|---|---|---|
| `competition_rate` | 신입생 경쟁률 | 2025 | `:1` |
| `fill_rate` | 신입생 충원율 | 2025 | `%` |
| `employment_rate` | 취업률 | 2025 | `%` |
| `scholarship_per_student` | 학생 1인당 연간 장학금 | 2025 | `원` |
| `avg_tuition` | 평균 등록금 | 2026 | `천원` |

**Data vintage:** these are the 2025 disclosure figures (tuition is the 2026 figure). The
bundled seed sets `seed_is_latest_claim=false` — it is a point-in-time snapshot, not a live
feed. A few closed / no-data institutions carry a literal `0` in the source; treat `0` as
"possibly closed / no data", not necessarily a real `0%`.

## Requirements

Requires Node >= 24.15; uses the built-in `node:sqlite` release-candidate API.

## Quickstart

The server currently runs from source (an npm package is planned). It serves the bundled
seed with no configuration.

```bash
git clone https://github.com/yousunjung84-edu/academyinfo-mcp.git
cd academyinfo-mcp
npm install
npm run build
```

Then point your MCP client at the built server. **Claude Desktop**
(`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS,
`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "academyinfo": {
      "command": "node",
      "args": ["/absolute/path/to/academyinfo-mcp/dist/src/index.js"]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`) uses the same `command`/`args` shape. No API key or env
variable is required — the server defaults to the bundled seed database.

## Example output

A comparison returns per-indicator values with full provenance (source, license, year,
unit, warnings). Verified sample (본교 기준):

| indicator | 전남대(본교) | 부산대(본교) |
|---|---|---|
| 신입생 경쟁률 | 7.4:1 | 9.0:1 |
| 취업률 | 57.6% | 57.5% |
| 평균 등록금 | 4,222 천원 | 4,514 천원 |

Ambiguous names are **not guessed** — a school with multiple campuses (e.g. 전남대학교 has
본교 and 제2캠퍼스) returns candidates so you can pick one. Include campus text such as
`본교` to disambiguate.

## MCP tools (read-only)

`list_sources` · `list_indicators` · `search_university` · `get_university_metrics` ·
`compare_universities` · `explain_indicator` · `validate_source_coverage`

Every response includes `status`, `tool`, `query`, `source(s)`, `data`, `warnings`, and
`generated_at`. Source objects carry `dataset_id`, `provider`, `source_url`, `license`,
`derived_database`, `bundled`, `source_column`, `year/base_year`, and `unit`.
For blank source cells such as source `-` markers, metric tools return
`data.missing_metrics[]` with `reason: "blank_in_source"` instead of inventing values.

## Data refresh policy

The bundled seed is refreshed manually for tagged releases after the `15118998` source
file, header snapshot, checksum ledger, and package dry-run pass review. v0.1 data is a
point-in-time snapshot, not a live feed; use the manifest fields `source_downloaded_at`,
`seed_built_at`, and `seed_is_latest_claim=false` when judging freshness.

## Data source & license

- **Data**: data.go.kr dataset `15118998`, provider 교육부, licensed under
  **공공누리 제1유형 (KOGL Type 1, attribution required)**. The bundled database is a
  normalized derivative; attribution must be preserved when redistributing. See
  `DATA_LICENSE.md` and `NOTICE.md`.
- **Code**: MIT (`LICENSE`). The source-code license and the bundled-data license are
  separate.
- **Not bundled**: dataset `15139279` (granular / per-department / health-insurance-linked
  employment statistics) is deferred to the v0.3 backlog and is never included in package
  data artifacts.

## Roadmap

- **v0.2**: closed-school zero-value warnings · more KCUE disclosure datasets with a shared
  institution identity resolver · richer comparison output.
- **v0.3**: optional OpenAPI bridge (live/fresher data via a reserved service key) ·
  granular employment statistics from `15139279`.

See `docs/ROADMAP.md` and `docs/RELEASE_CHECKLIST.md`.

## Development

```bash
npm run build
npm run test
npm run doctor          # confirms no API key is required
npm run package:check
npm pack --dry-run
```

The stdio server never writes logs to stdout (that would corrupt JSON-RPC); logs go to
stderr. Package contents are controlled by the `package.json` `files` allowlist and reject
raw data, `.env`, secrets, and `15139279` data artifacts.
