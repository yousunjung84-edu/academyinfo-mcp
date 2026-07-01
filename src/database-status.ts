import { existsSync } from "node:fs"

export type DatabaseStatus =
  | { readonly kind: "bundled_seed" }
  | { readonly kind: "configured_present" }
  | { readonly kind: "missing" }

export function getDatabaseStatus(env: NodeJS.ProcessEnv = process.env): DatabaseStatus {
  const configuredPath = env["ACADEMYINFO_DB_PATH"]?.trim()

  if (configuredPath === undefined || configuredPath.length === 0) {
    return { kind: "bundled_seed" }
  }

  if (existsSync(configuredPath)) {
    return { kind: "configured_present" }
  }

  return { kind: "missing" }
}
