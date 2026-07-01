import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import {
  bundledSource,
  commonWarnings,
  defaultIndicators,
  employmentLocalIngestSource,
  indicatorByName,
} from "./catalog.js"
import { compareMetricContracts, toolResponse } from "./tool-response.js"

const emptyInputSchema = z.object({})
const searchUniversityInputSchema = z.object({ query: z.string().optional() })
const getUniversityMetricsInputSchema = z.object({
  university_name: z.string().optional(),
  indicators: z.array(z.string()).optional(),
})
const compareUniversitiesInputSchema = z.object({
  university_names: z.array(z.string()).optional(),
  indicators: z.array(z.string()).optional(),
})
const explainIndicatorInputSchema = z.object({ indicator: z.string().optional() })

export function registerAcademyinfoTools(server: McpServer): void {
  server.registerTool(
    "list_sources",
    {
      title: "List Sources",
      description: "List bundled file-first academyinfo sources available in v0.1.",
      inputSchema: emptyInputSchema,
    },
    () =>
      toolResponse({
        tool: "list_sources",
        query: {},
        status: "ok",
        data: {
          sources: [bundledSource],
          bundled_dataset_ids: ["15118998"],
          non_bundled_datasets: [
            {
              dataset_id: "15139279",
              local_ingest_only: true,
              bundled: false,
              default_indicator_enabled: false,
            },
          ],
        },
        warnings: commonWarnings([
          "Dataset 15139279 is documented only as non-bundled local ingest data.",
        ]),
        sources: [bundledSource, employmentLocalIngestSource],
      }),
  )

  server.registerTool(
    "list_indicators",
    {
      title: "List Indicators",
      description: "List v0.1 file-first indicators enabled by default.",
      inputSchema: emptyInputSchema,
    },
    () =>
      toolResponse({
        tool: "list_indicators",
        query: {},
        status: "ok",
        data: {
          indicators: defaultIndicators,
          disabled_indicator_count: 1,
        },
        warnings: commonWarnings(["employment_rate is disabled by default in v0.1."]),
        sources: [bundledSource],
      }),
  )

  server.registerTool(
    "search_university",
    {
      title: "Search University",
      description: "Search local file-first university records without guessing ambiguous matches.",
      inputSchema: searchUniversityInputSchema,
    },
    (query) => {
      const searchQuery = query.query?.trim() ?? ""

      if (searchQuery.length === 0) {
        return toolResponse({
          tool: "search_university",
          query,
          status: "ambiguous",
          data: {
            error: {
              code: "ambiguous",
              message: "University query is empty or ambiguous; no single institution is guessed.",
            },
            candidates: [],
            matched_count: 0,
          },
          warnings: commonWarnings([
            "No institution index is available in the metadata-only seed artifact.",
            "Ambiguous or missing matches are not guessed.",
          ]),
        })
      }

      return toolResponse({
        tool: "search_university",
        query,
        status: "ok",
        data: { candidates: [], matched_count: 0 },
        warnings: commonWarnings([
          "No institution index is available in the metadata-only seed artifact.",
          "Ambiguous or missing matches are not guessed.",
        ]),
      })
    },
  )

  server.registerTool(
    "get_university_metrics",
    {
      title: "Get University Metrics",
      description: "Return verified local metrics for one university when available.",
      inputSchema: getUniversityMetricsInputSchema,
    },
    (query) =>
      toolResponse({
        tool: "get_university_metrics",
        query,
        status: "not_available",
        data: { university_name: query.university_name ?? "NotProvided", metrics: [] },
        warnings: commonWarnings([
          "No metric values are returned until verified source columns and raw rows are ingested.",
        ]),
      }),
  )

  server.registerTool(
    "compare_universities",
    {
      title: "Compare Universities",
      description: "Compare verified local metrics for multiple universities when available.",
      inputSchema: compareUniversitiesInputSchema,
    },
    (query) =>
      toolResponse({
        tool: "compare_universities",
        query,
        status: "not_available",
        data: {
          university_names: query.university_names ?? [],
          comparisons: [],
          metric_contracts: compareMetricContracts(),
        },
        warnings: commonWarnings([
          "Comparison values are unavailable until verified observations exist in the seed DB.",
          "The tool does not produce official rankings.",
        ]),
      }),
  )

  server.registerTool(
    "explain_indicator",
    {
      title: "Explain Indicator",
      description: "Explain a v0.1 indicator with source metadata and verification status.",
      inputSchema: explainIndicatorInputSchema,
    },
    (query) => {
      const indicator = indicatorByName(query.indicator)
      const isEmploymentRate = query.indicator === "employment_rate"
      const data = indicator === undefined
        ? {
            error: {
              code: isEmploymentRate ? "disabled_employment" : "not_found",
              message: isEmploymentRate
                ? "employment_rate is disabled by default and requires explicit local ingest."
                : "Indicator is not defined in the v0.1 file-first indicator catalog.",
            },
            indicator: query.indicator ?? "NotProvided",
            dataset_id: isEmploymentRate ? "15139279" : "NotVerified",
            enabled: false,
            disabled_by_default: isEmploymentRate,
            local_ingest_only: isEmploymentRate,
            bundled: false,
          }
        : { indicator }
      const sources = isEmploymentRate ? [employmentLocalIngestSource] : [bundledSource]

      return toolResponse({
        tool: "explain_indicator",
        query,
        status: isEmploymentRate ? "disabled" : indicator === undefined ? "not_found" : "ok",
        data,
        warnings: commonWarnings([
          "Indicator source_column and unit remain NotVerified until header evidence is locked.",
        ]),
        sources,
      })
    },
  )

  server.registerTool(
    "validate_source_coverage",
    {
      title: "Validate Source Coverage",
      description: "Validate v0.1 source coverage, key policy, and bundled data boundaries.",
      inputSchema: emptyInputSchema,
    },
    () =>
      toolResponse({
        tool: "validate_source_coverage",
        query: {},
        status: "ok",
        data: {
          file_first: true,
          api_key_required: false,
          openapi_enabled: false,
          bundled_dataset_ids: ["15118998"],
          source_column_verified: false,
          seed_content_status: "metadata_only_no_observations",
          non_bundled_datasets: [
            {
              dataset_id: "15139279",
              local_ingest_only: true,
              bundled: false,
              employment_rate_enabled_by_default: false,
            },
          ],
        },
        warnings: commonWarnings([
          "OpenAPI is not implemented in v0.1.",
          "The bundled seed DB must not claim to be latest unless explicitly verified.",
        ]),
        sources: [bundledSource, employmentLocalIngestSource],
      }),
  )
}
