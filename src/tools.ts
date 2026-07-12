import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { handleExploreUniversities } from "./explore-universities-handler.js"
import {
  handleExplainIndicator,
  handleListIndicators,
  handleListSources,
  handleValidateSourceCoverage,
} from "./source-tool-handlers.js"
import {
  handleCompareUniversities,
  handleGetUniversityMetrics,
  handleSearchUniversity,
} from "./university-tool-handlers.js"
import {
  compareUniversitiesInputSchema,
  emptyInputSchema,
  explainIndicatorInputSchema,
  exploreUniversitiesRegisteredInputSchema,
  getUniversityMetricsInputSchema,
  searchUniversityInputSchema,
} from "./tool-schemas.js"

export function registerAcademyinfoTools(server: McpServer): void {
  server.registerTool(
    "list_sources",
    {
      title: "List Sources",
      description: "List bundled file-first academyinfo sources available in v0.1.",
      inputSchema: emptyInputSchema,
    },
    handleListSources,
  )

  server.registerTool(
    "list_indicators",
    {
      title: "List Indicators",
      description: "List v0.1 file-first indicators enabled by default.",
      inputSchema: emptyInputSchema,
    },
    handleListIndicators,
  )

  server.registerTool(
    "search_university",
    {
      title: "Search University",
      description: "Search local file-first university records without guessing ambiguous matches.",
      inputSchema: searchUniversityInputSchema,
    },
    handleSearchUniversity,
  )

  server.registerTool(
    "get_university_metrics",
    {
      title: "Get University Metrics",
      description: "Return verified local metrics for one university when available.",
      inputSchema: getUniversityMetricsInputSchema,
    },
    handleGetUniversityMetrics,
  )

  server.registerTool(
    "compare_universities",
    {
      title: "Compare Universities",
      description: "Compare verified local metrics for multiple universities when available.",
      inputSchema: compareUniversitiesInputSchema,
    },
    handleCompareUniversities,
  )

  server.registerTool(
    "explain_indicator",
    {
      title: "Explain Indicator",
      description: "Explain a v0.1 indicator with source metadata and verification status.",
      inputSchema: explainIndicatorInputSchema,
    },
    handleExplainIndicator,
  )

  server.registerTool(
    "validate_source_coverage",
    {
      title: "Validate Source Coverage",
      description: "Validate v0.1 source coverage, key policy, and bundled data boundaries.",
      inputSchema: emptyInputSchema,
    },
    handleValidateSourceCoverage,
  )

  server.registerTool(
    "explore_universities",
    {
      title: "Explore Universities",
      description: "Resolve universities and return factual side-by-side local indicator data.",
      inputSchema: exploreUniversitiesRegisteredInputSchema,
    },
    handleExploreUniversities,
  )
}
