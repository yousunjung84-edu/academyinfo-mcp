# Release Checklist: academyinfo-mcp

## Current evidence boundary

The checkout implements the local eight-tool server, data-only catalog, Node `>=22 <23`, the exact closed four-package direct production dependency set with one current backend, and seven protected refresh/release workflow definitions. Workflow presence establishes no execution or external evidence. The checkout does **not** establish an administrator-selected public version, a completed single-backend gate, a public candidate, three-lane public-install proof, an actual-client receipt, protected client-evidence ingest, promotion, or a rollback/no-change drill. Keep publication and `latest` promotion blocked until every applicable unchecked item below has a protected evidence reference.

Do not copy local paths, credentials, signed URLs, or private runner details into a checklist receipt.

## 1. Administrator and repository prerequisites

- [ ] Confirm the npm package identity and complete version history from the public registry.
- [ ] Confirm current package ownership and release authority.
- [ ] Select an unused SemVer; do not infer it from `package.json` or overwrite an existing version.
- [ ] Confirm 2FA/trusted-publishing and provenance/signature readiness.
- [ ] Configure exactly the protected environments `refresh-pr-writer`, `npm-candidate`, `public-candidate-proof`, `claude-desktop-client-proof`, `npm-promotion`, and `npm-rollback`, each with its required administrator approval.
- [ ] Define protected variables `ACADEMYINFO_RELEASE_ADMINISTRATOR`, `ACADEMYINFO_PUBLIC_INSTALL_VERIFIER_SHA256`, and `ACADEMYINFO_RELEASE_RECEIPT_VERIFIER_SHA256`; confirm every protected gate binds the exact reviewed administrator identity and current-policy verifier bytes rather than receipt-provided identity or caller-selected historical code.
- [ ] Configure artifact/receipt retention and immutable predecessor-digest access.
- [ ] Confirm the official Node 22 lanes: macOS/arm64, Windows/x64, and Ubuntu glibc/x64. Do not add a Node 24 support claim.
- [ ] Record an evidenced official acquisition link without putting a signed query string in artifacts.

## 2. Scope and dependency gate

- [ ] Confirm `engines.node` is exactly `>=22 <23` in the packed candidate.
- [ ] Confirm the complete direct production dependency map is exact and closed: `@modelcontextprotocol/sdk` `1.29.0`, `pino` `10.3.1`, `zod` `4.4.3`, and exactly one approved backend (`better-sqlite3` `11.10.0` in the current package), without caret, tilde, tag, alternate registry, override, or controlling second runtime copy.
- [ ] Confirm the lockfile root, installed package identities, public registry tarball URLs, and SHA-512 integrities match that complete map. A separately approved backend replacement must update the package, lock, verifier, and evidence contract together.
- [ ] Confirm exactly eight tools are registered: `list_sources`, `list_indicators`, `search_university`, `get_university_metrics`, `compare_universities`, `explain_indicator`, `validate_source_coverage`, and `explore_universities`.
- [ ] Confirm all seven legacy registrations/default response behavior remain unchanged.
- [ ] Confirm `tools/list` registers `explore_universities` with this exact permissive Draft-07 outer input schema:

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

  Confirm there is no `required` keyword, and that the schemas for `university_queries`, `indicators`, and `additionalProperties` are exactly empty schemas.
- [ ] Separately confirm strict internal handler validation: `university_queries` is required; unknown top-level fields reject; queries are 1–10 unique trimmed strings of 1–120 Unicode code points; optional `indicators` contains at most five unique supported nonempty IDs; and invalid input is rejected before evaluation.
- [ ] Confirm valid `explore_universities` requests use one read-only snapshot, never guess, and return no partial success arrays for unresolved input.
- [ ] Confirm no score, rank, weighting, best/worst, winner/loser, recommendation, preference, or official-evaluation behavior/text.
- [ ] Confirm no API key, runtime network, write method, telemetry, or stdout diagnostic is required.

## 3. Catalog, package, license, and privacy gate

- [ ] Confirm `data/seed/indicators.json` is the sole packaged source-derived catalog, closed-schema version 1, KOGL-attributed, and contains exactly five indicators.
- [ ] Confirm runtime catalog loading is package-relative, validated, frozen/fail-closed, and has no hard-coded or executable generated fallback.
- [ ] Independently cross-check catalog, logical database tables, and manifest.
- [ ] Confirm code MIT terms and bundled-data KOGL Type 1 attribution remain separate.
- [ ] Confirm the package contains the database, manifest, catalog, data license, README, code license, notice, and built runtime needed by a public install.
- [ ] Confirm package and evidence exclude raw workbook/CSV, signed download URLs, `.env`, credentials, service keys, local user names, private paths, machine identifiers, and every `15139279` artifact.
- [ ] Confirm package audit, license audit, security audit, and secret/private-path scans have candidate-bound receipts.

## 4. Conditional single-backend gate

Release exactly one backend.

### Option A: retain `better-sqlite3`

- [ ] Install the same candidate on all three clean Node 22 public lanes.
- [ ] Use active Python, node-gyp, and compiler traps and prove the traps with a canary.
- [ ] Confirm no source compilation or build tool runs on any lane.
- [ ] Record bundled/custom/missing/corrupt database behavior and external-working-directory behavior.

### Option B: select `sql.js` only if Option A fails

- [ ] Pin and review one exact `sql.js` identity/integrity.
- [ ] Prove seven-tool goldens, eighth-tool behavior, `ACADEMYINFO_DB_PATH`, bundled/custom/missing/corrupt databases, and external-working-directory parity.
- [ ] Review WASM packaging, license/security, startup time, RSS, and no-native-build evidence on all lanes.
- [ ] Build the closed backend decision payload over source commit and all required evidence digests.
- [ ] Obtain separate Architect and administrator approvals bound to that payload digest.
- [ ] Validate the self-excluding outer backend-selection receipt and final receipt digest.

- [ ] Confirm the candidate includes exactly the selected backend and no runtime fallback. If neither option has valid evidence, record `BLOCKED_PENDING_BACKEND_SELECTION` and stop.

## 5. Refresh acquisition and semantic validation
- [ ] Dispatch or observe `.github/workflows/refresh-acquire-validate.yml` only after repository variables `ACADEMYINFO_15118998_CANONICAL_PAGE` and `ACADEMYINFO_REFRESH_POLICY_DIGEST` contain administrator-reviewed, query-free source-page and policy-digest values.

- [ ] Run acquisition from an immutable source revision with read-only repository permission, no write/publish secret or OIDC, pinned actions, bounded HTTPS/redirect/body/archive/XML handling, and no workbook execution.
- [ ] Confirm the report omits the raw workbook, signed query strings, credentials, and private paths.
- [ ] Compute SHA-256 only after download and record it as integrity/change/audit evidence, not authenticity or approval.
- [ ] Confirm one exact blank predicate: absent or Node 22 ECMAScript-trim-empty raw text.
- [ ] Confirm exactly one header row, unique required identity/response headers, and one mapping for each of five logical indicators.
- [ ] Confirm nonblank preamble/footer/hidden rows become source candidates and any nonblank beyond-width cell blocks.
- [ ] Preserve indexed cells with unmodified raw text; confirm source rows = raw rows = institutions and classifications = rows × 5.
- [ ] Confirm missing is only trimmed empty or ASCII `-`.
- [ ] Confirm exact decimal grammar, valid grouping, canonical text, finite nonnegative Number, exact shortest-Number/plain-decimal round trip, and no rounding. Verify `001,000` rejects and `1,000` becomes `1000`.
- [ ] Confirm unique natural keys, fixed verified units, nondecreasing integer years, numeric/missing domains, and exact coverage.
- [ ] Confirm normal changes—including checksum, 23/25/other unrelated columns, institution set, values, and allowed missingness—are audit diffs rather than independent blockers after semantic gates pass.
- [ ] Independently reproduce source-model, seed-logical, catalog, manifest-semantic, and release-data JCS/SHA-256 digests with canonical decimals and self-excluding projections.

## 6. Fixed-path refresh writer
- [ ] Let `.github/workflows/refresh-write-pr.yml` consume only the successful named acquisition artifact; do not substitute a manually copied candidate.

- [ ] Run the writer separately with only repository/PR write privilege; do not give acquisition that privilege.
- [ ] Verify named producer, source commit, policy/schema versions, hashes, and complete candidate allowlist.
- [ ] Reject symlinks, traversal, extra files, missing files, and candidate content that would need execution.
- [ ] Write only the database, manifest, catalog, header/checksum/sample evidence, and one digest-named refresh audit.
- [ ] Confirm failure and verified-no-change paths cannot invoke content writes.
- [ ] Obtain administrator review of the semantic diff; do not treat checksum/count/value equality as approval.

## 7. Candidate transition
- [ ] Dispatch `.github/workflows/candidate-release.yml` only with every exact immutable input: `version`, `source_commit`, `source_tag`, `receipt_commit`, `authorization_receipt_digest`, `authorization_context_digest`, `expected_previous_latest`, and `confirm_candidate_only` set to `publish-to-candidate-not-latest`; confirm protected verifier SHA-256 and administrator identity variables are set.

- [ ] Confirm `candidate-authorization.v1.json` uses exactly the reviewed evidence kinds `backend-decision`, `release-data`, `source-revision`, and `version-registry-state`, plus an allowed policy set containing `release`; reject free-form kinds, policies, identifiers, paths, URIs, or credential-shaped material.
- [ ] Re-run protected build, behavior, package, license, security, privacy, dependency, semantic, and selected-backend gates on the immutable candidate input.
- [ ] Publish the administrator-selected exact version only under the candidate tag; preserve current `latest`.
- [ ] Record registry package identity/integrity, selected backend, source/data digests, and predecessor evidence in the closed post-state candidate evidence payload. Independently install the exact published candidate with scripts disabled, run `npm audit signatures --json --include-attestations`, and persist the sanitized closed `candidate-registry-provenance-proof.v1` digest inside `candidate-registry-post-state.v1`; then obtain a separate administrator attestation over the candidate evidence digest before creating and persisting final `candidate.v1.json`.
- [ ] Confirm publication output and receipt are sanitized.
- [ ] Do not describe candidate publication as release completion.

## 8. Public install and client proof

- [ ] Dispatch `.github/workflows/public-candidate-verify.yml` only after the candidate and candidate-authorization receipts are separately persisted, using every exact immutable input: `version`, `source_commit`, `receipt_commit`, `candidate_receipt_digest`, independently supplied `authorization_receipt_digest`, and `confirm_public_read_only` set to `verify-public-candidate-without-promotion`; never derive the expected predecessor from the candidate receipt itself.
- [ ] Confirm public-candidate verification has contents-read permission only and cannot publish, move a dist-tag, promote, write repository contents, exercise Claude Desktop, or use a local package substitute.
- [ ] For each official lane, use a fresh home, package cache, working directory, and configuration outside the checkout; explicit public registry; and no reachable local package/tarball.
- [ ] Record the macOS lane receipt field `public_install_evidence_payload_v1.generic_stdio_journey_digest_v1`; pass that exact value as the `client-evidence.yml` workflow input `generic_stdio_journey_digest`, and do not reuse the macOS outer receipt digest. The workflow input omits the `_v1` suffix; the receipt payload field includes it.

- [ ] Run exact `npx -y academyinfo-mcp@<version>` through an external JSON-RPC verifier.
- [ ] Record Node/OS/architecture and Ubuntu glibc identity.
- [ ] Record installed application plus SDK, Pino, Zod, and selected-backend names/versions; verify every direct dependency tarball integrity against public registry metadata.
- [ ] Confirm candidate tag and provenance/signature evidence.
- [ ] Keep active build traps and canary proof; save verbose sanitized install evidence.
- [ ] Verify initialization, exact eight-tool listing, exact `explore_universities` schema, a bundled query, no-key behavior, and JSON-RPC-only stdout.
- [ ] Complete the factual Ubuntu journey, including an unresolved case followed by exact-campus resolution, comparison, and indicator explanation without ranking/recommendation.
- [ ] Separately exercise the same candidate in actual Claude Desktop on macOS and record a sanitized immutable `claude-desktop-actual.v1.json` receipt.
- [ ] Label Cursor/Codex configuration evidence accurately; do not claim those clients were tested unless exercised.
- [ ] Persist, at the workflow's fixed paths in one immutable protected default-branch evidence commit, `candidate.v1.json`, all three `public-install/public-install-<lane>.v1.json` receipts, `claude-desktop-actual.v1.json`, every actual-client artifact under `claude-desktop-actual-artifacts/<kind>.evidence`, `client-evidence-payload.v1.json`, and `client-administrator-attestation.v1.json`.
- [ ] Dispatch `.github/workflows/client-evidence.yml` only with every exact immutable input: `version`, `source_commit`, `receipt_commit`, `package_integrity`, `candidate_receipt_digest`, independently supplied `candidate_predecessor_receipt_digest`, `expected_previous_latest`, `macos_arm64_receipt_digest`, `windows_x64_receipt_digest`, `ubuntu_glibc_x64_receipt_digest`, `generic_stdio_journey_digest`, `actual_claude_receipt_digest`, `client_payload_digest`, `administrator_attestation_digest`, and `confirm_actual_not_simulated` set to `ingest-operator-supplied-actual-claude-desktop-evidence`.
- [ ] Confirm `client-evidence.yml` only ingests, validates, and joins the pre-existing actual-Claude receipt under contents-read permission; it does not launch, install, fabricate, or simulate Claude Desktop, write the repository, publish, move a dist-tag, or promote.
- [ ] Persist the workflow's exact client-proof output separately at `evidence/releases/<version>/claude-desktop.v1.json` before promotion.

## 9. Promotion
- [ ] Dispatch `.github/workflows/promote-release.yml` only after its protected candidate/client evidence exists, with every exact immutable input: `version`, `source_commit`, `receipt_commit`, `candidate_receipt_digest`, `candidate_authorization_context_digest`, `client_receipt_digest`, `macos_arm64_receipt_digest`, `windows_x64_receipt_digest`, `ubuntu_glibc_x64_receipt_digest`, `actual_claude_receipt_digest`, `generic_stdio_journey_digest`, `freshness_transition_digest`, `promotion_authorization_digest`, `expected_previous_latest`, and `confirm_promote` set to `promote-receipt-bound-candidate`. The workflow file is not evidence that client proof occurred.
- [ ] Confirm candidate publication, promotion, and rollback all use the same package-scoped concurrency group, `academyinfo-mcp-registry-mutation`, with `cancel-in-progress: false`; do not run any of these registry mutations outside that lock.

- [ ] Re-fetch and verify the exact public candidate and all candidate/client predecessor digests.
- [ ] Confirm every required public lane and actual Claude receipt passed and no evidence is local-only.
- [ ] Obtain administrator promotion approval bound to the immutable promotion payload.
- [ ] Move that exact candidate—not rebuilt bytes—to `latest`.
- [ ] Write the self-excluding promotion receipt and verify public `latest` resolves to the same identity/integrity. Retain the uploaded post-mutation `promotion.v1.json`, then persist that file byte-identically at `evidence/releases/<version>/promotion.v1.json` in a protected immutable default-branch evidence commit. Rollback is unavailable until that protected copy exists and its outer receipt digest is supplied.
- [ ] Close a changed-data incident only when its matching release-data digest is now `latest`.

## 10. Freshness and verified-no-change

- [ ] Parse official dates strictly; represent invalid official times as null with the deterministic failure class, and reject invalid workflow times without writing state.
- [ ] Correlate provisional incidents by schema/dataset/page/last accepted SHA and absence of a differing SHA.
- [ ] Preserve the earliest first-seen timestamp and seven-day (`604800000` ms) deadline across metadata, ETag, and repeated-failure drift.
- [ ] Keep last-known-good data/version available on acquisition, validation, candidate, client, or promotion failure.
- [ ] For equal reacquired SHA, revalidate origin/license/workbook and create the closed no-change payload and digest.
- [ ] Obtain administrator no-change attestation bound to that digest, validate the self-excluding outer receipt, and close only through `VERIFIED_NO_CHANGE_CLOSED`.
- [ ] For differing SHA, prohibit no-change closure and keep the event open until matching promotion.

## 11. Rollback
- [ ] Before dispatch, require the byte-identical protected `evidence/releases/<bad_version>/promotion.v1.json` in the immutable `receipt_commit`; do not substitute or reconstruct the uploaded promotion output.
- [ ] Dispatch `.github/workflows/rollback-release.yml` only with every exact immutable input: `bad_version`, `bad_source_commit`, `receipt_commit`, `promotion_receipt_digest`, `client_receipt_digest`, `promotion_freshness_receipt_digest`, `promotion_authorization_digest`, `previous_release_receipt_digest`, `prior_good_source_commit`, `prior_good_authorization_context_digest`, `freshness_transition_digest`, `rollback_authorization_digest`, `cause_code`, and `confirm_rollback` set to `restore-receipt-recorded-previous-latest`. Restrict `cause_code` to the implemented choices `regression`, `data-validation`, `package-integrity`, or `client-incompatibility`, and use the shared `academyinfo-mcp-registry-mutation` lock with `cancel-in-progress: false`.

- [ ] Verify the bad and prior-good version identities plus promotion predecessor digest.
- [ ] Obtain administrator rollback approval bound to the immutable rollback payload.
- [ ] Restore the prior exact version to `latest` and deprecate the bad version without deleting evidence.
- [ ] Verify public `latest` identity/integrity after rollback.
- [ ] Reopen the original changed-event clock and deadline; do not create a fresh clock.
- [ ] Record the self-excluding rollback receipt and issue any fix under a new unused SemVer. Retain the uploaded post-mutation `rollback.v1.json`, then persist that file byte-identically at `evidence/releases/<bad_version>/rollback.v1.json` in a protected immutable default-branch evidence commit; do not delete it.

## Final declaration

- [ ] Every receipt projection excludes its own digest and joins immutable predecessor outer digests.
- [ ] All evidence references are public/sanitized or protected without exposing a secret/private path.
- [ ] Administrator confirms all gates applicable to the selected backend and release path.
- [ ] Only then describe the exact version as promoted and supported on the evidenced Node 22 matrix.
