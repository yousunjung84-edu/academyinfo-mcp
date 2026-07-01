declare module "better-sqlite3" {
  export type SqliteValue = string | number | bigint | Buffer | null

  export type RunResult = {
    readonly changes: number
    readonly lastInsertRowid: number | bigint
  }

  export type DatabaseOptions = {
    readonly readonly?: boolean
    readonly fileMustExist?: boolean
  }

  export type Statement<Result extends Record<string, unknown> = Record<string, unknown>> = {
    readonly run: (...params: readonly SqliteValue[]) => RunResult
    readonly get: (...params: readonly SqliteValue[]) => Result | undefined
    readonly all: (...params: readonly SqliteValue[]) => readonly Result[]
  }

  export default class Database {
    constructor(filename: string, options?: DatabaseOptions)
    readonly exec: (source: string) => Database
    readonly prepare: <Result extends Record<string, unknown> = Record<string, unknown>>(
      source: string,
    ) => Statement<Result>
    readonly close: () => void
  }
}
