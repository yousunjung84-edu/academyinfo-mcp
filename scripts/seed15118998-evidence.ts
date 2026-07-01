import { statSync } from "node:fs"

import {
  datasetId,
  datasetName,
  expectedSheetName,
  indicatorSpecs,
  license,
  provider,
  rawFilePath,
  sourceFileName,
  sourceUrl,
  type ObservationCountMap,
  type ParsedHeader,
} from "./seed15118998-config.js"
import { rowObject } from "./seed15118998-database.js"
import type { XlsxRow } from "./xlsx.js"

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
    columns: parsedHeaders,
  }
}

export function buildManifest(
  sourceChecksum: string,
  headerSnapshotChecksum: string,
  seedChecksum: string,
  observationCounts: ObservationCountMap,
): Record<string, unknown> {
  const stats = statSync(rawFilePath)
  const sourceDownloadedAt = stats.mtime.toISOString()
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
    indicators: verifiedIndicatorEntries(),
    observation_counts: observationCounts,
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
    })),
  }
}

export function buildIndicatorDictionary(): Record<string, unknown> {
  return {
    dataset_id: datasetId,
    indicators: verifiedIndicatorEntries(),
  }
}

function verifiedIndicatorEntries(): readonly Record<string, unknown>[] {
  return indicatorSpecs.map((spec) => ({
    ...spec,
    source_dataset_id: datasetId,
    source_column_verified: true,
    enabled_by_default: true,
  }))
}
