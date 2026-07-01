import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { isForbiddenArtifactPath } from "../scripts/package-check-scan.ts"

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

function isForbidden15139279DataArtifactPath(packPath: string): boolean {
  const normalizedPath = packPath.replaceAll("\\", "/").toLowerCase()

  if (!normalizedPath.includes("15139279")) {
    return false
  }

  if (normalizedPath.endsWith(".md") || normalizedPath.endsWith(".txt")) {
    return false
  }

  return (
    normalizedPath.startsWith("data/") ||
    normalizedPath.includes("fixture") ||
    normalizedPath.includes("sample") ||
    /\.(?:sqlite|db|csv|xlsx|xls|json|jsonl|parquet|tsv)$/u.test(normalizedPath)
  )
}

describe("license and package safety gate", () => {
  it("has required license files and documents bundled/non-bundled policy", async () => {
    const requiredFiles = [
      "LICENSE",
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
    expect(combinedText).toContain("v0.3 backlog")
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
    const packagePolicyText = await Promise.all([
      readFile(join(projectRoot, "README.md"), "utf8"),
      readFile(join(projectRoot, "DATA_LICENSE.md"), "utf8"),
    ])

    expect(packPaths).toContain("data/seed/academyinfo_15118998.sqlite")
    expect(packPaths).toContain("data/seed/academyinfo_15118998.manifest.json")
    expect(packPaths).toContain("data/seed/LICENSE.15118998.md")
    expect(packPaths.some((packPath) => packPath.includes("data/raw"))).toBe(false)
    expect(packPaths.some((packPath) => packPath.includes("data/external"))).toBe(false)
    expect(packagePolicyText.join("\n")).toContain("15139279")
    expect(packPaths.some(isForbidden15139279DataArtifactPath)).toBe(false)
    expect(packPaths.some((packPath) => packPath.split("/").includes(".env"))).toBe(false)
    expect(packPaths.some((packPath) => packPath.endsWith(".xlsx"))).toBe(false)
    expect(packPaths.some((packPath) => packPath.endsWith(".csv"))).toBe(false)
  })

  it("treats local review and runtime artifacts as forbidden package paths", () => {
    expect(isForbiddenArtifactPath(".insane-review/report.json")).toBe(true)
    expect(isForbiddenArtifactPath("data/raw/15118998/대학주요정보.xlsx")).toBe(true)
    expect(isForbiddenArtifactPath("data/external/15139279/sample.json")).toBe(true)
    expect(isForbiddenArtifactPath("docs/15139279-backlog-note.md")).toBe(false)
  })

  it("treats credential package paths as forbidden", () => {
    expect(isForbiddenArtifactPath(".env.local")).toBe(true)
    expect(isForbiddenArtifactPath("packages/worker/.env.production")).toBe(true)
    expect(isForbiddenArtifactPath(".npmrc")).toBe(true)
    expect(isForbiddenArtifactPath("certs/private-key.pem")).toBe(true)
    expect(isForbiddenArtifactPath("config/service-account.json")).toBe(true)
    expect(isForbiddenArtifactPath("data/seed/academyinfo_15118998.manifest.json")).toBe(false)
  })
})
