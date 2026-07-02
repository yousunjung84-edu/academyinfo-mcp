import { existsSync } from "node:fs"
import Database from "better-sqlite3"

import { configuredDatabasePath, sqlitePath } from "./database-paths.js"
import type { RepositoryResult } from "./repository-types.js"

export type SqliteDatabase = Database.Database

export function openDatabase(): RepositoryResult<SqliteDatabase> {
  const path = configuredDatabasePath()

  if (!existsSync(path)) {
    return {
      ok: false,
      code: "missing_db",
      data: {
        error: {
          code: "missing_db",
          message: "Local database file was not found.",
          configured_database: "missing",
        },
      },
    }
  }

  try {
    return { ok: true, value: new Database(sqlitePath(path), { readonly: true, fileMustExist: true }) }
  } catch (error) {
    return repositoryDatabaseError(error)
  }
}

export function repositoryDatabaseError<T>(error: unknown): RepositoryResult<T> {
  if (error instanceof Error) {
    return databaseErrorResult()
  }

  return databaseErrorResult()
}

function databaseErrorResult<T>(): RepositoryResult<T> {
  return {
    ok: false,
    code: "database_error",
    data: {
      error: {
        code: "database_error",
        message: "Local database could not be read.",
      },
    },
  }
}
