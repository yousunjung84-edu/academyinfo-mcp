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

export type MetricValue = {
  readonly indicator: string
  readonly label_ko: string
  readonly value: number
  readonly raw_value: string
  readonly year: number
  readonly base_year: string
  readonly unit: string
  readonly source_column: string
  readonly source: SourceMetadata
  readonly warnings: readonly string[]
}

export type MissingMetric = {
  readonly indicator: string
  readonly reason: "blank_in_source"
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
