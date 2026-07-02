import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import * as databaseStatusModule from "../src/database-status.ts"
import { getDatabaseStatus } from "../src/database-status.ts"
import {
  handleExplainIndicator,
  handleListIndicators,
  handleListSources,
} from "../src/source-tool-handlers.ts"
import { responseSchema } from "./mcp-contract-helpers.ts"

const missingDbErrorSchema = z.object({
  error: z.object({
    code: z.literal("missing_db"),
    message: z.string(),
    configured_database: z.literal("missing"),
  }),
})

function parseStructuredResponse(result: ReturnType<typeof handleListSources>) {
  return responseSchema.parse(result.structuredContent)
}

describe("metadata seed status", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reports a missing bundled seed when no database path is configured", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "academyinfo-missing-seed-"))

    try {
      const status = getDatabaseStatus(
        { ACADEMYINFO_DB_PATH: "" },
        { bundledSeedPath: join(tempRoot, "data", "seed", "academyinfo_15118998.sqlite") },
      )

      expect(status).toEqual({ kind: "missing" })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it("surfaces missing_db from metadata-only tools instead of reporting healthy metadata", () => {
    vi.spyOn(databaseStatusModule, "getDatabaseStatus").mockReturnValue({ kind: "missing" })

    const responses = [
      parseStructuredResponse(handleListSources({})),
      parseStructuredResponse(handleListIndicators({})),
      parseStructuredResponse(handleExplainIndicator({ indicator: "competition_rate" })),
    ]

    for (const response of responses) {
      expect(response.status).toBe("missing_db")
      expect(missingDbErrorSchema.parse(response.data).error.configured_database).toBe("missing")
    }
  })
})
