import { indicatorByName } from "./catalog.js"
import { openDatabase, repositoryDatabaseError } from "./repository-db.js"
import { countRowSchema, singleCountRowSchema } from "./repository-schemas.js"
import {
  metricsForInstitution,
  metricsForInstitutions,
} from "./repository-metrics.js"
import {
  resolveInstitutionsBatch,
  resolveSingleInstitution,
  searchInstitutions,
} from "./repository-search.js"
import type {
  BatchInstitutionResolution,
  Comparison,
  ExploreUniversitiesBatch,
  Institution,
  MetricLookup,
  MetricValue,
  MissingMetric,
  RepositoryResult,
} from "./repository-types.js"

export { metricsForInstitution, resolveSingleInstitution, searchInstitutions }
export type {
  BatchInstitutionResolution,
  Comparison,
  ExploreUniversitiesBatch,
  Institution,
  MetricValue,
  MissingMetric,
  RepositoryResult,
}

export function exploreUniversitiesBatch(
  universityQueries: readonly string[],
  indicators: readonly string[],
): RepositoryResult<ExploreUniversitiesBatch> {
  if (!validBatchInputs(universityQueries, indicators)) {
    return {
      ok: false,
      code: "invalid_request",
      data: {
        error: {
          code: "invalid_request",
          message:
            "Batch repository inputs must contain normalized, distinct, supported values within their limits.",
        },
      },
    }
  }

  const dbResult = openDatabase()

  if (!dbResult.ok) {
    return dbResult
  }

  try {
    const readBatch = dbResult.value.transaction(
      (): ExploreUniversitiesBatch => {
        const resolutions = resolveInstitutionsBatch(dbResult.value, universityQueries)

        if (resolutions.some((resolution) => resolution.status !== "ok")) {
          return { resolutions, comparisons: [] }
        }

        const institutions: Institution[] = []
        for (const resolution of resolutions) {
          const institution = resolution.matches[0]

          if (institution === undefined) {
            throw new Error("Unique institution resolution did not include its match.")
          }

          institutions.push(institution)
        }

        const metricLookups = metricsForInstitutions(
          dbResult.value,
          institutions,
          indicators,
        )

        return {
          resolutions,
          comparisons: institutions.map((institution, index) =>
            comparisonFromLookup(institution, metricLookups[index]),
          ),
        }
      },
    )

    return { ok: true, value: readBatch.deferred() }
  } catch (error) {
    return repositoryDatabaseError(error)
  } finally {
    dbResult.value.close()
  }
}

function validBatchInputs(
  universityQueries: readonly string[],
  indicators: readonly string[],
): boolean {
  if (
    universityQueries.length < 1 ||
    universityQueries.length > 10 ||
    new Set(universityQueries).size !== universityQueries.length
  ) {
    return false
  }

  for (const query of universityQueries) {
    if (
      typeof query !== "string" ||
      query !== query.trim() ||
      [...query].length < 1 ||
      [...query].length > 120
    ) {
      return false
    }
  }

  if (indicators.length > 5 || new Set(indicators).size !== indicators.length) {
    return false
  }

  return indicators.every(
    (indicator) =>
      typeof indicator === "string" &&
      indicator.length > 0 &&
      indicator === indicator.trim() &&
      indicatorByName(indicator) !== undefined,
  )
}

function comparisonFromLookup(
  institution: Institution,
  lookup: MetricLookup | undefined,
): Comparison {
  if (lookup === undefined) {
    throw new Error("Metric batch did not preserve institution input order.")
  }

  return {
    university_name: institution.school_name,
    campus_name: institution.campus_name,
    school_kind: institution.school_kind,
    school_type: institution.school_type,
    establishment_type: institution.establishment_type,
    region_name: institution.region_name,
    metrics: lookup.metrics,
    missing_metrics: lookup.missingMetrics,
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
      metrics: metricsResult.value.metrics,
      missing_metrics: metricsResult.value.missingMetrics,
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
  } catch (error) {
    return repositoryDatabaseError(error)
  } finally {
    dbResult.value.close()
  }
}
