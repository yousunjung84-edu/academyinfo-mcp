import { createHash } from "node:crypto"
import { lstatSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const DIGEST = /^[a-f0-9]{64}$/
const COMMIT = /^[a-f0-9]{40}$/
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const EVENT_ID = /^(?:source|acquisition|availability):v1:[a-f0-9]{64}$/
const APPROVER = /^[A-Za-z0-9](?:[A-Za-z0-9._@-]{0,127})$/u
const KINDS = new Set(["candidate-authorization", "candidate", "client"])
const RECEIPT_LIMIT = 1024 * 1024
const PRIVATE_MATERIAL = /(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|\/(?:Users|home|private|tmp)\/|\/var\/folders\/|[A-Za-z]:[\\/](?:Users|Temp|Documents and Settings)[\\/]|\\\\[^\\\r\n]+\\[^\\\r\n]+|(?:Bearer|Basic)\s+[A-Za-z0-9+/=_-]+|\b(?:npm_|github_pat_|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_./+=-]*|\b(?:password|secret|token|credential)\s*[:=]\s*\S+)/iu
const SENSITIVE_KEY = /(?:^|_)(?:password|secret|token|credential|private_key|api_key|service_key|access_key)(?:_|$)/u
export const PUBLIC_RECEIPT_IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,63})$/u
export const POLICY_VERSION_CONTRACT = Object.freeze({
  "candidate-authorization": Object.freeze([
    Object.freeze({ policy: "backend", version: "v1" }),
    Object.freeze({ policy: "privacy", version: "v1" }),
    Object.freeze({ policy: "release", version: "v1" }),
    Object.freeze({ policy: "semantic", version: "v1" }),
  ]),
  candidate: Object.freeze([
    Object.freeze({ policy: "backend", version: "v1" }),
    Object.freeze({ policy: "privacy", version: "v1" }),
    Object.freeze({ policy: "release", version: "v1" }),
    Object.freeze({ policy: "semantic", version: "v1" }),
  ]),
  client: Object.freeze([
    Object.freeze({ policy: "actual-client", version: "v1" }),
    Object.freeze({ policy: "public-install", version: "v1" }),
    Object.freeze({ policy: "release", version: "v1" }),
  ]),
})
const EVIDENCE_KINDS = {
  "candidate-authorization": [
    "backend-decision",
    "release-data",
    "source-revision",
    "version-registry-state",
  ],
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
}
const SELF_KEYS = new Set([
  "evidence_payload_digest_v1",
  "receipt_digest_v1",
  "release_transition_evidence_digest_v1",
  "release_transition_receipt_digest_v1",
  "attestation_digest",
  "approval",
  "approvals",
])

function reject(condition) {
  if (!condition) throw new Error("Receipt verification rejected")
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function exactKeys(value, keys) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function hasLoneSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) return true
  }
  return false
}

export function canonicalizeJcs(value) {
  if (value === null) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "string") {
    reject(!hasLoneSurrogate(value))
    return JSON.stringify(value)
  }
  if (typeof value === "number") {
    reject(Number.isFinite(value))
    return JSON.stringify(value)
  }
  reject(typeof value === "object")
  if (Array.isArray(value)) return `[${value.map(canonicalizeJcs).join(",")}]`
  reject(isRecord(value))
  return `{${Object.keys(value).sort().map((key) => `${canonicalizeJcs(key)}:${canonicalizeJcs(value[key])}`).join(",")}}`
}

export function sha256Jcs(value) {
  return createHash("sha256").update(canonicalizeJcs(value), "utf8").digest("hex")
}
export function releaseTransitionDigest(transition, expectedDigest = undefined) {
  reject(
    exactKeys(transition, [
      "transition_schema_version",
      "event_id",
      "predecessor_transition_digest",
      "state",
      "occurred_at",
      "receipt_digest",
    ]) &&
      transition.transition_schema_version === 1 &&
      typeof transition.event_id === "string" &&
      EVENT_ID.test(transition.event_id) &&
      typeof transition.predecessor_transition_digest === "string" &&
      DIGEST.test(transition.predecessor_transition_digest) &&
      (transition.state === "CANDIDATE_PUBLISHED" || transition.state === "CLIENT_VERIFIED") &&
      validTime(transition.occurred_at) &&
      typeof transition.receipt_digest === "string" &&
      DIGEST.test(transition.receipt_digest),
  )
  const digest = sha256Jcs(transition)
  if (expectedDigest !== undefined) {
    reject(typeof expectedDigest === "string" && DIGEST.test(expectedDigest) && digest === expectedDigest)
  }
  return digest
}

export function validateClosedExactFields(value, expected) {
  reject(isRecord(value) && isRecord(expected))
  reject(exactKeys(value, Object.keys(expected)))
  reject(canonicalizeJcs(value) === canonicalizeJcs(expected))
}

class StrictJsonParser {
  constructor(text) {
    this.text = text
    this.index = 0
  }

  parse() {
    const value = this.value()
    this.space()
    reject(this.index === this.text.length)
    return value
  }

  space() {
    while (/\s/u.test(this.text[this.index] ?? "")) this.index += 1
  }

  value() {
    this.space()
    const char = this.text[this.index]
    if (char === "{") return this.object()
    if (char === "[") return this.array()
    if (char === '"') return this.string()
    for (const [token, value] of [["true", true], ["false", false], ["null", null]]) {
      if (this.text.startsWith(token, this.index)) {
        this.index += token.length
        return value
      }
    }
    const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
    match.lastIndex = this.index
    const found = match.exec(this.text)
    reject(found !== null)
    this.index = match.lastIndex
    const number = Number(found[0])
    reject(Number.isFinite(number))
    return number
  }

  string() {
    const start = this.index
    this.index += 1
    for (;;) {
      const char = this.text[this.index]
      reject(char !== undefined && char.charCodeAt(0) >= 0x20)
      if (char === '"') {
        this.index += 1
        return JSON.parse(this.text.slice(start, this.index))
      }
      if (char === "\\") {
        this.index += 1
        const escaped = this.text[this.index]
        reject(escaped !== undefined && '"\\/bfnrtu'.includes(escaped))
        if (escaped === "u") {
          reject(/^[a-fA-F0-9]{4}$/.test(this.text.slice(this.index + 1, this.index + 5)))
          this.index += 4
        }
      }
      this.index += 1
    }
  }

  object() {
    this.index += 1
    const result = {}
    const seen = new Set()
    this.space()
    if (this.text[this.index] === "}") {
      this.index += 1
      return result
    }
    for (;;) {
      this.space()
      reject(this.text[this.index] === '"')
      const key = this.string()
      reject(!seen.has(key))
      seen.add(key)
      this.space()
      reject(this.text[this.index] === ":")
      this.index += 1
      result[key] = this.value()
      this.space()
      const delimiter = this.text[this.index]
      reject(delimiter === "," || delimiter === "}")
      this.index += 1
      if (delimiter === "}") return result
    }
  }

  array() {
    this.index += 1
    const result = []
    this.space()
    if (this.text[this.index] === "]") {
      this.index += 1
      return result
    }
    for (;;) {
      result.push(this.value())
      this.space()
      const delimiter = this.text[this.index]
      reject(delimiter === "," || delimiter === "]")
      this.index += 1
      if (delimiter === "]") return result
    }
  }
}

export function parseJsonStrict(text) {
  return new StrictJsonParser(text).parse()
}

function noSelfKey(value) {
  if (Array.isArray(value)) return value.every(noSelfKey)
  if (!isRecord(value)) return true
  return Object.entries(value).every(([key, child]) => !SELF_KEYS.has(key) && noSelfKey(child))
}
function publicPayloadSafe(value) {
  if (typeof value === "string") {
    return value.length <= 1024 && !PRIVATE_MATERIAL.test(value)
  }
  if (Array.isArray(value)) return value.every(publicPayloadSafe)
  if (!isRecord(value)) return value === null || typeof value === "boolean" || typeof value === "number"
  return Object.entries(value).every(
    ([key, child]) => !SENSITIVE_KEY.test(key) && publicPayloadSafe(child),
  )
}

function validTime(value) {
  return typeof value === "string" && TIME.test(value) && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value
}
export function validReceiptIntegrity(value) {
  if (typeof value !== "string" || !/^sha512-(?:[A-Za-z0-9+/]{4}){21}[A-Za-z0-9+/]{2}==$/.test(value)) return false
  const encoded = value.slice("sha512-".length)
  const digest = Buffer.from(encoded, "base64")
  return digest.byteLength === 64 && digest.toString("base64") === encoded
}

function validDigestArray(value, exactLength) {
  return Array.isArray(value) && value.length === exactLength && value.every((item) => typeof item === "string" && DIGEST.test(item)) && new Set(value).size === value.length
}

function validEvidenceDigests(value, kind) {
  const expectedKinds = EVIDENCE_KINDS[kind]
  return (
    Array.isArray(expectedKinds) &&
    Array.isArray(value) &&
    value.length === expectedKinds.length &&
    value.every(
      (entry, index) =>
        isRecord(entry) &&
        exactKeys(entry, ["kind", "digest"]) &&
        entry.kind === expectedKinds[index] &&
        DIGEST.test(entry.digest),
    )
  )
}

export function validPolicyVersions(value, kind) {
  const expected = POLICY_VERSION_CONTRACT[kind]
  return (
    Array.isArray(expected) &&
    Array.isArray(value) &&
    canonicalizeJcs(value) === canonicalizeJcs(expected)
  )
}

function exactPredecessors(kind) {
  if (kind === "candidate" || kind === "client") return 1
  return 0
}

function expectedPredecessors(options) {
  const expected = options.expectedPredecessors ??
    (options.expectedPredecessor === undefined ? undefined : [options.expectedPredecessor])
  const exactLength = exactPredecessors(options.kind)
  if (exactLength === 0) {
    reject(expected === undefined || validDigestArray(expected, 0))
    return []
  }
  reject(validDigestArray(expected, exactLength))
  return expected
}

function validateIdentity(payload, options, predecessors) {
  reject(payload.transition === options.kind)
  reject(payload.package_name === options.packageName)
  reject(payload.package_version === options.packageVersion && SEMVER.test(payload.package_version))
  reject(COMMIT.test(payload.source_commit))
  if (options.sourceCommit !== undefined) reject(payload.source_commit === options.sourceCommit)
  reject(payload.package_integrity === options.packageIntegrity)
  reject(validDigestArray(payload.predecessor_receipt_digests, exactPredecessors(options.kind)))
  reject(payload.predecessor_receipt_digests.every((digest, index) => digest === predecessors[index]))
  if (options.previousLatest !== undefined) reject(payload.previous_latest_version === options.previousLatest)
  if (payload.previous_latest_version !== null) reject(SEMVER.test(payload.previous_latest_version))
  if (options.kind === "promotion" || options.kind === "rollback") {
    reject(typeof payload.previous_latest_version === "string" && payload.previous_latest_version !== payload.package_version)
  }
  if (options.eventId !== undefined) reject(payload.event_id === options.eventId)
  if (options.releaseDataDigest !== undefined) reject(payload.release_data_digest_v1 === options.releaseDataDigest)
  if (options.priorTransitionDigest !== undefined) reject(payload.prior_transition_digest === options.priorTransitionDigest)
  if (options.firstSeenAt !== undefined) reject(payload.first_seen_at === options.firstSeenAt)
  if (options.deadlineAt !== undefined) reject(payload.deadline_at === options.deadlineAt)
}

function validateApproval(approval, kind, payloadDigest, digestKey, expectedApprover) {
  reject(isRecord(approval))
  reject(exactKeys(approval, ["role", "identity", "approved_at", "decision", digestKey, "attestation_digest"]))
  reject(approval.role === "administrator" && approval.identity === expectedApprover)
  reject(validTime(approval.approved_at) && approval.decision === kind)
  reject(approval[digestKey] === payloadDigest && DIGEST.test(approval.attestation_digest))
  const { attestation_digest: digest, ...projection } = approval
  reject(sha256Jcs(projection) === digest)
}

function validateGenericReceipt(receipt, options) {
  reject(exactKeys(receipt, ["receipt_schema_version", "evidence_payload_v1", "evidence_payload_digest_v1", "approval", "receipt_digest_v1"]))
  reject(receipt.receipt_schema_version === `${options.kind}-receipt.v1`)
  const payload = receipt.evidence_payload_v1
  reject(isRecord(payload) && noSelfKey(payload))
  reject(exactKeys(payload, [
    "schema_version",
    "transition",
    "package_name",
    "package_version",
    "package_integrity",
    "previous_latest_version",
    "predecessor_receipt_digests",
    "evidence_digests",
    "run_id",
    "source_commit",
    "policy_versions",
  ]))
  reject(payload.schema_version === "release-evidence-payload.v1")
  reject(typeof payload.run_id === "string" && PUBLIC_RECEIPT_IDENTIFIER.test(payload.run_id))
  reject(validPolicyVersions(payload.policy_versions, options.kind))
  reject(validEvidenceDigests(payload.evidence_digests, options.kind))
  reject(publicPayloadSafe(payload))
  reject(validReceiptIntegrity(payload.package_integrity))
  validateIdentity(payload, options, options.expectedPredecessors)
  reject(typeof receipt.evidence_payload_digest_v1 === "string" && DIGEST.test(receipt.evidence_payload_digest_v1))
  reject(sha256Jcs(payload) === receipt.evidence_payload_digest_v1)
  validateApproval(receipt.approval, options.kind, receipt.evidence_payload_digest_v1, "evidence_payload_digest_v1", options.expectedApprover)
  reject(typeof receipt.receipt_digest_v1 === "string" && DIGEST.test(receipt.receipt_digest_v1))
  const { receipt_digest_v1: digest, ...projection } = receipt
  reject(sha256Jcs(projection) === digest)
  return { payload, digest }
}

export function candidateAuthorizationContextDigest(payload) {
  return sha256Jcs({
    event_id: payload.event_id,
    prior_transition_digest: payload.prior_transition_digest,
    first_seen_at: payload.first_seen_at,
    deadline_at: payload.deadline_at,
    source_sha256: payload.source_sha256,
    release_data_digest_v1: payload.release_data_digest_v1,
  })
}

function validateModuleReceipt(receipt, options) {
  reject(options.kind === "candidate-authorization")
  reject(exactKeys(receipt, [
    "receipt_schema_version",
    "release_transition_evidence_payload_v1",
    "release_transition_evidence_digest_v1",
    "approval",
    "release_transition_receipt_digest_v1",
  ]))
  reject(receipt.receipt_schema_version === "release-transition-receipt.v1")
  const payload = receipt.release_transition_evidence_payload_v1
  reject(isRecord(payload) && noSelfKey(payload))
  reject(exactKeys(payload, [
    "schema_version", "transition", "event_id", "prior_transition_digest", "first_seen_at", "deadline_at",
    "source_sha256", "release_data_digest_v1", "package_name", "package_version", "package_integrity",
    "previous_latest_version", "predecessor_receipt_digests", "evidence_digests", "run_id", "source_commit", "policy_versions",
  ]))
  reject(payload.schema_version === "release-transition-evidence-payload.v1")
  reject(typeof payload.event_id === "string" && EVENT_ID.test(payload.event_id))
  reject(DIGEST.test(payload.prior_transition_digest) && DIGEST.test(payload.source_sha256) && DIGEST.test(payload.release_data_digest_v1))
  reject(validTime(payload.first_seen_at) && validTime(payload.deadline_at) && Date.parse(payload.deadline_at) - Date.parse(payload.first_seen_at) === 604_800_000)
  reject(payload.package_integrity === null)
  reject(typeof payload.run_id === "string" && PUBLIC_RECEIPT_IDENTIFIER.test(payload.run_id))
  reject(validPolicyVersions(payload.policy_versions, options.kind))
  reject(validEvidenceDigests(payload.evidence_digests, options.kind))
  reject(publicPayloadSafe(payload))
  validateIdentity(payload, options, options.expectedPredecessors)
  reject(
    candidateAuthorizationContextDigest(payload) === options.authorizationContextDigest,
  )
  const payloadDigest = receipt.release_transition_evidence_digest_v1
  reject(typeof payloadDigest === "string" && DIGEST.test(payloadDigest) && sha256Jcs(payload) === payloadDigest)
  validateApproval(receipt.approval, options.kind, payloadDigest, "release_transition_evidence_digest_v1", options.expectedApprover)
  const digest = receipt.release_transition_receipt_digest_v1
  reject(typeof digest === "string" && DIGEST.test(digest))
  const { release_transition_receipt_digest_v1: omitted, ...projection } = receipt
  reject(sha256Jcs(projection) === digest)
  return { payload, digest }
}

export function verifyReceipt(receipt, options) {
  reject(isRecord(receipt) && KINDS.has(options.kind))
  reject(DIGEST.test(options.expectedDigest) && SEMVER.test(options.packageVersion))
  reject(COMMIT.test(options.sourceCommit))
  reject(typeof options.packageName === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(options.packageName))
  reject(typeof options.expectedApprover === "string" && APPROVER.test(options.expectedApprover))
  if (options.previousLatest !== undefined) reject(SEMVER.test(options.previousLatest))
  if (options.kind === "candidate-authorization") reject(options.packageIntegrity === undefined)
  else reject(validReceiptIntegrity(options.packageIntegrity))
  if (options.kind === "candidate-authorization") {
    reject(DIGEST.test(options.authorizationContextDigest))
  } else {
    reject(options.authorizationContextDigest === undefined)
  }
  if (options.eventId !== undefined) reject(EVENT_ID.test(options.eventId))
  if (options.releaseDataDigest !== undefined) reject(DIGEST.test(options.releaseDataDigest))
  if (options.priorTransitionDigest !== undefined) reject(DIGEST.test(options.priorTransitionDigest))
  if (options.firstSeenAt !== undefined) reject(validTime(options.firstSeenAt))
  if (options.deadlineAt !== undefined) reject(validTime(options.deadlineAt))
  const predecessors = expectedPredecessors(options)
  if (options.kind === "client") reject(options.previousLatest !== undefined)
  const verificationOptions = {
    ...options,
    packageIntegrity: options.kind === "candidate-authorization" ? null : options.packageIntegrity,
    expectedPredecessors: predecessors,
  }
  const result = options.kind === "candidate-authorization"
    ? validateModuleReceipt(receipt, verificationOptions)
    : validateGenericReceipt(receipt, verificationOptions)
  reject(result.digest === options.expectedDigest)
  return { kind: options.kind, receiptDigest: result.digest }
}

function parseArgs(argv) {
  const allowed = new Set([
    "--receipt", "--kind", "--expected-digest", "--expected-predecessor", "--source-commit",
    "--package-name", "--package-version", "--package-integrity", "--expected-approver", "--previous-latest",
    "--event-id", "--release-data-digest", "--prior-transition-digest", "--first-seen-at", "--deadline-at",
    "--expected-authorization-context-digest",
  ])
  const values = new Map()
  const expectedPredecessors = []
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    reject(key !== undefined && value !== undefined && allowed.has(key))
    if (key === "--expected-predecessor") expectedPredecessors.push(value)
    else {
      reject(!values.has(key))
      values.set(key, value)
    }
  }
  for (const key of ["--receipt", "--kind", "--expected-digest", "--source-commit", "--package-name", "--package-version", "--expected-approver"]) reject(values.has(key))
  const options = {
    receipt: values.get("--receipt"),
    kind: values.get("--kind"),
    expectedDigest: values.get("--expected-digest"),
    packageName: values.get("--package-name"),
    packageVersion: values.get("--package-version"),
    expectedApprover: values.get("--expected-approver"),
    expectedPredecessors,
  }
  if (values.has("--source-commit")) options.sourceCommit = values.get("--source-commit")
  if (values.has("--previous-latest")) options.previousLatest = values.get("--previous-latest")
  if (values.has("--package-integrity")) options.packageIntegrity = values.get("--package-integrity")
  if (values.has("--event-id")) options.eventId = values.get("--event-id")
  if (values.has("--release-data-digest")) options.releaseDataDigest = values.get("--release-data-digest")
  if (values.has("--prior-transition-digest")) options.priorTransitionDigest = values.get("--prior-transition-digest")
  if (values.has("--first-seen-at")) options.firstSeenAt = values.get("--first-seen-at")
  if (values.has("--deadline-at")) options.deadlineAt = values.get("--deadline-at")
  if (values.has("--expected-authorization-context-digest")) {
    options.authorizationContextDigest = values.get("--expected-authorization-context-digest")
  }
  return options
}

export function validReceiptMode(mode, platform = process.platform) {
  return platform === "win32" || (mode & 0o133) === 0
}

function readReceipt(path) {
  const stat = lstatSync(path)
  reject(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= RECEIPT_LIMIT)
  reject(validReceiptMode(stat.mode))
  const bytes = readFileSync(path)
  reject(bytes.byteLength === stat.size && !PRIVATE_MATERIAL.test(bytes.toString("utf8")))
  return parseJsonStrict(bytes.toString("utf8"))
}

const entryPoint = process.argv[1]
if (entryPoint !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(entryPoint)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    verifyReceipt(readReceipt(options.receipt), options)
    process.stderr.write("release-receipt-verify: valid\n")
  } catch {
    process.stderr.write("release-receipt-verify: rejected\n")
    process.exitCode = 1
  }
}
