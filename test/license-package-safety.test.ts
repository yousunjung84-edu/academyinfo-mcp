import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

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

const packOutputSchema = z.array(
  z.object({
    files: z.array(
      z.object({
        path: z.string(),
      }),
    ),
  }),
)

function runNpmPackDryRun(): readonly string[] {
  const npmExecPath = process.env["npm_execpath"]
  const command =
    typeof npmExecPath === "string" && npmExecPath.length > 0 ? process.execPath : "npm"
  const args =
    typeof npmExecPath === "string" && npmExecPath.length > 0
      ? [npmExecPath, "pack", "--dry-run", "--json"]
      : ["pack", "--dry-run", "--json"]
  const rawOutput = execFileSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    shell:
      typeof npmExecPath === "string" && npmExecPath.length > 0
        ? false
        : process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  })

  return packOutputSchema
    .parse(JSON.parse(rawOutput))
    .flatMap((result) => result.files.map((file) => file.path))
}

describe("license and package safety gate", () => {
  it("has required license files and documents bundled/non-bundled policy", async () => {
    const requiredFiles = [
      "DATA_LICENSE.md",
      "NOTICE.md",
      "data/seed/LICENSE.15118998.md",
    ] as const

    for (const requiredFile of requiredFiles) {
      expect(existsSync(join(projectRoot, requiredFile))).toBe(true)
    }

    const combinedText = (
      await Promise.all(
        requiredFiles.map((requiredFile) => readFile(join(projectRoot, requiredFile), "utf8")),
      )
    ).join("\n")

    expect(combinedText).toContain("15118998")
    expect(combinedText).toContain("KOGL-1")
    expect(combinedText).toContain("공공누리 제1유형(출처표시)")
    expect(combinedText).toContain("15139279")
    expect(combinedText).toContain("non-bundled / local ingest only")
  })

  it("uses an npm files allowlist and packs only the allowed seed artifacts", async () => {
    const packageJsonText = await readFile(join(projectRoot, "package.json"), "utf8")
    const packageJson = z
      .object({
        files: z.array(z.string()),
      })
      .passthrough()
      .parse(JSON.parse(packageJsonText))

    expect(packageJson.files).toEqual([...expectedPackageFiles])

    const packPaths = runNpmPackDryRun()

    expect(packPaths).toContain("data/seed/academyinfo_15118998.sqlite")
    expect(packPaths).toContain("data/seed/academyinfo_15118998.manifest.json")
    expect(packPaths).toContain("data/seed/LICENSE.15118998.md")
    expect(packPaths.some((packPath) => packPath.includes("data/raw"))).toBe(false)
    expect(packPaths.some((packPath) => packPath.includes("data/external"))).toBe(false)
    expect(packPaths.some((packPath) => packPath.includes("15139279"))).toBe(false)
    expect(packPaths.some((packPath) => packPath.split("/").includes(".env"))).toBe(false)
    expect(packPaths.some((packPath) => packPath.endsWith(".xlsx"))).toBe(false)
    expect(packPaths.some((packPath) => packPath.endsWith(".csv"))).toBe(false)
  })
})
