import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import Database from "better-sqlite3"
import { z } from "zod"

import {
  expectedSheetName,
  headerSnapshotPath,
  manifestPath,
  seedDbPath,
} from "./seed15118998-config.js"
import { buildSeed15118998FromSheet } from "./seed15118998.js"
import { sqlitePath } from "./seed15118998-utils.js"
import type { XlsxCell, XlsxRow, XlsxSheet } from "./xlsx.js"

/**
 * Rebuilds the seed artifacts from the raw cells already preserved inside the
 * bundled seed database, for expansion cycles where the original workbook file
 * is no longer on disk. Every value comes from `raw_rows` rows that were
 * indexed and checksummed against the original download; nothing is inferred
 * or re-downloaded, and the recorded source checksum is carried forward after
 * being cross-checked against the header-snapshot evidence.
 */

const headerSnapshotSchema = z.object({
  dataset_id: z.string().min(1),
  sheet_name: z.string().min(1),
  source_file_checksum_sha256: z.string().length(64),
  columns: z.array(z.object({ raw_header: z.string().min(1) })).min(1),
})

const sourceFileRowSchema = z.object({
  source_file_checksum_sha256: z.string().length(64),
})

const rawRowSchema = z.object({
  row_number: z.number().int().positive(),
  row_json: z.string().min(2),
})

function columnReference(columnIndex: number, worksheetRow: number): string {
  let value = columnIndex + 1
  let letters = ""

  while (value > 0) {
    const remainder = (value - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    value = Math.floor((value - 1) / 26)
  }

  return `${letters}${worksheetRow}`
}

function reconstructedRow(
  headers: readonly string[],
  rowNumber: number,
  rowJsonText: string,
): XlsxRow {
  const parsed: unknown = JSON.parse(rowJsonText)
  const record = z.record(z.string(), z.string()).parse(parsed)
  const recordKeys = Object.keys(record)

  if (
    recordKeys.length !== headers.length ||
    headers.some((header) => !(header in record))
  ) {
    throw new Error(
      `NO-GO: bundled raw row ${rowNumber} keys do not match the header snapshot exactly.`,
    )
  }

  const values = headers.map((header) => record[header] ?? "")
  const cells: XlsxCell[] = values.map((rawText, columnIndex) => ({
    worksheet_row: rowNumber,
    column_index: columnIndex,
    column_ref: columnReference(columnIndex, rowNumber),
    raw_text: rawText,
  }))

  return { rowNumber, values, cells }
}

export function rebuildSeed15118998FromBundled(): void {
  const snapshot = headerSnapshotSchema.parse(
    JSON.parse(readFileSync(headerSnapshotPath, "utf8")),
  )

  if (snapshot.sheet_name !== expectedSheetName) {
    throw new Error(
      `NO-GO: header snapshot sheet ${snapshot.sheet_name} differs from expected ${expectedSheetName}.`,
    )
  }

  const headers = snapshot.columns.map((column) => column.raw_header)

  const db = new Database(sqlitePath(seedDbPath), { readonly: true })
  let sourceChecksum: string
  let storedRows: readonly z.infer<typeof rawRowSchema>[]
  try {
    const sourceRows = db
      .prepare("SELECT source_file_checksum_sha256 FROM source_files")
      .all()
    if (sourceRows.length !== 1) {
      throw new Error(
        `NO-GO: bundled seed must contain exactly one source_files row; found ${sourceRows.length}.`,
      )
    }
    sourceChecksum = sourceFileRowSchema.parse(sourceRows[0]).source_file_checksum_sha256

    storedRows = db
      .prepare("SELECT row_number, row_json FROM raw_rows ORDER BY row_number")
      .all()
      .map((row) => rawRowSchema.parse(row))
  } finally {
    db.close()
  }

  if (sourceChecksum !== snapshot.source_file_checksum_sha256) {
    throw new Error(
      "NO-GO: bundled seed source checksum and header-snapshot evidence diverge.",
    )
  }

  if (storedRows.length === 0) {
    throw new Error("NO-GO: bundled seed contains no raw rows to rebuild from.")
  }

  const headerRowNumber = 1
  const indexedHeaders: XlsxCell[] = headers.map((rawText, columnIndex) => ({
    worksheet_row: headerRowNumber,
    column_index: columnIndex,
    column_ref: columnReference(columnIndex, headerRowNumber),
    raw_text: rawText,
  }))

  const rows = storedRows.map((row) => reconstructedRow(headers, row.row_number, row.row_json))
  const lastRowNumber = rows.at(-1)?.rowNumber ?? headerRowNumber
  const sheet: XlsxSheet = {
    sheetName: expectedSheetName,
    headerRowNumber,
    headers,
    indexedHeaders,
    rows,
    blankRowsIgnored: lastRowNumber - rows.length - 1,
  }

  // The original download time is a recorded fact about the preserved source;
  // carry it forward instead of stat-ing the absent workbook.
  const priorManifest = z
    .object({ source_downloaded_at: z.string().min(1) })
    .parse(JSON.parse(readFileSync(manifestPath, "utf8")))

  buildSeed15118998FromSheet(sheet, sourceChecksum, priorManifest.source_downloaded_at)
}

const entryPointPath = process.argv[1]

if (entryPointPath !== undefined && fileURLToPath(import.meta.url) === entryPointPath) {
  rebuildSeed15118998FromBundled()
  process.stderr.write("seed15118998-rebuild-from-bundled: ok\n")
}
