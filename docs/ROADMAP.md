# Roadmap: academyinfo-mcp

This roadmap defines order of work. It is not permission to skip gates or start implementation early.

## v0.1 Release Principle

v0.1 is file-first, no-key, license-aware, and read-only.

v0.1 must not call live OpenAPI endpoints and must not require `DATA_GO_KR_SERVICE_KEY` or `ACADEMYINFO_SERVICE_KEY`.

## Ticket Sequence

### Ticket 0: Repository Governance

Status: current prompt.

Deliver:
- `AGENTS.md`
- `docs/PROJECT_CHARTER.md`
- `docs/ROADMAP.md`
- `docs/NON_GOALS.md`

No source code, dependencies, package metadata, datasets, fixtures, SQLite files, or generated artifacts.

### Ticket 1: License Gate

Confirm license and attribution requirements before bundling any data.

Required outputs:
- code license decision
- data license record for `15118998`
- explicit non-bundling confirmation for `15139279`
- no endorsement disclaimer text

### Ticket 2: Evidence Lock

Verify source evidence before schema or ingestion work.

Required outputs:
- downloaded-header evidence for `15118998`
- official documentation references where needed
- verified source columns
- verified units
- verified year or base year
- `NotVerified` list for unresolved fields

### Ticket 3: PRD And Architecture Docs

Define the MCP product surface and file-first architecture.

Required outputs:
- read-only MCP tool list
- response provenance contract
- local database derivation model
- raw-file preservation policy
- warning model

### Ticket 4: SQLite Schema And Indicator Dictionary

Design the normalized local database and indicator dictionary.

Required outputs:
- schema proposal
- indicator dictionary for the `15118998` v0.1 indicators
- source-column mapping table
- unit and base-year fields

### Ticket 5: `15118998` Ingestion

Implement ingestion only after Tickets 1 through 4 pass.

Required outputs:
- raw-row preservation
- derived database generation
- no mutation of raw files
- warnings for unverified fields

### Ticket 6: `15139279` v0.3 Backlog Boundary

Document the v0.3-only boundary for granular employment statistics without
bundling `15139279` data or adding v0.1 runtime ingest code.

Required outputs:
- package artifact guard against `15139279`
- `employment_rate` enabled by default only from bundled `15118998`
- `15139279` deferred to v0.3 granular employment statistics
- warnings if a caller asks for `15139279`-sourced granular employment data in v0.1

### Ticket 7: MCP Server And Tools

Implement read-only MCP tools.

Required outputs:
- query and compare tools
- no write tools
- every response includes source, license, year or base year, unit, source column, derived database, bundled status, and warnings
- no stdout logging in stdio MCP mode

### Ticket 8: Seed DB And Packaging

Prepare package artifacts.

Required outputs:
- bundled seed derived only from verified `15118998`
- no `15139279` raw, normalized, seed, sample, fixture, SQLite, CSV, JSON, or derived data
- no API keys, service keys, private paths, or local user names

### Ticket 9: Tests And Quality Gates

Add verification gates.

Required outputs:
- artifact leak checks
- source provenance checks
- no-key startup checks
- stdio stdout logging checks
- non-bundled employment data checks

### Ticket 10: Public Docs

Write public usage documentation.

Required outputs:
- no-key v0.1 examples
- neutral attribution
- license separation
- no private paths or credentials
- non-affiliation disclaimer

### Ticket 11: Final Release Audit

Audit the release package before publication.

Required outputs:
- package contents report
- license report
- secret and private-path scan
- no `15139279` package artifact evidence
- no official endorsement language

### Ticket 12: v0.2/v0.3 Backlog

Track future work.

Potential v0.2:
- more local file datasets after license and evidence gates
- richer comparison outputs

Potential v0.3:
- optional OpenAPI bridge
- graceful missing-key behavior
- no service-key exposure

## Release Gates

Do not proceed past a ticket until its evidence is captured.

Do not publish package artifacts until the final release audit passes.

Do not add OpenAPI runtime behavior to v0.1.
