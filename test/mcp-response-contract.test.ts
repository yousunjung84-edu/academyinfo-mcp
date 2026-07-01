import { readdir, readFile } from "node:fs/promises"
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

describe("MCP response contract", () => {
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

      const ambiguousResult = await harness.callTool("search_university", { query: "" })
      const ambiguousResponse = responseSchema.parse(ambiguousResult.structuredContent)
      const ambiguousData = z
        .object({
          error: z.object({ code: z.literal("ambiguous") }),
          candidates: z.array(z.unknown()),
        })
        .parse(ambiguousResponse.data)

      expect(ambiguousResponse.status).toBe("ambiguous")
      expect(ambiguousData.candidates).toHaveLength(0)

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
