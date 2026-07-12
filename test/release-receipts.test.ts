import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  canonicalizeJcs,
  validateBackendSelectionReceipt,
  validatePromotionCompletionReceipt,
  validateReleaseTransitionReceipt,
  validateVerifiedNoChangeReceipt,
} from "../src/release-receipts.ts"
import type {
  BackendApprovalV1,
  BackendDecisionPayloadV1,
  BackendSelectionReceiptV1,
  JsonValue,
  PromotionCompletionPayloadV1,
  PromotionCompletionReceiptV1,
  PromotionRegistryVerificationV1,
  ReleaseTransitionApprovalV1,
  ReleaseTransitionEvidencePayloadV1,
  ReleaseTransitionReceiptV1,
  VerifiedNoChangeApprovalV1,
  VerifiedNoChangeEvidencePayloadV1,
  VerifiedNoChangeReceiptV1,
} from "../src/release-receipts.ts"

const D = {
  a: "a".repeat(64),
  b: "b".repeat(64),
  c: "c".repeat(64),
  d: "d".repeat(64),
  e: "e".repeat(64),
  f: "f".repeat(64),
} as const
const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567"
const PACKAGE_INTEGRITY = `sha512-${Buffer.alloc(64, 7).toString("base64")}`
const ALTERNATE_PACKAGE_INTEGRITY = `sha512-${Buffer.alloc(64, 8).toString("base64")}`
const RELEASE_EVIDENCE = {
  candidate: [
    { kind: "authorization-receipt", digest: D.e },
    { kind: "registry-post-state", digest: D.b },
    { kind: "release-data", digest: D.d },
    { kind: "source-tarball", digest: D.c },
  ],
  client: [
    { kind: "actual-claude-desktop", digest: D.a },
    { kind: "generic-stdio-journey", digest: D.e },
    { kind: "public-install-macos-arm64", digest: D.b },
    { kind: "public-install-ubuntu-glibc-x64", digest: D.c },
    { kind: "public-install-windows-x64", digest: D.f },
  ],
  promotion: [
    { kind: "actual-claude-desktop", digest: D.a },
    { kind: "generic-stdio-journey", digest: D.e },
    { kind: "public-install-macos-arm64", digest: D.b },
    { kind: "public-install-ubuntu-glibc-x64", digest: D.c },
    { kind: "public-install-windows-x64", digest: D.f },
  ],
  rollback: [
    { kind: "prior-good-release", digest: D.f },
    { kind: "promotion-receipt", digest: D.e },
    { kind: "rollback-authorization", digest: D.c },
    { kind: "rollback-registry-state", digest: D.d },
  ],
} as const
const RELEASE_BINDINGS = {
  candidate: {
    "authorization-receipt": D.e,
    "registry-post-state": D.b,
    "release-data": D.d,
    "source-tarball": D.c,
  },
  client: {
    "actual-claude-desktop": D.a,
    "generic-stdio-journey": D.e,
    "public-install-macos-arm64": D.b,
    "public-install-ubuntu-glibc-x64": D.c,
    "public-install-windows-x64": D.f,
  },
  promotion: {
    "actual-claude-desktop": D.a,
    "generic-stdio-journey": D.e,
    "public-install-macos-arm64": D.b,
    "public-install-ubuntu-glibc-x64": D.c,
    "public-install-windows-x64": D.f,
  },
  rollback: {
    "prior-good-release": D.f,
    "promotion-receipt": D.e,
    "rollback-authorization": D.c,
    "rollback-registry-state": D.d,
  },
} as const


function independentCanonical(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) as string
  if (Array.isArray(value)) return `[${value.map(independentCanonical).join(",")}]`
  const objectValue = value as { readonly [key: string]: JsonValue }
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${independentCanonical(objectValue[key] as JsonValue)}`)
    .join(",")}}`
}

function digest(value: JsonValue): string {
  return createHash("sha256").update(independentCanonical(value), "utf8").digest("hex")
}

function backendReceipt(
  overrides: Partial<BackendDecisionPayloadV1> = {},
): BackendSelectionReceiptV1 {
  const payload: BackendDecisionPayloadV1 = {
    schema_version: "backend-decision-payload.v1",
    source_commit: SOURCE_COMMIT,
    sql_js_identity: "sql.js@1.13.0",
    sql_js_integrity: PACKAGE_INTEGRITY,
    lane_receipt_digests: [D.a, D.b],
    legacy_golden_digest: D.c,
    custom_path_digest: D.d,
    license_evidence_digest: D.e,
    security_evidence_digest: D.f,
    audit_evidence_digest: D.a,
    wasm_evidence_digest: D.b,
    measurement_evidence_digest: D.c,
    startup_ms: 12.5,
    rss_bytes: 1024,
    tradeoff_rationale: "Bounded read-only behavior was independently measured.",
    accepted_operational_impact: "The administrator accepts the measured startup and RSS cost.",
    decision: "select_sql_js",
    ...overrides,
  }
  const payloadDigest = digest(payload as unknown as JsonValue)
  const approval = (
    role: "architect" | "administrator",
    identity: string,
  ): BackendApprovalV1 => {
    const projection = {
      role,
      identity,
      approved_at: "2026-07-11T01:02:03.004Z",
      decision: "select_sql_js" as const,
      backend_decision_payload_digest_v1: payloadDigest,
    }
    return { ...projection, attestation_digest: digest(projection) }
  }
  const architect = approval("architect", "architecture-review")
  const administrator = approval("administrator", "release-admin")
  const projection = {
    receipt_schema_version: "backend-selection-receipt.v1" as const,
    backend_decision_payload_v1: payload,
    backend_decision_payload_digest_v1: payloadDigest,
    approvals: [architect, administrator] as const,
  }
  return {
    ...projection,
    backend_selection_receipt_digest_v1: digest(projection as unknown as JsonValue),
  }
}

export function verifiedReceipt(
  overrides: Partial<VerifiedNoChangeEvidencePayloadV1> = {},
): VerifiedNoChangeReceiptV1 {
  const payload: VerifiedNoChangeEvidencePayloadV1 = {
    schema_version: "verified-no-change-evidence-payload.v1",
    event_id: `availability:v1:${D.a}`,
    prior_transition_digest: D.b,
    first_seen_at: "2026-07-01T00:00:00.000Z",
    deadline_at: "2026-07-08T00:00:00.000Z",
    accepted_baseline_source_sha256: D.c,
    accepted_baseline_release_data_digest_v1: D.d,
    reacquired_source_sha256: D.c,
    origin_result: { status: "pass", digest: D.a },
    license_result: { status: "pass", digest: D.b },
    workbook_result: { status: "pass", digest: D.e },
    metadata_fingerprint_v1: D.f,
    run_id: "refresh-run-17",
    source_commit: SOURCE_COMMIT,
    policy_versions: [{ policy: "refresh", version: "v1" }],
    ...overrides,
  }
  const payloadDigest = digest(payload as unknown as JsonValue)
  const approvalProjection = {
    role: "administrator" as const,
    identity: "release-admin",
    approved_at: "2026-07-02T00:00:00.000Z",
    decision: "verified_no_change" as const,
    verified_no_change_evidence_digest_v1: payloadDigest,
  }
  const approval: VerifiedNoChangeApprovalV1 = {
    ...approvalProjection,
    attestation_digest: digest(approvalProjection),
  }
  const projection = {
    receipt_schema_version: "verified-no-change-receipt.v1" as const,
    verified_no_change_evidence_payload_v1: payload,
    verified_no_change_evidence_digest_v1: payloadDigest,
    approval,
  }
  return {
    ...projection,
    verified_no_change_receipt_digest_v1: digest(projection as unknown as JsonValue),
  }
}

function transitionReceipt(
  overrides: Partial<ReleaseTransitionEvidencePayloadV1> = {},
): ReleaseTransitionReceiptV1 {
  const transition = overrides.transition ?? "promotion"
  const payload: ReleaseTransitionEvidencePayloadV1 = {
    schema_version: "release-transition-evidence-payload.v1",
    transition,
    event_id: `availability:v1:${D.a}`,
    prior_transition_digest: D.b,
    first_seen_at: "2026-07-01T00:00:00.000Z",
    deadline_at: "2026-07-08T00:00:00.000Z",
    source_sha256: D.c,
    release_data_digest_v1: D.d,
    package_name: "academyinfo-mcp",
    package_version: "0.2.0",
    package_integrity: PACKAGE_INTEGRITY,
    previous_latest_version: "0.1.0",
    predecessor_receipt_digests:
      transition === "promotion" || transition === "rollback" ? [D.e, D.f] : [D.e],
    evidence_digests: overrides.evidence_digests ?? RELEASE_EVIDENCE[transition],
    run_id: "promotion-run-1",
    source_commit: SOURCE_COMMIT,
    policy_versions: [{ policy: "release", version: "v1" }],
    ...overrides,
  }
  const payloadDigest = digest(payload as unknown as JsonValue)
  const approvalProjection = {
    role: "administrator" as const,
    identity: "release-admin",
    approved_at: "2026-07-03T00:00:00.000Z",
    decision: payload.transition,
    release_transition_evidence_digest_v1: payloadDigest,
  }
  const approval: ReleaseTransitionApprovalV1 = {
    ...approvalProjection,
    attestation_digest: digest(approvalProjection),
  }
  const projection = {
    receipt_schema_version: "release-transition-receipt.v1" as const,
    release_transition_evidence_payload_v1: payload,
    release_transition_evidence_digest_v1: payloadDigest,
    approval,
  }
  return {
    ...projection,
    release_transition_receipt_digest_v1: digest(projection as unknown as JsonValue),
  }
}

function completionReceipt(
  authorization = transitionReceipt(),
  overrides: Partial<PromotionCompletionPayloadV1> = {},
  registryOverrides: Partial<PromotionRegistryVerificationV1> = {},
): PromotionCompletionReceiptV1 {
  const authorizationPayload = authorization.release_transition_evidence_payload_v1
  const payload: PromotionCompletionPayloadV1 = {
    schema_version: "promotion-completion-payload.v1",
    transition: "PROMOTED_CLOSED",
    event_id: authorizationPayload.event_id,
    prior_transition_digest: authorizationPayload.prior_transition_digest,
    first_seen_at: authorizationPayload.first_seen_at,
    deadline_at: authorizationPayload.deadline_at,
    release_data_digest_v1: authorizationPayload.release_data_digest_v1,
    package_name: authorizationPayload.package_name,
    package_version: authorizationPayload.package_version,
    package_integrity: authorizationPayload.package_integrity,
    source_commit: authorizationPayload.source_commit,
    previous_latest_version: authorizationPayload.previous_latest_version,
    predecessor_receipt_digests: [
      authorizationPayload.predecessor_receipt_digests[1] as string,
      authorizationPayload.prior_transition_digest,
    ],
    candidate_receipt_digest: authorizationPayload.predecessor_receipt_digests[0] as string,
    authorization_receipt_digest: authorization.release_transition_receipt_digest_v1,
    ...overrides,
  }
  const payloadDigest = digest(payload as unknown as JsonValue)
  const registryVerification: PromotionRegistryVerificationV1 = {
    registry: "https://registry.npmjs.org/",
    latest_version: payload.package_version,
    package_integrity: payload.package_integrity,
    verified_at: "2026-07-04T00:00:00.000Z",
    ...registryOverrides,
  }
  const projection = {
    receipt_schema_version: "promotion-completion-receipt.v1" as const,
    promotion_completion_payload_v1: payload,
    promotion_completion_payload_digest_v1: payloadDigest,
    registry_verification: registryVerification,
  }
  return {
    ...projection,
    receipt_digest_v1: digest(projection as unknown as JsonValue),
  }
}

describe("JCS and acyclic receipt topology", () => {
  it("pins UTF-16 key ordering and number/string serialization", () => {
    const vector = { z: 1e30, a: "line\n€", n: null }
    expect(canonicalizeJcs(vector)).toBe("{\"a\":\"line\\n€\",\"n\":null,\"z\":1e+30}")
  })

  it("validates two distinct backend approvals over one immutable inner digest", () => {
    const receipt = backendReceipt()
    expect(validateBackendSelectionReceipt(receipt)).toEqual({
      valid: true,
      receipt_digest: receipt.backend_selection_receipt_digest_v1,
    })

    const substituted = structuredClone(receipt) as unknown as Record<string, unknown>
    const substitutedPayload = substituted["backend_decision_payload_v1"] as Record<string, unknown>
    substitutedPayload["tradeoff_rationale"] = "Substituted after approval"
    expect(validateBackendSelectionReceipt(substituted)).toEqual({
      valid: false,
      error: "INNER_DIGEST_MISMATCH",
    })

    const singleApproval = { ...receipt, approvals: [receipt.approvals[0]] }
    expect(validateBackendSelectionReceipt(singleApproval)).toEqual({
      valid: false,
      error: "MALFORMED_RECEIPT",
    })
  })

  it("rejects resealed noncanonical release provenance", () => {
    for (const sourceCommit of [
      "0123456789abcdef",
      "g".repeat(40),
      SOURCE_COMMIT.toUpperCase(),
      ` ${SOURCE_COMMIT}`,
      `${SOURCE_COMMIT} `,
      `${SOURCE_COMMIT}\n`,
    ]) {
      expect(
        validateBackendSelectionReceipt(backendReceipt({ source_commit: sourceCommit })),
      ).toEqual({
        valid: false,
        error: "MALFORMED_RECEIPT",
      })
      expect(
        validateVerifiedNoChangeReceipt(verifiedReceipt({ source_commit: sourceCommit })),
      ).toEqual({
        valid: false,
        error: "MALFORMED_RECEIPT",
      })
      expect(
        validateReleaseTransitionReceipt(transitionReceipt({ source_commit: sourceCommit })),
      ).toEqual({
        valid: false,
        error: "MALFORMED_RECEIPT",
      })
    }

    for (const malformedIntegrity of [
      "sha512-synthetic",
      `sha512-${Buffer.alloc(63, 7).toString("base64")}`,
      `sha256-${Buffer.alloc(64, 7).toString("base64")}`,
      `${PACKAGE_INTEGRITY.slice(0, -2)}AA`,
    ]) {
      expect(
        validateBackendSelectionReceipt(backendReceipt({ sql_js_integrity: malformedIntegrity })),
      ).toEqual({ valid: false, error: "MALFORMED_RECEIPT" })
      expect(
        validateReleaseTransitionReceipt(
          transitionReceipt({ package_integrity: malformedIntegrity }),
        ),
      ).toEqual({ valid: false, error: "MALFORMED_RECEIPT" })
    }
  })

  it("rejects self-reference before accepting an otherwise closed receipt", () => {
    const receipt = backendReceipt() as unknown as Record<string, unknown>
    const payload = receipt["backend_decision_payload_v1"] as Record<string, unknown>
    payload["backend_selection_receipt_digest_v1"] = D.a
    expect(validateBackendSelectionReceipt(receipt)).toEqual({
      valid: false,
      error: "SELF_REFERENCE",
    })
  })

  it("accepts only equal-SHA, passing, administrator-attested no-change evidence", () => {
    const receipt = verifiedReceipt()
    const expected = {
      event_id: receipt.verified_no_change_evidence_payload_v1.event_id,
      prior_transition_digest:
        receipt.verified_no_change_evidence_payload_v1.prior_transition_digest,
      prior_transition_at: "2026-07-01T12:00:00.000Z",
      first_seen_at: receipt.verified_no_change_evidence_payload_v1.first_seen_at,
      deadline_at: receipt.verified_no_change_evidence_payload_v1.deadline_at,
      accepted_baseline_source_sha256:
        receipt.verified_no_change_evidence_payload_v1.accepted_baseline_source_sha256,
      accepted_baseline_release_data_digest_v1:
        receipt.verified_no_change_evidence_payload_v1.accepted_baseline_release_data_digest_v1,
      metadata_fingerprint_v1: D.f,
    }
    expect(validateVerifiedNoChangeReceipt(receipt, expected)).toEqual({
      valid: true,
      receipt_digest: receipt.verified_no_change_receipt_digest_v1,
    })
    const substitutedMetadata = verifiedReceipt({ metadata_fingerprint_v1: D.e })
    expect(validateVerifiedNoChangeReceipt(substitutedMetadata, expected)).toEqual({
      valid: false,
      error: "TRANSITION_INELIGIBLE",
    })
    expect(
      validateVerifiedNoChangeReceipt(receipt, {
        ...expected,
        prior_transition_at: "2026-07-02T00:00:00.001Z",
      }),
    ).toEqual({ valid: false, error: "APPROVAL_INVALID" })
    expect(validateVerifiedNoChangeReceipt(receipt)).toEqual({
      valid: true,
      receipt_digest: receipt.verified_no_change_receipt_digest_v1,
    })
    const changed = verifiedReceipt({ reacquired_source_sha256: D.e })
    expect(validateVerifiedNoChangeReceipt(changed)).toEqual({
      valid: false,
      error: "MALFORMED_RECEIPT",
    })
    const failedGate = structuredClone(receipt) as unknown as Record<string, unknown>
    const failedPayload = failedGate[
      "verified_no_change_evidence_payload_v1"
    ] as Record<string, unknown>
    const failedOrigin = failedPayload["origin_result"] as Record<string, unknown>
    failedOrigin["status"] = "fail"
    expect(validateVerifiedNoChangeReceipt(failedGate)).toEqual({
      valid: false,
      error: "MALFORMED_RECEIPT",
    })
  })

  it("requires release approvals and independent rollback expectations", () => {
    const receipt = transitionReceipt({
      transition: "rollback",
      package_version: "0.1.0",
      predecessor_receipt_digests: [D.e, D.f],
      evidence_digests: [
        { kind: "prior-good-release", digest: D.f },
        { kind: "promotion-receipt", digest: D.e },
        { kind: "rollback-authorization", digest: D.c },
        { kind: "rollback-registry-state", digest: D.d },
      ],
    })
    const payload = receipt.release_transition_evidence_payload_v1
    const expected = {
      transition: "rollback" as const,
      event_id: payload.event_id,
      prior_transition_digest: payload.prior_transition_digest,
      prior_transition_at: "2026-07-02T00:00:00.000Z",
      first_seen_at: payload.first_seen_at,
      deadline_at: payload.deadline_at,
      source_sha256: payload.source_sha256,
      accepted_baseline_source_sha256: D.b,
      observed_source_sha256s: [payload.source_sha256],
      release_data_digest_v1: D.d,
      package_version: "0.1.0",
      package_integrity: PACKAGE_INTEGRITY,
      predecessor_receipt_digests: [D.e, D.f],
      previous_latest_version: "0.1.0",
      evidence_digest_bindings: RELEASE_BINDINGS.rollback,
    }
    expect(validateReleaseTransitionReceipt(receipt, expected)).toEqual({
      valid: true,
      receipt_digest: receipt.release_transition_receipt_digest_v1,
    })
    expect(
      validateReleaseTransitionReceipt(receipt, {
        ...expected,
        evidence_digest_bindings: {
          ...expected.evidence_digest_bindings,
          "promotion-receipt": D.a,
        },
      }),
    ).toEqual({ valid: false, error: "TRANSITION_INELIGIBLE" })
    for (const kind of Object.keys(RELEASE_BINDINGS.rollback)) {
      expect(
        validateReleaseTransitionReceipt(receipt, {
          ...expected,
          evidence_digest_bindings: {
            ...RELEASE_BINDINGS.rollback,
            [kind]: D.a,
          },
        }),
      ).toEqual({ valid: false, error: "TRANSITION_INELIGIBLE" })
    }
    const { "rollback-registry-state": _missingBinding, ...partialBindings } =
      RELEASE_BINDINGS.rollback
    expect(
      validateReleaseTransitionReceipt(receipt, {
        ...expected,
        evidence_digest_bindings: partialBindings as never,
      }),
    ).toEqual({ valid: false, error: "TRANSITION_INELIGIBLE" })
    expect(
      validateReleaseTransitionReceipt(receipt, {
        ...expected,
        evidence_digest_bindings: {
          ...RELEASE_BINDINGS.rollback,
          "unapproved-extra": D.a,
        } as never,
      }),
    ).toEqual({ valid: false, error: "TRANSITION_INELIGIBLE" })
    expect(
      validateReleaseTransitionReceipt(receipt, {
        ...expected,
        predecessor_receipt_digests: [D.a, D.f],
      }),
    ).toEqual({ valid: false, error: "PREDECESSOR_MISMATCH" })
    expect(
      validateReleaseTransitionReceipt(receipt, {
        ...expected,
        predecessor_receipt_digests: [D.e],
      }),
    ).toEqual({ valid: false, error: "PREDECESSOR_MISMATCH" })
    expect(
      validateReleaseTransitionReceipt(receipt, {
        ...expected,
        predecessor_receipt_digests: [D.e, D.f, D.a],
      }),
    ).toEqual({ valid: false, error: "PREDECESSOR_MISMATCH" })
    expect(
      validateReleaseTransitionReceipt(receipt, {
        ...expected,
        predecessor_receipt_digests: [D.f, D.e],
      }),
    ).toEqual({ valid: false, error: "PREDECESSOR_MISMATCH" })
    expect(
      validateReleaseTransitionReceipt(receipt, {
        ...expected,
        observed_source_sha256s: [payload.source_sha256, D.f],
      }),
    ).toEqual({ valid: false, error: "TRANSITION_INELIGIBLE" })

    const substitutedClock = transitionReceipt({
      transition: "rollback",
      package_version: "0.1.0",
      first_seen_at: "2026-07-02T00:00:00.000Z",
      deadline_at: "2026-07-09T00:00:00.000Z",
    })
    expect(validateReleaseTransitionReceipt(substitutedClock, expected)).toEqual({
      valid: false,
      error: "TRANSITION_INELIGIBLE",
    })
    expect(
      validateReleaseTransitionReceipt(receipt, {
        ...expected,
        prior_transition_at: "2026-07-03T00:00:00.001Z",
      }),
    ).toEqual({ valid: false, error: "APPROVAL_INVALID" })

    expect(
      validateReleaseTransitionReceipt(receipt, {
        ...expected,
        package_integrity: ALTERNATE_PACKAGE_INTEGRITY,
      }),
    ).toEqual({ valid: false, error: "TRANSITION_INELIGIBLE" })

    const substitutedVersion = transitionReceipt({
      transition: "rollback",
      package_version: "0.1.1",
    })
    expect(validateReleaseTransitionReceipt(substitutedVersion, expected)).toEqual({
      valid: false,
      error: "TRANSITION_INELIGIBLE",
    })

    const substitutedReleaseData = transitionReceipt({
      transition: "rollback",
      package_version: "0.1.0",
      release_data_digest_v1: D.a,
    })
    expect(validateReleaseTransitionReceipt(substitutedReleaseData, expected)).toEqual({
      valid: false,
      error: "TRANSITION_INELIGIBLE",
    })
  })

  it("fixes package identity and the protected client/promotion evidence topology", () => {
    expect(validateReleaseTransitionReceipt(transitionReceipt()).valid).toBe(true)
    expect(
      validateReleaseTransitionReceipt(transitionReceipt({ package_name: "alternate-package" })),
    ).toEqual({ valid: false, error: "MALFORMED_RECEIPT" })

    const oneLane = transitionReceipt({
      transition: "client",
      evidence_digests: [RELEASE_EVIDENCE.client[0]],
    })
    expect(validateReleaseTransitionReceipt(oneLane)).toEqual({
      valid: false,
      error: "MALFORMED_RECEIPT",
    })

    const extraLane = transitionReceipt({
      evidence_digests: [
        ...RELEASE_EVIDENCE.promotion,
        { kind: "zz-unapproved-extra", digest: D.e },
      ],
    })
    expect(validateReleaseTransitionReceipt(extraLane)).toEqual({
      valid: false,
      error: "MALFORMED_RECEIPT",
    })
    expect(
      validateReleaseTransitionReceipt(
        transitionReceipt({ transition: "promotion", predecessor_receipt_digests: [D.e] }),
      ),
    ).toEqual({ valid: false, error: "MALFORMED_RECEIPT" })
    expect(
      validateReleaseTransitionReceipt(
        transitionReceipt({ transition: "candidate", predecessor_receipt_digests: [D.e, D.f] }),
      ),
    ).toEqual({ valid: false, error: "MALFORMED_RECEIPT" })
    const duplicateKind = transitionReceipt({
      transition: "rollback",
      evidence_digests: [
        RELEASE_EVIDENCE.rollback[0],
        { ...RELEASE_EVIDENCE.rollback[0] },
        ...RELEASE_EVIDENCE.rollback.slice(2),
      ],
    })
    expect(validateReleaseTransitionReceipt(duplicateKind)).toEqual({
      valid: false,
      error: "MALFORMED_RECEIPT",
    })
    for (const transition of ["candidate", "client", "promotion", "rollback"] as const) {
      const valid = transitionReceipt({
        transition,
        evidence_digests: RELEASE_EVIDENCE[transition],
      })
      expect(validateReleaseTransitionReceipt(valid).valid).toBe(true)
      const payload = valid.release_transition_evidence_payload_v1
      const expected = {
        transition,
        event_id: payload.event_id,
        prior_transition_digest: payload.prior_transition_digest,
        prior_transition_at: "2026-07-02T00:00:00.000Z",
        first_seen_at: payload.first_seen_at,
        deadline_at: payload.deadline_at,
        source_sha256: payload.source_sha256,
        accepted_baseline_source_sha256: D.b,
        observed_source_sha256s: [payload.source_sha256],
        release_data_digest_v1: payload.release_data_digest_v1,
        package_version: payload.package_version,
        package_integrity: payload.package_integrity,
        predecessor_receipt_digests: payload.predecessor_receipt_digests,
        previous_latest_version: payload.previous_latest_version,
        evidence_digest_bindings: RELEASE_BINDINGS[transition],
      }
      expect(validateReleaseTransitionReceipt(valid, expected).valid).toBe(true)
      for (const evidence of RELEASE_EVIDENCE[transition]) {
        expect(
          validateReleaseTransitionReceipt(valid, {
            ...expected,
            evidence_digest_bindings: {
              ...RELEASE_BINDINGS[transition],
              [evidence.kind]: evidence.digest === D.a ? D.b : D.a,
            } as never,
          }),
        ).toEqual({ valid: false, error: "TRANSITION_INELIGIBLE" })
      }

      const reordered = transitionReceipt({
        transition,
        evidence_digests: [...RELEASE_EVIDENCE[transition]].reverse(),
      })
      expect(validateReleaseTransitionReceipt(reordered)).toEqual({
        valid: false,
        error: "MALFORMED_RECEIPT",
      })

      const substituted = transitionReceipt({
        transition,
        evidence_digests: RELEASE_EVIDENCE[transition].map((evidence, index) =>
          index === 0 ? { kind: "substituted-kind", digest: evidence.digest } : evidence,
        ),
      })
      expect(validateReleaseTransitionReceipt(substituted)).toEqual({
        valid: false,
        error: "MALFORMED_RECEIPT",
      })
    }
  })

  it("rejects a release receipt bound to a stale historical changed checksum", () => {
    const receipt = transitionReceipt({
      transition: "candidate",
    })
    const payload = receipt.release_transition_evidence_payload_v1
    const expected = {
      transition: "candidate" as const,
      event_id: payload.event_id,
      prior_transition_digest: payload.prior_transition_digest,
      prior_transition_at: "2026-07-02T00:00:00.000Z",
      first_seen_at: payload.first_seen_at,
      deadline_at: payload.deadline_at,
      source_sha256: payload.source_sha256,
      accepted_baseline_source_sha256: D.b,
      observed_source_sha256s: [payload.source_sha256],
      release_data_digest_v1: payload.release_data_digest_v1,
      package_version: payload.package_version,
      package_integrity: payload.package_integrity,
      predecessor_receipt_digests: [D.e],
      previous_latest_version: "0.1.0",
      evidence_digest_bindings: RELEASE_BINDINGS.candidate,
    }

    expect(validateReleaseTransitionReceipt(receipt, expected).valid).toBe(true)
    expect(
      validateReleaseTransitionReceipt(receipt, {
        ...expected,
        observed_source_sha256s: [payload.source_sha256, D.f],
      }),
    ).toEqual({ valid: false, error: "TRANSITION_INELIGIBLE" })
  })
})

describe("post-mutation promotion completion receipts", () => {
  it("binds the exact authorization, lifecycle, package, predecessor, and registry state", () => {
    const authorization = transitionReceipt()
    const authorizationPayload = authorization.release_transition_evidence_payload_v1
    const completion = completionReceipt(authorization)
    const expected = {
      event_id: authorizationPayload.event_id,
      prior_transition_digest: authorizationPayload.prior_transition_digest,
      first_seen_at: authorizationPayload.first_seen_at,
      deadline_at: authorizationPayload.deadline_at,
      release_data_digest_v1: authorizationPayload.release_data_digest_v1,
      package_name: authorizationPayload.package_name,
      package_version: authorizationPayload.package_version,
      package_integrity: authorizationPayload.package_integrity,
      source_commit: authorizationPayload.source_commit,
      previous_latest_version: authorizationPayload.previous_latest_version,
      predecessor_receipt_digests: [
        authorizationPayload.predecessor_receipt_digests[1] as string,
        authorizationPayload.prior_transition_digest,
      ] as const,
      candidate_receipt_digest: authorizationPayload.predecessor_receipt_digests[0] as string,
      authorization_receipt_digest: authorization.release_transition_receipt_digest_v1,
      authorization_approved_at: authorization.approval.approved_at,
    }

    expect(validatePromotionCompletionReceipt(completion, expected).valid).toBe(true)
    for (const forged of [
      completionReceipt(authorization, { event_id: `availability:v1:${D.b}` }),
      completionReceipt(authorization, { prior_transition_digest: D.a }),
      completionReceipt(authorization, {
        first_seen_at: "2026-07-01T00:00:00.001Z",
        deadline_at: "2026-07-08T00:00:00.001Z",
      }),
      completionReceipt(authorization, { release_data_digest_v1: D.a }),
      completionReceipt(authorization, { package_version: "0.2.1" }),
      completionReceipt(authorization, { package_integrity: ALTERNATE_PACKAGE_INTEGRITY }),
      completionReceipt(authorization, {
        source_commit: "1234567890abcdef1234567890abcdef12345678",
      }),
      completionReceipt(authorization, { previous_latest_version: "0.0.9" }),
      completionReceipt(authorization, { predecessor_receipt_digests: [D.a, D.c] }),
      completionReceipt(authorization, { candidate_receipt_digest: D.a }),
      completionReceipt(authorization, { authorization_receipt_digest: D.a }),
      completionReceipt(authorization, {}, { latest_version: "0.2.1" }),
      completionReceipt(authorization, {}, { package_integrity: ALTERNATE_PACKAGE_INTEGRITY }),
      completionReceipt(authorization, {}, { verified_at: "2026-07-02T00:00:00.000Z" }),
    ]) {
      expect(validatePromotionCompletionReceipt(forged, expected)).toEqual({
        valid: false,
        error: "TRANSITION_INELIGIBLE",
      })
    }

    expect(
      validatePromotionCompletionReceipt(
        completionReceipt(authorization, { package_name: "forged-package" }),
        expected,
      ),
    ).toEqual({ valid: false, error: "MALFORMED_RECEIPT" })
    expect(
      validatePromotionCompletionReceipt(
        completionReceipt(authorization, {}, { registry: "https://registry.example/" as never }),
        expected,
      ),
    ).toEqual({ valid: false, error: "MALFORMED_RECEIPT" })
    expect(
      validatePromotionCompletionReceipt(
        completionReceipt(authorization, {}, { verified_at: "2026-07-09T00:00:00.000Z" }),
        expected,
      ),
    ).toEqual({ valid: false, error: "TRANSITION_INELIGIBLE" })
  })

  it("uses self-excluding JCS payload and receipt projections", () => {
    const completion = completionReceipt()
    const selfReferential = structuredClone(completion) as unknown as Record<string, unknown>
    const payload = selfReferential["promotion_completion_payload_v1"] as Record<string, unknown>
    payload["receipt_digest_v1"] = D.a
    expect(validatePromotionCompletionReceipt(selfReferential)).toEqual({
      valid: false,
      error: "SELF_REFERENCE",
    })

    const forgedPayload = structuredClone(completion) as unknown as Record<string, unknown>
    const forgedCompletionPayload = forgedPayload[
      "promotion_completion_payload_v1"
    ] as Record<string, unknown>
    forgedCompletionPayload["event_id"] = `availability:v1:${D.b}`
    expect(validatePromotionCompletionReceipt(forgedPayload)).toEqual({
      valid: false,
      error: "INNER_DIGEST_MISMATCH",
    })

    expect(
      validatePromotionCompletionReceipt({ ...completion, receipt_digest_v1: D.a }),
    ).toEqual({
      valid: false,
      error: "OUTER_DIGEST_MISMATCH",
    })
  })
})

describe("seed database publication safety", () => {
  it("validates and closes before same-directory staging and atomic rename with final cleanup", () => {
    const source = readFileSync(
      new URL("../scripts/seed15118998-database.ts", import.meta.url),
      "utf8",
    )
    const validateIndex = source.indexOf("assertAllDefaultIndicatorsMapped(counts)")
    const closeIndex = source.indexOf("db.close()")
    const stageIndex = source.indexOf("join(dirname(seedDbPath)")
    const copyIndex = source.indexOf("copyFileSync(tempSeedDbPath, stagedSeedDbPath)")
    const renameIndex = source.indexOf("renameSync(stagedSeedDbPath, seedDbPath)")
    const finallyIndex = source.indexOf("} finally {", renameIndex)

    expect(validateIndex).toBeGreaterThan(0)
    expect(closeIndex).toBeGreaterThan(0)
    expect(validateIndex).toBeGreaterThan(closeIndex)
    expect(stageIndex).toBeGreaterThan(validateIndex)
    expect(copyIndex).toBeGreaterThan(stageIndex)
    expect(renameIndex).toBeGreaterThan(copyIndex)
    expect(finallyIndex).toBeGreaterThan(renameIndex)
    expect(source).not.toContain("copyFileSync(tempSeedDbPath, seedDbPath)")
    expect(source.slice(finallyIndex)).toContain(
      "for (const directory of [stagingDirectory, tempDirectory])",
    )
    expect(source.slice(finallyIndex)).toContain(
      "Cleanup must not replace the seed-build or publication error.",
    )
  })
})
