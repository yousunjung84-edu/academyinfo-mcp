import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

import type { RepositoryResult } from "./repository-types.js"

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

function defaultDbPath(): string {
  const projectRoot = findProjectRoot(dirname(fileURLToPath(import.meta.url)))
  return join(projectRoot, "data", "seed", "academyinfo_15118998.sqlite")
}

function configuredDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env["ACADEMYINFO_DB_PATH"]?.trim()
  return configured === undefined || configured.length === 0 ? defaultDbPath() : configured
}

function sqlitePath(path: string): string {
  const resolved = resolve(path)
  return process.platform === "win32" && !resolved.startsWith("\\\\?\\")
    ? `\\\\?\\${resolved}`
    : resolved
}

export function openDatabase(): RepositoryResult<DatabaseSync> {
  const path = configuredDbPath()

  if (!existsSync(path)) {
    return {
      ok: false,
      code: "missing_db",
      data: {
        error: {
          code: "missing_db",
          message: "Configured database file was not found.",
          configured_database: "missing",
        },
      },
    }
  }

  return { ok: true, value: new DatabaseSync(sqlitePath(path), { readOnly: true }) }
}
