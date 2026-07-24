import { institutionColumns } from "./seed15118998-config.js"
import { parseDecimalCell } from "./seed15118998-validate.js"
import { sha256Bytes } from "./seed15118998-utils.js"

export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject
export type JsonObject = { readonly [key: string]: JsonValue }

export type SemanticDigestDagInput = {
  readonly sourceModel: JsonObject
  readonly seedLogical: JsonObject
  readonly catalog: JsonObject
  readonly manifest: JsonObject
}

export type SemanticDigestDag = {
  readonly source_model_digest_v1: string
  readonly seed_logical_digest_v1: string
  readonly catalog_digest_v1: string
  readonly manifest_semantic_digest_v1: string
  readonly release_data_digest_v1: string
}
export type SemanticDigestProjections = {
  readonly sourceModel: JsonObject
  readonly seedLogical: JsonObject
  readonly catalog: JsonObject
  readonly manifestSemantic: JsonObject
  readonly releaseData: JsonObject
}

export type SemanticProjectionBinding = {
  readonly projection: JsonObject
  readonly digest: string
}

const sourceModelKeys = [
  "projection_version",
  "source",
  "headers",
  "rows",
  "classifications",
] as const

const seedLogicalKeys = [
  "projection_version",
  "provenance",
  "indicators",
  "institutions",
  "raw_rows",
  "observations",
] as const

const catalogKeys = ["catalog_schema_version", "source", "indicators"] as const

const sourceKeys = [
  "dataset_id",
  "dataset_name",
  "provider",
  "source_url",
  "license",
  "source_file_name",
] as const
const indexedCellKeys = ["worksheet_row", "column_index", "column_ref", "raw_text"] as const
const indexedHeaderKeys = [
  ...indexedCellKeys,
  "match_header",
  "parsed_label",
  "parsed_year",
  "parsed_unit",
] as const
const indexedRowKeys = ["worksheet_row", "cells"] as const
const classificationKeys = [
  "school_name",
  "campus_name",
  "worksheet_row",
  "indicator_id",
  "column_index",
  "column_ref",
  "raw_text",
  "classification",
  "missing_marker",
  "canonical_value",
] as const
const semanticIndicatorKeys = [
  "indicator_id",
  "label_ko",
  "source_column",
  "year",
  "unit",
  "note",
  "source_dataset_id",
  "source_column_verified",
  "enabled_by_default",
] as const
const institutionKeys = [
  "school_name",
  "campus_name",
  "school_kind",
  "school_type",
  "establishment_type",
  "region_name",
] as const
const observationKeys = [
  "school_name",
  "campus_name",
  "indicator_id",
  "source_column",
  "year",
  "unit",
  "raw_text",
  "classification",
  "missing_marker",
  "canonical_value",
] as const
const catalogSourceKeys = [
  "dataset_id",
  "dataset_name",
  "provider",
  "source_url",
  "license",
  "derived_database",
  "bundled",
  "source_column",
  "base_year",
  "unit",
] as const
const catalogIndicatorRequiredKeys = [
  "indicator_id",
  "label_ko",
  "source_column",
  "year",
  "unit",
  "source_dataset_id",
  "source_column_verified",
  "enabled_by_default",
] as const
const observationCountKeys = [
  "competition_rate",
  "fill_rate",
  "employment_rate",
  "scholarship_per_student",
  "avg_tuition",
  "admission_quota",
  "graduates_count",
  "fulltime_faculty_count",
  "enrolled_students",
  "international_students",
  "students_per_fulltime_faculty",
  "fulltime_faculty_ratio_quota",
  "fulltime_faculty_ratio_enrolled",
  "fulltime_faculty_lecture_ratio",
  "education_expense_per_student",
  "dormitory_capacity_rate",
  "books_per_student",
] as const
const semanticProjectionInputKeys = [
  "source_model_digest_v1",
  "seed_logical_digest_v1",
] as const
const auditEvidenceKeys = [
  "source_file_checksum_sha256",
  "header_snapshot_checksum_sha256",
  "seed_db_checksum_sha256",
  "observation_counts",
] as const
const childDigestKeys = [
  "source_model_digest_v1",
  "seed_logical_digest_v1",
  "catalog_digest_v1",
] as const
const releaseChildDigestKeys = [...childDigestKeys, "manifest_semantic_digest_v1"] as const
const policyVersionKeys = ["worksheet_blank", "header_match", "decimal_grammar"] as const
const schemaVersionKeys = [
  "catalog",
  "source_model_projection",
  "seed_logical_projection",
  "manifest_semantic_projection",
  "release_data_projection",
] as const
const manifestSemanticProjectionKeys = ["projection_version", "manifest", "child_digests"] as const
const releaseDataProjectionKeys = [
  "projection_version",
  "child_digests",
  "policy_versions",
  "schema_versions",
] as const

const manifestInputKeys = [
  "dataset_id",
  "dataset_name",
  "provider",
  "source_url",
  "license",
  "derived_database",
  "bundled",
  "source_file_name",
  "source_downloaded_at",
  "seed_built_at",
  "source_file_downloaded_at",
  "source_file_modified_or_observed_at",
  "source_page_observed_at",
  "source_file_checksum_sha256",
  "header_snapshot_checksum_sha256",
  "seed_db_checksum_sha256",
  "seed_is_latest_claim",
  "api_key_required",
  "source_file_private_path_excluded",
  "per_indicator_year_unit",
  "indicators",
  "observation_counts",
  "audit_evidence",
  "semantic_digest_projection_inputs",
  "warnings",
] as const

const manifestSemanticKeys = [
  "dataset_id",
  "dataset_name",
  "provider",
  "source_url",
  "license",
  "derived_database",
  "bundled",
  "source_file_name",
  "seed_is_latest_claim",
  "api_key_required",
  "source_file_private_path_excluded",
  "per_indicator_year_unit",
  "indicators",
  "observation_counts",
  "warnings",
] as const

const policyVersions = {
  worksheet_blank: "worksheet_blank_v1",
  header_match: "crlf_to_lf_and_leading_bom_removal_only",
  decimal_grammar: "decimal_grammar_v1",
} as const

const schemaVersions = {
  catalog: 1,
  source_model_projection: 1,
  seed_logical_projection: 1,
  manifest_semantic_projection: 1,
  release_data_projection: 1,
} as const

function assertUnicodeScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const trailing = value.charCodeAt(index + 1)
      if (index + 1 >= value.length || trailing < 0xdc00 || trailing > 0xdfff) {
        throw new Error("JCS input contains an unpaired high surrogate.")
      }
      index += 1
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error("JCS input contains an unpaired low surrogate.")
    }
  }
}

function jsonPrimitive(value: number | string): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new Error("JCS primitive could not be serialized.")
  }
  return serialized
}

function canonicalize(value: JsonValue, ancestors: Set<object>): string {
  if (value === null) {
    return "null"
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("JCS input numbers must be finite IEEE-754 values.")
    }
    return jsonPrimitive(value)
  }
  if (typeof value === "string") {
    assertUnicodeScalarString(value)
    return jsonPrimitive(value)
  }
  if (typeof value !== "object") {
    throw new Error(`JCS input contains unsupported ${typeof value} data.`)
  }
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("JCS input objects must be plain records.")
    }
  }
  if (ancestors.has(value)) {
    throw new Error("JCS input must not contain a cycle.")
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const entries: string[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new Error("JCS input arrays must not be sparse.")
        }
        entries.push(canonicalize(value[index] as JsonValue, ancestors))
      }
      return `[${entries.join(",")}]`
    }

    const objectValue = value as JsonObject
    const entries = Object.keys(objectValue)
      .sort()
      .map((key) => {
        assertUnicodeScalarString(key)
        const child = objectValue[key]
        if (child === undefined) {
          throw new Error(`JCS input object member ${jsonPrimitive(key)} is undefined.`)
        }
        return `${jsonPrimitive(key)}:${canonicalize(child, ancestors)}`
      })
    return `{${entries.join(",")}}`
  } finally {
    ancestors.delete(value)
  }
}

/** RFC 8785-compatible JSON canonicalization for the closed JSON value domain. */
export function canonicalJson(value: JsonValue): string {
  return canonicalize(value, new Set())
}

export function canonicalSha256(value: JsonValue): string {
  return sha256Bytes(canonicalJson(value))
}

function requiredObject(value: JsonValue | undefined, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as JsonObject
}

function requiredArray(value: JsonValue | undefined, label: string): readonly JsonValue[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`)
  }
  return value
}

function requiredString(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`)
  }
  return value
}

function requiredBoolean(value: JsonValue | undefined, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`)
  }
  return value
}

function requiredInteger(value: JsonValue | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`)
  }
  return value
}

function requiredNullableString(value: JsonValue | undefined, label: string): string | null {
  if (value !== null && typeof value !== "string") {
    throw new Error(`${label} must be a string or null.`)
  }
  return value
}

function validateStrings(value: JsonValue | undefined, label: string): void {
  requiredArray(value, label).forEach((entry, index) => requiredString(entry, `${label}[${index}]`))
}

function closedProjection(
  value: JsonObject,
  label: string,
  allowedKeys: readonly string[],
): JsonObject {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error(`${label} projection must be a plain object.`)
  }
  const actualKeys = Object.keys(value).sort()
  const expectedKeys = [...allowedKeys].sort()
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      `${label} projection keys must be exactly ${expectedKeys.join(", ")}; received ${actualKeys.join(", ")}.`,
    )
  }

  return Object.fromEntries(
    allowedKeys.map((key) => {
      const child = value[key]
      if (child === undefined) {
        throw new Error(`${label} projection member ${key} is undefined.`)
      }
      return [key, child]
    }),
  ) as JsonObject
}
function assertProjectionVersion(
  projection: JsonObject,
  key: string,
  expected: number | string,
): void {
  if (projection[key] !== expected) {
    throw new Error(`${key} must be ${JSON.stringify(expected)}.`)
  }
}

function selectedProjection(
  value: JsonObject,
  label: string,
  selectedKeys: readonly string[],
): JsonObject {
  return Object.fromEntries(
    selectedKeys.map((key) => {
      const child = value[key]
      if (child === undefined) {
        throw new Error(`${label} projection member ${key} is undefined.`)
      }
      return [key, child]
    }),
  ) as JsonObject
}

function validateSource(value: JsonValue | undefined, label: string): JsonObject {
  const source = closedProjection(requiredObject(value, label), label, sourceKeys)
  sourceKeys.forEach((key) => requiredString(source[key], `${label}.${key}`))
  return source
}
function indexedColumnReference(columnIndex: number, worksheetRow: number): string {
  let value = columnIndex + 1
  let letters = ""
  while (value > 0) {
    const remainder = (value - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    value = Math.floor((value - 1) / 26)
  }
  return `${letters}${worksheetRow}`
}

function validateIndexedCell(value: JsonValue, label: string): JsonObject {
  const cell = closedProjection(requiredObject(value, label), label, indexedCellKeys)
  const worksheetRow = requiredInteger(cell["worksheet_row"], `${label}.worksheet_row`)
  const columnIndex = requiredInteger(cell["column_index"], `${label}.column_index`)
  const columnRef = requiredString(cell["column_ref"], `${label}.column_ref`)
  requiredString(cell["raw_text"], `${label}.raw_text`)
  if (
    worksheetRow <= 0 ||
    columnIndex < 0 ||
    columnRef !== indexedColumnReference(columnIndex, worksheetRow)
  ) {
    throw new Error(`${label} has invalid indexed cell coordinates.`)
  }
  return cell
}

function validateIndexedRows(
  value: JsonValue | undefined,
  label: string,
): ReadonlyMap<number, ReadonlyMap<number, JsonObject>> {
  const rows = new Map<number, ReadonlyMap<number, JsonObject>>()
  let previousWorksheetRow = -1
  requiredArray(value, label).forEach((entry, rowIndex) => {
    const rowLabel = `${label}[${rowIndex}]`
    const row = closedProjection(requiredObject(entry, rowLabel), rowLabel, indexedRowKeys)
    const worksheetRow = requiredInteger(row["worksheet_row"], `${rowLabel}.worksheet_row`)
    if (worksheetRow <= previousWorksheetRow || rows.has(worksheetRow)) {
      throw new Error(`${label} contains an invalid, duplicate, or unstably ordered worksheet row ${worksheetRow}.`)
    }
    const cells = new Map<number, JsonObject>()
    let previousColumnIndex = -1
    requiredArray(row["cells"], `${rowLabel}.cells`).forEach((entryCell, cellIndex) => {
      const cellLabel = `${rowLabel}.cells[${cellIndex}]`
      const cell = validateIndexedCell(entryCell, cellLabel)
      const columnIndex = requiredInteger(cell["column_index"], `${cellLabel}.column_index`)
      if (
        cell["worksheet_row"] !== worksheetRow ||
        columnIndex <= previousColumnIndex ||
        cells.has(columnIndex)
      ) {
        throw new Error(`${cellLabel} has a mismatched row reference or duplicate/unstable column index.`)
      }
      cells.set(columnIndex, cell)
      previousColumnIndex = columnIndex
    })
    rows.set(worksheetRow, cells)
    previousWorksheetRow = worksheetRow
  })
  return rows
}

function validateDecimalAttestation(value: JsonObject, label: string): void {
  const rawText = requiredString(value["raw_text"], `${label}.raw_text`)
  const kind = requiredString(value["classification"], `${label}.classification`)
  const marker = requiredNullableString(value["missing_marker"], `${label}.missing_marker`)
  const canonicalValue = requiredNullableString(value["canonical_value"], `${label}.canonical_value`)
  const parsed = parseDecimalCell(rawText)
  if (parsed.kind === "invalid") {
    throw new Error(`${label}.raw_text has ${parsed.reason}.`)
  }
  if (
    parsed.kind === "numeric"
      ? kind !== "numeric" ||
        marker !== null ||
        canonicalValue !== parsed.canonical_value ||
        Number(canonicalValue) !== parsed.value
      : kind !== "missing" || marker !== parsed.marker || canonicalValue !== null
  ) {
    throw new Error(`${label} does not match its recomputed exact decimal classification.`)
  }
}

function validateClassification(value: JsonValue, label: string): JsonObject {
  const classification = closedProjection(requiredObject(value, label), label, classificationKeys)
  requiredString(classification["school_name"], `${label}.school_name`)
  requiredString(classification["campus_name"], `${label}.campus_name`)
  requiredInteger(classification["worksheet_row"], `${label}.worksheet_row`)
  requiredString(classification["indicator_id"], `${label}.indicator_id`)
  requiredInteger(classification["column_index"], `${label}.column_index`)
  requiredString(classification["column_ref"], `${label}.column_ref`)
  validateDecimalAttestation(classification, label)
  return classification
}

function validateSemanticIndicator(value: JsonValue, label: string): void {
  const indicator = closedProjection(requiredObject(value, label), label, semanticIndicatorKeys)
  requiredString(indicator["indicator_id"], `${label}.indicator_id`)
  requiredString(indicator["label_ko"], `${label}.label_ko`)
  requiredString(indicator["source_column"], `${label}.source_column`)
  requiredInteger(indicator["year"], `${label}.year`)
  requiredString(indicator["unit"], `${label}.unit`)
  requiredNullableString(indicator["note"], `${label}.note`)
  requiredString(indicator["source_dataset_id"], `${label}.source_dataset_id`)
  requiredBoolean(indicator["source_column_verified"], `${label}.source_column_verified`)
  requiredBoolean(indicator["enabled_by_default"], `${label}.enabled_by_default`)
}

function validateObservation(value: JsonValue, label: string): JsonObject {
  const observation = closedProjection(requiredObject(value, label), label, observationKeys)
  for (const key of [
    "school_name",
    "campus_name",
    "indicator_id",
    "source_column",
    "unit",
  ] as const) {
    requiredString(observation[key], `${label}.${key}`)
  }
  requiredInteger(observation["year"], `${label}.year`)
  validateDecimalAttestation(observation, label)
  return observation
}

function validateSourceModel(value: JsonObject): JsonObject {
  const projection = closedProjection(value, "source model", sourceModelKeys)
  assertProjectionVersion(projection, "projection_version", "source_model_digest_v1")
  validateSource(projection["source"], "source model.source")
  requiredArray(projection["headers"], "source model.headers").forEach((entry, index) => {
    const label = `source model.headers[${index}]`
    const header = closedProjection(requiredObject(entry, label), label, indexedHeaderKeys)
    requiredInteger(header["worksheet_row"], `${label}.worksheet_row`)
    requiredInteger(header["column_index"], `${label}.column_index`)
    for (const key of ["column_ref", "raw_text", "match_header", "parsed_label"] as const) {
      requiredString(header[key], `${label}.${key}`)
    }
    if (header["parsed_year"] !== null) {
      requiredInteger(header["parsed_year"], `${label}.parsed_year`)
    }
    requiredNullableString(header["parsed_unit"], `${label}.parsed_unit`)
  })
  const rows = validateIndexedRows(projection["rows"], "source model.rows")
  const classifiedCells = new Set<string>()
  requiredArray(projection["classifications"], "source model.classifications").forEach(
    (entry, index) => {
      const label = `source model.classifications[${index}]`
      const classification = validateClassification(entry, label)
      const worksheetRow = requiredInteger(classification["worksheet_row"], `${label}.worksheet_row`)
      const columnIndex = requiredInteger(classification["column_index"], `${label}.column_index`)
      const rowCells = rows.get(worksheetRow)
      const cell = rowCells?.get(columnIndex)
      const key = `${worksheetRow}:${columnIndex}`
      if (
        rowCells === undefined ||
        cell === undefined ||
        classification["column_ref"] !== indexedColumnReference(columnIndex, worksheetRow) ||
        classification["raw_text"] !== cell["raw_text"] ||
        classifiedCells.has(key)
      ) {
        throw new Error(`${label} is not uniquely derived from its indexed raw cell.`)
      }
      classifiedCells.add(key)
    },
  )
  return projection
}

function validateSeedLogical(value: JsonObject): JsonObject {
  const projection = closedProjection(value, "seed logical", seedLogicalKeys)
  assertProjectionVersion(projection, "projection_version", "seed_logical_digest_v1")
  validateSource(projection["provenance"], "seed logical.provenance")
  requiredArray(projection["indicators"], "seed logical.indicators").forEach((entry, index) =>
    validateSemanticIndicator(entry, `seed logical.indicators[${index}]`),
  )
  requiredArray(projection["institutions"], "seed logical.institutions").forEach((entry, index) => {
    const label = `seed logical.institutions[${index}]`
    const institution = closedProjection(requiredObject(entry, label), label, institutionKeys)
    institutionKeys.forEach((key) => requiredString(institution[key], `${label}.${key}`))
  })
  validateIndexedRows(projection["raw_rows"], "seed logical.raw_rows")
  requiredArray(projection["observations"], "seed logical.observations").forEach((entry, index) =>
    validateObservation(entry, `seed logical.observations[${index}]`),
  )
  return projection
}

function validateChildProjectionRelations(
  sourceModel: JsonObject,
  seedLogical: JsonObject,
): void {
  if (
    canonicalJson(requiredObject(sourceModel["source"], "source model.source")) !==
      canonicalJson(requiredObject(seedLogical["provenance"], "seed logical.provenance")) ||
    canonicalJson(requiredArray(sourceModel["rows"], "source model.rows")) !==
      canonicalJson(requiredArray(seedLogical["raw_rows"], "seed logical.raw_rows"))
  ) {
    throw new Error("source model and seed logical child projection bodies do not share provenance and raw rows.")
  }

  const classifications = new Map<string, JsonObject>()
  for (const entry of requiredArray(
    sourceModel["classifications"],
    "source model.classifications",
  )) {
    const classification = requiredObject(entry, "source model classification")
    const key = canonicalJson([
      classification["school_name"] as JsonValue,
      classification["campus_name"] as JsonValue,
      classification["indicator_id"] as JsonValue,
    ])
    if (classifications.has(key)) {
      throw new Error("source model classifications contain a duplicate logical observation.")
    }
    classifications.set(key, classification)
  }

  const observations = requiredArray(seedLogical["observations"], "seed logical.observations")
  if (observations.length !== classifications.size) {
    throw new Error("source model classifications and seed logical observations have different coverage.")
  }
  for (const entry of observations) {
    const observation = requiredObject(entry, "seed logical observation")
    const key = canonicalJson([
      observation["school_name"] as JsonValue,
      observation["campus_name"] as JsonValue,
      observation["indicator_id"] as JsonValue,
    ])
    const classification = classifications.get(key)
    if (
      classification === undefined ||
      classification["raw_text"] !== observation["raw_text"] ||
      classification["classification"] !== observation["classification"] ||
      classification["missing_marker"] !== observation["missing_marker"] ||
      classification["canonical_value"] !== observation["canonical_value"]
    ) {
      throw new Error("seed logical observation is not derived from the matching source classification.")
    }
  }
}

function validateCatalog(value: JsonObject): JsonObject {
  const projection = closedProjection(value, "catalog", catalogKeys)
  assertProjectionVersion(projection, "catalog_schema_version", 1)
  const source = closedProjection(
    requiredObject(projection["source"], "catalog.source"),
    "catalog.source",
    catalogSourceKeys,
  )
  for (const key of [
    "dataset_id",
    "dataset_name",
    "provider",
    "source_url",
    "license",
    "source_column",
    "base_year",
    "unit",
  ] as const) {
    requiredString(source[key], `catalog.source.${key}`)
  }
  requiredBoolean(source["derived_database"], "catalog.source.derived_database")
  requiredBoolean(source["bundled"], "catalog.source.bundled")
  requiredArray(projection["indicators"], "catalog.indicators").forEach((entry, index) => {
    const label = `catalog.indicators[${index}]`
    const indicatorObject = requiredObject(entry, label)
    const keys =
      indicatorObject["note"] === undefined
        ? catalogIndicatorRequiredKeys
        : [...catalogIndicatorRequiredKeys, "note"]
    const indicator = closedProjection(indicatorObject, label, keys)
    for (const key of ["indicator_id", "label_ko", "source_column", "unit", "source_dataset_id"] as const) {
      requiredString(indicator[key], `${label}.${key}`)
    }
    requiredInteger(indicator["year"], `${label}.year`)
    requiredBoolean(indicator["source_column_verified"], `${label}.source_column_verified`)
    requiredBoolean(indicator["enabled_by_default"], `${label}.enabled_by_default`)
    if (indicator["note"] !== undefined) {
      requiredString(indicator["note"], `${label}.note`)
    }
  })
  return projection
}
function naturalKey(value: JsonObject, label: string): string {
  const schoolName = requiredString(value["school_name"], `${label}.school_name`)
  const campusName = requiredString(value["campus_name"], `${label}.campus_name`)
  if (schoolName.trim().length === 0 || campusName.trim().length === 0) {
    throw new Error(`${label} has a blank institution natural key.`)
  }
  return canonicalJson([schoolName, campusName])
}

function indicatorMap(value: JsonValue | undefined, label: string): ReadonlyMap<string, JsonObject> {
  const indicators = new Map<string, JsonObject>()
  requiredArray(value, label).forEach((entry, index) => {
    const indicator = requiredObject(entry, `${label}[${index}]`)
    const indicatorId = requiredString(indicator["indicator_id"], `${label}[${index}].indicator_id`)
    if (indicatorId.length === 0 || indicators.has(indicatorId)) {
      throw new Error(`${label} contains a blank or duplicate indicator id.`)
    }
    indicators.set(indicatorId, indicator)
  })
  return indicators
}

function normalizedIndicator(indicator: JsonObject): JsonObject {
  return {
    indicator_id: indicator["indicator_id"] as JsonValue,
    label_ko: indicator["label_ko"] as JsonValue,
    source_column: indicator["source_column"] as JsonValue,
    year: indicator["year"] as JsonValue,
    unit: indicator["unit"] as JsonValue,
    note: (indicator["note"] ?? null) as JsonValue,
    source_dataset_id: indicator["source_dataset_id"] as JsonValue,
    source_column_verified: indicator["source_column_verified"] as JsonValue,
    enabled_by_default: indicator["enabled_by_default"] as JsonValue,
  }
}

function assertObservationCounts(
  value: JsonValue | undefined,
  expected: JsonObject,
  label: string,
): void {
  validateObservationCounts(value, label)
  if (canonicalJson(requiredObject(value, label)) !== canonicalJson(expected)) {
    throw new Error(`${label} does not equal counts derived from validated classifications.`)
  }
}

function validateRelationalGraph(
  sourceModel: JsonObject,
  seedLogical: JsonObject,
  catalog: JsonObject,
): JsonObject {
  validateChildProjectionRelations(sourceModel, seedLogical)

  const source = requiredObject(sourceModel["source"], "source model.source")
  const catalogSource = requiredObject(catalog["source"], "catalog.source")
  for (const key of ["dataset_id", "dataset_name", "provider", "source_url", "license"] as const) {
    if (source[key] !== catalogSource[key]) {
      throw new Error(`catalog.source.${key} does not match source provenance.`)
    }
  }

  const catalogIndicators = indicatorMap(catalog["indicators"], "catalog.indicators")
  const seedIndicators = indicatorMap(seedLogical["indicators"], "seed logical.indicators")
  for (const indicatorId of catalogIndicators.keys()) {
    if (!(observationCountKeys as readonly string[]).includes(indicatorId)) {
      throw new Error(`catalog indicator ${indicatorId} is outside the closed observation-count catalog.`)
    }
  }
  if (catalogIndicators.size !== seedIndicators.size) {
    throw new Error("catalog and seed logical indicators have different closed coverage.")
  }
  for (const [indicatorId, catalogIndicator] of catalogIndicators) {
    const seedIndicator = seedIndicators.get(indicatorId)
    if (
      seedIndicator === undefined ||
      canonicalJson(normalizedIndicator(catalogIndicator)) !==
        canonicalJson(normalizedIndicator(seedIndicator))
    ) {
      throw new Error(`indicator ${indicatorId} metadata does not match the closed catalog.`)
    }
    if (catalogIndicator["source_dataset_id"] !== source["dataset_id"]) {
      throw new Error(`indicator ${indicatorId} source dataset does not match source provenance.`)
    }
  }
  const normalizedCatalogIndicators = requiredArray(catalog["indicators"], "catalog.indicators")
    .map((entry, index) => normalizedIndicator(requiredObject(entry, `catalog.indicators[${index}]`)))
  const normalizedSeedIndicators = requiredArray(seedLogical["indicators"], "seed logical.indicators")
    .map((entry, index) => normalizedIndicator(requiredObject(entry, `seed logical.indicators[${index}]`)))
  if (canonicalJson(normalizedCatalogIndicators) !== canonicalJson(normalizedSeedIndicators)) {
    throw new Error("catalog and seed logical indicator ordering or metadata differs.")
  }

  const headerIndexes = new Map<string, number>()
  const occupiedHeaderIndexes = new Set<number>()
  requiredArray(sourceModel["headers"], "source model.headers").forEach((entry, index) => {
    const header = requiredObject(entry, `source model.headers[${index}]`)
    const columnIndex = requiredInteger(
      header["column_index"],
      `source model.headers[${index}].column_index`,
    )
    const matchHeader = requiredString(
      header["match_header"],
      `source model.headers[${index}].match_header`,
    )
    if (
      occupiedHeaderIndexes.has(columnIndex) ||
      headerIndexes.has(matchHeader) ||
      header["column_ref"] !== indexedColumnReference(
        columnIndex,
        requiredInteger(header["worksheet_row"], `source model.headers[${index}].worksheet_row`),
      )
    ) {
      throw new Error("source model headers contain duplicate or mismatched indexed metadata.")
    }
    occupiedHeaderIndexes.add(columnIndex)
    headerIndexes.set(matchHeader, columnIndex)
  })

  const indicatorColumns = new Map<string, number>()
  for (const [indicatorId, indicator] of catalogIndicators) {
    const sourceColumn = requiredString(indicator["source_column"], `catalog indicator ${indicatorId}.source_column`)
    const columnIndex = headerIndexes.get(sourceColumn)
    if (columnIndex === undefined || [...indicatorColumns.values()].includes(columnIndex)) {
      throw new Error(`catalog indicator ${indicatorId} has missing or reused source-column metadata.`)
    }
    indicatorColumns.set(indicatorId, columnIndex)
  }

  const sourceRows = validateIndexedRows(sourceModel["rows"], "source model.rows")
  for (const [worksheetRow, cells] of sourceRows) {
    if (
      cells.size !== occupiedHeaderIndexes.size ||
      [...occupiedHeaderIndexes].some((columnIndex) => !cells.has(columnIndex))
    ) {
      throw new Error(`source row ${worksheetRow} does not have exact indexed header coverage.`)
    }
  }
  const institutions = new Map<string, JsonObject>()
  let previousInstitutionKey: string | undefined
  for (const [index, entry] of requiredArray(seedLogical["institutions"], "seed logical.institutions").entries()) {
    const institution = requiredObject(entry, `seed logical.institutions[${index}]`)
    const key = naturalKey(institution, `seed logical.institutions[${index}]`)
    if (previousInstitutionKey !== undefined && key <= previousInstitutionKey) {
      throw new Error("seed logical institutions are not in stable natural-key order.")
    }
    if (institutions.has(key)) {
      throw new Error("seed logical institutions contain a duplicate natural key.")
    }
    institutions.set(key, institution)
    previousInstitutionKey = key
  }
  if (sourceRows.size !== institutions.size) {
    throw new Error("source rows, raw rows, and institutions do not form an exact bijection.")
  }
  if (sourceRows.size === 0 && catalogIndicators.size === 0) {
    if (
      requiredArray(sourceModel["classifications"], "source model.classifications").length !== 0 ||
      requiredArray(seedLogical["observations"], "seed logical.observations").length !== 0
    ) {
      throw new Error("empty relational graph cannot contain classifications or observations.")
    }
    return Object.fromEntries(observationCountKeys.map((key) => [key, 0]))
  }

  const identityHeaders = {
    school_name: institutionColumns.schoolName,
    campus_name: institutionColumns.campusName,
    school_kind: institutionColumns.schoolKind,
    school_type: institutionColumns.schoolType,
    establishment_type: institutionColumns.establishmentType,
    region_name: institutionColumns.regionName,
  } as const
  const identityIndexes = Object.fromEntries(
    Object.entries(identityHeaders).map(([key, header]) => {
      const columnIndex = headerIndexes.get(header)
      if (columnIndex === undefined) {
        throw new Error(`source model is missing institution identity header ${header}.`)
      }
      return [key, columnIndex]
    }),
  ) as Record<keyof typeof identityHeaders, number>

  const classifications = new Map<string, JsonObject>()
  const classificationOrder: string[] = []
  const rowInstitutions = new Map<number, string>()
  const representedInstitutions = new Set<string>()
  const counts = Object.fromEntries(observationCountKeys.map((key) => [key, 0])) as Record<string, number>
  for (const [index, entry] of requiredArray(
    sourceModel["classifications"],
    "source model.classifications",
  ).entries()) {
    const classification = requiredObject(entry, `source model.classifications[${index}]`)
    const worksheetRow = requiredInteger(
      classification["worksheet_row"],
      `source model.classifications[${index}].worksheet_row`,
    )
    const rowCells = sourceRows.get(worksheetRow)
    if (rowCells === undefined) {
      throw new Error("classification references a missing source row.")
    }
    const key = naturalKey(classification, `source model.classifications[${index}]`)
    const institution = institutions.get(key)
    if (institution === undefined) {
      throw new Error("classification references an institution outside the validated institution set.")
    }
    const priorInstitution = rowInstitutions.get(worksheetRow)
    if (priorInstitution !== undefined && priorInstitution !== key) {
      throw new Error("one source row references multiple institutions.")
    }
    rowInstitutions.set(worksheetRow, key)
    representedInstitutions.add(key)
    for (const [field, columnIndex] of Object.entries(identityIndexes)) {
      const identityCell = rowCells.get(columnIndex)
      if (identityCell === undefined) {
        throw new Error(`institution ${field} is missing from its indexed source row.`)
      }
      if (institution[field] !== identityCell["raw_text"]) {
        throw new Error(`institution ${field} is not derived from its indexed source row.`)
      }
    }

    const indicatorId = requiredString(
      classification["indicator_id"],
      `source model.classifications[${index}].indicator_id`,
    )
    const expectedColumn = indicatorColumns.get(indicatorId)
    if (
      expectedColumn === undefined ||
      classification["column_index"] !== expectedColumn ||
      classification["column_ref"] !== indexedColumnReference(expectedColumn, worksheetRow)
    ) {
      throw new Error(`classification ${indicatorId} does not match closed catalog column metadata.`)
    }
    const pair = canonicalJson([key, indicatorId])
    if (classifications.has(pair)) {
      throw new Error("source model classifications contain a duplicate institution×indicator pair.")
    }
    classifications.set(pair, classification)
    classificationOrder.push(canonicalJson([worksheetRow, indicatorId]))
    if (classification["classification"] === "numeric") {
      counts[indicatorId] = (counts[indicatorId] ?? 0) + 1
    }
  }

  if (
    classifications.size !== institutions.size * catalogIndicators.size ||
    rowInstitutions.size !== sourceRows.size ||
    representedInstitutions.size !== institutions.size
  ) {
    throw new Error("classification coverage is not exactly one row×closed-catalog indicator pair.")
  }
  for (const key of institutions.keys()) {
    for (const indicatorId of catalogIndicators.keys()) {
      if (!classifications.has(canonicalJson([key, indicatorId]))) {
        throw new Error("classification coverage has a missing institution×indicator pair.")
      }
    }
  }
  const expectedClassificationOrder = [...sourceRows.keys()].flatMap((worksheetRow) =>
    [...catalogIndicators.keys()].map((indicatorId) => canonicalJson([worksheetRow, indicatorId])),
  )
  if (canonicalJson(classificationOrder) !== canonicalJson(expectedClassificationOrder)) {
    throw new Error("source model classifications are not in stable row×catalog order.")
  }

  const observations = new Set<string>()
  let previousObservationKey: string | undefined
  for (const [index, entry] of requiredArray(
    seedLogical["observations"],
    "seed logical.observations",
  ).entries()) {
    const observation = requiredObject(entry, `seed logical.observations[${index}]`)
    const key = naturalKey(observation, `seed logical.observations[${index}]`)
    const indicatorId = requiredString(
      observation["indicator_id"],
      `seed logical.observations[${index}].indicator_id`,
    )
    const observationOrderKey = canonicalJson([
      observation["school_name"] as JsonValue,
      observation["campus_name"] as JsonValue,
      indicatorId,
    ])
    if (previousObservationKey !== undefined && observationOrderKey <= previousObservationKey) {
      throw new Error("seed logical observations contain a duplicate or unstable relation.")
    }
    previousObservationKey = observationOrderKey
    const pair = canonicalJson([key, indicatorId])
    const classification = classifications.get(pair)
    const indicator = seedIndicators.get(indicatorId)
    if (
      classification === undefined ||
      indicator === undefined ||
      observations.has(pair) ||
      observation["raw_text"] !== classification["raw_text"] ||
      observation["classification"] !== classification["classification"] ||
      observation["missing_marker"] !== classification["missing_marker"] ||
      observation["canonical_value"] !== classification["canonical_value"] ||
      observation["source_column"] !== indicator["source_column"] ||
      observation["year"] !== indicator["year"] ||
      observation["unit"] !== indicator["unit"]
    ) {
      throw new Error("seed logical observation does not match its validated classification and catalog metadata.")
    }
    observations.add(pair)
  }
  if (observations.size !== classifications.size) {
    throw new Error("seed logical observations do not have exact classification coverage.")
  }
  return counts
}

function assertManifestGraph(
  manifest: JsonObject,
  seedLogical: JsonObject,
  catalog: JsonObject,
  expectedCounts: JsonObject,
  label: string,
): void {
  const source = requiredObject(seedLogical["provenance"], "seed logical.provenance")
  for (const key of sourceKeys) {
    if (manifest[key] !== source[key]) {
      throw new Error(`${label}.${key} does not match validated source provenance.`)
    }
  }
  if (
    canonicalJson(requiredArray(manifest["indicators"], `${label}.indicators`)) !==
    canonicalJson(requiredArray(seedLogical["indicators"], "seed logical.indicators"))
  ) {
    throw new Error(`${label}.indicators do not match the validated closed catalog relation.`)
  }
  assertObservationCounts(manifest["observation_counts"], expectedCounts, `${label}.observation_counts`)
  const catalogSource = requiredObject(catalog["source"], "catalog.source")
  for (const key of ["derived_database", "bundled"] as const) {
    if (manifest[key] !== catalogSource[key]) {
      throw new Error(`${label}.${key} does not match the closed catalog.`)
    }
  }
}

function validateObservationCounts(value: JsonValue | undefined, label: string): void {
  const counts = closedProjection(requiredObject(value, label), label, observationCountKeys)
  observationCountKeys.forEach((key) => {
    const count = requiredInteger(counts[key], `${label}.${key}`)
    if (count < 0) {
      throw new Error(`${label}.${key} must not be negative.`)
    }
  })
}

function validateManifestInput(
  value: JsonObject,
  sourceModel: JsonObject,
  seedLogical: JsonObject,
  catalog: JsonObject,
): JsonObject {
  const manifest = closedProjection(value, "manifest", manifestInputKeys)
  for (const key of [
    "dataset_id",
    "dataset_name",
    "provider",
    "source_url",
    "license",
    "source_file_name",
    "source_downloaded_at",
    "seed_built_at",
    "source_file_downloaded_at",
    "source_file_modified_or_observed_at",
    "source_page_observed_at",
    "source_file_checksum_sha256",
    "header_snapshot_checksum_sha256",
    "seed_db_checksum_sha256",
  ] as const) {
    requiredString(manifest[key], `manifest.${key}`)
  }
  for (const key of [
    "derived_database",
    "bundled",
    "seed_is_latest_claim",
    "api_key_required",
    "source_file_private_path_excluded",
    "per_indicator_year_unit",
  ] as const) {
    requiredBoolean(manifest[key], `manifest.${key}`)
  }
  requiredArray(manifest["indicators"], "manifest.indicators").forEach((entry, index) =>
    validateSemanticIndicator(entry, `manifest.indicators[${index}]`),
  )
  validateObservationCounts(manifest["observation_counts"], "manifest.observation_counts")
  validateStrings(manifest["warnings"], "manifest.warnings")

  const audit = closedProjection(
    requiredObject(manifest["audit_evidence"], "manifest.audit_evidence"),
    "manifest.audit_evidence",
    auditEvidenceKeys,
  )
  for (const key of [
    "source_file_checksum_sha256",
    "header_snapshot_checksum_sha256",
    "seed_db_checksum_sha256",
  ] as const) {
    requiredString(audit[key], `manifest.audit_evidence.${key}`)
  }
  validateObservationCounts(
    audit["observation_counts"],
    "manifest.audit_evidence.observation_counts",
  )

  const supplied = closedProjection(
    requiredObject(
      manifest["semantic_digest_projection_inputs"],
      "manifest.semantic_digest_projection_inputs",
    ),
    "manifest.semantic_digest_projection_inputs",
    semanticProjectionInputKeys,
  )
  const suppliedSourceModel = validateSourceModel(
    requiredObject(
      supplied["source_model_digest_v1"],
      "manifest.semantic_digest_projection_inputs.source_model_digest_v1",
    ),
  )
  const suppliedSeedLogical = validateSeedLogical(
    requiredObject(
      supplied["seed_logical_digest_v1"],
      "manifest.semantic_digest_projection_inputs.seed_logical_digest_v1",
    ),
  )
  if (
    canonicalJson(suppliedSourceModel) !== canonicalJson(sourceModel) ||
    canonicalJson(suppliedSeedLogical) !== canonicalJson(seedLogical)
  ) {
    throw new Error("manifest semantic projection input bodies must match validated child projections.")
  }

  const expectedCounts = validateRelationalGraph(sourceModel, seedLogical, catalog)
  assertManifestGraph(manifest, seedLogical, catalog, expectedCounts, "manifest")
  assertObservationCounts(
    audit["observation_counts"],
    expectedCounts,
    "manifest.audit_evidence.observation_counts",
  )
  for (const key of [
    "source_file_checksum_sha256",
    "header_snapshot_checksum_sha256",
    "seed_db_checksum_sha256",
  ] as const) {
    if (audit[key] !== manifest[key]) {
      throw new Error(`manifest.audit_evidence.${key} does not match the manifest checksum.`)
    }
  }
  const catalogSource = requiredObject(catalog["source"], "catalog.source")
  for (const key of ["derived_database", "bundled"] as const) {
    if (manifest[key] !== catalogSource[key]) {
      throw new Error(`manifest.${key} does not match the closed catalog.`)
    }
  }
  return manifest
}

function validateManifestSemanticBody(value: JsonValue | undefined): JsonObject {
  const label = "manifest semantic.manifest"
  const manifest = closedProjection(requiredObject(value, label), label, manifestSemanticKeys)
  for (const key of [
    "dataset_id",
    "dataset_name",
    "provider",
    "source_url",
    "license",
    "source_file_name",
  ] as const) {
    requiredString(manifest[key], `${label}.${key}`)
  }
  for (const key of [
    "derived_database",
    "bundled",
    "seed_is_latest_claim",
    "api_key_required",
    "source_file_private_path_excluded",
    "per_indicator_year_unit",
  ] as const) {
    requiredBoolean(manifest[key], `${label}.${key}`)
  }
  requiredArray(manifest["indicators"], `${label}.indicators`).forEach((entry, index) =>
    validateSemanticIndicator(entry, `${label}.indicators[${index}]`),
  )
  validateObservationCounts(manifest["observation_counts"], `${label}.observation_counts`)
  validateStrings(manifest["warnings"], `${label}.warnings`)
  return manifest
}

function validateManifestSemantic(value: JsonObject): JsonObject {
  const projection = closedProjection(
    value,
    "manifest semantic",
    manifestSemanticProjectionKeys,
  )
  assertProjectionVersion(projection, "projection_version", "manifest_semantic_digest_v1")
  validateManifestSemanticBody(projection["manifest"])
  const digests = closedProjection(
    requiredObject(projection["child_digests"], "manifest semantic.child_digests"),
    "manifest semantic.child_digests",
    childDigestKeys,
  )
  childDigestKeys.forEach((key) => validateDigest(digests[key], `manifest semantic.child_digests.${key}`))
  return projection
}

function validateDigest(value: JsonValue | undefined, label: string): string {
  const digest = requiredString(value, label)
  if (!/^[0-9a-f]{64}$/u.test(digest)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`)
  }
  return digest
}

function validatedBinding(
  value: SemanticProjectionBinding,
  label: string,
  validator: (projection: JsonObject) => JsonObject,
): SemanticProjectionBinding {
  const binding = closedProjection(
    value as unknown as JsonObject,
    `${label} binding`,
    ["projection", "digest"],
  )
  const projection = validator(requiredObject(binding["projection"], `${label} binding.projection`))
  const digest = validateDigest(binding["digest"], `${label} binding.digest`)
  const recomputed = canonicalSha256(projection)
  if (digest !== recomputed) {
    throw new Error(`${label} child digest does not match its validated projection body.`)
  }
  return { projection, digest }
}

export function buildManifestSemanticProjection(
  manifestInput: JsonObject,
  children: {
    readonly source_model_digest_v1: SemanticProjectionBinding
    readonly seed_logical_digest_v1: SemanticProjectionBinding
    readonly catalog_digest_v1: SemanticProjectionBinding
  },
): JsonObject {
  const childInput = closedProjection(
    children as unknown as JsonObject,
    "manifest semantic children",
    childDigestKeys,
  )
  const source = validatedBinding(
    childInput["source_model_digest_v1"] as unknown as SemanticProjectionBinding,
    "source model",
    validateSourceModel,
  )
  const seed = validatedBinding(
    childInput["seed_logical_digest_v1"] as unknown as SemanticProjectionBinding,
    "seed logical",
    validateSeedLogical,
  )
  const catalog = validatedBinding(
    childInput["catalog_digest_v1"] as unknown as SemanticProjectionBinding,
    "catalog",
    validateCatalog,
  )
  validateChildProjectionRelations(source.projection, seed.projection)
  const manifest = selectedProjection(
    validateManifestInput(manifestInput, source.projection, seed.projection, catalog.projection),
    "manifest semantic",
    manifestSemanticKeys,
  )
  return validateManifestSemantic({
    projection_version: "manifest_semantic_digest_v1",
    manifest,
    child_digests: {
      source_model_digest_v1: source.digest,
      seed_logical_digest_v1: seed.digest,
      catalog_digest_v1: catalog.digest,
    },
  })
}

export function buildReleaseDataProjection(
  children: {
    readonly source_model_digest_v1: SemanticProjectionBinding
    readonly seed_logical_digest_v1: SemanticProjectionBinding
    readonly catalog_digest_v1: SemanticProjectionBinding
    readonly manifest_semantic_digest_v1: SemanticProjectionBinding
  },
): JsonObject {
  const childInput = closedProjection(
    children as unknown as JsonObject,
    "release data children",
    releaseChildDigestKeys,
  )
  const source = validatedBinding(
    childInput["source_model_digest_v1"] as unknown as SemanticProjectionBinding,
    "source model",
    validateSourceModel,
  )
  const seed = validatedBinding(
    childInput["seed_logical_digest_v1"] as unknown as SemanticProjectionBinding,
    "seed logical",
    validateSeedLogical,
  )
  const catalog = validatedBinding(
    childInput["catalog_digest_v1"] as unknown as SemanticProjectionBinding,
    "catalog",
    validateCatalog,
  )
  const expectedCounts = validateRelationalGraph(source.projection, seed.projection, catalog.projection)
  const manifest = validatedBinding(
    childInput["manifest_semantic_digest_v1"] as unknown as SemanticProjectionBinding,
    "manifest semantic",
    validateManifestSemantic,
  )
  assertManifestGraph(
    requiredObject(manifest.projection["manifest"], "manifest semantic.manifest"),
    seed.projection,
    catalog.projection,
    expectedCounts,
    "manifest semantic.manifest",
  )
  const manifestDigests = requiredObject(
    manifest.projection["child_digests"],
    "manifest semantic.child_digests",
  )
  for (const [key, binding] of [
    ["source_model_digest_v1", source],
    ["seed_logical_digest_v1", seed],
    ["catalog_digest_v1", catalog],
  ] as const) {
    if (manifestDigests[key] !== binding.digest) {
      throw new Error(`release data ${key} body/digest pair differs from the manifest child edge.`)
    }
  }

  const release = closedProjection({
    projection_version: "release_data_digest_v1",
    child_digests: {
      source_model_digest_v1: source.digest,
      seed_logical_digest_v1: seed.digest,
      catalog_digest_v1: catalog.digest,
      manifest_semantic_digest_v1: manifest.digest,
    },
    policy_versions: policyVersions,
    schema_versions: schemaVersions,
  }, "release data", releaseDataProjectionKeys)
  assertProjectionVersion(release, "projection_version", "release_data_digest_v1")
  const digests = closedProjection(
    requiredObject(release["child_digests"], "release data.child_digests"),
    "release data.child_digests",
    releaseChildDigestKeys,
  )
  releaseChildDigestKeys.forEach((key) => validateDigest(digests[key], `release data.child_digests.${key}`))
  const policies = closedProjection(
    requiredObject(release["policy_versions"], "release data.policy_versions"),
    "release data.policy_versions",
    policyVersionKeys,
  )
  policyVersionKeys.forEach((key) => requiredString(policies[key], `release data.policy_versions.${key}`))
  const schemas = closedProjection(
    requiredObject(release["schema_versions"], "release data.schema_versions"),
    "release data.schema_versions",
    schemaVersionKeys,
  )
  schemaVersionKeys.forEach((key) => requiredInteger(schemas[key], `release data.schema_versions.${key}`))
  return release
}

export function buildSemanticDigestProjections(
  input: SemanticDigestDagInput,
): SemanticDigestProjections {
  const dagInput = closedProjection(
    input as unknown as JsonObject,
    "semantic digest DAG input",
    ["sourceModel", "seedLogical", "catalog", "manifest"],
  )
  const sourceModel = validateSourceModel(
    requiredObject(dagInput["sourceModel"], "semantic digest DAG input.sourceModel"),
  )
  const seedLogical = validateSeedLogical(
    requiredObject(dagInput["seedLogical"], "semantic digest DAG input.seedLogical"),
  )
  const catalog = validateCatalog(
    requiredObject(dagInput["catalog"], "semantic digest DAG input.catalog"),
  )
  const sourceBinding = { projection: sourceModel, digest: canonicalSha256(sourceModel) }
  const seedBinding = { projection: seedLogical, digest: canonicalSha256(seedLogical) }
  const catalogBinding = { projection: catalog, digest: canonicalSha256(catalog) }
  const manifestSemantic = buildManifestSemanticProjection(
    requiredObject(dagInput["manifest"], "semantic digest DAG input.manifest"),
    {
      source_model_digest_v1: sourceBinding,
      seed_logical_digest_v1: seedBinding,
      catalog_digest_v1: catalogBinding,
    },
  )
  const manifestBinding = {
    projection: manifestSemantic,
    digest: canonicalSha256(manifestSemantic),
  }
  const releaseData = buildReleaseDataProjection({
    source_model_digest_v1: sourceBinding,
    seed_logical_digest_v1: seedBinding,
    catalog_digest_v1: catalogBinding,
    manifest_semantic_digest_v1: manifestBinding,
  })

  return { sourceModel, seedLogical, catalog, manifestSemantic, releaseData }
}

export function buildSemanticDigestDag(input: SemanticDigestDagInput): SemanticDigestDag {
  const projections = buildSemanticDigestProjections(input)

  return {
    source_model_digest_v1: canonicalSha256(projections.sourceModel),
    seed_logical_digest_v1: canonicalSha256(projections.seedLogical),
    catalog_digest_v1: canonicalSha256(projections.catalog),
    manifest_semantic_digest_v1: canonicalSha256(projections.manifestSemantic),
    release_data_digest_v1: canonicalSha256(projections.releaseData),
  }
}
