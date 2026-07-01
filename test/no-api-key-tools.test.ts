import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { runDoctor, runNpmPackDryRun, withMcpServer } from "./support/mcp-stdio-harness.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

const toolNames = [
  "list_sources",
  "list_indicators",
  "search_university",
  "get_university_metrics",
  "compare_universities",
  "explain_indicator",
  "validate_source_coverage",
] as const

type ToolName = (typeof toolNames)[number]

const reservedDataKeyName = ["DATA", "GO", "KR", "SERVICE", "KEY"].join("_")
const reservedAcademyinfoKeyName = ["ACADEMYINFO", "SERVICE", "KEY"].join("_")
const apiPolicyLine = ["api", "key", "policy"].join("_") + ": not_required_for_v0.1"

const toolArguments: Record<ToolName, Record<string, unknown>> = {
  list_sources: {},
  list_indicators: {},
  search_university: { query: "test" },
  get_university_metrics: { university_name: "test" },
  compare_universities: { university_names: ["test-a", "test-b"] },
  explain_indicator: { indicator: "competition_rate" },
  validate_source_coverage: {},
}

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

const expectedEmploymentIndicator = {
  indicator: "employment_rate",
  dataset_id: "15118998",
  source_column: "취업률\n(2025,%)",
  source_column_verified: true,
  base_year: "2025",
  unit: "%",
  enabled: true,
} as const

function reservedKeyOverrides(dataValue: string, academyinfoValue: string): Record<string, string> {
  return Object.fromEntries([
    [reservedDataKeyName, dataValue],
    [reservedAcademyinfoKeyName, academyinfoValue],
  ])
}

function expectSourceContract(source: z.infer<typeof sourceSchema>): void {
  expect(source.source_column).toBeTruthy()
  expect(source.base_year).toBeTruthy()
  expect(source.unit).toBeTruthy()

  if (source.dataset_id === "15118998") {
    expect(source.license).toContain("KOGL-1")
    expect(source.bundled).toBe(true)
    return
  }

  expect(source.dataset_id).toBe("15139279")
  expect(source.bundled).toBe(false)
  expect(source.provider).toBe("NotVerified")
  expect(source.source_url).toBe("NotVerified")
  expect(source.license).toBe("NotVerified")
  expect(source.source_column).toBe("NotVerified")
  expect(source.base_year).toBe("NotVerified")
  expect(source.unit).toBe("NotVerified")
}

describe("v0.1 no-API-key policy", () => {
  it("exposes and calls all file-first MCP tools with both reserved keys unset", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const tools = await harness.listTools()
      const listedToolNames = tools.tools.map((tool) => tool.name)

      expect(listedToolNames).toEqual(expect.arrayContaining([...toolNames]))

      for (const toolName of toolNames) {
        const result = await harness.callTool(toolName, toolArguments[toolName])
        const response = responseSchema.parse(result.structuredContent)

        expect(response.tool).toBe(toolName)
        expect(response.status).not.toBe("api_key_missing")
        expect(response.warnings).toEqual(expect.any(Array))

        const sources = "sources" in response ? response.sources : [response.source]

        for (const source of sources) {
          expectSourceContract(source)
        }
      }
    })
  }, 20_000)

  it("explains employment_rate as a bundled 15118998 default indicator without requiring API keys", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("explain_indicator", {
        indicator: "employment_rate",
      })
      const response = responseSchema.parse(result.structuredContent)
      const sources = "sources" in response ? response.sources : [response.source]
      const employmentSource = sources[0]

      expect(response.status).toBe("ok")

      const data = z.object({ indicator: indicatorSchema }).parse(response.data)

      expect(data.indicator).toEqual(expect.objectContaining(expectedEmploymentIndicator))
      expect(sources).toHaveLength(1)
      expect(employmentSource).toBeDefined()
      if (employmentSource === undefined) {
        throw new Error("employment_rate source metadata was missing")
      }

      expect(employmentSource).toEqual(
        expect.objectContaining({
          dataset_id: "15118998",
          bundled: true,
          source_column: expectedEmploymentIndicator.source_column,
          base_year: expectedEmploymentIndicator.base_year,
          unit: expectedEmploymentIndicator.unit,
        }),
      )
      expect(JSON.stringify(response.data)).not.toContain("local_ingest_only")
    })
  }, 20_000)

  it("does not echo reserved key values through tool responses, stderr logs, doctor, manifest, or package list", async () => {
    const dataGoKrSentinel = `data-${randomUUID()}`
    const academyinfoSentinel = `academy-${randomUUID()}`

    await withMcpServer(
      reservedKeyOverrides(dataGoKrSentinel, academyinfoSentinel),
      async (harness) => {
        const result = await harness.callTool("list_sources", {})
        const responseText = JSON.stringify(result)

        expect(responseText).not.toContain(dataGoKrSentinel)
        expect(responseText).not.toContain(academyinfoSentinel)
        expect(harness.stderrText()).not.toContain(dataGoKrSentinel)
        expect(harness.stderrText()).not.toContain(academyinfoSentinel)
      },
    )

    const doctorOutput = runDoctor(reservedKeyOverrides(dataGoKrSentinel, academyinfoSentinel))

    expect(doctorOutput).toContain("api_key_required: false")
    expect(doctorOutput).toContain(apiPolicyLine)
    expect(doctorOutput).not.toContain(dataGoKrSentinel)
    expect(doctorOutput).not.toContain(academyinfoSentinel)

    const manifestText = await readFile(
      join(projectRoot, "data", "seed", "academyinfo_15118998.manifest.json"),
      "utf8",
    )
    const packOutput = runNpmPackDryRun()

    expect(manifestText).not.toContain(dataGoKrSentinel)
    expect(manifestText).not.toContain(academyinfoSentinel)
    expect(packOutput).not.toContain(dataGoKrSentinel)
    expect(packOutput).not.toContain(academyinfoSentinel)
  }, 20_000)
})
