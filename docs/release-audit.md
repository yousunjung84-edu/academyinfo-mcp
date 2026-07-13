# Release Audit

## Audit boundary

This document records the current checkout contract and the evidence still required for a public release. It is not a protected release receipt and does not authorize making a repository public, selecting a version or endpoint, publishing a package, moving `latest`, or performing npm administration. Every npm registry write is a human terminal ceremony governed by [`manual-publish-runbook.md`](manual-publish-runbook.md).

Release conclusion: **HOLD — `BLOCKED_PENDING_BACKEND_SELECTION` (backend proof narrative); first publication proceeds via the human ceremony in [`manual-publish-runbook.md`](manual-publish-runbook.md), while the optional workflow verifier chain remains unusable for a first publication (absent-`latest` not representable by its inputs)**.

The checkout contains an integrated local implementation, but no claim is made here that an administrator selected an unused public SemVer, approved a transition, completed the sole-backend proof, published a candidate, produced three-lane public-install proof, exercised an actual client, completed readiness verification, moved `latest`, or completed a fix-forward/no-change drill. Workflow definitions, local tests, local installs, and packed tarballs cannot substitute for those facts. Except for the exact fixed-path repository/PR writer in `refresh-write-pr.yml`, Actions only verify, build, read anonymous registry state, and upload sanitized artifacts; they hold no npm credential or OIDC authority.

When public npm `latest` is absent, the **optional workflow verifier chain** (candidate/client/promotion receipts and workflow inputs) cannot run for a first-ever publication: each stage requires exact SemVer `expected_previous_latest`, and promotion parses an existing public `dist-tags.latest`. No sentinel, placeholder, candidate version, or fabricated SemVer may be used as predecessor evidence. This limits only workflow-verified evidence — the first publication itself is executed through the self-contained human ceremony in [`manual-publish-runbook.md`](manual-publish-runbook.md) (owner decision, 2026-07-13), which dispatches no workflow. If workflow-verified evidence is wanted for a first publication, a reviewed absent-`latest` predecessor contract (`absent | present` union) can be added later; for subsequent releases the verifiers work as-is. Human terminal ceremonies remain the only permitted registry writes in all cases.

## Integrated checkout contract

| Surface | Current contract | Evidence limit |
| --- | --- | --- |
| Runtime | File-first, offline, no-key, read-only stdio | Local implementation only; not public support proof |
| Node | Exact engine `>=22 <23` | Node 24+ is unsupported and unclaimed |
| Public matrix | Node 22 macOS/arm64, Windows/x64, and Ubuntu glibc/x64 | Each lane remains a target until candidate-bound public proof exists |
| Runtime dependencies | Exact `@modelcontextprotocol/sdk` `1.29.0`, `pino` `10.3.1`, `zod` `4.4.3`, and `better-sqlite3` `11.10.0` | Public proof must verify installed identity and registry integrity |
| SQLite backend | Sole backend `better-sqlite3` `11.10.0`; no alternate or runtime fallback | Release remains blocked until all-lane prebuilt-only proof exists |
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
| Administrator prerequisites | OPEN | Public npm identity/history/ownership, actual unused SemVer, release authority, enforced 2FA, separate short-lived least-privilege candidate/promotion credentials, retention, and evidenced query-free source page |
| First-publication bootstrap | MANUAL (runbook) | Human ceremony per [`manual-publish-runbook.md`](manual-publish-runbook.md); the optional workflow verifier chain stays unusable for a first publication until a reviewed absent-`latest` predecessor contract exists (its exact-SemVer inputs cannot represent an absent public `latest`) |
| Sole backend | BLOCKED | All-three-lane prebuilt-only proof for `better-sqlite3` `11.10.0`, including active build traps and exact package/integrity joins |
| Candidate transition | NOT ESTABLISHED | Successful read-only Action handoff plus human candidate-only publication of the exact preverified tarball, immediate credential revocation/authentication-failure proof, anonymous registry post-state, and administrator-bound receipt |
| Public install | NOT ESTABLISHED | Exact public candidate installed through `npx -y academyinfo-mcp@<version>` on all three clean Node 22 lanes, with no local artifact or compilation and complete identity/integrity/protocol evidence |
| Actual client | NOT ESTABLISHED | Protected receipt joining the public lanes, generic stdio journey, and actual Claude Desktop/macOS execution against the same candidate |
| Promotion | NOT ESTABLISHED | Complete predecessor/public/client/freshness proofs, a pre-existing administrator promotion authorization bound before dispatch, successful read-only readiness verification of that authorization and anonymous registry state, then a separate human terminal ceremony moving only the unchanged proved candidate to `latest` |
| First-release failure | ROLLBACK UNAVAILABLE | Deterministic `FIRST_RELEASE_ROLLBACK_UNAVAILABLE` report, preserved evidence/incident clock, and fix-forward `0.1.1`; no prior-good dist-tag restore or deprecation |
| Verified no-change | NOT ESTABLISHED | Equal-byte reacquisition plus origin/license/workbook validation and administrator attestation bound to the closed receipt |

The `better-sqlite3` `11.10.0` path must prove prebuilt-only installation with fresh state, active Python/node-gyp/compiler traps, and a demonstrated canary on every official lane. It is the sole backend; `sql.js`, dual-backend packaging, dependency substitution, and automatic runtime fallback are not authorized.

## Actions, candidate, public proof, and promotion protections

All Actions `uses:` references remain pinned to full commit SHAs. Npm-release verification workflows have contents-read permission only and no npm credential, OIDC, or registry-write command. They may build and verify immutable inputs, read the public npm registry anonymously, and upload sanitized artifacts. `refresh-write-pr.yml` remains the sole exact repository/PR write-permission exception and has no npm/OIDC authority.

Under the current predecessor contract, a candidate workflow may run only when anonymous public history supplies a real previous `latest` SemVer. If `latest` is absent (first publication), the workflow verifiers are simply not used — the human ceremony in [`manual-publish-runbook.md`](manual-publish-runbook.md) proceeds without them and must not fabricate predecessor evidence to force a dispatch.

A candidate may be published only by a human under a non-`latest` tag after administrator prerequisites and immutable candidate gates pass. The operator must publish the exact digest-matched tarball from the read-only candidate handoff without rebuilding or repacking, then immediately revoke the candidate-only credential and prove it fails authentication. Candidate existence is not completion.

Public proof must use fresh homes, caches, working directories, and configurations outside the checkout; an explicit public registry; no reachable local artifact; the actual selected SemVer rather than a placeholder; active build-tool traps; sanitized verbose logs; installed application and all four exact direct dependencies; platform identity; initialization; the exact eight-tool list and eighth-tool schema; bundled-data and no-key behavior; and JSON-RPC-only stdout. Local checkout or tarball results are insufficient.

After all three public lanes, the generic stdio journey, actual Claude evidence, protected client ingest, and administrator-attested freshness evidence pass, the administrator must create the pre-existing promotion authorization bound to that complete immutable evidence set and predecessor state. Only then may `promote-release.yml` run. It verifies that authorization and anonymous candidate/`latest` registry state before uploading `promotion-readiness.v1.json`; it does not create approval or move `latest`. After readiness succeeds, a human follows [`manual-publish-runbook.md`](manual-publish-runbook.md) with a separate short-lived least-privilege credential to move the exact proved candidate to `latest`. Any immediate registry-state comparison is an operator staleness recheck, not a second approval. TOTP is entered only interactively, never in argv/log/evidence. The credential is revoked immediately and its authentication failure is proved before anonymous post-state verification.

Once an initial `0.1.0` has actually reached `latest`, that first release has no rollback. `rollback-release.yml` emits only deterministic `FIRST_RELEASE_ROLLBACK_UNAVAILABLE` evidence. Defective `0.1.0` is not overwritten, restored, or deprecated by CI; correction is fix-forward `0.1.1` through the full candidate/proof/freshness/authorization/readiness/manual-promotion sequence. (The first publication itself is executed via [`manual-publish-runbook.md`](manual-publish-runbook.md); this failure path governs what happens afterward.) Publication, dist-tag, deprecation, unpublish, token, owner, access, and all other npm administration are prohibited in CI.

The historical lifecycle narrative `BLOCKED_PENDING_BACKEND_SELECTION` remains intact. This read-only Actions migration neither advances nor closes that state and does not add canonical absent-`latest` support. In the current checkout it means the required all-lane `better-sqlite3` `11.10.0` proof is still absent; it does not authorize an alternate backend.

## Package and privacy boundaries

Any candidate package and its evidence must include only required runtime/data/license artifacts and must exclude raw workbooks and CSVs, signed download URLs, `15139279` data, `.env` files, credentials, service keys, registry configuration, private keys, local paths, local user names, machine identifiers, local review artifacts, and dependency trees. Errors, logs, manifests, examples, and receipts follow the same confidentiality boundary.

## Explicit non-goals and final disposition

This audit does not approve or claim:

- Node 24+ or an unevidenced platform;
- a live OpenAPI bridge, scraping, runtime network access, service-key use, or write behavior;
- granular/per-department employment data or any `15139279` artifact;
- recommendations, rankings, scores, winners/losers, or guessed institutions;
- fixed-checksum, fixed-row, fixed-institution, fixed-value, or fixed-24-column refresh acceptance;
- a selected public version, endpoint, package ownership, administrator authorization, candidate publication, public availability, actual client compatibility, successful readiness verification, `latest` movement, rollback completion, fix-forward completion, or freshness closure.

The backend-proof narrative remains at `BLOCKED_PENDING_BACKEND_SELECTION`. First publication is executable at the owner's discretion via the human ceremony in [`manual-publish-runbook.md`](manual-publish-runbook.md); workflow-verified first-publication evidence additionally requires absent-`latest` predecessor support. The last-known-good public package and data, where they exist, must remain available until the applicable evidence gates and human registry ceremonies succeed.
