import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  assertNoPrivateLaneMaterial,
  canonicalizeJcs,
  CLIENT_POLICY_VERSIONS,
  EXPECTED_EXPLORE_SCHEMA,
  genericStdioJourneyDigest,
  genericStdioProjection,
  hasExactDirectDependencies,
  isExactExploreSchema,
  parseJsonStrict,
  sha256Jcs,
  validateActualClientReceipt,
  validatePublicRegistryResolution,
  validPublicReceiptIdentifier,
} from "../scripts/public-installed-verify.mjs"
import {
  POLICY_VERSION_CONTRACT,
  PUBLIC_RECEIPT_IDENTIFIER,
  releaseTransitionDigest,
  validPolicyVersions,
  validReceiptIntegrity,
  validateClosedExactFields,
  verifyReceipt,
} from "../scripts/release-receipt-verify.mjs"
import { collectPackageContractFailures } from "../scripts/package-check-config.js"
import { handleExploreUniversities } from "../src/explore-universities-handler.js"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const publicWorkflow = readFileSync(resolve(projectRoot, ".github/workflows/public-candidate-verify.yml"), "utf8")
const candidateWorkflow = readFileSync(resolve(projectRoot, ".github/workflows/candidate-release.yml"), "utf8")
const ciWorkflow = readFileSync(resolve(projectRoot, ".github/workflows/ci.yml"), "utf8")
const clientWorkflow = readFileSync(resolve(projectRoot, ".github/workflows/client-evidence.yml"), "utf8")
const promotionWorkflow = readFileSync(resolve(projectRoot, ".github/workflows/promote-release.yml"), "utf8")
const rollbackWorkflow = readFileSync(resolve(projectRoot, ".github/workflows/rollback-release.yml"), "utf8")
const verifierSource = readFileSync(resolve(projectRoot, "scripts/public-installed-verify.mjs"), "utf8")
const VERSION = "0.1.1"
const SOURCE_COMMIT = "1".repeat(40)
const CANDIDATE_DIGEST = "2".repeat(64)
const PACKAGE_INTEGRITY = `sha512-${Buffer.alloc(64, 7).toString("base64")}`
const EXPECTED_TOOLS = [
  "list_sources",
  "list_indicators",
  "search_university",
  "get_university_metrics",
  "compare_universities",
  "explain_indicator",
  "validate_source_coverage",
  "explore_universities",
]
const EVIDENCE_KINDS = [
  "ambiguity-handling",
  "clean-shutdown",
  "exact-resolution",
  "factual-comparison",
  "indicator-explanation",
  "startup",
  "tool-discovery",
]
const REQUIRED_EVIDENCE_BINDINGS = [
  ["actual-claude-desktop", "ACTUAL_CLAUDE_RECEIPT_DIGEST"],
  ["generic-stdio-journey", "GENERIC_STDIO_JOURNEY_DIGEST"],
  ["public-install-macos-arm64", "MACOS_RECEIPT_DIGEST"],
  ["public-install-ubuntu-glibc-x64", "UBUNTU_RECEIPT_DIGEST"],
  ["public-install-windows-x64", "WINDOWS_RECEIPT_DIGEST"],
]

function actualClientReceipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const payload = {
    schema_version: "actual-claude-desktop-evidence-payload.v1",
    evidence_kind: "actual-claude-desktop-macos",
    actual_client: true,
    simulated: false,
    client_name: "Claude Desktop",
    client_version: "1.2.3",
    platform: "darwin",
    architecture: "arm64",
    package_name: "academyinfo-mcp",
    package_version: VERSION,
    package_integrity: PACKAGE_INTEGRITY,
    source_commit: SOURCE_COMMIT,
    candidate_receipt_digest: CANDIDATE_DIGEST,
    invocation: `npx -y academyinfo-mcp@${VERSION}`,
    observed_at: "2026-07-11T00:00:00.000Z",
    observations: {
      startup: true,
      tool_discovery: { passed: true, tool_names: EXPECTED_TOOLS },
      ambiguity_handling: { passed: true, no_guess: true, no_partial_data: true },
      exact_resolution: true,
      factual_comparison: { passed: true, no_ranking: true, no_recommendation: true },
      indicator_explanation: {
        passed: true,
        provenance_present: true,
        license_present: true,
        year_present: true,
        unit_present: true,
        source_column_present: true,
      },
      clean_shutdown: true,
    },
    evidence_artifact_digests: EVIDENCE_KINDS.map((kind, index) => ({ kind, digest: String(index + 3).repeat(64) })),
    sanitization: {
      credentials_absent: true,
      private_paths_absent: true,
      local_user_names_absent: true,
      machine_identifiers_absent: true,
    },
    ...overrides,
  }
  const payloadDigest = sha256Jcs(payload)
  const attestationProjection = {
    role: "operator",
    attested_at: "2026-07-11T00:01:00.000Z",
    decision: "actual-client-observed",
    actual_client_evidence_digest_v1: payloadDigest,
  }
  const receipt = {
    receipt_schema_version: "actual-claude-desktop-receipt.v1",
    actual_client_evidence_payload_v1: payload,
    actual_client_evidence_digest_v1: payloadDigest,
    operator_attestation: { ...attestationProjection, attestation_digest: sha256Jcs(attestationProjection) },
  }
  return { ...receipt, receipt_digest_v1: sha256Jcs(receipt) }
}

const expected = {
  version: VERSION,
  sourceCommit: SOURCE_COMMIT,
  candidateReceiptDigest: CANDIDATE_DIGEST,
  packageIntegrity: PACKAGE_INTEGRITY,
}

function genericProtocol(ubuntuClientJourney: unknown, parsedMessageCount: number): Record<string, unknown> {
  return {
    initialize: {
      passed: true,
      protocol_version: "2024-11-05",
      server_name: "academyinfo-mcp",
      server_version: VERSION,
    },
    tools_list: {
      passed: true,
      names: EXPECTED_TOOLS,
      explore_input_schema: EXPECTED_EXPLORE_SCHEMA,
    },
    bundled_query: {
      passed: true,
      tool: "explore_universities",
      status: "ok",
      query: { university_queries: ["전남대학교 본교"], indicators: ["competition_rate"] },
      source_dataset_ids: ["15118998"],
    },
    no_api_key: {
      passed: true,
      data_go_kr_service_key: "absent",
      academyinfo_service_key: "absent",
    },
    json_rpc_stdout: {
      passed: true,
      parsed_message_count: parsedMessageCount,
      non_json_rpc_line_count: 0,
    },
    ubuntu_client_journey: ubuntuClientJourney,
  }
}

function clientReleaseReceipt(
  payloadOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const payload = {
    schema_version: "release-evidence-payload.v1",
    transition: "client",
    package_name: "academyinfo-mcp",
    package_version: VERSION,
    package_integrity: PACKAGE_INTEGRITY,
    previous_latest_version: "0.1.0",
    predecessor_receipt_digests: [CANDIDATE_DIGEST],
    evidence_digests: [
      { kind: "actual-claude-desktop", digest: "3".repeat(64) },
      { kind: "generic-stdio-journey", digest: "4".repeat(64) },
      { kind: "public-install-macos-arm64", digest: "5".repeat(64) },
      { kind: "public-install-ubuntu-glibc-x64", digest: "6".repeat(64) },
      { kind: "public-install-windows-x64", digest: "7".repeat(64) },
    ],
    run_id: "12345-1-client",
    source_commit: SOURCE_COMMIT,
    policy_versions: CLIENT_POLICY_VERSIONS.map((entry) => ({ ...entry })),
    ...payloadOverrides,
  }
  const payloadDigest = sha256Jcs(payload)
  const approvalProjection = {
    role: "administrator",
    identity: "release-admin",
    approved_at: "2026-07-11T00:02:00.000Z",
    decision: "client",
    evidence_payload_digest_v1: payloadDigest,
  }
  const receipt = {
    receipt_schema_version: "client-receipt.v1",
    evidence_payload_v1: payload,
    evidence_payload_digest_v1: payloadDigest,
    approval: {
      ...approvalProjection,
      attestation_digest: sha256Jcs(approvalProjection),
    },
  }
  return { ...receipt, receipt_digest_v1: sha256Jcs(receipt) }
}

function verifyClientReleaseReceipt(
  receipt: Record<string, unknown>,
  optionOverrides: Record<string, unknown> = {},
): unknown {
  return verifyReceipt(receipt, {
    kind: "client",
    expectedDigest: receipt.receipt_digest_v1,
    expectedPredecessor: CANDIDATE_DIGEST,
    sourceCommit: SOURCE_COMMIT,
    packageName: "academyinfo-mcp",
    packageVersion: VERSION,
    packageIntegrity: PACKAGE_INTEGRITY,
    expectedApprover: "release-admin",
    previousLatest: "0.1.0",
    ...optionOverrides,
  })
}

function actionReferences(workflow: string): string[] {
  return [...workflow.matchAll(/^\s*uses:\s*(\S+)\s*$/gmu)].map((match) => match[1] ?? "")
}

function expectBefore(workflow: string, prerequisite: string, mutation: string): void {
  expect(workflow.indexOf(prerequisite)).toBeGreaterThanOrEqual(0)
  expect(workflow.indexOf(mutation)).toBeGreaterThan(workflow.indexOf(prerequisite))
}

function requiredEvidenceBindings(workflow: string): string[][] {
  const block = workflow.match(/const requiredEvidence = \[\n([\s\S]*?)\n\s+\];/u)
  if (!block?.[1]) throw new Error("Workflow requiredEvidence array not found")
  return [...block[1].matchAll(/\{ kind: "([^"]+)", digest: process\.env\.([A-Z_]+) \}/gu)]
    .map((match) => [match[1] ?? "", match[2] ?? ""])
}

function expectDispatchInputsOnlyInEnvironment(workflow: string): void {
  const declared = [...workflow.matchAll(/^ {6}([a-z][a-z0-9_]*):\n {8}description:/gmu)]
    .map((match) => match[1] ?? "")
    .sort()
  const bindings = [...workflow.matchAll(/^\s+[A-Z][A-Z0-9_]*:\s+\$\{\{ inputs\.([a-z][a-z0-9_]*) \}\}\s*$/gmu)]
    .map((match) => match[1] ?? "")
    .sort()
  expect(bindings).toEqual(declared)
  for (const line of workflow.split("\n").filter((candidate) => candidate.includes("${{ inputs."))) {
    expect(line).toMatch(/^\s+[A-Z][A-Z0-9_]*:\s+\$\{\{ inputs\.[a-z][a-z0-9_]* \}\}\s*$/u)
  }
}

describe("public candidate workflow contract", () => {
  it("defines the exact clean Node 22 public support matrix and immutable evidence boundary", () => {
    expect(publicWorkflow).toContain("macos-arm64")
    expect(publicWorkflow).toContain("runner: macos-14")
    expect(publicWorkflow).toContain("windows-x64")
    expect(publicWorkflow).toContain("runner: windows-2022")
    expect(publicWorkflow).toContain("ubuntu-glibc-x64")
    expect(publicWorkflow).toContain("runner: ubuntu-24.04")
    expect(publicWorkflow).toContain('node-version: "22"')
    for (const field of [
      "VERIFIER_HOME", "NPM_CONFIG_CACHE", "VERIFIER_CWD", "NPM_CONFIG_USERCONFIG",
      "BUILD_TRAP_DIR", "BUILD_TRAP_LOG", "BUILD_TRAP_CANARY",
    ]) expect(publicWorkflow).toContain(field)
    expect(publicWorkflow).toContain("Get-ChildItem -LiteralPath $env:GITHUB_WORKSPACE -Force | Remove-Item -Recurse -Force")
    expect(publicWorkflow).toContain("https://registry.npmjs.org/")
    expect(publicWorkflow).toContain("$env:VERIFIER_SCRIPT lane")
    expect(publicWorkflow).toContain("This workflow did not publish, move a dist-tag, promote, or exercise Claude Desktop.")
  })

  it("uses only commit-pinned actions and has no registry mutation authority", () => {
    const references = actionReferences(publicWorkflow)
    expect(references.length).toBeGreaterThan(0)
    expect(references.every((reference) => /@[a-f0-9]{40}$/.test(reference))).toBe(true)
    expect(publicWorkflow).toContain("permissions:\n  contents: read")
    expect(publicWorkflow).not.toMatch(/npm\s+(?:publish|dist-tag|unpublish|deprecate)\b/u)
    expect(publicWorkflow).not.toContain("id-token: write")
    expect(publicWorkflow).not.toContain("NODE_AUTH_TOKEN")
  })

  it("routes every untrusted dispatch value through environment bindings", () => {
    for (const workflow of [candidateWorkflow, publicWorkflow, clientWorkflow, promotionWorkflow, rollbackWorkflow]) {
      expectDispatchInputsOnlyInEnvironment(workflow)
    }
    expect(publicWorkflow).toContain("$env:CONFIRM_PUBLIC_READ_ONLY")
    expect(clientWorkflow).toContain("process.env.CONFIRM_ACTUAL_NOT_SIMULATED")
    expect(promotionWorkflow).toContain('$CONFIRM_PROMOTE"')
    expect(rollbackWorkflow).toContain('$CONFIRM_ROLLBACK"')
  })

  it("uses protected verifier bytes and validates the immutable candidate receipt before candidate execution", () => {
    expect(publicWorkflow).toContain("ref: ${{ env.RECEIPT_COMMIT }}")
    expect(publicWorkflow).not.toContain("ref: ${{ env.SOURCE_COMMIT }}")
    expect(publicWorkflow).toContain("Get-FileHash -LiteralPath $verifier -Algorithm SHA256")
    expect(publicWorkflow).toContain("$actualVerifierSha256 -ne $env:PUBLIC_INSTALL_VERIFIER_SHA256")
    expect(publicWorkflow).toContain("vars.ACADEMYINFO_RELEASE_RECEIPT_VERIFIER_SHA256")
    expect(publicWorkflow).toContain("vars.ACADEMYINFO_PUBLIC_INSTALL_VERIFIER_SHA256")
    expect(publicWorkflow).not.toContain("verifier_sha256:")
    expect(publicWorkflow).toContain("Get-FileHash -LiteralPath $receiptVerifier -Algorithm SHA256")
    expect(publicWorkflow).toContain("$actualReceiptVerifierSha256 -ne $env:RECEIPT_VERIFIER_SHA256")
    expectBefore(publicWorkflow, "Protected receipt verifier byte digest mismatch", "& node $receiptVerifier")
    expect(publicWorkflow).toContain("--expected-predecessor $env:AUTHORIZATION_RECEIPT_DIGEST")
    expect(publicWorkflow).not.toContain("payload.predecessor_receipt_digests[0]")
    expect(publicWorkflow).not.toContain("$candidatePredecessor")
    expectBefore(publicWorkflow, "--kind candidate", "$env:VERIFIER_SCRIPT lane")
    expectBefore(publicWorkflow, "Receipt commit is not protected default-branch history", "$env:VERIFIER_SCRIPT lane")
  })
})

describe("candidate publication privilege boundary", () => {
  it("keeps every dispatch value out of shell interpolation and uses only pinned actions", () => {
    expectDispatchInputsOnlyInEnvironment(candidateWorkflow)
    const references = actionReferences(candidateWorkflow)
    expect(references.length).toBeGreaterThan(0)
    expect(references.every((reference) => /@[a-f0-9]{40}$/u.test(reference))).toBe(true)
    expect(candidateWorkflow).not.toContain("NODE_AUTH_TOKEN")
  })

  it("runs candidate code only in the unprivileged job and publishes only the verified tarball", () => {
    const unprivileged = candidateWorkflow.slice(
      candidateWorkflow.indexOf("  verify-build:"),
      candidateWorkflow.indexOf("  publish-candidate:"),
    )
    const publisher = candidateWorkflow.slice(candidateWorkflow.indexOf("  publish-candidate:"))
    expect(unprivileged).toContain("permissions:\n      contents: read")
    expect(unprivileged).not.toContain("id-token: write")
    expect(unprivileged).not.toContain("environment: npm-candidate")
    for (const command of ["npm ci", "npm run build", "npm test", "npm run package:check", "npm pack"]) {
      expect(unprivileged).toContain(command)
      expect(publisher).not.toContain(command)
    }
    expect(publisher).toContain("environment: npm-candidate")
    expect(publisher).toContain("id-token: write")
    expect(publisher).toContain("actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093")
    expect(publisher).not.toContain("actions/checkout@")
    expect(publisher).toContain('npm publish "$TARBALL" --access public --tag candidate --provenance --ignore-scripts')
    expect(publisher).toContain('NPM_CONFIG_IGNORE_SCRIPTS: "true"')
  })

  it("loads authorization and verifier from separate protected history with configured verifier bytes", () => {
    expect(candidateWorkflow).toContain("path: trusted-receipts")
    expect(candidateWorkflow).toContain("path: candidate-source")
    expect(candidateWorkflow).toContain("ref: ${{ env.RECEIPT_COMMIT }}")
    expect(candidateWorkflow).toContain("ref: ${{ env.SOURCE_COMMIT }}")
    expect(candidateWorkflow).toContain("Source and protected receipt commits must be separate immutable identities")
    expect(candidateWorkflow).toContain("vars.ACADEMYINFO_RELEASE_RECEIPT_VERIFIER_SHA256")
    expect(candidateWorkflow).toContain("Protected receipt verifier byte digest mismatch")
    expect(candidateWorkflow).toContain("Receipt commit is not immutable protected default-branch history")
    expect(candidateWorkflow).toContain("Downloaded trusted verifier byte digest mismatch")
    expect(candidateWorkflow).toContain("Handoff authorization evidence does not match the independently verified receipt")
    expect(candidateWorkflow).toContain('trusted-receipts/evidence/releases/$VERSION/candidate-authorization.v1.json')
    expect(candidateWorkflow).not.toContain("candidate-source/scripts/release-receipt-verify.mjs")
    expectBefore(candidateWorkflow, "--kind candidate-authorization", "npm ci")
    expectBefore(candidateWorkflow, "Downloaded trusted verifier byte digest mismatch", "package/package.json")
  })

  it("binds handoff policy to the exact protected tip and rechecks it after publication approval", () => {
    expect(candidateWorkflow).toContain(
      'test "$(git -C trusted-policy rev-parse "origin/$DEFAULT_BRANCH")" = "$POLICY_COMMIT"',
    )
    expect(candidateWorkflow).toContain("Current workflow policy is not the exact protected default-branch tip")
    expect(candidateWorkflow).toContain("policy_commit: process.env.POLICY_COMMIT")
    expect(candidateWorkflow).toContain('handoff.policy_commit !== process.env.POLICY_COMMIT')
    expect(candidateWorkflow).toContain(
      'test "$(git -C "$POLICY_RECHECK" rev-parse refs/remotes/protected/default)" = "$POLICY_COMMIT"',
    )
    expect(candidateWorkflow).toContain("Protected publication verifier byte digest mismatch")
    expectBefore(candidateWorkflow, "Publication policy is no longer the exact protected default-branch tip", 'npm publish "$TARBALL"')
    expectBefore(candidateWorkflow, "Protected publication verifier byte digest mismatch", 'npm publish "$TARBALL"')
  })

  it("emits closed unattested post-state evidence and cannot self-mint administrator approval", () => {
    expectBefore(candidateWorkflow, 'npm publish "$TARBALL"', 'schema_version: "candidate-registry-post-state.v1"')
    expectBefore(candidateWorkflow, 'test "$LATEST" = "$EXPECTED_PREVIOUS_LATEST"', 'schema_version: "candidate-registry-post-state.v1"')
    for (const binding of [
      "candidate-evidence-payload.v1.json",
      "registry-post-state.v1.json",
      'predecessor_receipt_digests: [process.env.AUTHORIZATION_RECEIPT_DIGEST]',
      '{ kind: "authorization-receipt"',
      '{ kind: "registry-post-state"',
      '{ kind: "release-data"',
      '{ kind: "source-tarball"',
      "policy_versions: handoff.authorization_evidence.policy_versions",
      'sanitized: true',
      "Post-state evidence fields are not closed",
      "Upload unattested post-state evidence for separate administrator attestation and persistence",
      "No administrator approval or final \\`candidate.v1.json\\` was created here.",
      "Public verification remains blocked until a separately attested and protected-persisted final \\`candidate.v1.json\\` exists.",
      "This is not release completion.",
    ]) expect(candidateWorkflow).toContain(binding)
    for (const forbidden of [
      'role: "administrator"',
      'decision: "candidate"',
      "approvalProjection",
      "attestation_digest",
      'receipt_schema_version: "candidate-receipt.v1"',
      "--kind candidate",
      "--expected-approver \"$RELEASE_ADMINISTRATOR\"",
      "Candidate receipt digest:",
    ]) expect(candidateWorkflow.slice(candidateWorkflow.indexOf("  publish-candidate:"))).not.toContain(forbidden)
  })

  it("retrieves verified npm signature/provenance evidence without widening candidate evidence kinds", () => {
    for (const binding of [
      "npm audit signatures --json --include-attestations",
      "registry-provenance.v1.json",
      'schema_version: "candidate-registry-provenance-proof.v1"',
      "registry_signatures_digest: sha256Jcs(signatures)",
      "verified_attestation_bundles_digest: sha256Jcs(verifiedTarget.attestationBundles)",
      "verification_report_digest: sha256Jcs(verificationReport)",
      "closedProof.registry_provenance_digest !== provenanceProofDigest",
      "Registry post-state provenance digest join mismatch",
    ]) expect(candidateWorkflow).toContain(binding)
    expect(candidateWorkflow).toContain("verificationReport.invalid.length !== 0")
    expect(candidateWorkflow).toContain("verificationReport.missing.length !== 0")
    expect(candidateWorkflow).toContain("verifiedTargets.length !== 1")
    expect(candidateWorkflow).toContain(
      "canonicalizeJcs(verifiedTarget.attestations) !== canonicalizeJcs(registryDist.attestations)",
    )
    expect(candidateWorkflow).not.toContain('{ kind: "registry-provenance"')
    expectBefore(candidateWorkflow, 'npm publish "$TARBALL"', "npm audit signatures --json --include-attestations")
  })

  it("runs the focused workflow-security contracts explicitly in CI", () => {
    expect(ciWorkflow).toContain("Focused workflow-security adversarial contracts")
    expect(ciWorkflow).toContain("npm test -- test/public-verifier-contract.test.ts")
  })
})

describe("cross-platform public installed verifier contract", () => {
  it("spawns only exact versioned npx and records all required public evidence fields", () => {
    expect(verifierSource).toContain('spawn(command, ["-y", specification]')
    expect(verifierSource).toContain('const specification = `${PACKAGE_NAME}@${version}`')
    expect(verifierSource).not.toMatch(/spawn\([^\n]*npm[^\n]*install/u)
    for (const field of [
      "candidate_dist_tag", "installed_identities", "registry_tarball", "registry_integrity",
      "cached_tarball_integrity_verified", "glibc_version_runtime", "build_traps", "canary_proven",
      "initialize", "tools_list", "explore_input_schema", "bundled_query", "no_api_key",
      "json_rpc_stdout", "install_log", "local_artifact_reachable", "promotion_performed",
      "generic_stdio_journey_digest_v1",
    ]) expect(verifierSource).toContain(field)
    expect(verifierSource).toContain('"@modelcontextprotocol/sdk", SDK_VERSION')
    expect(verifierSource).toContain('"better-sqlite3", BETTER_SQLITE3_VERSION')
    expect(verifierSource).toContain('"pino", PINO_VERSION')
    expect(verifierSource).toContain('"zod", ZOD_VERSION')
    expect(verifierSource).toContain('SDK_VERSION = "1.29.0"')
    expect(verifierSource).toContain('ZOD_VERSION = "4.4.3"')
    expect(verifierSource).toContain('BETTER_SQLITE3_VERSION = "11.10.0"')
    expect(verifierSource).toContain('PINO_VERSION = "10.3.1"')
    expect(verifierSource).toContain("Ubuntu ambiguity journey returned partial or guessed data")
    expect(verifierSource).toContain("ranking/recommendation field detected")
  })
  it("waits for closed stdio, flushes decoding, and rejects non-clean protocol termination", () => {
    expect(verifierSource).toContain('child.on("close", (code, signal) =>')
    expect(verifierSource).not.toContain('child.on("exit"')
    const closeHandler = verifierSource.slice(verifierSource.indexOf('child.on("close", (code, signal) =>'))
    expect(closeHandler.indexOf("stdoutDecoder.end()")).toBeGreaterThanOrEqual(0)
    expect(closeHandler.indexOf("validateProtocolClose(code, signal")).toBeGreaterThan(
      closeHandler.indexOf("stdoutDecoder.end()"),
    )
  })

  it("uses deterministic JCS and rejects duplicate JSON keys", () => {
    expect(canonicalizeJcs({ z: 1, a: [true, "x"] })).toBe('{"a":[true,"x"],"z":1}')
    expect(() => parseJsonStrict('{"a":1,"a":2}')).toThrow("duplicate JSON key")
  })

  it("requires the exact installed application direct dependency map", () => {
    const dependencies = {
      "@modelcontextprotocol/sdk": "1.29.0",
      "better-sqlite3": "11.10.0",
      pino: "10.3.1",
      zod: "4.4.3",
    }
    expect(hasExactDirectDependencies(dependencies)).toBe(true)
    expect(hasExactDirectDependencies({ ...dependencies, undeclared: "1.0.0" })).toBe(false)
    expect(hasExactDirectDependencies({ ...dependencies, zod: "^4.4.3" })).toBe(false)
  })

  it("pins the exact permissive tools/list schema while internal validation remains strict", () => {
    expect(isExactExploreSchema(EXPECTED_EXPLORE_SCHEMA)).toBe(true)
    expect(EXPECTED_EXPLORE_SCHEMA).not.toHaveProperty("required")
    expect(EXPECTED_EXPLORE_SCHEMA.properties).toEqual({
      university_queries: {},
      indicators: {},
    })
    expect(EXPECTED_EXPLORE_SCHEMA.additionalProperties).toEqual({})

    expect(
      isExactExploreSchema({ ...EXPECTED_EXPLORE_SCHEMA, additionalProperties: false }),
    ).toBe(false)
    expect(
      isExactExploreSchema({
        ...EXPECTED_EXPLORE_SCHEMA,
        required: ["university_queries"],
      }),
    ).toBe(false)
    expect(
      isExactExploreSchema({
        ...EXPECTED_EXPLORE_SCHEMA,
        properties: {
          ...EXPECTED_EXPLORE_SCHEMA.properties,
          indicators: { type: "array" },
        },
      }),
    ).toBe(false)

    const invalidRequests = [
      [{}, "MISSING_UNIVERSITY_QUERIES"],
      [{ university_queries: "전남대학교 본교" }, "UNIVERSITY_QUERIES_NOT_ARRAY"],
      [{ university_queries: ["전남대학교 본교"], extra: true }, "UNKNOWN_TOP_LEVEL_FIELDS"],
    ] as const
    for (const [input, expectedIssueCode] of invalidRequests) {
      const response = handleExploreUniversities(input as never).structuredContent as {
        readonly status: string
        readonly data: {
          readonly validation: {
            readonly issues: readonly { readonly code: string }[]
          }
        }
      }
      expect(response.status).toBe("invalid_request")
      expect(response.data.validation.issues[0]?.code).toBe(expectedIssueCode)
    }
  })

  it("hashes one closed lane-independent generic stdio projection", () => {
    const macos = genericProtocol(null, 3)
    const ubuntu = genericProtocol({
      passed: true,
      ambiguity_no_partial_data: true,
      exact_resolution: true,
      factual_comparison: true,
      indicator_explanation: true,
      no_ranking_or_recommendation: true,
    }, 5)
    expect(genericStdioJourneyDigest(macos)).toBe(genericStdioJourneyDigest(ubuntu))
    expect(Object.keys(genericStdioProjection(macos))).toEqual([
      "schema_version",
      "initialize",
      "tools_list",
      "bundled_query",
      "no_api_key",
      "json_rpc_stdout",
    ])
    expect(genericStdioProjection(macos)).not.toHaveProperty("ubuntu_client_journey")
    expect(genericStdioProjection(macos).json_rpc_stdout).not.toHaveProperty(
      "parsed_message_count",
    )
    expect(() =>
      genericStdioProjection({
        ...macos,
        generic_lane_secret: "unexpected",
      }),
    ).toThrow("generic stdio source shape mismatch")
  })

  it("accepts the emitted client contract and rejects every downgrade", () => {
    expect(CLIENT_POLICY_VERSIONS).toEqual(POLICY_VERSION_CONTRACT.client)
    expect(validPolicyVersions(CLIENT_POLICY_VERSIONS, "client")).toBe(true)
    const receipt = clientReleaseReceipt()
    expect(verifyClientReleaseReceipt(receipt)).toEqual({
      kind: "client",
      receiptDigest: receipt.receipt_digest_v1,
    })

    const exactEvidence = (
      receipt.evidence_payload_v1 as Record<string, unknown>
    ).evidence_digests as Array<Record<string, unknown>>
    expect(exactEvidence.filter(({ kind }) => kind === "generic-stdio-journey")).toHaveLength(1)
    expect(() => verifyClientReleaseReceipt(clientReleaseReceipt({
      previous_latest_version: null,
    }))).toThrow()
    expect(() => verifyClientReleaseReceipt(receipt, {
      previousLatest: undefined,
    })).toThrow()
    expect(() => verifyClientReleaseReceipt(clientReleaseReceipt({
      policy_versions: [...CLIENT_POLICY_VERSIONS, { policy: "semantic", version: "v1" }],
    }))).toThrow()
    expect(() => verifyClientReleaseReceipt(clientReleaseReceipt({
      evidence_digests: exactEvidence.filter(({ kind }) => kind !== "generic-stdio-journey"),
    }))).toThrow()
    expect(() => verifyClientReleaseReceipt(clientReleaseReceipt({
      evidence_digests: [
        ...exactEvidence,
        { kind: "generic-stdio-journey", digest: "8".repeat(64) },
      ],
    }))).toThrow()
    expect(verifierSource).not.toContain("async function runClient")
    expect(verifierSource).not.toContain("function parseLaneArguments")
    for (const clientOnlyFlag of [
      "--previous-latest",
      "--package-integrity",
      "--actual-client-receipt",
      "--actual-client-receipt-digest",
      "--approver",
      "--approved-at",
      "--lane-receipt",
      "--lane-digest",
    ]) expect(verifierSource).not.toContain(`"${clientOnlyFlag}"`)
  })

  it("accepts only credential-free exact public registry resolutions", () => {
    expect(
      validatePublicRegistryResolution(
        "https://registry.npmjs.org/zod/-/zod-4.4.3.tgz",
      ).origin,
    ).toBe("https://registry.npmjs.org")
    for (const resolution of [
      "https://user:pass@registry.npmjs.org/zod/-/zod-4.4.3.tgz",
      "https://registry.npmjs.org:444/zod/-/zod-4.4.3.tgz",
      "https://registry.npmjs.org:443/zod/-/zod-4.4.3.tgz",
      "https://registry.npmjs.org/zod/-/zod-4.4.3.tgz?token=x",
      "https://registry.npmjs.org/zod/-/zod-4.4.3.tgz#fragment",
      "https://registry.example.invalid/zod/-/zod-4.4.3.tgz",
    ]) {
      expect(() => validatePublicRegistryResolution(resolution)).toThrow()
    }
  })
  it("requires the CLI-only package main entry to remain absent", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(projectRoot, "package.json"), "utf8"),
    ) as Record<string, unknown>
    const packageLock = JSON.parse(
      readFileSync(resolve(projectRoot, "package-lock.json"), "utf8"),
    ) as Record<string, unknown>
    expect(packageJson).not.toHaveProperty("main")
    expect((packageLock.packages as Record<string, Record<string, unknown>>)[""]).not.toHaveProperty("main")

    const packageWithMain = { ...packageJson, main: "index.js" }
    expect(
      collectPackageContractFailures(packageWithMain, packageLock).map(({ code }) => code),
    ).toContain("package_main_contract")

    const lockWithMain = structuredClone(packageLock)
    ;(lockWithMain.packages as Record<string, Record<string, unknown>>)[""].main = "index.js"
    expect(
      collectPackageContractFailures(packageJson, lockWithMain).map(({ code }) => code),
    ).toContain("package_main_contract")
  })


  it("bounds all public run identifiers and scans assembled lane receipts before persistence", () => {
    expect(PUBLIC_RECEIPT_IDENTIFIER.source).toBe(
      /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,63})$/u.source,
    )
    for (const identifier of ["1", "12345-1-client", "release.run_1"]) {
      expect(validPublicReceiptIdentifier(identifier)).toBe(true)
      expect(PUBLIC_RECEIPT_IDENTIFIER.test(identifier)).toBe(true)
    }
    for (const identifier of [
      "",
      "a".repeat(65),
      "/private/var/folders/release",
      "https://example.invalid/run",
      "user@example.invalid",
      "run id",
    ]) {
      expect(validPublicReceiptIdentifier(identifier)).toBe(false)
      expect(PUBLIC_RECEIPT_IDENTIFIER.test(identifier)).toBe(false)
    }
    expect(() => assertNoPrivateLaneMaterial({
      run_id: "safe-run",
      nested: { credential: "redacted" },
    })).toThrow("private material")
    expect(verifierSource.lastIndexOf("assertNoPrivateLaneMaterial(receipt)")).toBeGreaterThan(
      verifierSource.lastIndexOf("const receipt = buildClosedReceipt"),
    )
    expect(verifierSource.lastIndexOf("prepareNewFile(receiptPath)")).toBeGreaterThan(
      verifierSource.lastIndexOf("assertNoPrivateLaneMaterial(receipt)"),
    )
  })
})

describe("actual Claude Desktop protected ingest", () => {
  it("is manual, protected, receipt-only, action-pinned, and explicitly external", () => {
    expect(clientWorkflow).toContain("workflow_dispatch:")
    expect(clientWorkflow).toContain("environment: claude-desktop-client-proof")
    expect(clientWorkflow).toContain("claude-desktop-actual.v1.json")
    expect(clientWorkflow).toContain("public-install-macos-arm64.v1.json")
    expect(clientWorkflow).toContain("public-install-windows-x64.v1.json")
    expect(clientWorkflow).toContain("public-install-ubuntu-glibc-x64.v1.json")
    expect(clientWorkflow).toContain("ingest-operator-supplied-actual-claude-desktop-evidence")
    expect(clientWorkflow).toContain("no client was fabricated or simulated by this workflow")
    expect(clientWorkflow).not.toMatch(/npm\s+(?:publish|dist-tag|unpublish|deprecate|install|exec)\b/u)
    expect(clientWorkflow).not.toContain("npx -y")
    expect(clientWorkflow).not.toContain("NODE_AUTH_TOKEN")
    expect(actionReferences(clientWorkflow).every((reference) => /@[a-f0-9]{40}$/.test(reference))).toBe(true)
  })

  it("requires the exact current policy tip and fully binds candidate/client predecessor history", () => {
    expect(clientWorkflow).toContain(
      'test "$(git -C trusted-policy rev-parse refs/remotes/protected/default)" = "$WORKFLOW_COMMIT"',
    )
    expect(clientWorkflow).toContain("Current client evidence policy is not the exact protected default-branch tip")
    expect(clientWorkflow).toContain("CANDIDATE_PREDECESSOR_RECEIPT_DIGEST")
    expect(clientWorkflow).toContain("EXPECTED_PREVIOUS_LATEST")
    expect(clientWorkflow).toContain(
      "candidatePredecessorReceiptDigest !== process.env.CANDIDATE_PREDECESSOR_RECEIPT_DIGEST",
    )
    expect(clientWorkflow).toContain(
      "candidatePreviousLatest !== process.env.EXPECTED_PREVIOUS_LATEST",
    )
    expect(clientWorkflow).not.toContain("payload.previous_latest_version !== null")
    expect(clientWorkflow).toContain("const candidatePreviousLatest = payload?.previous_latest_version")
    expect(clientWorkflow.match(/--previous-latest "\$EXPECTED_PREVIOUS_LATEST"/gu)).toHaveLength(2)
    expect(clientWorkflow).toContain(
      '--expected-predecessor "$CANDIDATE_PREDECESSOR_RECEIPT_DIGEST"',
    )
    expect(clientWorkflow).toContain('--expected-predecessor "$CANDIDATE_RECEIPT_DIGEST"')
    expectBefore(clientWorkflow, "Current client evidence policy is not the exact protected default-branch tip", "--kind candidate")
    expectBefore(clientWorkflow, "--kind candidate", "--kind client")
  })

  it("hashes received artifacts and rejects forged or runtime-generated administrator approval", () => {
    expect(clientWorkflow).toContain("const path = `${artifactDirectory}/${artifact.kind}.evidence`")
    for (const kind of EVIDENCE_KINDS) expect(verifierSource).toContain(`"${kind}"`)
    expect(clientWorkflow).toContain('createHash("sha256").update(readFileSync(path)).digest("hex")')
    expect(clientWorkflow).toContain("Actual evidence artifact required set mismatch")
    expect(clientWorkflow).toContain("client-administrator-attestation.v1.json")
    expect(clientWorkflow).toContain("approval.evidence_payload_digest_v1 !== process.env.CLIENT_PAYLOAD_DIGEST")
    expect(clientWorkflow).toContain("sha256Jcs(attestationProjection) !== attestationDigest")
    expect(clientWorkflow).not.toContain("${{ github.actor }}")
    expect(clientWorkflow).not.toContain("new Date().toISOString()")
    expect(clientWorkflow).not.toContain("--approver")
    expect(clientWorkflow).not.toContain("--approved-at")
  })

  it("requires the exact generic-stdio, three-lane, and actual-Claude set in the closed client payload", () => {
    expect(requiredEvidenceBindings(clientWorkflow)).toEqual(REQUIRED_EVIDENCE_BINDINGS)
    expect(clientWorkflow).not.toContain("generic_stdio_receipt_digest")
    expect(clientWorkflow).not.toContain("GENERIC_STDIO_RECEIPT_DIGEST")
    expect(clientWorkflow).toContain(
      "canonicalizeJcs(payload.evidence_digests) !== canonicalizeJcs(requiredEvidence)",
    )
    expect(clientWorkflow).toContain("JSON.stringify([process.env.CANDIDATE_RECEIPT_DIGEST])")

    const digests: Record<string, string> = {
      ACTUAL_CLAUDE_RECEIPT_DIGEST: "a".repeat(64),
      MACOS_RECEIPT_DIGEST: "b".repeat(64),
      GENERIC_STDIO_JOURNEY_DIGEST: "e".repeat(64),
      UBUNTU_RECEIPT_DIGEST: "c".repeat(64),
      WINDOWS_RECEIPT_DIGEST: "d".repeat(64),
    }
    const exactEvidence = REQUIRED_EVIDENCE_BINDINGS.map(([kind, binding]) => ({
      kind,
      digest: digests[binding] ?? "",
    }))
    const adversarialEvidence = [
      exactEvidence.filter(({ kind }) => kind !== "generic-stdio-journey"),
      exactEvidence.map((entry) => entry.kind === "generic-stdio-journey"
        ? { ...entry, digest: "0".repeat(64) }
        : entry),
      [...exactEvidence, { kind: "unexpected-evidence", digest: "f".repeat(64) }],
      [...exactEvidence].reverse(),
    ]
    for (const evidence of adversarialEvidence) {
      expect(canonicalizeJcs(evidence)).not.toBe(canonicalizeJcs(exactEvidence))
    }
  })

  it("runs the full closed lane validator instead of a shallow outer-identity projection", () => {
    expect(clientWorkflow).toContain("validateLaneReceipt,")
    expect(clientWorkflow).toContain("validateLaneReceipt(")
    expect(clientWorkflow).not.toContain("const { receipt_digest_v1: outerDigest, ...projection } = receipt")
    for (const guard of [
      "public lane payload digest mismatch",
      "public lane schema mismatch",
      "public lane runtime mismatch",
      "public lane isolation proof incomplete",
      "public lane build trap proof incomplete",
      "public lane installed identities incomplete",
      "public lane protocol proof incomplete",
      "public lane sanitized install log proof incomplete",
    ]) expect(verifierSource).toContain(guard)
  })

  it("accepts a closed operator receipt with every actual-client observation", () => {
    const receipt = actualClientReceipt()
    expect(validateActualClientReceipt(receipt, expected)).toEqual({
      payload: receipt.actual_client_evidence_payload_v1,
      receiptDigest: receipt.receipt_digest_v1,
    })
  })

  it.each([
    ["simulation", { simulated: true }],
    ["wrong client", { client_name: "Synthetic MCP Client" }],
    ["wrong platform", { platform: "linux" }],
    ["local invocation", { invocation: "node ./dist/src/index.js" }],
    ["missing artifact proof", { evidence_artifact_digests: [] }],
    ["private path not sanitized", { sanitization: { credentials_absent: true, private_paths_absent: false, local_user_names_absent: true, machine_identifiers_absent: true } }],
  ])("rejects adversarial %s evidence even when all digests are recomputed", (_name, mutation) => {
    expect(() => validateActualClientReceipt(actualClientReceipt(mutation), expected)).toThrow()
  })

  it("rejects incomplete or reordered tool discovery and a stale outer digest", () => {
    const wrongTools = actualClientReceipt({
      observations: {
        ...((actualClientReceipt().actual_client_evidence_payload_v1 as Record<string, unknown>).observations as Record<string, unknown>),
        tool_discovery: { passed: true, tool_names: [...EXPECTED_TOOLS].reverse() },
      },
    })
    expect(() => validateActualClientReceipt(wrongTools, expected)).toThrow("exact tool discovery")

    const stale = actualClientReceipt()
    ;(stale.actual_client_evidence_payload_v1 as Record<string, unknown>).simulated = true
    expect(() => validateActualClientReceipt(stale, expected)).toThrow()
  })
})

describe("protected mutation authorization order", () => {
  it("requires the exact five-kind evidence set and rejects forged promotion authorization before latest", () => {
    expect(requiredEvidenceBindings(promotionWorkflow)).toEqual(REQUIRED_EVIDENCE_BINDINGS)
    expect(promotionWorkflow).not.toContain("generic_stdio_receipt_digest")
    expect(promotionWorkflow).not.toContain("GENERIC_STDIO_RECEIPT_DIGEST")
    expect(promotionWorkflow).toContain(
      "canonicalizeJcs(b.evidence_digests) !== canonicalizeJcs(requiredEvidence)",
    )
    expect(promotionWorkflow).toContain("promotion-authorization.v1.json")
    expect(promotionWorkflow).toContain("sha256Jcs(payload) !== payloadDigest")
    expect(promotionWorkflow).toContain("sha256Jcs(attestationProjection) !== attestationDigest")
    expect(promotionWorkflow).toContain("authorizationDigest !== process.env.PROMOTION_AUTHORIZATION_DIGEST")
    expect(promotionWorkflow).not.toContain("${{ github.actor }}")
    expectBefore(promotionWorkflow, "Promotion authorization digest verification failed", "npm dist-tag add")
  })

  it("authorizes against an open predecessor and creates PROMOTED_CLOSED only after latest verification", () => {
    expect(promotionWorkflow).toContain("promotion-freshness-transition.v1.json")
    expect(promotionWorkflow).toContain('freshnessPayload.transition !== "CLIENT_VERIFIED"')
    expect(promotionWorkflow).toContain("freshnessPayload.release_data_digest_v1 !== candidateReleaseDataDigest")
    expect(promotionWorkflow).toContain("candidateAuthorizationPayload.release_data_digest_v1")
    expect(promotionWorkflow).toContain("freshnessPayload.event_id !== candidateAuthorizationPayload.event_id")
    expect(promotionWorkflow).toContain("payload.event_id !== freshnessPayload.event_id")
    expect(promotionWorkflow).toContain("payload.release_data_digest_v1 !== freshnessPayload.release_data_digest_v1")
    expect(promotionWorkflow).toContain("payload.predecessor_transition_digest !== freshnessPayload.transition_digest")
    expect(promotionWorkflow).toContain("payload.first_seen_at !== freshnessPayload.first_seen_at")
    expect(promotionWorkflow).toContain("payload.deadline_at !== freshnessPayload.deadline_at")
    expect(promotionWorkflow).toContain('transition: "PROMOTED_CLOSED"')
    expect(promotionWorkflow).toContain("PROMOTED_CLOSED completion verification failed")
    expectBefore(promotionWorkflow, "Promotion authorization digest verification failed", "npm dist-tag add")
    expectBefore(promotionWorkflow, "npm dist-tag add", 'transition: "PROMOTED_CLOSED"')
    expectBefore(promotionWorkflow, 'test "$INTEGRITY" = "${{ steps.receipts.outputs.package_integrity }}"', 'transition: "PROMOTED_CLOSED"')
  })

  it("loads the completed predecessor and records ROLLBACK_REOPENED only after both mutations", () => {
    for (const binding of [
      "prior_good_version",
      "prior_good_package_integrity",
      "prior_good_release_data_digest_v1",
      "prior_good_receipt_digest",
      "predecessor_transition_digest",
      "first_seen_at",
      "deadline_at",
    ]) expect(rollbackWorkflow).toContain(binding)
    expect(rollbackWorkflow).toContain("rollback-authorization.v1.json")
    expect(rollbackWorkflow).toContain("promotion-completion-receipt.v1")
    expect(rollbackWorkflow).toContain("sha256Jcs(payload) !== payloadDigest")
    expect(rollbackWorkflow).toContain("sha256Jcs(attestationProjection) !== attestationDigest")
    expect(rollbackWorkflow).toContain("authorizationDigest !== process.env.ROLLBACK_AUTHORIZATION_DIGEST")
    expect(rollbackWorkflow).not.toContain("${{ github.actor }}")
    expectBefore(rollbackWorkflow, "Rollback administrator attestation or outer digest mismatch", "npm dist-tag add")
    expectBefore(rollbackWorkflow, "Rollback administrator attestation or outer digest mismatch", "npm deprecate")
    expectBefore(rollbackWorkflow, "npm deprecate", 'transition: "ROLLBACK_REOPENED"')
    expectBefore(rollbackWorkflow, 'test "$INTEGRITY" = "$PREVIOUS_INTEGRITY"', 'transition: "ROLLBACK_REOPENED"')
  })
  it("pins trusted origins and policy bytes, serializes registry mutation, and types rollback predecessors", () => {
    for (const workflow of [candidateWorkflow, publicWorkflow, clientWorkflow, promotionWorkflow, rollbackWorkflow]) {
      expect(workflow).toContain("merge-base --is-ancestor")
      expect(workflow).not.toContain("remote set-url origin")
    }
    for (const workflow of [publicWorkflow, clientWorkflow, promotionWorkflow, rollbackWorkflow]) {
      expect(workflow).toContain("trusted-policy")
      expect(workflow).toContain("ACADEMYINFO_PUBLIC_INSTALL_VERIFIER_SHA256")
      expect(workflow).toContain("ACADEMYINFO_RELEASE_RECEIPT_VERIFIER_SHA256")
    }
    expect(promotionWorkflow).toContain("group: academyinfo-mcp-registry-mutation")
    expect(rollbackWorkflow).toContain("group: academyinfo-mcp-registry-mutation")
    expect(promotionWorkflow).toContain("const trustedCurrentMilliseconds = Date.now()")
    expect(promotionWorkflow).toContain(
      "Approval order must be candidate < client <= freshness administrator <= promotion authorization",
    )
    expect(rollbackWorkflow).toContain("process.env.CLIENT_RECEIPT_DIGEST")
    expect(rollbackWorkflow).toContain("process.env.PROMOTION_FRESHNESS_RECEIPT_DIGEST")
    expect(rollbackWorkflow).toContain(
      "promoted.authorization_receipt_digest !== process.env.PROMOTION_AUTHORIZATION_DIGEST",
    )
  })
})

describe("final transition cleaner regressions", () => {
  it("requires the fetched protected default tip as current policy in promotion and rollback", () => {
    expect(promotionWorkflow).toContain(
      'test "$(git -C trusted-policy rev-parse "refs/remotes/origin/$DEFAULT_BRANCH")" = "$TRUSTED_POLICY_COMMIT"',
    )
    expect(promotionWorkflow).not.toContain(
      'merge-base --is-ancestor "$TRUSTED_POLICY_COMMIT"',
    )
    expect(rollbackWorkflow).toContain(
      'git -C "$TRUSTED_POLICY_DIR" fetch --no-tags origin "refs/heads/$DEFAULT_BRANCH:refs/remotes/protected/default"',
    )
    expect(rollbackWorkflow).toContain(
      'test "$(git -C "$TRUSTED_POLICY_DIR" rev-parse refs/remotes/protected/default)" = "$POLICY_COMMIT"',
    )
    expect(rollbackWorkflow).not.toContain(
      'merge-base --is-ancestor "$POLICY_COMMIT"',
    )
  })

  it("recovers only the exact authorized promotion without repeating the mutation", () => {
    expect(promotionWorkflow).toContain('case "$LATEST" in')
    expect(promotionWorkflow).toContain('test "$VERSION" != "$EXPECTED_PREVIOUS_LATEST"')
    expect(promotionWorkflow).toContain('"$EXPECTED_PREVIOUS_LATEST") PROMOTE_REQUIRED=true ;;')
    expect(promotionWorkflow).toContain('"$VERSION") PROMOTE_REQUIRED=false ;;')
    expect(promotionWorkflow).toContain(
      '*) echo "Latest is neither the authorized predecessor nor exact promotion version" >&2; exit 1 ;;',
    )
    expect(promotionWorkflow).toContain("if: steps.registry.outputs.promote_required == 'true'")
    expect(promotionWorkflow).toContain('echo "observed_latest=$LATEST"')
    expect(promotionWorkflow).toContain("Promotion authorization expired before registry state acceptance")
    expect(promotionWorkflow).toContain("Promotion authorization expired before completion recovery")
    expect(promotionWorkflow).toContain("const verifiedAt = new Date().toISOString()")
    expect(promotionWorkflow).toContain("verifiedAtMilliseconds > deadlineMilliseconds")
    expect(promotionWorkflow).toContain("verified_at: verifiedAt")
    expect(promotionWorkflow).toContain("PROMOTION_APPROVED_AT: ${{ steps.receipts.outputs.promotion_approved_at }}")
    expect(promotionWorkflow).toContain("verifiedAtMilliseconds < firstSeenMilliseconds")
    expect(promotionWorkflow).toContain("verifiedAtMilliseconds < promotionApprovedMilliseconds")
    expect(
      promotionWorkflow.split(
        'test "$INTEGRITY" = "${{ steps.receipts.outputs.package_integrity }}"',
      ),
    ).toHaveLength(3)
    expectBefore(promotionWorkflow, 'case "$LATEST" in', 'echo "observed_latest=$LATEST"')
    expectBefore(
      promotionWorkflow,
      "Promotion authorization expired before registry state acceptance",
      'echo "observed_latest=$LATEST"',
    )
    expectBefore(
      promotionWorkflow,
      "Promotion authorization expired before completion recovery",
      'transition: "PROMOTED_CLOSED"',
    )
    expectBefore(
      promotionWorkflow,
      "if: steps.registry.outputs.promote_required == 'true'",
      "npm dist-tag add",
    )
    expectBefore(promotionWorkflow, 'test "$LATEST" = "$VERSION"', 'transition: "PROMOTED_CLOSED"')
    const uploadCompletion = promotionWorkflow.slice(
      promotionWorkflow.indexOf("- name: Upload post-mutation promotion completion"),
    )
    expect(uploadCompletion).not.toContain("\n        if:")
    expect(uploadCompletion).toContain("path: ${{ runner.temp }}/promotion.v1.json")
  })
  it("joins every public lane to candidate-controlled integrity before exposing outputs", () => {
    expect(publicWorkflow).toContain("packageIntegrity: process.env.CANDIDATE_PACKAGE_INTEGRITY")
    expect(publicWorkflow).toContain("Installed registry integrity is unrelated to candidate receipt")
    expect(publicWorkflow).toContain("Installed registry integrity does not match the candidate receipt")
    expectBefore(publicWorkflow, "validateLaneReceipt(receipt", '"receipt_digest=$digest"')
    expectBefore(publicWorkflow, "packageIntegrity: process.env.CANDIDATE_PACKAGE_INTEGRITY", '"receipt_digest=$digest"')
  })

  it("accepts only canonical 64-byte sha512 receipt integrity values", () => {
    expect(validReceiptIntegrity(PACKAGE_INTEGRITY)).toBe(true)
    for (const forged of [
      `${PACKAGE_INTEGRITY}\nforged=true`,
      `${PACKAGE_INTEGRITY}\rforged=true`,
      ` ${PACKAGE_INTEGRITY}`,
      `${PACKAGE_INTEGRITY}\t`,
      "",
      null,
      undefined,
      "sha512-reviewed-package-integrity",
      `sha512-${Buffer.alloc(63, 7).toString("base64")}`,
      `sha256-${Buffer.alloc(64, 7).toString("base64")}`,
      `${PACKAGE_INTEGRITY.slice(0, -2)}AA`,
    ]) expect(validReceiptIntegrity(forged)).toBe(false)
    expect(promotionWorkflow).toContain("Receipt-controlled ${name} is not output-safe")
    expect(rollbackWorkflow).toContain("Receipt-controlled ${name} is not output-safe")
  })

  it("rejects forged event, release-data digest, clock, and predecessor joins", () => {
    for (const guard of [
      "payload.event_id !== freshnessPayload.event_id",
      "payload.release_data_digest_v1 !== freshnessPayload.release_data_digest_v1",
      "payload.predecessor_transition_digest !== freshnessPayload.transition_digest",
      "payload.first_seen_at !== freshnessPayload.first_seen_at",
      "payload.deadline_at !== freshnessPayload.deadline_at",
    ]) expect(promotionWorkflow).toContain(guard)
    for (const guard of [
      "payload.event_id !== promoted.event_id",
      "payload.predecessor_transition_digest !== predecessorTransitionDigest",
      "payload.release_data_digest_v1 !== promoted.release_data_digest_v1",
      "payload.first_seen_at !== promoted.first_seen_at",
      "payload.deadline_at !== promoted.deadline_at",
    ]) expect(rollbackWorkflow).toContain(guard)
  })

  it("validates and hashes only closed candidate/client transition projections", () => {
    const candidate = {
      transition_schema_version: 1,
      event_id: `source:v1:${"a".repeat(64)}`,
      predecessor_transition_digest: "b".repeat(64),
      state: "CANDIDATE_PUBLISHED",
      occurred_at: "2026-07-11T00:00:00.000Z",
      receipt_digest: "c".repeat(64),
    }
    const candidateTransitionDigest = releaseTransitionDigest(candidate)
    expect(candidateTransitionDigest).toBe(sha256Jcs(candidate))
    expect(releaseTransitionDigest(candidate, candidateTransitionDigest)).toBe(candidateTransitionDigest)

    const client = {
      transition_schema_version: 1,
      event_id: candidate.event_id,
      predecessor_transition_digest: candidateTransitionDigest,
      state: "CLIENT_VERIFIED",
      occurred_at: "2026-07-11T00:01:00.000Z",
      receipt_digest: "d".repeat(64),
    }
    const clientTransitionDigest = releaseTransitionDigest(client)
    expect(releaseTransitionDigest(client, clientTransitionDigest)).toBe(clientTransitionDigest)

    const resealedMutations = [
      { ...candidate, event_id: `source:v1:${"e".repeat(64)}` },
      { ...candidate, predecessor_transition_digest: "e".repeat(64) },
      { ...candidate, state: "CLIENT_VERIFIED" },
      { ...candidate, occurred_at: "2026-07-11T00:00:01.000Z" },
      { ...candidate, receipt_digest: "f".repeat(64) },
    ]
    for (const forged of resealedMutations) {
      const forgedDigest = sha256Jcs(forged)
      expect(releaseTransitionDigest(forged)).toBe(forgedDigest)
      expect(() => releaseTransitionDigest(forged, candidateTransitionDigest)).toThrow(
        "Receipt verification rejected",
      )
    }
    expect(() => releaseTransitionDigest(candidate, "f".repeat(64))).toThrow(
      "Receipt verification rejected",
    )
    for (const malformed of [
      { ...candidate, transition_schema_version: 2 },
      { ...candidate, event_id: `forged:v1:${"a".repeat(64)}` },
      { ...candidate, predecessor_transition_digest: "b".repeat(63) },
      { ...candidate, state: "PROMOTED_CLOSED" },
      { ...candidate, occurred_at: "2026-07-11T00:00:00Z" },
      { ...candidate, receipt_digest: "c".repeat(63) },
      { ...candidate, transition_digest: candidateTransitionDigest },
    ]) {
      expect(() => releaseTransitionDigest(malformed)).toThrow("Receipt verification rejected")
    }
  })

  it("keeps the bad release-data target distinct from closed prior-good evidence", () => {
    expect(rollbackWorkflow).toContain("release_data_digest_v1: process.env.RELEASE_DATA_DIGEST")
    expect(rollbackWorkflow).toContain("prior_good_release_data_digest_v1: process.env.PREVIOUS_RELEASE_DATA_DIGEST")
    expect(rollbackWorkflow).toContain(
      "verified.rollback_completion_payload_v1.release_data_digest_v1 !== process.env.RELEASE_DATA_DIGEST",
    )
    expect(rollbackWorkflow).toContain(
      "verified.rollback_completion_payload_v1.prior_good_release_data_digest_v1 !== process.env.PREVIOUS_RELEASE_DATA_DIGEST",
    )

    const expected = {
      release_data_digest_v1: "1".repeat(64),
      prior_good_release_data_digest_v1: "2".repeat(64),
      predecessor_receipt_digests: ["3".repeat(64), "4".repeat(64)],
    }
    expect(() => validateClosedExactFields(expected, expected)).not.toThrow()
    expect(() => validateClosedExactFields({
      ...expected,
      release_data_digest_v1: expected.prior_good_release_data_digest_v1,
      prior_good_release_data_digest_v1: expected.release_data_digest_v1,
    }, expected)).toThrow()
    expect(() => validateClosedExactFields({
      ...expected,
      predecessor_receipt_digests: [...expected.predecessor_receipt_digests].reverse(),
    }, expected)).toThrow()
  })

  it("rejects missing or wrong post-mutation bad-version deprecation evidence", () => {
    expect(rollbackWorkflow).toContain('npm view "$PACKAGE_NAME@$BAD_VERSION" deprecated --json')
    expect(rollbackWorkflow).toContain('test "$DEPRECATION" = "$EXPECTED_DEPRECATION"')
    expect(rollbackWorkflow).toContain("bad_version_deprecation: process.env.REGISTRY_DEPRECATION")
    expect(rollbackWorkflow).toContain(
      "verified.registry_verification.bad_version_deprecation !== process.env.EXPECTED_DEPRECATION",
    )
    expectBefore(
      rollbackWorkflow,
      'test "$DEPRECATION" = "$EXPECTED_DEPRECATION"',
      'transition: "ROLLBACK_REOPENED"',
    )

    const expected = {
      registry: "https://registry.npmjs.org/",
      latest_version: "0.1.0",
      package_integrity: PACKAGE_INTEGRITY,
      bad_version_deprecation: "Rolled back (regression). Use 0.1.0 or a later fixed SemVer.",
      verified_at: "2026-07-11T00:02:00.000Z",
    }
    const { bad_version_deprecation: _omitted, ...missing } = expected
    expect(() => validateClosedExactFields(missing, expected)).toThrow()
    expect(() => validateClosedExactFields({
      ...expected,
      bad_version_deprecation: "Use any version.",
    }, expected)).toThrow()
  })

  it("cannot record completion truth when either registry mutation fails", () => {
    expectBefore(promotionWorkflow, "npm dist-tag add", 'transition: "PROMOTED_CLOSED"')
    expectBefore(promotionWorkflow, 'test "$LATEST" = "$VERSION"', 'transition: "PROMOTED_CLOSED"')
    expectBefore(rollbackWorkflow, "npm dist-tag add", 'transition: "ROLLBACK_REOPENED"')
    expectBefore(rollbackWorkflow, "npm deprecate", 'transition: "ROLLBACK_REOPENED"')
    expectBefore(rollbackWorkflow, 'test "$LATEST" = "$PREVIOUS_VERSION"', 'transition: "ROLLBACK_REOPENED"')
  })
})
