import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import {
  bundledSource,
  commonWarnings,
  defaultIndicatorSources,
  defaultIndicators,
  granularEmploymentBacklogSource,
  indicatorByName,
  sourceForIndicator,
} from "./catalog.js"
import { sourceCoverageCounts } from "./repository.js"
import type { EmptyInput, ExplainIndicatorInput } from "./tool-schemas.js"
import { toolResponse } from "./tool-response.js"

const nonBundledEmploymentPolicy = {
  dataset_id: "15139279",
  v0_3_backlog: true,
  bundled: false,
  default_indicator_enabled_from_this_dataset: false,
  scope: "Granular, per-department, or health-insurance-linked employment statistics only.",
} as const

export function handleListSources(_query: EmptyInput): CallToolResult {
  return toolResponse({
    tool: "list_sources",
    query: {},
    status: "ok",
    data: {
      sources: [bundledSource],
      bundled_dataset_ids: ["15118998"],
      non_bundled_datasets: [nonBundledEmploymentPolicy],
    },
    warnings: commonWarnings([
      "Dataset 15139279 is documented only as non-bundled v0.3 backlog data.",
      "employment_rate is enabled by default only from bundled dataset 15118998.",
    ]),
    sources: [bundledSource, granularEmploymentBacklogSource],
  })
}

export function handleListIndicators(_query: EmptyInput): CallToolResult {
  return toolResponse({
    tool: "list_indicators",
    query: {},
    status: "ok",
    data: {
      indicators: defaultIndicators,
      default_indicator_count: defaultIndicators.length,
      per_indicator_year_unit: true,
    },
    warnings: commonWarnings([
      "employment_rate is enabled by default only when sourced from bundled dataset 15118998.",
      "15139279 remains non-bundled v0.3 backlog data.",
    ]),
    sources: defaultIndicatorSources,
  })
}

export function handleExplainIndicator(query: ExplainIndicatorInput): CallToolResult {
  const indicator = indicatorByName(query.indicator)
  const data = indicator === undefined
    ? {
        error: {
          code: "not_found",
          message: "Indicator is not defined in the v0.1 file-first indicator catalog.",
        },
        indicator: query.indicator ?? "NotProvided",
        dataset_id: "NotVerified",
        enabled: false,
        bundled: false,
      }
    : { indicator }
  const sources = indicator === undefined ? [bundledSource] : [sourceForIndicator(indicator)]

  return toolResponse({
    tool: "explain_indicator",
    query: { ...query },
    status: indicator === undefined ? "not_found" : "ok",
    data,
    warnings: commonWarnings([
      "15139279 employment data is not used for v0.1 default employment_rate.",
    ]),
    sources,
  })
}

export function handleValidateSourceCoverage(_query: EmptyInput): CallToolResult {
  const coverage = sourceCoverageCounts()

  if (!coverage.ok) {
    return toolResponse({
      tool: "validate_source_coverage",
      query: {},
      status: coverage.code,
      data: coverage.data,
      warnings: commonWarnings(["Source coverage lookup failed closed."]),
      sources: defaultIndicatorSources,
    })
  }

  return toolResponse({
    tool: "validate_source_coverage",
    query: {},
    status: "ok",
    data: {
      file_first: true,
      api_key_required: false,
      openapi_enabled: false,
      bundled_dataset_ids: ["15118998"],
      source_column_verified: true,
      default_indicator_count: defaultIndicators.length,
      default_indicators: defaultIndicators,
      per_indicator_year_unit: true,
      employment_rate: {
        enabled_by_default: true,
        source_dataset_id: "15118998",
        scope: "school-level employment rate",
      },
      seed_content_status: "real_observations",
      ...coverage.value,
      non_bundled_datasets: [nonBundledEmploymentPolicy],
    },
    warnings: commonWarnings([
      "OpenAPI is not implemented in v0.1.",
      "The bundled seed DB must not claim to be latest unless explicitly verified.",
      "15139279 data artifacts must remain absent from seed and package outputs.",
    ]),
    sources: [bundledSource, granularEmploymentBacklogSource],
  })
}
