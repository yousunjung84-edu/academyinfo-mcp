import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import { commonWarnings, defaultIndicatorSources, invalidIndicatorNames } from "./catalog.js"
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

function invalidIndicatorErrorData(
  invalidIndicators: readonly string[],
  extraData: Record<string, unknown>,
): Record<string, unknown> {
  return repositoryErrorData(
    "invalid_request",
    "One or more requested indicators are not defined in the v0.1 file-first indicator catalog.",
    {
      invalid_indicators: invalidIndicators,
      ...extraData,
    },
  )
}

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
        returned_count: 0,
        total_matched: 0,
        truncated: false,
      },
      warnings: commonWarnings([
        "Empty queries are not guessed.",
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

  const candidates = result.value.matches.map(candidateForInstitution)
  const status = result.value.matches.length === 1 ? "ok" : "ambiguous"
  const countData = {
    matched_count: result.value.totalMatched,
    returned_count: candidates.length,
    total_matched: result.value.totalMatched,
    truncated: result.value.truncated,
  } as const
  const data = status === "ok"
    ? { candidates, ...countData }
    : repositoryErrorData("ambiguous", "University query is ambiguous; no single institution is guessed.", {
        candidates,
        ...countData,
      })

  return toolResponse({
    tool: "search_university",
    query: { ...query },
    status,
    data,
    warnings: commonWarnings(["Ambiguous or missing matches are not guessed."]),
  })
}

export function handleGetUniversityMetrics(query: GetUniversityMetricsInput): CallToolResult {
  const universityName = query.university_name?.trim() ?? ""
  const invalidIndicators = invalidIndicatorNames(query.indicators)

  if (invalidIndicators.length > 0) {
    return toolResponse({
      tool: "get_university_metrics",
      query: { ...query },
      status: "invalid_request",
      data: invalidIndicatorErrorData(invalidIndicators, {
        university_name: universityName.length === 0 ? "NotProvided" : universityName,
        metrics: [],
        missing_metrics: [],
        metric_contracts: compareMetricContracts(),
      }),
      warnings: commonWarnings(["Metric lookup failed closed."]),
      sources: defaultIndicatorSources,
    })
  }

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
          missing_metrics: [],
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
      data: {
        university_name: institutionResult.value.school_name,
        campus_name: institutionResult.value.campus_name,
        metrics: [],
        missing_metrics: [],
        metric_contracts: compareMetricContracts(),
        ...metricsResult.data,
      },
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
      metrics: metricsResult.value.metrics,
      missing_metrics: metricsResult.value.missingMetrics,
      metric_contracts: compareMetricContracts(),
    },
    warnings: commonWarnings(["Metric values are returned from the bundled seed DB."]),
    sources: defaultIndicatorSources,
  })
}

export function handleCompareUniversities(query: CompareUniversitiesInput): CallToolResult {
  const names = query.university_names ?? []
  const comparisons: Comparison[] = []
  const invalidIndicators = invalidIndicatorNames(query.indicators)

  if (invalidIndicators.length > 0) {
    return toolResponse({
      tool: "compare_universities",
      query: { ...query },
      status: "invalid_request",
      data: invalidIndicatorErrorData(invalidIndicators, {
        university_names: names,
        comparisons,
        metric_contracts: compareMetricContracts(),
      }),
      warnings: commonWarnings(["Comparison requests fail closed when an indicator is unknown."]),
      sources: defaultIndicatorSources,
    })
  }

  if (names.length === 0) {
    const data = repositoryErrorData(
      "invalid_request",
      "At least one university name is required for comparison.",
      {
        university_names: names,
        comparisons,
        metric_contracts: compareMetricContracts(),
      },
    )

    return toolResponse({
      tool: "compare_universities",
      query: { ...query },
      status: "invalid_request",
      data,
      warnings: commonWarnings(["Comparison requests fail closed when no university names are provided."]),
      sources: defaultIndicatorSources,
    })
  }

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
