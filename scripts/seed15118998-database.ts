import { copyFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"

import {
  datasetId,
  datasetName,
  indicatorSpecs,
  institutionColumns,
  license,
  provider,
  seedDbPath,
  sourceFileName,
  sourceUrl,
  type ObservationCountMap,
} from "./seed15118998-config.js"
import { createSchema } from "./seed15118998-schema.js"
import { assertAllDefaultIndicatorsMapped } from "./seed15118998-validate.js"
import { debugStep, ensureParent, sqlitePath } from "./seed15118998-utils.js"
import type { XlsxRow } from "./xlsx.js"

function headerIndex(headers: readonly string[], header: string): number {
  const index = headers.findIndex((candidate) => candidate === header)

  if (index < 0) {
    throw new Error(`Required header missing: ${header}.`)
  }

  return index
}

export function rowObject(headers: readonly string[], row: XlsxRow): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [header, row.values[index] ?? ""]))
}

function cell(row: XlsxRow, index: number): string {
  return row.values[index]?.trim() ?? ""
}

function numericValue(rawValue: string): number | null {
  const normalized = rawValue.replaceAll(",", "").trim()

  if (normalized.length === 0) {
    return null
  }

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export function buildSeedDatabase(
  headers: readonly string[],
  rows: readonly XlsxRow[],
  indicatorColumns: ReadonlyMap<string, number>,
  sourceChecksum: string,
  headerSnapshotChecksum: string,
): ObservationCountMap {
  ensureParent(seedDbPath)
  const tempDirectory = mkdtempSync(join(tmpdir(), "academyinfo-15118998-"))
  const tempSeedDbPath = join(tempDirectory, "academyinfo_15118998.sqlite")
  const db = new Database(sqlitePath(tempSeedDbPath))
  const counts = Object.fromEntries(indicatorSpecs.map((spec) => [spec.indicator_id, 0]))

  try {
    createSchema(db)
    db.exec("BEGIN")
    const sourceId = insertSourceFile(db, sourceChecksum, headerSnapshotChecksum)
    const statements = prepareInsertStatements(db)
    const columnIndexes = institutionColumnIndexes(headers)

    debugStep(`inserting ${rows.length} raw rows and observations`)
    for (const row of rows) {
      insertSeedRow(headers, row, sourceId, columnIndexes, indicatorColumns, counts, statements)
    }

    db.prepare(
      "INSERT INTO join_audits (audit_type, status, detail) VALUES (?, ?, ?)",
    ).run("15118998_seed_build", "ok", "Raw rows and default observations mapped without external joins.")
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  } finally {
    db.close()
  }

  assertAllDefaultIndicatorsMapped(counts)
  copyFileSync(tempSeedDbPath, seedDbPath)
  rmSync(tempDirectory, { recursive: true, force: true })
  return counts
}

function insertSourceFile(
  db: Database.Database,
  sourceChecksum: string,
  headerSnapshotChecksum: string,
): number {
  return Number(
    db.prepare(
      `INSERT INTO source_files (
        dataset_id, dataset_name, provider, source_url, license, source_file_name,
        source_file_checksum_sha256, header_snapshot_checksum_sha256, bundled,
        derived_database, observed_at, source_file_private_path_excluded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 1)`,
    ).run(
      datasetId,
      datasetName,
      provider,
      sourceUrl,
      license,
      sourceFileName,
      sourceChecksum,
      headerSnapshotChecksum,
      new Date().toISOString(),
    ).lastInsertRowid,
  )
}

type InsertStatements = ReturnType<typeof prepareInsertStatements>

function prepareInsertStatements(db: Database.Database) {
  const institutionInsert = db.prepare(
    `INSERT INTO institutions (
      school_name, campus_name, school_kind, school_type, establishment_type, region_name
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const rawRowInsert = db.prepare(
    "INSERT INTO raw_rows (source_file_id, row_number, row_json) VALUES (?, ?, ?)",
  )
  const observationInsert = db.prepare(
    `INSERT INTO observations (
      institution_id, indicator_id, source_file_id, raw_row_id, value, raw_value,
      year, unit, source_column
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const indicatorInsert = db.prepare(
    `INSERT INTO indicators (
      indicator_id, label_ko, source_dataset_id, source_column, source_column_verified,
      year, unit, enabled_by_default, note
    ) VALUES (?, ?, ?, ?, 1, ?, ?, 1, ?)`,
  )

  for (const spec of indicatorSpecs) {
    indicatorInsert.run(
      spec.indicator_id,
      spec.label_ko,
      datasetId,
      spec.source_column,
      spec.year,
      spec.unit,
      spec.note ?? null,
    )
  }

  return { institutionInsert, rawRowInsert, observationInsert }
}

type InstitutionColumnIndexes = ReturnType<typeof institutionColumnIndexes>

function institutionColumnIndexes(headers: readonly string[]) {
  return {
    schoolName: headerIndex(headers, institutionColumns.schoolName),
    campusName: headerIndex(headers, institutionColumns.campusName),
    schoolKind: headerIndex(headers, institutionColumns.schoolKind),
    schoolType: headerIndex(headers, institutionColumns.schoolType),
    establishmentType: headerIndex(headers, institutionColumns.establishmentType),
    regionName: headerIndex(headers, institutionColumns.regionName),
  }
}

function insertSeedRow(
  headers: readonly string[],
  row: XlsxRow,
  sourceId: number,
  columnIndexes: InstitutionColumnIndexes,
  indicatorColumns: ReadonlyMap<string, number>,
  counts: Record<string, number>,
  statements: InsertStatements,
): void {
  const schoolName = cell(row, columnIndexes.schoolName)

  if (schoolName.length === 0) {
    return
  }

  const institutionId = Number(
    statements.institutionInsert.run(
      schoolName,
      cell(row, columnIndexes.campusName),
      cell(row, columnIndexes.schoolKind),
      cell(row, columnIndexes.schoolType),
      cell(row, columnIndexes.establishmentType),
      cell(row, columnIndexes.regionName),
    ).lastInsertRowid,
  )
  const rawRowId = Number(
    statements.rawRowInsert.run(sourceId, row.rowNumber, JSON.stringify(rowObject(headers, row)))
      .lastInsertRowid,
  )

  for (const spec of indicatorSpecs) {
    const index = indicatorColumns.get(spec.indicator_id)

    if (index === undefined) {
      throw new Error(`Internal mapping missing for ${spec.indicator_id}.`)
    }

    const rawValue = cell(row, index)
    const value = numericValue(rawValue)

    if (value === null) {
      continue
    }

    statements.observationInsert.run(
      institutionId,
      spec.indicator_id,
      sourceId,
      rawRowId,
      value,
      rawValue,
      spec.year,
      spec.unit,
      spec.source_column,
    )
    counts[spec.indicator_id] = (counts[spec.indicator_id] ?? 0) + 1
  }
}
