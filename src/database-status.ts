import { existsSync } from "node:fs"

import { bundledSeedDatabasePath } from "./database-paths.js"

export type DatabaseStatus =
  | { readonly kind: "bundled_seed" }
  | { readonly kind: "configured_present" }
  | { readonly kind: "missing" }

type DatabaseStatusOptions = {
  readonly bundledSeedPath?: string
}

export function getDatabaseStatus(
  env: NodeJS.ProcessEnv = process.env,
  options: DatabaseStatusOptions = {},
): DatabaseStatus {
  const configuredPath = env["ACADEMYINFO_DB_PATH"]?.trim()

  if (configuredPath === undefined || configuredPath.length === 0) {
    return existsSync(options.bundledSeedPath ?? bundledSeedDatabasePath())
      ? { kind: "bundled_seed" }
      : { kind: "missing" }
  }

  if (existsSync(configuredPath)) {
    return { kind: "configured_present" }
  }

  return { kind: "missing" }
}
