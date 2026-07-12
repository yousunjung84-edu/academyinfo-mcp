import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import {
  commonWarnings,
  defaultIndicatorSources,
  defaultIndicators,
  indicatorByName,
  sourceForIndicator,
} from "./catalog.js"
import {
  exploreUniversitiesBatch,
  type BatchInstitutionResolution,
  type Institution,
} from "./repository.js"
import type { ExploreUniversitiesRegisteredInput } from "./tool-schemas.js"
import { toolResponse } from "./tool-response.js"

type IssueActual = "missing" | "array" | "object" | "string" | "number" | "boolean" | "null" | number | null

type ValidationIssue = {
  readonly code: string
  readonly path: string
  readonly indexes: readonly number[] | null
  readonly duplicate_groups: readonly (readonly number[])[] | null
  readonly actual: IssueActual
  readonly min: number | null
  readonly max: number | null
  readonly allowed: readonly string[] | null
}

type ResolutionStatus = "invalid_request" | "not_evaluated"
type RepositoryCandidate = {
  readonly university_name: string
  readonly campus_name: string
  readonly school_kind: string
  readonly school_type: string
  readonly establishment_type: string
  readonly region_name: string
}

type PublicResolution = {
  readonly input_index: number
  readonly query: string
  readonly normalized_query: string
  readonly status: "invalid_request" | "not_evaluated" | "not_found" | "ambiguous" | "ok"
  readonly candidates: readonly RepositoryCandidate[]
  readonly returned_count: number
  readonly total_matched: number
  readonly truncated: boolean
  readonly resolved_university: RepositoryCandidate | null
}

type InvalidValidation = {
  readonly ok: false
  readonly validationClass: string
  readonly issues: readonly ValidationIssue[]
  readonly message: string
  readonly indexes: readonly number[]
  readonly fields: readonly string[]
  readonly resolutions: readonly PublicResolution[]
}

type ValidValidation = {
  readonly ok: true
  readonly normalizedQueries: readonly string[]
  readonly indicators: readonly string[]
}

type ValidationResult = InvalidValidation | ValidValidation

const allowedTopLevelFields = ["university_queries", "indicators"] as const
const allowedIndicatorIds = defaultIndicators.map((indicator) => indicator.indicator)
const responseWarnings = commonWarnings([
  "Ambiguous university queries require an exact school and campus name.",
])

function actualType(value: unknown): Exclude<IssueActual, "missing" | number | null> | "null" {
  if (value === null) {
    return "null"
  }
  if (Array.isArray(value)) {
    return "array"
  }
  if (typeof value === "object") {
    return "object"
  }
  return typeof value as "string" | "number" | "boolean"
}

function issue(
  code: string,
  path: string,
  actual: IssueActual,
  options: {
    readonly indexes?: readonly number[]
    readonly duplicateGroups?: readonly (readonly number[])[]
    readonly min?: number
    readonly max?: number
    readonly allowed?: readonly string[]
  } = {},
): ValidationIssue {
  return {
    code,
    path,
    indexes: options.indexes ?? null,
    duplicate_groups: options.duplicateGroups ?? null,
    actual,
    min: options.min ?? null,
    max: options.max ?? null,
    allowed: options.allowed ?? null,
  }
}

function publicCandidate(institution: Institution): RepositoryCandidate {
  return {
    university_name: institution.school_name,
    campus_name: institution.campus_name,
    school_kind: institution.school_kind,
    school_type: institution.school_type,
    establishment_type: institution.establishment_type,
    region_name: institution.region_name,
  }
}

function validationResolution(
  inputIndex: number,
  rawQuery: unknown,
  status: ResolutionStatus,
): PublicResolution {
  const normalized = typeof rawQuery === "string" ? rawQuery.trim() : ""
  const safelyValid = normalized.length > 0 && [...normalized].length <= 120
  const query = safelyValid ? normalized : ""

  return {
    input_index: inputIndex,
    query,
    normalized_query: query,
    status,
    candidates: [],
    returned_count: 0,
    total_matched: 0,
    truncated: false,
    resolved_university: null,
  }
}

function duplicateGroups(values: readonly string[]): readonly (readonly number[])[] {
  const indexesByValue = new Map<string, number[]>()

  values.forEach((value, index) => {
    const indexes = indexesByValue.get(value)
    if (indexes === undefined) {
      indexesByValue.set(value, [index])
    } else {
      indexes.push(index)
    }
  })

  return [...indexesByValue.values()].filter((indexes) => indexes.length > 1)
}

function flattenedIndexes(issues: readonly ValidationIssue[]): readonly number[] {
  const indexes = new Set<number>()
  for (const validationIssue of issues) {
    for (const index of validationIssue.indexes ?? []) {
      indexes.add(index)
    }
    for (const group of validationIssue.duplicate_groups ?? []) {
      for (const index of group) {
        indexes.add(index)
      }
    }
  }
  return [...indexes].sort((left, right) => left - right)
}

function invalid(
  validationClass: string,
  issues: readonly ValidationIssue[],
  message: string,
  fields: readonly string[],
  resolutions: readonly PublicResolution[],
): InvalidValidation {
  return {
    ok: false,
    validationClass,
    issues,
    message,
    indexes: flattenedIndexes(issues),
    fields,
    resolutions,
  }
}

function validateInput(input: ExploreUniversitiesRegisteredInput): ValidationResult {
  const schemaIssues: ValidationIssue[] = []
  const hasUniversityQueries = Object.hasOwn(input, "university_queries")
    && input.university_queries !== undefined
  const unknownFieldCount = Object.keys(input)
    .filter((key) => !allowedTopLevelFields.includes(key as (typeof allowedTopLevelFields)[number]))
    .length

  if (!hasUniversityQueries) {
    schemaIssues.push(issue("MISSING_UNIVERSITY_QUERIES", "/university_queries", "missing"))
  }
  if (unknownFieldCount > 0) {
    schemaIssues.push(
      issue("UNKNOWN_TOP_LEVEL_FIELDS", "/", unknownFieldCount, { allowed: allowedTopLevelFields }),
    )
  }
  if (hasUniversityQueries && !Array.isArray(input.university_queries)) {
    schemaIssues.push(
      issue("UNIVERSITY_QUERIES_NOT_ARRAY", "/university_queries", actualType(input.university_queries)),
    )
  }
  if (input.indicators !== undefined && !Array.isArray(input.indicators)) {
    schemaIssues.push(issue("INDICATORS_NOT_ARRAY", "/indicators", actualType(input.indicators)))
  }

  if (schemaIssues.length > 0) {
    const first = schemaIssues[0]
    const messageByCode: Readonly<Record<string, string>> = {
      MISSING_UNIVERSITY_QUERIES: "Request must include university_queries.",
      UNKNOWN_TOP_LEVEL_FIELDS: "Request contains unsupported fields.",
      UNIVERSITY_QUERIES_NOT_ARRAY: "university_queries must be an array.",
      INDICATORS_NOT_ARRAY: "indicators must be an array when provided.",
    }
    const fieldByCode: Readonly<Record<string, string>> = {
      MISSING_UNIVERSITY_QUERIES: "university_queries",
      UNKNOWN_TOP_LEVEL_FIELDS: "request",
      UNIVERSITY_QUERIES_NOT_ARRAY: "university_queries",
      INDICATORS_NOT_ARRAY: "indicators",
    }
    return invalid(
      "schema",
      schemaIssues,
      first === undefined ? "Request contains multiple validation errors." : messageByCode[first.code] ?? "Request contains multiple validation errors.",
      [first === undefined ? "request" : fieldByCode[first.code] ?? "request"],
      [],
    )
  }

  const universityQueries = input.university_queries as readonly unknown[]
  if (universityQueries.length < 1 || universityQueries.length > 10) {
    const code = universityQueries.length < 1 ? "QUERY_COUNT_TOO_SMALL" : "QUERY_COUNT_TOO_LARGE"
    return invalid(
      "query_count",
      [issue(code, "/university_queries", universityQueries.length, { min: 1, max: 10 })],
      "university_queries must contain between 1 and 10 items.",
      ["university_queries"],
      [],
    )
  }

  const queryElementIssues: ValidationIssue[] = []
  universityQueries.forEach((value, index) => {
    if (typeof value !== "string") {
      queryElementIssues.push(
        issue("QUERY_ELEMENT_NOT_STRING", `/university_queries/${index}`, actualType(value), {
          indexes: [index],
        }),
      )
      return
    }

    const codePointLength = [...value.trim()].length
    if (codePointLength === 0) {
      queryElementIssues.push(
        issue("QUERY_ELEMENT_EMPTY", `/university_queries/${index}`, 0, {
          indexes: [index], min: 1, max: 120,
        }),
      )
    } else if (codePointLength > 120) {
      queryElementIssues.push(
        issue("QUERY_ELEMENT_TOO_LONG", `/university_queries/${index}`, codePointLength, {
          indexes: [index], min: 1, max: 120,
        }),
      )
    }
  })

  if (queryElementIssues.length > 0) {
    const offendingIndexes = new Set(flattenedIndexes(queryElementIssues))
    const issueCodes = new Set(queryElementIssues.map((validationIssue) => validationIssue.code))
    return invalid(
      issueCodes.size > 1 ? "multiple" : "query_element",
      queryElementIssues,
      issueCodes.size > 1
        ? "Request contains multiple validation errors."
        : "Each university query must be a string containing 1 to 120 Unicode code points after trimming.",
      ["university_queries"],
      universityQueries.map((value, index) =>
        validationResolution(index, value, offendingIndexes.has(index) ? "invalid_request" : "not_evaluated"),
      ),
    )
  }

  const normalizedQueries = universityQueries.map((value) => (value as string).trim())
  const queryDuplicateGroups = duplicateGroups(normalizedQueries)
  if (queryDuplicateGroups.length > 0) {
    const duplicateIndexes = new Set(queryDuplicateGroups.flat())
    return invalid(
      "query_duplicate",
      [
        issue("DUPLICATE_UNIVERSITY_QUERIES", "/university_queries", null, {
          duplicateGroups: queryDuplicateGroups,
        }),
      ],
      "university_queries must not contain duplicate normalized queries.",
      ["university_queries"],
      normalizedQueries.map((value, index) =>
        validationResolution(index, value, duplicateIndexes.has(index) ? "invalid_request" : "not_evaluated"),
      ),
    )
  }

  const notEvaluatedResolutions = normalizedQueries.map((value, index) =>
    validationResolution(index, value, "not_evaluated"),
  )
  const rawIndicators = input.indicators === undefined ? [] : input.indicators as readonly unknown[]

  if (rawIndicators.length > 5) {
    return invalid(
      "indicator_count",
      [issue("INDICATOR_COUNT_TOO_LARGE", "/indicators", rawIndicators.length, { min: 0, max: 5 })],
      "indicators must contain at most 5 items.",
      ["indicators"],
      notEvaluatedResolutions,
    )
  }

  const indicatorElementIssues: ValidationIssue[] = []
  rawIndicators.forEach((value, index) => {
    if (typeof value !== "string") {
      indicatorElementIssues.push(
        issue("INDICATOR_ELEMENT_NOT_STRING", `/indicators/${index}`, actualType(value), {
          indexes: [index],
        }),
      )
    } else if (value.trim().length === 0) {
      indicatorElementIssues.push(
        issue("INDICATOR_ELEMENT_EMPTY", `/indicators/${index}`, 0, {
          indexes: [index], min: 1,
        }),
      )
    }
  })

  if (indicatorElementIssues.length > 0) {
    const issueCodes = new Set(indicatorElementIssues.map((validationIssue) => validationIssue.code))
    return invalid(
      issueCodes.size > 1 ? "multiple" : "indicator_element",
      indicatorElementIssues,
      issueCodes.size > 1
        ? "Request contains multiple validation errors."
        : "Each indicator must be a non-empty supported indicator ID.",
      ["indicators"],
      notEvaluatedResolutions,
    )
  }

  const normalizedIndicators = rawIndicators.map((value) => (value as string).trim())
  const indicatorDuplicateGroups = duplicateGroups(normalizedIndicators)
  if (indicatorDuplicateGroups.length > 0) {
    return invalid(
      "indicator_duplicate",
      [
        issue("DUPLICATE_INDICATORS", "/indicators", null, {
          duplicateGroups: indicatorDuplicateGroups,
        }),
      ],
      "indicators must not contain duplicate normalized indicator IDs.",
      ["indicators"],
      notEvaluatedResolutions,
    )
  }

  const unknownIndicatorIssues = normalizedIndicators.flatMap((indicatorName, index) =>
    indicatorByName(indicatorName) === undefined
      ? [
          issue("UNKNOWN_INDICATOR", `/indicators/${index}`, null, {
            indexes: [index], allowed: allowedIndicatorIds,
          }),
        ]
      : [],
  )
  if (unknownIndicatorIssues.length > 0) {
    return invalid(
      "indicator_unknown",
      unknownIndicatorIssues,
      "One or more indicators are not supported.",
      ["indicators"],
      notEvaluatedResolutions,
    )
  }

  return {
    ok: true,
    normalizedQueries,
    indicators: normalizedIndicators.length === 0 ? allowedIndicatorIds : normalizedIndicators,
  }
}

function publicResolution(
  resolution: BatchInstitutionResolution,
  inputIndex: number,
): PublicResolution {
  const resolvedInstitution = resolution.status === "ok" ? resolution.matches[0] : undefined
  const returnedCount = resolution.status === "not_found" ? 0 : resolution.matches.length

  return {
    input_index: inputIndex,
    query: resolution.query,
    normalized_query: resolution.query,
    status: resolution.status,
    candidates:
      resolution.status === "ambiguous" ? resolution.matches.map(publicCandidate) : [],
    returned_count: returnedCount,
    total_matched: resolution.totalMatched,
    truncated: resolution.truncated,
    resolved_university:
      resolvedInstitution === undefined ? null : publicCandidate(resolvedInstitution),
  }
}

function indicatorExplanation(indicatorName: string): Record<string, unknown> {
  const indicator = indicatorByName(indicatorName)
  if (indicator === undefined) {
    throw new Error("Validated indicator was absent from the catalog.")
  }

  return {
    indicator: indicator.indicator,
    label: indicator.label,
    label_ko: indicator.label_ko,
    note: indicator.note ?? null,
    source_column: indicator.source_column,
    base_year: indicator.base_year,
    unit: indicator.unit,
    source: sourceForIndicator(indicator),
    warnings: commonWarnings([]),
  }
}

function respond(
  status: string,
  query: Record<string, unknown>,
  data: Record<string, unknown>,
): CallToolResult {
  return toolResponse({
    tool: "explore_universities",
    query,
    status,
    data,
    warnings: responseWarnings,
    sources: defaultIndicatorSources,
    databaseStatusMode: "caller_prevalidated",
  })
}

export function handleExploreUniversities(
  input: ExploreUniversitiesRegisteredInput,
): CallToolResult {
  const validation = validateInput(input)

  if (!validation.ok) {
    return respond("invalid_request", {}, {
      error: { code: "invalid_request", message: validation.message },
      validation: { class: validation.validationClass, issues: validation.issues },
      resolutions: validation.resolutions,
      resolved_universities: [],
      comparisons: [],
      indicator_explanations: [],
      next_action: {
        kind: "correct_request",
        indexes: validation.indexes,
        fields: validation.fields,
      },
    })
  }

  const canonicalQuery = {
    university_queries: validation.normalizedQueries,
    indicators: validation.indicators,
  }
  const batch = exploreUniversitiesBatch(validation.normalizedQueries, validation.indicators)

  if (!batch.ok) {
    const status = batch.code === "missing_db" ? "missing_db" : "database_error"
    const message = status === "missing_db"
      ? "Local database file was not found."
      : "Local database could not be read."
    const resolutions = validation.normalizedQueries.map((query, index) =>
      validationResolution(index, query, "not_evaluated"),
    )

    return respond(status, canonicalQuery, {
      error: { code: status, message },
      validation: { class: "valid", issues: [] },
      resolutions,
      resolved_universities: [],
      comparisons: [],
      indicator_explanations: [],
      next_action: { kind: "retry_or_check_local_database", indexes: [], fields: [] },
    })
  }

  const resolutions = batch.value.resolutions.map(publicResolution)
  const aggregateStatus = resolutions.some((resolution) => resolution.status === "ambiguous")
    ? "ambiguous"
    : resolutions.some((resolution) => resolution.status === "not_found")
      ? "not_found"
      : "ok"

  if (aggregateStatus !== "ok") {
    const message = aggregateStatus === "ambiguous"
      ? "One or more university queries are ambiguous; no institution was guessed."
      : "One or more university queries did not match a local institution."
    const indexes = resolutions
      .filter((resolution) => resolution.status !== "ok")
      .map((resolution) => resolution.input_index)

    return respond(aggregateStatus, canonicalQuery, {
      error: { code: aggregateStatus, message },
      validation: { class: "valid", issues: [] },
      resolutions,
      resolved_universities: [],
      comparisons: [],
      indicator_explanations: [],
      next_action: {
        kind: "resubmit_exact_school_and_campus",
        indexes,
        fields: ["university_queries"],
      },
    })
  }

  const resolvedUniversities = batch.value.resolutions.map((resolution) => {
    const institution = resolution.status === "ok" ? resolution.matches[0] : undefined
    return institution === undefined ? null : publicCandidate(institution)
  })
  if (resolvedUniversities.some((university) => university === null)) {
    return respond("database_error", canonicalQuery, {
      error: { code: "database_error", message: "Local database could not be read." },
      validation: { class: "valid", issues: [] },
      resolutions: validation.normalizedQueries.map((query, index) =>
        validationResolution(index, query, "not_evaluated"),
      ),
      resolved_universities: [],
      comparisons: [],
      indicator_explanations: [],
      next_action: { kind: "retry_or_check_local_database", indexes: [], fields: [] },
    })
  }

  return respond("ok", canonicalQuery, {
    error: null,
    validation: { class: "valid", issues: [] },
    resolutions,
    resolved_universities: resolvedUniversities,
    comparisons: batch.value.comparisons,
    indicator_explanations: validation.indicators.map(indicatorExplanation),
    next_action: null,
  })
}
