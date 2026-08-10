import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { reservedKeyOverrides } from "./mcp-contract-helpers.ts"
import { withMcpServer } from "./support/mcp-stdio-harness.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

const SHA256 = /^[a-f0-9]{64}$/u

const datasetSchema = z.object({
  dataset_id: z.literal("15118998"),
  dataset_name: z.string().min(1),
  provider: z.string().min(1),
  source_url: z.string().min(1),
  license: z.string().min(1),
  derived_database: z.boolean(),
  bundled: z.boolean(),
  bundle_version: z.string().min(1),
  source_downloaded_at: z.string().min(1),
  seed_built_at: z.string().min(1),
  source_file_sha256: z.string().min(1),
  seed_db_sha256: z.string().min(1),
  temporal_coverage: z.literal("single_snapshot"),
  claims_latest_source: z.boolean(),
})

async function readJson(...segments: readonly string[]): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(projectRoot, ...segments), "utf8")) as Record<
    string,
    unknown
  >
}

function datasetOf(structuredContent: unknown): z.infer<typeof datasetSchema> {
  return datasetSchema.parse((structuredContent as Record<string, unknown>)["dataset"])
}

describe("dataset provenance contract", () => {
  it("returns a snapshot identity block that matches the bundled manifest", async () => {
    const manifest = await readJson("data", "seed", "academyinfo_15118998.manifest.json")
    const packageJson = await readJson("package.json")

    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("list_indicators", {})
      const dataset = datasetOf(result.structuredContent)

      // Call time must not be mistaken for data time: provenance values come
      // from the bundle, never from `new Date()`.
      expect(dataset.bundle_version).toBe(packageJson["version"])
      expect(dataset.source_downloaded_at).toBe(manifest["source_downloaded_at"])
      expect(dataset.seed_built_at).toBe(manifest["seed_built_at"])
      expect(dataset.source_file_sha256).toBe(manifest["source_file_checksum_sha256"])
      expect(dataset.seed_db_sha256).toBe(manifest["seed_db_checksum_sha256"])
      expect(dataset.source_file_sha256).toMatch(SHA256)
      expect(dataset.seed_db_sha256).toMatch(SHA256)

      // The bundle never claims to be the newest published source.
      expect(dataset.claims_latest_source).toBe(false)
    })
  }, 30_000)

  it("carries the identical provenance block on a metrics response", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const listed = await harness.callTool("list_indicators", {})
      const metrics = await harness.callTool("get_university_metrics", {
        university_name: "광주가톨릭대학교",
        indicators: ["competition_rate"],
      })

      expect(datasetOf(metrics.structuredContent)).toEqual(
        datasetOf(listed.structuredContent),
      )
    })
  }, 30_000)

  it("declares that the catalog cannot answer trend questions", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("list_indicators", {})
      const data = (result.structuredContent as Record<string, unknown>)["data"] as Record<
        string,
        unknown
      >

      expect(data["time_series_supported"]).toBe(false)
      expect(datasetOf(result.structuredContent).temporal_coverage).toBe("single_snapshot")
    })
  }, 30_000)
})
