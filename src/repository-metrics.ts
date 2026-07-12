import {
  defaultIndicators,
  indicatorByName,
  invalidIndicatorNames,
  sourceForIndicator,
  type IndicatorDefinition,
} from "./catalog.js"
import { parseDecimalCell } from "./canonical-decimal.js"
import { openDatabase, repositoryDatabaseError } from "./repository-db.js"
import {
  metricBatchRowSchema,
  metricObservationRowSchema,
  metricRowSchema,
  observationMetadataRowSchema,
  rawRowJsonSchema,
  rawRowValueSchema,
} from "./repository-schemas.js"
import type { SqliteDatabase } from "./repository-db.js"
import type {
  Institution,
  MetricLookup,
  MetricValue,
  MissingMetric,
  RepositoryResult,
} from "./repository-types.js"

const rawSchoolNameColumn = "학교명"
const rawCampusNameColumn = "본분교명"

function hasObservationCanonicalColumn(db: SqliteDatabase): boolean {
  return db
    .prepare("PRAGMA table_info(observations)")
    .all()
    .some((column) =>
      typeof column === "object"
      && column !== null
      && "name" in column
      && column.name === "canonical_value")
}

function canonicalizeLegacyObservationRow(
  row: unknown,
  hasStoredCanonical: boolean,
): unknown {
  if (
    hasStoredCanonical
    || typeof row !== "object"
    || row === null
    || !("raw_value" in row)
    || typeof row.raw_value !== "string"
  ) {
    return row
  }

  const classification = parseDecimalCell(row.raw_value)
  if (classification.kind !== "numeric") {
    return row
  }

  return { ...row, canonical_value: classification.canonical_value }
}
type MetricSelection =
  | { readonly kind: "default_all" }
  | { readonly kind: "explicit_subset"; readonly indicators: readonly string[] }
  | { readonly kind: "invalid_request"; readonly invalidIndicators: readonly string[] }

function metricSelection(indicators: readonly string[] | undefined): MetricSelection {
  if (indicators === undefined || indicators.length === 0) {
    return { kind: "default_all" }
  }

  const invalidIndicators = invalidIndicatorNames(indicators)

  if (invalidIndicators.length > 0) {
    return { kind: "invalid_request", invalidIndicators }
  }

  const validIndicators: string[] = []
  for (const requestedIndicator of indicators) {
    const normalizedIndicator = requestedIndicator.trim()
    if (!validIndicators.includes(normalizedIndicator)) {
      validIndicators.push(normalizedIndicator)
    }
  }

  return { kind: "explicit_subset", indicators: validIndicators }
}

function invalidIndicatorData(invalidIndicators: readonly string[]): Record<string, unknown> {
  return {
    error: {
      code: "invalid_request",
      message: "One or more requested indicators are not defined in the v0.1 file-first indicator catalog.",
    },
    invalid_indicators: invalidIndicators,
  }
}

export function metricsForInstitution(
  institution: Institution,
  indicators: readonly string[] | undefined,
): RepositoryResult<MetricLookup> {
  const selection = metricSelection(indicators)

  if (selection.kind === "invalid_request") {
    return {
      ok: false,
      code: "invalid_request",
      data: {
        ...invalidIndicatorData(selection.invalidIndicators),
        metrics: [],
        missing_metrics: [],
      },
    }
  }

  const dbResult = openDatabase()

  if (!dbResult.ok) {
    return dbResult
  }

  try {
    const hasStoredCanonical = hasObservationCanonicalColumn(dbResult.value)
    const requested = selection.kind === "explicit_subset" ? selection.indicators : []
    const requestedIndicators = requested.length === 0
      ? defaultIndicators
      : requested.map(indicatorByName).filter(isIndicator)
    const rows = dbResult.value
      .prepare(
        `SELECT o.id AS observation_id, o.institution_id, o.indicator_id, ind.label_ko,
                o.value, ${hasStoredCanonical ? "o.canonical_value" : "o.raw_value"} AS canonical_value,
                o.raw_value, o.year, o.unit, o.source_column
         FROM observations o
         LEFT JOIN indicators ind ON ind.indicator_id = o.indicator_id
         WHERE o.institution_id = ?
         ORDER BY ind.rowid`,
      )
      .all(institution.id)
      .map((row) => canonicalizeLegacyObservationRow(row, hasStoredCanonical))
      .map((row) => metricObservationRowSchema.parse(row))

    const seenObservationIds = new Set<number>()
    const rowsByIndicator = new Map<string, ReturnType<typeof metricRowSchema.parse>>()

    for (const row of rows) {
      validateObservation(row)

      if (seenObservationIds.has(row.observation_id)) {
        throw new Error("Duplicate observation ID.")
      }
      if (rowsByIndicator.has(row.indicator_id)) {
        throw new Error("Duplicate observation natural key.")
      }

      seenObservationIds.add(row.observation_id)
      rowsByIndicator.set(row.indicator_id, row)
    }

    const rawRow = rawRowForInstitution(dbResult.value, institution)
    validateInstitutionEvidence(rawRow, rowsByIndicator)

    const metrics = rows
      .filter((row) => requested.length === 0 || requested.includes(row.indicator_id))
      .map(metricValueFromRow)

    return {
      ok: true,
      value: {
        metrics,
        missingMetrics: missingMetricsFromRawRow(
          requestedIndicators,
          new Set(metrics.map((metric) => metric.indicator)),
          rawRow,
        ),
      },
    }
  } catch (error) {
    return repositoryDatabaseError(error)
  } finally {
    dbResult.value.close()
  }
}

export function metricsForInstitutions(
  db: SqliteDatabase,
  institutions: readonly Institution[],
  indicators: readonly string[],
): readonly MetricLookup[] {
  if (institutions.length === 0) {
    return []
  }

  const hasStoredCanonical = hasObservationCanonicalColumn(db)
  const requestedIndicators = indicators.length === 0
    ? defaultIndicators
    : indicators.map(indicatorByName).filter(isIndicator)
  const institutionPlaceholders = institutions.map(() => "?").join(", ")
  const indicatorPlaceholders = requestedIndicators.map(() => "?").join(", ")
  const observationRows = db
    .prepare(
      `SELECT o.institution_id, o.indicator_id, ind.label_ko, o.value,
              ${hasStoredCanonical ? "o.canonical_value" : "o.raw_value"} AS canonical_value,
              o.raw_value, o.year, o.unit, o.source_column
       FROM observations o
       LEFT JOIN indicators ind ON ind.indicator_id = o.indicator_id
       WHERE o.institution_id IN (${institutionPlaceholders})`,
    )
    .all(...institutions.map((institution) => institution.id))
    .map((row) => canonicalizeLegacyObservationRow(row, hasStoredCanonical))
    .map((row) => observationMetadataRowSchema.parse(row))
  const observationsByInstitution = new Map<
    number,
    Map<string, ReturnType<typeof observationMetadataRowSchema.parse>>
  >()

  for (const observation of observationRows) {
    validateObservation(observation)

    const institutionRows = observationsByInstitution.get(observation.institution_id)
      ?? new Map<string, ReturnType<typeof observationMetadataRowSchema.parse>>()
    if (institutionRows.has(observation.indicator_id)) {
      throw new Error("Duplicate observation natural key.")
    }

    institutionRows.set(observation.indicator_id, observation)
    observationsByInstitution.set(observation.institution_id, institutionRows)
  }
  const rows = db
    .prepare(
      `SELECT o.institution_id, o.indicator_id, ind.label_ko, o.value,
              ${hasStoredCanonical ? "o.canonical_value" : "o.raw_value"} AS canonical_value,
              o.raw_value, o.year, o.unit, o.source_column
       FROM observations o
       JOIN indicators ind ON ind.indicator_id = o.indicator_id
       WHERE o.institution_id IN (${institutionPlaceholders})
         AND o.indicator_id IN (${indicatorPlaceholders})`,
    )
    .all(
      ...institutions.map((institution) => institution.id),
      ...requestedIndicators.map((indicator) => indicator.indicator),
    )
    .map((row) => canonicalizeLegacyObservationRow(row, hasStoredCanonical))
    .map((row) => metricBatchRowSchema.parse(row))
  const rowsByInstitution = new Map<
    number,
    Map<string, ReturnType<typeof metricRowSchema.parse>>
  >()

  for (const row of rows) {
    validateObservation(row)
    const evidenceRow = observationsByInstitution
      .get(row.institution_id)
      ?.get(row.indicator_id)
    if (
      evidenceRow === undefined
      || evidenceRow.label_ko !== row.label_ko
      || !Object.is(evidenceRow.value, row.value)
      || evidenceRow.canonical_value !== row.canonical_value
      || evidenceRow.raw_value !== row.raw_value
      || evidenceRow.year !== row.year
      || evidenceRow.unit !== row.unit
      || evidenceRow.source_column !== row.source_column
    ) {
      throw new Error("Joined metric row conflicts with its observation evidence.")
    }

    const institutionRows =
      rowsByInstitution.get(row.institution_id) ??
      new Map<string, ReturnType<typeof metricRowSchema.parse>>()
    if (institutionRows.has(row.indicator_id)) {
      throw new Error("Duplicate metric natural key.")
    }
    institutionRows.set(row.indicator_id, row)
    rowsByInstitution.set(row.institution_id, institutionRows)
  }

  const rawRows = rawRowsByInstitution(db)

  return institutions.map((institution) => {
    const institutionRows = rowsByInstitution.get(institution.id)
    const metrics = requestedIndicators
      .map((indicator) => institutionRows?.get(indicator.indicator))
      .filter(isMetricRow)
      .map(metricValueFromRow)
    const rawRow = requiredRawRow(rawRows, institution)
    validateInstitutionEvidence(
      rawRow,
      observationsByInstitution.get(institution.id) ?? new Map(),
    )

    return {
      metrics,
      missingMetrics: missingMetricsFromRawRow(
        requestedIndicators,
        new Set(metrics.map((metric) => metric.indicator)),
        rawRow,
      ),
    }
  })
}

function rawRowsByInstitution(db: SqliteDatabase): ReadonlyMap<string, Record<string, unknown>> {
  const rawRows = new Map<string, Record<string, unknown>>()

  for (const row of db.prepare("SELECT row_json FROM raw_rows").all()) {
    const parsedRow = rawRowJsonSchema.parse(row)
    const rawRow = parseRawRowJson(parsedRow.row_json)
    validateRawRow(rawRow)

    const key = institutionKey(
      stringProperty(rawRow, rawSchoolNameColumn),
      stringProperty(rawRow, rawCampusNameColumn),
    )
    if (rawRows.has(key)) {
      throw new Error("Duplicate raw-row natural key.")
    }

    rawRows.set(key, rawRow)
  }

  return rawRows
}

function institutionKey(schoolName: string, campusName: string): string {
  return JSON.stringify([schoolName, campusName])
}

function isMetricRow(
  value: ReturnType<typeof metricRowSchema.parse> | undefined,
): value is ReturnType<typeof metricRowSchema.parse> {
  return value !== undefined
}

function metricValueFromRow(row: ReturnType<typeof metricRowSchema.parse>): MetricValue {
  const indicator = validateObservation(row)
  const source = sourceForIndicator(indicator)
  return {
    indicator: row.indicator_id,
    label_ko: row.label_ko,
    value: row.value,
    raw_value: row.raw_value,
    year: row.year,
    base_year: String(row.year),
    unit: row.unit,
    source_column: row.source_column,
    source,
    warnings: ["Value is from the normalized bundled 15118998 derivative seed DB."],
  }
}

function missingMetricsFromRawRow(
  requestedIndicators: readonly IndicatorDefinition[],
  returnedIndicators: ReadonlySet<string>,
  rawRow: Record<string, unknown>,
): readonly MissingMetric[] {
  const missingMetrics: MissingMetric[] = []

  for (const indicator of requestedIndicators) {
    if (returnedIndicators.has(indicator.indicator)) {
      continue
    }

    const rawValue = stringProperty(rawRow, indicator.source_column)
    const classification = parseDecimalCell(rawValue)

    if (classification.kind !== "missing") {
      throw new Error("Numeric source evidence has no matching observation.")
    }

    missingMetrics.push({
      indicator: indicator.indicator,
      reason: "blank_in_source",
      value: null,
      raw_value: rawValue,
      source_column: indicator.source_column,
    })
  }

  return missingMetrics
}

function rawRowForInstitution(
  db: SqliteDatabase,
  institution: Institution,
): Record<string, unknown> {
  return requiredRawRow(rawRowsByInstitution(db), institution)
}

function requiredRawRow(
  rawRows: ReadonlyMap<string, Record<string, unknown>>,
  institution: Institution,
): Record<string, unknown> {
  const rawRow = rawRows.get(
    institutionKey(institution.school_name, institution.campus_name),
  )

  if (rawRow === undefined) {
    throw new Error("Resolved institution has no raw-row evidence.")
  }

  return rawRow
}

function parseRawRowJson(rowJson: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(rowJson)
  return rawRowValueSchema.parse(parsed)
}

function validateRawRow(rawRow: Record<string, unknown>): void {
  stringProperty(rawRow, rawSchoolNameColumn)
  stringProperty(rawRow, rawCampusNameColumn)

  for (const indicator of defaultIndicators) {
    stringProperty(rawRow, indicator.source_column)
  }
}

function sourceCell(record: Record<string, unknown>, key: string): string {
  const value = record[key]

  if (typeof value !== "string") {
    throw new Error("Raw-row source cell is absent or not a string.")
  }

  return value
}

function stringProperty(record: Record<string, unknown>, key: string): string {
  return sourceCell(record, key).trim()
}

type ObservationValue = {
  readonly indicator_id: string
  readonly label_ko: string | null
  readonly value: number
  readonly canonical_value: string
  readonly raw_value: string
  readonly year: number
  readonly unit: string
  readonly source_column: string
}

function validateObservation(row: ObservationValue): IndicatorDefinition {
  const indicator = validateObservationMetadata(row)
  const canonical = parseDecimalCell(row.canonical_value)
  const rawValue = parseDecimalCell(row.raw_value)

  if (
    canonical.kind !== "numeric"
    || canonical.canonical_value !== row.canonical_value
    || !Object.is(canonical.value, row.value)
    || rawValue.kind !== "numeric"
    || rawValue.canonical_value !== row.canonical_value
    || !Object.is(rawValue.value, row.value)
  ) {
    throw new Error("Observation decimal fields are not canonically consistent.")
  }

  return indicator
}

function validateInstitutionEvidence(
  rawRow: Record<string, unknown>,
  observations: ReadonlyMap<string, ObservationValue>,
): void {
  for (const indicator of defaultIndicators) {
    const sourceValue = sourceCell(rawRow, indicator.source_column)
    const classification = parseDecimalCell(sourceValue)
    const observation = observations.get(indicator.indicator)

    if (classification.kind === "invalid") {
      throw new Error("Raw-row source cell is not an exact decimal or missing marker.")
    }

    if (classification.kind === "missing") {
      if (observation !== undefined) {
        throw new Error("Observation exists over missing raw-row source evidence.")
      }
      continue
    }

    if (observation === undefined) {
      throw new Error("Numeric raw-row source evidence has no observation.")
    }

    if (
      observation.raw_value !== sourceValue
      || observation.canonical_value !== classification.canonical_value
      || !Object.is(observation.value, classification.value)
    ) {
      throw new Error("Observation does not match numeric raw-row source evidence.")
    }
  }
}

function validateObservationMetadata(row: {
  readonly indicator_id: string
  readonly label_ko: string | null
  readonly year: number
  readonly unit: string
  readonly source_column: string
}): IndicatorDefinition {
  const indicator = indicatorByName(row.indicator_id)

  if (indicator === undefined) {
    throw new Error("Observation indicator is outside the closed catalog.")
  }

  if (
    row.label_ko !== indicator.label_ko
    || row.year !== Number(indicator.base_year)
    || row.unit !== indicator.unit
    || row.source_column !== indicator.source_column
  ) {
    throw new Error("Observation metadata conflicts with the closed catalog.")
  }

  return indicator
}
function isIndicator(value: IndicatorDefinition | undefined): value is IndicatorDefinition {
  return value !== undefined
}
