# academyinfo-mcp

`academyinfo-mcp` is an independent, read-only MCP server for factual queries and side-by-side comparison of Korean university disclosure indicators. It uses a bundled local snapshot: no API key and no runtime network connection are required.

> This project is not affiliated with, endorsed by, approved by, sponsored by, or maintained by the Ministry of Education, KCUE, KEDI, data.go.kr, academyinfo.go.kr, or any university.

## Evidence-scoped status

Implemented in this checkout:

- a file-first, offline, read-only stdio server backed by the bundled `15118998` derivative database;
- exactly eight registered MCP tools (the seven legacy tools plus `explore_universities`);
- a schema-validated, KOGL-attributed data-only indicator catalog at `data/seed/indicators.json`;
- Node engine `>=22 <23` and the closed direct production dependency set `@modelcontextprotocol/sdk@1.29.0`, `better-sqlite3@11.10.0`, `pino@10.3.1`, and `zod@4.4.3`;
- ambiguity handling that returns candidates rather than guessing, and factual comparisons without scores, ranks, winners, or recommendations.

Not established by this checkout alone:

- public npm availability, an administrator-selected unused release version, package ownership, or publication approval;
- no-compile public `npx` proof on the three official Node 22 lanes;
- a completed backend-selection gate, candidate publication, public-client receipts, `latest` promotion, or rollback drill;
- an approved unattended official download link or a completed annual refresh.

The current package uses `better-sqlite3`, but that is not yet a public support claim. Release remains blocked until it passes prebuilt-only proof on Node 22 macOS/arm64, Windows/x64, and Ubuntu glibc/x64. If it fails any lane, `sql.js` may replace it only after the required Architect and administrator backend-selection receipt. Exactly one backend may ship.

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

## Future public-client configuration

Only after an exact candidate version has actually been published and independently verified may a client configuration use this shape:

```json
{
  "mcpServers": {
    "academyinfo": {
      "command": "npx",
      "args": ["-y", "academyinfo-mcp@<administrator-selected-version>"]
    }
  }
}
```

Replace the placeholder only with the exact verified public version. Do not use an unversioned command, infer a version from this checkout, or treat this example as evidence that a candidate or `latest` release exists. Claude Desktop/macOS must be exercised against the candidate before promotion. Cursor and Codex configurations remain documentation-only unless separate client evidence says they were actually exercised.

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

The catalog contains exactly five indicators from bundled dataset `15118998`:

| indicator | label | snapshot year | unit |
|---|---|---:|---|
| `competition_rate` | 신입생 경쟁률 | 2025 | `:1` |
| `fill_rate` | 신입생 충원율 | 2025 | `%` |
| `employment_rate` | 취업률 | 2025 | `%` |
| `scholarship_per_student` | 학생 1인당 연간 장학금 | 2025 | `원` |
| `avg_tuition` | 평균 등록금 | 2026 | `천원` |

These dates describe the currently bundled point-in-time snapshot, not a live feed or latest-data guarantee. The catalog is JSON data, validated by a closed static schema and packaged under the data license; it is not generated executable source. The database, manifest, and catalog are independently cross-checked.

Dataset `15139279` is not bundled, enabled, sampled, normalized, or used for default employment results. Live OpenAPI access, scraping, and granular employment behavior are outside this release.

## Refresh safety summary

Refresh approval is semantic, not based on a frozen checksum or fixed column count. Acquisition is read-only and separate from the fixed-path repository writer. A refresh must preserve indexed raw cells and prove:

- official source, workbook, and license identity;
- one unique identity mapping and one unique mapping for each of the five logical indicators;
- fixed verified units and nondecreasing integer years;
- exact row coverage: every source row maps once, with five numeric-or-missing classifications;
- missing values only for trimmed empty text or ASCII `-`;
- exact nonnegative decimal parsing and round-trip safety, with no rounding.

A post-download SHA-256 is integrity, change, and audit evidence only. A changed checksum, institution set, values, allowed missingness, unrelated columns, or a valid 23/25-column workbook can pass when all semantic invariants pass. A prior-checksum match does not authenticate a source. See [`docs/refresh-release-runbook.md`](docs/refresh-release-runbook.md).

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
