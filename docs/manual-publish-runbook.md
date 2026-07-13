# Manual npm Publication Runbook

## Authority and boundary

This is the only permitted procedure for npm registry writes. GitHub Actions may verify/build immutable inputs, read the public registry anonymously, and upload sanitized artifacts. Actions never receive an npm credential or OIDC authority and never publish, move a dist-tag, deprecate, unpublish, manage tokens, owners, or access. `refresh-write-pr.yml` is the sole exact repository/PR write-permission exception and has no npm/OIDC authority.

This document is a future operator procedure. Its presence is not evidence that a version was selected, published, proved, approved, or moved to `latest`.

## Current first-publication bootstrap status

**HOLD/UNSUPPORTED:** while the public package has no `latest` dist-tag, the current receipt/workflow chain cannot execute a first-ever publication. `candidate-release.yml` and `client-evidence.yml` require `expected_previous_latest` to be an exact SemVer, and `promote-release.yml` requires the same exact SemVer, parses an existing public `dist-tags.latest`, and validates that value as SemVer. Stop before candidate dispatch until a separately reviewed canonical absent-`latest` receipt, verifier, and workflow contract is implemented. Never use a sentinel, placeholder, candidate version, or fabricated SemVer as predecessor evidence for an absent `latest`.

This read-only Actions migration remains useful for immutable verification, anonymous registry observation, sanitized handoff/evidence, and removal of workflow registry authority. It does not make an initial `0.1.0` publication executable. Under the current contract, the procedure below applies only when anonymous registry history supplies a real previous `latest` SemVer. After canonical absent-`latest` support is implemented, these human ceremonies remain the only permitted registry-write procedure for first publication as well.

There are two separate human terminal ceremonies in a supported release chain:

1. publish the exact preverified tarball under the non-`latest` candidate tag;
2. after all public/client/freshness proofs, pre-existing bound administrator promotion authorization, and successful readiness verification, move that exact version to `latest`.

Use a different short-lived, least-privilege npm credential for each ceremony. Create and revoke each credential through an interactive human npm administration terminal, never CI. Do not create the promotion credential until the pre-existing promotion authorization has been verified by a successful readiness run. Do not grant either credential owner, access-policy, unpublish, deprecation, or token-management authority; limit it to the one package and the minimum write needed for its ceremony.

## Shared prerequisites

Stop unless all of these are true:

- An administrator selected an actual unused SemVer. A blank value, `<version>`, `VERSION`, `x.y.z`, `0.0.0`, an npm tag, or any other placeholder is prohibited.
- Public anonymous registry history proves that exact version is unused and records the pre-ceremony `latest` and candidate dist-tags.
- Under the current contract, public `latest` exists and resolves to the exact SemVer supplied as `expected_previous_latest`. If `latest` is absent, apply the first-publication `HOLD/UNSUPPORTED` boundary above.
- npm ownership/release authority and enforced interactive 2FA are confirmed.
- The immutable source/tag, authorization receipt, workflow run, and artifact retention are identified.
- The package contract is unchanged: Node `>=22 <23`; exactly eight tools; the exact `explore_universities` discovery/handler contract; and direct production dependencies `@modelcontextprotocol/sdk` `1.29.0`, `pino` `10.3.1`, `zod` `4.4.3`, and sole backend `better-sqlite3` `11.10.0`.
- All Actions `uses:` references are full-SHA pinned; every job except the exact fixed-path `refresh-write-pr.yml` writer is read-only for repository contents; and no workflow contains an npm credential, OIDC write permission, or registry-mutating command.

Use a private operator-controlled terminal, not a runner or shared host. Disable shell tracing, command recording, screen sharing, and terminal transcripts. Set `umask 077`; use a fresh directory outside the checkout; and use separate private npm user-configuration files for administrator authentication, the release credential, and anonymous reads. Never place credentials in the repository or its normal npm configuration.

Enter a release token only through hidden interactive input into its mode-`0600` private user-configuration file, with tracing disabled, then unset the shell variable. The token value must never appear in argv, shell history, environment dumps, logs, artifacts, or evidence. Enter TOTP only when npm prompts on the terminal. Never use `--otp`, an OTP environment variable, pasted command text, or any recorded input. If the required interactive TOTP prompt does not occur, stop.

## Evidence boundary

Before either write, prepare a sanitized ceremony record containing only the package/version, immutable source and receipt identities, workflow run/artifact identity, tarball SHA-256 and SHA-512 SRI, anonymous registry pre-state, required attestations and bound authorization, and timestamps. Afterward add anonymous registry post-state plus a sanitized credential-revocation/authentication-failure result.

Never retain the token, TOTP, token identifier, npm user configuration, environment dump, shell history, terminal transcript, npm debug log, signed URL, private path, local user name, machine identifier, or private runner detail. Do not claim provenance or a registry signature unless it was independently observed from public registry evidence.

## Ceremony 1: candidate-only publication

1. Dispatch `.github/workflows/candidate-release.yml` with its exact immutable inputs. Its legacy `confirm_candidate_only` wording is dispatch compatibility only; the workflow has no publication authority.
2. Require the read-only verification/build job to succeed. Download its digest-named candidate handoff from that exact run.
3. Without running package lifecycle code, independently verify the handoff allowlist and the exact tarball's package name, actual selected version, source commit/tag, receipt/authorization digests, SHA-256, and SHA-512 SRI. Do not rebuild, repack, rename, or substitute the tarball.
4. Re-read anonymous npm state immediately before publication. Stop if the selected version now exists or if `latest`/candidate differs from the recorded predecessor state.
5. In the private terminal, load the newly created candidate-only credential from its private user-configuration file and run `npm publish` against `https://registry.npmjs.org/` with `--ignore-scripts`, `--access public`, and `--tag candidate`, naming the exact verified tarball. Do not pass `--otp`; answer only the interactive npm TOTP prompt.
6. Never publish directly to `latest`. If the command result is interrupted or ambiguous, do not retry blindly: proceed to revocation, then determine state anonymously.
7. Immediately have the human token administrator revoke the candidate credential by its private identifier in a separate interactive terminal context. Keep the revoked credential's private configuration only long enough to run `npm whoami` against the registry and require an authentication failure. If authentication succeeds, stop and treat it as a credential incident. Delete the private configuration after the failure proof.
8. With an empty anonymous user configuration, verify the exact version's public identity/integrity, candidate dist-tag, and unchanged `latest`. Sanitize the result before adding it to evidence.
9. Build the candidate post-state receipt and obtain its required independent administrator attestation. Candidate publication is not release completion.

## Proofs required before `latest`

Do not create a promotion credential or move `latest` until every item passes against the same public candidate identity/integrity:

1. `.github/workflows/public-candidate-verify.yml` completes anonymous public installation on Node 22 macOS/arm64, Windows/x64, and Ubuntu glibc/x64 with fresh homes/caches/workdirs, no local tarball, active build traps, exact dependencies, exact eight-tool discovery, the exact `explore_universities` schema/behavior, bundled queries, no-key behavior, and JSON-RPC-only stdout.
2. The generic stdio journey passes, including the required unresolved-to-exact-resolution flow.
3. The exact candidate is exercised in actual Claude Desktop on macOS and produces sanitized immutable evidence. Configuration documentation or simulation is not actual-Claude evidence.
4. `.github/workflows/client-evidence.yml` validates and joins the pre-existing three-lane, generic-stdio, and actual-Claude receipts, and its finalized client receipt is separately persisted before freshness evidence and promotion authorization are created.
5. The administrator-attested freshness transition evidence binds the same candidate/client chain, event, release-data digest, immutable first-seen time, and seven-day deadline in the required `CLIENT_VERIFIED` state.
6. An administrator reviews that complete immutable evidence and creates the pre-existing promotion authorization bound to the exact candidate, client receipt, three public lanes, actual-Claude receipt, freshness transition, predecessor state, event, release-data digest, first-seen time, and deadline. This authorization must exist before readiness is dispatched.
7. `.github/workflows/promote-release.yml` verifies that pre-existing bound authorization and anonymously revalidates the public candidate, existing `latest`, integrity, freshness, and immutable predecessor joins before uploading sanitized `promotion-readiness.v1.json`. That artifact is readiness evidence only; it neither creates approval nor performs promotion.

## Ceremony 2: move the proved candidate to `latest`

1. After a successful readiness run verifies the pre-existing bound promotion authorization and anonymous registry state, create a new short-lived credential limited to the package and minimum dist-tag write. Do not reuse the candidate credential.
2. Re-read anonymous package identity/integrity and dist-tags. Match them to `promotion-readiness.v1.json`, the candidate receipt, the three public lanes, actual-Claude receipt, freshness transition, and the verified administrator-authorized predecessor state. This is an operator staleness recheck, not a second promotion approval. Stop on any mismatch or staleness.
3. In the private terminal, use `npm dist-tag add` against `https://registry.npmjs.org/` to assign `latest` to the exact proved package version. Do not rebuild, republish, alter the candidate tarball, or pass `--otp`; answer only the interactive npm TOTP prompt.
4. If the command result is interrupted or ambiguous, do not retry blindly. Revoke first, then inspect state anonymously.
5. Immediately have the human token administrator revoke the promotion credential. Using its still-private configuration, require `npm whoami` to fail authentication; successful authentication is a credential incident. Delete the configuration after proof.
6. With an empty anonymous user configuration, verify `latest` resolves to the exact approved version and the same registry integrity. Persist only sanitized post-state evidence. A changed-data incident may close only when this anonymous post-state joins the matching `release_data_digest_v1`.

## After a first release exists: no rollback

After an initial version has actually reached `latest`, there is no prior-good npm version to restore if that first release is defective. `.github/workflows/rollback-release.yml` only emits sanitized deterministic result `FIRST_RELEASE_ROLLBACK_UNAVAILABLE`; it has no inputs, credential, OIDC, protected npm environment, or mutation authority. This failure procedure does not bootstrap the currently unsupported first-ever publication.

Once defective `0.1.0` exists, do not restore a dist-tag, deprecate, unpublish, overwrite, or reuse it. Preserve its evidence and the original incident clock, correct the defect as exact version `0.1.1`, and repeat candidate-only publication, all three public lanes, actual Claude evidence, client ingest, freshness evidence, pre-existing bound promotion authorization, readiness verification, and the human `latest` ceremony.

## Stop conditions

Stop without making or repeating a registry write when:

- the version is missing, placeholder-like, already present, or not administrator-selected;
- public `latest` is absent under the current SemVer-only predecessor contract, so first-publication bootstrap remains `HOLD/UNSUPPORTED`;
- the handoff, tarball bytes, hashes, SRI, source/tag, receipt, or authorization join differs;
- a rebuild, repack, lifecycle execution, local substitute, partial package, or direct `latest` publication is proposed;
- any workflow requests an npm credential, OIDC, registry mutation, or npm administration;
- required 2FA cannot be entered interactively without argv/log/evidence exposure;
- credential scope/lifetime is broader than necessary, credentials are reused, revocation is delayed, or revoked authentication still succeeds;
- a candidate/public lane/generic-stdio/actual-Claude/client-ingest/freshness/readiness proof, required administrator attestation, or bound promotion authorization is absent, failed, stale, simulated, or mismatched;
- anonymous pre/post-state differs from the approved evidence, or a registry command has an ambiguous result;
- evidence would expose a credential, TOTP, npm configuration, private path, terminal transcript, signed URL, or machine/user identifier.

Never work around a stop condition by weakening evidence, using a placeholder, moving `latest` early, or performing an npm administrator operation from CI.
