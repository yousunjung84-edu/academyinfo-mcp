# academyinfo-mcp

> 한국어 안내: [docs/README.ko.md](docs/README.ko.md)

`academyinfo-mcp` is an independent, read-only MCP server for factual queries and side-by-side comparison of Korean university disclosure indicators. It uses a bundled local snapshot: no API key and no runtime network connection are required.

> This project is not affiliated with, endorsed by, approved by, sponsored by, or maintained by the Ministry of Education, KCUE, KEDI, data.go.kr, academyinfo.go.kr, or any university.

## Quickstart

`academyinfo-mcp` runs with no install, no API key, and no login. It reads a bundled
snapshot of Korean university disclosure indicators (대학알리미, KOGL Type 1) and answers
factual queries and side-by-side comparisons from your AI assistant.

### Claude Desktop

Add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`), then
restart Claude Desktop:

```json
{
  "mcpServers": {
    "academyinfo": {
      "command": "npx",
      "args": ["-y", "academyinfo-mcp"]
    }
  }
}
```

### Cursor

Add the same `command`/`args` shape to `~/.cursor/mcp.json` (or a project `.cursor/mcp.json`),
then reload the MCP server list.

### Any MCP stdio client

```bash
npx -y academyinfo-mcp
```

The server speaks MCP over stdio (JSON-RPC on stdout, diagnostics on stderr).

### Try it

Ask your assistant something like:

> "전남대와 부산대의 취업률과 경쟁률을 비교해줘."

The server never guesses an ambiguous name. "전남대학교" matches two campuses, so the first
`explore_universities` call returns `status: "ambiguous"` with the candidates instead of a table:

```text
전남대학교 → 2 candidates
    전남대학교 / 본교       (국립, 광주)
    전남대학교 / 제2캠퍼스  (국립, 전남)
```

Pick a campus and ask again (assistants usually do this follow-up on their own):

> "전남대학교 본교와 부산대학교로 비교해줘."

The second call returns `status: "ok"` with each institution's values and the source, year,
and unit attached — for example (2025 bundled snapshot):

| 대학 | 취업률 | 신입생 경쟁률 |
|---|---:|---:|
| 전남대학교 본교 | 57.6% | 7.4:1 |
| 부산대학교 | 57.5% | 9:1 |

This two-step flow is the designed behavior, not a failure: ambiguous names return candidate
campuses instead of guessing, and comparisons never rank, score, or pick a winner — the
numbers are presented as-is with provenance so you decide.

## Evidence-scoped status

Implemented in this checkout:

- a file-first, offline, read-only stdio server backed by the bundled `15118998` derivative database;
- exactly eight registered MCP tools (the seven legacy tools plus `explore_universities`);
- a schema-validated, KOGL-attributed data-only indicator catalog at `data/seed/indicators.json`;
- Node engine `>=22 <23` and the closed direct production dependency set `@modelcontextprotocol/sdk@1.29.0`, `better-sqlite3@11.10.0`, `pino@10.3.1`, and `zod@4.4.3`;
- ambiguity handling that returns candidates rather than guessing, and factual comparisons without scores, ranks, winners, or recommendations;
- a checkout-only stateless Streamable HTTP entry point (`dist/src/http.js`, POST-only, excluded from the npm package) alongside the packaged stdio entry point, with `readOnlyHint`/`openWorldHint` annotations on all eight tools.

Published: `academyinfo-mcp@0.3.0` is live on the public npm registry (`latest`), published by hand from an isolated terminal ceremony ([`docs/manual-publish-runbook.md`](docs/manual-publish-runbook.md)). The initial `0.1.0` release was smoke-verified with an anonymous `npx -y academyinfo-mcp@0.1.0` install that resolves the exact registry tarball and lists all eight tools; later releases (`0.1.1`, `0.1.2`, `0.2.0`, `0.3.0`) follow the same runbook.

Not yet performed (intentional, proportionate for a first solo release):

- the formal no-compile `npx` proof across all three official Node 22 lanes (macOS/arm64, Windows/x64, Ubuntu glibc/x64) — only a single-machine smoke test was run. Separately, a one-off manual run (2026-07-24, outside CI) on Ubuntu 24.04 glibc/x64 with Node 22 installed `academyinfo-mcp@0.1.1` anonymously, resolved `better-sqlite3` from prebuilt binaries without compiling, and verified initialize, all eight tools, and an `explore_universities` call with JSON-RPC-only stdout; this is recorded observation, not the formal lane proof, and macOS/arm64 and Windows/x64 remain unverified;
- the receipt-bound candidate→client→promotion evidence chain and an actual-client (Claude Desktop) receipt;
- an approved unattended official download link or a completed annual refresh.

The package ships `better-sqlite3@11.10.0` as its sole backend. It installs from prebuilt binaries on the maintainer's Node 22 macOS/arm64 lane and, in the one-off manual run above, on Ubuntu 24.04 glibc/x64; the full three-lane prebuilt-only matrix has not been independently proven. Exactly one backend ships.

## Requirements

Use Node `>=22 <23`. Node 24 and later are not supported or claimed. The public support matrix is limited to Node 22 on:

- macOS/arm64;
- Windows/x64;
- Ubuntu glibc/x64.

Those lanes are targets until public-install evidence is collected; local success is not public support evidence.

## Local checkout use

The implemented local behavior can be exercised from a checkout:

```bash
npm install
npm run build
node dist/src/index.js
```

The last command starts an MCP stdio server. It does not provide an interactive shell. MCP protocol output is written to stdout; diagnostics must remain on stderr.

No API-key environment variable is required. `ACADEMYINFO_DB_PATH` may select another compatible local database; otherwise the bundled seed is used. Runtime tools do not write the database or contact an external service.
This development checkout defines `npm run doctor`, `npm run refresh:acquire-validate`, and `npm run refresh:verify-artifact`. Only `doctor` has its compiled program included in the packed npm artifact, where it is a local package/data/runtime diagnostic; it does not prove public installation, backend selection, refresh acceptance, or release approval. The compiled refresh programs, their TypeScript build sources, and required development dependencies are excluded from the package, so both refresh commands are checkout-only protected-workflow internals, not supported installed-package commands. Direct local invocation is never an authoritative acquisition, writer, or release receipt.

## Remote endpoint (Streamable HTTP, checkout-only)

The npm package remains stdio-only. A checkout (or a container image built from it) also
provides a stateless Streamable HTTP entry point for remote MCP clients such as claude.ai
custom connectors:

```bash
npm run build
PORT=8080 ALLOWED_HOSTS=<public-host> npm run start:http
```

- `POST /mcp` accepts one JSON-RPC MCP request per call and answers a JSON response; GET
  (SSE streams) and DELETE (sessions) are not served because every request runs on a fresh
  server instance.
- `GET /healthz` and `GET /health` answer `200 ok` for deployment health checks (on
  Cloud Run `run.app` domains the Google frontend consumes the literal `/healthz` path,
  so external probes must use `/health`).
- `ALLOWED_HOSTS` (comma-separated) enables DNS rebinding protection; leave it unset only
  behind a trusted proxy.
- `dist/src/http.js` is excluded from the npm package, so installed `npx academyinfo-mcp`
  behavior is unchanged.

A remote deployment serves the same bundled point-in-time snapshot under the same
attribution and disclaimer boundaries: it is not a live feed and does not guarantee the
latest data, and the operator remains unaffiliated with the Ministry of Education, KCUE,
KEDI, data.go.kr, academyinfo.go.kr, or any university.

## Version pinning

The [Quickstart](#quickstart) uses the unversioned `academyinfo-mcp`, which resolves to the
current `latest` (now `0.3.0`). To pin a specific version instead, use `academyinfo-mcp@0.3.0`
in the `args`. Cursor and Codex use the same `command`/`args` shape as the Claude Desktop
example; they are documented configurations and behave identically over MCP stdio.

## Exact eight-tool scope

1. `list_sources`
2. `list_indicators`
3. `search_university`
4. `get_university_metrics`
5. `compare_universities`
6. `explain_indicator`
7. `validate_source_coverage`
8. `explore_universities`

The first seven contracts remain backward compatible. For client compatibility, `tools/list` registers `explore_universities` with this exact permissive Draft-07 outer input schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "university_queries": {},
    "indicators": {}
  },
  "additionalProperties": {}
}
```

The registered schema deliberately has no `required` keyword, and both property schemas plus `additionalProperties` are empty schemas. It is only the discovery boundary; the handler separately applies strict internal validation. The handler requires `university_queries`, rejects unknown top-level fields, accepts 1–10 unique trimmed query strings of 1–120 Unicode code points, and accepts an optional `indicators` array containing at most five unique supported nonempty indicator IDs. Invalid input fails before any journey is evaluated.

A valid `explore_universities` request is resolved against one local read-only snapshot. It is all-or-nothing. A missing or ambiguous university returns no partial metrics, comparisons, or explanations. Ambiguous matches return up to 20 repository-ordered candidates and never select one. The tool does not rank by metric values or substitute for a user's choice.

Every successful value or explanation retains source and license information, year or base year, unit, source column, derived/bundled status, and warnings. Missing source values remain explicit rather than being inferred.

## Indicators and data boundary

The catalog contains exactly seventeen indicators from bundled dataset `15118998`:

| indicator | label | snapshot year | unit |
|---|---|---:|---|
| `competition_rate` | 신입생 경쟁률 | 2025 | `:1` |
| `fill_rate` | 신입생 충원율 | 2025 | `%` |
| `employment_rate` | 취업률 | 2025 | `%` |
| `scholarship_per_student` | 학생 1인당 연간 장학금 | 2025 | `원` |
| `avg_tuition` | 평균 등록금 | 2026 | `천원` |
| `admission_quota` | 입학정원 | 2025 | `명` |
| `graduates_count` | 졸업생수 | 2025 | `명` |
| `fulltime_faculty_count` | 전임교원수(학부+대학원) | 2025 | `명` |
| `enrolled_students` | 재학생 | 2025 | `명` |
| `international_students` | 외국인 학생 수 | 2025 | `명` |
| `students_per_fulltime_faculty` | 전임교원 1인당 학생 수(학생정원기준)(학부+대학원) | 2025 | `명` |
| `fulltime_faculty_ratio_quota` | 전임교원 확보율(학생정원기준)(학부+대학원) | 2025 | `%` |
| `fulltime_faculty_ratio_enrolled` | 전임 교원 확보율(재학생 기준)(학부+대학원) | 2025 | `%` |
| `fulltime_faculty_lecture_ratio` | 전임교원 강의 담당 비율 | 2025 | `%` |
| `education_expense_per_student` | 학생 1인당 교육비(학부+대학원) | 2025 | `천원` |
| `dormitory_capacity_rate` | 기숙사 수용율(학부+대학원) | 2025 | `%` |
| `books_per_student` | 학생 1인당 도서 자료 수(학부+대학원) | 2025 | `권` |

These dates describe the currently bundled point-in-time snapshot, not a live feed or latest-data guarantee. The catalog is JSON data, validated by a closed static schema and packaged under the data license; it is not generated executable source. The database, manifest, and catalog are independently cross-checked.

Dataset `15139279` is not bundled, enabled, sampled, normalized, or used for default employment results. Live OpenAPI access, scraping, and granular employment behavior are outside this release.

## Refresh safety summary

Refresh approval is semantic, not based on a frozen checksum or fixed column count. Acquisition is read-only and separate from the fixed-path repository writer. A refresh must preserve indexed raw cells and prove:

- official source, workbook, and license identity;
- one unique identity mapping and one unique mapping for each of the seventeen logical indicators;
- fixed verified units and nondecreasing integer years;
- exact row coverage: every source row maps once, with seventeen numeric-or-missing classifications;
- missing values only for trimmed empty text or ASCII `-`;
- exact nonnegative decimal parsing and round-trip safety, with no rounding.

A post-download SHA-256 is integrity, change, and audit evidence only. A changed checksum, institution set, values, allowed missingness, unrelated columns, or a valid 24/26-column workbook can pass when all semantic invariants pass. A prior-checksum match does not authenticate a source. See [`docs/refresh-release-runbook.md`](docs/refresh-release-runbook.md).

## Freshness and release behavior

A refresh incident has an immutable first-seen time and a seven-day (`604800000` ms) deadline; metadata, ETag, or repeated-failure drift does not reset it. Invalid official timestamps do not become trusted times.

- Equal reacquired bytes may close an incident only after origin/license/workbook validation and an administrator-attested verified-no-change receipt.
- Differing bytes enter the changed lifecycle and close only when the matching release-data digest is promoted to `latest`.
- Failed validation or release leaves the last-known-good data and public version in service.
- Rolling back reopens the original changed-event clock; a corrected release uses a new SemVer.

Candidate publication is not completion. Public matrix evidence and actual Claude Desktop/macOS evidence must be joined into protected receipts before administrator-approved promotion. Rollback restores the prior `latest`, deprecates the bad version, preserves evidence, and reopens the incident when applicable.
Candidate publication, promotion, and rollback all serialize npm registry mutation through the `academyinfo-mcp-registry-mutation` concurrency group with `cancel-in-progress: false`. After promotion, the uploaded post-mutation `promotion.v1.json` must be retained and persisted byte-identically in a protected immutable default-branch evidence commit at `evidence/releases/<version>/promotion.v1.json` before rollback is available. After rollback, its uploaded post-mutation `rollback.v1.json` must likewise be retained and persisted byte-identically at `evidence/releases/<bad_version>/rollback.v1.json`.

## Public-install proof boundary

Local installs and local tarballs do not satisfy public acceptance. Each official lane must use a fresh home, cache, working directory, and configuration outside the checkout; an explicit public registry; no reachable local artifact; and exact:

```bash
npx -y academyinfo-mcp@<version>
```

The proof must record the installed application and the complete direct production dependency set—`@modelcontextprotocol/sdk@1.29.0`, `better-sqlite3@11.10.0`, `pino@10.3.1`, and `zod@4.4.3` in the current single-backend package—plus each registry integrity; candidate tag and provenance/signature evidence; Node/OS/architecture (and glibc on Ubuntu); active Python/node-gyp/compiler traps with a demonstrated canary; verbose sanitized install logs; initialization; the exact eight-tool list and `explore_universities` schema; a bundled-data query; no-key behavior; and JSON-RPC-only stdout. A separately approved backend replacement requires the verifier and this closed dependency set to change together. Promotion is prohibited if any lane compiles native code, resolves another direct dependency version, reaches a local package, or lacks the required evidence.

## Administrator prerequisites

Before candidate publication, an administrator must establish npm package identity/history and ownership, select an unused SemVer, confirm 2FA/trusted-publishing and provenance readiness, configure exactly the protected environments `refresh-pr-writer`, `npm-candidate`, `public-candidate-proof`, `claude-desktop-client-proof`, `npm-promotion`, and `npm-rollback` with required approvals and artifact retention, define protected `ACADEMYINFO_RELEASE_ADMINISTRATOR` as the exact receipt-authority identity, and define `ACADEMYINFO_PUBLIC_INSTALL_VERIFIER_SHA256` plus `ACADEMYINFO_RELEASE_RECEIPT_VERIFIER_SHA256` from the reviewed current verifier policy. The administrator must resolve the single-backend gate and approve the immutable candidate, client-proof, promotion, and any rollback receipts at their separate privilege boundaries. Every protected verifier call binds the configured authority and reviewed verifier bytes; neither receipt-provided identity nor caller-selected historical code is authority. No repository document selects a version or grants those approvals.

## License and privacy boundaries

- Code is MIT licensed (`LICENSE`).
- Bundled `15118998` data is a normalized derivative under KOGL Type 1 attribution requirements (`DATA_LICENSE.md`, `NOTICE.md`, and `data/seed/LICENSE.15118998.md`). Code and data licenses remain separate.
- Release artifacts, receipts, logs, errors, examples, and MCP responses must not contain credentials, service keys, signed query strings, local user names, machine identifiers, or private filesystem paths.
- Raw workbooks and signed download URLs are not package contents.

The normative scope and gates are maintained in the repository at [PROJECT_CHARTER.md](https://github.com/yousunjung84-edu/academyinfo-mcp/blob/main/docs/PROJECT_CHARTER.md), [NON_GOALS.md](https://github.com/yousunjung84-edu/academyinfo-mcp/blob/main/docs/NON_GOALS.md), and [RELEASE_CHECKLIST.md](https://github.com/yousunjung84-edu/academyinfo-mcp/blob/main/docs/RELEASE_CHECKLIST.md).
