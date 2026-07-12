# Release Audit

## Audit boundary

This document records the current checkout contract and the evidence still required for a public release. It is not a protected release receipt and does not authorize making a repository public, publishing a package, selecting a version or endpoint, promoting `latest`, or performing rollback.

Release conclusion: **HOLD — `BLOCKED_PENDING_BACKEND_SELECTION`**.

The checkout contains an integrated local implementation, but no claim is made here that an administrator selected an unused public SemVer, approved a transition, completed the backend gate, published a candidate, produced three-lane public-install proof, exercised an actual client, promoted `latest`, or completed a rollback/no-change drill. Workflow definitions, local tests, local installs, and packed tarballs cannot substitute for those protected facts.

## Integrated checkout contract

| Surface | Current contract | Evidence limit |
| --- | --- | --- |
| Runtime | File-first, offline, no-key, read-only stdio | Local implementation only; not public support proof |
| Node | Exact engine `>=22 <23` | Node 24+ is unsupported and unclaimed |
| Public matrix | Node 22 macOS/arm64, Windows/x64, and Ubuntu glibc/x64 | Each lane remains a target until candidate-bound public proof exists |
| MCP dependencies | Exact `@modelcontextprotocol/sdk` `1.29.0` and `zod` `4.4.3` | Public proof must verify installed identity and registry integrity |
| SQLite backend | `better-sqlite3` is currently integrated | Provisional until all-lane prebuilt-only proof; no backend is release-approved by this document |
| Runtime mode | Bundled local snapshot; no API key or runtime network | No live OpenAPI or scraping behavior |
| Bundled source | Normalized derivative of dataset `15118998` only | Point-in-time data, not a latest-data guarantee |
| Catalog | `data/seed/indicators.json`, closed-schema KOGL-attributed JSON data | Sole packaged source-derived catalog; no executable generated fallback |
| Excluded source | Dataset `15139279` | No raw, normalized, seed, sample, fixture, database, CSV, JSON, or derived artifact |
| Licensing | MIT code and KOGL Type 1 bundled data remain separate | Neither license implies affiliation or endorsement |

No public version is named in this audit. Package metadata in a checkout is not evidence that the same version is unused, owned, approved, published, tagged, or promoted in the public registry.

## Exact eight-tool audit surface

The registered product scope is exactly:

1. `list_sources`
2. `list_indicators`
3. `search_university`
4. `get_university_metrics`
5. `compare_universities`
6. `explain_indicator`
7. `validate_source_coverage`
8. `explore_universities`

The first seven contracts remain backward compatible. The eighth tool is bounded to 10 university queries and 5 indicators, evaluates against one read-only snapshot, preserves deterministic input/catalog ordering, and fails all-or-nothing when any institution is missing or ambiguous. Ambiguity returns bounded candidates rather than a guess. None of the eight tools may write, score, weight, rank, recommend, choose a winner, or substitute for a user's institution choice.

Successful values and explanations retain source/license, year or base year, unit, source column, derived/bundled state, and warnings. Missing source values stay explicit. Stdio stdout is reserved for MCP JSON-RPC.

## Catalog and indicator audit surface

The data-only catalog contains exactly five indicators from `15118998`:

| Indicator | Year | Unit | Data boundary |
| --- | ---: | --- | --- |
| `competition_rate` | 2025 | `:1` | Bundled `15118998` |
| `fill_rate` | 2025 | `%` | Bundled `15118998` |
| `employment_rate` | 2025 | `%` | School-level bundled `15118998` only |
| `scholarship_per_student` | 2025 | `원` | Bundled `15118998` |
| `avg_tuition` | 2026 | `천원` | Bundled `15118998` |

The catalog, logical database tables, and manifest must be independently cross-checked. Source-derived executable TypeScript/JavaScript, hard-coded catalog fallback, and any `15139279` default behavior are prohibited.

## Refresh authority audit

Refresh acceptance is based on semantic invariants:

- exactly one header row, one natural-key mapping, and one mapping for each of the five logical indicators;
- preserved indexed raw-cell text and exact coverage from each source row to one raw row, one institution, and five numeric-or-missing classifications;
- verified fixed units and nondecreasing integer years;
- missing values limited to trimmed empty text or ASCII `-`;
- exact approved nonnegative decimal grammar and grouping;
- canonical decimal text as semantic authority, finite nonnegative JavaScript Number conversion, and exact shortest-Number/plain-decimal round trip with no rounding.

Post-download SHA-256 is transport integrity, change-detection, and audit evidence only. It does not authenticate an official source or grant approval. A prior-checksum match is not a pass, and a changed checksum is not a failure. Row/column counts, institution-set changes, values, unrelated columns, and allowed missingness are reviewed diffs, not independent acceptance rules. There is no fixed 24-column contract: valid 23-column, 25-column, or other annual shapes may pass all semantic gates.

Semantic source, seed, catalog, manifest, and release-data identities use closed, self-excluding RFC 8785 JCS/SHA-256 projections with canonical decimals. Physical file hashes remain separate from semantic authority.

## Open protected gates

| Gate | Current state | Required protected evidence |
| --- | --- | --- |
| Administrator prerequisites | OPEN | Public npm identity/history/ownership, unused SemVer, release authority, 2FA/trusted publishing, provenance, protected environments, retention, and evidenced query-free source page |
| Single backend | BLOCKED | Either all-three-lane prebuilt-only proof for the current `better-sqlite3` candidate, or a reviewed `sql.js` parity package plus Architect and administrator approval bound to the backend-selection receipt |
| Candidate transition | NOT ESTABLISHED | Immutable non-`latest` candidate receipt joining source, package, backend, data, dependency, audit, registry, provenance, and administrator authorization evidence |
| Public install | NOT ESTABLISHED | Exact public candidate installed through `npx -y academyinfo-mcp@<version>` on all three clean Node 22 lanes, with no local artifact or compilation and complete identity/integrity/protocol evidence |
| Actual client | NOT ESTABLISHED | Protected receipt joining the public lanes, generic stdio journey, and actual Claude Desktop/macOS execution against the same candidate |
| Promotion | NOT ESTABLISHED | Administrator-approved protected receipt that revalidates predecessor digests and moves the unchanged proved candidate to `latest` |
| Rollback | NOT ESTABLISHED | Separate administrator-approved transition restoring prior-good `latest`, deprecating the bad version, preserving evidence, and reopening the original incident clock when applicable |
| Verified no-change | NOT ESTABLISHED | Equal-byte reacquisition plus origin/license/workbook validation and administrator attestation bound to the closed receipt |

The `better-sqlite3` path must prove prebuilt-only installation with fresh state, active Python/node-gyp/compiler traps, and a demonstrated canary on every official lane. If any lane fails, `sql.js` remains only a spike until one exact reviewed version satisfies behavior, custom/missing/corrupt path, WASM/package/license/security, startup/RSS, and no-native-build requirements. Exactly one backend may ship; no automatic or dual-backend fallback is permitted.

## Candidate, public, promotion, and rollback protections

A candidate may be published only under a non-`latest` tag after administrator prerequisites and immutable candidate gates pass. Candidate existence is not completion.

Public proof must use fresh homes, caches, working directories, and configurations outside the checkout; an explicit public registry; no reachable local artifact; exact `npx -y academyinfo-mcp@<version>`; active build-tool traps; sanitized verbose logs; installed application/SDK/Zod identities and registry integrity; platform identity; initialization; the exact eight-tool list and eighth-tool schema; bundled-data and no-key behavior; and JSON-RPC-only stdout. Local checkout or tarball results are insufficient.

Promotion requires a separate protected administrator approval and must move the exact proved candidate bytes to `latest` without rebuilding. Rollback requires another protected approval, restores the exact prior-good `latest`, deprecates rather than deletes the bad version, preserves receipts, and uses a new unused SemVer for any correction.

## Package and privacy boundaries

Any candidate package and its evidence must include only required runtime/data/license artifacts and must exclude raw workbooks and CSVs, signed download URLs, `15139279` data, `.env` files, credentials, service keys, registry configuration, private keys, local paths, local user names, machine identifiers, local review artifacts, and dependency trees. Errors, logs, manifests, examples, and receipts follow the same confidentiality boundary.

## Explicit non-goals and final disposition

This audit does not approve or claim:

- Node 24+ or an unevidenced platform;
- a live OpenAPI bridge, scraping, runtime network access, service-key use, or write behavior;
- granular/per-department employment data or any `15139279` artifact;
- recommendations, rankings, scores, winners/losers, or guessed institutions;
- fixed-checksum, fixed-row, fixed-institution, fixed-value, or fixed-24-column refresh acceptance;
- a selected public version, endpoint, package ownership, administrator approval, candidate publication, public availability, actual client compatibility, `latest` promotion, rollback completion, or freshness closure.

Release remains on hold at `BLOCKED_PENDING_BACKEND_SELECTION`. The last-known-good public package and data must remain available until all applicable protected gates succeed.
