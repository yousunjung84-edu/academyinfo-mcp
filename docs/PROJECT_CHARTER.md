# Project Charter: academyinfo-mcp

## Project Purpose

`academyinfo-mcp` provides a public, read-only MCP interface for Korean university disclosure indicators.

The project helps Claude Desktop, Cursor, Codex, and generic MCP clients query and compare selected university disclosure indicators from a normalized local database.

The project is not an official data portal. It is a developer-facing MCP package that preserves source provenance, license metadata, raw-row auditability, and evidence warnings.

## File-First Architecture

v0.1 is file-first.

The v0.1 architecture must be built around local source files and a derived local database. It must not depend on live network calls for normal operation.

The file-first architecture has four boundaries:
- raw source files are immutable inputs
- raw rows are preserved for auditability
- normalized data is derived from verified source columns
- MCP responses expose provenance and warnings for every returned value

## No-Key v0.1 Policy

v0.1 must run without API keys.

No v0.1 command, MCP tool, import path, test, example, or package artifact may require `DATA_GO_KR_SERVICE_KEY`, `ACADEMYINFO_SERVICE_KEY`, or any other service key.

Missing API keys must not degrade v0.1 behavior because v0.1 must not depend on them.

## Optional v0.3 OpenAPI Key Policy

OpenAPI support is future work for a possible v0.3 bridge.

`DATA_GO_KR_SERVICE_KEY` and `ACADEMYINFO_SERVICE_KEY` are optional environment variables reserved for that future bridge.

If a future v0.3 OpenAPI bridge is implemented:
- it must fail gracefully when a service key is absent
- it must never expose service keys in logs, MCP responses, manifests, documentation examples, package artifacts, snapshots, or error messages
- it must not change the v0.1 file-first and no-key release contract retroactively

## Bundled Data Policy

Dataset `15118998` is the only bundled dataset in v0.1.

It may be used for the v0.1 bundled seed only after the license gate and source-column evidence gate pass.

The intended v0.1 indicators from `15118998` are:
- freshman competition rate
- freshman fill rate
- average undergraduate tuition
- scholarship per undergraduate student

Each indicator must retain source, license, year or base year, unit, source column, derived database, bundled status, and warnings in MCP responses.

## Non-Bundled Data Policy

Dataset `15139279` is employment data.

It is optional local-ingest only and must not be bundled in v0.1.

The project must not include raw, normalized, seed, sample, or fixture data from `15139279` in package artifacts.

`employment_rate` is disabled by default.

## Read-Only MCP Scope

The MCP server scope is read-only.

Allowed future tool behavior:
- query verified indicators
- compare verified indicators
- return source provenance
- return structured warnings
- explain whether an indicator is bundled, disabled, or unavailable

Disallowed future tool behavior:
- mutate source files
- mutate official data
- submit data to external services
- write back to public portals
- infer missing units, source columns, or values
- produce official rankings

## Supported Clients

The supported MCP client targets are:
- Claude Desktop
- Cursor
- Codex
- generic MCP clients

Client-specific examples must not contain API keys, service keys, credentials, private paths, local user names, or machine-specific identifiers.

## Non-Affiliation Disclaimer

`academyinfo-mcp` is not affiliated with, sponsored by, approved by, or officially endorsed by the Ministry of Education, KCUE, KEDI, data.go.kr, academyinfo.go.kr, or any university.

All attribution must remain neutral and source-based.

## Assumptions

- `15118998` is the only v0.1 bundled dataset candidate.
- `15139279` remains non-bundled unless a future ticket changes policy after license review.
- Source columns, units, and years must be verified from actual downloaded headers or official documentation before implementation.
- Code license and data license remain separate.

## Options

Option A: Keep v0.1 file-first and bundle only verified `15118998` data.

Option B: Add employment data to v0.1.

Option C: Add live OpenAPI calls to v0.1.

## Recommendation

Use Option A.

It satisfies the no-key v0.1 policy, keeps licensing risk bounded, and preserves a clean path for later optional local-ingest and v0.3 OpenAPI work.

## Unresolved

- Final code license.
- Final attribution wording for dataset `15118998`.
- Verified headers, source columns, units, and base years for `15118998`.
- Optional local ingest design for `15139279`.
- v0.3 OpenAPI bridge design.
