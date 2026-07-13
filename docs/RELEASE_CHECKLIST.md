# Release Checklist: academyinfo-mcp

## Current evidence boundary

The checkout implements the local eight-tool server, data-only catalog, Node `>=22 <23`, the exact closed four-package direct production dependency set with `better-sqlite3` `11.10.0` as the sole backend, and seven refresh/release workflow definitions. Except for the fixed-path repository/PR writer in `refresh-write-pr.yml`, Actions are read-only: they verify, build, read anonymous npm registry state, and upload sanitized artifacts. Workflow presence establishes no execution or external evidence. The checkout does **not** establish an administrator-selected public version, completed backend proof, public candidate, three-lane public-install proof, actual-client receipt, protected client-evidence ingest, successful readiness verification, movement of `latest`, or a fix-forward drill. Every npm registry write is a human terminal ceremony governed by [`manual-publish-runbook.md`](manual-publish-runbook.md). Keep candidate publication and `latest` movement blocked until every applicable unchecked item below has a protected evidence reference.

Current first-publication bootstrap is **HOLD/UNSUPPORTED**. When public npm `latest` is absent, `candidate-release.yml`, `client-evidence.yml`, and `promote-release.yml` cannot complete because their predecessor contract requires exact SemVer `expected_previous_latest`; promotion also parses an existing public `dist-tags.latest` and validates it as SemVer. Do not use a sentinel, placeholder, candidate version, or fabricated SemVer as predecessor evidence. A separately reviewed canonical absent-`latest` contract must land before an initial `0.1.0` path is executable. This migration remains useful and read-only; it does not make first publication operable. Once that prerequisite is implemented, the manual human ceremonies remain the only permitted registry writes.

Do not copy local paths, credentials, signed URLs, or private runner details into a checklist receipt.

## 1. Administrator and repository prerequisites

- [ ] Confirm the npm package identity and complete version history from the public registry.
- [ ] Confirm current package ownership and release authority.
- [ ] Select an unused SemVer; do not infer it from `package.json` or overwrite an existing version.
- [ ] Under the current contract, confirm public `latest` resolves to the exact SemVer supplied as `expected_previous_latest`. If it is absent, record first-publication bootstrap as `HOLD/UNSUPPORTED` and stop before candidate dispatch without inventing predecessor evidence.
- [ ] Confirm npm account 2FA is enforced and that separate short-lived, least-privilege credentials can be created for the candidate-only publication and eventual `latest` movement ceremonies.
- [ ] Configure the protected environments still used by the checked-in evidence workflows: `refresh-pr-writer`, `public-candidate-proof`, and `claude-desktop-client-proof`, each with its required administrator approval.
- [ ] Define protected variables `ACADEMYINFO_RELEASE_ADMINISTRATOR`, `ACADEMYINFO_PUBLIC_INSTALL_VERIFIER_SHA256`, and `ACADEMYINFO_RELEASE_RECEIPT_VERIFIER_SHA256` wherever the read-only workflow contract requires them; confirm every protected gate binds the exact reviewed administrator identity and current-policy verifier bytes rather than receipt-provided identity or caller-selected historical code.
- [ ] Configure artifact/receipt retention and immutable predecessor-digest access.
- [ ] Confirm the official Node 22 lanes: macOS/arm64, Windows/x64, and Ubuntu glibc/x64. Do not add a Node 24 support claim.
- [ ] Record an evidenced official acquisition link without putting a signed query string in artifacts.

## 2. Scope and dependency gate

- [ ] Confirm `engines.node` is exactly `>=22 <23` in the packed candidate.
- [ ] Confirm the complete direct production dependency map is exact and closed: `@modelcontextprotocol/sdk` `1.29.0`, `pino` `10.3.1`, `zod` `4.4.3`, and the sole backend `better-sqlite3` `11.10.0`, without caret, tilde, tag, alternate registry, override, alternate backend, or controlling second runtime copy.
- [ ] Confirm the lockfile root, installed package identities, public registry tarball URLs, and SHA-512 integrities match that complete map.
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

## 4. Sole-backend gate

Release only `better-sqlite3` `11.10.0`. No alternate backend, dual-backend package, or runtime fallback is authorized.

- [ ] Install the same candidate on all three clean Node 22 public lanes.
- [ ] Use active Python, node-gyp, and compiler traps and prove the traps with a canary.
- [ ] Confirm no source compilation or build tool runs on any lane.
- [ ] Record bundled/custom/missing/corrupt database behavior and external-working-directory behavior.
- [ ] Bind the all-lane evidence to the exact source, package integrity, and `better-sqlite3` `11.10.0` identity.
- [ ] If the evidence is incomplete or any lane fails, retain or record the historical lifecycle state `BLOCKED_PENDING_BACKEND_SELECTION` and stop. That state does not authorize changing the backend; the read-only Actions migration neither advances nor closes it.

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

## 7. Candidate verification and human candidate-only publication

The current chain may enter this section only when registry history supplies a real previous `latest` SemVer. An absent `latest` is not representable by the current candidate/client/promotion receipts or workflow inputs.

- [ ] Dispatch `.github/workflows/candidate-release.yml` only with every exact immutable input: `version`, `source_commit`, `source_tag`, `receipt_commit`, `authorization_receipt_digest`, `authorization_context_digest`, `expected_previous_latest`, and the workflow's exact `confirm_candidate_only` literal. The legacy confirmation wording is dispatch compatibility, not publication authority.
- [ ] Confirm `candidate-authorization.v1.json` uses exactly the reviewed evidence kinds `backend-decision`, `release-data`, `source-revision`, and `version-registry-state`, plus an allowed policy set containing `release`; reject free-form kinds, policies, identifiers, paths, URIs, or credential-shaped material.
- [ ] Confirm the workflow has contents-read permission only, no OIDC or npm credential, and re-runs build, behavior, package, license, security, privacy, dependency, semantic, and sole-backend gates on the immutable candidate input.
- [ ] Download the digest-named handoff artifact and independently match its exact tarball SHA-256, SHA-512 SRI, package/version, source commit/tag, and authorization digests. Do not rebuild or repack it.
- [ ] Follow [`manual-publish-runbook.md`](manual-publish-runbook.md) to publish that exact preverified tarball under the non-`latest` candidate tag from a human terminal. Use the actual administrator-selected unused SemVer; placeholder versions and automated publication are prohibited.
- [ ] Revoke the candidate credential immediately, prove the revoked credential fails authentication, and retain only sanitized evidence. No token, TOTP, npm configuration, credential-shaped value, private path, or terminal transcript may enter logs or evidence.
- [ ] Read the public registry anonymously and record package identity/integrity, candidate dist-tag state, `better-sqlite3` `11.10.0`, source/data digests, and predecessor evidence in the closed post-state candidate payload. Obtain a separate administrator attestation over that digest before persisting final `candidate.v1.json`.
- [ ] Do not describe candidate publication as release completion, and do not claim provenance or signature evidence unless it was independently observed.

## 8. Public install and client proof

- [ ] Dispatch `.github/workflows/public-candidate-verify.yml` only after the candidate and candidate-authorization receipts are separately persisted, using every exact immutable input: `version`, `source_commit`, `receipt_commit`, `candidate_receipt_digest`, independently supplied `authorization_receipt_digest`, and `confirm_public_read_only` set to `verify-public-candidate-without-promotion`; never derive the expected predecessor from the candidate receipt itself.
- [ ] Confirm public-candidate verification has contents-read permission only and cannot publish, move a dist-tag, promote, write repository contents, exercise Claude Desktop, or use a local package substitute.
- [ ] For each official lane, use a fresh home, package cache, working directory, and configuration outside the checkout; explicit public registry; and no reachable local package/tarball.
- [ ] Record the macOS lane receipt field `public_install_evidence_payload_v1.generic_stdio_journey_digest_v1`; pass that exact value as the `client-evidence.yml` workflow input `generic_stdio_journey_digest`, and do not reuse the macOS outer receipt digest. The workflow input omits the `_v1` suffix; the receipt payload field includes it.

- [ ] Run exact `npx -y academyinfo-mcp@<version>` through an external JSON-RPC verifier.
- [ ] Record Node/OS/architecture and Ubuntu glibc identity.
- [ ] Record installed application plus SDK, Pino, Zod, and selected-backend names/versions; verify every direct dependency tarball integrity against public registry metadata.
- [ ] Confirm the candidate dist-tag. Record provenance/signature evidence only when independently observed from the public registry; do not infer it from publication intent or workflow output.
- [ ] Keep active build traps and canary proof; save verbose sanitized install evidence.
- [ ] Verify initialization, exact eight-tool listing, exact `explore_universities` schema, a bundled query, no-key behavior, and JSON-RPC-only stdout.
- [ ] Complete the factual Ubuntu journey, including an unresolved case followed by exact-campus resolution, comparison, and indicator explanation without ranking/recommendation.
- [ ] Separately exercise the same candidate in actual Claude Desktop on macOS and record a sanitized immutable `claude-desktop-actual.v1.json` receipt.
- [ ] Label Cursor/Codex configuration evidence accurately; do not claim those clients were tested unless exercised.
- [ ] Persist, at the workflow's fixed paths in one immutable protected default-branch evidence commit, `candidate.v1.json`, all three `public-install/public-install-<lane>.v1.json` receipts, `claude-desktop-actual.v1.json`, every actual-client artifact under `claude-desktop-actual-artifacts/<kind>.evidence`, `client-evidence-payload.v1.json`, and `client-administrator-attestation.v1.json`.
- [ ] Dispatch `.github/workflows/client-evidence.yml` only with every exact immutable input: `version`, `source_commit`, `receipt_commit`, `package_integrity`, `candidate_receipt_digest`, independently supplied `candidate_predecessor_receipt_digest`, `expected_previous_latest`, `macos_arm64_receipt_digest`, `windows_x64_receipt_digest`, `ubuntu_glibc_x64_receipt_digest`, `generic_stdio_journey_digest`, `actual_claude_receipt_digest`, `client_payload_digest`, `administrator_attestation_digest`, and `confirm_actual_not_simulated` set to `ingest-operator-supplied-actual-claude-desktop-evidence`.
- [ ] Confirm `client-evidence.yml` only ingests, validates, and joins the pre-existing actual-Claude receipt under contents-read permission; it does not launch, install, fabricate, or simulate Claude Desktop, write the repository, publish, move a dist-tag, or promote.
- [ ] Persist the workflow's exact client-proof output separately at `evidence/releases/<version>/claude-desktop.v1.json` before requesting promotion readiness.

## 9. Promotion readiness and human `latest` movement

- [ ] Confirm all three public lanes, the generic stdio journey, actual Claude Desktop evidence, protected client ingest, and separately persisted client receipt passed against the same candidate; no evidence may be local-only.
- [ ] Create and validate the administrator-attested freshness transition receipt that binds the same candidate/client chain, event, release-data digest, immutable first-seen time, and seven-day deadline in the required `CLIENT_VERIFIED` state.
- [ ] Have the administrator review the complete immutable evidence and create the pre-existing promotion authorization bound to the exact candidate, client receipt, three public lanes, actual-Claude receipt, freshness transition, predecessor state, event, release-data digest, first-seen time, and deadline. This bound authorization must exist before readiness dispatch.
- [ ] Dispatch `.github/workflows/promote-release.yml` only after that promotion authorization and all protected candidate/client/freshness evidence exist, using every exact immutable workflow input, including `promotion_authorization_digest` and exact-SemVer `expected_previous_latest`.
- [ ] Confirm the workflow has contents-read permission only, no npm credential or OIDC, verifies the pre-existing bound promotion authorization and anonymous candidate/`latest` registry state plus all immutable predecessor joins, and uploads sanitized `promotion-readiness.v1.json`. The artifact is readiness evidence only; it neither creates approval nor moves `latest`.
- [ ] Only after readiness succeeds, follow [`manual-publish-runbook.md`](manual-publish-runbook.md) from a human terminal to move that exact candidate—not rebuilt bytes—to `latest`. Any immediate registry-state comparison is an operator staleness recheck, not a second promotion approval.
- [ ] Use a new short-lived least-privilege credential, enter TOTP interactively without `--otp` or any other argv/log/evidence exposure, revoke the credential immediately, and prove authentication fails after revocation.
- [ ] Verify anonymously that public `latest` resolves to the same package identity/integrity, then persist the sanitized post-state evidence and close a changed-data incident only when its matching release-data digest is now `latest`.
- [ ] Never perform publication, dist-tag, token, owner, access, deprecation, unpublish, or other npm administration from CI.

## 10. Freshness and verified-no-change

- [ ] Parse official dates strictly; represent invalid official times as null with the deterministic failure class, and reject invalid workflow times without writing state.
- [ ] Correlate provisional incidents by schema/dataset/page/last accepted SHA and absence of a differing SHA.
- [ ] Preserve the earliest first-seen timestamp and seven-day (`604800000` ms) deadline across metadata, ETag, and repeated-failure drift.
- [ ] Keep last-known-good data/version, where one exists, available on acquisition, validation, candidate, client, readiness, or human publication/promotion failure.
- [ ] For equal reacquired SHA, revalidate origin/license/workbook and create the closed no-change payload and digest.
- [ ] Obtain administrator no-change attestation bound to that digest, validate the self-excluding outer receipt, and close only through `VERIFIED_NO_CHANGE_CLOSED`.
- [ ] For differing SHA, prohibit no-change closure and keep the event open until matching promotion.

## 11. After a first release exists: failure and fix-forward

This section applies only after an initial version has actually been published and reached `latest`; it does not make the currently unsupported first-ever `0.1.0` publication executable.

- [ ] Treat `.github/workflows/rollback-release.yml` as a read-only verifier with no dispatch inputs, protected npm environment, credential, OIDC, or registry mutation authority.
- [ ] Require its deterministic sanitized `FIRST_RELEASE_ROLLBACK_UNAVAILABLE` report; do not interpret successful report generation as a rollback.
- [ ] Once the first release exists, there is no prior-good release to restore or deprecate. Do not run a rollback or invent predecessor evidence.
- [ ] Preserve all candidate, public-lane, actual-client, freshness, authorization, readiness, and registry-state evidence; leave any changed-data incident open.
- [ ] If defective `0.1.0` exists, correct the defect and fix forward as exact version `0.1.1`, repeating candidate-only publication, proofs, freshness evidence, pre-existing bound promotion authorization, readiness verification, and human `latest` movement. Never overwrite or reuse `0.1.0`.
- [ ] Do not run dist-tag restore, deprecate, unpublish, or npm administrator operations from Actions.

## Final declaration

- [ ] Every receipt projection excludes its own digest and joins immutable predecessor outer digests.
- [ ] All evidence references are public/sanitized or protected without exposing a secret/private path.
- [ ] Administrator confirms all gates applicable to the `better-sqlite3` `11.10.0` release path.
- [ ] Only after the read-only proofs, required administrator attestations, pre-existing bound promotion authorization, successful readiness verification, and human terminal registry ceremonies are complete may the exact version be described as promoted and supported on the evidenced Node 22 matrix.
