import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import * as refreshConfig from "../scripts/seed15118998-config.ts"
import { indicatorSpecs, institutionColumns } from "../scripts/seed15118998-config.ts"
import { seedSchemaContract } from "../scripts/seed15118998-schema.ts"
import { rowObject } from "../scripts/seed15118998-database.ts"
import {
  buildManifestSemanticProjection,
  buildReleaseDataProjection,
  buildSemanticDigestDag,
  buildSemanticDigestProjections,
  canonicalJson,
  canonicalSha256,
  type JsonObject,
  type JsonValue,
} from "../scripts/semantic-digests.ts"
import {
  buildIndicatorDictionary,
  buildSemanticDigestProjectionInputs,
} from "../scripts/seed15118998-evidence.ts"
import { buildRefreshAuditEvidence } from "../scripts/seed15118998-utils.ts"
import {
  parseDecimalCell,
  validateDefaultIndicatorHeaders,
} from "../scripts/seed15118998-validate.ts"
import { readXlsxSheet, worksheetBlankV1 } from "../scripts/xlsx.ts"

const projectionSource: JsonObject = {
  dataset_id: "15118998",
  dataset_name: "대학알리미 15118998",
  provider: "한국대학교육협의회",
  source_url: "https://example.test/15118998",
  license: "KOGL-1 / 공공누리 제1유형(출처표시)",
  source_file_name: "15118998.xlsx",
}

const sourceModel: JsonObject = {
  projection_version: "source_model_digest_v1",
  source: projectionSource,
  headers: [{
    worksheet_row: 2,
    column_index: 0,
    column_ref: "A2",
    raw_text: "학교명",
    match_header: "학교명",
    parsed_label: "학교명",
    parsed_year: null,
    parsed_unit: null,
  }],
  rows: [],
  classifications: [],
}

const seedLogical: JsonObject = {
  projection_version: "seed_logical_digest_v1",
  provenance: projectionSource,
  indicators: [],
  institutions: [],
  raw_rows: [],
  observations: [],
}

const catalog: JsonObject = {
  catalog_schema_version: 1,
  source: {
    dataset_id: "15118998",
    dataset_name: "대학알리미 15118998",
    provider: "한국대학교육협의회",
    source_url: "https://example.test/15118998",
    license: "KOGL-1 / 공공누리 제1유형(출처표시)",
    derived_database: true,
    bundled: true,
    source_column: "NotVerified",
    base_year: "NotVerified",
    unit: "NotVerified",
  },
  indicators: [],
}

const stableManifest: JsonObject = {
  dataset_id: "15118998",
  dataset_name: "대학알리미 15118998",
  provider: "한국대학교육협의회",
  source_url: "https://example.test/15118998",
  license: "KOGL-1 / 공공누리 제1유형(출처표시)",
  derived_database: true,
  bundled: true,
  source_file_name: "15118998.xlsx",
  seed_is_latest_claim: false,
  api_key_required: false,
  source_file_private_path_excluded: true,
  per_indicator_year_unit: true,
  indicators: [],
  observation_counts: {
    competition_rate: 0,
    fill_rate: 0,
    employment_rate: 0,
    scholarship_per_student: 0,
    avg_tuition: 0,
  },
  warnings: ["fixture warning"],
}

function manifestWithPhysicalEvidence(
  observedAt: string,
  checksumCharacter: string,
  observationCounts: JsonObject = stableManifest["observation_counts"] as JsonObject,
): JsonObject {
  return {
    ...stableManifest,
    observation_counts: observationCounts,
    source_downloaded_at: observedAt,
    seed_built_at: observedAt,
    source_file_downloaded_at: observedAt,
    source_file_modified_or_observed_at: observedAt,
    source_page_observed_at: observedAt,
    source_file_checksum_sha256: checksumCharacter.repeat(64),
    header_snapshot_checksum_sha256: checksumCharacter.repeat(64),
    seed_db_checksum_sha256: checksumCharacter.repeat(64),
    semantic_digest_projection_inputs: {
      source_model_digest_v1: sourceModel,
      seed_logical_digest_v1: seedLogical,
    },
    audit_evidence: {
      source_file_checksum_sha256: checksumCharacter.repeat(64),
      header_snapshot_checksum_sha256: checksumCharacter.repeat(64),
      seed_db_checksum_sha256: checksumCharacter.repeat(64),
      observation_counts: observationCounts,
    },
  }
}

function independentCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(independentCanonicalJson).join(",")}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${independentCanonicalJson(record[key])}`)
    .join(",")}}`
}

function independentSha256(value: unknown): string {
  return createHash("sha256").update(independentCanonicalJson(value)).digest("hex")
}
function independentManifestProjection(manifest: JsonObject): JsonObject {
  const sourceModelDigest = independentSha256(sourceModel)
  const seedLogicalDigest = independentSha256(seedLogical)
  const catalogDigest = independentSha256(catalog)
  return {
    projection_version: "manifest_semantic_digest_v1",
    manifest: {
      dataset_id: manifest["dataset_id"] as JsonValue,
      dataset_name: manifest["dataset_name"] as JsonValue,
      provider: manifest["provider"] as JsonValue,
      source_url: manifest["source_url"] as JsonValue,
      license: manifest["license"] as JsonValue,
      derived_database: manifest["derived_database"] as JsonValue,
      bundled: manifest["bundled"] as JsonValue,
      source_file_name: manifest["source_file_name"] as JsonValue,
      seed_is_latest_claim: manifest["seed_is_latest_claim"] as JsonValue,
      api_key_required: manifest["api_key_required"] as JsonValue,
      source_file_private_path_excluded:
        manifest["source_file_private_path_excluded"] as JsonValue,
      per_indicator_year_unit: manifest["per_indicator_year_unit"] as JsonValue,
      indicators: manifest["indicators"] as JsonValue,
      observation_counts: manifest["observation_counts"] as JsonValue,
      warnings: manifest["warnings"] as JsonValue,
    },
    child_digests: {
      source_model_digest_v1: sourceModelDigest,
      seed_logical_digest_v1: seedLogicalDigest,
      catalog_digest_v1: catalogDigest,
    },
  }
}

function independentReleaseProjection(manifestProjection: JsonObject): JsonObject {
  return {
    projection_version: "release_data_digest_v1",
    child_digests: {
      source_model_digest_v1: independentSha256(sourceModel),
      seed_logical_digest_v1: independentSha256(seedLogical),
      catalog_digest_v1: independentSha256(catalog),
      manifest_semantic_digest_v1: independentSha256(manifestProjection),
    },
    policy_versions: {
      worksheet_blank: "worksheet_blank_v1",
      header_match: "crlf_to_lf_and_leading_bom_removal_only",
      decimal_grammar: "decimal_grammar_v1",
    },
    schema_versions: {
      catalog: 1,
      source_model_projection: 1,
      seed_logical_projection: 1,
      manifest_semantic_projection: 1,
      release_data_projection: 1,
    },
  }
}

function headersAtWidth(width: number): readonly string[] {
  const required = [
    ...Object.values(institutionColumns),
    ...indicatorSpecs.map((indicator) => indicator.source_column),
  ]
  return [
    ...required,
    ...Array.from({ length: width - required.length }, (_, index) => `unrelated_${index}`),
  ]
}

function testColumnReference(columnIndex: number, worksheetRow: number): string {
  let value = columnIndex + 1
  let letters = ""
  while (value > 0) {
    const remainder = (value - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    value = Math.floor((value - 1) / 26)
  }
  return `${letters}${worksheetRow}`
}

function semanticEvidenceFixture() {
  const headers = headersAtWidth(12)
  const validation = validateDefaultIndicatorHeaders(headers, 3)
  if (!validation.ok) {
    throw new Error(validation.warnings.join("; "))
  }
  const indexedHeaders = headers.map((rawText, columnIndex) => ({
    worksheet_row: 3,
    column_index: columnIndex,
    column_ref: testColumnReference(columnIndex, 3),
    raw_text: rawText,
  }))
  const values = headers.map((_, columnIndex) =>
    columnIndex < Object.values(institutionColumns).length
      ? `institution-${columnIndex}`
      : `${columnIndex + 1}.00`,
  )
  const row = {
    rowNumber: 4,
    values,
    cells: values.map((rawText, columnIndex) => ({
      worksheet_row: 4,
      column_index: columnIndex,
      column_ref: testColumnReference(columnIndex, 4),
      raw_text: rawText,
    })),
  }
  return { headers, indexedHeaders, validation, row }
}
function relationalDigestFixture() {
  const worksheet = semanticEvidenceFixture()
  const inputs = buildSemanticDigestProjectionInputs(
    worksheet.headers,
    worksheet.indexedHeaders,
    worksheet.validation.parsedHeaders,
    [worksheet.row],
    worksheet.validation.indicatorColumns,
  )
  const source = inputs.source_model_digest_v1 as JsonObject
  const seed = inputs.seed_logical_digest_v1 as JsonObject
  const provenance = seed["provenance"] as JsonObject
  const indicators = seed["indicators"] as readonly JsonObject[]
  const counts = Object.fromEntries(indicatorSpecs.map((indicator) => [indicator.indicator_id, 1]))
  const closedCatalog: JsonObject = {
    catalog_schema_version: 1,
    source: {
      dataset_id: provenance["dataset_id"] as JsonValue,
      dataset_name: provenance["dataset_name"] as JsonValue,
      provider: provenance["provider"] as JsonValue,
      source_url: provenance["source_url"] as JsonValue,
      license: provenance["license"] as JsonValue,
      derived_database: true,
      bundled: true,
      source_column: "NotVerified",
      base_year: "NotVerified",
      unit: "NotVerified",
    },
    indicators: indicators.map((indicator) => {
      if (indicator["note"] !== null) {
        return indicator
      }
      const { note: _note, ...withoutNullNote } = indicator
      return withoutNullNote
    }),
  }
  const observedAt = "2026-01-01T00:00:00.000Z"
  const manifest: JsonObject = {
    ...provenance,
    derived_database: true,
    bundled: true,
    seed_is_latest_claim: false,
    api_key_required: false,
    source_file_private_path_excluded: true,
    per_indicator_year_unit: true,
    indicators,
    observation_counts: counts,
    warnings: [],
    source_downloaded_at: observedAt,
    seed_built_at: observedAt,
    source_file_downloaded_at: observedAt,
    source_file_modified_or_observed_at: observedAt,
    source_page_observed_at: observedAt,
    source_file_checksum_sha256: "a".repeat(64),
    header_snapshot_checksum_sha256: "b".repeat(64),
    seed_db_checksum_sha256: "c".repeat(64),
    semantic_digest_projection_inputs: {
      source_model_digest_v1: source,
      seed_logical_digest_v1: seed,
    },
    audit_evidence: {
      source_file_checksum_sha256: "a".repeat(64),
      header_snapshot_checksum_sha256: "b".repeat(64),
      seed_db_checksum_sha256: "c".repeat(64),
      observation_counts: counts,
    },
  }
  return { source, seed, catalog: closedCatalog, manifest }
}

function withProjectionInputs(
  manifest: JsonObject,
  source: JsonObject,
  seed: JsonObject,
): JsonObject {
  return {
    ...manifest,
    semantic_digest_projection_inputs: {
      source_model_digest_v1: source,
      seed_logical_digest_v1: seed,
    },
  }
}

const worksheetRelationshipType =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"

function storedZip(entries: Readonly<Record<string, string>>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let localOffset = 0

  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name)
    const data = Buffer.from(text)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(nameBytes.length, 26)
    localParts.push(localHeader, nameBytes, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(nameBytes.length, 28)
    centralHeader.writeUInt32LE(localOffset, 42)
    centralParts.push(centralHeader, nameBytes)
    localOffset += localHeader.length + nameBytes.length + data.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(localOffset, 16)
  return Buffer.concat([...localParts, centralDirectory, end])
}

function workbookXml(): string {
  return [
    "<workbook xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">",
    "<sheets><sheet name=\"Sheet1\" sheetId=\"1\" r:id=\"rIdSelected\"/></sheets>",
    "</workbook>",
  ].join("")
}

function worksheetXml(header: string, rows = ""): string {
  return [
    "<worksheet><sheetData>",
    `<row r="1"><c r="A1" t="inlineStr"><is><t>${header}</t></is></c></row>`,
    rows,
    "</sheetData></worksheet>",
  ].join("")
}

function readFixtureSheet(
  relationships: string,
  extraEntries: Readonly<Record<string, string>> = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "academyinfo-refresh-contract-"))
  const filePath = join(directory, "fixture.xlsx")
  writeFileSync(
    filePath,
    storedZip({
      "xl/workbook.xml": workbookXml(),
      "xl/_rels/workbook.xml.rels": `<Relationships>${relationships}</Relationships>`,
      ...extraEntries,
    }),
  )

  try {
    return readXlsxSheet(filePath, "Sheet1")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe("refresh worksheet and decimal authority", () => {
  it("uses the one blank predicate and preserves the actual worksheet header row", () => {
    expect(worksheetBlankV1(undefined)).toBe(true)
    expect(worksheetBlankV1(" \t\r\n\u00a0")).toBe(true)
    expect(worksheetBlankV1("-")).toBe(false)

    const headers = [...headersAtWidth(23)]
    headers[0] = `\uFEFF${headers[0]}`
    const indicatorIndex = Object.values(institutionColumns).length
    headers[indicatorIndex] = headers[indicatorIndex]?.replace("\n", "\r\n") ?? ""
    const validation = validateDefaultIndicatorHeaders(headers, 7)

    expect(validation.ok).toBe(true)
    expect(validation.parsedHeaders).toHaveLength(23)
    expect(validation.parsedHeaders.every((header) => header.worksheet_row === 7)).toBe(true)
    expect(validation.parsedHeaders[0]?.column_ref).toBe("A7")
  })

  it("resolves the selected worksheet through its workbook relationship", () => {
    const sheet = readFixtureSheet(
      `<Relationship Id="rIdSelected" Type="${worksheetRelationshipType}" Target="worksheets/sheet7.xml"/>`,
      {
        "xl/worksheets/sheet1.xml": worksheetXml("decoy"),
        "xl/worksheets/sheet7.xml": worksheetXml(
          "selected",
          "<row r=\"2\"><c r=\"A2\" t=\"inlineStr\"><is><t>value</t></is></c></row>",
        ),
      },
    )

    expect(sheet.headers).toEqual(["selected"])
    expect(sheet.rows.map((row) => row.values)).toEqual([["value"]])
  })

  it.each([
    ["stale cached value", "<c r=\"A2\"><f>1+1</f><v>999</v></c>"],
    ["formula without cache", "<c r=\"A2\"><f>1+1</f></c>"],
  ])("rejects every worksheet formula, including a %s", (_case, formulaCell) => {
    expect(() =>
      readFixtureSheet(
        `<Relationship Id="rIdSelected" Type="${worksheetRelationshipType}" Target="worksheets/sheet7.xml"/>`,
        {
          "xl/worksheets/sheet7.xml": worksheetXml(
            "header",
            `<row r="2">${formulaCell}</row>`,
          ),
        },
      ),
    ).toThrow(/formulas are prohibited/u)
  })

  it.each([
    ["missing", ""],
    [
      "unsafe traversal",
      `<Relationship Id="rIdSelected" Type="${worksheetRelationshipType}" Target="../worksheets/sheet7.xml"/>`,
    ],
    [
      "unsafe external target",
      `<Relationship Id="rIdSelected" Type="${worksheetRelationshipType}" Target="https://example.invalid/sheet.xml" TargetMode="External"/>`,
    ],
    [
      "ambiguous",
      [
        `<Relationship Id="rIdSelected" Type="${worksheetRelationshipType}" Target="worksheets/sheet7.xml"/>`,
        `<Relationship Id="rIdSelected" Type="${worksheetRelationshipType}" Target="worksheets/sheet8.xml"/>`,
      ].join(""),
    ],
  ])("fails closed on a %s worksheet relationship", (_case, relationships) => {
    expect(() =>
      readFixtureSheet(relationships, {
        "xl/worksheets/sheet7.xml": worksheetXml("selected"),
        "xl/worksheets/sheet8.xml": worksheetXml("other"),
      }),
    ).toThrow(/relationship|Unsafe/u)
  })

  it("keeps worksheet row filtering on the shared blank predicate", () => {
    const sheet = readFixtureSheet(
      `<Relationship Id="rIdSelected" Type="${worksheetRelationshipType}" Target="worksheets/sheet7.xml"/>`,
      {
        "xl/worksheets/sheet7.xml": worksheetXml(
          "header",
          [
            "<row r=\"2\"><c r=\"A2\" t=\"inlineStr\"><is><t xml:space=\"preserve\"> \t\u00a0 </t></is></c></row>",
            "<row r=\"3\"><c r=\"A3\" t=\"inlineStr\"><is><t>-</t></is></c></row>",
          ].join(""),
        ),
      },
    )

    expect(worksheetBlankV1({ raw_text: " \t\u00a0 " })).toBe(true)
    expect(sheet.rows.map((row) => row.rowNumber)).toEqual([3])
    expect(sheet.blankRowsIgnored).toBe(1)
  })

  it("confines trim-based worksheet blank decisions to worksheetBlankV1", () => {
    const blankAuthoritySources = [
      readFileSync(new URL("../scripts/xlsx.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../scripts/seed15118998-database.ts", import.meta.url), "utf8"),
    ].join("\n")

    expect(blankAuthoritySources.match(/\.trim\(\)\.length/gu)).toHaveLength(1)
  })

  it("does not expose obsolete checksum or header-count gate aliases", () => {
    expect("expectedSourceChecksum" in refreshConfig).toBe(false)
    expect("expectedHeaderCount" in refreshConfig).toBe(false)
  })

  it.each([23, 25])("accepts %i columns when every semantic mapping is exact", (width) => {
    const validation = validateDefaultIndicatorHeaders(headersAtWidth(width), 3)
    expect(validation.ok).toBe(true)
    if (validation.ok) {
      expect(validation.indicatorColumns.size).toBe(5)
      expect(validation.identityColumns.size).toBe(7)
    }
  })

  it("treats prior checksum and header count only as changed audit evidence", () => {
    const evidence = buildRefreshAuditEvidence("b".repeat(64), 25)
    expect(evidence.source_checksum_changed).toBe(true)
    expect(evidence.header_count_changed).toBe(true)
    expect(evidence.observed_header_count).toBe(25)
  })

  it.each([
    ["0", "0"],
    ["000", "0"],
    ["001000", "1000"],
    ["1,000", "1000"],
    ["1,000.5000", "1000.5"],
    [" 12.3400 ", "12.34"],
    [".5", "0.5"],
    [".6", "0.6"],
    [" .1 ", "0.1"],
  ])("accepts exact decimal grammar %j as %j", (rawText, canonicalValue) => {
    expect(parseDecimalCell(rawText)).toMatchObject({
      kind: "numeric",
      canonical_value: canonicalValue,
    })
  })

  it.each([
    "+1",
    "-1",
    "1e3",
    "1 000",
    "1,00",
    "01,000",
    "001,000",
    ".",
    "1.",
    "１２",
  ])("rejects text outside the exact decimal grammar: %j", (rawText) => {
    expect(parseDecimalCell(rawText)).toMatchObject({ kind: "invalid", reason: "invalid_grammar" })
  })

  it("derives every semantic classification from the same validated indexed raw cell", () => {
    const fixture = semanticEvidenceFixture()
    const projections = buildSemanticDigestProjectionInputs(
      fixture.headers,
      fixture.indexedHeaders,
      fixture.validation.parsedHeaders,
      [fixture.row],
      fixture.validation.indicatorColumns,
    )
    const source = projections.source_model_digest_v1
    const classifications = source["classifications"] as readonly JsonObject[]
    const firstIndicatorIndex = Object.values(institutionColumns).length

    expect(classifications[0]?.["raw_text"]).toBe(fixture.row.cells[firstIndicatorIndex]?.raw_text)
    expect(classifications[0]?.["column_ref"]).toBe(
      fixture.row.cells[firstIndicatorIndex]?.column_ref,
    )
  })
  it("projects database rows only from validated indexed cells", () => {
    const fixture = semanticEvidenceFixture()
    const staleValues = fixture.row.values.map(() => "caller-selected stale value")
    const projected = rowObject(fixture.headers, { ...fixture.row, values: staleValues })
    expect(projected[fixture.headers[0] ?? ""]).toBe(fixture.row.cells[0]?.raw_text)

    const absentIndex = fixture.headers.length - 1
    const sparseRow = {
      ...fixture.row,
      values: staleValues,
      cells: fixture.row.cells.filter((cell) => cell.column_index !== absentIndex),
    }
    expect(() => rowObject(fixture.headers, sparseRow)).toThrow(/required indexed worksheet cell/u)

    const duplicateCell = fixture.row.cells[0]!
    expect(() =>
      rowObject(fixture.headers, {
        ...fixture.row,
        cells: [...fixture.row.cells, duplicateCell],
      }),
    ).toThrow(/duplicate|mismatched indexed cell/u)
    expect(() =>
      rowObject(fixture.headers, {
        ...fixture.row,
        cells: [{ ...duplicateCell, worksheet_row: fixture.row.rowNumber + 1 }, ...fixture.row.cells.slice(1)],
      }),
    ).toThrow(/duplicate|mismatched indexed cell/u)
  })

  it("rejects stale legacy values and missing or extra indexed worksheet cells", () => {
    const fixture = semanticEvidenceFixture()
    const staleValues = [...fixture.row.values]
    staleValues[0] = "caller-selected stale school"
    expect(() =>
      buildSemanticDigestProjectionInputs(
        fixture.headers,
        fixture.indexedHeaders,
        fixture.validation.parsedHeaders,
        [{ ...fixture.row, values: staleValues }],
        fixture.validation.indicatorColumns,
      ),
    ).toThrow(/legacy values differ/u)

    expect(() =>
      buildSemanticDigestProjectionInputs(
        fixture.headers,
        fixture.indexedHeaders,
        fixture.validation.parsedHeaders,
        [{
          ...fixture.row,
          values: fixture.row.values.slice(0, -1),
          cells: fixture.row.cells.slice(0, -1),
        }],
        fixture.validation.indicatorColumns,
      ),
    ).toThrow(/source cell .* is missing/u)

    const extraIndex = fixture.headers.length
    expect(() =>
      buildSemanticDigestProjectionInputs(
        fixture.headers,
        fixture.indexedHeaders,
        fixture.validation.parsedHeaders,
        [{
          ...fixture.row,
          values: [...fixture.row.values, "extra"],
          cells: [...fixture.row.cells, {
            worksheet_row: fixture.row.rowNumber,
            column_index: extraIndex,
            column_ref: testColumnReference(extraIndex, fixture.row.rowNumber),
            raw_text: "extra",
          }],
        }],
        fixture.validation.indicatorColumns,
      ),
    ).toThrow(/extra indexed cell/u)
  })

  it.each([
    ["header row", { worksheet_row: 9 }],
    ["header index", { column_index: 1 }],
    ["header raw text", { raw_text: "substituted header" }],
  ])("rejects an indexed %s mismatch against parsed header evidence", (_case, replacement) => {
    const fixture = semanticEvidenceFixture()
    const indexedHeaders = [...fixture.indexedHeaders]
    indexedHeaders[0] = { ...indexedHeaders[0]!, ...replacement }

    expect(() =>
      buildSemanticDigestProjectionInputs(
        fixture.headers,
        indexedHeaders,
        fixture.validation.parsedHeaders,
        [fixture.row],
        fixture.validation.indicatorColumns,
      ),
    ).toThrow(/header evidence mismatch/u)
  })

  it("rejects parsed-header and raw-header parallel representation drift", () => {
    const fixture = semanticEvidenceFixture()
    const parsedHeaders = [...fixture.validation.parsedHeaders]
    parsedHeaders[0] = { ...parsedHeaders[0]!, raw_header: "stale parsed header" }

    expect(() =>
      buildSemanticDigestProjectionInputs(
        fixture.headers,
        fixture.indexedHeaders,
        parsedHeaders,
        [fixture.row],
        fixture.validation.indicatorColumns,
      ),
    ).toThrow(/header evidence mismatch/u)
  })
  it("keeps the canonical raw-cell and classification schema closed", () => {
    expect(seedSchemaContract.raw_rows).toContain("raw_cells_json")
    expect(seedSchemaContract.observations).toContain("canonical_value")
    expect(seedSchemaContract.observation_classifications).toEqual([
      "raw_row_id",
      "institution_id",
      "indicator_id",
      "raw_text",
      "classification",
      "missing_marker",
      "canonical_value",
      "value",
    ])
  })
})

describe("closed semantic digest DAG", () => {
  it("canonicalizes the RFC 8785 JSON domain without key-order dependence", () => {
    const left = { z: 0, a: [true, null, "€", { b: 2, a: 1 }] }
    const right = { a: [true, null, "€", { a: 1, b: 2 }], z: -0 }
    const expected = "{\"a\":[true,null,\"€\",{\"a\":1,\"b\":2}],\"z\":0}"

    expect(canonicalJson(left)).toBe(expected)
    expect(canonicalJson(right)).toBe(expected)
    expect(createHash("sha256").update(canonicalJson(left)).digest("hex")).toBe(
      independentSha256(right),
    )
  })

  it("rejects absent semantic evidence instead of substituting indicator defaults", () => {
    expect(() => buildIndicatorDictionary(undefined as never)).toThrow(
      /semantic projection inputs are required/u,
    )
    expect(() =>
      buildIndicatorDictionary({
        source_model_digest_v1: null,
        seed_logical_digest_v1: seedLogical,
      } as never),
    ).toThrow(/verified source model projection is required/u)
  })

  it("pins every parent projection and named digest to an independent oracle", () => {
    const manifest = manifestWithPhysicalEvidence("2026-01-01T00:00:00.000Z", "a")
    const input = { sourceModel, seedLogical, catalog, manifest }
    const manifestProjection = independentManifestProjection(manifest)
    const releaseProjection = independentReleaseProjection(manifestProjection)
    const projections = buildSemanticDigestProjections(input)
    const digests = buildSemanticDigestDag(input)

    expect(projections).toEqual({
      sourceModel,
      seedLogical,
      catalog,
      manifestSemantic: manifestProjection,
      releaseData: releaseProjection,
    })
    expect(digests).toEqual({
      source_model_digest_v1: independentSha256(sourceModel),
      seed_logical_digest_v1: independentSha256(seedLogical),
      catalog_digest_v1: independentSha256(catalog),
      manifest_semantic_digest_v1: independentSha256(manifestProjection),
      release_data_digest_v1: independentSha256(releaseProjection),
    })
  })

  it("keeps semantics stable only for the explicitly enumerated physical evidence", () => {
    const first = buildSemanticDigestDag({
      sourceModel,
      seedLogical,
      catalog,
      manifest: manifestWithPhysicalEvidence("2026-01-01T00:00:00.000Z", "a"),
    })
    const second = buildSemanticDigestDag({
      sourceModel,
      seedLogical,
      catalog,
      manifest: manifestWithPhysicalEvidence("2027-12-31T23:59:59.999Z", "f"),
    })

    expect(second).toEqual(first)
  })

  it("fails closed when a digest node is missing or adds an unprojected key", () => {
    const manifest = manifestWithPhysicalEvidence("2026-01-01T00:00:00.000Z", "a")
    const { warnings: _warnings, ...missingManifestKey } = manifest

    expect(() =>
      buildSemanticDigestDag({
        sourceModel: { ...sourceModel, unexpected_projection_member: true },
        seedLogical,
        catalog,
        manifest,
      }),
    ).toThrow(/source model projection keys must be exactly/u)
    expect(() =>
      buildSemanticDigestDag({
        sourceModel,
        seedLogical,
        catalog,
        manifest: missingManifestKey as JsonObject,
      }),
    ).toThrow(/manifest projection keys must be exactly/u)
  })

  it("rejects substituted keys inside every closed nested semantic object", () => {
    const manifest = manifestWithPhysicalEvidence("2026-01-01T00:00:00.000Z", "a")
    expect(() =>
      buildSemanticDigestDag({
        sourceModel: {
          ...sourceModel,
          source: { ...projectionSource, substituted_nested_key: true },
        },
        seedLogical,
        catalog,
        manifest,
      }),
    ).toThrow(/source model\.source projection keys must be exactly/u)

    expect(() =>
      buildSemanticDigestDag({
        sourceModel,
        seedLogical,
        catalog,
        manifest: {
          ...manifest,
          observation_counts: {
            ...(manifest["observation_counts"] as JsonObject),
            substituted_nested_key: 1,
          },
        },
      }),
    ).toThrow(/manifest\.observation_counts projection keys must be exactly/u)
  })

  it("rejects missing child bodies and caller-selected child digest/body pairs", () => {
    const manifest = manifestWithPhysicalEvidence("2026-01-01T00:00:00.000Z", "a")
    const validChildren = {
      source_model_digest_v1: {
        projection: sourceModel,
        digest: canonicalSha256(sourceModel),
      },
      seed_logical_digest_v1: {
        projection: seedLogical,
        digest: canonicalSha256(seedLogical),
      },
      catalog_digest_v1: {
        projection: catalog,
        digest: canonicalSha256(catalog),
      },
    }

    expect(() =>
      buildManifestSemanticProjection(manifest, {
        ...validChildren,
        source_model_digest_v1: {
          projection: sourceModel,
          digest: "0".repeat(64),
        },
      }),
    ).toThrow(/digest does not match .* projection body/u)

    const { catalog_digest_v1: _catalog, ...missingChild } = validChildren
    expect(() =>
      buildManifestSemanticProjection(manifest, missingChild as never),
    ).toThrow(/children projection keys must be exactly/u)

    const manifestProjection = buildManifestSemanticProjection(manifest, validChildren)
    const substitutedManifestProjection = {
      ...manifestProjection,
      child_digests: {
        ...(manifestProjection["child_digests"] as JsonObject),
        source_model_digest_v1: "f".repeat(64),
      },
    }
    expect(() =>
      buildReleaseDataProjection({
        ...validChildren,
        manifest_semantic_digest_v1: {
          projection: substitutedManifestProjection,
          digest: canonicalSha256(substitutedManifestProjection),
        },
      }),
    ).toThrow(/differs from the manifest child edge/u)
  })
  it("accepts only classifications recomputed from indexed raw text", () => {
    const fixture = relationalDigestFixture()
    expect(() =>
      buildSemanticDigestDag({
        sourceModel: fixture.source,
        seedLogical: fixture.seed,
        catalog: fixture.catalog,
        manifest: fixture.manifest,
      }),
    ).not.toThrow()

    const classifications = fixture.source["classifications"] as readonly JsonObject[]
    const mismatchedSource = {
      ...fixture.source,
      classifications: [
        { ...classifications[0]!, canonical_value: "999" },
        ...classifications.slice(1),
      ],
    }
    expect(() =>
      buildSemanticDigestDag({
        sourceModel: mismatchedSource,
        seedLogical: fixture.seed,
        catalog: fixture.catalog,
        manifest: withProjectionInputs(fixture.manifest, mismatchedSource, fixture.seed),
      }),
    ).toThrow(/recomputed exact decimal classification/u)
  })
  it("rejects a retained classification when its indexed cell is absent from both child projections", () => {
    const fixture = relationalDigestFixture()
    const classification = (fixture.source["classifications"] as readonly JsonObject[])[0]!
    const worksheetRow = classification["worksheet_row"]
    const columnIndex = classification["column_index"]
    const removeClassifiedCell = (rows: JsonValue): readonly JsonObject[] =>
      (rows as readonly JsonObject[]).map((row) => ({
        ...row,
        cells: (row["cells"] as readonly JsonObject[]).filter(
          (cell) =>
            cell["worksheet_row"] !== worksheetRow
            || cell["column_index"] !== columnIndex,
        ),
      }))
    const missingSource = {
      ...fixture.source,
      rows: removeClassifiedCell(fixture.source["rows"]),
    }
    const missingSeed = {
      ...fixture.seed,
      raw_rows: removeClassifiedCell(fixture.seed["raw_rows"]),
    }

    expect(() =>
      buildSemanticDigestDag({
        sourceModel: missingSource,
        seedLogical: missingSeed,
        catalog: fixture.catalog,
        manifest: withProjectionInputs(fixture.manifest, missingSource, missingSeed),
      }),
    ).toThrow(/not uniquely derived from its indexed raw cell/u)
  })
  it("rejects an absent identity cell even when projected identity text is empty", () => {
    const fixture = relationalDigestFixture()
    const identityIndex = (fixture.source["headers"] as readonly JsonObject[]).find(
      (header) => header["match_header"] === institutionColumns.schoolKind,
    )?.["column_index"] as number
    const removeIdentityCell = (rows: JsonValue): readonly JsonObject[] =>
      (rows as readonly JsonObject[]).map((row) => ({
        ...row,
        cells: (row["cells"] as readonly JsonObject[]).filter(
          (cell) => cell["column_index"] !== identityIndex,
        ),
      }))
    const sourceWithoutIdentity = {
      ...fixture.source,
      rows: removeIdentityCell(fixture.source["rows"]),
    }
    const seedWithoutIdentity = {
      ...fixture.seed,
      raw_rows: removeIdentityCell(fixture.seed["raw_rows"]),
      institutions: (fixture.seed["institutions"] as readonly JsonObject[]).map((institution) => ({
        ...institution,
        school_kind: "",
      })),
    }

    expect(() =>
      buildSemanticDigestDag({
        sourceModel: sourceWithoutIdentity,
        seedLogical: seedWithoutIdentity,
        catalog: fixture.catalog,
        manifest: withProjectionInputs(
          fixture.manifest,
          sourceWithoutIdentity,
          seedWithoutIdentity,
        ),
      }),
    ).toThrow(/exact indexed header coverage/u)
  })

  it("rejects missing, extra, and duplicate row×indicator classifications", () => {
    const fixture = relationalDigestFixture()
    const classifications = fixture.source["classifications"] as readonly JsonObject[]
    const missing = { ...fixture.source, classifications: classifications.slice(1) }
    const duplicate = { ...fixture.source, classifications: [...classifications, classifications[0]!] }
    const extra = {
      ...fixture.source,
      classifications: [
        ...classifications,
        {
          ...classifications[0]!,
          worksheet_row: 999,
          column_ref: testColumnReference(
            classifications[0]?.["column_index"] as number,
            999,
          ),
        },
      ],
    }

    for (const source of [missing, extra, duplicate]) {
      expect(() =>
        buildSemanticDigestDag({
          sourceModel: source,
          seedLogical: fixture.seed,
          catalog: fixture.catalog,
          manifest: withProjectionInputs(fixture.manifest, source, fixture.seed),
        }),
      ).toThrow(/coverage|source row|duplicate|indexed raw cell/u)
    }
  })

  it("rejects institution and closed-catalog metadata mismatches", () => {
    const fixture = relationalDigestFixture()
    const institutions = fixture.seed["institutions"] as readonly JsonObject[]
    const mismatchedSeed = {
      ...fixture.seed,
      institutions: [
        { ...institutions[0]!, region_name: "attested region" },
        ...institutions.slice(1),
      ],
    }
    expect(() =>
      buildSemanticDigestDag({
        sourceModel: fixture.source,
        seedLogical: mismatchedSeed,
        catalog: fixture.catalog,
        manifest: withProjectionInputs(fixture.manifest, fixture.source, mismatchedSeed),
      }),
    ).toThrow(/institution region_name is not derived/u)

    const catalogIndicators = fixture.catalog["indicators"] as readonly JsonObject[]
    const mismatchedCatalog = {
      ...fixture.catalog,
      indicators: [
        { ...catalogIndicators[0]!, label_ko: "attested label" },
        ...catalogIndicators.slice(1),
      ],
    }
    expect(() =>
      buildSemanticDigestDag({
        sourceModel: fixture.source,
        seedLogical: fixture.seed,
        catalog: mismatchedCatalog,
        manifest: fixture.manifest,
      }),
    ).toThrow(/metadata does not match the closed catalog/u)
  })

  it("rejects manifest and audit counts that diverge from the validated graph", () => {
    const fixture = relationalDigestFixture()
    const counts = fixture.manifest["observation_counts"] as JsonObject
    const wrongCounts = { ...counts, competition_rate: 0 }
    expect(() =>
      buildSemanticDigestDag({
        sourceModel: fixture.source,
        seedLogical: fixture.seed,
        catalog: fixture.catalog,
        manifest: { ...fixture.manifest, observation_counts: wrongCounts },
      }),
    ).toThrow(/derived from validated classifications/u)

    const audit = fixture.manifest["audit_evidence"] as JsonObject
    expect(() =>
      buildSemanticDigestDag({
        sourceModel: fixture.source,
        seedLogical: fixture.seed,
        catalog: fixture.catalog,
        manifest: {
          ...fixture.manifest,
          audit_evidence: { ...audit, observation_counts: wrongCounts },
        },
      }),
    ).toThrow(/derived from validated classifications/u)
  })

  it("propagates valid child changes while rejecting relational drift", () => {
    const manifest = manifestWithPhysicalEvidence("2026-01-01T00:00:00.000Z", "a")
    const baseline = buildSemanticDigestDag({ sourceModel, seedLogical, catalog, manifest })
    const changedSource = {
      ...sourceModel,
      headers: [{
        ...((sourceModel["headers"] as readonly JsonObject[])[0] as JsonObject),
        raw_text: "source-child-changed",
        match_header: "source-child-changed",
      }],
    }
    const changedCatalog = {
      ...catalog,
      source: {
        ...(catalog["source"] as JsonObject),
        base_year: "catalog-child-changed",
      },
    }
    const cases = [
      {
        child: "source_model_digest_v1",
        input: {
          sourceModel: changedSource,
          seedLogical,
          catalog,
          manifest: withProjectionInputs(manifest, changedSource, seedLogical),
        },
      },
      {
        child: "catalog_digest_v1",
        input: {
          sourceModel,
          seedLogical,
          catalog: changedCatalog,
          manifest,
        },
      },
    ] as const

    for (const testCase of cases) {
      const changed = buildSemanticDigestDag(testCase.input)
      expect(changed[testCase.child]).not.toBe(baseline[testCase.child])
      expect(changed.manifest_semantic_digest_v1).not.toBe(
        baseline.manifest_semantic_digest_v1,
      )
      expect(changed.release_data_digest_v1).not.toBe(baseline.release_data_digest_v1)
      expect(changed.seed_logical_digest_v1).toBe(baseline.seed_logical_digest_v1)
    }

    const driftedSeed = {
      ...seedLogical,
      institutions: [{
        school_name: "unmapped",
        campus_name: "main",
        school_kind: "",
        school_type: "",
        establishment_type: "",
        region_name: "",
      }],
    }
    expect(() =>
      buildSemanticDigestDag({
        sourceModel,
        seedLogical: driftedSeed,
        catalog,
        manifest: withProjectionInputs(manifest, sourceModel, driftedSeed),
      }),
    ).toThrow(/exact bijection/u)
  })
})
