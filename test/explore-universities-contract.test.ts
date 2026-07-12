import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const { exploreUniversitiesBatchMock, openDatabaseMock } = vi.hoisted(() => ({
  exploreUniversitiesBatchMock: vi.fn(),
  openDatabaseMock: vi.fn(),
}))

vi.mock("../src/repository.js", async () => {
  const original = await vi.importActual<typeof import("../src/repository.js")>("../src/repository.js")
  return { ...original, exploreUniversitiesBatch: exploreUniversitiesBatchMock }
})
vi.mock("../src/repository-db.js", async () => {
  const original = await vi.importActual<typeof import("../src/repository-db.js")>(
    "../src/repository-db.js",
  )
  openDatabaseMock.mockImplementation(original.openDatabase)
  return { ...original, openDatabase: openDatabaseMock }
})

import { handleExploreUniversities } from "../src/explore-universities-handler.js"
import {
  handleExplainIndicator,
  handleListIndicators,
  handleListSources,
  handleValidateSourceCoverage,
} from "../src/source-tool-handlers.js"
import {
  compareUniversitiesInputSchema,
  emptyInputSchema,
  explainIndicatorInputSchema,
  exploreUniversitiesRegisteredInputSchema,
  getUniversityMetricsInputSchema,
  searchUniversityInputSchema,
} from "../src/tool-schemas.js"
import { registerAcademyinfoTools } from "../src/tools.js"
import {
  handleCompareUniversities,
  handleGetUniversityMetrics,
  handleSearchUniversity,
} from "../src/university-tool-handlers.js"
import { defaultIndicators, type IndicatorDefinition } from "../src/catalog.js"
import { repositoryDatabaseError, type SqliteDatabase } from "../src/repository-db.js"
import { metricsForInstitution, metricsForInstitutions } from "../src/repository-metrics.js"

type Response = {
  readonly status: string
  readonly tool: string
  readonly query: Record<string, unknown>
  readonly data: Record<string, unknown>
}

function responseFor(input: Record<string, unknown>): Response {
  return handleExploreUniversities(input).structuredContent as Response
}

function dataArray(response: Response, field: string): readonly unknown[] {
  return response.data[field] as readonly unknown[]
}

async function withSdkClient<T>(callback: (client: Client) => Promise<T>): Promise<T> {
  const server = new McpServer({ name: "explore-contract-server", version: "0.0.0" })
  registerAcademyinfoTools(server)
  const client = new Client({ name: "explore-contract-client", version: "0.0.0" })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()

  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    return await callback(client)
  } finally {
    await client.close()
    await server.close()
  }
}

const institution = {
  id: 7,
  school_name: "전남대학교",
  campus_name: "본교",
  school_kind: "대학교",
  school_type: "일반대학",
  establishment_type: "국립",
  region_name: "광주",
} as const
const publicInstitution = {
  university_name: institution.school_name,
  campus_name: institution.campus_name,
  school_kind: institution.school_kind,
  school_type: institution.school_type,
  establishment_type: institution.establishment_type,
  region_name: institution.region_name,
} as const
const indicatorIds = [
  "competition_rate",
  "fill_rate",
  "employment_rate",
  "scholarship_per_student",
  "avg_tuition",
] as const

type MetricRepositoryFixture = {
  readonly observationRows?: readonly Record<string, unknown>[]
  readonly metricRows?: readonly Record<string, unknown>[]
  readonly rawRows?: readonly Record<string, unknown>[]
}

function mockedMetricDatabase(fixture: MetricRepositoryFixture): SqliteDatabase {
  return {
    prepare(sql: string) {
      const rows = sql.includes("LEFT JOIN indicators")
        ? fixture.observationRows ?? []
        : sql.includes("JOIN indicators")
          ? fixture.metricRows ?? []
          : sql.includes("SELECT row_json FROM raw_rows")
            ? fixture.rawRows ?? []
            : []

      return { all: () => rows }
    },
  } as unknown as SqliteDatabase
}
function legacyMetricRepositoryResult(rows: readonly Record<string, unknown>[]) {
  const database = {
    prepare(sql: string) {
      if (!sql.includes("SELECT o.id AS observation_id")) {
        throw new Error("Unexpected legacy metric query.")
      }

      return { all: () => rows }
    },
    close: vi.fn(),
  } as unknown as SqliteDatabase
  openDatabaseMock.mockReturnValueOnce({ ok: true, value: database })

  return metricsForInstitution(institution, undefined)
}

function rawRow(
  sourceOverrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    학교명: institution.school_name,
    본분교명: institution.campus_name,
    ...Object.fromEntries(defaultIndicators.map((indicator) => [indicator.source_column, "1"])),
    ...sourceOverrides,
  }
}

function missingRawRow(
  sourceOverrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return rawRow({
    ...Object.fromEntries(defaultIndicators.map((indicator) => [indicator.source_column, ""])),
    ...sourceOverrides,
  })
}

function metricRow(indicator: IndicatorDefinition): Record<string, unknown> {
  return {
    institution_id: institution.id,
    indicator_id: indicator.indicator,
    label_ko: indicator.label_ko,
    value: 1,
    canonical_value: "1",
    raw_value: "1",
    year: Number(indicator.base_year),
    unit: indicator.unit,
    source_column: indicator.source_column,
  }
}

function metricRepositoryResult(
  fixture: MetricRepositoryFixture,
  indicators: readonly string[] = [],
) {
  try {
    return {
      ok: true as const,
      value: metricsForInstitutions(
        mockedMetricDatabase(fixture),
        [institution],
        indicators,
      ),
    }
  } catch (error) {
    return repositoryDatabaseError(error)
  }
}

const prohibitedKey = /^(?:aggregate|best|loser|preference|rank|ranking|recommendation|recommended|score|weight|winner|worst)$/iu
const prohibitedText = /(?:\b(?:aggregate|best|loser|prefer(?:ence|red)?|rank(?:ed|ing)?|recommend(?:ation|ed)?|scor(?:e|ed|ing)|weight(?:ed|ing)?|winner|worst)\b|가중치|선호|순위|점수|추천|최고|최저|승자|패자)/iu

function expectRecommendationFree(value: unknown): void {
  const pending = [value]

  while (pending.length > 0) {
    const current = pending.pop()
    if (typeof current === "string") {
      expect(current).not.toMatch(prohibitedText)
    } else if (Array.isArray(current)) {
      pending.push(...current)
    } else if (current !== null && typeof current === "object") {
      for (const [key, child] of Object.entries(current)) {
        expect(key).not.toMatch(prohibitedKey)
        pending.push(child)
      }
    }
  }
}

function emptyResolution(
  inputIndex: number,
  query: string,
  status: "invalid_request" | "not_evaluated" | "not_found",
): Record<string, unknown> {
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
function expectedIssue(
  code: string,
  path: string,
  actual: string | number | null,
  overrides: Partial<Record<"indexes" | "duplicate_groups" | "min" | "max" | "allowed", unknown>> = {},
): Record<string, unknown> {
  return {
    code,
    path,
    indexes: null,
    duplicate_groups: null,
    actual,
    min: null,
    max: null,
    allowed: null,
    ...overrides,
  }
}

afterEach(() => {
  exploreUniversitiesBatchMock.mockReset()
})

describe("explore_universities registered boundary", () => {
  it("uses the exact loose outer schema and preserves unknown callback input", () => {
    const input = {
      university_queries: ["전남대학교 본교"],
      extra: { nested: true },
    }

    expect(exploreUniversitiesRegisteredInputSchema.parse(input)).toEqual(input)
    expect(z.toJSONSchema(exploreUniversitiesRegisteredInputSchema, { target: "draft-7" })).toEqual({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        university_queries: {},
        indicators: {},
      },
      additionalProperties: {},
    })
  })

  it("preserves all seven registrations and adds one ordinary eighth registration", () => {
    const registrations: Array<{ name: string; config: Record<string, unknown>; callback: unknown }> = []
    const server = {
      registerTool(name: string, config: Record<string, unknown>, callback: unknown): void {
        registrations.push({ name, config, callback })
      },
    } as unknown as McpServer

    registerAcademyinfoTools(server)

    expect(registrations).toEqual([
      {
        name: "list_sources",
        config: {
          title: "List Sources",
          description: "List bundled file-first academyinfo sources available in v0.1.",
          inputSchema: emptyInputSchema,
        },
        callback: handleListSources,
      },
      {
        name: "list_indicators",
        config: {
          title: "List Indicators",
          description: "List v0.1 file-first indicators enabled by default.",
          inputSchema: emptyInputSchema,
        },
        callback: handleListIndicators,
      },
      {
        name: "search_university",
        config: {
          title: "Search University",
          description: "Search local file-first university records without guessing ambiguous matches.",
          inputSchema: searchUniversityInputSchema,
        },
        callback: handleSearchUniversity,
      },
      {
        name: "get_university_metrics",
        config: {
          title: "Get University Metrics",
          description: "Return verified local metrics for one university when available.",
          inputSchema: getUniversityMetricsInputSchema,
        },
        callback: handleGetUniversityMetrics,
      },
      {
        name: "compare_universities",
        config: {
          title: "Compare Universities",
          description: "Compare verified local metrics for multiple universities when available.",
          inputSchema: compareUniversitiesInputSchema,
        },
        callback: handleCompareUniversities,
      },
      {
        name: "explain_indicator",
        config: {
          title: "Explain Indicator",
          description: "Explain a v0.1 indicator with source metadata and verification status.",
          inputSchema: explainIndicatorInputSchema,
        },
        callback: handleExplainIndicator,
      },
      {
        name: "validate_source_coverage",
        config: {
          title: "Validate Source Coverage",
          description: "Validate v0.1 source coverage, key policy, and bundled data boundaries.",
          inputSchema: emptyInputSchema,
        },
        callback: handleValidateSourceCoverage,
      },
      {
        name: "explore_universities",
        config: {
          title: "Explore Universities",
          description: "Resolve universities and return factual side-by-side local indicator data.",
          inputSchema: exploreUniversitiesRegisteredInputSchema,
        },
        callback: handleExploreUniversities,
      },
    ])
  })

  it("freezes every legacy input schema at the public JSON boundary", () => {
    const draft = "http://json-schema.org/draft-07/schema#"
    const schemas = [
      [emptyInputSchema, {
        $schema: draft,
        type: "object",
        properties: {},
        additionalProperties: false,
      }],
      [searchUniversityInputSchema, {
        $schema: draft,
        type: "object",
        properties: {
          query: { type: "string" },
        },
        additionalProperties: false,
      }],
      [getUniversityMetricsInputSchema, {
        $schema: draft,
        type: "object",
        properties: {
          university_name: { type: "string" },
          indicators: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      }],
      [compareUniversitiesInputSchema, {
        $schema: draft,
        type: "object",
        properties: {
          university_names: { type: "array", items: { type: "string" } },
          indicators: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      }],
      [explainIndicatorInputSchema, {
        $schema: draft,
        type: "object",
        properties: {
          indicator: { type: "string" },
        },
        additionalProperties: false,
      }],
    ] as const

    for (const [schema, expected] of schemas) {
      expect(z.toJSONSchema(schema, { target: "draft-7" })).toEqual(expected)
      expect(expected).not.toHaveProperty("required")
    }
  })
  it("exposes the exact SDK tools/list schema and documents unwrapped SDK boundary behavior", async () => {
    await withSdkClient(async (client) => {
      const listed = await client.listTools()
      const explore = listed.tools.find((tool) => tool.name === "explore_universities")

      expect(explore?.inputSchema).toEqual({
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          university_queries: {},
          indicators: {},
        },
        additionalProperties: {},
      })
      expect(explore?.inputSchema).not.toHaveProperty("required")

      const omitted = await client.callTool({ name: "explore_universities" })
      expect(omitted).toEqual(expect.objectContaining({
        isError: true,
        content: [{
          type: "text",
          text: [
            "MCP error -32602: Input validation error: Invalid arguments for tool explore_universities: [",
            "  {",
            "    \"expected\": \"object\",",
            "    \"code\": \"invalid_type\",",
            "    \"path\": [],",
            "    \"message\": \"Invalid input: expected object, received undefined\"",
            "  }",
            "]",
          ].join("\n"),
        }],
      }))
      expect(omitted).not.toHaveProperty("structuredContent")
      expect(exploreUniversitiesBatchMock).not.toHaveBeenCalled()

      // This in-memory harness intentionally has no production transport guard. SDK
      // 1.29.0 rejects these before the handler but reports its stock parser error.
      for (const nonobject of [null, [], "value", 1, true] as const) {
        await expect(
          client.callTool({
            name: "explore_universities",
            arguments: nonobject as unknown as Record<string, unknown>,
          }),
        ).rejects.toMatchObject({ code: -32603 })
      }
      expect(exploreUniversitiesBatchMock).not.toHaveBeenCalled()
    })
  })
})

describe("explore_universities standalone validation", () => {
  it("rejects unknown own fields without echoing their names or values or probing the DB", () => {
    const previousPath = process.env.ACADEMYINFO_DB_PATH
    process.env.ACADEMYINFO_DB_PATH = "__missing__/must-not-be-probed.sqlite"
    try {
      const response = responseFor({
        university_queries: ["전남대학교 본교"],
        extra: { nested: "secret-sentinel" },
      })

      expect(response.status).toBe("invalid_request")
      expect(response.query).toEqual({})
      expect(response.data).toEqual({
        error: { code: "invalid_request", message: "Request contains unsupported fields." },
        validation: {
          class: "schema",
          issues: [{
            code: "UNKNOWN_TOP_LEVEL_FIELDS",
            path: "/",
            indexes: null,
            duplicate_groups: null,
            actual: 1,
            min: null,
            max: null,
            allowed: ["university_queries", "indicators"],
          }],
        },
        resolutions: [],
        resolved_universities: [],
        comparisons: [],
        indicator_explanations: [],
        next_action: { kind: "correct_request", indexes: [], fields: ["request"] },
      })
      expect(JSON.stringify(response)).not.toContain("extra")
      expect(JSON.stringify(response)).not.toContain("secret-sentinel")
      expect(exploreUniversitiesBatchMock).not.toHaveBeenCalled()
    } finally {
      if (previousPath === undefined) {
        delete process.env.ACADEMYINFO_DB_PATH
      } else {
        process.env.ACADEMYINFO_DB_PATH = previousPath
      }
    }
  })

  it.each([
    [{}, "schema", "MISSING_UNIVERSITY_QUERIES", 0],
    [{ university_queries: [] }, "query_count", "QUERY_COUNT_TOO_SMALL", 0],
    [{ university_queries: Array.from({ length: 11 }, (_, index) => `대학${index}`) }, "query_count", "QUERY_COUNT_TOO_LARGE", 0],
    [{ university_queries: ["대학"], indicators: Array.from({ length: 6 }, () => "fill_rate") }, "indicator_count", "INDICATOR_COUNT_TOO_LARGE", 1],
    [{ university_queries: ["대학"], indicators: ["unknown"] }, "indicator_unknown", "UNKNOWN_INDICATOR", 1],
  ] as const)(
    "applies phase precedence for %#",
    (input, validationClass, issueCode, resolutionCount) => {
      const response = responseFor(input)
      const validation = response.data.validation as { class: string; issues: Array<{ code: string }> }

      expect(response.status).toBe("invalid_request")
      expect(response.query).toEqual({})
      expect(validation.class).toBe(validationClass)
      expect(validation.issues[0]?.code).toBe(issueCode)
      expect(dataArray(response, "resolutions")).toHaveLength(resolutionCount)
      expect(dataArray(response, "resolved_universities")).toEqual([])
      expect(dataArray(response, "comparisons")).toEqual([])
      expect(dataArray(response, "indicator_explanations")).toEqual([])
      expect(exploreUniversitiesBatchMock).not.toHaveBeenCalled()
    },
  )

  it("sanitizes invalid query elements and marks valid peers not_evaluated", () => {
    const response = responseFor({ university_queries: [42, "  ", "  전남대학교 본교  "] })
    const validation = response.data.validation as { class: string; issues: Array<{ code: string }> }

    expect(validation.class).toBe("multiple")
    expect(validation.issues.map(({ code }) => code)).toEqual([
      "QUERY_ELEMENT_NOT_STRING",
      "QUERY_ELEMENT_EMPTY",
    ])
    expect(response.data.error).toEqual({
      code: "invalid_request",
      message: "Request contains multiple validation errors.",
    })
    expect(response.data.resolutions).toEqual([
      expect.objectContaining({ input_index: 0, query: "", normalized_query: "", status: "invalid_request" }),
      expect.objectContaining({ input_index: 1, query: "", normalized_query: "", status: "invalid_request" }),
      expect.objectContaining({ input_index: 2, query: "전남대학교 본교", normalized_query: "전남대학교 본교", status: "not_evaluated" }),
    ])
  })

  it("does not collapse duplicate normalized queries or indicators", () => {
    const duplicateQueries = responseFor({ university_queries: [" 대학 ", "대학", "다른 대학"] })
    expect((duplicateQueries.data.validation as { issues: unknown[] }).issues).toEqual([
      expect.objectContaining({
        code: "DUPLICATE_UNIVERSITY_QUERIES",
        duplicate_groups: [[0, 1]],
      }),
    ])
    expect((duplicateQueries.data.resolutions as Array<{ status: string }>).map(({ status }) => status))
      .toEqual(["invalid_request", "invalid_request", "not_evaluated"])

    const duplicateIndicators = responseFor({
      university_queries: ["대학"],
      indicators: [" fill_rate ", "fill_rate"],
    })
    expect((duplicateIndicators.data.validation as { issues: unknown[] }).issues).toEqual([
      expect.objectContaining({ code: "DUPLICATE_INDICATORS", duplicate_groups: [[0, 1]] }),
    ])
    expect(exploreUniversitiesBatchMock).not.toHaveBeenCalled()
  })
  it.each([
    {
      input: { indicators: {}, rogue: "redacted" },
      issues: [
        expectedIssue("MISSING_UNIVERSITY_QUERIES", "/university_queries", "missing"),
        expectedIssue("UNKNOWN_TOP_LEVEL_FIELDS", "/", 1, {
          allowed: ["university_queries", "indicators"],
        }),
        expectedIssue("INDICATORS_NOT_ARRAY", "/indicators", "object"),
      ],
      message: "Request must include university_queries.",
      fields: ["university_queries"],
    },
    {
      input: { university_queries: 7, indicators: false },
      issues: [
        expectedIssue("UNIVERSITY_QUERIES_NOT_ARRAY", "/university_queries", "number"),
        expectedIssue("INDICATORS_NOT_ARRAY", "/indicators", "boolean"),
      ],
      message: "university_queries must be an array.",
      fields: ["university_queries"],
    },
  ])("reports every same-phase schema issue without entering later phases", ({ input, issues, message, fields }) => {
    const response = responseFor(input)

    expect(response.data).toEqual({
      error: { code: "invalid_request", message },
      validation: { class: "schema", issues },
      resolutions: [],
      resolved_universities: [],
      comparisons: [],
      indicator_explanations: [],
      next_action: { kind: "correct_request", indexes: [], fields },
    })
    expect(JSON.stringify(response)).not.toContain("redacted")
    expectRecommendationFree(response)
    expect(exploreUniversitiesBatchMock).not.toHaveBeenCalled()
  })

  it.each([0, 1, 2])("reports an overlong query at input index %i and preserves every record position", (failureIndex) => {
    const values = ["첫 대학", "중간 대학", "마지막 대학"]
    const longQuery = "가".repeat(121)
    const queries = values.map((value, index) => index === failureIndex ? longQuery : value)
    const response = responseFor({ university_queries: queries })

    expect(response.data).toEqual({
      error: {
        code: "invalid_request",
        message: "Each university query must be a string containing 1 to 120 Unicode code points after trimming.",
      },
      validation: {
        class: "query_element",
        issues: [
          expectedIssue("QUERY_ELEMENT_TOO_LONG", `/university_queries/${failureIndex}`, 121, {
            indexes: [failureIndex],
            min: 1,
            max: 120,
          }),
        ],
      },
      resolutions: values.map((value, index) =>
        emptyResolution(index, index === failureIndex ? "" : value, index === failureIndex
          ? "invalid_request"
          : "not_evaluated"),
      ),
      resolved_universities: [],
      comparisons: [],
      indicator_explanations: [],
      next_action: {
        kind: "correct_request",
        indexes: [failureIndex],
        fields: ["university_queries"],
      },
    })
    expect(JSON.stringify(response)).not.toContain(longQuery)
    expectRecommendationFree(response)
    expect(exploreUniversitiesBatchMock).not.toHaveBeenCalled()
  })

  it.each([
    {
      input: { university_queries: ["대학"], indicators: { fill_rate: true } },
      validationClass: "schema",
      issues: [expectedIssue("INDICATORS_NOT_ARRAY", "/indicators", "object")],
      resolutions: [],
      message: "indicators must be an array when provided.",
    },
    {
      input: { university_queries: ["대학"], indicators: [42, "", "fill_rate"] },
      validationClass: "multiple",
      issues: [
        expectedIssue("INDICATOR_ELEMENT_NOT_STRING", "/indicators/0", "number", { indexes: [0] }),
        expectedIssue("INDICATOR_ELEMENT_EMPTY", "/indicators/1", 0, {
          indexes: [1],
          min: 1,
        }),
      ],
      resolutions: [emptyResolution(0, "대학", "not_evaluated")],
      message: "Request contains multiple validation errors.",
    },
    {
      input: {
        university_queries: ["대학"],
        indicators: [
          "competition_rate",
          "fill_rate",
          "employment_rate",
          "scholarship_per_student",
          "avg_tuition",
          "competition_rate",
        ],
      },
      validationClass: "indicator_count",
      issues: [expectedIssue("INDICATOR_COUNT_TOO_LARGE", "/indicators", 6, { min: 0, max: 5 })],
      resolutions: [emptyResolution(0, "대학", "not_evaluated")],
      message: "indicators must contain at most 5 items.",
    },
    {
      input: { university_queries: ["대학"], indicators: [" fill_rate ", "fill_rate"] },
      validationClass: "indicator_duplicate",
      issues: [
        expectedIssue("DUPLICATE_INDICATORS", "/indicators", null, {
          duplicate_groups: [[0, 1]],
        }),
      ],
      resolutions: [emptyResolution(0, "대학", "not_evaluated")],
      message: "indicators must not contain duplicate normalized indicator IDs.",
    },
    {
      input: { university_queries: ["대학"], indicators: ["unknown-a", "fill_rate", "unknown-b"] },
      validationClass: "indicator_unknown",
      issues: [
        expectedIssue("UNKNOWN_INDICATOR", "/indicators/0", null, {
          indexes: [0],
          allowed: indicatorIds,
        }),
        expectedIssue("UNKNOWN_INDICATOR", "/indicators/2", null, {
          indexes: [2],
          allowed: indicatorIds,
        }),
      ],
      resolutions: [emptyResolution(0, "대학", "not_evaluated")],
      message: "One or more indicators are not supported.",
    },
  ])(
    "freezes indicator validation phase %# with exact issues, actions, and records",
    ({ input, validationClass, issues, resolutions, message }) => {
      const response = responseFor(input)
      const indexes = issues.flatMap((issue) => [
        ...((issue.indexes as number[] | null) ?? []),
        ...((issue.duplicate_groups as number[][] | null) ?? []).flat(),
      ]).sort((left, right) => left - right)

      expect(response.data).toEqual({
        error: { code: "invalid_request", message },
        validation: { class: validationClass, issues },
        resolutions,
        resolved_universities: [],
        comparisons: [],
        indicator_explanations: [],
        next_action: {
          kind: "correct_request",
          indexes,
          fields: ["indicators"],
        },
      })
      expectRecommendationFree(response)
      expect(exploreUniversitiesBatchMock).not.toHaveBeenCalled()
    },
  )
  it.each([
    [[], "QUERY_COUNT_TOO_SMALL", 0],
    [Array.from({ length: 11 }, (_, index) => `대학 ${index}`), "QUERY_COUNT_TOO_LARGE", 11],
  ] as const)("freezes the exact query-count failure for %#", (universityQueries, code, actual) => {
    const response = responseFor({ university_queries: universityQueries })

    expect(response.data).toEqual({
      error: {
        code: "invalid_request",
        message: "university_queries must contain between 1 and 10 items.",
      },
      validation: {
        class: "query_count",
        issues: [
          expectedIssue(code, "/university_queries", actual, { min: 1, max: 10 }),
        ],
      },
      resolutions: [],
      resolved_universities: [],
      comparisons: [],
      indicator_explanations: [],
      next_action: {
        kind: "correct_request",
        indexes: [],
        fields: ["university_queries"],
      },
    })
    expectRecommendationFree(response)
    expect(exploreUniversitiesBatchMock).not.toHaveBeenCalled()
  })

  it("reports every normalized duplicate query group and exact affected record", () => {
    const response = responseFor({
      university_queries: [" 첫 대학 ", "첫 대학", "둘째 대학", " 둘째 대학 ", "셋째 대학"],
    })

    expect(response.data).toEqual({
      error: {
        code: "invalid_request",
        message: "university_queries must not contain duplicate normalized queries.",
      },
      validation: {
        class: "query_duplicate",
        issues: [
          expectedIssue("DUPLICATE_UNIVERSITY_QUERIES", "/university_queries", null, {
            duplicate_groups: [[0, 1], [2, 3]],
          }),
        ],
      },
      resolutions: [
        emptyResolution(0, "첫 대학", "invalid_request"),
        emptyResolution(1, "첫 대학", "invalid_request"),
        emptyResolution(2, "둘째 대학", "invalid_request"),
        emptyResolution(3, "둘째 대학", "invalid_request"),
        emptyResolution(4, "셋째 대학", "not_evaluated"),
      ],
      resolved_universities: [],
      comparisons: [],
      indicator_explanations: [],
      next_action: {
        kind: "correct_request",
        indexes: [0, 1, 2, 3],
        fields: ["university_queries"],
      },
    })
    expectRecommendationFree(response)
    expect(exploreUniversitiesBatchMock).not.toHaveBeenCalled()
  })
})

describe("explore_universities batch outcomes", () => {
  it.each(["ok", "ambiguous"] as const)(
    "rejects aggregate object keys and prose sentinels in %s envelopes",
    (status) => {
      const objectSentinel = { status, data: { aggregate: "factual sentinel" } }
      const textSentinel = { status, data: { note: "aggregate comparison sentinel" } }

      expect(() => expectRecommendationFree(objectSentinel)).toThrow()
      expect(() => expectRecommendationFree(textSentinel)).toThrow()
    },
  )

  it("maps backend failures to literal errors and not_evaluated records", () => {
    exploreUniversitiesBatchMock.mockReturnValue({
      ok: false,
      code: "missing_db",
      data: {
        internal: "not reflected",
        aggregate: "factual sentinel",
        note: "aggregate comparison sentinel",
      },
    })

    const response = responseFor({ university_queries: [" 전남대학교 본교 "] })

    expect(response.status).toBe("missing_db")
    expect(response.query).toEqual({
      university_queries: ["전남대학교 본교"],
      indicators: [
        "competition_rate",
        "fill_rate",
        "employment_rate",
        "scholarship_per_student",
        "avg_tuition",
      ],
    })
    expect(response.data.error).toEqual({
      code: "missing_db",
      message: "Local database file was not found.",
    })
    expect(response.data.resolutions).toEqual([
      expect.objectContaining({ status: "not_evaluated", candidates: [], returned_count: 0 }),
    ])
    expect(dataArray(response, "resolved_universities")).toEqual([])
    expect(dataArray(response, "comparisons")).toEqual([])
    expect(dataArray(response, "indicator_explanations")).toEqual([])
    expectRecommendationFree(response)
  })

  it("uses ambiguous precedence and never returns partial success arrays", () => {
    exploreUniversitiesBatchMock.mockReturnValue({
      ok: true,
      value: {
        resolutions: [
          {
            query: "대학교",
            status: "ambiguous",
            matches: [institution, { ...institution, id: 8, school_name: "다른대학교" }],
            totalMatched: 2,
            truncated: false,
          },
          {
            query: "없는대학교",
            status: "not_found",
            matches: [],
            totalMatched: 0,
            truncated: false,
          },
        ],
        comparisons: [{
          should_not_leak: true,
          aggregate: "factual sentinel",
          note: "aggregate comparison sentinel",
        }],
      },
    })

    const response = responseFor({
      university_queries: ["대학교", "없는대학교"],
      indicators: ["fill_rate"],
    })
    const resolutions = response.data.resolutions as Array<Record<string, unknown>>

    expect(response.status).toBe("ambiguous")
    expect(response.data.error).toEqual({
      code: "ambiguous",
      message: "One or more university queries are ambiguous; no institution was guessed.",
    })
    expect(resolutions[0]).toEqual(expect.objectContaining({
      input_index: 0,
      status: "ambiguous",
      returned_count: 2,
      total_matched: 2,
      truncated: false,
      resolved_university: null,
    }))
    expect(JSON.stringify(resolutions[0]?.candidates)).not.toContain("\"id\"")
    expect(resolutions[1]).toEqual(expect.objectContaining({ status: "not_found", candidates: [] }))
    expect(dataArray(response, "resolved_universities")).toEqual([])
    expect(dataArray(response, "comparisons")).toEqual([])
    expect(dataArray(response, "indicator_explanations")).toEqual([])
    expect(response.data.next_action).toEqual({
      kind: "resubmit_exact_school_and_campus",
      indexes: [0, 1],
      fields: ["university_queries"],
    })
    expectRecommendationFree(response)
  })

  it("returns ordered factual comparisons and catalog explanations only on aggregate success", () => {
    const comparison = {
      university_name: "전남대학교",
      campus_name: "본교",
      school_kind: "대학교",
      school_type: "일반대학",
      establishment_type: "국립",
      region_name: "광주",
      metrics: [],
      missing_metrics: [],
    }
    exploreUniversitiesBatchMock.mockReturnValue({
      ok: true,
      value: {
        resolutions: [{
          query: "전남대학교 본교",
          status: "ok",
          matches: [institution],
          totalMatched: 1,
          truncated: false,
        }],
        comparisons: [comparison],
      },
    })

    const response = responseFor({
      university_queries: [" 전남대학교 본교 "],
      indicators: ["fill_rate", "competition_rate"],
    })
    const resolutions = response.data.resolutions as Array<Record<string, unknown>>
    const explanations = dataArray(response, "indicator_explanations") as Array<Record<string, unknown>>

    expect(response.status).toBe("ok")
    expect(response.data.error).toBeNull()
    expect(response.data.validation).toEqual({ class: "valid", issues: [] })
    expect(resolutions[0]).toEqual(expect.objectContaining({
      status: "ok",
      candidates: [],
      returned_count: 1,
      total_matched: 1,
      truncated: false,
      resolved_university: expect.objectContaining({
        university_name: "전남대학교",
        campus_name: "본교",
      }),
    }))
    expect(dataArray(response, "resolved_universities")).toEqual([
      expect.objectContaining({ university_name: "전남대학교", campus_name: "본교" }),
    ])
    expect(response.data.comparisons).toEqual([comparison])
    expect(explanations.map(({ indicator: indicatorId }) => indicatorId)).toEqual([
      "fill_rate",
      "competition_rate",
    ])
    expect(explanations[0]).toEqual(expect.objectContaining({
      source_column: expect.any(String),
      base_year: "2025",
      unit: "%",
      source: expect.objectContaining({ dataset_id: "15118998", license: expect.any(String) }),
      warnings: expect.any(Array),
    }))
    expect(response.data.next_action).toBeNull()
    expectRecommendationFree(response)
  })
  it.each([
    ["missing_db", "Local database file was not found."],
    ["database_error", "Local database could not be read."],
  ] as const)("freezes the exact %s backend envelope", (code, message) => {
    exploreUniversitiesBatchMock.mockReturnValue({
      ok: false,
      code,
      data: {
        ranking: "must not leak",
        recommendation: "must not leak",
        aggregate: "factual sentinel",
        note: "aggregate comparison sentinel",
      },
    })

    const response = responseFor({
      university_queries: [" 첫 대학 ", "둘째 대학"],
      indicators: ["fill_rate"],
    })

    expect(response.status).toBe(code)
    expect(response.query).toEqual({
      university_queries: ["첫 대학", "둘째 대학"],
      indicators: ["fill_rate"],
    })
    expect(response.data).toEqual({
      error: { code, message },
      validation: { class: "valid", issues: [] },
      resolutions: [
        emptyResolution(0, "첫 대학", "not_evaluated"),
        emptyResolution(1, "둘째 대학", "not_evaluated"),
      ],
      resolved_universities: [],
      comparisons: [],
      indicator_explanations: [],
      next_action: {
        kind: "retry_or_check_local_database",
        indexes: [],
        fields: [],
      },
    })
    expectRecommendationFree(response)
  })

  it("returns an exact not_found-only aggregate without partial success fields", () => {
    exploreUniversitiesBatchMock.mockReturnValue({
      ok: true,
      value: {
        resolutions: ["없는 대학", "또 없는 대학"].map((query) => ({
          query,
          status: "not_found",
          matches: [],
          totalMatched: 0,
          truncated: false,
        })),
        comparisons: [{
          score: 99,
          recommendation: "must not leak",
          aggregate: "factual sentinel",
          note: "aggregate comparison sentinel",
        }],
      },
    })

    const response = responseFor({
      university_queries: ["없는 대학", "또 없는 대학"],
      indicators: ["fill_rate"],
    })

    expect(response.status).toBe("not_found")
    expect(response.data).toEqual({
      error: {
        code: "not_found",
        message: "One or more university queries did not match a local institution.",
      },
      validation: { class: "valid", issues: [] },
      resolutions: [
        emptyResolution(0, "없는 대학", "not_found"),
        emptyResolution(1, "또 없는 대학", "not_found"),
      ],
      resolved_universities: [],
      comparisons: [],
      indicator_explanations: [],
      next_action: {
        kind: "resubmit_exact_school_and_campus",
        indexes: [0, 1],
        fields: ["university_queries"],
      },
    })
    expectRecommendationFree(response)
  })

  it.each([0, 1, 2])("preserves first/middle/last resolution order when ambiguous index is %i", (failureIndex) => {
    const queries = ["첫 대학", "둘째 대학", "셋째 대학"]
    const institutions = queries.map((query, index) => ({
      ...institution,
      id: 100 + index,
      school_name: query,
    }))
    const alternate = {
      ...institution,
      id: 200 + failureIndex,
      school_name: `${queries[failureIndex]} 분교`,
      campus_name: "제2캠퍼스",
    }
    exploreUniversitiesBatchMock.mockReturnValue({
      ok: true,
      value: {
        resolutions: queries.map((query, index) => ({
          query,
          status: index === failureIndex ? "ambiguous" : "ok",
          matches: index === failureIndex
            ? [institutions[index], alternate]
            : [institutions[index]],
          totalMatched: index === failureIndex ? 2 : 1,
          truncated: false,
        })),
        comparisons: [{
          winner: "must not leak",
          aggregate: "factual sentinel",
          note: "aggregate comparison sentinel",
        }],
      },
    })

    const response = responseFor({
      university_queries: queries,
      indicators: ["fill_rate"],
    })
    const expectedResolutions = queries.map((query, index) => {
      const resolved = institutions[index]
      const publicResolved = {
        ...publicInstitution,
        university_name: query,
      }

      return index === failureIndex
        ? {
            input_index: index,
            query,
            normalized_query: query,
            status: "ambiguous",
            candidates: [
              publicResolved,
              {
                ...publicInstitution,
                university_name: alternate.school_name,
                campus_name: alternate.campus_name,
              },
            ],
            returned_count: 2,
            total_matched: 2,
            truncated: false,
            resolved_university: null,
          }
        : {
            input_index: index,
            query,
            normalized_query: query,
            status: "ok",
            candidates: [],
            returned_count: 1,
            total_matched: 1,
            truncated: false,
            resolved_university: resolved === undefined ? null : publicResolved,
          }
    })

    expect(response.status).toBe("ambiguous")
    expect(response.data).toEqual({
      error: {
        code: "ambiguous",
        message: "One or more university queries are ambiguous; no institution was guessed.",
      },
      validation: { class: "valid", issues: [] },
      resolutions: expectedResolutions,
      resolved_universities: [],
      comparisons: [],
      indicator_explanations: [],
      next_action: {
        kind: "resubmit_exact_school_and_campus",
        indexes: [failureIndex],
        fields: ["university_queries"],
      },
    })
    expectRecommendationFree(response)
  })

  it("preserves the repository ambiguity cap, total, truncation, and candidate order", () => {
    const matches = Array.from({ length: 20 }, (_, index) => ({
      ...institution,
      id: index + 1,
      school_name: `후보 ${String(index + 1).padStart(2, "0")}`,
    }))
    exploreUniversitiesBatchMock.mockReturnValue({
      ok: true,
      value: {
        resolutions: [{
          query: "후보",
          status: "ambiguous",
          matches,
          totalMatched: 27,
          truncated: true,
        }],
        comparisons: [],
      },
    })

    const response = responseFor({
      university_queries: ["후보"],
      indicators: ["fill_rate"],
    })
    const resolution = (response.data.resolutions as Array<Record<string, unknown>>)[0]

    expect(resolution).toEqual({
      input_index: 0,
      query: "후보",
      normalized_query: "후보",
      status: "ambiguous",
      candidates: matches.map((match) => ({
        ...publicInstitution,
        university_name: match.school_name,
      })),
      returned_count: 20,
      total_matched: 27,
      truncated: true,
      resolved_university: null,
    })
    expect((resolution?.candidates as unknown[])).toHaveLength(20)
    expect(JSON.stringify(resolution)).not.toContain("\"id\"")
    expectRecommendationFree(response)
  })

  it("preserves input and metric value order without adding evaluative keys or text", () => {
    const orderedNames = ["중간값 대학", "큰값 대학", "작은값 대학"]
    const orderedValues = [50, 90, 10]
    const institutions = orderedNames.map((schoolName, index) => ({
      ...institution,
      id: 300 + index,
      school_name: schoolName,
    }))
    const comparisons = orderedNames.map((universityName, index) => ({
      university_name: universityName,
      campus_name: "본교",
      school_kind: "대학교",
      school_type: "일반대학",
      establishment_type: "국립",
      region_name: "광주",
      metrics: [{
        indicator: "fill_rate",
        value: orderedValues[index],
        raw_value: String(orderedValues[index]),
      }],
      missing_metrics: [],
    }))
    exploreUniversitiesBatchMock.mockReturnValue({
      ok: true,
      value: {
        resolutions: orderedNames.map((query, index) => ({
          query,
          status: "ok",
          matches: [institutions[index]],
          totalMatched: 1,
          truncated: false,
        })),
        comparisons,
      },
    })

    const response = responseFor({
      university_queries: orderedNames,
      indicators: ["fill_rate"],
    })

    expect(response.status).toBe("ok")
    expect((response.data.resolved_universities as Array<{ university_name: string }>)
      .map(({ university_name }) => university_name)).toEqual(orderedNames)
    expect((response.data.comparisons as typeof comparisons)
      .map(({ metrics }) => metrics[0]?.value)).toEqual(orderedValues)
    expect(response.data.comparisons).toEqual(comparisons)
    expectRecommendationFree(response)
  })
})

describe("explore_universities repository evidence compatibility", () => {
  const databaseError = {
    ok: false,
    code: "database_error",
    data: {
      error: {
        code: "database_error",
        message: "Local database could not be read.",
      },
    },
  }

  it.each([
    ["malformed JSON", "{"],
    ["a null JSON value", "null"],
    ["an array JSON value", "[]"],
    ["a string JSON value", "\"row\""],
    ["a number JSON value", "1"],
    ["a boolean JSON value", "true"],
  ])("fails closed with structured database_error for %s raw-row evidence", (_label, rowJson) => {
    expect(metricRepositoryResult({
      rawRows: [{ row_json: rowJson }],
    })).toEqual(databaseError)
  })
  it("requires raw-row coverage when the resolved institution has no observations", () => {
    const result = metricRepositoryResult({})

    expect(result).toEqual(databaseError)
    expect(JSON.stringify(result)).not.toContain("\"metrics\":[]")
  })
  it.each([
    [
      "raw rows",
      {
        rawRows: [
          { row_json: JSON.stringify(rawRow()) },
          { row_json: JSON.stringify(rawRow()) },
        ],
      },
    ],
    [
      "observations",
      {
        observationRows: [
          metricRow(defaultIndicators[0] as IndicatorDefinition),
          metricRow(defaultIndicators[0] as IndicatorDefinition),
        ],
      },
    ],
    [
      "joined metrics",
      {
        observationRows: [
          metricRow(defaultIndicators[0] as IndicatorDefinition),
        ],
        metricRows: [
          metricRow(defaultIndicators[0] as IndicatorDefinition),
          metricRow(defaultIndicators[0] as IndicatorDefinition),
        ],
      },
    ],
  ])("rejects duplicate %s natural keys", (_label, fixture) => {
    expect(metricRepositoryResult(fixture)).toEqual(databaseError)
  })
  it.each([
    [
      "observation IDs",
      [
        {
          ...metricRow(defaultIndicators[0] as IndicatorDefinition),
          observation_id: 41,
        },
        {
          ...metricRow(defaultIndicators[1] as IndicatorDefinition),
          observation_id: 41,
        },
      ],
    ],
    [
      "observation natural keys",
      [
        {
          ...metricRow(defaultIndicators[0] as IndicatorDefinition),
          observation_id: 41,
        },
        {
          ...metricRow(defaultIndicators[0] as IndicatorDefinition),
          observation_id: 42,
        },
      ],
    ],
  ])("rejects duplicate legacy %s", (_label, rows) => {
    expect(legacyMetricRepositoryResult(rows)).toEqual(databaseError)
  })

  it.each([
    ["absent", undefined],
    ["non-string", 7],
  ])("rejects an %s source cell without inventing blank_in_source", (_label, sourceValue) => {
    const sourceColumn = defaultIndicators[0]?.source_column
    expect(sourceColumn).toBeDefined()

    const evidence = rawRow()
    if (sourceValue === undefined) {
      delete evidence[sourceColumn as string]
    } else {
      evidence[sourceColumn as string] = sourceValue
    }

    const result = metricRepositoryResult({
      rawRows: [{ row_json: JSON.stringify(evidence) }],
    })

    expect(result).toEqual(databaseError)
    expect(JSON.stringify(result)).not.toContain("blank_in_source")
  })

  it("rejects observations outside the closed catalog before metric attribution", () => {
    expect(metricRepositoryResult({
      observationRows: [{
        ...metricRow(defaultIndicators[0] as IndicatorDefinition),
        indicator_id: "not_in_closed_catalog",
      }],
      metricRows: [{
        ...metricRow(defaultIndicators[0] as IndicatorDefinition),
        indicator_id: "not_in_closed_catalog",
      }],
      rawRows: [{ row_json: JSON.stringify(rawRow()) }],
    })).toEqual(databaseError)
  })
  it.each([
    ["label_ko", "충돌 지표명"],
    ["year", 1900],
    ["unit", "충돌 단위"],
    ["source_column", "충돌 원천 컬럼"],
  ] as const)(
    "rejects conflicting %s metadata on an unrequested known observation without provenance",
    (field, conflictingValue) => {
      const requestedIndicator = defaultIndicators[0] as IndicatorDefinition
      const unrequestedIndicator = defaultIndicators[1] as IndicatorDefinition
      const result = metricRepositoryResult({
        observationRows: [
          metricRow(requestedIndicator),
          {
            ...metricRow(unrequestedIndicator),
            [field]: conflictingValue,
          },
        ],
        metricRows: [metricRow(requestedIndicator)],
        rawRows: [{ row_json: JSON.stringify(rawRow()) }],
      }, [requestedIndicator.indicator])

      expect(result).toEqual(databaseError)
      expect(JSON.stringify(result)).not.toContain("\"source\":")
    },
  )

  it("rejects an unrequested numeric raw cell without an observation", () => {
    const requestedIndicator = defaultIndicators[0] as IndicatorDefinition
    const unrequestedIndicator = defaultIndicators[1] as IndicatorDefinition
    const requestedRow = metricRow(requestedIndicator)

    expect(metricRepositoryResult({
      observationRows: [requestedRow],
      metricRows: [requestedRow],
      rawRows: [{
        row_json: JSON.stringify(missingRawRow({
          [requestedIndicator.source_column]: "1",
          [unrequestedIndicator.source_column]: "1",
        })),
      }],
    }, [requestedIndicator.indicator])).toEqual(databaseError)
  })

  it("rejects an unrequested observation over a blank raw cell", () => {
    const requestedIndicator = defaultIndicators[0] as IndicatorDefinition
    const unrequestedIndicator = defaultIndicators[1] as IndicatorDefinition
    const requestedRow = metricRow(requestedIndicator)

    expect(metricRepositoryResult({
      observationRows: [requestedRow, metricRow(unrequestedIndicator)],
      metricRows: [requestedRow],
      rawRows: [{
        row_json: JSON.stringify(missingRawRow({
          [requestedIndicator.source_column]: "1",
        })),
      }],
    }, [requestedIndicator.indicator])).toEqual(databaseError)
  })

  it("rejects an unrequested canonical decimal and SQLite REAL mismatch", () => {
    const requestedIndicator = defaultIndicators[0] as IndicatorDefinition
    const unrequestedIndicator = defaultIndicators[1] as IndicatorDefinition
    const requestedRow = metricRow(requestedIndicator)
    const inconsistentRow = {
      ...metricRow(unrequestedIndicator),
      value: 2,
    }

    expect(metricRepositoryResult({
      observationRows: [requestedRow, inconsistentRow],
      metricRows: [requestedRow],
      rawRows: [{
        row_json: JSON.stringify(missingRawRow({
          [requestedIndicator.source_column]: "1",
          [unrequestedIndicator.source_column]: "1",
        })),
      }],
    }, [requestedIndicator.indicator])).toEqual(databaseError)
  })
  it("preserves closed-catalog default order and valid missing classifications", () => {
    const observedIndicator = defaultIndicators[0] as IndicatorDefinition
    const missingIndicators = defaultIndicators.slice(1)
    const missingSourceValue = (index: number): string => index === 0 ? "" : "-"
    const evidence = rawRow(Object.fromEntries([
      [observedIndicator.source_column, "1"],
      ...missingIndicators.map((indicator, index) => [
        indicator.source_column,
        missingSourceValue(index),
      ]),
    ]))
    const result = metricRepositoryResult({
      observationRows: [metricRow(observedIndicator)],
      metricRows: [metricRow(observedIndicator)],
      rawRows: [{ row_json: JSON.stringify(evidence) }],
    })

    expect(result).toEqual({
      ok: true,
      value: [{
        metrics: [expect.objectContaining({ indicator: observedIndicator.indicator })],
        missingMetrics: missingIndicators.map((indicator, index) => ({
          indicator: indicator.indicator,
          reason: "blank_in_source",
          value: null,
          raw_value: missingSourceValue(index),
          source_column: indicator.source_column,
        })),
      }],
    })
  })
})
