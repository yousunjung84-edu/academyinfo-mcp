import { copyFileSync, mkdtempSync, renameSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
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
import {
  assertAllDefaultIndicatorsMapped,
  assertExactRowCoverage,
  classifyDecimalCell,
  normalizeHeaderForMatch,
  parseDecimalCell,
} from "./seed15118998-validate.js"
import { debugStep, ensureParent, parseHeader, sqlitePath } from "./seed15118998-utils.js"
import { worksheetBlankV1, type XlsxCell, type XlsxRow } from "./xlsx.js"

function headerIndex(headers: readonly string[], header: string): number {
  const indexes = headers
    .map((candidate, index) => normalizeHeaderForMatch(candidate) === header ? index : -1)
    .filter((index) => index >= 0)

  if (indexes.length !== 1) {
    throw new Error(`Required header must map exactly once: ${header}; found ${indexes.length}.`)
  }

  return indexes[0] as number
}

export function rowObject(headers: readonly string[], row: XlsxRow): Record<string, string> {
  const normalized = new Set<string>()
  for (const header of headers) {
    const matchHeader = normalizeHeaderForMatch(header)
    if (worksheetBlankV1(matchHeader) || normalized.has(matchHeader)) {
      throw new Error(`NO-GO: blank or duplicate header cannot be projected to row JSON.`)
    }
    normalized.add(matchHeader)
  }
  const cells = indexedCells(row)
  return Object.fromEntries(headers.map((header, index) => [header, rawCell(cells, index)]))
}

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

function indexedCells(row: XlsxRow): ReadonlyMap<number, XlsxCell> {
  if (!Number.isSafeInteger(row.rowNumber) || row.rowNumber <= 0) {
    throw new Error(`NO-GO: invalid source worksheet row ${row.rowNumber}.`)
  }

  const cells = new Map<number, XlsxCell>()
  for (const cell of row.cells) {
    if (
      cell.worksheet_row !== row.rowNumber ||
      !Number.isSafeInteger(cell.column_index) ||
      cell.column_index < 0 ||
      cell.column_ref !== columnReference(cell.column_index, row.rowNumber) ||
      cells.has(cell.column_index)
    ) {
      throw new Error(
        `NO-GO: invalid, duplicate, or mismatched indexed cell in worksheet row ${row.rowNumber}.`,
      )
    }
    cells.set(cell.column_index, cell)
  }
  return cells
}

function rawCell(
  cells: ReadonlyMap<number, { readonly raw_text: string }>,
  index: number,
): string {
  const cell = cells.get(index)
  if (cell === undefined) {
    throw new Error(`NO-GO: required indexed worksheet cell ${index} is missing.`)
  }
  return cell.raw_text
}

function identityCell(
  cells: ReadonlyMap<number, { readonly raw_text: string }>,
  index: number,
): string {
  return rawCell(cells, index)
}

function rawCellsJson(cells: ReadonlyMap<number, XlsxCell>): string {
  return JSON.stringify(
    [...cells.values()]
      .sort((left, right) => left.column_index - right.column_index)
      .map((cell) => ({
        worksheet_row: cell.worksheet_row,
        column_index: cell.column_index,
        column_ref: cell.column_ref,
        raw_text: cell.raw_text,
      })),
  )
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
  let stagingDirectory: string | null = null

  try {
    const db = new Database(sqlitePath(tempSeedDbPath))
    const counts = Object.fromEntries(indicatorSpecs.map((spec) => [spec.indicator_id, 0]))
    let databaseError: unknown = undefined

    try {
      createSchema(db)
      db.exec("BEGIN")
      const sourceId = insertSourceFile(db, sourceChecksum, headerSnapshotChecksum)
      const mappedIndicators = mappedIndicatorSpecs(headers, indicatorColumns)
      const statements = prepareInsertStatements(db, mappedIndicators)
      const columnIndexes = institutionColumnIndexes(headers)
      const sourceRowNumbers = new Set<number>()
      const naturalKeys = new Set<string>()
      const coverage = {
        source_rows: rows.length,
        raw_rows: 0,
        institutions: 0,
        classifications: 0,
      }

      debugStep(`inserting ${rows.length} raw rows and observations`)
      for (const row of rows) {
        if (sourceRowNumbers.has(row.rowNumber)) {
          throw new Error(`NO-GO: duplicate source worksheet row ${row.rowNumber}.`)
        }
        sourceRowNumbers.add(row.rowNumber)

        const inserted = insertSeedRow(
          headers,
          row,
          sourceId,
          columnIndexes,
          mappedIndicators,
          counts,
          statements,
          naturalKeys,
        )
        coverage.raw_rows += inserted.rawRows
        coverage.institutions += inserted.institutions
        coverage.classifications += inserted.classifications
      }
      assertExactRowCoverage(coverage)
      assertStoredCanonicalValues(db)

      db.prepare(
        "INSERT INTO join_audits (audit_type, status, detail) VALUES (?, ?, ?)",
      ).run("15118998_seed_build", "ok", "Raw rows and default observations mapped without external joins.")
      db.exec("COMMIT")
    } catch (error) {
      databaseError = error
      if (db.inTransaction) {
        try {
          db.exec("ROLLBACK")
        } catch {
          // Preserve the original seed-build failure.
        }
      }
      throw error
    } finally {
      try {
        db.close()
      } catch (error) {
        if (databaseError === undefined) throw error
      }
    }

    assertAllDefaultIndicatorsMapped(counts)
    stagingDirectory = mkdtempSync(
      join(dirname(seedDbPath), `.${basename(seedDbPath)}-`),
    )
    const stagedSeedDbPath = join(stagingDirectory, basename(seedDbPath))
    copyFileSync(tempSeedDbPath, stagedSeedDbPath)
    renameSync(stagedSeedDbPath, seedDbPath)
    return counts
  } finally {
    for (const directory of [stagingDirectory, tempDirectory]) {
      if (directory === null) continue
      try {
        rmSync(directory, { recursive: true, force: true })
      } catch {
        // Cleanup must not replace the seed-build or publication error.
      }
    }
  }
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


function assertIndicatorColumnMappings(indicatorColumns: ReadonlyMap<string, number>): void {
  const indexes = new Set<number>()
  for (const spec of indicatorSpecs) {
    const index = indicatorColumns.get(spec.indicator_id)
    if (index === undefined || indexes.has(index)) {
      throw new Error(`NO-GO: indicator mapping is missing or reused for ${spec.indicator_id}.`)
    }
    indexes.add(index)
  }
}
type MappedIndicator = (typeof indicatorSpecs)[number] & {
  readonly column_index: number
}

function mappedIndicatorSpecs(
  headers: readonly string[],
  indicatorColumns: ReadonlyMap<string, number>,
): readonly MappedIndicator[] {
  assertIndicatorColumnMappings(indicatorColumns)

  return indicatorSpecs.map((spec) => {
    const columnIndex = indicatorColumns.get(spec.indicator_id)
    if (columnIndex === undefined) {
      throw new Error(`NO-GO: missing indicator mapping for ${spec.indicator_id}.`)
    }

    const sourceColumn = normalizeHeaderForMatch(headers[columnIndex] ?? "")
    const parsed = parseHeader(sourceColumn)
    if (
      parsed.parsed_label !== spec.label_ko ||
      parsed.parsed_year === null ||
      parsed.parsed_year < spec.year ||
      parsed.parsed_unit !== spec.unit
    ) {
      throw new Error(`NO-GO: unverified mapped indicator semantics for ${spec.indicator_id}.`)
    }

    return {
      ...spec,
      source_column: sourceColumn,
      year: parsed.parsed_year,
      column_index: columnIndex,
    }
  })
}

function assertStoredCanonicalValues(db: Database.Database): void {
  const rows = db.prepare(
    "SELECT canonical_value, value FROM observations ORDER BY id",
  ).all() as Array<{ readonly canonical_value: string; readonly value: number }>

  for (const row of rows) {
    const parsed = parseDecimalCell(row.canonical_value)
    if (
      parsed.kind !== "numeric" ||
      parsed.canonical_value !== row.canonical_value ||
      parsed.value !== row.value
    ) {
      throw new Error(
        `NO-GO: SQLite REAL/canonical decimal mismatch for ${JSON.stringify(row.canonical_value)}.`,
      )
    }
  }
}

type InsertStatements = ReturnType<typeof prepareInsertStatements>

function prepareInsertStatements(
  db: Database.Database,
  mappedIndicators: readonly MappedIndicator[],
) {
  const institutionInsert = db.prepare(
    `INSERT INTO institutions (
      school_name, campus_name, school_kind, school_type, establishment_type, region_name
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const rawRowInsert = db.prepare(
    `INSERT INTO raw_rows (
      source_file_id, row_number, row_json, raw_cells_json
    ) VALUES (?, ?, ?, ?)`,
  )
  const observationInsert = db.prepare(
    `INSERT INTO observations (
      institution_id, indicator_id, source_file_id, raw_row_id, value, raw_value,
      year, unit, source_column, canonical_value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const classificationInsert = db.prepare(
    `INSERT INTO observation_classifications (
      raw_row_id, institution_id, indicator_id, raw_text, classification,
      missing_marker, canonical_value, value
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const indicatorInsert = db.prepare(
    `INSERT INTO indicators (
      indicator_id, label_ko, source_dataset_id, source_column, source_column_verified,
      year, unit, enabled_by_default, note
    ) VALUES (?, ?, ?, ?, 1, ?, ?, 1, ?)`,
  )

  for (const spec of mappedIndicators) {
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

  return { institutionInsert, rawRowInsert, observationInsert, classificationInsert }
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
  mappedIndicators: readonly MappedIndicator[],
  counts: Record<string, number>,
  statements: InsertStatements,
  naturalKeys: Set<string>,
): { readonly rawRows: number; readonly institutions: number; readonly classifications: number } {
  const cells = indexedCells(row)
  if (row.cells.every((candidate) => worksheetBlankV1(candidate))) {
    throw new Error(`NO-GO: blank worksheet row ${row.rowNumber} reached source-row mapping.`)
  }

  const beyondHeader = [...cells.values()].find(
    (candidate) => candidate.column_index >= headers.length && !worksheetBlankV1(candidate),
  )
  if (beyondHeader !== undefined) {
    throw new Error(`NO-GO: nonblank cell ${beyondHeader.column_ref} is beyond header width.`)
  }

  const schoolName = identityCell(cells, columnIndexes.schoolName)
  const campusName = identityCell(cells, columnIndexes.campusName)
  if (worksheetBlankV1(schoolName) || worksheetBlankV1(campusName)) {
    throw new Error(
      `NO-GO: worksheet row ${row.rowNumber} has a blank (학교명, 본분교명) natural key.`,
    )
  }

  const naturalKey = JSON.stringify([schoolName, campusName])
  if (naturalKeys.has(naturalKey)) {
    throw new Error(`NO-GO: duplicate (학교명, 본분교명) key at worksheet row ${row.rowNumber}.`)
  }
  naturalKeys.add(naturalKey)

  const institutionId = Number(
    statements.institutionInsert.run(
      schoolName,
      campusName,
      identityCell(cells, columnIndexes.schoolKind),
      identityCell(cells, columnIndexes.schoolType),
      identityCell(cells, columnIndexes.establishmentType),
      identityCell(cells, columnIndexes.regionName),
    ).lastInsertRowid,
  )
  const rawRowId = Number(
    statements.rawRowInsert.run(
      sourceId,
      row.rowNumber,
      JSON.stringify(rowObject(headers, row)),
      rawCellsJson(cells),
    ).lastInsertRowid,
  )

  let classifications = 0
  for (const spec of mappedIndicators) {
    const index = spec.column_index
    const rawValue = rawCell(cells, index)
    const classification = classifyDecimalCell(
      rawValue,
      `${spec.indicator_id} at worksheet row ${row.rowNumber}, column ${index}`,
    )
    classifications += 1

    if (classification.kind === "missing") {
      statements.classificationInsert.run(
        rawRowId,
        institutionId,
        spec.indicator_id,
        classification.raw_text,
        classification.kind,
        classification.marker,
        null,
        null,
      )
      continue
    }

    statements.observationInsert.run(
      institutionId,
      spec.indicator_id,
      sourceId,
      rawRowId,
      classification.value,
      classification.raw_text,
      spec.year,
      spec.unit,
      spec.source_column,
      classification.canonical_value,
    )
    statements.classificationInsert.run(
      rawRowId,
      institutionId,
      spec.indicator_id,
      classification.raw_text,
      classification.kind,
      null,
      classification.canonical_value,
      classification.value,
    )
    counts[spec.indicator_id] = (counts[spec.indicator_id] ?? 0) + 1
  }

  return { rawRows: 1, institutions: 1, classifications }
}
