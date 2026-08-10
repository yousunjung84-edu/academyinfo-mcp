import { describe, expect, it } from "vitest"

import { reservedKeyOverrides } from "./mcp-contract-helpers.ts"
import { withMcpServer } from "./support/mcp-stdio-harness.ts"

type Response = Record<string, unknown>

function sourcesOf(structuredContent: unknown): readonly Record<string, unknown>[] {
  return (structuredContent as Response)["sources"] as readonly Record<string, unknown>[]
}

function contractsOf(structuredContent: unknown): readonly Record<string, unknown>[] {
  const data = (structuredContent as Response)["data"] as Response
  return (data["metric_contracts"] ?? []) as readonly Record<string, unknown>[]
}

const CATALOG_SIZE = 17

describe("indicator selection filters response metadata", () => {
  it("returns metadata only for the requested indicators", async () => {
    const requested = ["employment_rate", "competition_rate"]

    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("compare_universities", {
        university_names: ["전남대학교 본교", "전북대학교"],
        indicators: requested,
      })

      const contractNames = contractsOf(result.structuredContent).map(
        (contract) => contract["indicator"],
      )

      // Metadata used to arrive for the whole catalog regardless of the request.
      expect(sourcesOf(result.structuredContent)).toHaveLength(requested.length)
      expect(contractNames.sort()).toEqual([...requested].sort())
    })
  }, 30_000)

  it("still returns the whole catalog when the request does not narrow it", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("get_university_metrics", {
        university_name: "광주가톨릭대학교",
      })

      expect(sourcesOf(result.structuredContent)).toHaveLength(CATALOG_SIZE)
      expect(contractsOf(result.structuredContent)).toHaveLength(CATALOG_SIZE)
    })
  }, 30_000)

  it("keeps values unchanged while narrowing metadata", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const narrowed = await harness.callTool("get_university_metrics", {
        university_name: "광주가톨릭대학교",
        indicators: ["competition_rate"],
      })

      const data = (narrowed.structuredContent as Response)["data"] as Response
      const metrics = data["metrics"] as readonly Record<string, unknown>[]

      expect((narrowed.structuredContent as Response)["status"]).toBe("ok")
      expect(sourcesOf(narrowed.structuredContent)).toHaveLength(1)
      expect(metrics).toHaveLength(1)
      expect(metrics[0]?.["indicator"]).toBe("competition_rate")
      expect(metrics[0]?.["value"]).toBe(0.6)
    })
  }, 30_000)
})
