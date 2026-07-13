# Refresh and Release Runbook

## Purpose

This runbook covers a `15118998` refresh from detection through either verified no-change or verified human movement of `latest`, including read-only candidate build, manual candidate-only publication, public/client proof, promotion-readiness verification, and first-release fix-forward. It separates untrusted acquisition, the sole fixed-path repository writer, read-only release verification, and human npm registry ceremonies. It does not authorize an official download link, choose a SemVer, select a different backend, publish, approve, or claim that any transition has already happened. Every npm registry write follows [`manual-publish-runbook.md`](manual-publish-runbook.md).

**First-publication scope note.** If public npm `latest` is absent (the very first publication), the **optional workflow verifier chain** cannot run: candidate, client, and promotion contracts require exact SemVer `expected_previous_latest`, while promotion parses an existing public `dist-tags.latest` and validates it as SemVer. Never supply a sentinel, placeholder, candidate version, or fabricated SemVer as predecessor evidence — skip those dispatches instead. The first publication itself proceeds through the self-contained human ceremony in [`manual-publish-runbook.md`](manual-publish-runbook.md) (owner decision, 2026-07-13). Workflow-verified first-publication evidence additionally requires a reviewed absent-`latest` predecessor contract; for subsequent releases the verifiers work as-is. Human ceremonies remain the only permitted registry writes in all cases.

Use only implemented protected automation whose reviewed contract matches the stages below. Stop rather than inventing a workflow input, endpoint, link, source field, version, approval, or missing marker.
## Current implementation boundary

This checkout contains seven refresh/release workflow definitions: acquisition, fixed-path repository writing, candidate verification/build and artifact handoff, public-candidate verification, actual-client evidence ingest, promotion-readiness verification, and a deterministic first-release rollback-unavailable report. The separate `ci.yml` workflow is not part of that seven-workflow transition surface. `refresh-write-pr.yml` is the sole exact repository/PR write-permission exception and has no npm credential or OIDC authority. Every other release workflow is contents-read only: Actions may verify, build, read anonymous npm registry state, and upload sanitized artifacts, but cannot publish, move a dist-tag, roll back, deprecate, or administer npm. Presence of a workflow file is not evidence that acquisition, refresh writing, candidate publication, public installation, actual Claude Desktop testing, client-evidence ingest, successful readiness verification, `latest` movement, or fix-forward ran.
For releases under the current contract, anonymous registry history must supply a real previous `latest` SemVer. Absence of `latest` is not a supported transition state in the checked-in candidate/client/promotion chain.
This checkout defines `npm run doctor`, `npm run refresh:acquire-validate`, and `npm run refresh:verify-artifact`. Only `doctor` has its compiled program included in the packed npm artifact, where it is a local runtime/data diagnostic and never public or release evidence. The compiled refresh programs, their TypeScript build sources, and required development dependencies are excluded from the package; both refresh commands are therefore checkout-only protected-workflow internals. Direct local execution is non-authoritative and grants no source approval, writer permission, receipt, or transition.

## Roles and privilege map

| Stage | Allowed capability | Prohibited capability |
|---|---|---|
| Acquisition/validation | immutable checkout; repository contents read; bounded network read of the evidenced official source | repository/PR write, npm write, credential, OIDC, workbook execution |
| Refresh writer | read verified candidate; fixed repository/PR writes | network acquisition, candidate execution, npm/OIDC authority, writes outside the allowlist |
| Candidate workflow | immutable verification/build; exact tarball and sanitized handoff upload | npm credential/OIDC, publication, dist-tag or repository mutation |
| Human candidate ceremony | publish only the exact preverified tarball to the candidate tag | rebuild/repack, move `latest`, automation, reuse the credential |
| Public candidate verifier | anonymous public registry read and isolated exact-candidate execution | registry mutation, repository write, local artifact substitution, Claude Desktop claim |
| Client-evidence ingest | immutable protected receipts read; receipt validation and digest join | client launch/simulation, npm install, registry/repository mutation, promotion |
| Promotion-readiness workflow | anonymous registry read; predecessor/evidence verification; sanitized readiness artifact | npm credential/OIDC, dist-tag or repository mutation, claim of promotion |
| Human `latest` ceremony | move only the proved candidate after successful readiness verifies the pre-existing bound administrator authorization | rebuild, substitute bytes, bypass proofs, reuse candidate credential |
| Rollback workflow | emit deterministic `FIRST_RELEASE_ROLLBACK_UNAVAILABLE` evidence | registry/repository mutation, deprecation, invented predecessor |

Administrator-controlled prerequisites are npm identity/history and ownership, an actual unused SemVer, an existing previous `latest` SemVer under the current contract, enforced 2FA, separate short-lived least-privilege credentials for candidate publication and `latest` movement, artifact retention, sole-backend proof, protected candidate/client evidence, administrator-attested freshness evidence, and a pre-existing bound promotion authorization before readiness dispatch. Configure only the protected environments used by these contracts: `refresh-pr-writer`, `public-candidate-proof`, and `claude-desktop-client-proof`. Protected evidence environments must define `ACADEMYINFO_RELEASE_ADMINISTRATOR` as the exact reviewed administrator identity and the applicable verifier SHA-256 values as reviewed current-policy byte digests. Receipt-provided identity and caller-selected historical verifier code are never authority. Never place a token, TOTP, npm configuration, credential, signed query string, private path, local user name, or private runner identifier in an input, argv, log, artifact, or receipt.

## Constants and release invariants

- Dataset: `15118998` only.
- Runtime: Node `>=22 <23`; no Node 24 support claim.
- Official public lanes: Node 22 macOS/arm64, Windows/x64, Ubuntu glibc/x64.
- Runtime dependency boundary: the complete direct production set is exactly `@modelcontextprotocol/sdk` `1.29.0`, `better-sqlite3` `11.10.0`, `pino` `10.3.1`, and `zod` `4.4.3`; `better-sqlite3` `11.10.0` is the sole backend.
- Tool set: the seven legacy tools plus `explore_universities`, exactly eight.
- Registered `explore_universities` discovery schema: `tools/list` exposes this exact permissive Draft-07 outer input schema:

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

  It deliberately has no `required` keyword; `university_queries`, `indicators`, and `additionalProperties` each have an empty schema. The handler separately applies strict internal validation: `university_queries` is required; unknown top-level fields reject; queries are 1–10 unique trimmed strings of 1–120 Unicode code points; optional `indicators` contains at most five unique supported nonempty IDs; and invalid input fails before evaluation.
- Catalog: `data/seed/indicators.json`, schema version 1, KOGL-attributed JSON data, exactly five indicators.
- Freshness deadline: seven days, exactly `604800000` ms from immutable first-seen time.
- Runtime remains offline, read-only, no-key, stdout-clean, and recommendation/ranking-free.
- `better-sqlite3` `11.10.0` is the only authorized SQLite backend; no alternate or runtime fallback ships.
- The last-known-good public package and data, where they exist, remain available until the matching candidate is verified and moved to `latest` by a human.
- No Action has npm credential, OIDC, or registry-write authority. Candidate publication and `latest` movement use separate human terminal ceremonies and separate immediately revoked credentials.

## A. Triage and incident creation

1. Start from the last accepted source SHA, release-data digest, promoted version receipt, event schema/policy versions, dataset/page identity, and latest open incident if any.
2. Validate workflow time as an exact UTC timestamp `YYYY-MM-DDTHH:mm:ss.sssZ`. If invalid, write no state and stop.
3. Parse official timestamp evidence with the strict RFC3339-with-zone or IMF-fixdate parser. Invalid official time becomes null and the applicable deterministic classification; it never becomes the incident clock.
4. Compute the closed metadata fingerprint with RFC 8785 JCS/SHA-256.
5. Correlate with an existing open provisional incident when schema, dataset, page, and last accepted SHA agree and no differing acquired SHA exists. Metadata, ETag, or failure-detail drift aliases to the earliest incident and does not reset its first-seen time or deadline.
6. Otherwise create one provisional event tuple using the validated workflow time as first-seen and set deadline to first-seen plus `604800000` ms.
7. Classify the first applicable failure in policy order. Availability failures precede acquisition failures. Do not continue to writer or release on failure.

Deterministic failure classes, in precedence order, are:

1. `PAGE_UNREACHABLE`
2. `PAGE_HTTP_ERROR`
3. `PAGE_BODY_LIMIT`
4. `PAGE_METADATA_INVALID`
5. `DOWNLOAD_LINK_MISSING`
6. `DOWNLOAD_LINK_POLICY_REJECTED`
7. `DOWNLOAD_REDIRECT_POLICY_REJECTED`
8. `DOWNLOAD_UNREACHABLE`
9. `DOWNLOAD_TIMEOUT`
10. `DOWNLOAD_HTTP_ERROR`
11. `DOWNLOAD_BODY_LIMIT`
12. `DOWNLOAD_CONTENT_TYPE_MISMATCH`
13. `DOWNLOAD_ARCHIVE_INVALID`

The first four are availability classes; the remainder are acquisition classes. Once downloaded bytes have a SHA-256, source identity controls later transitions rather than metadata drift.

## B. Read-only acquisition
Operator entrypoint: `.github/workflows/refresh-acquire-validate.yml` (`Refresh acquisition and validation`). It may be manually dispatched or run on its configured schedule. Before dispatch, administrators must set repository variables `ACADEMYINFO_15118998_CANONICAL_PAGE` to the reviewed query-free HTTPS page and `ACADEMYINFO_REFRESH_POLICY_DIGEST` to the reviewed lowercase SHA-256 policy digest. This document intentionally supplies no endpoint value. The workflow fails closed when its bounded acquisition/verification scripts or policy inputs are absent.

1. Use the reviewed official page/download evidence. Do not guess an endpoint, scrape a replacement, or include a signed query in logs/artifacts.
2. Run from an immutable source revision with only repository content-read permission. Confirm there is no write/publish secret, OIDC, or repository/PR write permission.
3. Enforce reviewed HTTPS, redirect, body-size, content-type, ZIP/XML, and timeout bounds. Do not execute workbook content, macros, scripts, or candidate files.
4. Compute SHA-256 after acquisition. Record it as transport integrity, change detection, and audit evidence only.
5. Emit sanitized candidate files plus one closed digest-bearing acquisition report. Exclude the raw workbook, signed URL/query, credentials, local paths, and runner identity.
6. On any failure, persist only the deterministic event/evidence permitted by policy, keep last-known-good active, and stop before the writer.

A prior-checksum match does not authenticate the download. A changed checksum is not a rejection reason.

## C. Workbook and source-model validation

Apply the following rules exactly.

### Blank and header rules

`worksheet_blank_v1(cell)` is true only when the cell is absent or its decoded raw text becomes empty after Node 22 ECMAScript `String.prototype.trim()`. Use it for preamble/header discovery, last populated row, padding/trailers, beyond-header cells, and source-row membership.

For header matching only, convert CRLF to LF and remove a leading BOM. Do not apply Unicode normalization, translation, case folding, aliases, or whitespace rewriting. Require:

- exactly one header row;
- one occurrence of each required identity and response header;
- one occurrence of each logical indicator label;
- no nonblank cell beyond header width.

Any nonblank preamble, footer, or hidden row is a source candidate and must validate or block. Blank padding is ignored but audited.

### Raw coverage

Preserve every indexed cell as `{worksheet_row,column_index,column_ref,raw_text}` with unchanged raw text. Map each source row exactly once to:

- one raw row;
- one natural-key institution;
- five numeric-or-missing classifications.

Require `source_rows = raw_rows = institutions` and `classifications = source_rows × 5`. Natural key `(학교명, 본분교명)` must be nonblank and unique.

### Decimal and missing authority

After ECMAScript trim, only empty text and ASCII `-` are missing. Numeric values must match exactly one grammar:

```text
[0-9]+(?:\.[0-9]+)?
[1-9][0-9]{0,2}(?:,[0-9]{3})+(?:\.[0-9]+)?
```

Reject signs, exponent notation, internal whitespace, decimal commas, malformed grouping, Unicode digits, NaN, and infinity. For valid text:

1. remove valid grouping commas;
2. strip integer leading zeros and fractional trailing zeros;
3. encode zero as `0`;
4. require a finite, nonnegative JavaScript Number;
5. require exact shortest-Number-to-plain-decimal round trip.

Any mismatch is `precision_loss`; never round. `001,000` is lexically invalid and has no canonical value. `1,000` canonicalizes to `1000`.

Store canonical decimal text as semantic authority. The legacy REAL must equal `Number(canonical_value)` after database read and pass an independent round trip.

### Blocking versus audit-only changes

Block on source origin/workbook/license failure, nonunique identity/header/mapping, unexpected unit, decreasing/noninteger year, invalid numeric/missing domain, incomplete coverage, precision loss, or semantic inconsistency.

Do not independently block or approve on checksum, row/column count, institution set, values, unrelated columns, or allowed missingness. A valid 23-column or 25-column workbook can pass. Record all normal changes in the diff for administrator review.

## D. Deterministic candidate generation

1. Generate database, manifest, catalog, header/checksum/sample evidence, and refresh audit from the validated source model.
2. Keep `data/seed/indicators.json` as the only packaged source-derived catalog. Validate the closed schema, KOGL attribution, schema version 1, and exactly five indicators. Never generate executable catalog source or use a hard-coded fallback.
3. Independently compare database logical tables, manifest, and catalog.
4. Build stable RFC 8785 JCS/SHA-256 projections in this order:
   1. `source_model_digest_v1` over stable source/license and indexed source semantics;
   2. `seed_logical_digest_v1` over stable provenance, catalog identities, natural-key institutions, indexed raw rows, canonical observations, and missing classifications;
   3. `catalog_digest_v1` over the complete closed catalog;
   4. `manifest_semantic_digest_v1` over stable manifest semantics plus child digests;
   5. `release_data_digest_v1` over named child digests and policy/schema versions.
5. Exclude each projection's own digest and nonsemantic timestamp, event, workflow, physical-layout, and parent fields as specified. Keep physical file hashes separate.
6. Reproduce the logical payload and digests with an independent oracle that does not import production projection helpers.
7. Produce a sanitized semantic/physical diff against last accepted data.

Controlled-clock builds must have identical semantic digests even when timestamp-bearing physical bytes differ.

## E. Determine no-change or changed lifecycle

### Equal reacquired SHA

1. Revalidate official origin, license, and workbook semantics; checksum equality alone is insufficient.
2. Do not invoke the fixed-path writer and do not create a new package candidate.
3. Construct a closed verified-no-change inner payload that binds event identity, prior accepted SHA/release data, equal acquired SHA, source validations, evidence digests, and policy/schema versions, excluding approvals and digest fields.
4. JCS/SHA-256 the inner payload.
5. Obtain administrator attestation bound to that digest.
6. Construct the self-excluding outer receipt with inner payload/digest and attestation, then compute the final receipt digest.
7. Validate every join and transition the incident only through `VERIFIED_NO_CHANGE_CLOSED`.

### Differing acquired SHA

1. Alias the incident to the changed lifecycle while preserving original first-seen/deadline.
2. Prohibit verified-no-change closure.
3. If registry history supplies a real previous `latest` SemVer, continue through the fixed-path writer, read-only candidate build/handoff, human candidate-only publication, public/client proof, administrator-attested freshness evidence, pre-existing bound promotion authorization, read-only promotion readiness, and human movement of `latest`. If `latest` is absent (first publication), the workflow verifier chain is not used; the human ceremony in [`manual-publish-runbook.md`](manual-publish-runbook.md) is the operative path.
4. Close the incident only when anonymous post-state verification proves that the exact matching `release_data_digest_v1` is on `latest`.

## F. Fixed-path repository writer
Operator entrypoint: `.github/workflows/refresh-write-pr.yml` (`Refresh fixed-path PR writer`). Its privileged writer job uses the protected `refresh-pr-writer` environment and is triggered only by a successful default-branch run of the named acquisition workflow. Do not dispatch a substitute writer or manually copy an unverified acquisition artifact.

1. Invoke the separate writer only for a semantically valid changed candidate.
2. Give it only the repository content/PR write permission required for the fixed allowlist; do not give it acquisition or npm publication authority.
3. Verify named producer, immutable source commit, policy/schema versions, every candidate hash, and the closed acquisition report before writing.
4. Reject symlinks, path traversal, unexpected file types, extra files, missing files, and any artifact requiring execution.
5. Write only:
   - derived database;
   - seed manifest;
   - data-only catalog;
   - header snapshot;
   - checksum evidence;
   - sample evidence;
   - one digest-named refresh audit.
6. Do not write the raw workbook or download URL. Do not mutate an existing source artifact.
7. Present semantic and audit-only diffs to the administrator. Approval must bind the fixed candidate/evidence digest.
8. A writer failure leaves last-known-good active and the incident open.

## G. Prove the sole backend before release

The release backend is fixed to `better-sqlite3` `11.10.0`. Prove that the same package candidate installs prebuilt-only on all official public lanes with fresh state, active Python/node-gyp/compiler traps, and a demonstrated trap canary. Also prove bundled/custom/missing/corrupt database behavior and external-working-directory behavior. Any lane compile attempt, identity drift, or missing proof fails this gate.

If proof is incomplete or a lane fails, retain or record `BLOCKED_PENDING_BACKEND_SELECTION` and stop. This lifecycle state is preserved as historical transition narrative; it does not authorize `sql.js`, a second backend, a dependency change, or an automatic runtime fallback. The Actions read-only migration does not advance or close the state.

## H. Read-only candidate build and manual candidate publication

Operator entrypoint for verification is `.github/workflows/candidate-release.yml`. Supply every exact immutable input required by that workflow. Its legacy `confirm_candidate_only` literal is dispatch compatibility only; it grants no publication authority. The workflow has contents-read permission, no environment, no npm credential, and no OIDC. It revalidates the authorization chain and immutable source, runs the candidate gates, packs the exact tarball, computes SHA-256 and SHA-512 SRI, and uploads only the digest-named sanitized handoff.

The pre-existing `candidate-authorization.v1.json` must carry exactly four sorted evidence kinds—`backend-decision`, `release-data`, `source-revision`, and `version-registry-state`—and an allowed policy list containing `release`. All identifiers are bounded; paths, URIs, credentials, secrets, free-form evidence kinds, and unsupported policies are rejected before its digest can authorize a handoff.

Under the current chain, do not dispatch this workflow unless public `latest` exists and its exact SemVer is bound as `expected_previous_latest`. An absent `latest` requires the separately reviewed canonical bootstrap contract described in the current implementation boundary; no sentinel or fabricated predecessor is permitted.

1. Administrator verifies npm identity/history/ownership, selects an actual unused SemVer, and confirms 2FA, evidence retention, and sole-backend prerequisites. Placeholder versions are prohibited.
2. Dispatch the read-only workflow and require a successful immutable verification/build run.
3. Download the digest-named handoff. Independently match its tarball SHA-256, package SRI, package/version, source commit/tag, receipt commit, and authorization digests. Do not rebuild, repack, or run lifecycle scripts.
4. Follow [`manual-publish-runbook.md`](manual-publish-runbook.md) from a private human terminal to publish only that exact tarball to the non-`latest` candidate tag.
5. Revoke that ceremony's short-lived least-privilege credential immediately and prove that the revoked credential now fails authentication.
6. Read candidate state anonymously, build the sanitized closed post-state evidence, and obtain the required independent administrator attestation before persisting `candidate.v1.json`.
7. Candidate existence is not release completion. Do not infer or claim provenance/signature evidence that was not independently observed.

## I. Public-install proof
Operator entrypoint: `.github/workflows/public-candidate-verify.yml` (`Public candidate install verification`). Dispatch it only after the candidate receipt and authorization receipt are separately persisted through the protected `public-candidate-proof` environment, with every exact immutable input: `version`, `source_commit`, `receipt_commit`, `candidate_receipt_digest`, independently supplied `authorization_receipt_digest`, and `confirm_public_read_only` set to `verify-public-candidate-without-promotion`. Its only repository permission is contents read. It installs and exercises the exact public candidate in isolated environments; it cannot publish, move a dist-tag, promote, write repository contents, or substitute a local package.

For each of Node 22 macOS/arm64, Windows/x64, and Ubuntu glibc/x64:

1. Create fresh home, npm cache, working directory, and configuration outside the checkout.
2. Use an explicit public registry and make local package/tarball paths unreachable.
3. Enable Python, node-gyp, and compiler traps; demonstrate the traps with a canary.
4. Run exact `npx -y academyinfo-mcp@<version>` through an external JSON-RPC verifier.
5. Retain sanitized verbose install logs and prove that no compile/build tool ran.
6. From the actual npx cache tree, record installed `academyinfo-mcp` and every direct production dependency: SDK `1.29.0`, Pino `10.3.1`, Zod `4.4.3`, and the sole backend `better-sqlite3` `11.10.0`. Resolve public registry metadata and verify each installed tarball against `dist.integrity`.
7. Record Node/OS/architecture and Ubuntu glibc plus the candidate dist-tag. Record signature/provenance evidence only if it is independently observed; never infer it from the manual publication or an Actions artifact.
8. Verify initialize, exact eight tools, exact `explore_universities` input schema, bundled query, no-key operation, custom-path boundary as applicable, and JSON-RPC-only stdout.
9. Fail the lane for dependency drift, controlling duplicate runtime dependency, local artifact reachability, compilation, missing identity/integrity, or incomplete protocol evidence.

A local checkout or tarball cannot satisfy this stage.

## J. Client proof
The actual Claude Desktop exercise and the protected ingest are distinct operations. An operator must first exercise the exact public candidate in actual Claude Desktop on macOS and supply the sanitized immutable `claude-desktop-actual.v1.json` receipt; `.github/workflows/client-evidence.yml` (`Protected actual Claude Desktop evidence ingest`) only validates and joins that existing receipt. It does not launch, install, fabricate, or simulate Claude Desktop.

Dispatch the ingest only through the protected `claude-desktop-client-proof` environment with every exact immutable workflow input: `version`, `source_commit`, `receipt_commit`, `package_integrity`, `candidate_receipt_digest`, independently supplied `candidate_predecessor_receipt_digest`, `expected_previous_latest`, `macos_arm64_receipt_digest`, `windows_x64_receipt_digest`, `ubuntu_glibc_x64_receipt_digest`, `generic_stdio_journey_digest`, `actual_claude_receipt_digest`, `client_payload_digest`, `administrator_attestation_digest`, and `confirm_actual_not_simulated` set to `ingest-operator-supplied-actual-claude-desktop-evidence`. The `generic_stdio_journey_digest` input must equal the macOS lane receipt's `public_install_evidence_payload_v1.generic_stdio_journey_digest_v1`; the workflow input intentionally omits the receipt field's `_v1` suffix. The candidate predecessor and previous `latest` inputs must come from the independently persisted authorization chain and match the closed candidate/client payloads exactly. The immutable evidence commit must contain the candidate receipt, three lane receipts, operator-supplied actual-Claude receipt and artifacts, `client-evidence-payload.v1.json`, and `client-administrator-attestation.v1.json` at the workflow's fixed paths. The workflow has contents-read permission only: it validates predecessor joins and uploads a finalized client-proof receipt for separate persistence; it does not write the repository, read/install from npm, publish, move a dist-tag, or promote.

1. Exercise a generic stdio journey against the exact public candidate.
2. On Ubuntu, include an unresolved query followed by exact school/campus resolution, factual comparison, and indicator explanation. Confirm no partial unresolved data and no ranking/recommendation.
3. Separately exercise the candidate in actual Claude Desktop on macOS. Record sanitized evidence for startup, tool discovery, ambiguity handling, exact resolution, comparison, explanation/provenance, and clean shutdown.
4. Treat Cursor/Codex configuration as documentation-only unless those clients are separately exercised.
5. Build the closed `client-evidence-payload.v1.json` from the immutable candidate, three public-lane, generic-stdio, and actual-Claude receipt digests; compute its JCS/SHA-256 digest.
6. Obtain a separate administrator attestation bound to that exact payload digest; its identity must equal protected `ACADEMYINFO_RELEASE_ADMINISTRATOR`.
7. Persist the payload, attestation, actual-Claude receipt/artifacts, and all predecessor receipts at their fixed paths in an immutable protected default-branch evidence commit.
8. Dispatch the protected ingest with the payload and attestation digests. It revalidates every child, digest, and identity before creating the final self-excluding client receipt. Persist the workflow output separately at `evidence/releases/<version>/claude-desktop.v1.json` before requesting promotion readiness. Do not copy private client paths or identifiers into any payload, attestation, or receipt.

## K. Read-only promotion readiness and human `latest` movement

Before dispatch, require the same candidate to have passed all three public lanes, the generic stdio journey, actual Claude Desktop exercise, protected client ingest, and separately persisted client receipt. Create and validate the administrator-attested `CLIENT_VERIFIED` freshness transition evidence. The administrator must then review the complete immutable set and create the pre-existing promotion authorization bound to the exact candidate, client receipt, public lanes, actual-Claude receipt, freshness transition, predecessor state, event, release-data digest, first-seen time, and deadline.

Only after that authorization exists, dispatch `.github/workflows/promote-release.yml` with every exact immutable input: `version`, `source_commit`, `receipt_commit`, `candidate_receipt_digest`, `candidate_authorization_context_digest`, `client_receipt_digest`, `macos_arm64_receipt_digest`, `windows_x64_receipt_digest`, `ubuntu_glibc_x64_receipt_digest`, `actual_claude_receipt_digest`, `generic_stdio_journey_digest`, `freshness_transition_digest`, `promotion_authorization_digest`, `expected_previous_latest`, and the workflow's exact `confirm_promote` literal. The confirmation name is dispatch compatibility only. The workflow has contents-read permission, no environment, no npm credential, and no OIDC.

1. Let the workflow verify the pre-existing bound promotion authorization and re-fetch the exact candidate and existing `latest` anonymously. Require matching identity/integrity, all three public lanes, generic stdio, actual Claude, exact dependencies, `better-sqlite3` `11.10.0`, package/data digests, freshness evidence, and protected predecessor joins.
2. Require the sanitized `promotion-readiness.v1.json` artifact. It is readiness evidence, not a new approval and not evidence that `latest` moved.
3. After readiness succeeds, follow [`manual-publish-runbook.md`](manual-publish-runbook.md) from a private human terminal. Any immediate anonymous registry-state comparison is an operator staleness recheck, not a second promotion approval. Use a new short-lived least-privilege credential to move only the already-proved candidate to `latest`; never rebuild or substitute bytes.
4. Enter any TOTP only at the npm prompt. Never use `--otp` or place the TOTP/token in argv, logs, workflow inputs, artifacts, or evidence.
5. Revoke the promotion credential immediately and prove that it fails authentication. Then verify public `latest` identity/integrity anonymously and persist only sanitized post-state evidence.
6. If this release carries changed data, close only the incident whose expected release-data digest matches the anonymously verified `latest` state.

## L. After a first release exists: failure and fix-forward

`.github/workflows/rollback-release.yml` has no dispatch inputs or protected npm environment. It is a contents-read-only verifier that uploads `first-release-rollback-unavailable.v1.json` with deterministic result `FIRST_RELEASE_ROLLBACK_UNAVAILABLE`. It cannot restore a dist-tag, deprecate, unpublish, write the repository, or administer npm. A successful run proves only that the report was emitted.

This section applies only after an initial version has actually been published and reached `latest`. (The first publication itself is executed via [`manual-publish-runbook.md`](manual-publish-runbook.md).) At every stage before human movement of `latest`, stop, preserve the current public state, leave the incident open, and correct the failure without weakening gates. Once defective `0.1.0` exists, there is no prior-good package to restore:

1. Do not invent a predecessor, restore a dist-tag, deprecate `0.1.0`, or call the report a rollback.
2. Preserve the candidate, three-lane, actual-Claude, freshness, authorization, readiness, and public registry-state evidence.
3. Preserve the original changed-event first-seen time and seven-day deadline; failure or fix-forward does not reset it.
4. Correct the defect as exact version `0.1.1`.
5. Repeat the read-only candidate handoff, human candidate-only publication, three public lanes, actual Claude exercise and ingest, freshness evidence, pre-existing bound promotion authorization, read-only readiness verification, and human `latest` ceremony.
6. Never overwrite or reuse `0.1.0`. No rollback, deprecation, unpublish, token, owner, access, or other npm administrator operation may run in CI.

## Stop conditions

Stop and escalate without inventing or weakening policy when:

- official acquisition requires an unevidenced link, endpoint, scraping, or broader redirect/source policy;
- source, license, workbook, header, natural key, unit, year, missing marker, decimal, or mapping semantics are uncertain;
- a decimal cannot round-trip exactly;
- the catalog cannot remain closed-schema JSON data;
- any Action requests npm credentials, OIDC, registry mutation, or repository/PR write authority outside the exact fixed-path `refresh-write-pr.yml` job;
- the complete exact four-package direct production set, registered schema, omission behavior, or legacy contracts differ from the `better-sqlite3` `11.10.0` sole-backend boundary;
- any official lane compiles, fails, or lacks public identity/integrity evidence;
- the required all-lane `better-sqlite3` `11.10.0` evidence/receipt is absent or invalid;
- a receipt digest or predecessor join disagrees;
- a workflow-verifier dispatch is attempted while public `latest` is absent (the exact-SemVer predecessor contract cannot represent it — for a first publication use [`manual-publish-runbook.md`](manual-publish-runbook.md) instead and never fabricate predecessor evidence);
- a required protected-environment approval, administrator attestation, bound promotion authorization, evidence proof, or manual-ceremony prerequisite is absent;
- evidence would expose a token, TOTP, npm configuration, credential, signed query string, private path, local user name, or machine identifier.

Never round, guess, drop a lane, claim Node 24 support, use a placeholder version, publish partial product/data, automate an npm write, move `latest` before proofs, bound authorization, and readiness, close a changed incident without matching anonymous post-state verification, or present a candidate/readiness artifact as completion.
