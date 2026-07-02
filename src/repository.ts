import { openDatabase, repositoryDatabaseError } from "./repository-db.js"
import { countRowSchema, singleCountRowSchema } from "./repository-schemas.js"
import { metricsForInstitution } from "./repository-metrics.js"
import { resolveSingleInstitution, searchInstitutions } from "./repository-search.js"
import type { Comparison, Institution, MetricValue, MissingMetric, RepositoryResult } from "./repository-types.js"

export { metricsForInstitution, resolveSingleInstitution, searchInstitutions }
export type { Comparison, Institution, MetricValue, MissingMetric, RepositoryResult }

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
