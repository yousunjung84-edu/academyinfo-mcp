import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Writable } from "node:stream"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

const packageJsonSchema = z
  .object({
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
    files: z.array(z.string()).optional(),
    scripts: z.record(z.string(), z.string()).optional(),
  })
  .passthrough()

const requiredScripts = [
  "build",
  "test",
  "lint",
  "doctor",
  "package:check",
  "prepublishOnly",
] as const

const expectedPackageFiles = [
  "dist/**",
  "data/seed/academyinfo_15118998.sqlite",
  "data/seed/academyinfo_15118998.manifest.json",
  "data/seed/LICENSE.15118998.md",
  "README.md",
  "LICENSE",
  "NOTICE.md",
  "DATA_LICENSE.md",
] as const

class CaptureStream extends Writable {
  readonly chunks: string[] = []

  override _write(
    chunk: string | Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk)
    callback()
  }

  text(): string {
    return this.chunks.join("")
  }
}

async function readPackageJson(): Promise<z.infer<typeof packageJsonSchema>> {
  const packageJsonText = await readFile(join(projectRoot, "package.json"), "utf8")
  return packageJsonSchema.parse(JSON.parse(packageJsonText))
}

describe("Phase 1 scaffold", () => {
  it("accepts missing reserved service keys when loading config", async () => {
    const { loadConfig } = await import("../src/config/index.ts")

    const config = loadConfig({})

    expect(config.serviceKeys.dataGoKr.status).toBe("unset")
    expect(config.serviceKeys.academyInfo.status).toBe("unset")
  })

  it("configures runtime logging for stderr without writing to stdout", async () => {
    const { createRuntimeLogger } = await import("../src/logging.ts")
    const stderr = new CaptureStream()
    const stdout = new CaptureStream()

    const logger = createRuntimeLogger(stderr)
    logger.info({ event: "phase1_logging_probe" }, "runtime log probe")

    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })

    expect(stderr.text()).toContain("phase1_logging_probe")
    expect(stdout.text()).toBe("")
  })

  it("defines the Phase 1 npm command surface and package allowlist", async () => {
    const packageJson = await readPackageJson()

    for (const scriptName of requiredScripts) {
      expect(packageJson.scripts?.[scriptName]).toEqual(expect.any(String))
    }

    expect(packageJson.files).toEqual([...expectedPackageFiles])
    expect(packageJson.dependencies?.["@modelcontextprotocol/sdk"]).toEqual(expect.any(String))
    expect(packageJson.dependencies?.["better-sqlite3"]).toEqual(expect.any(String))
    expect(packageJson.dependencies?.pino).toEqual(expect.any(String))
    expect(packageJson.dependencies?.zod).toEqual(expect.any(String))
    expect(packageJson.devDependencies?.typescript).toEqual(expect.any(String))
    expect(packageJson.devDependencies?.vitest).toEqual(expect.any(String))
    expect(packageJson.devDependencies?.["@types/node"]).toEqual(expect.any(String))
  })

  it("uses test/ consistently without creating tests/", () => {
    expect(existsSync(join(projectRoot, "test"))).toBe(true)
    expect(existsSync(join(projectRoot, "tests"))).toBe(false)
  })

  it("keeps server construction available for the v0.1 MCP surface", async () => {
    const serverSource = await readFile(join(projectRoot, "src", "server.ts"), "utf8")

    const { createAcademyinfoServer } = await import("../src/server.ts")
    expect(createAcademyinfoServer()).toBeDefined()
    expect(serverSource).not.toContain("console.log")
  }, 20_000)
})
