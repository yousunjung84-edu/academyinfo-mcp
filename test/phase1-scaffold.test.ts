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
    bin: z.record(z.string(), z.string()).optional(),
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
    engines: z.object({ node: z.string() }).optional(),
    files: z.array(z.string()).optional(),
    license: z.string().optional(),
    scripts: z.record(z.string(), z.string()).optional(),
    version: z.string().optional(),
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
    expect(packageJson.bin).toEqual({ "academyinfo-mcp": "dist/src/index.js" })
    expect(packageJson.version).toBe("0.1.0")
    expect(packageJson.license).toBe("MIT")
    expect(packageJson.engines?.node).toBe(">=20.0.0")
    expect(packageJson.dependencies?.["@modelcontextprotocol/sdk"]).toMatch(/^\^\d+\.\d+\.\d+$/u)
    expect(packageJson.dependencies?.["better-sqlite3"]).toMatch(/^\^11\.\d+\.\d+$/u)
    expect(packageJson.dependencies?.pino).toMatch(/^\^\d+\.\d+\.\d+$/u)
    expect(packageJson.dependencies?.zod).toMatch(/^\^\d+\.\d+\.\d+$/u)
    expect(packageJson.devDependencies?.["@types/better-sqlite3"]).toMatch(/^\^\d+\.\d+\.\d+$/u)
    expect(packageJson.devDependencies?.typescript).toEqual(expect.any(String))
    expect(packageJson.devDependencies?.vitest).toEqual(expect.any(String))
    expect(packageJson.devDependencies?.["@types/node"]).toEqual(expect.any(String))
  })

  it("declares an npx-capable bin entry with a preserved shebang", async () => {
    const sourceIndex = await readFile(join(projectRoot, "src", "index.ts"), "utf8")
    const distIndex = await readFile(join(projectRoot, "dist", "src", "index.js"), "utf8")

    expect(sourceIndex.startsWith("#!/usr/bin/env node\n")).toBe(true)
    expect(distIndex.startsWith("#!/usr/bin/env node\n")).toBe(true)
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
