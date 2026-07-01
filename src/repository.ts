import type { DatabaseSync } from "node:sqlite"

import { bundledSource, indicatorByName, sourceForIndicator } from "./catalog.js"
import { openDatabase } from "./repository-db.js"
import {
  countRowSchema,
  institutionRowSchema,
  metricRowSchema,
  singleCountRowSchema,
} from "./repository-schemas.js"
import type {
  Comparison,
  Institution,
  MetricValue,
  RepositoryResult,
} from "./repository-types.js"

export type { Comparison, Institution, MetricValue, RepositoryResult }

function allInstitutions(db: DatabaseSync): readonly Institution[] {
  return db
    .prepare("SELECT * FROM institutions ORDER BY school_name, campus_name")
    .all()
    .map((row) => institutionRowSchema.parse(row))
}

function candidateData(candidates: readonly Institution[]): Record<string, unknown> {
  return {
    candidates: candidates.map((candidate) => ({
      university_name: candidate.school_name,
      campus_name: candidate.campus_name,
      school_kind: candidate.school_kind,
      school_type: candidate.school_type,
      establishment_type: candidate.establishment_type,
      region_name: candidate.region_name,
    })),
    matched_count: candidates.length,
  }
}

export function searchInstitutions(query: string): RepositoryResult<readonly Institution[]> {
  const dbResult = openDatabase()

  if (!dbResult.ok) {
    return dbResult
  }

  try {
    const trimmed = query.trim()

    if (trimmed.length === 0) {
      return { ok: false, code: "ambiguous", data: candidateData([]) }
    }

    const institutions = allInstitutions(dbResult.value)
    const exactCombined = institutions.filter(
      (institution) => `${institution.school_name} ${institution.campus_name}` === trimmed,
    )
    const exactSchool = institutions.filter((institution) => institution.school_name === trimmed)
    const matches = exactCombined.length > 0
      ? exactCombined
      : exactSchool.length > 0
        ? exactSchool
        : institutions.filter((institution) => institution.school_name.includes(trimmed)).slice(0, 20)

    if (matches.length === 0) {
      return { ok: false, code: "not_found", data: candidateData([]) }
    }

    return { ok: true, value: matches }
  } finally {
    dbResult.value.close()
  }
}

export function resolveSingleInstitution(query: string): RepositoryResult<Institution> {
  const result = searchInstitutions(query)

  if (!result.ok) {
    return result
  }

  if (result.value.length !== 1) {
    return { ok: false, code: "ambiguous", data: candidateData(result.value) }
  }

  const institution = result.value[0]
  return institution === undefined
    ? { ok: false, code: "not_found", data: candidateData([]) }
    : { ok: true, value: institution }
}

function metricFilter(indicators: readonly string[] | undefined): readonly string[] {
  return indicators?.filter((indicator) => indicatorByName(indicator) !== undefined) ?? []
}

export function metricsForInstitution(
  institution: Institution,
  indicators: readonly string[] | undefined,
): RepositoryResult<readonly MetricValue[]> {
  const dbResult = openDatabase()

  if (!dbResult.ok) {
    return dbResult
  }

  try {
    const requested = metricFilter(indicators)
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

    return { ok: true, value: rows.map(metricValueFromRow) }
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

export function comparisonForQuery(
  query: string,
  indicators: readonly string[] | undefined,
): RepositoryResult<Comparison> {
  const institutionResult = resolveSingleInstitution(query)

  if (!institutionResult.ok) {
    return institutionResult
  }

  const metricsResult = metricsForInstitution(institutionResult.value, indicators)

  if (!metricsResult.ok) {
    return metricsResult
  }

  return {
    ok: true,
    value: {
      university_name: institutionResult.value.school_name,
      campus_name: institutionResult.value.campus_name,
      school_kind: institutionResult.value.school_kind,
      school_type: institutionResult.value.school_type,
      establishment_type: institutionResult.value.establishment_type,
      region_name: institutionResult.value.region_name,
      metrics: metricsResult.value,
    },
  }
}

export function sourceCoverageCounts(): RepositoryResult<Record<string, unknown>> {
  const dbResult = openDatabase()

  if (!dbResult.ok) {
    return dbResult
  }

  try {
    return {
      ok: true,
      value: {
        raw_rows: singleCountRowSchema.parse(
          dbResult.value.prepare("SELECT count(*) count FROM raw_rows").get(),
        ).count,
        observations: singleCountRowSchema.parse(
          dbResult.value.prepare("SELECT count(*) count FROM observations").get(),
        ).count,
        observation_counts: Object.fromEntries(
          dbResult.value
            .prepare("SELECT indicator_id, count(*) count FROM observations GROUP BY indicator_id")
            .all()
            .map((row) => countRowSchema.parse(row))
            .map((row) => [row.indicator_id, row.count]),
        ),
      },
    }
  } finally {
    dbResult.value.close()
  }
}
