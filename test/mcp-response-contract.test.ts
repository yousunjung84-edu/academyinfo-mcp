import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { withMcpServer } from "./support/mcp-stdio-harness.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const reservedDataKeyName = ["DATA", "GO", "KR", "SERVICE", "KEY"].join("_")
const reservedAcademyinfoKeyName = ["ACADEMYINFO", "SERVICE", "KEY"].join("_")

const sourceSchema = z.object({
  dataset_id: z.string(),
  dataset_name: z.string(),
  provider: z.string(),
  source_url: z.string(),
  license: z.string(),
  derived_database: z.boolean(),
  bundled: z.boolean(),
  source_column: z.string(),
  year: z.string().optional(),
  base_year: z.string(),
  unit: z.string(),
})

const responseSchema = z
  .object({
    status: z.string(),
    tool: z.string(),
    query: z.record(z.string(), z.unknown()),
    data: z.unknown(),
    warnings: z.array(z.string()),
    generated_at: z.string(),
  })
  .and(z.union([z.object({ source: sourceSchema }), z.object({ sources: z.array(sourceSchema) })]))

const indicatorSchema = z.object({
  indicator: z.string(),
  label: z.string(),
  dataset_id: z.string(),
  source_column: z.string(),
  source_column_verified: z.boolean(),
  base_year: z.string(),
  unit: z.string(),
  enabled: z.boolean(),
})

const metricContractSchema = z.object({
  indicator: z.string(),
  dataset_id: z.string(),
  source_column: z.string(),
  base_year: z.string(),
  unit: z.string(),
  source: sourceSchema,
  warnings: z.array(z.string()),
})

function reservedKeyOverrides(dataValue: string, academyinfoValue: string): Record<string, string> {
  return Object.fromEntries([
    [reservedDataKeyName, dataValue],
    [reservedAcademyinfoKeyName, academyinfoValue],
  ])
}

function expectSourceContract(source: z.infer<typeof sourceSchema>): void {
  expect(source.dataset_id).toBe("15118998")
  expect(source.license).toContain("KOGL-1")
  expect(source.bundled).toBe(true)
  expect(source.source_column).toBeTruthy()
  expect(source.base_year).toBeTruthy()
  expect(source.unit).toBeTruthy()
}

describe("MCP response contract", () => {
  it("keeps default indicator and comparison responses within the verified v0.1 contract", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const indicatorResult = await harness.callTool("list_indicators", {})
      const indicatorResponse = responseSchema.parse(indicatorResult.structuredContent)
      const indicatorData = z
        .object({ indicators: z.array(indicatorSchema) })
        .parse(indicatorResponse.data)

      expect(JSON.stringify(indicatorResponse.data)).not.toContain("employment_rate")
      expect(indicatorData.indicators.map((indicator) => indicator.dataset_id)).toEqual([
        "15118998",
        "15118998",
        "15118998",
        "15118998",
      ])

      for (const indicator of indicatorData.indicators) {
        expect(indicator.source_column).toBeTruthy()
        expect(indicator.base_year).toBeTruthy()
        expect(indicator.unit).toBeTruthy()
      }

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

      expect(compareResponse.warnings.length).toBeGreaterThan(0)
      expect(JSON.stringify(compareResponse.data)).not.toContain("employment_rate")
      expect(compareData.comparisons).toHaveLength(0)
      expect(compareData.metric_contracts).toHaveLength(4)

      for (const metric of compareData.metric_contracts) {
        expect(metric.warnings.length).toBeGreaterThan(0)
        expectSourceContract(metric.source)
      }

      const metricsResult = await harness.callTool("get_university_metrics", {
        university_name: "test",
      })
      const metricsResponse = responseSchema.parse(metricsResult.structuredContent)

      expect(JSON.stringify(metricsResponse.data)).not.toContain("employment_rate")
    })
  }, 20_000)

  it("returns structured MCP errors for missing DB, not_found, ambiguous, and disabled employment", async () => {
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

      const disabledResult = await harness.callTool("explain_indicator", {
        indicator: "employment_rate",
      })
      const disabledResponse = responseSchema.parse(disabledResult.structuredContent)
      const disabledData = z
        .object({ error: z.object({ code: z.literal("disabled_employment") }) })
        .parse(disabledResponse.data)

      expect(disabledResponse.status).toBe("disabled")
      expect(disabledData.error.code).toBe("disabled_employment")
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
