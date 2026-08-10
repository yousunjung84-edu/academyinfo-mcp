import { describe, expect, it } from "vitest"

import { reservedKeyOverrides } from "./mcp-contract-helpers.ts"
import { withMcpServer } from "./support/mcp-stdio-harness.ts"

type Response = Record<string, unknown>
type Metric = Record<string, unknown>

const ZERO_NOTE = "Zero in a rate or amount indicator"

/** Notes that describe the whole response, not one metric. */
const RESPONSE_WIDE_NOTES = [
  "v0.1 runs in file-first mode and does not require reserved API-key environment variables.",
  "The bundled seed DB is a normalized derivative of dataset 15118998, not a raw source file.",
  "15118998 indicator source columns, years, and units follow the verified header policy.",
]

function metricsOf(structuredContent: unknown): readonly Metric[] {
  const data = (structuredContent as Response)["data"] as Response
  return data["metrics"] as readonly Metric[]
}

function byIndicator(metrics: readonly Metric[], indicator: string): Metric {
  const found = metrics.find((metric) => metric["indicator"] === indicator)
  expect(found, `expected a metric for ${indicator}`).toBeDefined()
  return found as Metric
}

function hasZeroNote(metric: Metric): boolean {
  return (metric["warnings"] as readonly string[]).some((warning) => warning.includes(ZERO_NOTE))
}

describe("zero values are signalled without asserting a cause", () => {
  it("marks an exact zero and flags it only where zero is implausible", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("get_university_metrics", {
        // This campus reports 0 for two per-student indicators while operating.
        university_name: "전남대학교 제2캠퍼스",
        indicators: [
          "education_expense_per_student",
          "books_per_student",
          "international_students",
          "employment_rate",
        ],
      })

      const metrics = metricsOf(result.structuredContent)
      const expense = byIndicator(metrics, "education_expense_per_student")
      const books = byIndicator(metrics, "books_per_student")
      const employment = byIndicator(metrics, "employment_rate")

      expect(expense["value"]).toBe(0)
      expect(expense["value_status"]).toBe("reported_zero")
      expect(hasZeroNote(expense)).toBe(true)

      // Counted in 권 but a per-student ratio, so a zero is as implausible as a
      // zero rate: classification follows the measure, not the unit.
      expect(books["value_status"]).toBe("reported_zero")
      expect(hasZeroNote(books)).toBe(true)

      expect(employment["value_status"]).toBe("reported")
      expect(hasZeroNote(employment)).toBe(false)
    })
  }, 30_000)

  it("reports the source value unchanged and leaves missing_metrics alone", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("get_university_metrics", {
        university_name: "전남대학교 제2캠퍼스",
        indicators: ["education_expense_per_student"],
      })

      const data = (result.structuredContent as Response)["data"] as Response
      const expense = byIndicator(metricsOf(result.structuredContent), "education_expense_per_student")

      // A zero is a value the source asserts; it is not a missing cell, which
      // the source writes as `-` and which is reported separately.
      expect(expense["raw_value"]).toBe("0")
      expect(data["missing_metrics"]).toEqual([])
    })
  }, 30_000)

  it("does not repeat response-wide notes on every metric contract", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("compare_universities", {
        university_names: ["전남대학교 본교", "전북대학교"],
        indicators: ["employment_rate", "competition_rate"],
      })

      const response = result.structuredContent as Response
      const data = response["data"] as Response
      const contracts = data["metric_contracts"] as readonly Response[]
      const topLevel = response["warnings"] as readonly string[]

      for (const note of RESPONSE_WIDE_NOTES) {
        expect(topLevel).toContain(note)

        for (const contract of contracts) {
          expect(contract["warnings"] as readonly string[]).not.toContain(note)
        }
      }
    })
  }, 30_000)
})
