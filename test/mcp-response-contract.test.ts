import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  expectedDefaultIndicators,
  expectBundled15118998SourceContract,
  indicatorSchema,
  metricContractSchema,
  reservedKeyOverrides,
  responseSchema,
} from "./mcp-contract-helpers.ts"
import { withMcpServer } from "./support/mcp-stdio-harness.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
})

const missingMetricSchema = z.object({
  indicator: z.string(),
  reason: z.literal("blank_in_source"),
  value: z.null(),
  raw_value: z.string(),
  source_column: z.string(),
})
const prohibitedDataKey = /^(?:aggregate|best|loser|preference|rank|ranking|recommendation|recommended|score|weight|winner|worst)$/iu
const prohibitedDataText = /(?:\b(?:aggregate|best|loser|prefer(?:ence|red)?|rank(?:ed|ing)?|recommend(?:ation|ed)?|scor(?:e|ed|ing)|weight(?:ed|ing)?|winner|worst)\b|가중치|선호|순위|점수|추천|최고|최저|승자|패자)/iu

function expectFactualDataOnly(value: unknown): void {
  const pending = [value]

  while (pending.length > 0) {
    const current = pending.pop()
    if (typeof current === "string") {
      expect(current).not.toMatch(prohibitedDataText)
    } else if (Array.isArray(current)) {
      pending.push(...current)
    } else if (current !== null && typeof current === "object") {
      for (const [key, child] of Object.entries(current)) {
        expect(key).not.toMatch(prohibitedDataKey)
        pending.push(child)
      }
    }
  }
}

describe("MCP response contract", () => {
  it.each(["ok", "invalid_request"] as const)(
    "rejects aggregate object keys and prose sentinels in %s data envelopes",
    (status) => {
      const objectSentinel = { status, data: { aggregate: "factual sentinel" } }
      const textSentinel = { status, data: { note: "aggregate comparison sentinel" } }

      expect(() => expectFactualDataOnly(objectSentinel)).toThrow()
      expect(() => expectFactualDataOnly(textSentinel)).toThrow()
    },
  )

  it("keeps default indicator and comparison responses within the verified v0.1 contract", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const indicatorResult = await harness.callTool("list_indicators", {})
      const indicatorResponse = responseSchema.parse(indicatorResult.structuredContent)
      const indicatorData = z
        .object({ indicators: z.array(indicatorSchema) })
        .parse(indicatorResponse.data)

      expect(indicatorData.indicators).toHaveLength(expectedDefaultIndicators.length)
      expect(indicatorData.indicators).toEqual(
        expectedDefaultIndicators.map((indicator) =>
          expect.objectContaining({
            indicator: indicator.indicator,
            label_ko: indicator.label_ko,
            dataset_id: "15118998",
            source_column: indicator.source_column,
            source_column_verified: true,
            base_year: indicator.base_year,
            unit: indicator.unit,
            enabled: true,
          }),
        ),
      )
      expectFactualDataOnly(indicatorResponse.data)

      const compareResult = await harness.callTool("compare_universities", {
        university_names: ["test-a", "test-b"],
      })
      const compareResponse = responseSchema.parse(compareResult.structuredContent)
      const compareData = z
        .object({
          metric_contracts: z.array(metricContractSchema),
          comparisons: z.array(z.unknown()),
        })
        .parse(compareResponse.data)
      const expectedByName = new Map(
        expectedDefaultIndicators.map((indicator) => [indicator.indicator, indicator]),
      )

      expect(compareResponse.warnings.length).toBeGreaterThan(0)
      expect(compareData.comparisons).toHaveLength(0)
      expect(compareData.metric_contracts).toHaveLength(expectedDefaultIndicators.length)
      expectFactualDataOnly(compareResponse.data)

      for (const metric of compareData.metric_contracts) {
        const expected = expectedByName.get(metric.indicator)

        expect(expected).toBeDefined()
        if (expected === undefined) {
          throw new Error(`Unexpected metric contract: ${metric.indicator}`)
        }

        expect(metric.dataset_id).toBe("15118998")
        expect(metric.source_column).toBe(expected.source_column)
        expect(metric.base_year).toBe(expected.base_year)
        expect(metric.unit).toBe(expected.unit)
        expect(metric.warnings.length).toBeGreaterThan(0)
        expectBundled15118998SourceContract(metric.source, expected)
      }

      const metricsResult = await harness.callTool("get_university_metrics", {
        university_name: "test",
      })
      const metricsResponse = responseSchema.parse(metricsResult.structuredContent)
      const metricsData = z
        .object({ metric_contracts: z.array(metricContractSchema), metrics: z.array(z.unknown()) })
        .parse(metricsResponse.data)

      expect(metricsData.metrics).toHaveLength(0)
      expectFactualDataOnly(metricsResponse.data)
      expect(metricsData.metric_contracts.map((metric) => metric.indicator)).toEqual(
        expectedDefaultIndicators.map((indicator) => indicator.indicator),
      )
    })
  }, 20_000)

  it("returns structured MCP errors for missing DB, not_found, ambiguous, and explains bundled employment", async () => {
    await withMcpServer(
      { ...reservedKeyOverrides("", ""), ACADEMYINFO_DB_PATH: "__missing__/academyinfo.sqlite" },
      async (harness) => {
        const result = await harness.callTool("list_sources", {})
        const response = responseSchema.parse(result.structuredContent)
        const data = z
          .object({
            error: z.object({
              code: z.literal("missing_db"),
              configured_database: z.literal("missing"),
            }),
          })
          .parse(response.data)

        expect(response.status).toBe("missing_db")
        expectFactualDataOnly(response.data)
        expect(JSON.stringify(response)).not.toContain("__missing__")
        expect(data.error.configured_database).toBe("missing")
      },
    )

    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const notFoundResult = await harness.callTool("explain_indicator", {
        indicator: "unknown_indicator",
      })
      const notFoundResponse = responseSchema.parse(notFoundResult.structuredContent)

      expect(notFoundResponse.status).toBe("not_found")
      expectFactualDataOnly(notFoundResponse.data)

      const ambiguousResult = await harness.callTool("search_university", { query: "" })
      const ambiguousResponse = responseSchema.parse(ambiguousResult.structuredContent)
      const ambiguousData = z
        .object({
          error: errorSchema.extend({ code: z.literal("ambiguous") }),
          candidates: z.array(z.unknown()),
          returned_count: z.literal(0),
          total_matched: z.literal(0),
          truncated: z.literal(false),
        })
        .parse(ambiguousResponse.data)

      expect(ambiguousResponse.status).toBe("ambiguous")
      expectFactualDataOnly(ambiguousResponse.data)
      expect(ambiguousData.candidates).toHaveLength(0)
      expect(ambiguousResponse.warnings).toContain("Empty queries are not guessed.")
      expect(
        ambiguousResponse.warnings.some(
          (warning) => warning.includes("metadata-only") && warning.includes("seed artifact"),
        ),
      ).toBe(false)

      const multiCampusResult = await harness.callTool("search_university", {
        query: "가톨릭대학교",
      })
      const multiCampusResponse = responseSchema.parse(multiCampusResult.structuredContent)
      const multiCampusData = z
        .object({
          error: errorSchema.extend({ code: z.literal("ambiguous") }),
          candidates: z.array(z.unknown()),
        })
        .parse(multiCampusResponse.data)

      expect(multiCampusResponse.status).toBe("ambiguous")
      expectFactualDataOnly(multiCampusResponse.data)
      expect(multiCampusData.candidates.length).toBeGreaterThan(1)

      const employmentResult = await harness.callTool("explain_indicator", {
        indicator: "employment_rate",
      })
      const employmentResponse = responseSchema.parse(employmentResult.structuredContent)
      const employmentData = z.object({ indicator: indicatorSchema }).parse(employmentResponse.data)
      const expectedEmployment = expectedDefaultIndicators.find(
        (indicator) => indicator.indicator === "employment_rate",
      )

      expect(expectedEmployment).toBeDefined()
      if (expectedEmployment === undefined) {
        throw new Error("employment_rate expectation was missing")
      }

      expect(employmentResponse.status).toBe("ok")
      expectFactualDataOnly(employmentResponse.data)
      expect(employmentData.indicator).toEqual(
        expect.objectContaining({
          indicator: "employment_rate",
          dataset_id: "15118998",
          source_column: expectedEmployment.source_column,
          source_column_verified: true,
          base_year: "2025",
          unit: "%",
          enabled: true,
        }),
      )
      expect("sources" in employmentResponse ? employmentResponse.sources : [employmentResponse.source]).toEqual([
        expect.objectContaining({
          dataset_id: "15118998",
          bundled: true,
          source_column: expectedEmployment.source_column,
          base_year: "2025",
          unit: "%",
        }),
      ])
    })
  }, 20_000)

  it("fails closed for invalid indicators and empty comparisons", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const invalidMetricsResult = await harness.callTool("get_university_metrics", {
        university_name: "전남대학교 본교",
        indicators: ["not_real"],
      })
      const invalidMetricsResponse = responseSchema.parse(invalidMetricsResult.structuredContent)
      const invalidMetricsData = z
        .object({
          error: errorSchema.extend({ code: z.literal("invalid_request") }),
          invalid_indicators: z.array(z.string()),
          metrics: z.array(z.unknown()),
        })
        .parse(invalidMetricsResponse.data)

      expect(invalidMetricsResponse.status).toBe("invalid_request")
      expectFactualDataOnly(invalidMetricsResponse.data)
      expect(invalidMetricsData.invalid_indicators).toEqual(["not_real"])
      expect(invalidMetricsData.metrics).toHaveLength(0)

      const invalidCompareResult = await harness.callTool("compare_universities", {
        university_names: ["전남대학교 본교"],
        indicators: ["not_real"],
      })
      const invalidCompareResponse = responseSchema.parse(invalidCompareResult.structuredContent)
      const invalidCompareData = z
        .object({
          error: errorSchema.extend({ code: z.literal("invalid_request") }),
          invalid_indicators: z.array(z.string()),
          comparisons: z.array(z.unknown()),
        })
        .parse(invalidCompareResponse.data)

      expect(invalidCompareResponse.status).toBe("invalid_request")
      expectFactualDataOnly(invalidCompareResponse.data)
      expect(invalidCompareData.invalid_indicators).toEqual(["not_real"])
      expect(invalidCompareData.comparisons).toHaveLength(0)

      const emptyCompareResult = await harness.callTool("compare_universities", {
        university_names: [],
      })
      const emptyCompareResponse = responseSchema.parse(emptyCompareResult.structuredContent)
      const emptyCompareData = z
        .object({
          error: errorSchema.extend({ code: z.literal("invalid_request") }),
          comparisons: z.array(z.unknown()),
        })
        .parse(emptyCompareResponse.data)

      expect(emptyCompareResponse.status).toBe("invalid_request")
      expectFactualDataOnly(emptyCompareResponse.data)
      expect(emptyCompareData.comparisons).toHaveLength(0)
    })
  }, 20_000)

  it("reports search truncation totals and missing metrics for blank source cells", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const searchResult = await harness.callTool("search_university", { query: "대" })
      const searchResponse = responseSchema.parse(searchResult.structuredContent)
      const searchData = z
        .object({
          error: errorSchema.extend({ code: z.literal("ambiguous") }),
          candidates: z.array(z.unknown()),
          returned_count: z.literal(20),
          total_matched: z.number().int().gt(20),
          truncated: z.literal(true),
        })
        .parse(searchResponse.data)

      expect(searchResponse.status).toBe("ambiguous")
      expectFactualDataOnly(searchResponse.data)
      expect(searchData.candidates).toHaveLength(searchData.returned_count)

      const metricsResult = await harness.callTool("get_university_metrics", {
        university_name: "개신대학원대학교 본교",
      })
      const metricsResponse = responseSchema.parse(metricsResult.structuredContent)
      const metricsData = z
        .object({
          metrics: z.array(z.object({ indicator: z.string() })),
          missing_metrics: z.array(missingMetricSchema),
        })
        .parse(metricsResponse.data)

      expect(metricsResponse.status).toBe("ok")
      expectFactualDataOnly(metricsResponse.data)
      expect(metricsData.metrics.map((metric) => metric.indicator)).not.toContain(
        "competition_rate",
      )
      expect(metricsData.missing_metrics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            indicator: "competition_rate",
            reason: "blank_in_source",
            value: null,
            raw_value: "-",
            source_column: "신입생 경쟁률\n(2025,:1)",
          }),
        ]),
      )
    })
  }, 20_000)

  it("loads the bundled seed when the MCP server is launched from another cwd", async () => {
    const externalCwd = await mkdtemp(join(tmpdir(), "academyinfo-mcp-cwd-"))

    try {
      await withMcpServer(
        reservedKeyOverrides("", ""),
        async (harness) => {
          const result = await harness.callTool("validate_source_coverage", {})
          const response = responseSchema.parse(result.structuredContent)
          const data = z
            .object({
              raw_rows: z.literal(488),
              observations: z.literal(2350),
            })
            .parse(response.data)

          expect(response.status).toBe("ok")
          expectFactualDataOnly(response.data)
          expect(data.raw_rows).toBe(488)
          expect(data.observations).toBe(2350)
        },
        { cwd: externalCwd },
      )
    } finally {
      await rm(externalCwd, { recursive: true, force: true })
    }
  }, 20_000)

  it("does not use console logging in stdio MCP runtime source files", async () => {
    const sourceDirectory = join(projectRoot, "src")
    const sourceEntries = await readdir(sourceDirectory, { withFileTypes: true })
    const sourceFiles = sourceEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => join(sourceDirectory, entry.name))

    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, "utf8")

      expect(source).not.toContain("console.log")
      expect(source).not.toContain("console.error")
    }
  })
})
