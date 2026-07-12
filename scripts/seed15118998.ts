import { fileURLToPath } from "node:url"

import Database from "better-sqlite3"

import { indicatorCatalogSchema } from "../src/catalog-schema.js"
import {
  checksumsPath,
  datasetId,
  indicatorSpecs,
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
  buildSemanticDigestDag,
  canonicalJson,
  type JsonObject,
  type JsonValue,
} from "./semantic-digests.js"
import {
  buildHeaderSnapshot,
  buildIndicatorDictionary,
  buildManifest,
  buildSampleRows,
  buildSemanticDigestProjectionInputs,
} from "./seed15118998-evidence.js"
import {
  buildRefreshAuditEvidence,
  debugStep,
  sha256Bytes,
  sha256File,
  sqlitePath,
  writeJson,
} from "./seed15118998-utils.js"
import {
  requireSourceChecksum,
  validateDefaultIndicatorHeaders,
} from "./seed15118998-validate.js"
import { readXlsxSheet } from "./xlsx.js"

export function buildSeed15118998(): void {
  debugStep("recording source checksum")
  const sourceChecksum = requireSourceChecksum()
  debugStep("reading xlsx")
  const sheet = readXlsxSheet(rawFilePath, expectedSheetName)


  debugStep("validating headers")
  const validation = validateDefaultIndicatorHeaders(sheet.headers, sheet.headerRowNumber)

  if (!validation.ok) {
    throw new Error(`NO-GO: ${validation.warnings.join("; ")}`)
  }

  const semanticProjectionInputs = buildSemanticDigestProjectionInputs(
    sheet.headers,
    sheet.indexedHeaders,
    validation.parsedHeaders,
    sheet.rows,
    validation.indicatorColumns,
  )
  const sourceModelProjection = requireJsonObject(
    semanticProjectionInputs.source_model_digest_v1,
    "source model",
  )
  const seedLogicalProjection = requireJsonObject(
    semanticProjectionInputs.seed_logical_digest_v1,
    "seed logical",
  )

  const headerSnapshot = buildHeaderSnapshot(validation.parsedHeaders, sourceChecksum)
  const headerSnapshotChecksum = sha256Bytes(`${JSON.stringify(headerSnapshot, null, 2)}\n`)
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
  const indicatorDictionary = buildIndicatorDictionary(semanticProjectionInputs)
  const projectionSource = requireJsonObject(
    seedLogicalProjection["provenance"],
    "seed logical provenance",
  )
  const indicators = requireJsonArray(indicatorDictionary["indicators"], "catalog indicators")
    .map((indicator, index) => catalogIndicator(indicator, index))
  const catalogCandidate = {
    catalog_schema_version: 1,
    source: {
      dataset_id: requireJsonString(projectionSource["dataset_id"], "catalog source dataset_id"),
      dataset_name: requireJsonString(projectionSource["dataset_name"], "catalog source dataset_name"),
      provider: requireJsonString(projectionSource["provider"], "catalog source provider"),
      source_url: requireJsonString(projectionSource["source_url"], "catalog source source_url"),
      license: requireJsonString(projectionSource["license"], "catalog source license"),
      derived_database: true,
      bundled: true,
      source_column: "NotVerified",
      base_year: "NotVerified",
      unit: "NotVerified",
    },
    indicators,
  }
  const parsedCatalog = indicatorCatalogSchema.safeParse(catalogCandidate)
  if (!parsedCatalog.success) {
    throw new Error(
      `NO-GO: assembled catalog violates the closed catalog schema: ${parsedCatalog.error.message}`,
    )
  }
  const catalog = requireJsonObject(parsedCatalog.data, "closed catalog")
  const manifestWithoutDigests = requireJsonObject(
    buildManifest(
      sourceChecksum,
      headerSnapshotChecksum,
      seedChecksum,
      observationCounts,
      semanticProjectionInputs,
    ),
    "manifest",
  )
  assertReleaseReconciliation(
    sourceModelProjection,
    seedLogicalProjection,
    catalog,
    manifestWithoutDigests,
    observationCounts,
  )
  const semanticDigests = buildSemanticDigestDag({
    sourceModel: sourceModelProjection,
    seedLogical: seedLogicalProjection,
    catalog,
    manifest: manifestWithoutDigests,
  })
  const manifest = { ...manifestWithoutDigests, semantic_digests: semanticDigests }

  writeJson(headerSnapshotPath, headerSnapshot)
  writeJson(sampleRowsPath, buildSampleRows(sheet.headers, sheet.rows))
  writeJson(indicatorJsonPath, catalog)
  writeJson(manifestPath, manifest)
  writeJson(checksumsPath, {
    dataset_id: datasetId,
    source_file_name: sourceFileName,
    source_file_checksum_sha256: sourceChecksum,
    header_snapshot_checksum_sha256: headerSnapshotChecksum,
    seed_db_checksum_sha256: seedChecksum,
    manifest_checksum_sha256: sha256File(manifestPath),
    indicator_dictionary_checksum_sha256: sha256File(indicatorJsonPath),
    semantic_digests: semanticDigests,
    audit_evidence: buildRefreshAuditEvidence(sourceChecksum, sheet.headers.length),
    observed_at: new Date().toISOString(),
  })
}

function requireJsonObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`NO-GO: ${label} projection is missing or invalid.`)
  }
  return value as JsonObject
}

function requireJsonArray(value: unknown, label: string): readonly JsonValue[] {
  if (!Array.isArray(value)) {
    throw new Error(`NO-GO: ${label} projection is missing or invalid.`)
  }
  return value as readonly JsonValue[]
}

function requireJsonString(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`NO-GO: ${label} projection is missing or invalid.`)
  }
  return value
}

function catalogIndicator(value: JsonValue, index: number): JsonObject {
  const indicator = requireJsonObject(value, `catalog indicator ${index}`)
  if (indicator["note"] !== null) {
    return indicator
  }

  const { note: _note, ...withoutNullNote } = indicator
  return withoutNullNote
}
type DatabaseReleaseState = {
  readonly seedLogical: JsonObject
  readonly source: JsonObject
  readonly indicators: readonly JsonObject[]
  readonly observationCounts: JsonObject
  readonly sourceChecksums: JsonObject
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function assertReleaseReconciliation(
  sourceModelProjection: JsonObject,
  seedLogicalProjection: JsonObject,
  catalog: JsonObject,
  manifest: JsonObject,
  expectedObservationCounts: Readonly<Record<string, number>>,
): void {
  const database = readDatabaseReleaseState()
  assertCanonicalEqual(database.seedLogical, seedLogicalProjection, "SQLite logical tables")
  assertCanonicalEqual(
    database.indicators.map((indicator) => catalogIndicator(indicator, 0)),
    requireJsonArray(catalog["indicators"], "catalog indicators"),
    "SQLite indicators and catalog",
  )

  const catalogSource = requireJsonObject(catalog["source"], "catalog source")
  assertCanonicalEqual(
    selectRequiredMembers(catalogSource, [
      "dataset_id",
      "dataset_name",
      "provider",
      "source_url",
      "license",
    ]),
    selectRequiredMembers(database.source, [
      "dataset_id",
      "dataset_name",
      "provider",
      "source_url",
      "license",
    ]),
    "SQLite source and catalog",
  )

  const expectedCountKeys = Object.keys(expectedObservationCounts).sort()
  const requiredCountKeys = indicatorSpecs.map((spec) => spec.indicator_id).sort()
  if (
    expectedCountKeys.length !== requiredCountKeys.length ||
    expectedCountKeys.some((key, index) => key !== requiredCountKeys[index])
  ) {
    throw new Error("NO-GO: observation count keys do not match the closed indicator catalog.")
  }
  const expectedCounts = Object.fromEntries(
    indicatorSpecs.map((spec) => {
      const count = expectedObservationCounts[spec.indicator_id]
      if (count === undefined || !Number.isSafeInteger(count) || count < 0) {
        throw new Error(`NO-GO: observation count for ${spec.indicator_id} is invalid.`)
      }
      return [spec.indicator_id, count]
    }),
  ) as JsonObject
  assertCanonicalEqual(database.observationCounts, expectedCounts, "SQLite observation counts")
  assertCanonicalEqual(
    requireJsonObject(manifest["observation_counts"], "manifest observation counts"),
    database.observationCounts,
    "manifest and SQLite observation counts",
  )
  assertCanonicalEqual(
    requireJsonArray(manifest["indicators"], "manifest indicators"),
    database.indicators,
    "manifest and SQLite indicators",
  )
  assertCanonicalEqual(
    selectRequiredMembers(manifest, [
      "dataset_id",
      "dataset_name",
      "provider",
      "source_url",
      "license",
      "source_file_name",
    ]),
    database.source,
    "manifest and SQLite source",
  )

  const projectionInputs = requireJsonObject(
    manifest["semantic_digest_projection_inputs"],
    "manifest semantic projection inputs",
  )
  assertCanonicalEqual(
    requireJsonObject(
      projectionInputs["source_model_digest_v1"],
      "manifest source model projection",
    ),
    sourceModelProjection,
    "manifest source model projection",
  )
  assertCanonicalEqual(
    requireJsonObject(
      projectionInputs["seed_logical_digest_v1"],
      "manifest seed logical projection",
    ),
    database.seedLogical,
    "manifest seed logical projection",
  )

  const auditEvidence = requireJsonObject(manifest["audit_evidence"], "manifest audit evidence")
  assertCanonicalEqual(
    requireJsonObject(auditEvidence["observation_counts"], "audit observation counts"),
    database.observationCounts,
    "manifest audit and SQLite observation counts",
  )
  assertCanonicalEqual(
    selectRequiredMembers(auditEvidence, [
      "source_file_checksum_sha256",
      "header_snapshot_checksum_sha256",
    ]),
    database.sourceChecksums,
    "manifest audit and SQLite source checksums",
  )
  assertCanonicalEqual(
    selectRequiredMembers(manifest, [
      "source_file_checksum_sha256",
      "header_snapshot_checksum_sha256",
    ]),
    database.sourceChecksums,
    "manifest and SQLite source checksums",
  )
  if (auditEvidence["seed_db_checksum_sha256"] !== manifest["seed_db_checksum_sha256"]) {
    throw new Error("NO-GO: manifest seed checksum and audit evidence diverge.")
  }
}

function readDatabaseReleaseState(): DatabaseReleaseState {
  const db = new Database(sqlitePath(seedDbPath), { readonly: true })
  try {
    const sourceRows = db.prepare(
      `SELECT dataset_id, dataset_name, provider, source_url, license, source_file_name,
              source_file_checksum_sha256, header_snapshot_checksum_sha256
       FROM source_files`,
    ).all() as readonly Record<string, unknown>[]
    if (sourceRows.length !== 1) {
      throw new Error(`NO-GO: SQLite source_files must contain exactly one row; found ${sourceRows.length}.`)
    }
    const sourceRow = sourceRows[0]
    if (sourceRow === undefined) {
      throw new Error("NO-GO: SQLite source row is missing.")
    }
    const source = selectDatabaseMembers(sourceRow, [
      "dataset_id",
      "dataset_name",
      "provider",
      "source_url",
      "license",
      "source_file_name",
    ])
    const sourceChecksums = selectDatabaseMembers(sourceRow, [
      "source_file_checksum_sha256",
      "header_snapshot_checksum_sha256",
    ])

    const indicatorOrder = new Map(
      indicatorSpecs.map((spec, index) => [spec.indicator_id, index] as const),
    )
    const indicatorRows = (db.prepare(
      `SELECT indicator_id, label_ko, source_dataset_id, source_column,
              source_column_verified, year, unit, enabled_by_default, note
       FROM indicators`,
    ).all() as readonly Record<string, unknown>[])
      .map((row) => ({
        indicator_id: databaseString(row["indicator_id"], "indicator_id"),
        label_ko: databaseString(row["label_ko"], "label_ko"),
        source_dataset_id: databaseString(row["source_dataset_id"], "source_dataset_id"),
        source_column: databaseString(row["source_column"], "source_column"),
        source_column_verified:
          databaseInteger(row["source_column_verified"], "source_column_verified") === 1,
        year: databaseInteger(row["year"], "year"),
        unit: databaseString(row["unit"], "unit"),
        enabled_by_default:
          databaseInteger(row["enabled_by_default"], "enabled_by_default") === 1,
        note: databaseNullableString(row["note"], "note"),
      }))
      .sort(
        (left, right) =>
          (indicatorOrder.get(left.indicator_id) ?? Number.MAX_SAFE_INTEGER) -
          (indicatorOrder.get(right.indicator_id) ?? Number.MAX_SAFE_INTEGER),
      )

    const institutions = (db.prepare(
      `SELECT school_name, campus_name, school_kind, school_type,
              establishment_type, region_name
       FROM institutions`,
    ).all() as readonly Record<string, unknown>[])
      .map((row) => ({
        school_name: databaseString(row["school_name"], "school_name"),
        campus_name: databaseString(row["campus_name"], "campus_name"),
        school_kind: databaseString(row["school_kind"], "school_kind"),
        school_type: databaseString(row["school_type"], "school_type"),
        establishment_type: databaseString(row["establishment_type"], "establishment_type"),
        region_name: databaseString(row["region_name"], "region_name"),
      }))
      .sort((left, right) =>
        compareStable(
          JSON.stringify([left.school_name, left.campus_name]),
          JSON.stringify([right.school_name, right.campus_name]),
        ),
      )

    const rawRows = (db.prepare(
      "SELECT row_number, raw_cells_json FROM raw_rows ORDER BY row_number",
    ).all() as readonly Record<string, unknown>[]).map((row) => ({
      worksheet_row: databaseInteger(row["row_number"], "raw row_number"),
      cells: requireJsonArray(
        parseStoredJson(row["raw_cells_json"], "raw_cells_json"),
        "SQLite raw cells",
      ),
    }))

    const observations = (db.prepare(
      `SELECT institutions.school_name, institutions.campus_name,
              observation_classifications.indicator_id, indicators.source_column,
              indicators.year, indicators.unit, observation_classifications.raw_text,
              observation_classifications.classification,
              observation_classifications.missing_marker,
              observation_classifications.canonical_value
       FROM observation_classifications
       JOIN institutions ON institutions.id = observation_classifications.institution_id
       JOIN indicators ON indicators.indicator_id = observation_classifications.indicator_id`,
    ).all() as readonly Record<string, unknown>[])
      .map((row) => ({
        school_name: databaseString(row["school_name"], "observation school_name"),
        campus_name: databaseString(row["campus_name"], "observation campus_name"),
        indicator_id: databaseString(row["indicator_id"], "observation indicator_id"),
        source_column: databaseString(row["source_column"], "observation source_column"),
        year: databaseInteger(row["year"], "observation year"),
        unit: databaseString(row["unit"], "observation unit"),
        raw_text: databaseString(row["raw_text"], "observation raw_text", true),
        classification: databaseString(row["classification"], "observation classification"),
        missing_marker: databaseNullableString(row["missing_marker"], "observation missing_marker"),
        canonical_value: databaseNullableString(row["canonical_value"], "observation canonical_value"),
      }))
      .sort((left, right) =>
        compareStable(
          JSON.stringify([left.school_name, left.campus_name, left.indicator_id]),
          JSON.stringify([right.school_name, right.campus_name, right.indicator_id]),
        ),
      )

    const countRows = db.prepare(
      "SELECT indicator_id, COUNT(*) AS observation_count FROM observations GROUP BY indicator_id",
    ).all() as readonly Record<string, unknown>[]
    const countByIndicator = new Map(
      countRows.map((row) => [
        databaseString(row["indicator_id"], "count indicator_id"),
        databaseInteger(row["observation_count"], "observation_count"),
      ]),
    )
    const observationCounts = Object.fromEntries(
      indicatorSpecs.map((spec) => [spec.indicator_id, countByIndicator.get(spec.indicator_id) ?? 0]),
    ) as JsonObject

    return {
      seedLogical: {
        projection_version: "seed_logical_digest_v1",
        provenance: source,
        indicators: indicatorRows,
        institutions,
        raw_rows: rawRows,
        observations,
      },
      source,
      indicators: indicatorRows,
      observationCounts,
      sourceChecksums,
    }
  } finally {
    db.close()
  }
}

function selectRequiredMembers(value: JsonObject, keys: readonly string[]): JsonObject {
  return Object.fromEntries(
    keys.map((key) => {
      const member = value[key]
      if (member === undefined) {
        throw new Error(`NO-GO: required reconciliation member ${key} is missing.`)
      }
      return [key, member]
    }),
  ) as JsonObject
}

function selectDatabaseMembers(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): JsonObject {
  return Object.fromEntries(
    keys.map((key) => [key, databaseString(value[key], key)]),
  ) as JsonObject
}

function databaseString(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new Error(`NO-GO: SQLite ${label} is not a valid string.`)
  }
  return value
}

function databaseNullableString(value: unknown, label: string): string | null {
  if (value === null) {
    return null
  }
  return databaseString(value, label, true)
}

function databaseInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`NO-GO: SQLite ${label} is not a safe integer.`)
  }
  return value
}

function parseStoredJson(value: unknown, label: string): JsonValue {
  if (typeof value !== "string") {
    throw new Error(`NO-GO: SQLite ${label} is not JSON text.`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`NO-GO: SQLite ${label} is malformed JSON.`)
  }
  canonicalJson(parsed as JsonValue)
  return parsed as JsonValue
}

function assertCanonicalEqual(actual: JsonValue, expected: JsonValue, label: string): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`NO-GO: ${label} reconciliation failed.`)
  }
}

const entryPointPath = process.argv[1]

if (entryPointPath !== undefined && fileURLToPath(import.meta.url) === entryPointPath) {
  buildSeed15118998()
  process.stderr.write("seed15118998: ok\n")
}
