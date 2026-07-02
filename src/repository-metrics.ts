import {
  bundledSource,
  defaultIndicators,
  indicatorByName,
  invalidIndicatorNames,
  sourceForIndicator,
  type IndicatorDefinition,
} from "./catalog.js"
import { openDatabase, repositoryDatabaseError } from "./repository-db.js"
import { metricRowSchema, rawRowJsonSchema } from "./repository-schemas.js"
import type { SqliteDatabase } from "./repository-db.js"
import type { Institution, MetricLookup, MetricValue, MissingMetric, RepositoryResult } from "./repository-types.js"

const rawSchoolNameColumn = "학교명"
const rawCampusNameColumn = "본분교명"

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
    const requested = selection.kind === "explicit_subset" ? selection.indicators : []
    const rows = dbResult.value
      .prepare(
        `SELECT o.indicator_id, ind.label_ko, o.value, o.raw_value, o.year, o.unit, o.source_column
         FROM observations o
         JOIN indicators ind ON ind.indicator_id = o.indicator_id
         WHERE o.institution_id = ?
         ORDER BY ind.rowid`,
      )
      .all(institution.id)
      .map((row) => metricRowSchema.parse(row))
      .filter((row) => requested.length === 0 || requested.includes(row.indicator_id))
    const metrics = rows.map(metricValueFromRow)

    return {
      ok: true,
      value: {
        metrics,
        missingMetrics: missingMetricsForInstitution(
          dbResult.value,
          institution,
          requested,
          new Set(metrics.map((metric) => metric.indicator)),
        ),
      },
    }
  } catch (error) {
    return repositoryDatabaseError(error)
  } finally {
    dbResult.value.close()
  }
}

function metricValueFromRow(row: ReturnType<typeof metricRowSchema.parse>): MetricValue {
  const indicator = indicatorByName(row.indicator_id)
  const source = indicator === undefined
    ? { ...bundledSource, source_column: row.source_column, base_year: String(row.year), unit: row.unit }
    : sourceForIndicator(indicator)

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

function missingMetricsForInstitution(
  db: SqliteDatabase,
  institution: Institution,
  requested: readonly string[],
  returnedIndicators: ReadonlySet<string>,
): readonly MissingMetric[] {
  const rawRow = rawRowForInstitution(db, institution)

  if (rawRow === null) {
    return []
  }

  return missingMetricsFromRawRow(
    requested.length === 0 ? defaultIndicators : requested.map(indicatorByName).filter(isIndicator),
    returnedIndicators,
    rawRow,
  )
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

    if (isBlankSourceMarker(rawValue)) {
      missingMetrics.push({
        indicator: indicator.indicator,
        reason: "blank_in_source",
        value: null,
        raw_value: rawValue,
        source_column: indicator.source_column,
      })
    }
  }

  return missingMetrics
}

function rawRowForInstitution(
  db: SqliteDatabase,
  institution: Institution,
): Record<string, unknown> | null {
  const rows = db.prepare("SELECT row_json FROM raw_rows").all()

  for (const row of rows) {
    const parsedRow = rawRowJsonSchema.parse(row)
    const rawRow = parseRawRowJson(parsedRow.row_json)

    if (
      rawRow !== null &&
      stringProperty(rawRow, rawSchoolNameColumn) === institution.school_name &&
      stringProperty(rawRow, rawCampusNameColumn) === institution.campus_name
    ) {
      return rawRow
    }
  }

  return null
}

function parseRawRowJson(rowJson: string): Record<string, unknown> | null {
  const parsed: unknown = JSON.parse(rowJson)
  return isRecord(parsed) ? parsed : null
}

function stringProperty(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === "string" ? value.trim() : ""
}

function isBlankSourceMarker(rawValue: string): boolean {
  return rawValue.length === 0 || rawValue === "-"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isIndicator(value: IndicatorDefinition | undefined): value is IndicatorDefinition {
  return value !== undefined
}
