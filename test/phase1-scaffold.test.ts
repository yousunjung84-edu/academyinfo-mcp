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
  "start:http",
  "package:check",
  "prepublishOnly",
] as const

const expectedPackageFiles = [
  "dist/src/**",
  "!dist/src/http.js",
  "!dist/src/http.js.map",
  "!dist/src/http.d.ts",
  "!dist/src/http.d.ts.map",
  "dist/scripts/doctor.js",
  "data/seed/academyinfo_15118998.sqlite",
  "data/seed/academyinfo_15118998.manifest.json",
  "data/seed/indicators.json",
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
    expect(packageJson.version).toBe("0.3.0")
    expect(packageJson.license).toBe("MIT")
    expect(packageJson.engines?.node).toBe(">=22 <23")
    expect(packageJson.dependencies?.["@modelcontextprotocol/sdk"]).toBe("1.29.0")
    expect(packageJson.dependencies?.["better-sqlite3"]).toBe("11.10.0")
    expect(packageJson.dependencies?.pino).toBe("10.3.1")
    expect(packageJson.dependencies?.zod).toBe("4.4.3")
    expect(packageJson.devDependencies?.["@types/better-sqlite3"]).toBe("7.6.13")
    expect(packageJson.devDependencies?.typescript).toBe("6.0.3")
    expect(packageJson.devDependencies?.vitest).toBe("4.1.9")
    expect(packageJson.devDependencies?.["@types/node"]).toBe("22.20.1")
  })

  it("declares an npx-capable bin entry with a preserved shebang", async () => {
    const sourceIndex = await readFile(join(projectRoot, "src", "index.ts"), "utf8")
    const distIndex = await readFile(join(projectRoot, "dist", "src", "index.js"), "utf8")

    expect(sourceIndex.startsWith("#!/usr/bin/env node\n")).toBe(true)
    expect(distIndex.startsWith("#!/usr/bin/env node\n")).toBe(true)
  })

  it("documents published npx use and from-source use", async () => {
    const readme = await readFile(join(projectRoot, "README.md"), "utf8")
    const packageJson = await readPackageJson()

    expect(readme).toContain("Use Node `>=22 <23`.")
    expect(readme).toContain("The implemented local behavior can be exercised from a checkout:")
    // The published/latest claims in the README must track package.json so a release
    // bump cannot leave stale version prose behind (the 0.1.1 release shipped a README
    // still describing 0.1.0 as latest).
    expect(readme).toContain("## Quickstart")
    expect(readme).toContain("npx -y academyinfo-mcp")
    expect(readme).toContain(
      `academyinfo-mcp@${packageJson.version ?? ""}\` is live on the public npm registry`,
    )
    expect(readme).toContain(`current \`latest\` (now \`${packageJson.version ?? ""}\`)`)
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

  it("reports the package.json version as serverInfo.version over initialize", async () => {
    const packageJson = await readPackageJson()
    const serverSource = await readFile(join(projectRoot, "src", "server.ts"), "utf8")
    const { createAcademyinfoServer } = await import("../src/server.ts")
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js")
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js")

    // package.json is the single source of truth: no literal version may be
    // hardcoded in the server factory (0.1.1 shipped still reporting 0.1.0).
    expect(serverSource).not.toMatch(/version:\s*"/)

    const server = createAcademyinfoServer()
    const client = new Client({ name: "phase1-scaffold-probe", version: "0.0.1" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

    expect(client.getServerVersion()).toEqual({
      name: "academyinfo-mcp",
      version: packageJson.version,
    })

    await client.close()
    await server.close()
  }, 20_000)
})
