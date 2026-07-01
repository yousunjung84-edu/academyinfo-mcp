import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

import type { ParsedHeader } from "./seed15118998-config.js"

export function sha256Bytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path))
}

export function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
}

export function sqlitePath(path: string): string {
  const resolved = resolve(path)
  return process.platform === "win32" && !resolved.startsWith("\\\\?\\")
    ? `\\\\?\\${resolved}`
    : resolved
}

export function writeJson(path: string, value: unknown): void {
  ensureParent(path)
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

export function debugStep(message: string): void {
  if (process.env["SEED15118998_DEBUG"] === "1") {
    process.stderr.write(`seed15118998: ${message}\n`)
  }
}

export function parseHeader(rawHeader: string): ParsedHeader {
  const match = /^(?<label>.+)\r?\n\((?<year>\d{4}),(?<unit>[^)]+)\)$/u.exec(rawHeader)

  return {
    raw_header: rawHeader,
    parsed_label: match?.groups?.["label"] ?? rawHeader,
    parsed_year: match?.groups?.["year"] === undefined ? null : Number(match.groups["year"]),
    parsed_unit: match?.groups?.["unit"] ?? null,
    checksum_sha256: sha256Bytes(rawHeader),
  }
}
