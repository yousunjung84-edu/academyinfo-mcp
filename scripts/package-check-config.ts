import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

export const REQUIRED_PACKAGE_FILES = [
  "dist/**",
  "data/seed/academyinfo_15118998.sqlite",
  "data/seed/academyinfo_15118998.manifest.json",
  "data/seed/LICENSE.15118998.md",
  "README.md",
  "LICENSE",
  "NOTICE.md",
  "DATA_LICENSE.md",
] as const

export const IMPLICIT_NPM_FILES = ["package.json", "README.md", "LICENSE"] as const
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
