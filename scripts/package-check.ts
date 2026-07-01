import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  addFailure,
  IMPLICIT_NPM_FILES,
  projectRoot,
  REQUIRED_LICENSE_FILES,
  REQUIRED_PACKAGE_FILES,
  REQUIRED_SEED_PACKAGE_FILES,
  type Failure,
  type PackFile,
  type PackResult,
} from "./package-check-config.js"
import { isForbiddenArtifactPath, scanFirstPartyFiles } from "./package-check-scan.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parsePackResults(value: unknown): readonly PackResult[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry): readonly PackResult[] => {
    if (!isRecord(entry) || !Array.isArray(entry["files"])) {
      return []
    }

    const files = entry["files"].flatMap((file): readonly PackFile[] => {
      return isRecord(file) && typeof file["path"] === "string" ? [{ path: file["path"] }] : []
    })

    return [{ files }]
  })
}

function readPackageJson(): Record<string, unknown> {
  const parsedPackageJson: unknown = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"))
  return isRecord(parsedPackageJson) ? parsedPackageJson : {}
}

function hasExactFilesAllowlist(packageJson: Record<string, unknown>): boolean {
  const files = packageJson["files"]
  return (
    Array.isArray(files) &&
    files.length === REQUIRED_PACKAGE_FILES.length &&
    files.every((entry, index) => entry === REQUIRED_PACKAGE_FILES[index])
  )
}

function isAllowedPackagePath(path: string): boolean {
  if (IMPLICIT_NPM_FILES.some((allowedPath) => path === allowedPath)) {
    return true
  }

  return REQUIRED_PACKAGE_FILES.some((allowedPath) =>
    allowedPath.endsWith("/**") ? path.startsWith(allowedPath.slice(0, -2)) : path === allowedPath,
  )
}

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
    shell: typeof npmExecPath === "string" && npmExecPath.length > 0 ? false : process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  })
  const parsedOutput: unknown = JSON.parse(rawOutput)
  return parsePackResults(parsedOutput).flatMap((result) => result.files.map((file) => file.path))
}

function assertRequiredFilesExist(failures: Failure[]): void {
  for (const requiredPath of [...REQUIRED_LICENSE_FILES, ...REQUIRED_SEED_PACKAGE_FILES]) {
    if (!existsSync(join(projectRoot, requiredPath))) {
      addFailure(failures, "required_file_missing", requiredPath)
    }
  }
}

function assertLicensePolicyText(failures: Failure[]): void {
  const paths = [
    join(projectRoot, "DATA_LICENSE.md"),
    join(projectRoot, "NOTICE.md"),
    join(projectRoot, "data/seed/LICENSE.15118998.md"),
  ] as const

  if (paths.some((path) => !existsSync(path))) {
    return
  }

  const combinedText = paths.map((path) => readFileSync(path, "utf8")).join("\n")
  const requiredSnippets = ["15118998", "KOGL-1", "공공누리 제1유형(출처표시)", "15139279", "v0.3 backlog"] as const

  for (const snippet of requiredSnippets) {
    if (!combinedText.includes(snippet)) {
      addFailure(failures, "license_policy_text_missing", snippet)
    }
  }
}

function assertRequiredSeedsIncluded(failures: Failure[], packagePaths: readonly string[]): void {
  const packagePathSet = new Set(packagePaths)

  for (const requiredPath of REQUIRED_SEED_PACKAGE_FILES) {
    if (!packagePathSet.has(requiredPath)) {
      addFailure(failures, "required_seed_not_in_pack", requiredPath)
    }
  }
}

function main(): void {
  const failures: Failure[] = []
  const packageJson = readPackageJson()

  assertRequiredFilesExist(failures)
  assertLicensePolicyText(failures)

  if (!hasExactFilesAllowlist(packageJson)) {
    addFailure(failures, "package_files_allowlist", "package.json files allowlist is not exact")
  }

  const packagePaths = runNpmPackDryRun()
  assertRequiredSeedsIncluded(failures, packagePaths)

  for (const packagePath of packagePaths) {
    if (!isAllowedPackagePath(packagePath)) {
      addFailure(failures, "unexpected_package_path", packagePath)
    }

    if (isForbiddenArtifactPath(packagePath)) {
      addFailure(failures, "forbidden_package_path", packagePath)
    }
  }

  scanFirstPartyFiles(failures)

  for (const seedArtifact of REQUIRED_SEED_PACKAGE_FILES) {
    const status = existsSync(join(projectRoot, seedArtifact)) ? "present" : "pending"
    console.log(`seed_artifact: ${seedArtifact}: ${status}`)
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`${failure.code}: ${failure.detail}`)
    }
    process.exitCode = 1
    return
  }

  console.log("package_check: ok")
}

main()
