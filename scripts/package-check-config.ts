import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

export const REQUIRED_PACKAGE_FILES = [
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

export const IMPLICIT_NPM_FILES = ["package.json", "README.md", "LICENSE"] as const
export const PACKED_RUNTIME_MODULES = [
  "canonical-decimal",
  "catalog",
  "catalog-schema",
  "config/index",
  "database-paths",
  "database-status",
  "explore-universities-handler",
  "freshness-events",
  "index",
  "logging",
  "protocol-transport",
  "release-receipts",
  "repository",
  "repository-db",
  "repository-metrics",
  "repository-schemas",
  "repository-search",
  "repository-types",
  "server",
  "source-tool-handlers",
  "tool-helpers",
  "tool-response",
  "tool-schemas",
  "tools",
  "university-tool-handlers",
] as const
export const PACKED_RUNTIME_EXTENSIONS = [".d.ts", ".d.ts.map", ".js", ".js.map"] as const
export const EXACT_PACKED_PACKAGE_FILES = [
  ...PACKED_RUNTIME_MODULES.flatMap((modulePath) =>
    PACKED_RUNTIME_EXTENSIONS.map((extension) => `dist/src/${modulePath}${extension}`),
  ),
  "dist/scripts/doctor.js",
  "data/seed/academyinfo_15118998.sqlite",
  "data/seed/academyinfo_15118998.manifest.json",
  "data/seed/indicators.json",
  "data/seed/LICENSE.15118998.md",
  "README.md",
  "LICENSE",
  "NOTICE.md",
  "DATA_LICENSE.md",
  "package.json",
] as const
export const REQUIRED_LICENSE_FILES = [
  "LICENSE",
  "DATA_LICENSE.md",
  "NOTICE.md",
  "data/seed/LICENSE.15118998.md",
] as const
export const REQUIRED_SEED_PACKAGE_FILES = [
  "data/seed/academyinfo_15118998.sqlite",
  "data/seed/academyinfo_15118998.manifest.json",
  "data/seed/LICENSE.15118998.md",
] as const

export const REQUIRED_RUNTIME_DATA_PACKAGE_FILES = [
  ...REQUIRED_SEED_PACKAGE_FILES,
  "data/seed/indicators.json",
] as const
export const REQUIRED_RUNTIME_EXECUTABLE_PACKAGE_FILES = [
  "dist/src/index.js",
  "dist/scripts/doctor.js",
] as const

export const SUPPORTED_NODE_RANGE = ">=22 <23" as const
export const SELECTED_DATABASE_BACKEND = "better-sqlite3" as const
export const DATABASE_BACKEND_PACKAGES = ["better-sqlite3", "sql.js"] as const

export const PUBLISHED_DEPENDENCY_IDENTITIES = {
  "@modelcontextprotocol/sdk": {
    version: "1.29.0",
    lockPath: "node_modules/@modelcontextprotocol/sdk",
    resolved: "https://registry.npmjs.org/@modelcontextprotocol/sdk/-/sdk-1.29.0.tgz",
    integrity:
      "sha512-zo37mZA9hJWpULgkRpowewez1y6ML5GsXJPY8FI0tBBCd77HEvza4jDqRKOXgHNn867PVGCyTdzqpz0izu5ZjQ==",
  },
  "better-sqlite3": {
    version: "11.10.0",
    lockPath: "node_modules/better-sqlite3",
    resolved: "https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-11.10.0.tgz",
    integrity:
      "sha512-EwhOpyXiOEL/lKzHz9AW1msWFNzGc/z+LzeB3/jnFJpxu+th2yqvzsSWas1v9jgs9+xiXJcD5A8CJxAG2TaghQ==",
  },
  pino: {
    version: "10.3.1",
    lockPath: "node_modules/pino",
    resolved: "https://registry.npmjs.org/pino/-/pino-10.3.1.tgz",
    integrity:
      "sha512-r34yH/GlQpKZbU1BvFFqOjhISRo1MNx1tWYsYvmj6KIRHSPMT2+yHOEb1SG6NMvRoHRF0a07kCOox/9yakl1vg==",
  },
  zod: {
    version: "4.4.3",
    lockPath: "node_modules/zod",
    resolved: "https://registry.npmjs.org/zod/-/zod-4.4.3.tgz",
    integrity:
      "sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ==",
  },
} as const
export const PUBLISHED_DEPENDENCY_NAMES = Object.keys(PUBLISHED_DEPENDENCY_IDENTITIES).sort()
export const TEXT_FILE_EXTENSIONS = [
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".jsonl",
  ".map",
  ".md",
  ".mjs",
  ".mts",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
] as const

export type Failure = {
  readonly code: string
  readonly detail: string
}

export type PackFile = {
  readonly path: string
}

export type PackResult = {
  readonly files: readonly PackFile[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function dependencyLockPaths(packages: Record<string, unknown>, dependencyName: string): string[] {
  const suffix = `/node_modules/${dependencyName}`
  return Object.keys(packages).filter(
    (path) => path === `node_modules/${dependencyName}` || path.endsWith(suffix),
  )
}

export function hasExactPackageFilesAllowlist(packageJson: Record<string, unknown>): boolean {
  const files = packageJson["files"]
  return (
    Array.isArray(files) &&
    files.length === REQUIRED_PACKAGE_FILES.length &&
    files.every((entry, index) => entry === REQUIRED_PACKAGE_FILES[index])
  )
}

export function hasExactPackedPackagePaths(packagePaths: readonly string[]): boolean {
  const actual = [...packagePaths].sort()
  const expected = [...EXACT_PACKED_PACKAGE_FILES].sort()
  return (
    actual.length === expected.length &&
    actual.every((packagePath, index) => packagePath === expected[index])
  )
}

export function collectPackageContractFailures(
  packageJsonValue: unknown,
  packageLockValue: unknown,
): Failure[] {
  const failures: Failure[] = []

  if (!isRecord(packageJsonValue)) {
    addFailure(failures, "package_json_shape", "package.json must contain an object")
    return failures
  }

  if (!isRecord(packageLockValue)) {
    addFailure(failures, "package_lock_shape", "package-lock.json must contain an object")
    return failures
  }

  const packageJson = packageJsonValue
  const packageLock = packageLockValue
  const dependencies = isRecord(packageJson["dependencies"]) ? packageJson["dependencies"] : {}
  const engines = isRecord(packageJson["engines"]) ? packageJson["engines"] : {}
  const lockPackages = isRecord(packageLock["packages"]) ? packageLock["packages"] : {}
  const lockRoot = isRecord(lockPackages[""]) ? lockPackages[""] : {}
  const lockRootDependencies = isRecord(lockRoot["dependencies"])
    ? lockRoot["dependencies"]
    : {}
  const lockRootEngines = isRecord(lockRoot["engines"]) ? lockRoot["engines"] : {}
  const bin = isRecord(packageJson["bin"]) ? packageJson["bin"] : {}
  const lockRootBin = isRecord(lockRoot["bin"]) ? lockRoot["bin"] : {}

  if (packageJson["name"] !== "academyinfo-mcp") {
    addFailure(failures, "package_identity", "package.json name must be academyinfo-mcp")
  }

  if (
    !hasExactPackageFilesAllowlist(packageJson) ||
    Object.keys(bin).length !== 1 ||
    bin["academyinfo-mcp"] !== "dist/src/index.js" ||
    Object.keys(lockRootBin).length !== 1 ||
    lockRootBin["academyinfo-mcp"] !== "dist/src/index.js"
  ) {
    addFailure(
      failures,
      "package_paths_contract",
      "package allowlist and academyinfo-mcp dist/src/index.js bin must be exact",
    )
  }
  if (packageJson["main"] !== undefined || lockRoot["main"] !== undefined) {
    addFailure(
      failures,
      "package_main_contract",
      "CLI-only package and lock root must not declare main",
    )
  }

  if (
    packageLock["lockfileVersion"] !== 3 ||
    packageLock["requires"] !== true ||
    packageJson["workspaces"] !== undefined ||
    packageJson["overrides"] !== undefined
  ) {
    addFailure(
      failures,
      "package_lock_format",
      "lockfileVersion 3 is required and workspace/override resolution is forbidden",
    )
  }

  if (
    packageLock["name"] !== packageJson["name"] ||
    packageLock["version"] !== packageJson["version"] ||
    lockRoot["name"] !== packageJson["name"] ||
    lockRoot["version"] !== packageJson["version"]
  ) {
    addFailure(failures, "package_lock_root_identity", "package and lock root identities differ")
  }

  if (engines["node"] !== SUPPORTED_NODE_RANGE || lockRootEngines["node"] !== SUPPORTED_NODE_RANGE) {
    addFailure(
      failures,
      "node_engine_contract",
      `package and lock root engines.node must be ${SUPPORTED_NODE_RANGE}`,
    )
  }

  const publishedDependencyNames = PUBLISHED_DEPENDENCY_NAMES
  const packageDependencyNames = Object.keys(dependencies).sort()
  const lockRootDependencyNames = Object.keys(lockRootDependencies).sort()
  if (
    JSON.stringify(packageDependencyNames) !== JSON.stringify(publishedDependencyNames) ||
    JSON.stringify(lockRootDependencyNames) !== JSON.stringify(publishedDependencyNames)
  ) {
    addFailure(
      failures,
      "published_dependency_keys",
      "package and lock root direct dependency keys must equal the published dependency contract",
    )
  }
  for (const [dependencyName, identity] of Object.entries(PUBLISHED_DEPENDENCY_IDENTITIES)) {
    if (
      dependencies[dependencyName] !== identity.version ||
      lockRootDependencies[dependencyName] !== identity.version
    ) {
      addFailure(
        failures,
        "published_dependency_spec",
        `${dependencyName} must be exactly ${identity.version} in package and lock root`,
      )
    }

    const matchingLockPaths = dependencyLockPaths(lockPackages, dependencyName)
    if (
      matchingLockPaths.length !== 1 ||
      matchingLockPaths[0] !== identity.lockPath
    ) {
      addFailure(
        failures,
        "published_dependency_copies",
        `${dependencyName} must have exactly one root installed lock identity`,
      )
      continue
    }

    const lockEntry = lockPackages[identity.lockPath]
    if (
      !isRecord(lockEntry) ||
      lockEntry["version"] !== identity.version ||
      lockEntry["resolved"] !== identity.resolved ||
      lockEntry["integrity"] !== identity.integrity
    ) {
      addFailure(
        failures,
        "published_dependency_lock_identity",
        `${dependencyName} lock version, registry URL, or integrity differs`,
      )
    }
  }

  const selectedPackageBackends = DATABASE_BACKEND_PACKAGES.filter(
    (dependencyName) => dependencies[dependencyName] !== undefined,
  )
  const selectedLockBackends = DATABASE_BACKEND_PACKAGES.filter(
    (dependencyName) => lockRootDependencies[dependencyName] !== undefined,
  )
  const installedLockBackends = DATABASE_BACKEND_PACKAGES.filter(
    (dependencyName) => dependencyLockPaths(lockPackages, dependencyName).length > 0,
  )
  if (
    selectedPackageBackends.length !== 1 ||
    selectedPackageBackends[0] !== SELECTED_DATABASE_BACKEND ||
    selectedLockBackends.length !== 1 ||
    selectedLockBackends[0] !== SELECTED_DATABASE_BACKEND ||
    installedLockBackends.length !== 1 ||
    installedLockBackends[0] !== SELECTED_DATABASE_BACKEND ||
    lockRootDependencies[SELECTED_DATABASE_BACKEND] !==
      dependencies[SELECTED_DATABASE_BACKEND] ||
    !isRecord(lockPackages[`node_modules/${SELECTED_DATABASE_BACKEND}`])
  ) {
    addFailure(
      failures,
      "database_backend_contract",
      `package and lock must select only provisional backend ${SELECTED_DATABASE_BACKEND}`,
    )
  }

  return failures
}

function findProjectRoot(startDirectory: string): string {
  let current = resolve(startDirectory)

  while (!existsSync(join(current, "package.json"))) {
    const parent = dirname(current)

    if (parent === current) {
      throw new Error("Could not locate project root package.json.")
    }

    current = parent
  }

  return current
}

export const projectRoot = findProjectRoot(dirname(fileURLToPath(import.meta.url)))

export function addFailure(failures: Failure[], code: string, detail: string): void {
  failures.push({ code, detail })
}
