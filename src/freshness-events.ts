import {
  currentNonBaselineSourceChecksum,
  sha256Jcs,
  validatePromotionCompletionReceipt,
  validateReleaseTransitionReceipt,
  validateVerifiedNoChangeReceipt,
} from "./release-receipts.js"
import type {
  JsonValue,
  ReleaseTransition,
  ReleaseEvidenceDigestBindingsV1,
  PromotionCompletionReceiptV1,
  ReleaseTransitionReceiptV1,
  VerifiedNoChangeReceiptV1,
} from "./release-receipts.js"

export const FAILURE_PRECEDENCE = [
  "PAGE_UNREACHABLE",
  "PAGE_HTTP_ERROR",
  "PAGE_BODY_LIMIT",
  "PAGE_METADATA_INVALID",
  "DOWNLOAD_LINK_MISSING",
  "DOWNLOAD_LINK_POLICY_REJECTED",
  "DOWNLOAD_REDIRECT_POLICY_REJECTED",
  "DOWNLOAD_UNREACHABLE",
  "DOWNLOAD_TIMEOUT",
  "DOWNLOAD_HTTP_ERROR",
  "DOWNLOAD_BODY_LIMIT",
  "DOWNLOAD_CONTENT_TYPE_MISMATCH",
  "DOWNLOAD_ARCHIVE_INVALID",
] as const

export type FailureClassV1 = (typeof FAILURE_PRECEDENCE)[number]
export type ProvisionalKind = "availability" | "acquisition"
export type FreshnessState =
  | "DETECTED"
  | "ACQUISITION_FAILED"
  | "VALIDATION_FAILED"
  | "VALIDATED"
  | "PR_OPEN"
  | "MERGED"
  | "CANDIDATE_PUBLISHED"
  | "CLIENT_VERIFIED"
  | "PROMOTED_CLOSED"
  | "VERIFIED_NO_CHANGE_CLOSED"
  | "ROLLED_BACK_REOPENED"
  | "BLOCKED"

export interface TimestampResult {
  readonly normalized: string | null
  readonly evidence_code: "INVALID_OFFICIAL_TIMESTAMP" | null
  readonly failure_class: "PAGE_METADATA_INVALID" | null
}

export interface SourceMetadataInputV1 {
  readonly dataset_id: string
  readonly canonical_page_url: string
  readonly source_filename: string | null
  readonly official_modified_at: string | null
  readonly record_version: string | null
  readonly license: "KOGL-1" | null
  readonly download_url: string | null
  readonly advertised_size: number | null
  readonly etag: string | null
  readonly last_modified: string | null
}

export interface MetadataProjectionV1 {
  readonly schema_version: 1
  readonly dataset_id: string
  readonly canonical_page_url: string
  readonly source_filename: string | null
  readonly official_modified_at: string | null
  readonly record_version: string | null
  readonly license: "KOGL-1" | null
  readonly download_origin: string | null
  readonly download_path: string | null
  readonly advertised_size: number | null
  readonly etag: string | null
  readonly last_modified: string | null
}

export type MetadataFingerprintResult =
  | {
      readonly valid: true
      readonly projection: MetadataProjectionV1
      readonly metadata_fingerprint_v1: string
      readonly evidence_codes: readonly []
    }
  | {
      readonly valid: false
      readonly projection: MetadataProjectionV1 | null
      readonly metadata_fingerprint_v1: string | null
      readonly evidence_codes: readonly ["INVALID_OFFICIAL_TIMESTAMP"] | readonly ["PAGE_METADATA_INVALID"]
    }

export interface ProvisionalObservationV1 {
  readonly event_id_schema_version: 1
  readonly dataset_id: string
  readonly canonical_page_url: string
  readonly metadata_fingerprint_v1: string | null
  readonly last_accepted_source_sha256: string | null
  readonly last_accepted_release_data_digest_v1: string | null
  readonly observed_at: string
  readonly observed_failures: readonly FailureClassV1[]
}

export interface FreshnessIncidentV1 {
  readonly event_schema_version: 1
  readonly original_event_id: string
  readonly kind: ProvisionalKind | "changed_source"
  readonly dataset_id: string
  readonly canonical_page_url: string
  readonly last_accepted_source_sha256: string | null
  readonly last_accepted_release_data_digest_v1: string | null
  readonly original_metadata_fingerprint_v1: string | null
  readonly current_metadata_fingerprint_v1: string | null
  readonly metadata_fingerprint_aliases: readonly string[]
  readonly event_id_aliases: readonly string[]
  readonly observed_failure_classes: readonly FailureClassV1[]
  readonly observed_source_sha256s: readonly string[]
  readonly first_seen_at: string
  readonly deadline_at: string
  readonly state: FreshnessState
  readonly last_transition_at: string
  readonly transition_digest: string
  readonly receipt_digests: readonly string[]
  readonly release_cycle_start_index: number
  readonly active_release_data_digest_v1: string | null
  readonly active_package_name: string | null
  readonly active_package_version: string | null
  readonly active_package_integrity: string | null
  readonly bound_previous_latest_version: string | null
}

export type IncidentMutationResult =
  | { readonly applied: true; readonly incident: FreshnessIncidentV1; readonly changed: boolean }
  | {
      readonly applied: false
      readonly error:
        | "INVALID_WORKFLOW_TIME"
        | "INVALID_OBSERVATION"
        | "NO_ELIGIBLE_INCIDENT"
        | "RECEIPT_INVALID"
        | "TRANSITION_INELIGIBLE"
        | "CONFLICTING_RECEIPT"
    }

const SHA256 = /^[0-9a-f]{64}$/
const RELEASE_PACKAGE_NAME = "academyinfo-mcp"
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/
const IMF_FIXDATE = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
const MONTHS: Readonly<Record<string, number>> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
}
const OPEN_STATES = new Set<FreshnessState>([
  "DETECTED",
  "ACQUISITION_FAILED",
  "VALIDATION_FAILED",
  "VALIDATED",
  "PR_OPEN",
  "MERGED",
  "CANDIDATE_PUBLISHED",
  "CLIENT_VERIFIED",
  "ROLLED_BACK_REOPENED",
  "BLOCKED",
])

function exactUtcEpoch(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): number | null {
  if (
    year < 0 ||
    year > 9999 ||
    month < 0 ||
    month > 11 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    millisecond > 999
  ) {
    return null
  }
  const date = new Date(0)
  date.setUTCFullYear(year, month, day)
  date.setUTCHours(hour, minute, second, millisecond)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    return null
  }
  return date.getTime()
}

export function parseRfc3339Timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null
  const match = RFC3339.exec(value)
  if (match === null) return null
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = "", zone] = match
  if (
    yearText === undefined ||
    monthText === undefined ||
    dayText === undefined ||
    hourText === undefined ||
    minuteText === undefined ||
    secondText === undefined ||
    zone === undefined
  ) {
    return null
  }
  const epoch = exactUtcEpoch(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
    Number(secondText),
    Number(fraction.padEnd(3, "0")),
  )
  if (epoch === null) return null
  let offsetMilliseconds = 0
  if (zone !== "Z") {
    const offsetHours = Number(zone.slice(1, 3))
    const offsetMinutes = Number(zone.slice(4, 6))
    if (offsetHours > 23 || offsetMinutes > 59 || zone === "-00:00") return null
    const sign = zone[0] === "+" ? 1 : -1
    offsetMilliseconds = sign * (offsetHours * 60 + offsetMinutes) * 60_000
  }
  const normalizedEpoch = epoch - offsetMilliseconds
  if (!Number.isFinite(normalizedEpoch)) return null
  try {
    const normalized = new Date(normalizedEpoch).toISOString()
    return /^\d{4}-\d{2}-\d{2}T/.test(normalized) ? normalized : null
  } catch {
    return null
  }
}

export function parseImfFixdate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const match = IMF_FIXDATE.exec(value)
  if (match === null) return null
  const [, weekday, dayText, monthText, yearText, hourText, minuteText, secondText] = match
  if (
    weekday === undefined ||
    dayText === undefined ||
    monthText === undefined ||
    yearText === undefined ||
    hourText === undefined ||
    minuteText === undefined ||
    secondText === undefined
  ) {
    return null
  }
  const month = MONTHS[monthText]
  if (month === undefined) return null
  const epoch = exactUtcEpoch(
    Number(yearText),
    month,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
    Number(secondText),
    0,
  )
  if (epoch === null || WEEKDAYS[new Date(epoch).getUTCDay()] !== weekday) return null
  return new Date(epoch).toISOString()
}

export function parseOfficialTimestamp(value: unknown): TimestampResult {
  const normalized = parseRfc3339Timestamp(value) ?? parseImfFixdate(value)
  return normalized === null
    ? {
        normalized: null,
        evidence_code: "INVALID_OFFICIAL_TIMESTAMP",
        failure_class: "PAGE_METADATA_INVALID",
      }
    : { normalized, evidence_code: null, failure_class: null }
}

export function parseWorkflowTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = parseRfc3339Timestamp(value)
  return normalized === value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    ? value
    : null
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function normalizeEscapes(path: string): string {
  return path.replace(/%[0-9a-fA-F]{2}/g, (escape) => {
    const code = Number.parseInt(escape.slice(1), 16)
    const character = String.fromCharCode(code)
    return /[A-Za-z0-9\-._~]/.test(character) ? character : escape.toUpperCase()
  })
}
function removeDotSegments(path: string): string {
  const output: string[] = [""]
  for (const segment of path.split("/").slice(1)) {
    if (segment === ".") continue
    if (segment === "..") {
      if (output.length > 1) output.pop()
      continue
    }
    output.push(segment)
  }
  return output.join("/") || "/"
}


function normalizeHttpsUrl(value: string): { origin: string; path: string; url: string } | null {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") return null
    const path = removeDotSegments(normalizeEscapes(parsed.pathname))
    const origin = parsed.origin.toLowerCase()
    return { origin, path, url: `${origin}${path}` }
  } catch {
    return null
  }
}

export function fingerprintMetadata(input: SourceMetadataInputV1): MetadataFingerprintResult {
  if (
    input.dataset_id.trim() === "" ||
    input.dataset_id !== input.dataset_id.trim() ||
    !(input.advertised_size === null || (Number.isSafeInteger(input.advertised_size) && input.advertised_size >= 0))
  ) {
    return {
      valid: false,
      projection: null,
      metadata_fingerprint_v1: null,
      evidence_codes: ["PAGE_METADATA_INVALID"],
    }
  }
  const page = normalizeHttpsUrl(input.canonical_page_url)
  const download = input.download_url === null ? null : normalizeHttpsUrl(input.download_url)
  if (page === null || (input.download_url !== null && download === null)) {
    return {
      valid: false,
      projection: null,
      metadata_fingerprint_v1: null,
      evidence_codes: ["PAGE_METADATA_INVALID"],
    }
  }
  const official =
    input.official_modified_at === null
      ? { normalized: null, evidence_code: null, failure_class: null }
      : parseOfficialTimestamp(input.official_modified_at)
  const normalizedLastModified =
    input.last_modified === null ? null : parseImfFixdate(input.last_modified)
  const lastModified: TimestampResult =
    input.last_modified === null || normalizedLastModified !== null
      ? {
          normalized: normalizedLastModified,
          evidence_code: null,
          failure_class: null,
        }
      : {
          normalized: null,
          evidence_code: "INVALID_OFFICIAL_TIMESTAMP",
          failure_class: "PAGE_METADATA_INVALID",
        }
  const projection: MetadataProjectionV1 = {
    schema_version: 1,
    dataset_id: input.dataset_id,
    canonical_page_url: page.url,
    source_filename: normalizeOptionalText(input.source_filename),
    official_modified_at: official.normalized,
    record_version: normalizeOptionalText(input.record_version),
    license: input.license,
    download_origin: download?.origin ?? null,
    download_path: download?.path ?? null,
    advertised_size: input.advertised_size,
    etag: normalizeOptionalText(input.etag),
    last_modified: lastModified.normalized,
  }
  if (official.evidence_code !== null || lastModified.evidence_code !== null) {
    return {
      valid: false,
      projection,
      metadata_fingerprint_v1: sha256Jcs(projection),
      evidence_codes: ["INVALID_OFFICIAL_TIMESTAMP"],
    }
  }
  return {
    valid: true,
    projection,
    metadata_fingerprint_v1: sha256Jcs(projection),
    evidence_codes: [],
  }
}

export function selectFailureClass(observed: readonly FailureClassV1[]): FailureClassV1 | null {
  const observedSet = new Set(observed)
  return FAILURE_PRECEDENCE.find((failure) => observedSet.has(failure)) ?? null
}

function hasValidObservedFailures(value: unknown): value is readonly FailureClassV1[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (failure) =>
        typeof failure === "string" &&
        (FAILURE_PRECEDENCE as readonly string[]).includes(failure),
    )
  )
}

export function failureKind(failure: FailureClassV1): ProvisionalKind {
  return FAILURE_PRECEDENCE.indexOf(failure) < 4 ? "availability" : "acquisition"
}

export function provisionalEventId(
  kind: ProvisionalKind,
  datasetId: string,
  canonicalPageUrl: string,
  metadataFingerprint: string | null,
  lastAcceptedSourceSha256: string | null,
  failureClass: FailureClassV1,
): string {
  const tuple: JsonValue = {
    event_id_schema_version: 1,
    kind,
    dataset_id: datasetId,
    canonical_page_url: canonicalPageUrl,
    metadata_fingerprint_v1: metadataFingerprint,
    last_accepted_source_sha256: lastAcceptedSourceSha256,
    failure_class: failureClass,
  }
  return `${kind}:v1:${sha256Jcs(tuple)}`
}

function appendUnique<T>(items: readonly T[], value: T): readonly T[] {
  return items.includes(value) ? items : [...items, value]
}

function moveToEndUnique<T>(items: readonly T[], value: T): readonly T[] {
  if (items[items.length - 1] === value) return items
  return [...items.filter((item) => item !== value), value]
}

function transitionDigest(
  incident: Pick<FreshnessIncidentV1, "original_event_id" | "transition_digest">,
  state: FreshnessState,
  occurredAt: string,
  receiptDigest: string | null,
): string {
  return sha256Jcs({
    transition_schema_version: 1,
    event_id: incident.original_event_id,
    predecessor_transition_digest: incident.transition_digest,
    state,
    occurred_at: occurredAt,
    receipt_digest: receiptDigest,
  })
}

function isDigest(value: string | null): value is string {
  return value !== null && SHA256.test(value)
}

function isMonotonicTransition(incident: FreshnessIncidentV1, occurredAt: string): boolean {
  return (
    parseWorkflowTimestamp(incident.last_transition_at) === incident.last_transition_at &&
    occurredAt >= incident.last_transition_at
  )
}

function eligibleCorrelation(existing: FreshnessIncidentV1, observation: ProvisionalObservationV1): boolean {
  return (
    OPEN_STATES.has(existing.state) &&
    existing.kind !== "changed_source" &&
    existing.event_schema_version === observation.event_id_schema_version &&
    existing.dataset_id === observation.dataset_id &&
    existing.canonical_page_url === observation.canonical_page_url &&
    existing.last_accepted_source_sha256 === observation.last_accepted_source_sha256 &&
    existing.last_accepted_release_data_digest_v1 ===
      observation.last_accepted_release_data_digest_v1 &&
    existing.observed_source_sha256s.every(
      (checksum) => checksum === observation.last_accepted_source_sha256,
    )
  )
}

export function observeProvisionalIncident(
  incidents: readonly FreshnessIncidentV1[],
  observation: ProvisionalObservationV1,
): IncidentMutationResult {
  const observedAt = parseWorkflowTimestamp(observation.observed_at)
  if (observedAt === null) return { applied: false, error: "INVALID_WORKFLOW_TIME" }
  const failuresValid = hasValidObservedFailures(observation.observed_failures)
  const failure = failuresValid ? selectFailureClass(observation.observed_failures) : null
  const page = normalizeHttpsUrl(observation.canonical_page_url)
  if (
    !failuresValid ||
    failure === null ||
    page === null ||
    observation.dataset_id.trim() === "" ||
    observation.dataset_id !== observation.dataset_id.trim() ||
    !(observation.metadata_fingerprint_v1 === null || SHA256.test(observation.metadata_fingerprint_v1)) ||
    !(observation.last_accepted_source_sha256 === null || SHA256.test(observation.last_accepted_source_sha256)) ||
    !(
      observation.last_accepted_release_data_digest_v1 === null ||
      SHA256.test(observation.last_accepted_release_data_digest_v1)
    ) ||
    (observation.last_accepted_source_sha256 === null) !==
      (observation.last_accepted_release_data_digest_v1 === null)
  ) {
    return { applied: false, error: "INVALID_OBSERVATION" }
  }
  const kind = failureKind(failure)
  const alias = provisionalEventId(
    kind,
    observation.dataset_id,
    page.url,
    observation.metadata_fingerprint_v1,
    observation.last_accepted_source_sha256,
    failure,
  )
  const candidate = incidents
    .filter((incident) => eligibleCorrelation(incident, { ...observation, canonical_page_url: page.url }))
    .sort((left, right) => {
      const leftKey = `${left.first_seen_at}\u0000${left.original_event_id}`
      const rightKey = `${right.first_seen_at}\u0000${right.original_event_id}`
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
    })[0]
  if (candidate !== undefined) {
    if (!isMonotonicTransition(candidate, observedAt)) {
      return { applied: false, error: "TRANSITION_INELIGIBLE" }
    }
    const nextState = kind === "acquisition" ? "ACQUISITION_FAILED" : candidate.state
    const metadataAliases =
      observation.metadata_fingerprint_v1 === null
        ? candidate.metadata_fingerprint_aliases
        : moveToEndUnique(candidate.metadata_fingerprint_aliases, observation.metadata_fingerprint_v1)
    const eventAliases = appendUnique(candidate.event_id_aliases, alias)
    const failures = appendUnique(candidate.observed_failure_classes, failure)
    const changed =
      eventAliases !== candidate.event_id_aliases ||
      metadataAliases !== candidate.metadata_fingerprint_aliases ||
      observation.metadata_fingerprint_v1 !== candidate.current_metadata_fingerprint_v1 ||
      failures !== candidate.observed_failure_classes ||
      nextState !== candidate.state
    if (!changed) return { applied: true, incident: candidate, changed: false }
    const updatedWithoutDigest: FreshnessIncidentV1 = {
      ...candidate,
      state: nextState,
      metadata_fingerprint_aliases: metadataAliases,
      current_metadata_fingerprint_v1: observation.metadata_fingerprint_v1,
      event_id_aliases: eventAliases,
      observed_failure_classes: failures,
      last_transition_at: observedAt,
      transition_digest: candidate.transition_digest,
    }
    return {
      applied: true,
      changed: true,
      incident: {
        ...updatedWithoutDigest,
        transition_digest: transitionDigest(candidate, nextState, observedAt, null),
      },
    }
  }
  const deadlineEpoch = Date.parse(observedAt) + 604_800_000
  const deadlineAt = new Date(deadlineEpoch).toISOString()
  const initialState: FreshnessState = kind === "acquisition" ? "ACQUISITION_FAILED" : "DETECTED"
  const openingProjection: JsonValue = {
    transition_schema_version: 1,
    event_id: alias,
    predecessor_transition_digest: null,
    state: initialState,
    occurred_at: observedAt,
    receipt_digest: null,
  }
  const incident: FreshnessIncidentV1 = {
    event_schema_version: 1,
    original_event_id: alias,
    kind,
    dataset_id: observation.dataset_id,
    canonical_page_url: page.url,
    last_accepted_source_sha256: observation.last_accepted_source_sha256,
    last_accepted_release_data_digest_v1: observation.last_accepted_release_data_digest_v1,
    original_metadata_fingerprint_v1: observation.metadata_fingerprint_v1,
    current_metadata_fingerprint_v1: observation.metadata_fingerprint_v1,
    metadata_fingerprint_aliases:
      observation.metadata_fingerprint_v1 === null ? [] : [observation.metadata_fingerprint_v1],
    event_id_aliases: [alias],
    observed_failure_classes: [failure],
    observed_source_sha256s: [],
    first_seen_at: observedAt,
    deadline_at: deadlineAt,
    state: initialState,
    last_transition_at: observedAt,
    transition_digest: sha256Jcs(openingProjection),
    receipt_digests: [],
    release_cycle_start_index: 0,
    active_release_data_digest_v1: null,
    active_package_name: null,
    active_package_version: null,
    active_package_integrity: null,
    bound_previous_latest_version: null,
  }
  return { applied: true, incident, changed: true }
}

export function observeSourceChecksum(
  incident: FreshnessIncidentV1,
  sourceSha256: string,
  observedAtInput: string,
): IncidentMutationResult {
  const observedAt = parseWorkflowTimestamp(observedAtInput)
  if (observedAt === null) return { applied: false, error: "INVALID_WORKFLOW_TIME" }
  if (
    !SHA256.test(sourceSha256) ||
    !OPEN_STATES.has(incident.state) ||
    !isMonotonicTransition(incident, observedAt)
  ) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  const sourceChecksums = moveToEndUnique(incident.observed_source_sha256s, sourceSha256)
  if (sourceChecksums === incident.observed_source_sha256s) {
    return { applied: true, incident, changed: false }
  }
  const sourceAlias = `source:v1:${sourceSha256}`
  const changedSource = sourceSha256 !== incident.last_accepted_source_sha256
  const state: FreshnessState = changedSource ? "VALIDATION_FAILED" : incident.state
  const kind = changedSource ? "changed_source" : incident.kind
  return {
    applied: true,
    changed: true,
    incident: {
      ...incident,
      kind,
      state,
      last_transition_at: observedAt,
      event_id_aliases: appendUnique(incident.event_id_aliases, sourceAlias),
      observed_source_sha256s: sourceChecksums,
      transition_digest: transitionDigest(incident, state, observedAt, null),
    },
  }
}

export function closeVerifiedNoChange(
  incident: FreshnessIncidentV1,
  receipt: VerifiedNoChangeReceiptV1,
): IncidentMutationResult {
  const completeValidation = validateVerifiedNoChangeReceipt(receipt)
  if (!completeValidation.valid) return { applied: false, error: "RECEIPT_INVALID" }
  const payload = receipt.verified_no_change_evidence_payload_v1
  const receiptDigest = completeValidation.receipt_digest
  const observedMetadataFingerprint = incident.current_metadata_fingerprint_v1
  if (!isDigest(observedMetadataFingerprint)) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  if (incident.state === "VERIFIED_NO_CHANGE_CLOSED") {
    if (incident.receipt_digests[incident.receipt_digests.length - 1] !== receiptDigest) {
      return { applied: false, error: "CONFLICTING_RECEIPT" }
    }
    if (
      payload.event_id !== incident.original_event_id ||
      payload.first_seen_at !== incident.first_seen_at ||
      payload.deadline_at !== incident.deadline_at ||
      payload.accepted_baseline_source_sha256 !== incident.last_accepted_source_sha256 ||
      payload.accepted_baseline_release_data_digest_v1 !== incident.last_accepted_release_data_digest_v1 ||
      payload.metadata_fingerprint_v1 !== observedMetadataFingerprint ||
      receipt.approval.approved_at !== incident.last_transition_at
    ) {
      return { applied: false, error: "RECEIPT_INVALID" }
    }
    return { applied: true, incident, changed: false }
  }
  if (
    incident.kind === "changed_source" ||
    !OPEN_STATES.has(incident.state) ||
    !isDigest(incident.last_accepted_source_sha256) ||
    !isDigest(incident.last_accepted_release_data_digest_v1) ||
    incident.observed_source_sha256s.some(
      (checksum) => checksum !== incident.last_accepted_source_sha256,
    )
  ) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  const validation = validateVerifiedNoChangeReceipt(receipt, {
    event_id: incident.original_event_id,
    prior_transition_digest: incident.transition_digest,
    prior_transition_at: incident.last_transition_at,
    first_seen_at: incident.first_seen_at,
    deadline_at: incident.deadline_at,
    accepted_baseline_source_sha256: incident.last_accepted_source_sha256,
    accepted_baseline_release_data_digest_v1: incident.last_accepted_release_data_digest_v1 ?? "",
    metadata_fingerprint_v1: observedMetadataFingerprint,
  })
  if (!validation.valid) return { applied: false, error: "RECEIPT_INVALID" }
  const sourceAlias = `source:v1:${payload.reacquired_source_sha256}`
  return {
    applied: true,
    changed: true,
    incident: {
      ...incident,
      state: "VERIFIED_NO_CHANGE_CLOSED",
      last_transition_at: receipt.approval.approved_at,
      event_id_aliases: appendUnique(incident.event_id_aliases, sourceAlias),
      observed_source_sha256s: moveToEndUnique(
        incident.observed_source_sha256s,
        payload.reacquired_source_sha256,
      ),
      transition_digest: transitionDigest(
        incident,
        "VERIFIED_NO_CHANGE_CLOSED",
        receipt.approval.approved_at,
        validation.receipt_digest,
      ),
      receipt_digests: [...incident.receipt_digests, validation.receipt_digest],
    },
  }
}

const RELEASE_STATE: Readonly<Record<ReleaseTransition, FreshnessState>> = {
  candidate: "CANDIDATE_PUBLISHED",
  client: "CLIENT_VERIFIED",
  promotion: "PROMOTED_CLOSED",
  rollback: "ROLLED_BACK_REOPENED",
}

function releaseTransitionEligible(incident: FreshnessIncidentV1, transition: ReleaseTransition): boolean {
  if (incident.kind !== "changed_source") return false
  if (
    transition !== "rollback" &&
    currentNonBaselineSourceChecksum(
      incident.last_accepted_source_sha256,
      incident.observed_source_sha256s,
    ) === null
  ) {
    return false
  }
  switch (transition) {
    case "candidate":
      return incident.state === "MERGED"
    case "client":
      return incident.state === "CANDIDATE_PUBLISHED"
    case "promotion":
      return incident.state === "CLIENT_VERIFIED"
    case "rollback":
      return incident.state === "PROMOTED_CLOSED"
  }
}
export interface ReleaseRegistryBindingV1 {
  readonly expected_previous_latest_version: string
  readonly candidate_authorization_receipt_digest: string
  readonly candidate_evidence_digest_bindings: ReleaseEvidenceDigestBindingsV1["candidate"]
  readonly client_evidence_digest_bindings: ReleaseEvidenceDigestBindingsV1["client"]
  readonly promotion_evidence_digest_bindings: ReleaseEvidenceDigestBindingsV1["promotion"]
}

export interface RollbackReleaseBindingV1 {
  readonly prior_good_package_integrity: string
  readonly prior_good_version: string
  readonly prior_good_release_data_digest_v1: string
  readonly prior_good_receipt_digest: string
  readonly rollback_evidence_digest_bindings: ReleaseEvidenceDigestBindingsV1["rollback"]
}

export function applyReleaseTransition(
  incident: FreshnessIncidentV1,
  receipt: ReleaseTransitionReceiptV1,
  registryBinding: ReleaseRegistryBindingV1,
  rollbackBinding?: RollbackReleaseBindingV1,
  promotionCompletionReceipt?: PromotionCompletionReceiptV1,
): IncidentMutationResult {
  const completeValidation = validateReleaseTransitionReceipt(receipt)
  if (!completeValidation.valid) return { applied: false, error: "RECEIPT_INVALID" }
  const payload = receipt.release_transition_evidence_payload_v1
  const receiptDigest = completeValidation.receipt_digest
  const promotionCompletionValidation =
    payload.transition === "promotion"
      ? validatePromotionCompletionReceipt(promotionCompletionReceipt)
      : null
  if (promotionCompletionValidation !== null && !promotionCompletionValidation.valid) {
    return { applied: false, error: "RECEIPT_INVALID" }
  }
  const lifecycleReceiptDigest =
    promotionCompletionValidation?.valid === true
      ? promotionCompletionValidation.receipt_digest
      : receiptDigest
  if (
    registryBinding === undefined ||
    registryBinding === null ||
    !SHA256.test(registryBinding.candidate_authorization_receipt_digest) ||
    payload.package_name !== RELEASE_PACKAGE_NAME ||
    payload.previous_latest_version !== registryBinding.expected_previous_latest_version ||
    (incident.bound_previous_latest_version !== null &&
      incident.bound_previous_latest_version !== registryBinding.expected_previous_latest_version)
  ) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  if (
    payload.transition === "rollback" &&
    (rollbackBinding === undefined ||
      rollbackBinding.prior_good_package_integrity.trim() === "" ||
      rollbackBinding.prior_good_version.trim() === "" ||
      !SHA256.test(rollbackBinding.prior_good_release_data_digest_v1) ||
      !SHA256.test(rollbackBinding.prior_good_receipt_digest) ||
      payload.package_integrity !== rollbackBinding.prior_good_package_integrity ||
      payload.package_version !== rollbackBinding.prior_good_version ||
      payload.release_data_digest_v1 !== rollbackBinding.prior_good_release_data_digest_v1 ||
      !payload.predecessor_receipt_digests.includes(rollbackBinding.prior_good_receipt_digest))
  ) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  const replay =
    incident.receipt_digests[incident.receipt_digests.length - 1] === lifecycleReceiptDigest &&
    incident.state === RELEASE_STATE[payload.transition]
  const startsNewCycle = !replay && payload.transition === "candidate"
  const expectedHistoryLength: Readonly<Record<ReleaseTransition, number>> = {
    candidate: 0,
    client: 1,
    promotion: 2,
    rollback: 3,
  }
  const completedCycleHistoryLength = expectedHistoryLength.rollback + 1
  if (
    !Number.isSafeInteger(incident.release_cycle_start_index) ||
    incident.release_cycle_start_index < 0 ||
    incident.release_cycle_start_index > incident.receipt_digests.length ||
    !incident.receipt_digests.every((digest) => SHA256.test(digest)) ||
    new Set(incident.receipt_digests).size !== incident.receipt_digests.length
  ) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  const storedCycleReceiptDigests = incident.receipt_digests.slice(
    incident.release_cycle_start_index,
  )
  const validCandidateBoundary =
    incident.receipt_digests.length === 0
      ? incident.release_cycle_start_index === 0
      : incident.release_cycle_start_index % completedCycleHistoryLength === 0 &&
        incident.release_cycle_start_index ===
          incident.receipt_digests.length - completedCycleHistoryLength &&
        storedCycleReceiptDigests.length === completedCycleHistoryLength
  if (startsNewCycle && !validCandidateBoundary) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  const cycleStartIndex = startsNewCycle
    ? incident.receipt_digests.length
    : incident.release_cycle_start_index
  const cycleReceiptDigests = incident.receipt_digests.slice(cycleStartIndex)
  const priorReceiptDigests = replay
    ? cycleReceiptDigests.slice(0, -1)
    : cycleReceiptDigests
  if (
    (replay && cycleReceiptDigests.length === 0) ||
    priorReceiptDigests.length !== expectedHistoryLength[payload.transition]
  ) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  const expectedPredecessorReceiptDigests =
    payload.transition === "candidate"
      ? [registryBinding.candidate_authorization_receipt_digest]
      : payload.transition === "client"
        ? [priorReceiptDigests[0] as string]
        : payload.transition === "promotion"
          ? [priorReceiptDigests[0] as string, priorReceiptDigests[1] as string]
          : [priorReceiptDigests[2] as string, rollbackBinding?.prior_good_receipt_digest ?? ""]
  const expectedEvidenceDigestBindings =
    payload.transition === "candidate"
      ? registryBinding.candidate_evidence_digest_bindings
      : payload.transition === "client"
        ? registryBinding.client_evidence_digest_bindings
        : payload.transition === "promotion"
          ? registryBinding.promotion_evidence_digest_bindings
          : rollbackBinding?.rollback_evidence_digest_bindings
  if (expectedEvidenceDigestBindings === undefined) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  const sourceSha = currentNonBaselineSourceChecksum(
    incident.last_accepted_source_sha256,
    incident.observed_source_sha256s,
  )
  if (sourceSha === null) return { applied: false, error: "TRANSITION_INELIGIBLE" }
  const expectedPackageIntegrity =
    payload.transition === "candidate"
      ? payload.package_integrity
      : payload.transition === "rollback"
        ? (rollbackBinding?.prior_good_package_integrity ?? "")
        : (incident.active_package_integrity ?? "")
  const expectedPackageVersion =
    payload.transition === "candidate"
      ? payload.package_version
      : payload.transition === "rollback"
        ? (rollbackBinding?.prior_good_version ?? "")
        : (incident.active_package_version ?? "")
  const expectedReleaseDataDigest =
    payload.transition === "candidate"
      ? payload.release_data_digest_v1
      : payload.transition === "rollback"
        ? (rollbackBinding?.prior_good_release_data_digest_v1 ?? "")
        : (incident.active_release_data_digest_v1 ?? "")
  const validation = validateReleaseTransitionReceipt(receipt, {
    transition: payload.transition,
    event_id: incident.original_event_id,
    prior_transition_digest: replay ? payload.prior_transition_digest : incident.transition_digest,
    prior_transition_at: replay ? payload.first_seen_at : incident.last_transition_at,
    first_seen_at: incident.first_seen_at,
    deadline_at: incident.deadline_at,
    source_sha256: sourceSha,
    accepted_baseline_source_sha256: incident.last_accepted_source_sha256,
    observed_source_sha256s: incident.observed_source_sha256s,
    release_data_digest_v1: expectedReleaseDataDigest,
    package_version: expectedPackageVersion,
    package_integrity: expectedPackageIntegrity,
    predecessor_receipt_digests: expectedPredecessorReceiptDigests,
    previous_latest_version: registryBinding.expected_previous_latest_version,
    evidence_digest_bindings: expectedEvidenceDigestBindings,
  })
  if (!validation.valid) return { applied: false, error: "RECEIPT_INVALID" }
  if (payload.transition === "promotion") {
    if (promotionCompletionReceipt === undefined) {
      return { applied: false, error: "RECEIPT_INVALID" }
    }
    const completionValidation = validatePromotionCompletionReceipt(promotionCompletionReceipt, {
      event_id: incident.original_event_id,
      prior_transition_digest: payload.prior_transition_digest,
      first_seen_at: incident.first_seen_at,
      deadline_at: incident.deadline_at,
      release_data_digest_v1: expectedReleaseDataDigest,
      package_name: payload.package_name,
      package_version: expectedPackageVersion,
      package_integrity: expectedPackageIntegrity,
      source_commit: payload.source_commit,
      previous_latest_version: registryBinding.expected_previous_latest_version,
      predecessor_receipt_digests: [
        priorReceiptDigests[1] as string,
        payload.prior_transition_digest,
      ],
      candidate_receipt_digest: priorReceiptDigests[0] as string,
      authorization_receipt_digest: validation.receipt_digest,
      authorization_approved_at: receipt.approval.approved_at,
    })
    if (
      !completionValidation.valid ||
      completionValidation.receipt_digest !== lifecycleReceiptDigest
    ) {
      return { applied: false, error: "RECEIPT_INVALID" }
    }
  }
  const lifecycleOccurredAt =
    payload.transition === "promotion"
      ? (promotionCompletionReceipt?.registry_verification.verified_at ?? "")
      : receipt.approval.approved_at
  if (
    (payload.transition === "candidate" &&
      (registryBinding.candidate_evidence_digest_bindings["authorization-receipt"] !==
        registryBinding.candidate_authorization_receipt_digest ||
        registryBinding.candidate_evidence_digest_bindings["release-data"] !==
          expectedReleaseDataDigest)) ||
    (payload.transition === "rollback" &&
      rollbackBinding !== undefined &&
      (rollbackBinding.rollback_evidence_digest_bindings["prior-good-release"] !==
        rollbackBinding.prior_good_receipt_digest ||
        rollbackBinding.rollback_evidence_digest_bindings["promotion-receipt"] !==
          priorReceiptDigests[2]))
  ) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  if (replay) {
    if (
      payload.event_id !== incident.original_event_id ||
      payload.first_seen_at !== incident.first_seen_at ||
      payload.deadline_at !== incident.deadline_at ||
      payload.source_sha256 !== sourceSha ||
      lifecycleOccurredAt !== incident.last_transition_at
    ) {
      return { applied: false, error: "RECEIPT_INVALID" }
    }
    return { applied: true, incident, changed: false }
  }
  if (!releaseTransitionEligible(incident, payload.transition)) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  if (
    payload.transition === "rollback" &&
    (payload.package_name !== incident.active_package_name ||
      payload.package_version !== payload.previous_latest_version ||
      payload.package_version === incident.active_package_version)
  ) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  if (
    startsNewCycle &&
    incident.active_package_version !== null &&
    payload.package_version === incident.active_package_version
  ) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  if (
    (payload.transition === "client" || payload.transition === "promotion") &&
    (incident.active_release_data_digest_v1 !== payload.release_data_digest_v1 ||
      incident.active_package_name !== payload.package_name ||
      incident.active_package_version !== payload.package_version ||
      incident.active_package_integrity !== payload.package_integrity)
  ) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  const state = RELEASE_STATE[payload.transition]
  const changesActivePackage = payload.transition === "candidate" || payload.transition === "rollback"
  return {
    applied: true,
    changed: true,
    incident: {
      ...incident,
      state,
      last_transition_at: lifecycleOccurredAt,
      active_release_data_digest_v1: changesActivePackage
        ? payload.release_data_digest_v1
        : incident.active_release_data_digest_v1,
      active_package_name: changesActivePackage ? payload.package_name : incident.active_package_name,
      active_package_version: changesActivePackage
        ? payload.package_version
        : incident.active_package_version,
      active_package_integrity: changesActivePackage
        ? payload.package_integrity
        : incident.active_package_integrity,
      bound_previous_latest_version:
        incident.bound_previous_latest_version ?? registryBinding.expected_previous_latest_version,
      release_cycle_start_index: startsNewCycle
        ? cycleStartIndex
        : incident.release_cycle_start_index,
      transition_digest: transitionDigest(
        incident,
        state,
        lifecycleOccurredAt,
        lifecycleReceiptDigest,
      ),
      receipt_digests: [...incident.receipt_digests, lifecycleReceiptDigest],
    },
  }
}

type UnreceiptedState = "VALIDATED" | "PR_OPEN" | "MERGED" | "BLOCKED"

const UNRECEIPTED_PREDECESSORS: Readonly<Record<UnreceiptedState, ReadonlySet<FreshnessState>>> = {
  VALIDATED: new Set(["VALIDATION_FAILED", "ROLLED_BACK_REOPENED", "BLOCKED"]),
  PR_OPEN: new Set(["VALIDATED"]),
  MERGED: new Set(["PR_OPEN"]),
  BLOCKED: new Set(["VALIDATION_FAILED", "VALIDATED", "PR_OPEN", "MERGED", "ROLLED_BACK_REOPENED"]),
}

export function advanceUnreceiptedState(
  incident: FreshnessIncidentV1,
  state: UnreceiptedState,
  occurredAtInput: string,
): IncidentMutationResult {
  const occurredAt = parseWorkflowTimestamp(occurredAtInput)
  if (occurredAt === null) return { applied: false, error: "INVALID_WORKFLOW_TIME" }
  if (
    incident.kind !== "changed_source" ||
    !OPEN_STATES.has(incident.state) ||
    !UNRECEIPTED_PREDECESSORS[state].has(incident.state) ||
    !isMonotonicTransition(incident, occurredAt)
  ) {
    return { applied: false, error: "TRANSITION_INELIGIBLE" }
  }
  return {
    applied: true,
    changed: true,
    incident: {
      ...incident,
      state,
      last_transition_at: occurredAt,
      transition_digest: transitionDigest(incident, state, occurredAt, null),
    },
  }
}
