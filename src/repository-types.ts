import type { SourceMetadata } from "./catalog.js"

export type RepositoryResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false
      readonly code: "missing_db" | "database_error" | "not_found" | "ambiguous" | "invalid_request"
      readonly data: Record<string, unknown>
    }

export type Institution = {
  readonly id: number
  readonly school_name: string
  readonly campus_name: string
  readonly school_kind: string
  readonly school_type: string
  readonly establishment_type: string
  readonly region_name: string
}

/**
 * Whether the reported number is an exact zero.
 *
 * The source writes a missing cell as `-`, which is classified separately and
 * reported through `missing_metrics`. A `0` is therefore a value the source
 * actually asserts, and this server does not reinterpret it: a full scan of the
 * bundle found zeros in every indicator, 74% of them at main campuses and
 * concentrated in closed, merged, and specialised institutions, so no single
 * cause explains them. Marking the zero makes it filterable without claiming
 * why it is there.
 */
export type ValueStatus = "reported" | "reported_zero"

export type MetricValue = {
  readonly indicator: string
  readonly label_ko: string
  readonly value: number
  readonly raw_value: string
  readonly value_status: ValueStatus
  readonly year: number
  readonly base_year: string
  readonly unit: string
  readonly source_column: string
  readonly source: SourceMetadata
  readonly warnings: readonly string[]
}

/**
 * Why a requested indicator carries no usable number.
 *
 * `blank_in_source` is a cell the source left as `-`.
 *
 * `zero_not_aggregatable` is a cell containing `0` in an indicator that cannot
 * produce one. The bundle shows the zeros are structural rather than measured:
 * every non-branch secondary campus reports 0 for per-student education spend
 * and library holdings (31 of 31), while every legally separate branch reports
 * a real figure (0 of 5), and the campuses carrying those zeros report ordinary
 * enrolment and faculty counts. Serving such a cell as `0` lets it enter an
 * average unnoticed, so the value is withheld and the source text kept.
 *
 * The publisher states no coding rule for `0`, so the reason names an observable
 * property rather than a cause. Evidence and the open question: docs/zero-values.md
 */
export type MissingMetricReason = "blank_in_source" | "zero_not_aggregatable"

export type MissingMetric = {
  readonly indicator: string
  readonly reason: MissingMetricReason
  readonly value: null
  readonly raw_value: string
  readonly source_column: string
}

export type MetricLookup = {
  readonly metrics: readonly MetricValue[]
  readonly missingMetrics: readonly MissingMetric[]
}

export type InstitutionSearchResult = {
  readonly matches: readonly Institution[]
  readonly totalMatched: number
  readonly truncated: boolean
}

export type Comparison = {
  readonly university_name: string
  readonly campus_name: string
  readonly school_kind: string
  readonly school_type: string
  readonly establishment_type: string
  readonly region_name: string
  readonly metrics: readonly MetricValue[]
  readonly missing_metrics: readonly MissingMetric[]
}

export type BatchInstitutionResolution = {
  readonly query: string
  readonly status: "not_found" | "ambiguous" | "ok"
  readonly matches: readonly Institution[]
  readonly totalMatched: number
  readonly truncated: boolean
}

export type ExploreUniversitiesBatch = {
  readonly resolutions: readonly BatchInstitutionResolution[]
  readonly comparisons: readonly Comparison[]
}
