import { createHash } from "node:crypto"

export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export type ReceiptValidationError =
  | "MALFORMED_RECEIPT"
  | "SELF_REFERENCE"
  | "INNER_DIGEST_MISMATCH"
  | "APPROVAL_INVALID"
  | "ATTESTATION_DIGEST_MISMATCH"
  | "OUTER_DIGEST_MISMATCH"
  | "PREDECESSOR_MISMATCH"
  | "TRANSITION_INELIGIBLE"

export type ReceiptValidation =
  | { readonly valid: true; readonly receipt_digest: string }
  | { readonly valid: false; readonly error: ReceiptValidationError }

export interface EvidenceResultV1 {
  readonly status: "pass"
  readonly digest: string
}

export interface PolicyVersionV1 {
  readonly policy: string
  readonly version: string
}

export interface BackendDecisionPayloadV1 {
  readonly schema_version: "backend-decision-payload.v1"
  readonly source_commit: string
  readonly sql_js_identity: string
  readonly sql_js_integrity: string
  readonly lane_receipt_digests: readonly string[]
  readonly legacy_golden_digest: string
  readonly custom_path_digest: string
  readonly license_evidence_digest: string
  readonly security_evidence_digest: string
  readonly audit_evidence_digest: string
  readonly wasm_evidence_digest: string
  readonly measurement_evidence_digest: string
  readonly startup_ms: number
  readonly rss_bytes: number
  readonly tradeoff_rationale: string
  readonly accepted_operational_impact: string
  readonly decision: "select_sql_js"
}

export interface BackendApprovalV1 {
  readonly role: "architect" | "administrator"
  readonly identity: string
  readonly approved_at: string
  readonly decision: "select_sql_js"
  readonly backend_decision_payload_digest_v1: string
  readonly attestation_digest: string
}

export interface BackendSelectionReceiptV1 {
  readonly receipt_schema_version: "backend-selection-receipt.v1"
  readonly backend_decision_payload_v1: BackendDecisionPayloadV1
  readonly backend_decision_payload_digest_v1: string
  readonly approvals: readonly [BackendApprovalV1, BackendApprovalV1]
  readonly backend_selection_receipt_digest_v1: string
}

export interface VerifiedNoChangeEvidencePayloadV1 {
  readonly schema_version: "verified-no-change-evidence-payload.v1"
  readonly event_id: string
  readonly prior_transition_digest: string
  readonly first_seen_at: string
  readonly deadline_at: string
  readonly accepted_baseline_source_sha256: string
  readonly accepted_baseline_release_data_digest_v1: string
  readonly reacquired_source_sha256: string
  readonly origin_result: EvidenceResultV1
  readonly license_result: EvidenceResultV1
  readonly workbook_result: EvidenceResultV1
  readonly metadata_fingerprint_v1: string
  readonly run_id: string
  readonly source_commit: string
  readonly policy_versions: readonly PolicyVersionV1[]
}

export interface VerifiedNoChangeApprovalV1 {
  readonly role: "administrator"
  readonly identity: string
  readonly approved_at: string
  readonly decision: "verified_no_change"
  readonly verified_no_change_evidence_digest_v1: string
  readonly attestation_digest: string
}

export interface VerifiedNoChangeReceiptV1 {
  readonly receipt_schema_version: "verified-no-change-receipt.v1"
  readonly verified_no_change_evidence_payload_v1: VerifiedNoChangeEvidencePayloadV1
  readonly verified_no_change_evidence_digest_v1: string
  readonly approval: VerifiedNoChangeApprovalV1
  readonly verified_no_change_receipt_digest_v1: string
}

export type ReleaseTransition = "candidate" | "client" | "promotion" | "rollback"

export interface ReleaseEvidenceDigestV1 {
  readonly kind: string
  readonly digest: string
}

export interface ReleaseTransitionEvidencePayloadV1 {
  readonly schema_version: "release-transition-evidence-payload.v1"
  readonly transition: ReleaseTransition
  readonly event_id: string
  readonly prior_transition_digest: string
  readonly first_seen_at: string
  readonly deadline_at: string
  readonly source_sha256: string
  readonly release_data_digest_v1: string
  readonly package_name: string
  readonly package_version: string
  readonly package_integrity: string
  readonly previous_latest_version: string
  readonly predecessor_receipt_digests: readonly string[]
  readonly evidence_digests: readonly ReleaseEvidenceDigestV1[]
  readonly run_id: string
  readonly source_commit: string
  readonly policy_versions: readonly PolicyVersionV1[]
}

export interface ReleaseTransitionApprovalV1 {
  readonly role: "administrator"
  readonly identity: string
  readonly approved_at: string
  readonly decision: ReleaseTransition
  readonly release_transition_evidence_digest_v1: string
  readonly attestation_digest: string
}

export interface ReleaseTransitionReceiptV1 {
  readonly receipt_schema_version: "release-transition-receipt.v1"
  readonly release_transition_evidence_payload_v1: ReleaseTransitionEvidencePayloadV1
  readonly release_transition_evidence_digest_v1: string
  readonly approval: ReleaseTransitionApprovalV1
  readonly release_transition_receipt_digest_v1: string
}
export interface PromotionCompletionPayloadV1 {
  readonly schema_version: "promotion-completion-payload.v1"
  readonly transition: "PROMOTED_CLOSED"
  readonly event_id: string
  readonly prior_transition_digest: string
  readonly first_seen_at: string
  readonly deadline_at: string
  readonly release_data_digest_v1: string
  readonly package_name: string
  readonly package_version: string
  readonly package_integrity: string
  readonly source_commit: string
  readonly previous_latest_version: string
  readonly predecessor_receipt_digests: readonly [string, string]
  readonly candidate_receipt_digest: string
  readonly authorization_receipt_digest: string
}

export interface PromotionRegistryVerificationV1 {
  readonly registry: "https://registry.npmjs.org/"
  readonly latest_version: string
  readonly package_integrity: string
  readonly verified_at: string
}

export interface PromotionCompletionReceiptV1 {
  readonly receipt_schema_version: "promotion-completion-receipt.v1"
  readonly promotion_completion_payload_v1: PromotionCompletionPayloadV1
  readonly promotion_completion_payload_digest_v1: string
  readonly registry_verification: PromotionRegistryVerificationV1
  readonly receipt_digest_v1: string
}

const SHA256 = /^[0-9a-f]{64}$/
const GIT_COMMIT = /^[0-9a-f]{40}$/
const SHA512_SRI = /^sha512-([A-Za-z0-9+/]{86}==)$/
const CANONICAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const FRESHNESS_EVENT_ID = /^(?:source|acquisition|availability):v1:[0-9a-f]{64}$/
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const RELEASE_PACKAGE_NAME = "academyinfo-mcp"
const RELEASE_EVIDENCE_KINDS = {
  candidate: [
    "authorization-receipt",
    "registry-post-state",
    "release-data",
    "source-tarball",
  ],
  client: [
    "actual-claude-desktop",
    "generic-stdio-journey",
    "public-install-macos-arm64",
    "public-install-ubuntu-glibc-x64",
    "public-install-windows-x64",
  ],
  promotion: [
    "actual-claude-desktop",
    "generic-stdio-journey",
    "public-install-macos-arm64",
    "public-install-ubuntu-glibc-x64",
    "public-install-windows-x64",
  ],
  rollback: [
    "prior-good-release",
    "promotion-receipt",
    "rollback-authorization",
    "rollback-registry-state",
  ],
} as const satisfies Readonly<Record<ReleaseTransition, readonly string[]>>
export type ReleaseEvidenceDigestBindingsV1 = {
  readonly [T in ReleaseTransition]: Readonly<
    Record<(typeof RELEASE_EVIDENCE_KINDS)[T][number], string>
  >
}

const RELEASE_PREDECESSOR_COUNTS: Readonly<Record<ReleaseTransition, number>> = {
  candidate: 1,
  client: 1,
  promotion: 2,
  rollback: 2,
}
const FORBIDDEN_SELF_KEYS = new Set([
  "backend_decision_payload_digest_v1",
  "verified_no_change_evidence_digest_v1",
  "release_transition_evidence_digest_v1",
  "attestation_digest",
  "approval",
  "approvals",
  "backend_selection_receipt_digest_v1",
  "verified_no_change_receipt_digest_v1",
  "release_transition_receipt_digest_v1",
  "promotion_completion_payload_digest_v1",
  "receipt_digest_v1",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "string") {
    if (hasLoneSurrogate(value)) throw new TypeError("JCS rejects lone Unicode surrogates")
    return JSON.stringify(value)
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JCS rejects non-finite numbers")
    return JSON.stringify(value)
  }
  if (typeof value !== "object") throw new TypeError("JCS rejects non-JSON values")
  if (ancestors.has(value)) throw new TypeError("JCS rejects cyclic values")
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (
        Object.getOwnPropertySymbols(value).length > 0 ||
        Object.getOwnPropertyNames(value).length !== value.length + 1 ||
        Object.keys(value).some((key) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
      ) {
        throw new TypeError("JCS rejects arrays with non-index properties")
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) {
          throw new TypeError("JCS rejects sparse arrays and accessors")
        }
      }
      return `[${value.map((item) => canonicalize(item, ancestors)).join(",")}]`
    }
    if (!isRecord(value) || Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("JCS accepts only plain JSON objects")
    }
    const keys = Object.keys(value).sort()
    if (
      Object.getOwnPropertyNames(value).length !== keys.length ||
      keys.some((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        return descriptor === undefined || !Object.hasOwn(descriptor, "value")
      })
    ) {
      throw new TypeError("JCS rejects accessors and non-enumerable properties")
    }
    return `{${keys
      .map((key) => `${canonicalize(key, ancestors)}:${canonicalize(value[key], ancestors)}`)
      .join(",")}}`
  } finally {
    ancestors.delete(value)
  }
}

export function canonicalizeJcs(value: unknown): string {
  return canonicalize(value, new Set())
}

export function sha256Jcs(value: unknown): string {
  return createHash("sha256").update(canonicalizeJcs(value), "utf8").digest("hex")
}

function containsForbiddenSelfKey(value: unknown, visited = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== "object") return false
  if (visited.has(value)) return true
  visited.add(value)
  if (Array.isArray(value)) return value.some((child) => containsForbiddenSelfKey(child, visited))
  if (!isRecord(value)) return false
  return Object.entries(value).some(
    ([key, child]) => FORBIDDEN_SELF_KEYS.has(key) || containsForbiddenSelfKey(child, visited),
  )
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value)
}

function isGitCommit(value: unknown): value is string {
  return typeof value === "string" && GIT_COMMIT.test(value)
}

function isSha512Sri(value: unknown): value is string {
  if (typeof value !== "string") return false
  const match = SHA512_SRI.exec(value)
  if (match === null) return false
  const encoded = match[1] as string
  const bytes = Buffer.from(encoded, "base64")
  return bytes.length === 64 && bytes.toString("base64") === encoded
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value
}

function isCanonicalTime(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_TIME.test(value)) return false
  const epoch = Date.parse(value)
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value
}

function isDigestArray(value: unknown, allowEmpty = false): value is readonly string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every(isDigest) &&
    new Set(value).size === value.length
  )
}

function isPolicyVersions(value: unknown): value is readonly PolicyVersionV1[] {
  if (!Array.isArray(value)) return false
  let previous = ""
  for (const item of value) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ["policy", "version"]) ||
      !isNonEmpty(item["policy"]) ||
      !isNonEmpty(item["version"]) ||
      item["policy"] <= previous
    ) {
      return false
    }
    previous = item["policy"]
  }
  return value.length > 0
}

function isEvidenceResult(value: unknown): value is EvidenceResultV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["status", "digest"]) &&
    value["status"] === "pass" &&
    isDigest(value["digest"])
  )
}

function validateBackendPayload(value: unknown): value is BackendDecisionPayloadV1 {
  if (!isRecord(value)) return false
  const keys = [
    "schema_version",
    "source_commit",
    "sql_js_identity",
    "sql_js_integrity",
    "lane_receipt_digests",
    "legacy_golden_digest",
    "custom_path_digest",
    "license_evidence_digest",
    "security_evidence_digest",
    "audit_evidence_digest",
    "wasm_evidence_digest",
    "measurement_evidence_digest",
    "startup_ms",
    "rss_bytes",
    "tradeoff_rationale",
    "accepted_operational_impact",
    "decision",
  ]
  return (
    hasExactKeys(value, keys) &&
    value["schema_version"] === "backend-decision-payload.v1" &&
    isGitCommit(value["source_commit"]) &&
    isNonEmpty(value["sql_js_identity"]) &&
    isSha512Sri(value["sql_js_integrity"]) &&
    isDigestArray(value["lane_receipt_digests"]) &&
    [
      "legacy_golden_digest",
      "custom_path_digest",
      "license_evidence_digest",
      "security_evidence_digest",
      "audit_evidence_digest",
      "wasm_evidence_digest",
      "measurement_evidence_digest",
    ].every((key) => isDigest(value[key])) &&
    typeof value["startup_ms"] === "number" &&
    Number.isFinite(value["startup_ms"]) &&
    value["startup_ms"] >= 0 &&
    Number.isSafeInteger(value["rss_bytes"]) &&
    (value["rss_bytes"] as number) >= 0 &&
    isNonEmpty(value["tradeoff_rationale"]) &&
    isNonEmpty(value["accepted_operational_impact"]) &&
    value["decision"] === "select_sql_js"
  )
}

function validateBackendApproval(value: unknown, role: "architect" | "administrator"): value is BackendApprovalV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "role",
      "identity",
      "approved_at",
      "decision",
      "backend_decision_payload_digest_v1",
      "attestation_digest",
    ]) &&
    value["role"] === role &&
    isNonEmpty(value["identity"]) &&
    isCanonicalTime(value["approved_at"]) &&
    value["decision"] === "select_sql_js" &&
    isDigest(value["backend_decision_payload_digest_v1"]) &&
    isDigest(value["attestation_digest"])
  )
}

function backendApprovalProjection(approval: BackendApprovalV1): JsonValue {
  return {
    role: approval.role,
    identity: approval.identity,
    approved_at: approval.approved_at,
    decision: approval.decision,
    backend_decision_payload_digest_v1: approval.backend_decision_payload_digest_v1,
  }
}

function validateBackendSelectionReceiptUnchecked(value: unknown): ReceiptValidation {
  if (!isRecord(value)) return { valid: false, error: "MALFORMED_RECEIPT" }
  if (containsForbiddenSelfKey(value["backend_decision_payload_v1"])) {
    return { valid: false, error: "SELF_REFERENCE" }
  }
  if (
    !hasExactKeys(value, [
      "receipt_schema_version",
      "backend_decision_payload_v1",
      "backend_decision_payload_digest_v1",
      "approvals",
      "backend_selection_receipt_digest_v1",
    ]) ||
    value["receipt_schema_version"] !== "backend-selection-receipt.v1" ||
    !validateBackendPayload(value["backend_decision_payload_v1"]) ||
    !isDigest(value["backend_decision_payload_digest_v1"]) ||
    !isDigest(value["backend_selection_receipt_digest_v1"]) ||
    !Array.isArray(value["approvals"]) ||
    value["approvals"].length !== 2
  ) {
    return { valid: false, error: "MALFORMED_RECEIPT" }
  }
  const payload = value["backend_decision_payload_v1"]
  const payloadDigest = value["backend_decision_payload_digest_v1"]
  if (sha256Jcs(payload) !== payloadDigest) return { valid: false, error: "INNER_DIGEST_MISMATCH" }
  const architect = value["approvals"][0]
  const administrator = value["approvals"][1]
  if (
    !validateBackendApproval(architect, "architect") ||
    !validateBackendApproval(administrator, "administrator") ||
    architect.identity === administrator.identity
  ) {
    return { valid: false, error: "APPROVAL_INVALID" }
  }
  for (const approval of [architect, administrator]) {
    if (approval.backend_decision_payload_digest_v1 !== payloadDigest) {
      return { valid: false, error: "APPROVAL_INVALID" }
    }
    if (sha256Jcs(backendApprovalProjection(approval)) !== approval.attestation_digest) {
      return { valid: false, error: "ATTESTATION_DIGEST_MISMATCH" }
    }
  }
  const projection = {
    receipt_schema_version: "backend-selection-receipt.v1",
    backend_decision_payload_v1: payload,
    backend_decision_payload_digest_v1: payloadDigest,
    approvals: [architect, administrator],
  }
  const receiptDigest = value["backend_selection_receipt_digest_v1"]
  if (sha256Jcs(projection) !== receiptDigest) return { valid: false, error: "OUTER_DIGEST_MISMATCH" }
  return { valid: true, receipt_digest: receiptDigest }
}

function validateVerifiedPayload(value: unknown): value is VerifiedNoChangeEvidencePayloadV1 {
  if (!isRecord(value)) return false
  return (
    hasExactKeys(value, [
      "schema_version",
      "event_id",
      "prior_transition_digest",
      "first_seen_at",
      "deadline_at",
      "accepted_baseline_source_sha256",
      "accepted_baseline_release_data_digest_v1",
      "reacquired_source_sha256",
      "origin_result",
      "license_result",
      "workbook_result",
      "metadata_fingerprint_v1",
      "run_id",
      "source_commit",
      "policy_versions",
    ]) &&
    value["schema_version"] === "verified-no-change-evidence-payload.v1" &&
    isNonEmpty(value["event_id"]) &&
    isDigest(value["prior_transition_digest"]) &&
    isCanonicalTime(value["first_seen_at"]) &&
    isCanonicalTime(value["deadline_at"]) &&
    Date.parse(value["deadline_at"] as string) - Date.parse(value["first_seen_at"] as string) === 604_800_000 &&
    isDigest(value["accepted_baseline_source_sha256"]) &&
    isDigest(value["accepted_baseline_release_data_digest_v1"]) &&
    value["reacquired_source_sha256"] === value["accepted_baseline_source_sha256"] &&
    isEvidenceResult(value["origin_result"]) &&
    isEvidenceResult(value["license_result"]) &&
    isEvidenceResult(value["workbook_result"]) &&
    isDigest(value["metadata_fingerprint_v1"]) &&
    isNonEmpty(value["run_id"]) &&
    isGitCommit(value["source_commit"]) &&
    isPolicyVersions(value["policy_versions"])
  )
}

function validateVerifiedApproval(value: unknown): value is VerifiedNoChangeApprovalV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "role",
      "identity",
      "approved_at",
      "decision",
      "verified_no_change_evidence_digest_v1",
      "attestation_digest",
    ]) &&
    value["role"] === "administrator" &&
    isNonEmpty(value["identity"]) &&
    isCanonicalTime(value["approved_at"]) &&
    value["decision"] === "verified_no_change" &&
    isDigest(value["verified_no_change_evidence_digest_v1"]) &&
    isDigest(value["attestation_digest"])
  )
}

function verifiedApprovalProjection(approval: VerifiedNoChangeApprovalV1): JsonValue {
  return {
    role: approval.role,
    identity: approval.identity,
    approved_at: approval.approved_at,
    decision: approval.decision,
    verified_no_change_evidence_digest_v1: approval.verified_no_change_evidence_digest_v1,
  }
}

export interface VerifiedNoChangeExpectation {
  readonly event_id: string
  readonly prior_transition_digest: string
  readonly prior_transition_at: string
  readonly first_seen_at: string
  readonly deadline_at: string
  readonly accepted_baseline_source_sha256: string
  readonly accepted_baseline_release_data_digest_v1: string
  readonly metadata_fingerprint_v1: string
}

function validateVerifiedNoChangeReceiptUnchecked(
  value: unknown,
  expected?: VerifiedNoChangeExpectation,
): ReceiptValidation {
  if (!isRecord(value)) return { valid: false, error: "MALFORMED_RECEIPT" }
  if (containsForbiddenSelfKey(value["verified_no_change_evidence_payload_v1"])) {
    return { valid: false, error: "SELF_REFERENCE" }
  }
  if (
    !hasExactKeys(value, [
      "receipt_schema_version",
      "verified_no_change_evidence_payload_v1",
      "verified_no_change_evidence_digest_v1",
      "approval",
      "verified_no_change_receipt_digest_v1",
    ]) ||
    value["receipt_schema_version"] !== "verified-no-change-receipt.v1" ||
    !validateVerifiedPayload(value["verified_no_change_evidence_payload_v1"]) ||
    !isDigest(value["verified_no_change_evidence_digest_v1"]) ||
    !validateVerifiedApproval(value["approval"]) ||
    !isDigest(value["verified_no_change_receipt_digest_v1"])
  ) {
    return { valid: false, error: "MALFORMED_RECEIPT" }
  }
  const payload = value["verified_no_change_evidence_payload_v1"]
  if (
    expected !== undefined &&
    (!isCanonicalTime(expected.prior_transition_at) ||
      payload.event_id !== expected.event_id ||
      payload.prior_transition_digest !== expected.prior_transition_digest ||
      payload.first_seen_at !== expected.first_seen_at ||
      payload.deadline_at !== expected.deadline_at ||
      payload.accepted_baseline_source_sha256 !== expected.accepted_baseline_source_sha256 ||
      payload.accepted_baseline_release_data_digest_v1 !== expected.accepted_baseline_release_data_digest_v1 ||
      payload.metadata_fingerprint_v1 !== expected.metadata_fingerprint_v1)
  ) {
    return { valid: false, error: "TRANSITION_INELIGIBLE" }
  }
  const payloadDigest = value["verified_no_change_evidence_digest_v1"]
  if (sha256Jcs(payload) !== payloadDigest) return { valid: false, error: "INNER_DIGEST_MISMATCH" }
  const approval = value["approval"]
  if (
    approval.verified_no_change_evidence_digest_v1 !== payloadDigest ||
    Date.parse(approval.approved_at) < Date.parse(payload.first_seen_at) ||
    (expected !== undefined &&
      Date.parse(approval.approved_at) < Date.parse(expected.prior_transition_at))
  ) {
    return { valid: false, error: "APPROVAL_INVALID" }
  }
  if (sha256Jcs(verifiedApprovalProjection(approval)) !== approval.attestation_digest) {
    return { valid: false, error: "ATTESTATION_DIGEST_MISMATCH" }
  }
  const projection = {
    receipt_schema_version: "verified-no-change-receipt.v1",
    verified_no_change_evidence_payload_v1: payload,
    verified_no_change_evidence_digest_v1: payloadDigest,
    approval,
  }
  const receiptDigest = value["verified_no_change_receipt_digest_v1"]
  if (sha256Jcs(projection) !== receiptDigest) return { valid: false, error: "OUTER_DIGEST_MISMATCH" }
  return { valid: true, receipt_digest: receiptDigest }
}

function validateReleasePayload(value: unknown): value is ReleaseTransitionEvidencePayloadV1 {
  if (!isRecord(value)) return false
  const transitions: readonly ReleaseTransition[] = ["candidate", "client", "promotion", "rollback"]
  if (
    !hasExactKeys(value, [
      "schema_version",
      "transition",
      "event_id",
      "prior_transition_digest",
      "first_seen_at",
      "deadline_at",
      "source_sha256",
      "release_data_digest_v1",
      "package_name",
      "package_version",
      "package_integrity",
      "previous_latest_version",
      "predecessor_receipt_digests",
      "evidence_digests",
      "run_id",
      "source_commit",
      "policy_versions",
    ]) ||
    value["schema_version"] !== "release-transition-evidence-payload.v1" ||
    !transitions.includes(value["transition"] as ReleaseTransition) ||
    !isNonEmpty(value["event_id"]) ||
    !isDigest(value["prior_transition_digest"]) ||
    !isCanonicalTime(value["first_seen_at"]) ||
    !isCanonicalTime(value["deadline_at"]) ||
    Date.parse(value["deadline_at"] as string) - Date.parse(value["first_seen_at"] as string) !== 604_800_000 ||
    !isDigest(value["source_sha256"]) ||
    !isDigest(value["release_data_digest_v1"]) ||
    value["package_name"] !== RELEASE_PACKAGE_NAME ||
    !isNonEmpty(value["package_version"]) ||
    !SEMVER.test(value["package_version"]) ||
    !isSha512Sri(value["package_integrity"]) ||
    !isNonEmpty(value["previous_latest_version"]) ||
    !SEMVER.test(value["previous_latest_version"]) ||
    !isDigestArray(value["predecessor_receipt_digests"]) ||
    value["predecessor_receipt_digests"].length !==
      RELEASE_PREDECESSOR_COUNTS[value["transition"] as ReleaseTransition] ||
    !Array.isArray(value["evidence_digests"]) ||
    value["evidence_digests"].length === 0 ||
    !isNonEmpty(value["run_id"]) ||
    !isGitCommit(value["source_commit"]) ||
    !isPolicyVersions(value["policy_versions"])
  ) {
    return false
  }
  let previousKind = ""
  for (const evidence of value["evidence_digests"]) {
    if (
      !isRecord(evidence) ||
      !hasExactKeys(evidence, ["kind", "digest"]) ||
      !isNonEmpty(evidence["kind"]) ||
      evidence["kind"] <= previousKind ||
      !isDigest(evidence["digest"])
    ) {
      return false
    }
    previousKind = evidence["kind"]
  }
  const expectedEvidenceKinds =
    RELEASE_EVIDENCE_KINDS[value["transition"] as ReleaseTransition]
  if (
    value["evidence_digests"].length !== expectedEvidenceKinds.length ||
    !value["evidence_digests"].every(
      (evidence, index) =>
        isRecord(evidence) && evidence["kind"] === expectedEvidenceKinds[index],
    )
  ) {
    return false
  }
  return true
}

function validateReleaseApproval(value: unknown): value is ReleaseTransitionApprovalV1 {
  const transitions: readonly ReleaseTransition[] = ["candidate", "client", "promotion", "rollback"]
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "role",
      "identity",
      "approved_at",
      "decision",
      "release_transition_evidence_digest_v1",
      "attestation_digest",
    ]) &&
    value["role"] === "administrator" &&
    isNonEmpty(value["identity"]) &&
    isCanonicalTime(value["approved_at"]) &&
    transitions.includes(value["decision"] as ReleaseTransition) &&
    isDigest(value["release_transition_evidence_digest_v1"]) &&
    isDigest(value["attestation_digest"])
  )
}

function releaseApprovalProjection(approval: ReleaseTransitionApprovalV1): JsonValue {
  return {
    role: approval.role,
    identity: approval.identity,
    approved_at: approval.approved_at,
    decision: approval.decision,
    release_transition_evidence_digest_v1: approval.release_transition_evidence_digest_v1,
  }
}

export interface PromotionCompletionExpectation {
  readonly event_id: string
  readonly prior_transition_digest: string
  readonly first_seen_at: string
  readonly deadline_at: string
  readonly release_data_digest_v1: string
  readonly package_name: string
  readonly package_version: string
  readonly package_integrity: string
  readonly source_commit: string
  readonly previous_latest_version: string
  readonly predecessor_receipt_digests: readonly [string, string]
  readonly candidate_receipt_digest: string
  readonly authorization_receipt_digest: string
  readonly authorization_approved_at: string
}

function validatePromotionCompletionPayload(value: unknown): value is PromotionCompletionPayloadV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "schema_version",
      "transition",
      "event_id",
      "prior_transition_digest",
      "first_seen_at",
      "deadline_at",
      "release_data_digest_v1",
      "package_name",
      "package_version",
      "package_integrity",
      "source_commit",
      "previous_latest_version",
      "predecessor_receipt_digests",
      "candidate_receipt_digest",
      "authorization_receipt_digest",
    ]) &&
    value["schema_version"] === "promotion-completion-payload.v1" &&
    value["transition"] === "PROMOTED_CLOSED" &&
    typeof value["event_id"] === "string" &&
    FRESHNESS_EVENT_ID.test(value["event_id"]) &&
    isDigest(value["prior_transition_digest"]) &&
    isCanonicalTime(value["first_seen_at"]) &&
    isCanonicalTime(value["deadline_at"]) &&
    Date.parse(value["deadline_at"] as string) - Date.parse(value["first_seen_at"] as string) === 604_800_000 &&
    isDigest(value["release_data_digest_v1"]) &&
    value["package_name"] === RELEASE_PACKAGE_NAME &&
    isNonEmpty(value["package_version"]) &&
    SEMVER.test(value["package_version"]) &&
    isSha512Sri(value["package_integrity"]) &&
    isGitCommit(value["source_commit"]) &&
    isNonEmpty(value["previous_latest_version"]) &&
    SEMVER.test(value["previous_latest_version"]) &&
    isDigestArray(value["predecessor_receipt_digests"]) &&
    value["predecessor_receipt_digests"].length === 2 &&
    isDigest(value["candidate_receipt_digest"]) &&
    isDigest(value["authorization_receipt_digest"])
  )
}

function validatePromotionRegistryVerification(
  value: unknown,
): value is PromotionRegistryVerificationV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["registry", "latest_version", "package_integrity", "verified_at"]) &&
    value["registry"] === "https://registry.npmjs.org/" &&
    isNonEmpty(value["latest_version"]) &&
    SEMVER.test(value["latest_version"]) &&
    isSha512Sri(value["package_integrity"]) &&
    isCanonicalTime(value["verified_at"])
  )
}

function validatePromotionCompletionReceiptUnchecked(
  value: unknown,
  expected?: PromotionCompletionExpectation,
): ReceiptValidation {
  if (!isRecord(value)) return { valid: false, error: "MALFORMED_RECEIPT" }
  if (containsForbiddenSelfKey(value["promotion_completion_payload_v1"])) {
    return { valid: false, error: "SELF_REFERENCE" }
  }
  if (
    !hasExactKeys(value, [
      "receipt_schema_version",
      "promotion_completion_payload_v1",
      "promotion_completion_payload_digest_v1",
      "registry_verification",
      "receipt_digest_v1",
    ]) ||
    value["receipt_schema_version"] !== "promotion-completion-receipt.v1" ||
    !validatePromotionCompletionPayload(value["promotion_completion_payload_v1"]) ||
    !isDigest(value["promotion_completion_payload_digest_v1"]) ||
    !validatePromotionRegistryVerification(value["registry_verification"]) ||
    !isDigest(value["receipt_digest_v1"])
  ) {
    return { valid: false, error: "MALFORMED_RECEIPT" }
  }
  const payload = value["promotion_completion_payload_v1"]
  const registry = value["registry_verification"]
  if (
    registry.latest_version !== payload.package_version ||
    registry.package_integrity !== payload.package_integrity ||
    Date.parse(registry.verified_at) < Date.parse(payload.first_seen_at) ||
    Date.parse(registry.verified_at) > Date.parse(payload.deadline_at)
  ) {
    return { valid: false, error: "TRANSITION_INELIGIBLE" }
  }
  if (
    expected !== undefined &&
    (!isCanonicalTime(expected.authorization_approved_at) ||
      payload.event_id !== expected.event_id ||
      payload.prior_transition_digest !== expected.prior_transition_digest ||
      payload.first_seen_at !== expected.first_seen_at ||
      payload.deadline_at !== expected.deadline_at ||
      payload.release_data_digest_v1 !== expected.release_data_digest_v1 ||
      payload.package_name !== expected.package_name ||
      payload.package_version !== expected.package_version ||
      payload.package_integrity !== expected.package_integrity ||
      payload.source_commit !== expected.source_commit ||
      payload.previous_latest_version !== expected.previous_latest_version ||
      payload.candidate_receipt_digest !== expected.candidate_receipt_digest ||
      payload.authorization_receipt_digest !== expected.authorization_receipt_digest ||
      payload.predecessor_receipt_digests.length !== expected.predecessor_receipt_digests.length ||
      !payload.predecessor_receipt_digests.every(
        (digest, index) => digest === expected.predecessor_receipt_digests[index],
      ) ||
      Date.parse(registry.verified_at) < Date.parse(expected.authorization_approved_at))
  ) {
    return { valid: false, error: "TRANSITION_INELIGIBLE" }
  }
  const payloadDigest = value["promotion_completion_payload_digest_v1"]
  if (sha256Jcs(payload) !== payloadDigest) {
    return { valid: false, error: "INNER_DIGEST_MISMATCH" }
  }
  const projection = {
    receipt_schema_version: "promotion-completion-receipt.v1",
    promotion_completion_payload_v1: payload,
    promotion_completion_payload_digest_v1: payloadDigest,
    registry_verification: registry,
  }
  const receiptDigest = value["receipt_digest_v1"]
  if (sha256Jcs(projection) !== receiptDigest) {
    return { valid: false, error: "OUTER_DIGEST_MISMATCH" }
  }
  return { valid: true, receipt_digest: receiptDigest }
}
export interface ReleaseTransitionExpectation<T extends ReleaseTransition = ReleaseTransition> {
  readonly transition: T
  readonly event_id: string
  readonly prior_transition_digest: string
  readonly prior_transition_at: string
  readonly first_seen_at: string
  readonly deadline_at: string
  readonly source_sha256: string
  readonly accepted_baseline_source_sha256: string | null
  readonly observed_source_sha256s: readonly string[]
  readonly release_data_digest_v1: string
  readonly package_version: string
  readonly package_integrity: string
  readonly predecessor_receipt_digests: readonly string[]
  readonly previous_latest_version: string
  readonly evidence_digest_bindings: ReleaseEvidenceDigestBindingsV1[T]
}

export function currentNonBaselineSourceChecksum(
  acceptedBaselineSourceSha256: string | null,
  observedSourceSha256s: readonly string[],
): string | null {
  if (
    acceptedBaselineSourceSha256 === null ||
    !isDigest(acceptedBaselineSourceSha256) ||
    observedSourceSha256s.length === 0 ||
    new Set(observedSourceSha256s).size !== observedSourceSha256s.length ||
    !observedSourceSha256s.every(isDigest)
  ) {
    return null
  }
  const current = observedSourceSha256s[observedSourceSha256s.length - 1] ?? null
  return current !== acceptedBaselineSourceSha256 ? current : null
}

function validateReleaseTransitionReceiptUnchecked<T extends ReleaseTransition>(
  value: unknown,
  expected?: ReleaseTransitionExpectation<T>,
): ReceiptValidation {
  if (!isRecord(value)) return { valid: false, error: "MALFORMED_RECEIPT" }
  if (containsForbiddenSelfKey(value["release_transition_evidence_payload_v1"])) {
    return { valid: false, error: "SELF_REFERENCE" }
  }
  if (
    !hasExactKeys(value, [
      "receipt_schema_version",
      "release_transition_evidence_payload_v1",
      "release_transition_evidence_digest_v1",
      "approval",
      "release_transition_receipt_digest_v1",
    ]) ||
    value["receipt_schema_version"] !== "release-transition-receipt.v1" ||
    !validateReleasePayload(value["release_transition_evidence_payload_v1"]) ||
    !isDigest(value["release_transition_evidence_digest_v1"]) ||
    !validateReleaseApproval(value["approval"]) ||
    !isDigest(value["release_transition_receipt_digest_v1"])
  ) {
    return { valid: false, error: "MALFORMED_RECEIPT" }
  }
  const payload = value["release_transition_evidence_payload_v1"]
  const currentSourceSha =
    expected === undefined
      ? null
      : currentNonBaselineSourceChecksum(
          expected.accepted_baseline_source_sha256,
          expected.observed_source_sha256s,
        )
  if (
    expected !== undefined &&
    (!isCanonicalTime(expected.prior_transition_at) ||
      !isNonEmpty(expected.previous_latest_version) ||
      !SEMVER.test(expected.previous_latest_version) ||
      currentSourceSha === null ||
      expected.source_sha256 !== currentSourceSha ||
      payload.transition !== expected.transition ||
      payload.event_id !== expected.event_id ||
      payload.prior_transition_digest !== expected.prior_transition_digest ||
      payload.first_seen_at !== expected.first_seen_at ||
      payload.deadline_at !== expected.deadline_at ||
      payload.source_sha256 !== currentSourceSha ||
      payload.release_data_digest_v1 !== expected.release_data_digest_v1 ||
      payload.package_name !== RELEASE_PACKAGE_NAME ||
      payload.package_version !== expected.package_version ||
      payload.package_integrity !== expected.package_integrity ||
      payload.previous_latest_version !== expected.previous_latest_version)
  ) {
    return { valid: false, error: "TRANSITION_INELIGIBLE" }
  }
  if (
    expected !== undefined &&
    (payload.predecessor_receipt_digests.length !==
      expected.predecessor_receipt_digests.length ||
      !payload.predecessor_receipt_digests.every(
        (digest, index) => digest === expected.predecessor_receipt_digests[index],
      ))
  ) {
    return { valid: false, error: "PREDECESSOR_MISMATCH" }
  }
  if (expected !== undefined) {
    const expectedEvidenceKinds = RELEASE_EVIDENCE_KINDS[expected.transition]
    const bindings = expected.evidence_digest_bindings
    if (!isRecord(bindings) || !hasExactKeys(bindings, expectedEvidenceKinds)) {
      return { valid: false, error: "TRANSITION_INELIGIBLE" }
    }
    for (const [index, evidence] of payload.evidence_digests.entries()) {
      const kind = expectedEvidenceKinds[index]
      const digest = kind === undefined ? undefined : Reflect.get(bindings, kind)
      if (
        kind === undefined ||
        evidence.kind !== kind ||
        !isDigest(digest) ||
        evidence.digest !== digest
      ) {
        return { valid: false, error: "TRANSITION_INELIGIBLE" }
      }
    }
  }
  const payloadDigest = value["release_transition_evidence_digest_v1"]
  if (sha256Jcs(payload) !== payloadDigest) return { valid: false, error: "INNER_DIGEST_MISMATCH" }
  const approval = value["approval"]
  if (
    approval.decision !== payload.transition ||
    approval.release_transition_evidence_digest_v1 !== payloadDigest ||
    Date.parse(approval.approved_at) < Date.parse(payload.first_seen_at) ||
    (expected !== undefined &&
      Date.parse(approval.approved_at) < Date.parse(expected.prior_transition_at))
  ) {
    return { valid: false, error: "APPROVAL_INVALID" }
  }
  if (sha256Jcs(releaseApprovalProjection(approval)) !== approval.attestation_digest) {
    return { valid: false, error: "ATTESTATION_DIGEST_MISMATCH" }
  }
  const projection = {
    receipt_schema_version: "release-transition-receipt.v1",
    release_transition_evidence_payload_v1: payload,
    release_transition_evidence_digest_v1: payloadDigest,
    approval,
  }
  const receiptDigest = value["release_transition_receipt_digest_v1"]
  if (sha256Jcs(projection) !== receiptDigest) return { valid: false, error: "OUTER_DIGEST_MISMATCH" }
  return { valid: true, receipt_digest: receiptDigest }
}
export function validateBackendSelectionReceipt(value: unknown): ReceiptValidation {
  try {
    return validateBackendSelectionReceiptUnchecked(value)
  } catch {
    return { valid: false, error: "MALFORMED_RECEIPT" }
  }
}

export function validateVerifiedNoChangeReceipt(
  value: unknown,
  expected?: VerifiedNoChangeExpectation,
): ReceiptValidation {
  try {
    return validateVerifiedNoChangeReceiptUnchecked(value, expected)
  } catch {
    return { valid: false, error: "MALFORMED_RECEIPT" }
  }
}

export function validatePromotionCompletionReceipt(
  value: unknown,
  expected?: PromotionCompletionExpectation,
): ReceiptValidation {
  try {
    return validatePromotionCompletionReceiptUnchecked(value, expected)
  } catch {
    return { valid: false, error: "MALFORMED_RECEIPT" }
  }
}
export function validateReleaseTransitionReceipt<T extends ReleaseTransition>(
  value: unknown,
  expected?: ReleaseTransitionExpectation<T>,
): ReceiptValidation {
  try {
    return validateReleaseTransitionReceiptUnchecked(value, expected)
  } catch {
    return { valid: false, error: "MALFORMED_RECEIPT" }
  }
}
