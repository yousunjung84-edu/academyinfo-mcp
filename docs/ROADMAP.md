# Roadmap: academyinfo-mcp

## Purpose and evidence boundary

This roadmap orders the remaining work for the integrated release contract. It does not select a public version, source endpoint, or SQLite backend; grant an approval; or prove npm availability, client execution, promotion, or rollback readiness. A checkout, workflow definition, local install, or packed tarball is not public-release evidence.

The implemented baseline is file-first, offline, no-key, read-only, and recommendation-free. Runtime behavior must not call a live OpenAPI endpoint, scrape a website, mutate source data, or require `DATA_GO_KR_SERVICE_KEY` or `ACADEMYINFO_SERVICE_KEY`.

## Integrated baseline that must remain stable

### Runtime and dependency boundary

- Node is exactly `>=22 <23`. Node 24 and later are not supported or claimed.
- The only intended public lanes are Node 22 macOS/arm64, Windows/x64, and Ubuntu glibc/x64, after each lane has protected public-install evidence.
- The MCP transport contract is pinned to exact runtime requirements `@modelcontextprotocol/sdk` `1.29.0` and `zod` `4.4.3`. Ranges or silent upgrades are prohibited.
- Stdio stdout contains MCP JSON-RPC only; diagnostics use stderr.

### Exact eight-tool scope

The server registers exactly these eight read-only tools:

1. `list_sources`
2. `list_indicators`
3. `search_university`
4. `get_university_metrics`
5. `compare_universities`
6. `explain_indicator`
7. `validate_source_coverage`
8. `explore_universities`

The first seven contracts remain backward compatible. `explore_universities` is bounded to 10 university queries and 5 indicators, uses one local snapshot, never guesses an ambiguous institution, and returns no partial metrics, comparisons, or explanations when any university is unresolved. No tool scores, weights, ranks, recommends, or selects a winner.

### Data and catalog boundary

- Dataset `15118998` is the only bundled source.
- `data/seed/indicators.json` is the sole packaged source-derived catalog. It is closed-schema, KOGL-attributed JSON data, not generated executable TypeScript or JavaScript and not backed by a hard-coded fallback.
- The catalog contains exactly seventeen logical indicators: `competition_rate`, `fill_rate`, `employment_rate`, `scholarship_per_student`, `avg_tuition`, `admission_quota`, `graduates_count`, `fulltime_faculty_count`, `enrolled_students`, `international_students`, `students_per_fulltime_faculty`, `fulltime_faculty_ratio_quota`, `fulltime_faculty_ratio_enrolled`, `fulltime_faculty_lecture_ratio`, `education_expense_per_student`, `dormitory_capacity_rate`, and `books_per_student`.
- `employment_rate` is the school-level value from `15118998` only.
- Dataset `15139279` and all granular, per-department, or health-insurance-linked employment data remain excluded from package artifacts and default runtime behavior.
- Code remains MIT licensed; bundled data remains separately attributed under KOGL Type 1.

### Semantic refresh authority

Refresh acceptance is semantic, not a frozen-file or fixed-shape comparison:

- require one unique identity mapping and one unique mapping for each of the seventeen logical indicators;
- preserve indexed raw cells and map every source row exactly once to one raw row, one institution, and seventeen numeric-or-missing classifications;
- keep verified units fixed and years as nondecreasing integers;
- treat only trimmed empty text and ASCII `-` as missing;
- parse only the approved nonnegative decimal grammars, preserve canonical decimal text as semantic authority, require exact JavaScript Number round-trip safety, and never round;
- treat post-download SHA-256 as integrity, change-detection, and audit evidence only—not source authenticity or approval.

A matching prior checksum does not approve a source, and a changed checksum does not reject it. A changed institution set, values, allowed missingness, unrelated columns, row count, or worksheet width is an administrator-reviewed diff rather than an independent pass/fail rule. Valid 24-column, 26-column, or other annual shapes may pass when every semantic invariant passes.

## Remaining gated sequence

### Gate 1: Administrator prerequisites

Before any candidate publication, an administrator must establish npm identity, version history, ownership and release authority; select an unused SemVer; confirm 2FA or trusted publishing and provenance readiness; configure protected environments and retention; and provide an evidenced query-free official acquisition page. No repository document supplies these facts or approvals.

### Gate 2: Resolve the single backend

The current `better-sqlite3` integration is provisional. It may ship only after the same candidate proves prebuilt-only installation on all three official Node 22 lanes with fresh state, active Python/node-gyp/compiler traps, and a demonstrated canary.

If that path fails, one reviewed `sql.js` version remains a spike until it proves contract parity, custom/missing/corrupt database behavior, package/WASM/license/security posture, startup and RSS bounds, and no-native-build operation. Selecting it additionally requires separate Architect and administrator approval bound to the closed backend-selection receipt.

Until one path passes, release state is `BLOCKED_PENDING_BACKEND_SELECTION`. Exactly one backend may ship; there is no automatic fallback or dual-backend package.

### Gate 3: Semantic refresh and fixed-path writing

Run acquisition and validation in a read-only trust domain from an immutable source revision. Emit only sanitized candidate artifacts and a closed report. A separate least-privilege writer must verify the producer, source revision, policy/schema versions, hashes, and complete allowlist before writing only the database, manifest, data-only catalog, header/checksum/sample evidence, and one digest-named refresh audit.

Failure and verified-no-change paths cannot invoke content writes. Equal reacquired bytes may close an incident only after source/license/workbook revalidation and an administrator-attested verified-no-change receipt. Differing bytes remain open until the matching release-data digest reaches `latest`.

### Gate 4: Protected candidate transition

After all local, data, dependency, privacy, package, and selected-backend gates pass on immutable inputs, publish the administrator-selected unused version only under a non-`latest` candidate tag. Preserve the prior `latest`. The protected candidate receipt must bind the source, package, backend, data, dependency, audit, registry, and provenance evidence. Candidate publication is not release completion.

### Gate 5: Public-install and client proof

Verify the exact public candidate on the three official Node 22 lanes using fresh homes, caches, working directories, and configurations outside the checkout; an explicit public registry; no reachable local artifact; active build-tool traps; and exact `npx -y academyinfo-mcp@<version>`.

Protected evidence must establish installed application/SDK/Zod identity and registry integrity, candidate tag and provenance/signature evidence, platform identity, sanitized verbose install output, no compilation, initialization, the exact eight-tool list and eighth-tool schema, a bundled-data query, no-key behavior, and JSON-RPC-only stdout.

A separate protected client receipt must join those lane proofs, a generic stdio journey, and actual Claude Desktop/macOS execution against the same candidate. Cursor and Codex examples remain documentation-only unless separately exercised.

### Gate 6: Protected promotion

Only an administrator-approved protected transition may move the already-proved candidate bytes to `latest`. Promotion must reverify candidate/client predecessor digests and public identity/integrity; it must not rebuild or substitute the package. A changed-data incident closes only when its matching release-data digest reaches `latest`.

### Gate 7: Protected rollback readiness

Rollback must be separately administrator-approved. It restores the exact prior-good `latest`, deprecates the bad version, preserves the evidence chain, verifies the public result, and reopens the original changed-data incident clock when applicable. A correction uses a new unused SemVer; an existing version is never overwritten or reused.

## Explicit non-goals

- No live OpenAPI bridge, scraping, runtime network access, service key, write-capable tool, telemetry, or stdout diagnostics.
- No `15139279` artifact or granular employment feature.
- No executable source-derived catalog or mixing of MIT code terms with KOGL data obligations.
- No recommendation, score, rank, winner/loser, guessed institution, or partial unresolved exploration result.
- No Node 24+ support claim, dual backend, automatic backend fallback, or compiler requirement on a supported public invocation.
- No fixed checksum, fixed row count, fixed institution set, fixed 24-column rule, rounding, or inferred source semantics.
- No inferred version, endpoint, ownership, approval, publication, public-platform support, client compatibility, promotion, rollback completion, or freshness closure.

Do not weaken or skip a gate to meet a schedule. Keep the last-known-good public package and data available until the matching protected transition succeeds.
