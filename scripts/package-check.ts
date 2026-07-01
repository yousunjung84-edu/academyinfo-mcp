import { execFileSync } from "node:child_process"
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const REQUIRED_PACKAGE_FILES = [
  "dist/**",
  "data/seed/academyinfo_15118998.sqlite",
  "data/seed/academyinfo_15118998.manifest.json",
  "data/seed/LICENSE.15118998.md",
  "README.md",
  "LICENSE",
  "NOTICE.md",
  "DATA_LICENSE.md",
] as const

const IMPLICIT_NPM_FILES = ["package.json", "README.md", "LICENSE"] as const
const REQUIRED_LICENSE_FILES = [
  "DATA_LICENSE.md",
  "NOTICE.md",
  "data/seed/LICENSE.15118998.md",
] as const
const REQUIRED_SEED_PACKAGE_FILES = [
  "data/seed/academyinfo_15118998.sqlite",
  "data/seed/academyinfo_15118998.manifest.json",
  "data/seed/LICENSE.15118998.md",
] as const
const TEXT_FILE_EXTENSIONS = [
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".jsonl",
  ".md",
  ".mjs",
  ".mts",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
] as const

type Failure = {
  readonly code: string
  readonly detail: string
}

type PackFile = {
  readonly path: string
}

type PackResult = {
  readonly files: readonly PackFile[]
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url))

function addFailure(failures: Failure[], code: string, detail: string): void {
  failures.push({ code, detail })
}

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
      if (!isRecord(file) || typeof file["path"] !== "string") {
        return []
      }

      return [{ path: file["path"] }]
    })

    return [{ files }]
  })
}

function readPackageJson(): Record<string, unknown> {
  const rawPackageJson = readFileSync(join(projectRoot, "package.json"), "utf8")
  const parsedPackageJson: unknown = JSON.parse(rawPackageJson)
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

  return REQUIRED_PACKAGE_FILES.some((allowedPath) => {
    if (allowedPath.endsWith("/**")) {
      return path.startsWith(allowedPath.slice(0, -2))
    }

    return path === allowedPath
  })
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").toLowerCase()
}

function isForbiddenArtifactPath(path: string): boolean {
  const normalizedPath = normalizePath(path)
  return (
    normalizedPath.includes("15139279") ||
    normalizedPath.includes("data/raw/") ||
    normalizedPath.includes("data/external/") ||
    normalizedPath.split("/").includes(".env") ||
    normalizedPath.endsWith(".xlsx") ||
    normalizedPath.endsWith(".csv")
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

function shouldSkipDirectory(name: string): boolean {
  return (
    name === "node_modules" ||
    name.startsWith("node_modules.") ||
    name === "dist" ||
    name === ".git" ||
    name === ".omo" ||
    name === ".ultrawork"
  )
}

function isTextFile(path: string): boolean {
  return TEXT_FILE_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension))
}

function collectFirstPartyFiles(directory: string): readonly string[] {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (entry.isDirectory() && shouldSkipDirectory(entry.name)) {
      continue
    }

    const absolutePath = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...collectFirstPartyFiles(absolutePath))
      continue
    }

    if (entry.isFile() && isTextFile(absolutePath)) {
      files.push(absolutePath)
    }
  }

  return files
}

function hasPrivateAbsolutePath(text: string): boolean {
  const windowsPrivatePath = /[A-Za-z]:[\\/][^\r\n"'`]*?(?:Users|Documents|내 드라이브)[\\/]/u
  const posixPrivatePath = /(?:\/Users\/|\/home\/)[^\s"'`]+/u
  return windowsPrivatePath.test(text) || posixPrivatePath.test(text)
}

function hasKeyLikeAssignment(text: string): boolean {
  const keyAssignment =
    /\b(?:api|service|secret|token|password|credential)[A-Z0-9_-]*\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{12,}/iu
  return keyAssignment.test(text)
}

function scanFirstPartyFiles(failures: Failure[]): void {
  for (const filePath of collectFirstPartyFiles(projectRoot)) {
    const relativePath = relative(projectRoot, filePath).split(sep).join("/")

    if (isForbiddenArtifactPath(relativePath)) {
      addFailure(failures, "forbidden_first_party_path", relativePath)
      continue
    }

    const stats = lstatSync(filePath)
    if (stats.size > 1_000_000) {
      continue
    }

    const text = readFileSync(filePath, "utf8")
    if (hasPrivateAbsolutePath(text)) {
      addFailure(failures, "private_absolute_path", relativePath)
    }

    if (hasKeyLikeAssignment(text)) {
      addFailure(failures, "key_like_assignment", relativePath)
    }
  }
}

function requiredSeedArtifactStatuses(): readonly string[] {
  return REQUIRED_SEED_PACKAGE_FILES.map((path) => {
    const status = existsSync(join(projectRoot, path)) ? "present" : "pending"
    return `${path}: ${status}`
  })
}

function assertRequiredFilesExist(failures: Failure[]): void {
  for (const requiredPath of [...REQUIRED_LICENSE_FILES, ...REQUIRED_SEED_PACKAGE_FILES]) {
    if (!existsSync(join(projectRoot, requiredPath))) {
      addFailure(failures, "required_file_missing", requiredPath)
    }
  }
}

function assertLicensePolicyText(failures: Failure[]): void {
  const dataLicensePath = join(projectRoot, "DATA_LICENSE.md")
  const noticePath = join(projectRoot, "NOTICE.md")
  const seedLicensePath = join(projectRoot, "data/seed/LICENSE.15118998.md")

  if (!existsSync(dataLicensePath) || !existsSync(noticePath) || !existsSync(seedLicensePath)) {
    return
  }

  const combinedText = [dataLicensePath, noticePath, seedLicensePath]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n")

  const requiredSnippets = [
    "15118998",
    "KOGL-1",
    "공공누리 제1유형(출처표시)",
    "15139279",
    "non-bundled / local ingest only",
  ] as const

  for (const snippet of requiredSnippets) {
    if (!combinedText.includes(snippet)) {
      addFailure(failures, "license_policy_text_missing", snippet)
    }
  }
}

function assertRequiredSeedsIncluded(
  failures: Failure[],
  packagePaths: readonly string[],
): void {
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

  for (const seedStatus of requiredSeedArtifactStatuses()) {
    console.log(`seed_artifact: ${seedStatus}`)
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
