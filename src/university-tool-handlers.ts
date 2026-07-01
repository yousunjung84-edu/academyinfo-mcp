import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import { commonWarnings, defaultIndicatorSources } from "./catalog.js"
import {
  comparisonForQuery,
  metricsForInstitution,
  resolveSingleInstitution,
  searchInstitutions,
  type Comparison,
} from "./repository.js"
import { candidateForInstitution, repositoryErrorData } from "./tool-helpers.js"
import type {
  CompareUniversitiesInput,
  GetUniversityMetricsInput,
  SearchUniversityInput,
} from "./tool-schemas.js"
import { compareMetricContracts, toolResponse } from "./tool-response.js"

export function handleSearchUniversity(query: SearchUniversityInput): CallToolResult {
  const searchQuery = query.query?.trim() ?? ""

  if (searchQuery.length === 0) {
    return toolResponse({
      tool: "search_university",
      query: { ...query },
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

  const result = searchInstitutions(searchQuery)

  if (!result.ok) {
    return toolResponse({
      tool: "search_university",
      query: { ...query },
      status: result.code,
      data: repositoryErrorData(
        result.code,
        result.code === "not_found"
          ? "No local institution matched the query."
          : "University query is ambiguous; no single institution is guessed.",
        result.data,
      ),
      warnings: commonWarnings(["Ambiguous or missing matches are not guessed."]),
    })
  }

  const candidates = result.value.map(candidateForInstitution)
  const status = result.value.length === 1 ? "ok" : "ambiguous"

  return toolResponse({
    tool: "search_university",
    query: { ...query },
    status,
    data: { candidates, matched_count: candidates.length },
    warnings: commonWarnings(["Ambiguous or missing matches are not guessed."]),
  })
}

export function handleGetUniversityMetrics(query: GetUniversityMetricsInput): CallToolResult {
  const universityName = query.university_name?.trim() ?? ""
  const institutionResult = resolveSingleInstitution(universityName)

  if (!institutionResult.ok) {
    return toolResponse({
      tool: "get_university_metrics",
      query: { ...query },
      status: institutionResult.code,
      data: repositoryErrorData(
        institutionResult.code,
        institutionResult.code === "not_found"
          ? "No local institution matched the query."
          : "University query is ambiguous; include campus name when needed.",
        {
          university_name: universityName.length === 0 ? "NotProvided" : universityName,
          metrics: [],
          metric_contracts: compareMetricContracts(),
          ...institutionResult.data,
        },
      ),
      warnings: commonWarnings(["No institution is guessed for ambiguous queries."]),
      sources: defaultIndicatorSources,
    })
  }

  const metricsResult = metricsForInstitution(institutionResult.value, query.indicators)

  if (!metricsResult.ok) {
    return toolResponse({
      tool: "get_university_metrics",
      query: { ...query },
      status: metricsResult.code,
      data: metricsResult.data,
      warnings: commonWarnings(["Metric lookup failed closed."]),
      sources: defaultIndicatorSources,
    })
  }

  return toolResponse({
    tool: "get_university_metrics",
    query: { ...query },
    status: "ok",
    data: {
      university_name: institutionResult.value.school_name,
      campus_name: institutionResult.value.campus_name,
      metrics: metricsResult.value,
      metric_contracts: compareMetricContracts(),
    },
    warnings: commonWarnings(["Metric values are returned from the bundled seed DB."]),
    sources: defaultIndicatorSources,
  })
}

export function handleCompareUniversities(query: CompareUniversitiesInput): CallToolResult {
  const names = query.university_names ?? []
  const comparisons: Comparison[] = []

  for (const universityName of names) {
    const comparisonResult = comparisonForQuery(universityName, query.indicators)

    if (!comparisonResult.ok) {
      return toolResponse({
        tool: "compare_universities",
        query: { ...query },
        status: comparisonResult.code,
        data: repositoryErrorData(
          comparisonResult.code,
          comparisonResult.code === "not_found"
            ? "No local institution matched one of the comparison queries."
            : "One of the comparison queries is ambiguous; include campus name when needed.",
          {
            university_name: universityName,
            comparisons,
            metric_contracts: compareMetricContracts(),
            ...comparisonResult.data,
          },
        ),
        warnings: commonWarnings([
          "The tool does not produce official rankings.",
          "No institution is guessed for ambiguous comparison queries.",
        ]),
        sources: defaultIndicatorSources,
      })
    }

    comparisons.push(comparisonResult.value)
  }

  return toolResponse({
    tool: "compare_universities",
    query: { ...query },
    status: "ok",
    data: {
      university_names: names,
      comparisons,
      metric_contracts: compareMetricContracts(),
    },
    warnings: commonWarnings([
      "The tool does not produce official rankings.",
      "Comparison values are returned from the bundled seed DB.",
    ]),
    sources: defaultIndicatorSources,
  })
}
