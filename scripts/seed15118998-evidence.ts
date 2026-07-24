import { statSync } from "node:fs"

import {
  datasetId,
  datasetName,
  expectedSheetName,
  indicatorSpecs,
  institutionColumns,
  license,
  provider,
  rawFilePath,
  sourceFileName,
  sourceUrl,
  type ObservationCountMap,
  type ParsedHeader,
} from "./seed15118998-config.js"
import { rowObject } from "./seed15118998-database.js"
import { parseHeader, sha256Bytes } from "./seed15118998-utils.js"
import {
  classifyDecimalCell,
  normalizeHeaderForMatch,
} from "./seed15118998-validate.js"
import type { XlsxCell, XlsxRow } from "./xlsx.js"

export type SemanticDigestProjectionInputs = {
  readonly source_model_digest_v1: Record<string, unknown>
  readonly seed_logical_digest_v1: Record<string, unknown>
}
function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function requiredHeaderIndex(headers: readonly string[], expected: string): number {
  const matches = headers
    .map((header, index) => normalizeHeaderForMatch(header) === expected ? index : -1)
    .filter((index) => index >= 0)
  if (matches.length !== 1) {
    throw new Error(`NO-GO: semantic projection header ${expected} mapped ${matches.length} times.`)
  }
  return matches[0] as number
}

function indexedCellReference(columnIndex: number, worksheetRow: number): string {
  let value = columnIndex + 1
  let letters = ""
  while (value > 0) {
    const remainder = (value - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    value = Math.floor((value - 1) / 26)
  }
  return `${letters}${worksheetRow}`
}

function validateHeaderEvidence(
  headers: readonly string[],
  cells: readonly XlsxCell[],
  parsedHeaders: readonly ParsedHeader[],
): void {
  if (headers.length !== cells.length || headers.length !== parsedHeaders.length) {
    throw new Error("NO-GO: worksheet headers, indexed header cells, and parsed headers must have exact coverage.")
  }

  const worksheetRow = cells[0]?.worksheet_row
  for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
    const header = headers[columnIndex]
    const cell = cells[columnIndex]
    const parsed = parsedHeaders[columnIndex]
    const expectedReference =
      worksheetRow === undefined ? undefined : indexedCellReference(columnIndex, worksheetRow)
    const expectedParsed = cell === undefined
      ? undefined
      : parseHeader(normalizeHeaderForMatch(cell.raw_text))
    if (
      header === undefined ||
      cell === undefined ||
      parsed === undefined ||
      cell.worksheet_row !== worksheetRow ||
      cell.column_index !== columnIndex ||
      cell.column_ref !== expectedReference ||
      cell.raw_text !== header ||
      parsed.worksheet_row !== cell.worksheet_row ||
      parsed.column_index !== cell.column_index ||
      parsed.column_ref !== cell.column_ref ||
      parsed.raw_text !== cell.raw_text ||
      parsed.raw_header !== cell.raw_text ||
      parsed.match_header !== normalizeHeaderForMatch(cell.raw_text) ||
      parsed.checksum_sha256 !== sha256Bytes(cell.raw_text) ||
      expectedParsed === undefined ||
      parsed.parsed_label !== expectedParsed.parsed_label ||
      parsed.parsed_year !== expectedParsed.parsed_year ||
      parsed.parsed_unit !== expectedParsed.parsed_unit
    ) {
      throw new Error(`NO-GO: indexed worksheet header evidence mismatch at column ${columnIndex}.`)
    }
  }
}

function validatedRowCells(row: XlsxRow, headerWidth: number): ReadonlyMap<number, XlsxCell> {
  if (!Number.isSafeInteger(row.rowNumber) || row.rowNumber <= 0) {
    throw new Error(`NO-GO: invalid semantic worksheet row ${row.rowNumber}.`)
  }

  const cells = new Map<number, XlsxCell>()
  let maximumIndex = -1
  for (const cell of row.cells) {
    if (
      cell.worksheet_row !== row.rowNumber ||
      !Number.isSafeInteger(cell.column_index) ||
      cell.column_index < 0 ||
      cell.column_index >= headerWidth ||
      cell.column_ref !== indexedCellReference(cell.column_index, row.rowNumber) ||
      cells.has(cell.column_index)
    ) {
      throw new Error(`NO-GO: invalid, duplicate, or extra indexed cell in worksheet row ${row.rowNumber}.`)
    }
    cells.set(cell.column_index, cell)
    maximumIndex = Math.max(maximumIndex, cell.column_index)
  }

  if (row.values.length !== maximumIndex + 1) {
    throw new Error(`NO-GO: legacy values coverage differs from indexed cells in worksheet row ${row.rowNumber}.`)
  }
  for (let columnIndex = 0; columnIndex < row.values.length; columnIndex += 1) {
    const cell = cells.get(columnIndex)
    const hasLegacyValue = columnIndex in row.values
    if (
      (cell === undefined && hasLegacyValue) ||
      (cell !== undefined && (!hasLegacyValue || row.values[columnIndex] !== cell.raw_text))
    ) {
      throw new Error(`NO-GO: legacy values differ from indexed cell ${indexedCellReference(columnIndex, row.rowNumber)}.`)
    }
  }

  return cells
}

function requiredRawCell(
  cells: ReadonlyMap<number, XlsxCell>,
  columnIndex: number,
  worksheetRow: number,
): XlsxCell {
  const cell = cells.get(columnIndex)
  if (cell === undefined) {
    throw new Error(
      `NO-GO: semantic classification source cell ${indexedCellReference(columnIndex, worksheetRow)} is missing.`,
    )
  }
  return cell
}

function indexedHeaders(parsedHeaders: readonly ParsedHeader[]): readonly Record<string, unknown>[] {
  return parsedHeaders.map((header) => {
    if (
      header.worksheet_row === undefined ||
      header.column_index === undefined ||
      header.column_ref === undefined
    ) {
      throw new Error("NO-GO: semantic header projection requires indexed worksheet cells.")
    }
    return {
      worksheet_row: header.worksheet_row,
      column_index: header.column_index,
      column_ref: header.column_ref,
      raw_text: header.raw_header,
      match_header: header.match_header ?? normalizeHeaderForMatch(header.raw_header),
      parsed_label: header.parsed_label,
      parsed_year: header.parsed_year,
      parsed_unit: header.parsed_unit,
    }
  })
}

function indexedRawRows(rows: readonly XlsxRow[]): readonly Record<string, unknown>[] {
  return [...rows]
    .sort((left, right) => left.rowNumber - right.rowNumber)
    .map((row) => ({
      worksheet_row: row.rowNumber,
      cells: [...row.cells]
        .sort((left, right) => left.column_index - right.column_index)
        .map((cell) => ({
          worksheet_row: cell.worksheet_row,
          column_index: cell.column_index,
          column_ref: cell.column_ref,
          raw_text: cell.raw_text,
        })),
    }))
}

/**
 * Builds the timestamp-, checksum-, physical-file-, and digest-free payloads
 * that the refresh orchestrator must JCS-canonicalize and hash.
 */
export function buildSemanticDigestProjectionInputs(
  headers: readonly string[],
  indexedHeaderCells: readonly XlsxCell[],
  parsedHeaders: readonly ParsedHeader[],
  rows: readonly XlsxRow[],
  indicatorColumns: ReadonlyMap<string, number>,
): SemanticDigestProjectionInputs {
  validateHeaderEvidence(headers, indexedHeaderCells, parsedHeaders)
  const schoolNameIndex = requiredHeaderIndex(headers, institutionColumns.schoolName)
  const campusNameIndex = requiredHeaderIndex(headers, institutionColumns.campusName)
  const schoolKindIndex = requiredHeaderIndex(headers, institutionColumns.schoolKind)
  const schoolTypeIndex = requiredHeaderIndex(headers, institutionColumns.schoolType)
  const establishmentTypeIndex = requiredHeaderIndex(headers, institutionColumns.establishmentType)
  const regionNameIndex = requiredHeaderIndex(headers, institutionColumns.regionName)
  const sourceRows = [...rows].sort((left, right) => left.rowNumber - right.rowNumber)
  const sourceRowCells = new Map<XlsxRow, ReadonlyMap<number, XlsxCell>>()
  const rowNumbers = new Set<number>()
  for (const row of sourceRows) {
    if (rowNumbers.has(row.rowNumber)) {
      throw new Error(`NO-GO: duplicate semantic worksheet row ${row.rowNumber}.`)
    }
    rowNumbers.add(row.rowNumber)
    sourceRowCells.set(row, validatedRowCells(row, headers.length))
  }
  const institutions: Record<string, unknown>[] = []
  const classifications: Record<string, unknown>[] = []
  const indicatorIndexes = new Set<number>()
  for (const spec of indicatorSpecs) {
    const columnIndex = indicatorColumns.get(spec.indicator_id)
    if (columnIndex === undefined || indicatorIndexes.has(columnIndex)) {
      throw new Error(`NO-GO: semantic projection has a missing or reused ${spec.indicator_id} mapping.`)
    }
    indicatorIndexes.add(columnIndex)
  }

  for (const row of sourceRows) {
    const cells = sourceRowCells.get(row)
    if (cells === undefined) {
      throw new Error(`NO-GO: indexed worksheet row ${row.rowNumber} was not validated.`)
    }
    const schoolName = requiredRawCell(cells, schoolNameIndex, row.rowNumber).raw_text
    const campusName = requiredRawCell(cells, campusNameIndex, row.rowNumber).raw_text
    if (schoolName.trim().length === 0 || campusName.trim().length === 0) {
      throw new Error(`NO-GO: semantic projection row ${row.rowNumber} has a blank natural key.`)
    }

    institutions.push({
      school_name: schoolName,
      campus_name: campusName,
      school_kind: requiredRawCell(cells, schoolKindIndex, row.rowNumber).raw_text,
      school_type: requiredRawCell(cells, schoolTypeIndex, row.rowNumber).raw_text,
      establishment_type: requiredRawCell(cells, establishmentTypeIndex, row.rowNumber).raw_text,
      region_name: requiredRawCell(cells, regionNameIndex, row.rowNumber).raw_text,
    })
    const institutionKey = { school_name: schoolName, campus_name: campusName }

    for (const spec of indicatorSpecs) {
      const columnIndex = indicatorColumns.get(spec.indicator_id)
      if (columnIndex === undefined) {
        throw new Error(`NO-GO: semantic projection is missing ${spec.indicator_id}.`)
      }
      const sourceCell = requiredRawCell(cells, columnIndex, row.rowNumber)
      const classification = classifyDecimalCell(
        sourceCell.raw_text,
        `${spec.indicator_id} at worksheet row ${row.rowNumber}`,
      )
      classifications.push({
        ...institutionKey,
        worksheet_row: row.rowNumber,
        indicator_id: spec.indicator_id,
        column_index: columnIndex,
        column_ref: sourceCell.column_ref,
        raw_text: sourceCell.raw_text,
        classification: classification.kind,
        missing_marker: classification.kind === "missing" ? classification.marker : null,
        canonical_value:
          classification.kind === "numeric" ? classification.canonical_value : null,
      })
    }
  }

  const naturalKey = (value: Record<string, unknown>): string =>
    JSON.stringify([value["school_name"], value["campus_name"]])
  const sortedInstitutions = [...institutions].sort((left, right) =>
    compareStable(naturalKey(left), naturalKey(right)),
  )
  for (let index = 1; index < sortedInstitutions.length; index += 1) {
    if (naturalKey(sortedInstitutions[index - 1] ?? {}) === naturalKey(sortedInstitutions[index] ?? {})) {
      throw new Error(`NO-GO: duplicate institution natural key in semantic projection.`)
    }
  }

  const projectionSource = {
    dataset_id: datasetId,
    dataset_name: datasetName,
    provider,
    source_url: sourceUrl,
    license,
    source_file_name: sourceFileName,
  }
  const projectionIndicators = indicatorSpecs.map((spec) => {
    const columnIndex = indicatorColumns.get(spec.indicator_id)
    const header = columnIndex === undefined ? undefined : parsedHeaders[columnIndex]
    if (
      columnIndex === undefined ||
      header === undefined ||
      header.parsed_label !== spec.label_ko ||
      header.parsed_year === null ||
      !Number.isInteger(header.parsed_year) ||
      header.parsed_year < spec.year ||
      header.parsed_unit !== spec.unit
    ) {
      throw new Error(`NO-GO: unverified indicator metadata for semantic projection ${spec.indicator_id}.`)
    }
    return {
      indicator_id: spec.indicator_id,
      label_ko: spec.label_ko,
      source_column: header.match_header ?? normalizeHeaderForMatch(header.raw_header),
      year: header.parsed_year,
      unit: header.parsed_unit,
      note: spec.note ?? null,
      source_dataset_id: datasetId,
      source_column_verified: true,
      enabled_by_default: true,
    }
  })
  const logicalObservations = classifications.map((classification) => {
    const indicator = projectionIndicators.find(
      (candidate) => candidate.indicator_id === classification["indicator_id"],
    )
    if (indicator === undefined) {
      throw new Error("NO-GO: missing logical indicator for semantic observation projection.")
    }
    return {
      school_name: classification["school_name"],
      campus_name: classification["campus_name"],
      indicator_id: classification["indicator_id"],
      source_column: indicator.source_column,
      year: indicator.year,
      unit: indicator.unit,
      raw_text: classification["raw_text"],
      classification: classification["classification"],
      missing_marker: classification["missing_marker"],
      canonical_value: classification["canonical_value"],
    }
  })

  return {
    source_model_digest_v1: {
      projection_version: "source_model_digest_v1",
      source: projectionSource,
      headers: indexedHeaders(parsedHeaders),
      rows: indexedRawRows(sourceRows),
      classifications,
    },
    seed_logical_digest_v1: {
      projection_version: "seed_logical_digest_v1",
      provenance: projectionSource,
      indicators: projectionIndicators,
      institutions: sortedInstitutions,
      raw_rows: indexedRawRows(sourceRows),
      observations: logicalObservations.sort((left, right) =>
        compareStable(
          JSON.stringify([
            left["school_name"],
            left["campus_name"],
            left["indicator_id"],
          ]),
          JSON.stringify([
            right["school_name"],
            right["campus_name"],
            right["indicator_id"],
          ]),
        ),
      ),
    },
  }
}

export function buildHeaderSnapshot(
  parsedHeaders: readonly ParsedHeader[],
  sourceChecksum: string,
): Record<string, unknown> {
  return {
    dataset_id: datasetId,
    sheet_name: expectedSheetName,
    column_count: parsedHeaders.length,
    source_file_name: sourceFileName,
    source_file_checksum_sha256: sourceChecksum,
    observed_at: new Date().toISOString(),
    worksheet_blank_policy: "worksheet_blank_v1",
    header_match_policy: "crlf_to_lf_and_leading_bom_removal_only",
    semantic_projection_input: {
      projection_version: "source_model_digest_v1",
      headers: indexedHeaders(parsedHeaders),
    },
    columns: parsedHeaders,
  }
}

/**
 * A refresh candidate must supply verified semantic projection inputs; evidence
 * construction never substitutes configuration defaults for source-derived data.
 */
export function buildManifest(
  sourceChecksum: string,
  headerSnapshotChecksum: string,
  seedChecksum: string,
  observationCounts: ObservationCountMap,
  semanticDigestInputs: SemanticDigestProjectionInputs,
  sourceDownloadedAtOverride?: string,
): Record<string, unknown> {
  const sourceDownloadedAt =
    sourceDownloadedAtOverride ?? statSync(rawFilePath).mtime.toISOString()
  const seedBuiltAt = new Date().toISOString()

  return {
    dataset_id: datasetId,
    dataset_name: datasetName,
    provider,
    source_url: sourceUrl,
    license,
    derived_database: true,
    bundled: true,
    source_file_name: sourceFileName,
    source_downloaded_at: sourceDownloadedAt,
    seed_built_at: seedBuiltAt,
    source_file_downloaded_at: sourceDownloadedAt,
    source_file_modified_or_observed_at: sourceDownloadedAt,
    source_page_observed_at: seedBuiltAt,
    source_file_checksum_sha256: sourceChecksum,
    header_snapshot_checksum_sha256: headerSnapshotChecksum,
    seed_db_checksum_sha256: seedChecksum,
    seed_is_latest_claim: false,
    api_key_required: false,
    source_file_private_path_excluded: true,
    per_indicator_year_unit: true,
    indicators: semanticIndicators(semanticDigestInputs),
    observation_counts: observationCounts,
    audit_evidence: {
      source_file_checksum_sha256: sourceChecksum,
      header_snapshot_checksum_sha256: headerSnapshotChecksum,
      seed_db_checksum_sha256: seedChecksum,
      observation_counts: observationCounts,
    },
    semantic_digest_projection_inputs: semanticDigestInputs,
    warnings: [
      "The bundled seed DB is a normalized derivative of dataset 15118998, not a raw source file.",
      "seed_is_latest_claim=false; this seed does not claim to be the latest source unless separately verified.",
      "Dataset 15139279 remains non-bundled v0.3 backlog data and is absent from this seed.",
    ],
  }
}

export function buildSampleRows(
  headers: readonly string[],
  rows: readonly XlsxRow[],
): Record<string, unknown> {
  return {
    dataset_id: datasetId,
    source_file_name: sourceFileName,
    observed_at: new Date().toISOString(),
    sample_size: Math.min(5, rows.length),
    rows: rows.slice(0, 5).map((row) => ({
      row_number: row.rowNumber,
      row: rowObject(headers, row),
      raw_cells: row.cells.map((cell) => ({
        worksheet_row: cell.worksheet_row,
        column_index: cell.column_index,
        column_ref: cell.column_ref,
        raw_text: cell.raw_text,
      })),
    })),
  }
}

export function buildIndicatorDictionary(
  semanticDigestInputs: SemanticDigestProjectionInputs,
): Record<string, unknown> {
  return {
    dataset_id: datasetId,
    indicators: semanticIndicators(semanticDigestInputs),
  }
}

function semanticIndicators(
  semanticDigestInputs: SemanticDigestProjectionInputs,
): readonly Record<string, unknown>[] {
  const { seedLogical } = requireSemanticProjections(semanticDigestInputs)
  const indicators = seedLogical["indicators"]
  if (!Array.isArray(indicators) || indicators.length !== indicatorSpecs.length) {
    throw new Error("NO-GO: verified semantic indicator projection is missing or incomplete.")
  }

  return indicators.map((value, index) => {
    const spec = indicatorSpecs[index]
    if (
      spec === undefined ||
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      throw new Error(`NO-GO: semantic indicator projection ${index} is invalid.`)
    }

    const indicator = value as Record<string, unknown>
    if (
      indicator["indicator_id"] !== spec.indicator_id ||
      indicator["label_ko"] !== spec.label_ko ||
      indicator["source_dataset_id"] !== datasetId ||
      indicator["source_column_verified"] !== true ||
      indicator["enabled_by_default"] !== true ||
      typeof indicator["source_column"] !== "string" ||
      indicator["source_column"].length === 0 ||
      typeof indicator["year"] !== "number" ||
      !Number.isInteger(indicator["year"]) ||
      indicator["year"] < spec.year ||
      indicator["unit"] !== spec.unit
    ) {
      throw new Error(`NO-GO: semantic indicator projection ${spec.indicator_id} is unverified.`)
    }
    return indicator
  })
}
function requireSemanticProjections(
  semanticDigestInputs: SemanticDigestProjectionInputs,
): {
  readonly sourceModel: Record<string, unknown>
  readonly seedLogical: Record<string, unknown>
} {
  if (
    semanticDigestInputs === null ||
    typeof semanticDigestInputs !== "object" ||
    Array.isArray(semanticDigestInputs)
  ) {
    throw new Error("NO-GO: semantic projection inputs are required.")
  }

  const sourceModel = semanticDigestInputs.source_model_digest_v1
  const seedLogical = semanticDigestInputs.seed_logical_digest_v1
  if (
    sourceModel === null ||
    typeof sourceModel !== "object" ||
    Array.isArray(sourceModel) ||
    sourceModel["projection_version"] !== "source_model_digest_v1"
  ) {
    throw new Error("NO-GO: verified source model projection is required.")
  }
  if (
    seedLogical === null ||
    typeof seedLogical !== "object" ||
    Array.isArray(seedLogical) ||
    seedLogical["projection_version"] !== "seed_logical_digest_v1"
  ) {
    throw new Error("NO-GO: verified seed logical projection is required.")
  }

  return { sourceModel, seedLogical }
}
