import { fileURLToPath } from "node:url"

import {
  checksumsPath,
  datasetId,
  expectedHeaderCount,
  expectedSheetName,
  headerSnapshotPath,
  indicatorJsonPath,
  manifestPath,
  rawFilePath,
  sampleRowsPath,
  seedDbPath,
  sourceFileName,
} from "./seed15118998-config.js"
import { buildSeedDatabase } from "./seed15118998-database.js"
import {
  buildHeaderSnapshot,
  buildIndicatorDictionary,
  buildManifest,
  buildSampleRows,
} from "./seed15118998-evidence.js"
import { debugStep, sha256File, writeJson } from "./seed15118998-utils.js"
import {
  requireSourceChecksum,
  validateDefaultIndicatorHeaders,
} from "./seed15118998-validate.js"
import { readXlsxSheet } from "./xlsx.js"

export function buildSeed15118998(): void {
  debugStep("checking source checksum")
  const sourceChecksum = requireSourceChecksum()
  debugStep("reading xlsx")
  const sheet = readXlsxSheet(rawFilePath, expectedSheetName)

  if (sheet.headers.length !== expectedHeaderCount) {
    throw new Error(`Expected ${expectedHeaderCount} columns, found ${sheet.headers.length}.`)
  }

  debugStep("validating headers")
  const validation = validateDefaultIndicatorHeaders(sheet.headers)

  if (!validation.ok) {
    throw new Error(`NO-GO: ${validation.warnings.join("; ")}`)
  }

  debugStep("writing header snapshot")
  writeJson(headerSnapshotPath, buildHeaderSnapshot(validation.parsedHeaders, sourceChecksum))
  const headerSnapshotChecksum = sha256File(headerSnapshotPath)
  debugStep("building sqlite seed")
  const observationCounts = buildSeedDatabase(
    sheet.headers,
    sheet.rows,
    validation.indicatorColumns,
    sourceChecksum,
    headerSnapshotChecksum,
  )
  const seedChecksum = sha256File(seedDbPath)

  debugStep("writing evidence and manifest")
  writeJson(sampleRowsPath, buildSampleRows(sheet.headers, sheet.rows))
  writeJson(indicatorJsonPath, buildIndicatorDictionary())
  writeJson(manifestPath, buildManifest(sourceChecksum, headerSnapshotChecksum, seedChecksum, observationCounts))
  writeJson(checksumsPath, {
    dataset_id: datasetId,
    source_file_name: sourceFileName,
    source_file_checksum_sha256: sourceChecksum,
    header_snapshot_checksum_sha256: headerSnapshotChecksum,
    seed_db_checksum_sha256: seedChecksum,
    manifest_checksum_sha256: sha256File(manifestPath),
    indicator_dictionary_checksum_sha256: sha256File(indicatorJsonPath),
    observed_at: new Date().toISOString(),
  })
}

const entryPointPath = process.argv[1]

if (entryPointPath !== undefined && fileURLToPath(import.meta.url) === entryPointPath) {
  buildSeed15118998()
  process.stderr.write("seed15118998: ok\n")
}
