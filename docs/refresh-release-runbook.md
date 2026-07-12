# Refresh and Release Runbook

## Purpose

This runbook covers a `15118998` refresh from detection through either verified no-change or promotion, plus candidate verification and rollback. It separates untrusted acquisition, narrow repository writing, registry publication, client proof, promotion, and rollback. It does not authorize an official download link, choose a SemVer, select a backend, publish, approve, or claim that any transition has already happened.

Use only implemented protected automation whose reviewed contract matches the stages below. Stop rather than inventing a workflow input, endpoint, link, source field, version, approval, or missing marker.
## Current implementation boundary

This checkout contains seven protected refresh/release workflow definitions: acquisition, fixed-path writing, candidate publication, public-candidate verification, actual-client evidence ingest, promotion, and rollback. The separate `ci.yml` workflow is not part of that seven-workflow transition surface. Pure freshness/receipt validation modules in `src/freshness-events.ts` and `src/release-receipts.ts` are library code, not operator CLIs. Each protected workflow is deliberately fail-closed when its required reviewed script, receipt, immutable input, variable, environment, or administrator action is absent. Presence of a workflow file is not evidence that acquisition, refresh writing, publication, public installation, actual Claude Desktop testing, client-evidence ingest, promotion, or rollback ran.
This checkout defines `npm run doctor`, `npm run refresh:acquire-validate`, and `npm run refresh:verify-artifact`. Only `doctor` has its compiled program included in the packed npm artifact, where it is a local runtime/data diagnostic and never public or release evidence. The compiled refresh programs, their TypeScript build sources, and required development dependencies are excluded from the package; both refresh commands are therefore checkout-only protected-workflow internals. Direct local execution is non-authoritative and grants no source approval, writer permission, receipt, or transition.

## Roles and privilege map

| Stage | Allowed capability | Prohibited capability |
|---|---|---|
| Acquisition/validation | immutable checkout; repository contents read; bounded network read of the evidenced official source | repository/PR write, npm publish, release secret, OIDC, workbook execution |
| Refresh writer | read verified candidate; fixed repository/PR writes | network acquisition, candidate execution, npm publish, writes outside the allowlist |
| Candidate publisher | publish one preverified immutable version to candidate tag | move `latest`, rebuild/alter candidate, repository refresh write |
| Public candidate verifier | public registry read and isolated exact-candidate execution | registry mutation, repository write, local artifact substitution, Claude Desktop claim |
| Client-evidence ingest | immutable protected receipts read; receipt validation and digest join | client launch/simulation, npm install, registry/repository mutation, promotion |
| Promotion | move the already-proved candidate to `latest` after protected approval | rebuild, substitute bytes, bypass predecessor receipts |
| Rollback | restore prior-good `latest`, deprecate bad version, record receipt | delete evidence, reuse version, reset incident clock |

Administrator-controlled prerequisites are npm identity/history and ownership, unused SemVer selection, 2FA/trusted publishing and provenance readiness, artifact retention, backend selection, and the separate no-change/candidate/client-proof/promotion/rollback approvals. Configure exactly the protected environments `refresh-pr-writer`, `npm-candidate`, `public-candidate-proof`, `claude-desktop-client-proof`, `npm-promotion`, and `npm-rollback`, each with its required approval boundary. Protected release environments must define `ACADEMYINFO_RELEASE_ADMINISTRATOR` as the exact reviewed administrator identity and `ACADEMYINFO_PUBLIC_INSTALL_VERIFIER_SHA256` plus `ACADEMYINFO_RELEASE_RECEIPT_VERIFIER_SHA256` as the reviewed current-policy verifier byte digests. Every privileged gate separates immutable evidence commits from current verifier policy and binds these protected values; receipt-provided identity and caller-selected historical verifier code are never authority. An Architect approval is additionally required only for a `sql.js` backend selection. Never place tokens, credentials, signed query strings, private paths, local user names, or private runner identifiers in inputs or receipts.

## Constants and release invariants

- Dataset: `15118998` only.
- Runtime: Node `>=22 <23`; no Node 24 support claim.
- Official public lanes: Node 22 macOS/arm64, Windows/x64, Ubuntu glibc/x64.
- Runtime dependency boundary: the complete direct production set is exactly `@modelcontextprotocol/sdk` `1.29.0`, `better-sqlite3` `11.10.0`, `pino` `10.3.1`, and `zod` `4.4.3` in the current package; exactly one approved backend may occupy the backend slot.
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
- Exactly one approved SQLite backend ships.
- The last-known-good public package and data remain available until a matching candidate is promoted.
- Registry mutation serialization: candidate publication, promotion, and rollback all use `academyinfo-mcp-registry-mutation` with `cancel-in-progress: false`.

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
3. Continue through writer, candidate, public/client proof, and promotion.
4. Close the incident only when the exact matching `release_data_digest_v1` reaches `latest`.

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

## G. Resolve the single backend before release

Use exactly one path.

### Retain `better-sqlite3`

Prove the same package candidate installs prebuilt-only on all official public lanes with fresh state, active Python/node-gyp/compiler traps, and a demonstrated trap canary. Also prove bundled/custom/missing/corrupt database behavior and external-working-directory behavior. Any lane compile attempt or missing proof fails this path.

### Select `sql.js`

Use this path only after the first path fails. Pin one reviewed version and prove all legacy/eighth-tool behavior, `ACADEMYINFO_DB_PATH`, package/WASM/license/security, startup, RSS, all path/error cases, and no-native-build operation. Build the closed decision payload over the exact source and evidence digests. Obtain separate Architect and administrator approvals bound to its digest, then validate the self-excluding outer receipt.

If neither path is valid, record `BLOCKED_PENDING_BACKEND_SELECTION` and stop. Never ship both or add an automatic runtime fallback.

## H. Candidate publication
Operator entrypoint: `.github/workflows/candidate-release.yml` (`Protected candidate release`). Dispatch its publication job only through the protected `npm-candidate` environment and only with every exact immutable input: `version`, `source_commit`, `source_tag`, `receipt_commit`, `authorization_receipt_digest`, `authorization_context_digest`, `expected_previous_latest`, and `confirm_candidate_only` set to `publish-to-candidate-not-latest`. Candidate publication uses the `academyinfo-mcp-registry-mutation` concurrency group with `cancel-in-progress: false`. Protected variables `ACADEMYINFO_RELEASE_RECEIPT_VERIFIER_SHA256` and `ACADEMYINFO_RELEASE_ADMINISTRATOR` bind the trusted verifier bytes and approval identity. The workflow fails closed if origin/default-branch ancestry, protected verifier, authorization receipt, or history relation is absent.

The pre-existing `candidate-authorization.v1.json` must carry exactly four sorted evidence kinds—`backend-decision`, `release-data`, `source-revision`, and `version-registry-state`—and an allowed policy list containing `release`. All identifiers are bounded; paths, URIs, credentials, secrets, free-form evidence kinds, and unsupported policies are rejected before its digest can authorize publication.
1. Administrator verifies npm identity/history/ownership, selects an unused SemVer, and confirms 2FA/trusted publishing, provenance, protected environment, and retention prerequisites.
2. The unprivileged verification job checks out protected receipts and candidate source separately, re-runs build, behavior, package, license, security, privacy, exact dependency, data digest, and backend gates without OIDC or publication credentials, and uploads only a digest-named exact tarball handoff.
3. Verify `engines.node` is `>=22 <23`; the closed direct production set is exactly `@modelcontextprotocol/sdk` `1.29.0`, `better-sqlite3` `11.10.0`, `pino` `10.3.1`, and `zod` `4.4.3` with only the approved backend; the catalog is packaged; and exactly eight tools are registered.
4. The protected publication job revalidates that handoff without running package lifecycle code, publishes the exact tarball only to the candidate tag with provenance, and preserves current `latest`. Do not publish directly to `latest`.
5. After publication, independently install the exact public candidate with scripts disabled and run `npm audit signatures --json --include-attestations`. Require the exact package's verified registry signature and provenance attestation, write only the sanitized closed `candidate-registry-provenance-proof.v1`, and embed its JCS/SHA-256 digest in `candidate-registry-post-state.v1`. The publication workflow then emits only the closed post-state candidate evidence payload and digest joining source commit, selected backend evidence, package identity/integrity, release-data digest, tests/audits, registry state, and that provenance proof. A separate administrator must review the post-state digest and create the final self-excluding `candidate.v1.json`; the publication workflow never self-mints its approval.
6. Sanitize publication evidence. Candidate existence is not release completion.

## I. Public-install proof
Operator entrypoint: `.github/workflows/public-candidate-verify.yml` (`Public candidate install verification`). Dispatch it only after the candidate receipt and authorization receipt are separately persisted through the protected `public-candidate-proof` environment, with every exact immutable input: `version`, `source_commit`, `receipt_commit`, `candidate_receipt_digest`, independently supplied `authorization_receipt_digest`, and `confirm_public_read_only` set to `verify-public-candidate-without-promotion`. Its only repository permission is contents read. It installs and exercises the exact public candidate in isolated environments; it cannot publish, move a dist-tag, promote, write repository contents, or substitute a local package.

For each of Node 22 macOS/arm64, Windows/x64, and Ubuntu glibc/x64:

1. Create fresh home, npm cache, working directory, and configuration outside the checkout.
2. Use an explicit public registry and make local package/tarball paths unreachable.
3. Enable Python, node-gyp, and compiler traps; demonstrate the traps with a canary.
4. Run exact `npx -y academyinfo-mcp@<version>` through an external JSON-RPC verifier.
5. Retain sanitized verbose install logs and prove that no compile/build tool ran.
6. From the actual npx cache tree, record installed `academyinfo-mcp` and every direct production dependency: SDK `1.29.0`, `pino` `10.3.1`, Zod `4.4.3`, and the one approved backend (`better-sqlite3` `11.10.0` in the current package). Resolve public registry metadata and verify each installed tarball against `dist.integrity`.
7. Record Node/OS/architecture and Ubuntu glibc, candidate tag, and available signature/provenance evidence.
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
8. Dispatch the protected ingest with the payload and attestation digests. It revalidates every child, digest, and identity before creating the final self-excluding client receipt. Persist the workflow output separately at `evidence/releases/<version>/claude-desktop.v1.json` before promotion. Do not copy private client paths or identifiers into any payload, attestation, or receipt.

## K. Promotion
Operator entrypoint: `.github/workflows/promote-release.yml` (`Protected release promotion`). Dispatch it only through the protected `npm-promotion` environment and only with every exact immutable input: `version`, `source_commit`, `receipt_commit`, `candidate_receipt_digest`, `candidate_authorization_context_digest`, `client_receipt_digest`, `macos_arm64_receipt_digest`, `windows_x64_receipt_digest`, `ubuntu_glibc_x64_receipt_digest`, `actual_claude_receipt_digest`, `generic_stdio_journey_digest`, `freshness_transition_digest`, `promotion_authorization_digest`, `expected_previous_latest`, and `confirm_promote` set to `promote-receipt-bound-candidate`. These inputs must come from the validated candidate/client evidence chain; the persisted output of `client-evidence.yml` is a protected receipt input, not a publication workflow, an actual Claude Desktop exercise, or an implied completed test. Candidate publication, promotion, and rollback all share the `academyinfo-mcp-registry-mutation` concurrency group with `cancel-in-progress: false`.

1. Re-fetch the exact candidate from the public registry; verify identity/integrity and candidate receipt.
2. Verify all three public lanes and the actual Claude receipt, dependency pins, selected backend, package/data digests, and protected predecessor joins.
3. Build a closed promotion payload and obtain administrator approval bound to its digest.
4. Move that exact candidate to `latest`; do not rebuild or substitute bytes.
5. Create and validate the self-excluding promotion receipt, then verify public `latest` resolves to the candidate identity/integrity. Retain the uploaded post-mutation `promotion.v1.json` and persist that exact file byte-identically in a protected immutable default-branch evidence commit at `evidence/releases/<version>/promotion.v1.json`. Rollback is unavailable until this protected copy exists and its outer receipt digest is supplied; do not reconstruct it from logs or other state.
6. If this release carries changed data, close only the incident whose expected release-data digest matches the promoted receipt.
7. Preserve the previous `latest` identity and receipt for rollback.

## L. Failure and rollback
Operator entrypoint: `.github/workflows/rollback-release.yml` (`Protected release rollback`). Dispatch it only through the protected `npm-rollback` environment and only with every exact immutable input: `bad_version`, `bad_source_commit`, `receipt_commit`, `promotion_receipt_digest`, `client_receipt_digest`, `promotion_freshness_receipt_digest`, `promotion_authorization_digest`, `previous_release_receipt_digest`, `prior_good_source_commit`, `prior_good_authorization_context_digest`, `freshness_transition_digest`, `rollback_authorization_digest`, `cause_code`, and `confirm_rollback` set to `restore-receipt-recorded-previous-latest`. `cause_code` must be one of `regression`, `data-validation`, `package-integrity`, or `client-incompatibility`. The immutable `receipt_commit` must already contain the byte-identical protected promotion output at `evidence/releases/<bad_version>/promotion.v1.json`. Candidate publication, promotion, and rollback share the package-scoped `academyinfo-mcp-registry-mutation` concurrency group with `cancel-in-progress: false`.

At every stage before promotion, stop, preserve last-known-good, leave the incident open, and correct the failure without weakening gates.

After a bad promotion:

1. Identify the bad version/promotion receipt and prior-good `latest` identity/receipt.
2. Build a closed rollback payload that binds both identities, reason/evidence, affected event, and predecessor digests.
3. Obtain administrator rollback approval bound to that digest.
4. Restore the exact prior-good version to `latest` and deprecate the bad version. Do not delete it or its evidence.
5. Verify public `latest` identity/integrity and runtime health on the required boundary.
6. Create and validate the self-excluding rollback receipt. Retain the uploaded post-mutation `rollback.v1.json` and persist that exact file byte-identically in a protected immutable default-branch evidence commit at `evidence/releases/<bad_version>/rollback.v1.json`; do not delete it.
7. Reopen the original changed-event first-seen/deadline. Metadata drift or rollback must not reset the seven-day clock.
8. Fix forward with a new unused SemVer; never overwrite or reuse the bad version.

## Stop conditions

Stop and escalate without inventing or weakening policy when:

- official acquisition requires an unevidenced link, endpoint, scraping, or broader redirect/source policy;
- source, license, workbook, header, natural key, unit, year, missing marker, decimal, or mapping semantics are uncertain;
- a decimal cannot round-trip exactly;
- the catalog cannot remain closed-schema JSON data;
- an action requests broader privilege or candidate execution;
- the complete four-package direct production dependency set, registered schema, omission behavior, or legacy contracts differ from the pinned single-backend boundary;
- any official lane compiles, fails, or lacks public identity/integrity evidence;
- no single backend has valid evidence/receipt;
- a receipt digest or predecessor join disagrees;
- an administrator prerequisite or protected approval is absent;
- evidence would expose a secret, signed query string, private path, local user name, or machine identifier.

Never round, guess, drop a lane, claim Node 24 support, publish partial product/data, close a changed incident without matching promotion, or present a candidate as complete.
