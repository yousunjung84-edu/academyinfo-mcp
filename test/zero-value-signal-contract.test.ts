import { describe, expect, it } from "vitest"

import { reservedKeyOverrides } from "./mcp-contract-helpers.ts"
import { withMcpServer } from "./support/mcp-stdio-harness.ts"

type Response = Record<string, unknown>
type Entry = Record<string, unknown>

/** Notes that describe the whole response, not one metric. */
const RESPONSE_WIDE_NOTES = [
  "v0.1 runs in file-first mode and does not require reserved API-key environment variables.",
  "The bundled seed DB is a normalized derivative of dataset 15118998, not a raw source file.",
  "15118998 indicator source columns, years, and units follow the verified header policy.",
]

function dataOf(structuredContent: unknown): Response {
  return (structuredContent as Response)["data"] as Response
}

function find(entries: readonly Entry[], indicator: string): Entry | undefined {
  return entries.find((entry) => entry["indicator"] === indicator)
}

describe("zeros that cannot be aggregated are withheld, not served", () => {
  it("withholds a per-student zero and keeps the source text", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("get_university_metrics", {
        // An operating campus: 2,808 enrolled and 137 faculty, yet the source
        // records 0 for both per-student indicators.
        university_name: "전남대학교 제2캠퍼스",
        indicators: [
          "education_expense_per_student",
          "books_per_student",
          "international_students",
          "employment_rate",
        ],
      })

      const data = dataOf(result.structuredContent)
      const metrics = data["metrics"] as readonly Entry[]
      const missing = data["missing_metrics"] as readonly Entry[]

      for (const indicator of ["education_expense_per_student", "books_per_student"]) {
        expect(find(metrics, indicator), `${indicator} must not be served`).toBeUndefined()

        const withheld = find(missing, indicator)
        expect(withheld?.["value"]).toBeNull()
        expect(withheld?.["reason"]).toBe("zero_not_aggregatable")
        // The source text survives so a caller can still see what was recorded.
        expect(withheld?.["raw_value"]).toBe("0")
        // The rationale reaches API consumers, not just repo readers.
        expect(withheld?.["note"]).toContain("docs/zero-values.md")
      }

      // Ordinary values are unaffected.
      expect(find(metrics, "employment_rate")?.["value"]).toBe(59.2)
      expect(find(metrics, "international_students")?.["value"]).toBe(149)
    })
  }, 30_000)

  it("still serves a genuine headcount of zero, with a note", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      // 1,285 enrolled students and a recorded faculty count of 0.
      const result = await harness.callTool("get_university_metrics", {
        university_name: "경남과학기술대학교",
        indicators: ["fulltime_faculty_count", "enrolled_students"],
      })

      const data = dataOf(result.structuredContent)
      const faculty = find(data["metrics"] as readonly Entry[], "fulltime_faculty_count")

      // A headcount of zero is representable, so it is served rather than
      // withheld — but it no longer passes without comment.
      expect(faculty?.["value"]).toBe(0)
      expect(faculty?.["value_status"]).toBe("reported_zero")
      expect((faculty?.["warnings"] as readonly string[]).join(" ")).toContain(
        "Exact zero headcount",
      )
    })
  }, 30_000)

  it("withholds the same zeros on the comparison path", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("compare_universities", {
        university_names: ["전남대학교 제2캠퍼스", "전남대학교 본교"],
        indicators: ["education_expense_per_student"],
      })

      const comparisons = dataOf(result.structuredContent)["comparisons"] as readonly Response[]
      const secondary = comparisons.find((entry) => entry["campus_name"] === "제2캠퍼스")
      const main = comparisons.find((entry) => entry["campus_name"] === "본교")

      expect(
        find(secondary?.["metrics"] as readonly Entry[], "education_expense_per_student"),
      ).toBeUndefined()
      expect(
        find(secondary?.["missing_metrics"] as readonly Entry[], "education_expense_per_student")?.[
          "reason"
        ],
      ).toBe("zero_not_aggregatable")

      // The main campus reports a real figure and is untouched.
      expect(
        find(main?.["metrics"] as readonly Entry[], "education_expense_per_student")?.["value"],
      ).toBe(26483.1)
    })
  }, 30_000)

  it("does not repeat response-wide notes on every metric contract", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("compare_universities", {
        university_names: ["전남대학교 본교", "전북대학교"],
        indicators: ["employment_rate", "competition_rate"],
      })

      const response = result.structuredContent as Response
      const contracts = dataOf(response)["metric_contracts"] as readonly Response[]
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
