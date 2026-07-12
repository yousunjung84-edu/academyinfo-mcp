import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  FAILURE_PRECEDENCE,
  advanceUnreceiptedState,
  applyReleaseTransition,
  closeVerifiedNoChange,
  fingerprintMetadata,
  observeProvisionalIncident,
  observeSourceChecksum,
  parseImfFixdate,
  parseOfficialTimestamp,
  parseRfc3339Timestamp,
  selectFailureClass,
} from "../src/freshness-events.ts"
import type {
  FreshnessIncidentV1,
  IncidentMutationResult,
  ProvisionalObservationV1,
} from "../src/freshness-events.ts"
import type {
  JsonValue,
  ReleaseTransition,
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

const A = "a".repeat(64)
const B = "b".repeat(64)
const C = "c".repeat(64)
const D = "d".repeat(64)
const E = "e".repeat(64)
const F = "f".repeat(64)
const SOURCE_COMMIT = "0123456789abcdef0123456789abcdef01234567"
const PACKAGE_INTEGRITY = `sha512-${Buffer.alloc(64, 7).toString("base64")}`
const PRIOR_GOOD_INTEGRITY = `sha512-${Buffer.alloc(64, 8).toString("base64")}`
const ALTERNATE_PACKAGE_INTEGRITY = `sha512-${Buffer.alloc(64, 9).toString("base64")}`
const NEXT_CYCLE_INTEGRITY = `sha512-${Buffer.alloc(64, 10).toString("base64")}`
const FOLLOWING_CYCLE_INTEGRITY = `sha512-${Buffer.alloc(64, 11).toString("base64")}`
const PRIOR_GOOD_VERSION = "0.1.0"
const PRIOR_GOOD_RELEASE_DATA_DIGEST = A
const REGISTRY_BINDING = {
  expected_previous_latest_version: PRIOR_GOOD_VERSION,
  candidate_authorization_receipt_digest: A,
  candidate_evidence_digest_bindings: {
    "authorization-receipt": A,
    "registry-post-state": B,
    "release-data": D,
    "source-tarball": E,
  },
  client_evidence_digest_bindings: {
    "actual-claude-desktop": A,
    "generic-stdio-journey": F,
    "public-install-macos-arm64": B,
    "public-install-ubuntu-glibc-x64": C,
    "public-install-windows-x64": E,
  },
  promotion_evidence_digest_bindings: {
    "actual-claude-desktop": A,
    "generic-stdio-journey": F,
    "public-install-macos-arm64": B,
    "public-install-ubuntu-glibc-x64": C,
    "public-install-windows-x64": E,
  },
} as const
const RELEASE_EVIDENCE = {
  candidate: [
    { kind: "authorization-receipt", digest: A },
    { kind: "registry-post-state", digest: B },
    { kind: "release-data", digest: D },
    { kind: "source-tarball", digest: E },
  ],
  client: [
    { kind: "actual-claude-desktop", digest: A },
    { kind: "generic-stdio-journey", digest: F },
    { kind: "public-install-macos-arm64", digest: B },
    { kind: "public-install-ubuntu-glibc-x64", digest: C },
    { kind: "public-install-windows-x64", digest: E },
  ],
  promotion: [
    { kind: "actual-claude-desktop", digest: A },
    { kind: "generic-stdio-journey", digest: F },
    { kind: "public-install-macos-arm64", digest: B },
    { kind: "public-install-ubuntu-glibc-x64", digest: C },
    { kind: "public-install-windows-x64", digest: E },
  ],
  rollback: [
    { kind: "prior-good-release", digest: A },
    { kind: "promotion-receipt", digest: B },
    { kind: "rollback-authorization", digest: C },
    { kind: "rollback-registry-state", digest: D },
  ],
} as const

function canonical(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) as string
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  const objectValue = value as { readonly [key: string]: JsonValue }
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(objectValue[key] as JsonValue)}`)
    .join(",")}}`
}

function hash(value: JsonValue): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex")
}

function incidentFrom(result: IncidentMutationResult): FreshnessIncidentV1 {
  if (!result.applied) throw new Error(`Expected applied incident, received ${result.error}`)
  return result.incident
}

function expectRejectedWithoutMutation(
  incident: FreshnessIncidentV1,
  apply: () => IncidentMutationResult,
): void {
  const before = structuredClone(incident)
  expect(apply()).toEqual({ applied: false, error: "RECEIPT_INVALID" })
  expect(incident).toEqual(before)
}

function observation(
  overrides: Partial<ProvisionalObservationV1> = {},
): ProvisionalObservationV1 {
  return {
    event_id_schema_version: 1,
    dataset_id: "15118998",
    canonical_page_url: "https://example.go.kr/dataset/15118998",
    metadata_fingerprint_v1: A,
    last_accepted_source_sha256: B,
    last_accepted_release_data_digest_v1: C,
    observed_at: "2026-07-01T00:00:00.000Z",
    observed_failures: ["PAGE_UNREACHABLE"],
    ...overrides,
  }
}

function noChangeReceipt(
  incident: FreshnessIncidentV1,
  overrides: Partial<VerifiedNoChangeEvidencePayloadV1> = {},
  approvedAt = "2026-07-02T00:00:00.000Z",
): VerifiedNoChangeReceiptV1 {
  const payload: VerifiedNoChangeEvidencePayloadV1 = {
    schema_version: "verified-no-change-evidence-payload.v1",
    event_id: incident.original_event_id,
    prior_transition_digest: incident.transition_digest,
    first_seen_at: incident.first_seen_at,
    deadline_at: incident.deadline_at,
    accepted_baseline_source_sha256: B,
    accepted_baseline_release_data_digest_v1: C,
    reacquired_source_sha256: B,
    origin_result: { status: "pass", digest: D },
    license_result: { status: "pass", digest: E },
    workbook_result: { status: "pass", digest: F },
    metadata_fingerprint_v1: A,
    run_id: "refresh-17",
    source_commit: SOURCE_COMMIT,
    policy_versions: [{ policy: "refresh", version: "v1" }],
    ...overrides,
  }
  const payloadDigest = hash(payload as unknown as JsonValue)
  const approvalProjection = {
    role: "administrator" as const,
    identity: "synthetic-test-admin",
    approved_at: approvedAt,
    decision: "verified_no_change" as const,
    verified_no_change_evidence_digest_v1: payloadDigest,
  }
  const approval: VerifiedNoChangeApprovalV1 = {
    ...approvalProjection,
    attestation_digest: hash(approvalProjection),
  }
  const projection = {
    receipt_schema_version: "verified-no-change-receipt.v1" as const,
    verified_no_change_evidence_payload_v1: payload,
    verified_no_change_evidence_digest_v1: payloadDigest,
    approval,
  }
  return {
    ...projection,
    verified_no_change_receipt_digest_v1: hash(projection as unknown as JsonValue),
  }
}

function releaseReceipt(
  incident: FreshnessIncidentV1,
  transition: ReleaseTransition,
  approvedAt: string,
  overrides: Partial<ReleaseTransitionEvidencePayloadV1> = {},
): ReleaseTransitionReceiptV1 {
  const previous = incident.receipt_digests[incident.receipt_digests.length - 1]
  const predecessorReceiptDigests =
    overrides.predecessor_receipt_digests ??
    (transition === "candidate"
      ? [REGISTRY_BINDING.candidate_authorization_receipt_digest]
      : transition === "promotion"
        ? incident.receipt_digests.slice(incident.release_cycle_start_index)
        : transition === "rollback"
          ? [previous ?? incident.transition_digest, F]
          : [previous ?? incident.transition_digest])
  const releaseDataDigest =
    overrides.release_data_digest_v1 ?? (transition === "rollback" ? A : D)
  const evidenceDigests =
    overrides.evidence_digests ??
    (transition === "candidate"
      ? [
          { kind: "authorization-receipt", digest: predecessorReceiptDigests[0] as string },
          { kind: "registry-post-state", digest: B },
          { kind: "release-data", digest: releaseDataDigest },
          { kind: "source-tarball", digest: E },
        ]
      : transition === "rollback"
        ? [
            { kind: "prior-good-release", digest: predecessorReceiptDigests[1] as string },
            { kind: "promotion-receipt", digest: predecessorReceiptDigests[0] as string },
            { kind: "rollback-authorization", digest: C },
            { kind: "rollback-registry-state", digest: D },
          ]
        : RELEASE_EVIDENCE[transition])
  const payload: ReleaseTransitionEvidencePayloadV1 = {
    schema_version: "release-transition-evidence-payload.v1",
    transition,
    event_id: incident.original_event_id,
    prior_transition_digest: incident.transition_digest,
    first_seen_at: incident.first_seen_at,
    deadline_at: incident.deadline_at,
    source_sha256: C,
    release_data_digest_v1: releaseDataDigest,
    package_name: "academyinfo-mcp",
    package_version: transition === "rollback" ? "0.1.0" : "0.2.0",
    package_integrity: transition === "rollback" ? PRIOR_GOOD_INTEGRITY : PACKAGE_INTEGRITY,
    previous_latest_version: PRIOR_GOOD_VERSION,
    predecessor_receipt_digests: predecessorReceiptDigests,
    evidence_digests: evidenceDigests,
    run_id: `${transition}-run-1`,
    source_commit: SOURCE_COMMIT,
    policy_versions: [{ policy: "release", version: "v1" }],
    ...overrides,
  }
  const payloadDigest = hash(payload as unknown as JsonValue)
  const approvalProjection = {
    role: "administrator" as const,
    identity: "synthetic-test-admin",
    approved_at: approvedAt,
    decision: transition,
    release_transition_evidence_digest_v1: payloadDigest,
  }
  const approval: ReleaseTransitionApprovalV1 = {
    ...approvalProjection,
    attestation_digest: hash(approvalProjection),
  }
  const projection = {
    receipt_schema_version: "release-transition-receipt.v1" as const,
    release_transition_evidence_payload_v1: payload,
    release_transition_evidence_digest_v1: payloadDigest,
    approval,
  }
  return {
    ...projection,
    release_transition_receipt_digest_v1: hash(projection as unknown as JsonValue),
  }
}

function promotionCompletionReceipt(
  incident: FreshnessIncidentV1,
  authorization: ReleaseTransitionReceiptV1,
  verifiedAt: string,
  overrides: Partial<PromotionCompletionPayloadV1> = {},
  registryOverrides: Partial<PromotionRegistryVerificationV1> = {},
): PromotionCompletionReceiptV1 {
  const authorizationPayload = authorization.release_transition_evidence_payload_v1
  const cycleReceipts = incident.receipt_digests.slice(incident.release_cycle_start_index)
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
      cycleReceipts[1] as string,
      authorizationPayload.prior_transition_digest,
    ],
    candidate_receipt_digest: cycleReceipts[0] as string,
    authorization_receipt_digest: authorization.release_transition_receipt_digest_v1,
    ...overrides,
  }
  const payloadDigest = hash(payload as unknown as JsonValue)
  const registryVerification: PromotionRegistryVerificationV1 = {
    registry: "https://registry.npmjs.org/",
    latest_version: payload.package_version,
    package_integrity: payload.package_integrity,
    verified_at: verifiedAt,
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
    receipt_digest_v1: hash(projection as unknown as JsonValue),
  }
}

describe("exact freshness timestamp and failure authority", () => {
  it("normalizes explicit RFC 3339 offsets and IMF-fixdate to millisecond UTC", () => {
    expect(parseRfc3339Timestamp("2026-07-11T12:34:56.789+09:00")).toBe(
      "2026-07-11T03:34:56.789Z",
    )
    expect(parseRfc3339Timestamp("2024-02-29T00:00:00Z")).toBe(
      "2024-02-29T00:00:00.000Z",
    )
    expect(parseImfFixdate("Sun, 06 Nov 1994 08:49:37 GMT")).toBe(
      "1994-11-06T08:49:37.000Z",
    )
  })

  it("rejects invalid calendar, weekday, zone, precision, and zone-less values", () => {
    const invalid = [
      "2025-02-29T00:00:00Z",
      "2026-01-01T00:00:00.1234Z",
      "2026-01-01T00:00:00",
      "2026-01-01T00:00:00+24:00",
    ]
    for (const value of invalid) expect(parseRfc3339Timestamp(value)).toBeNull()
    expect(parseImfFixdate("Mon, 06 Nov 1994 08:49:37 GMT")).toBeNull()
    expect(parseOfficialTimestamp("not-a-date")).toEqual({
      normalized: null,
      evidence_code: "INVALID_OFFICIAL_TIMESTAMP",
      failure_class: "PAGE_METADATA_INVALID",
    })
  })

  it("pins every failure literal and total first-match precedence", () => {
    expect(FAILURE_PRECEDENCE).toHaveLength(13)
    for (const failure of FAILURE_PRECEDENCE) expect(selectFailureClass([failure])).toBe(failure)
    expect(selectFailureClass(["DOWNLOAD_ARCHIVE_INVALID", "PAGE_HTTP_ERROR", "DOWNLOAD_TIMEOUT"])).toBe(
      "PAGE_HTTP_ERROR",
    )
    expect(selectFailureClass([])).toBeNull()
  })

  it("rejects empty, unknown, and mixed known/unknown failure observations without mutation", () => {
    for (const observedFailures of [
      [],
      ["UNSUPPORTED_FAILURE"],
      ["PAGE_HTTP_ERROR", "UNSUPPORTED_FAILURE"],
    ]) {
      expect(
        observeProvisionalIncident(
          [],
          observation({ observed_failures: observedFailures as never }),
        ),
      ).toEqual({ applied: false, error: "INVALID_OBSERVATION" })
    }

    expect(
      incidentFrom(
        observeProvisionalIncident(
          [],
          observation({
            observed_failures: ["DOWNLOAD_TIMEOUT", "PAGE_HTTP_ERROR"],
          }),
        ),
      ).observed_failure_classes,
    ).toEqual(["PAGE_HTTP_ERROR"])
  })
})

describe("metadata fingerprint and immutable incident clock", () => {
  it("normalizes the closed metadata projection and keeps invalid official dates as null", () => {
    const valid = fingerprintMetadata({
      dataset_id: "15118998",
      canonical_page_url: "https://EXAMPLE.go.kr:443/a/../dataset/%7eone?ignored=yes#ignored",
      source_filename: " workbook.xlsx ",
      official_modified_at: "2026-07-11T09:00:00+09:00",
      record_version: " 17 ",
      license: "KOGL-1",
      download_url: "https://DATA.example.go.kr:443/files/%7ebook.xlsx?signature=secret",
      advertised_size: 1024,
      etag: " tag-17 ",
      last_modified: "Sat, 11 Jul 2026 00:00:00 GMT",
    })
    expect(valid.valid).toBe(true)
    if (!valid.valid) throw new Error("Expected valid metadata vector")
    expect(valid.projection).toEqual({
      schema_version: 1,
      dataset_id: "15118998",
      canonical_page_url: "https://example.go.kr/dataset/~one",
      source_filename: "workbook.xlsx",
      official_modified_at: "2026-07-11T00:00:00.000Z",
      record_version: "17",
      license: "KOGL-1",
      download_origin: "https://data.example.go.kr",
      download_path: "/files/~book.xlsx",
      advertised_size: 1024,
      etag: "tag-17",
      last_modified: "2026-07-11T00:00:00.000Z",
    })

    const invalid = fingerprintMetadata({
      dataset_id: "15118998",
      canonical_page_url: "https://example.go.kr/dataset/15118998",
      source_filename: null,
      official_modified_at: "2025-02-29T00:00:00Z",
      record_version: null,
      license: null,
      download_url: null,
      advertised_size: null,
      etag: null,
      last_modified: null,
    })
    expect(invalid.valid).toBe(false)
    expect(invalid.projection?.official_modified_at).toBeNull()
    expect(invalid.metadata_fingerprint_v1).toMatch(/^[0-9a-f]{64}$/)
  })

  it("aliases metadata, ETag, and failure drift to the earliest open incident", () => {
    const first = incidentFrom(observeProvisionalIncident([], observation()))
    expect(first.last_transition_at).toBe("2026-07-01T00:00:00.000Z")
    const drift = incidentFrom(
      observeProvisionalIncident(
        [first],
        observation({
          metadata_fingerprint_v1: F,
          observed_at: "2026-07-02T00:00:00.000Z",
          observed_failures: ["DOWNLOAD_TIMEOUT"],
        }),
      ),
    )
    expect(drift.original_event_id).toBe(first.original_event_id)
    expect(drift.first_seen_at).toBe("2026-07-01T00:00:00.000Z")
    expect(drift.deadline_at).toBe("2026-07-08T00:00:00.000Z")
    expect(drift.metadata_fingerprint_aliases).toEqual([A, F])
    expect(drift.observed_failure_classes).toEqual(["PAGE_UNREACHABLE", "DOWNLOAD_TIMEOUT"])
    expect(drift.event_id_aliases).toHaveLength(2)
    expect(drift.last_transition_at).toBe("2026-07-02T00:00:00.000Z")
    expect(
      observeProvisionalIncident(
        [drift],
        observation({
          metadata_fingerprint_v1: E,
          observed_at: "2026-07-01T23:59:59.999Z",
          observed_failures: ["DOWNLOAD_HTTP_ERROR"],
        }),
      ),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
  })

  it("moves independently observed metadata back to current without duplicating audit aliases", () => {
    const opened = incidentFrom(observeProvisionalIncident([], observation()))
    const drifted = incidentFrom(
      observeProvisionalIncident(
        [opened],
        observation({
          metadata_fingerprint_v1: F,
          observed_at: "2026-07-01T01:00:00.000Z",
        }),
      ),
    )
    const returned = incidentFrom(
      observeProvisionalIncident(
        [drifted],
        observation({
          metadata_fingerprint_v1: A,
          observed_at: "2026-07-01T02:00:00.000Z",
        }),
      ),
    )

    expect(returned.metadata_fingerprint_aliases).toEqual([F, A])
    expect(new Set(returned.metadata_fingerprint_aliases).size).toBe(2)
    expect(returned.event_id_aliases).toHaveLength(2)
    expect(returned.last_transition_at).toBe("2026-07-01T02:00:00.000Z")

    const equalObserved = incidentFrom(
      observeSourceChecksum(returned, B, "2026-07-01T03:00:00.000Z"),
    )
    expect(
      closeVerifiedNoChange(
        equalObserved,
        noChangeReceipt(equalObserved, { metadata_fingerprint_v1: F }),
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    expect(incidentFrom(closeVerifiedNoChange(equalObserved, noChangeReceipt(equalObserved))).state).toBe(
      "VERIFIED_NO_CHANGE_CLOSED",
    )
  })

  it("treats an independently observed null metadata fingerprint as current", () => {
    const opened = incidentFrom(observeProvisionalIncident([], observation()))
    const unavailableMetadata = incidentFrom(
      observeProvisionalIncident(
        [opened],
        observation({
          metadata_fingerprint_v1: null,
          observed_at: "2026-07-01T01:00:00.000Z",
          observed_failures: ["PAGE_METADATA_INVALID"],
        }),
      ),
    )

    expect(unavailableMetadata.current_metadata_fingerprint_v1).toBeNull()
    expect(unavailableMetadata.metadata_fingerprint_aliases).toEqual([A])

    const equalObserved = incidentFrom(
      observeSourceChecksum(unavailableMetadata, B, "2026-07-01T02:00:00.000Z"),
    )
    expect(closeVerifiedNoChange(equalObserved, noChangeReceipt(equalObserved))).toEqual({
      applied: false,
      error: "TRANSITION_INELIGIBLE",
    })
  })

  it("writes no state for offset, missing-millisecond, or otherwise invalid workflow timestamps", () => {
    for (const observedAt of [
      "2026-07-01T00:00:00+00:00",
      "2026-07-01T00:00:00Z",
      "2026-07-01 00:00:00",
    ]) {
      expect(observeProvisionalIncident([], observation({ observed_at: observedAt }))).toEqual({
        applied: false,
        error: "INVALID_WORKFLOW_TIME",
      })
    }

    const opened = incidentFrom(observeProvisionalIncident([], observation()))
    expect(observeSourceChecksum(opened, B, "2026-07-01T12:00:00+00:00")).toEqual({
      applied: false,
      error: "INVALID_WORKFLOW_TIME",
    })
    const changed = incidentFrom(observeSourceChecksum(opened, C, "2026-07-01T12:00:00.000Z"))
    expect(advanceUnreceiptedState(changed, "VALIDATED", "2026-07-02T00:00:00Z")).toEqual({
      applied: false,
      error: "INVALID_WORKFLOW_TIME",
    })
  })
})

describe("no-change, changed promotion, and rollback lifecycle", () => {
  it("closes equal SHA only with the matching receipt and is idempotent", () => {
    const opened = incidentFrom(observeProvisionalIncident([], observation()))
    const equalObserved = incidentFrom(
      observeSourceChecksum(opened, B, "2026-07-01T12:00:00.000Z"),
    )
    expect(equalObserved.last_transition_at).toBe("2026-07-01T12:00:00.000Z")
    expect(
      observeSourceChecksum(equalObserved, A, "2026-07-01T11:59:59.999Z"),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    const receipt = noChangeReceipt(equalObserved)
    const substitutedClock = noChangeReceipt(equalObserved, {
      first_seen_at: "2026-07-02T00:00:00.000Z",
      deadline_at: "2026-07-09T00:00:00.000Z",
    })
    expect(closeVerifiedNoChange(equalObserved, substitutedClock)).toEqual({
      applied: false,
      error: "RECEIPT_INVALID",
    })
    expect(
      closeVerifiedNoChange(
        equalObserved,
        noChangeReceipt(equalObserved, { metadata_fingerprint_v1: F }),
      ),
    ).toEqual({
      applied: false,
      error: "RECEIPT_INVALID",
    })
    expect(
      closeVerifiedNoChange(
        equalObserved,
        noChangeReceipt(equalObserved, {}, "2026-07-01T11:59:59.999Z"),
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    const closed = incidentFrom(closeVerifiedNoChange(equalObserved, receipt))
    expect(closed.state).toBe("VERIFIED_NO_CHANGE_CLOSED")
    expect(closed.last_transition_at).toBe("2026-07-02T00:00:00.000Z")
    expect(closed.first_seen_at).toBe(opened.first_seen_at)
    expect(closed.deadline_at).toBe(opened.deadline_at)
    expect(closeVerifiedNoChange(closed, receipt)).toEqual({
      applied: true,
      incident: closed,
      changed: false,
    })

    const corruptedReplay = structuredClone(receipt) as unknown as Record<string, unknown>
    const corruptedPayload = corruptedReplay[
      "verified_no_change_evidence_payload_v1"
    ] as Record<string, unknown>
    corruptedPayload["run_id"] = "substituted-after-close"
    expect(closeVerifiedNoChange(closed, corruptedReplay as unknown as VerifiedNoChangeReceiptV1)).toEqual({
      applied: false,
      error: "RECEIPT_INVALID",
    })
  })

  it("uses the latest changed checksum for release and keeps exact current replay idempotent", () => {
    const opened = incidentFrom(observeProvisionalIncident([], observation()))
    const firstChanged = incidentFrom(
      observeSourceChecksum(opened, C, "2026-07-01T12:00:00.000Z"),
    )
    const latestChanged = incidentFrom(
      observeSourceChecksum(firstChanged, D, "2026-07-01T13:00:00.000Z"),
    )

    expect(latestChanged.observed_source_sha256s).toEqual([C, D])
    expect(observeSourceChecksum(latestChanged, D, "2026-07-01T14:00:00.000Z")).toEqual({
      applied: true,
      incident: latestChanged,
      changed: false,
    })
    expect(
      observeSourceChecksum(latestChanged, C, "2026-07-01T12:59:59.999Z"),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })

    const validated = incidentFrom(
      advanceUnreceiptedState(latestChanged, "VALIDATED", "2026-07-02T00:00:00.000Z"),
    )
    expect(
      applyReleaseTransition(
        validated,
        releaseReceipt(validated, "candidate", "2026-07-03T00:00:00.000Z", { source_sha256: D }),
        REGISTRY_BINDING,
      ),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    const prOpen = incidentFrom(
      advanceUnreceiptedState(validated, "PR_OPEN", "2026-07-02T06:00:00.000Z"),
    )
    const merged = incidentFrom(
      advanceUnreceiptedState(prOpen, "MERGED", "2026-07-02T12:00:00.000Z"),
    )
    expect(
      applyReleaseTransition(
        merged,
        releaseReceipt(merged, "candidate", "2026-07-03T00:00:00.000Z"),
        REGISTRY_BINDING,
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })

    const currentReceipt = releaseReceipt(
      merged,
      "candidate",
      "2026-07-03T00:00:00.000Z",
      { source_sha256: D },
    )
    expect(
      incidentFrom(applyReleaseTransition(merged, currentReceipt, REGISTRY_BINDING)).state,
    ).toBe("CANDIDATE_PUBLISHED")
  })

  it("moves a revisited historical checksum to current with a new monotonic transition", () => {
    const opened = incidentFrom(observeProvisionalIncident([], observation()))
    const first = incidentFrom(observeSourceChecksum(opened, C, "2026-07-01T12:00:00.000Z"))
    const second = incidentFrom(observeSourceChecksum(first, D, "2026-07-01T13:00:00.000Z"))
    const revisited = incidentFrom(
      observeSourceChecksum(second, C, "2026-07-01T14:00:00.000Z"),
    )

    expect(revisited.observed_source_sha256s).toEqual([D, C])
    expect(new Set(revisited.observed_source_sha256s).size).toBe(2)
    expect(revisited.event_id_aliases.filter((alias) => alias.startsWith("source:v1:"))).toHaveLength(
      2,
    )
    expect(revisited.last_transition_at).toBe("2026-07-01T14:00:00.000Z")
    expect(revisited.transition_digest).not.toBe(second.transition_digest)
    expect(observeSourceChecksum(revisited, C, "2026-07-01T15:00:00.000Z")).toEqual({
      applied: true,
      incident: revisited,
      changed: false,
    })
  })

  it("recovers a blocked changed-source incident through revalidation and the PR chain", () => {
    const opened = incidentFrom(observeProvisionalIncident([], observation()))
    const changed = incidentFrom(observeSourceChecksum(opened, C, "2026-07-01T12:00:00.000Z"))
    const blocked = incidentFrom(
      advanceUnreceiptedState(changed, "BLOCKED", "2026-07-01T13:00:00.000Z"),
    )

    expect(
      advanceUnreceiptedState(blocked, "PR_OPEN", "2026-07-01T14:00:00.000Z"),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })

    const validated = incidentFrom(
      advanceUnreceiptedState(blocked, "VALIDATED", "2026-07-01T14:00:00.000Z"),
    )
    const prOpen = incidentFrom(
      advanceUnreceiptedState(validated, "PR_OPEN", "2026-07-01T15:00:00.000Z"),
    )
    const merged = incidentFrom(
      advanceUnreceiptedState(prOpen, "MERGED", "2026-07-01T16:00:00.000Z"),
    )
    expect(merged.state).toBe("MERGED")
  })

  it("does not let a historical changed checksum override a current baseline observation", () => {
    const opened = incidentFrom(observeProvisionalIncident([], observation()))
    const changed = incidentFrom(observeSourceChecksum(opened, C, "2026-07-01T12:00:00.000Z"))
    const baselineReturned = incidentFrom(
      observeSourceChecksum(changed, B, "2026-07-01T13:00:00.000Z"),
    )

    expect(baselineReturned.observed_source_sha256s).toEqual([C, B])
    expect(closeVerifiedNoChange(baselineReturned, noChangeReceipt(baselineReturned))).toEqual({
      applied: false,
      error: "TRANSITION_INELIGIBLE",
    })

    const validated = incidentFrom(
      advanceUnreceiptedState(baselineReturned, "VALIDATED", "2026-07-02T00:00:00.000Z"),
    )
    const prOpen = incidentFrom(
      advanceUnreceiptedState(validated, "PR_OPEN", "2026-07-02T06:00:00.000Z"),
    )
    const merged = incidentFrom(
      advanceUnreceiptedState(prOpen, "MERGED", "2026-07-02T12:00:00.000Z"),
    )
    expect(
      applyReleaseTransition(
        merged,
        releaseReceipt(merged, "candidate", "2026-07-03T00:00:00.000Z"),
        REGISTRY_BINDING,
      ),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
  })

  it("forbids no-change after a differing SHA and closes changed data only at promotion", () => {
    const opened = incidentFrom(observeProvisionalIncident([], observation()))
    const changed = incidentFrom(observeSourceChecksum(opened, C, "2026-07-01T12:00:00.000Z"))
    expect(changed.kind).toBe("changed_source")
    expect(changed.last_transition_at).toBe("2026-07-01T12:00:00.000Z")
    expect(
      advanceUnreceiptedState(changed, "VALIDATED", "2026-07-01T11:59:59.999Z"),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    expect(closeVerifiedNoChange(changed, noChangeReceipt(changed))).toEqual({
      applied: false,
      error: "TRANSITION_INELIGIBLE",
    })
    expect(
      advanceUnreceiptedState(changed, "MERGED", "2026-07-02T00:00:00.000Z"),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    let current = incidentFrom(
      advanceUnreceiptedState(changed, "VALIDATED", "2026-07-02T00:00:00.000Z"),
    )
    expect(
      applyReleaseTransition(
        current,
        releaseReceipt(current, "candidate", "2026-07-03T00:00:00.000Z"),
        REGISTRY_BINDING,
      ),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    current = incidentFrom(
      advanceUnreceiptedState(current, "PR_OPEN", "2026-07-02T06:00:00.000Z"),
    )
    current = incidentFrom(
      advanceUnreceiptedState(current, "MERGED", "2026-07-02T12:00:00.000Z"),
    )
    expect(current.last_transition_at).toBe("2026-07-02T12:00:00.000Z")
    expect(
      applyReleaseTransition(
        current,
        releaseReceipt(current, "candidate", "2026-07-01T23:59:59.999Z"),
        REGISTRY_BINDING,
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    const candidate = releaseReceipt(current, "candidate", "2026-07-03T00:00:00.000Z")
    const substitutedClock = releaseReceipt(
      current,
      "candidate",
      "2026-07-03T00:00:00.000Z",
      {
        first_seen_at: "2026-07-02T00:00:00.000Z",
        deadline_at: "2026-07-09T00:00:00.000Z",
      },
    )
    expect(applyReleaseTransition(current, substitutedClock, REGISTRY_BINDING)).toEqual({
      applied: false,
      error: "RECEIPT_INVALID",
    })
    expect(applyReleaseTransition(current, candidate, undefined as never)).toEqual({
      applied: false,
      error: "TRANSITION_INELIGIBLE",
    })
    expect(
      applyReleaseTransition(current, candidate, {
        ...REGISTRY_BINDING,
        expected_previous_latest_version: "0.0.9",
      }),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    expect(
      applyReleaseTransition(current, candidate, {
        ...REGISTRY_BINDING,
        candidate_authorization_receipt_digest: B,
      }),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    const { "source-tarball": _missingCandidateBinding, ...partialCandidateBindings } =
      REGISTRY_BINDING.candidate_evidence_digest_bindings
    expect(
      applyReleaseTransition(current, candidate, {
        ...REGISTRY_BINDING,
        candidate_evidence_digest_bindings: partialCandidateBindings as never,
      }),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    expect(
      applyReleaseTransition(current, candidate, {
        ...REGISTRY_BINDING,
        candidate_evidence_digest_bindings: {
          ...REGISTRY_BINDING.candidate_evidence_digest_bindings,
          "registry-post-state": C,
        },
      }),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    expect(
      applyReleaseTransition(
        current,
        releaseReceipt(current, "candidate", "2026-07-03T00:00:00.000Z", {
          predecessor_receipt_digests: [
            REGISTRY_BINDING.candidate_authorization_receipt_digest,
            B,
          ],
        }),
        REGISTRY_BINDING,
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    current = incidentFrom(applyReleaseTransition(current, candidate, REGISTRY_BINDING))
    expect(current.bound_previous_latest_version).toBe(PRIOR_GOOD_VERSION)
    expect(current.state).toBe("CANDIDATE_PUBLISHED")
    expect(current.last_transition_at).toBe("2026-07-03T00:00:00.000Z")
    expect(
      advanceUnreceiptedState(current, "VALIDATED", "2026-07-03T12:00:00.000Z"),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    expect(applyReleaseTransition(current, candidate, REGISTRY_BINDING)).toEqual({
      applied: true,
      incident: current,
      changed: false,
    })
    const corruptedReplay = structuredClone(candidate) as unknown as Record<string, unknown>
    const corruptedPayload = corruptedReplay[
      "release_transition_evidence_payload_v1"
    ] as Record<string, unknown>
    corruptedPayload["run_id"] = "substituted-after-publish"
    expect(
      applyReleaseTransition(
        current,
        corruptedReplay as unknown as ReleaseTransitionReceiptV1,
        REGISTRY_BINDING,
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    const client = releaseReceipt(current, "client", "2026-07-04T00:00:00.000Z")
    expect(
      applyReleaseTransition(
        current,
        releaseReceipt(current, "client", "2026-07-04T00:00:00.000Z", {
          predecessor_receipt_digests: [...current.receipt_digests, B],
        }),
        REGISTRY_BINDING,
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    const pollutedCandidateHistory = {
      ...current,
      receipt_digests: [...current.receipt_digests, B],
    }
    expect(applyReleaseTransition(pollutedCandidateHistory, client, REGISTRY_BINDING)).toEqual({
      applied: false,
      error: "TRANSITION_INELIGIBLE",
    })
    expect(
      applyReleaseTransition(
        current,
        releaseReceipt(current, "client", "2026-07-02T23:59:59.999Z"),
        REGISTRY_BINDING,
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    const { "actual-claude-desktop": _missingClientBinding, ...partialClientBindings } =
      REGISTRY_BINDING.client_evidence_digest_bindings
    expect(
      applyReleaseTransition(current, client, {
        ...REGISTRY_BINDING,
        client_evidence_digest_bindings: partialClientBindings as never,
      }),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    current = incidentFrom(applyReleaseTransition(current, client, REGISTRY_BINDING))
    expect(current.state).toBe("CLIENT_VERIFIED")
    expect(current.last_transition_at).toBe("2026-07-04T00:00:00.000Z")
    expect(
      advanceUnreceiptedState(current, "MERGED", "2026-07-04T12:00:00.000Z"),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    const promotion = releaseReceipt(current, "promotion", "2026-07-05T00:00:00.000Z")
    const completion = promotionCompletionReceipt(
      current,
      promotion,
      "2026-07-05T01:00:00.000Z",
    )
    const reorderedPromotionPredecessors = releaseReceipt(
      current,
      "promotion",
      "2026-07-05T00:00:00.000Z",
      { predecessor_receipt_digests: [...current.receipt_digests].reverse() },
    )
    expect(
      applyReleaseTransition(
        current,
        reorderedPromotionPredecessors,
        REGISTRY_BINDING,
        undefined,
        promotionCompletionReceipt(
          current,
          reorderedPromotionPredecessors,
          "2026-07-05T01:00:00.000Z",
        ),
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    const substitutedPromotionPredecessor = releaseReceipt(
      current,
      "promotion",
      "2026-07-05T00:00:00.000Z",
      { predecessor_receipt_digests: [current.receipt_digests[0] as string, B] },
    )
    expect(
      applyReleaseTransition(
        current,
        substitutedPromotionPredecessor,
        REGISTRY_BINDING,
        undefined,
        promotionCompletionReceipt(
          current,
          substitutedPromotionPredecessor,
          "2026-07-05T01:00:00.000Z",
        ),
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    const prematurePromotion = releaseReceipt(
      current,
      "promotion",
      "2026-07-03T23:59:59.999Z",
    )
    expect(
      applyReleaseTransition(
        current,
        prematurePromotion,
        REGISTRY_BINDING,
        undefined,
        promotionCompletionReceipt(
          current,
          prematurePromotion,
          "2026-07-05T01:00:00.000Z",
        ),
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    const selfSelectedPreviousLatest = releaseReceipt(
      current,
      "promotion",
      "2026-07-05T00:00:00.000Z",
      { previous_latest_version: "0.1.1" },
    )
    expect(
      applyReleaseTransition(
        current,
        selfSelectedPreviousLatest,
        REGISTRY_BINDING,
        undefined,
        promotionCompletionReceipt(
          current,
          selfSelectedPreviousLatest,
          "2026-07-05T01:00:00.000Z",
        ),
      ),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    expect(
      applyReleaseTransition(
        current,
        promotion,
        {
          ...REGISTRY_BINDING,
          expected_previous_latest_version: "0.1.1",
        },
        undefined,
        completion,
      ),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })

    expect(applyReleaseTransition(current, promotion, REGISTRY_BINDING)).toEqual({
      applied: false,
      error: "RECEIPT_INVALID",
    })
    expect(
      applyReleaseTransition(
        current,
        promotion,
        REGISTRY_BINDING,
        undefined,
        promotionCompletionReceipt(
          current,
          promotion,
          "2026-07-05T01:00:00.000Z",
          { event_id: `availability:v1:${B}` },
        ),
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    expect(
      applyReleaseTransition(
        current,
        promotion,
        REGISTRY_BINDING,
        undefined,
        { ...completion, receipt_digest_v1: A },
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })

    current = incidentFrom(
      applyReleaseTransition(current, promotion, REGISTRY_BINDING, undefined, completion),
    )
    expect(current.state).toBe("PROMOTED_CLOSED")
    expect(current.last_transition_at).toBe("2026-07-05T01:00:00.000Z")
    expect(current.receipt_digests[2]).toBe(completion.receipt_digest_v1)
    expect(current.receipt_digests).not.toContain(
      promotion.release_transition_receipt_digest_v1,
    )
    expect(current.first_seen_at).toBe("2026-07-01T00:00:00.000Z")
    expect(current.deadline_at).toBe("2026-07-08T00:00:00.000Z")

    const rollback = releaseReceipt(current, "rollback", "2026-07-06T00:00:00.000Z")
    const rollbackBinding = {
      prior_good_package_integrity: PRIOR_GOOD_INTEGRITY,
      prior_good_version: PRIOR_GOOD_VERSION,
      prior_good_release_data_digest_v1: PRIOR_GOOD_RELEASE_DATA_DIGEST,
      prior_good_receipt_digest: F,
      rollback_evidence_digest_bindings: {
        "prior-good-release": F,
        "promotion-receipt": current.receipt_digests[2] as string,
        "rollback-authorization": C,
        "rollback-registry-state": D,
      },
    }
    expect(
      applyReleaseTransition(
        current,
        releaseReceipt(current, "rollback", "2026-07-04T23:59:59.999Z"),
        REGISTRY_BINDING,
        rollbackBinding,
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    expect(
      applyReleaseTransition(current, rollback, REGISTRY_BINDING, {
        ...rollbackBinding,
        prior_good_package_integrity: ALTERNATE_PACKAGE_INTEGRITY,
      }),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    expect(
      applyReleaseTransition(current, rollback, REGISTRY_BINDING, {
        ...rollbackBinding,
        prior_good_version: "0.0.9",
      }),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    expect(
      applyReleaseTransition(current, rollback, REGISTRY_BINDING, {
        ...rollbackBinding,
        prior_good_release_data_digest_v1: B,
      }),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    expect(
      applyReleaseTransition(current, rollback, REGISTRY_BINDING, {
        ...rollbackBinding,
        prior_good_receipt_digest: A,
      }),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    const substitutedVersion = releaseReceipt(
      current,
      "rollback",
      "2026-07-06T00:00:00.000Z",
      { package_version: "0.0.9", previous_latest_version: "0.0.9" },
    )
    expect(
      applyReleaseTransition(current, substitutedVersion, REGISTRY_BINDING, rollbackBinding),
    ).toEqual({
      applied: false,
      error: "TRANSITION_INELIGIBLE",
    })
    const substitutedReleaseData = releaseReceipt(
      current,
      "rollback",
      "2026-07-06T00:00:00.000Z",
      { release_data_digest_v1: B },
    )
    expect(
      applyReleaseTransition(current, substitutedReleaseData, REGISTRY_BINDING, rollbackBinding),
    ).toEqual({
      applied: false,
      error: "TRANSITION_INELIGIBLE",
    })

    const wrongPredecessor = releaseReceipt(
      current,
      "rollback",
      "2026-07-06T00:00:00.000Z",
      { predecessor_receipt_digests: [F] },
    )
    expect(
      applyReleaseTransition(current, wrongPredecessor, REGISTRY_BINDING, rollbackBinding),
    ).toEqual({
      applied: false,
      error: "RECEIPT_INVALID",
    })
    const reorderedRollbackPredecessors = releaseReceipt(
      current,
      "rollback",
      "2026-07-06T00:00:00.000Z",
      { predecessor_receipt_digests: [F, current.receipt_digests[2] as string] },
    )
    expect(
      applyReleaseTransition(
        current,
        reorderedRollbackPredecessors,
        REGISTRY_BINDING,
        rollbackBinding,
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    const extraRollbackPredecessor = releaseReceipt(
      current,
      "rollback",
      "2026-07-06T00:00:00.000Z",
      {
        predecessor_receipt_digests: [
          current.receipt_digests[2] as string,
          F,
          B,
        ],
      },
    )
    expect(
      applyReleaseTransition(
        current,
        extraRollbackPredecessor,
        REGISTRY_BINDING,
        rollbackBinding,
      ),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })

    const reopened = incidentFrom(
      applyReleaseTransition(current, rollback, REGISTRY_BINDING, rollbackBinding),
    )
    expect(reopened.state).toBe("ROLLED_BACK_REOPENED")
    expect(reopened.last_transition_at).toBe("2026-07-06T00:00:00.000Z")
    expect(reopened.original_event_id).toBe(opened.original_event_id)
    expect(reopened.first_seen_at).toBe(opened.first_seen_at)
    expect(reopened.deadline_at).toBe(opened.deadline_at)
    expect(reopened.active_package_version).toBe("0.1.0")
    expect(reopened.active_package_integrity).toBe(PRIOR_GOOD_INTEGRITY)
    expect(reopened.active_release_data_digest_v1).toBe(PRIOR_GOOD_RELEASE_DATA_DIGEST)
    expect(reopened.release_cycle_start_index).toBe(0)
    expect(reopened.receipt_digests).toHaveLength(4)
    expect(
      applyReleaseTransition(reopened, rollback, REGISTRY_BINDING, {
        ...rollbackBinding,
        prior_good_version: "0.0.9",
      }),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    expect(
      applyReleaseTransition(reopened, rollback, REGISTRY_BINDING, {
        ...rollbackBinding,
        prior_good_release_data_digest_v1: B,
      }),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    expect(
      applyReleaseTransition(reopened, rollback, REGISTRY_BINDING, rollbackBinding),
    ).toEqual({
      applied: true,
      incident: reopened,
      changed: false,
    })

    const nextRegistryBinding = {
      ...REGISTRY_BINDING,
      candidate_authorization_receipt_digest: F,
      candidate_evidence_digest_bindings: {
        "authorization-receipt": F,
        "registry-post-state": B,
        "release-data": E,
        "source-tarball": E,
      },
    }
    let nextCycle = incidentFrom(
      advanceUnreceiptedState(reopened, "VALIDATED", "2026-07-06T01:00:00.000Z"),
    )
    nextCycle = incidentFrom(
      advanceUnreceiptedState(nextCycle, "PR_OPEN", "2026-07-06T02:00:00.000Z"),
    )
    nextCycle = incidentFrom(
      advanceUnreceiptedState(nextCycle, "MERGED", "2026-07-06T03:00:00.000Z"),
    )
    const oldReceiptHistory = nextCycle.receipt_digests
    const stalePriorCycleCandidate = releaseReceipt(
      nextCycle,
      "candidate",
      "2026-07-06T04:00:00.000Z",
      {
        package_version: "0.3.0",
        package_integrity: NEXT_CYCLE_INTEGRITY,
        release_data_digest_v1: E,
        predecessor_receipt_digests: [oldReceiptHistory[0] as string],
      },
    )
    expect(
      applyReleaseTransition(nextCycle, stalePriorCycleCandidate, nextRegistryBinding),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })

    const reusedRolledBackVersion = releaseReceipt(
      nextCycle,
      "candidate",
      "2026-07-06T04:00:00.000Z",
      {
        package_version: PRIOR_GOOD_VERSION,
        package_integrity: NEXT_CYCLE_INTEGRITY,
        release_data_digest_v1: E,
        predecessor_receipt_digests: [nextRegistryBinding.candidate_authorization_receipt_digest],
      },
    )
    expect(
      applyReleaseTransition(nextCycle, reusedRolledBackVersion, nextRegistryBinding),
    ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })

    const nextCandidate = releaseReceipt(
      nextCycle,
      "candidate",
      "2026-07-06T04:00:00.000Z",
      {
        package_version: "0.3.0",
        package_integrity: NEXT_CYCLE_INTEGRITY,
        release_data_digest_v1: E,
        predecessor_receipt_digests: [nextRegistryBinding.candidate_authorization_receipt_digest],
      },
    )
    for (const releaseCycleStartIndex of [1, oldReceiptHistory.length]) {
      const shiftedCycleBoundary = {
        ...nextCycle,
        release_cycle_start_index: releaseCycleStartIndex,
      }
      expect(
        applyReleaseTransition(shiftedCycleBoundary, nextCandidate, nextRegistryBinding),
      ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    }
    nextCycle = incidentFrom(
      applyReleaseTransition(nextCycle, nextCandidate, nextRegistryBinding),
    )
    expect(nextCycle.state).toBe("CANDIDATE_PUBLISHED")
    expect(nextCycle.release_cycle_start_index).toBe(oldReceiptHistory.length)
    expect(nextCycle.receipt_digests.slice(0, oldReceiptHistory.length)).toEqual(oldReceiptHistory)
    expect(nextCycle.receipt_digests).toHaveLength(oldReceiptHistory.length + 1)

    const stalePriorCycleClient = releaseReceipt(
      nextCycle,
      "client",
      "2026-07-06T05:00:00.000Z",
      {
        package_version: "0.3.0",
        package_integrity: NEXT_CYCLE_INTEGRITY,
        release_data_digest_v1: E,
        predecessor_receipt_digests: [oldReceiptHistory[0] as string],
      },
    )
    expect(
      applyReleaseTransition(nextCycle, stalePriorCycleClient, nextRegistryBinding),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })

    const nextClient = releaseReceipt(nextCycle, "client", "2026-07-06T05:00:00.000Z", {
      package_version: "0.3.0",
      package_integrity: NEXT_CYCLE_INTEGRITY,
      release_data_digest_v1: E,
    })
    nextCycle = incidentFrom(applyReleaseTransition(nextCycle, nextClient, nextRegistryBinding))
    expect(nextCycle.state).toBe("CLIENT_VERIFIED")
    expect(nextCycle.release_cycle_start_index).toBe(oldReceiptHistory.length)
    expect(nextCycle.receipt_digests.slice(0, oldReceiptHistory.length)).toEqual(oldReceiptHistory)
    const stalePriorCyclePromotion = releaseReceipt(
      nextCycle,
      "promotion",
      "2026-07-06T06:00:00.000Z",
      {
        package_version: "0.3.0",
        package_integrity: NEXT_CYCLE_INTEGRITY,
        release_data_digest_v1: E,
        predecessor_receipt_digests: [
          oldReceiptHistory[0] as string,
          nextCycle.receipt_digests[nextCycle.receipt_digests.length - 1] as string,
        ],
      },
    )
    expect(
      applyReleaseTransition(nextCycle, stalePriorCyclePromotion, nextRegistryBinding),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })

    const nextPromotion = releaseReceipt(
      nextCycle,
      "promotion",
      "2026-07-06T06:00:00.000Z",
      {
        package_version: "0.3.0",
        package_integrity: NEXT_CYCLE_INTEGRITY,
        release_data_digest_v1: E,
      },
    )
    const nextCompletion = promotionCompletionReceipt(
      nextCycle,
      nextPromotion,
      "2026-07-06T06:30:00.000Z",
    )
    nextCycle = incidentFrom(
      applyReleaseTransition(
        nextCycle,
        nextPromotion,
        nextRegistryBinding,
        undefined,
        nextCompletion,
      ),
    )
    expect(nextCycle.state).toBe("PROMOTED_CLOSED")
    expect(nextCycle.release_cycle_start_index).toBe(oldReceiptHistory.length)
    expect(nextCycle.first_seen_at).toBe(opened.first_seen_at)
    expect(nextCycle.deadline_at).toBe(opened.deadline_at)
    expect(
      applyReleaseTransition(
        nextCycle,
        nextPromotion,
        nextRegistryBinding,
        undefined,
        nextCompletion,
      ),
    ).toEqual({
      applied: true,
      incident: nextCycle,
      changed: false,
    })

    const nextRollback = releaseReceipt(
      nextCycle,
      "rollback",
      "2026-07-06T07:00:00.000Z",
    )
    const nextRollbackBinding = {
      ...rollbackBinding,
      rollback_evidence_digest_bindings: {
        ...rollbackBinding.rollback_evidence_digest_bindings,
        "promotion-receipt":
          nextCycle.receipt_digests[nextCycle.receipt_digests.length - 1] as string,
      },
    }
    expect(
      applyReleaseTransition(nextCycle, nextRollback, nextRegistryBinding, rollbackBinding),
    ).toEqual({ applied: false, error: "RECEIPT_INVALID" })
    nextCycle = incidentFrom(
      applyReleaseTransition(nextCycle, nextRollback, nextRegistryBinding, nextRollbackBinding),
    )
    expect(nextCycle.state).toBe("ROLLED_BACK_REOPENED")
    expect(nextCycle.release_cycle_start_index).toBe(oldReceiptHistory.length)
    expect(nextCycle.receipt_digests.slice(0, oldReceiptHistory.length)).toEqual(oldReceiptHistory)
    expect(nextCycle.receipt_digests).toHaveLength(oldReceiptHistory.length + 4)
    expect(nextCycle.first_seen_at).toBe(opened.first_seen_at)
    expect(nextCycle.deadline_at).toBe(opened.deadline_at)
    expect(
      applyReleaseTransition(nextCycle, nextRollback, nextRegistryBinding, nextRollbackBinding),
    ).toEqual({
      applied: true,
      incident: nextCycle,
      changed: false,
    })

    let followingCycle = incidentFrom(
      advanceUnreceiptedState(nextCycle, "VALIDATED", "2026-07-06T08:00:00.000Z"),
    )
    followingCycle = incidentFrom(
      advanceUnreceiptedState(followingCycle, "PR_OPEN", "2026-07-06T09:00:00.000Z"),
    )
    followingCycle = incidentFrom(
      advanceUnreceiptedState(followingCycle, "MERGED", "2026-07-06T10:00:00.000Z"),
    )
    const followingCandidate = releaseReceipt(
      followingCycle,
      "candidate",
      "2026-07-06T11:00:00.000Z",
      {
        package_version: "0.4.0",
        package_integrity: FOLLOWING_CYCLE_INTEGRITY,
        release_data_digest_v1: E,
        predecessor_receipt_digests: [nextRegistryBinding.candidate_authorization_receipt_digest],
      },
    )
    const staleCycleBoundary = { ...followingCycle, release_cycle_start_index: 0 }
    const shiftedCycleBoundary = {
      ...followingCycle,
      release_cycle_start_index: oldReceiptHistory.length + 1,
    }
    const invalidCycleBoundaries = [staleCycleBoundary, shiftedCycleBoundary]
    for (const invalidCycleBoundary of invalidCycleBoundaries) {
      expect(
        applyReleaseTransition(invalidCycleBoundary, followingCandidate, nextRegistryBinding),
      ).toEqual({ applied: false, error: "TRANSITION_INELIGIBLE" })
    }
  })

  it("rejects malformed provenance before every receipted lifecycle mutation", () => {
    const malformedSourceCommits = [
      "0123456789abcdef",
      "g".repeat(40),
      SOURCE_COMMIT.toUpperCase(),
      ` ${SOURCE_COMMIT}`,
      `${SOURCE_COMMIT} `,
      `${SOURCE_COMMIT}\n`,
    ] as const
    const opened = incidentFrom(observeProvisionalIncident([], observation()))
    const equalObserved = incidentFrom(
      observeSourceChecksum(opened, B, "2026-07-01T12:00:00.000Z"),
    )
    for (const sourceCommit of malformedSourceCommits) {
      expectRejectedWithoutMutation(equalObserved, () =>
        closeVerifiedNoChange(
          equalObserved,
          noChangeReceipt(equalObserved, { source_commit: sourceCommit }),
        ),
      )
    }

    const changed = incidentFrom(
      observeSourceChecksum(opened, C, "2026-07-01T12:00:00.000Z"),
    )
    let current = incidentFrom(
      advanceUnreceiptedState(changed, "VALIDATED", "2026-07-02T00:00:00.000Z"),
    )
    current = incidentFrom(
      advanceUnreceiptedState(current, "PR_OPEN", "2026-07-02T06:00:00.000Z"),
    )
    current = incidentFrom(
      advanceUnreceiptedState(current, "MERGED", "2026-07-02T12:00:00.000Z"),
    )

    const malformedProvenance: readonly Partial<ReleaseTransitionEvidencePayloadV1>[] = [
      ...malformedSourceCommits.map((sourceCommit) => ({ source_commit: sourceCommit })),
      { package_integrity: "sha512-malformed" },
    ]
    const rejectReleaseProvenance = (
      incident: FreshnessIncidentV1,
      transition: ReleaseTransition,
      approvedAt: string,
      rollbackBinding?: Parameters<typeof applyReleaseTransition>[3],
    ): void => {
      for (const overrides of malformedProvenance) {
        const receipt = releaseReceipt(incident, transition, approvedAt, overrides)
        expectRejectedWithoutMutation(incident, () =>
          applyReleaseTransition(
            incident,
            receipt,
            REGISTRY_BINDING,
            rollbackBinding,
            transition === "promotion"
              ? promotionCompletionReceipt(
                  incident,
                  receipt,
                  new Date(Date.parse(approvedAt) + 3_600_000).toISOString(),
                )
              : undefined,
          ),
        )
      }
    }

    rejectReleaseProvenance(current, "candidate", "2026-07-03T00:00:00.000Z")
    current = incidentFrom(
      applyReleaseTransition(
        current,
        releaseReceipt(current, "candidate", "2026-07-03T00:00:00.000Z"),
        REGISTRY_BINDING,
      ),
    )

    rejectReleaseProvenance(current, "client", "2026-07-04T00:00:00.000Z")
    current = incidentFrom(
      applyReleaseTransition(
        current,
        releaseReceipt(current, "client", "2026-07-04T00:00:00.000Z"),
        REGISTRY_BINDING,
      ),
    )

    const provenancePromotion = releaseReceipt(
      current,
      "promotion",
      "2026-07-05T00:00:00.000Z",
    )
    rejectReleaseProvenance(current, "promotion", "2026-07-05T00:00:00.000Z")
    current = incidentFrom(
      applyReleaseTransition(
        current,
        provenancePromotion,
        REGISTRY_BINDING,
        undefined,
        promotionCompletionReceipt(
          current,
          provenancePromotion,
          "2026-07-05T01:00:00.000Z",
        ),
      ),
    )

    const rollbackBinding = {
      prior_good_package_integrity: PRIOR_GOOD_INTEGRITY,
      prior_good_version: PRIOR_GOOD_VERSION,
      prior_good_release_data_digest_v1: PRIOR_GOOD_RELEASE_DATA_DIGEST,
      prior_good_receipt_digest: F,
      rollback_evidence_digest_bindings: {
        "prior-good-release": F,
        "promotion-receipt": current.receipt_digests[2] as string,
        "rollback-authorization": C,
        "rollback-registry-state": D,
      },
    }
    rejectReleaseProvenance(
      current,
      "rollback",
      "2026-07-06T00:00:00.000Z",
      rollbackBinding,
    )
  })
})
