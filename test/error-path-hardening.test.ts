import { cp, mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { reservedKeyOverrides, responseSchema } from "./mcp-contract-helpers.ts"
import { withMcpServer } from "./support/mcp-stdio-harness.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
})

type RuntimeWithoutBundledSeedOptions = {
  readonly includePackageJson: boolean
}

async function createRuntimeWithoutBundledSeed(
  options: RuntimeWithoutBundledSeedOptions,
): Promise<string> {
  const runtimeRoot = await mkdtemp(join(tmpdir(), "academyinfo-mcp-missing-seed-"))
  await mkdir(join(runtimeRoot, "dist"), { recursive: true })
  await cp(join(projectRoot, "dist", "src"), join(runtimeRoot, "dist", "src"), {
    recursive: true,
  })
  if (options.includePackageJson) {
    await writeFile(join(runtimeRoot, "package.json"), JSON.stringify({ type: "module" }))
  }
  await symlink(
    join(projectRoot, "node_modules"),
    join(runtimeRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  )
  return runtimeRoot
}

describe("error-path hardening", () => {
  it("returns a structured tool envelope when the configured DB is corrupt", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "academyinfo-corrupt-db-"))
    const corruptDbPath = join(tempRoot, "academyinfo-corrupt.sqlite")

    try {
      await writeFile(corruptDbPath, "not a sqlite database", "utf8")

      await withMcpServer(
        { ...reservedKeyOverrides("", ""), ACADEMYINFO_DB_PATH: corruptDbPath },
        async (harness) => {
          const result = await harness.callTool("search_university", { query: "전남대학교" })
          const response = responseSchema.parse(result.structuredContent)
          const data = z
            .object({
              error: errorSchema.extend({ code: z.literal("database_error") }),
            })
            .parse(response.data)

          expect(response.status).toBe("database_error")
          expect(response.tool).toBe("search_university")
          expect(response.query).toEqual({ query: "전남대학교" })
          expect(data.error.message).toBe("Local database could not be read.")
          expect(JSON.stringify(response)).not.toContain(corruptDbPath)
          expect(JSON.stringify(response)).not.toContain("SqliteError")
          expect(harness.stderrText()).not.toContain(corruptDbPath)
        },
      )
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  }, 20_000)

  it("reports missing_db from catalog tools when the bundled seed is absent and no DB path is configured", async () => {
    const runtimeRoot = await createRuntimeWithoutBundledSeed({ includePackageJson: true })

    try {
      await withMcpServer(
        { ...reservedKeyOverrides("", ""), ACADEMYINFO_DB_PATH: undefined },
        async (harness) => {
          for (const tool of ["list_sources", "list_indicators"] as const) {
            const result = await harness.callTool(tool, {})
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
            expect(data.error.configured_database).toBe("missing")
          }

          const explainResult = await harness.callTool("explain_indicator", {
            indicator: "competition_rate",
          })
          const explainResponse = responseSchema.parse(explainResult.structuredContent)
          const explainData = z
            .object({
              error: z.object({
                code: z.literal("missing_db"),
                configured_database: z.literal("missing"),
              }),
            })
            .parse(explainResponse.data)

          expect(explainResponse.status).toBe("missing_db")
          expect(explainData.error.configured_database).toBe("missing")
        },
        {
          cwd: runtimeRoot,
          entryPoint: join(runtimeRoot, "dist", "src", "index.js"),
        },
      )
    } finally {
      await rm(runtimeRoot, { recursive: true, force: true })
    }
  }, 20_000)

  it("reports missing_db from catalog tools when the bundled seed path cannot be resolved", async () => {
    const runtimeRoot = await createRuntimeWithoutBundledSeed({ includePackageJson: true })

    try {
      await withMcpServer(
        { ...reservedKeyOverrides("", ""), ACADEMYINFO_DB_PATH: undefined },
        async (harness) => {
          await unlink(join(runtimeRoot, "package.json"))

          for (const tool of ["list_sources", "list_indicators"] as const) {
            const result = await harness.callTool(tool, {})
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
            expect(data.error.configured_database).toBe("missing")
          }

          const explainResult = await harness.callTool("explain_indicator", {
            indicator: "competition_rate",
          })
          const explainResponse = responseSchema.parse(explainResult.structuredContent)
          const explainData = z
            .object({
              error: z.object({
                code: z.literal("missing_db"),
                configured_database: z.literal("missing"),
              }),
            })
            .parse(explainResponse.data)

          expect(explainResponse.status).toBe("missing_db")
          expect(explainData.error.configured_database).toBe("missing")
        },
        {
          cwd: runtimeRoot,
          entryPoint: join(runtimeRoot, "dist", "src", "index.js"),
        },
      )
    } finally {
      await rm(runtimeRoot, { recursive: true, force: true })
    }
  }, 20_000)

  it("does not return partial comparisons when one comparison query fails", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("compare_universities", {
        university_names: ["전남대학교 본교", "not-a-real-university"],
      })
      const response = responseSchema.parse(result.structuredContent)
      const data = z
        .object({
          error: errorSchema.extend({ code: z.literal("not_found") }),
          comparisons: z.array(z.unknown()),
        })
        .parse(response.data)

      expect(response.status).toBe("not_found")
      expect(data.comparisons).toHaveLength(0)
    })
  }, 20_000)

  it("does not return partial comparisons when one comparison query is ambiguous", async () => {
    await withMcpServer(reservedKeyOverrides("", ""), async (harness) => {
      const result = await harness.callTool("compare_universities", {
        university_names: ["전남대학교 본교", "가야대학교"],
      })
      const response = responseSchema.parse(result.structuredContent)
      const data = z
        .object({
          error: errorSchema.extend({ code: z.literal("ambiguous") }),
          comparisons: z.array(z.unknown()),
        })
        .parse(response.data)

      expect(response.status).toBe("ambiguous")
      expect(data.comparisons).toHaveLength(0)
    })
  }, 20_000)
})
