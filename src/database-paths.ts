import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function findProjectRoot(startDirectory: string): string {
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

export function bundledSeedDatabasePath(): string {
  const projectRoot = findProjectRoot(dirname(fileURLToPath(import.meta.url)))
  return join(projectRoot, "data", "seed", "academyinfo_15118998.sqlite")
}

export function configuredDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env["ACADEMYINFO_DB_PATH"]?.trim()
  return configured === undefined || configured.length === 0 ? bundledSeedDatabasePath() : configured
}

export function sqlitePath(path: string): string {
  const resolved = resolve(path)
  return process.platform === "win32" && !resolved.startsWith("\\\\?\\")
    ? `\\\\?\\${resolved}`
    : resolved
}
