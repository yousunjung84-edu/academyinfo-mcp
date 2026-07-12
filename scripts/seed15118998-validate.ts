import {
  indicatorSpecs,
  institutionColumns,
  rawFilePath,
  type HeaderValidationResult,
  type ObservationCountMap,
} from "./seed15118998-config.js"
import { parseHeader, sha256Bytes, sha256File } from "./seed15118998-utils.js"
export {
  classifyDecimalCell,
  parseDecimalCell,
  type DecimalClassification,
  type DecimalParseResult,
  type DecimalRejectionReason,
} from "../src/canonical-decimal.js"

export type CoverageSummary = {
  readonly source_rows: number
  readonly raw_rows: number
  readonly institutions: number
  readonly classifications: number
}

export function normalizeHeaderForMatch(rawHeader: string): string {
  return rawHeader.replace(/^\uFEFF/u, "").replaceAll("\r\n", "\n")
}

function columnReference(index: number, rowNumber: number): string {
  let value = index + 1
  let letters = ""

  while (value > 0) {
    const remainder = (value - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    value = Math.floor((value - 1) / 26)
  }

  return `${letters}${rowNumber}`
}

export function validateDefaultIndicatorHeaders(
  headers: readonly string[],
  worksheetRow = 1,
): HeaderValidationResult {
  const parsedHeaders = headers.map((rawHeader, columnIndex) => {
    const matchHeader = normalizeHeaderForMatch(rawHeader)
    const parsed = parseHeader(matchHeader)
    return {
      ...parsed,
      worksheet_row: worksheetRow,
      column_index: columnIndex,
      column_ref: columnReference(columnIndex, worksheetRow),
      raw_text: rawHeader,
      raw_header: rawHeader,
      match_header: matchHeader,
      checksum_sha256: sha256Bytes(rawHeader),
    }
  })
  const indicatorColumns = new Map<string, number>()
  const identityColumns = new Map<string, number>()
  const warnings: string[] = []

  const headerIndexes = new Map<string, number[]>()
  for (const header of parsedHeaders) {
    const indexes = headerIndexes.get(header.match_header) ?? []
    indexes.push(header.column_index)
    headerIndexes.set(header.match_header, indexes)

    if (header.match_header.trim().length === 0) {
      warnings.push(`blank header at ${header.column_ref}`)
    }
  }

  for (const [header, indexes] of headerIndexes) {
    if (indexes.length > 1) {
      warnings.push(`duplicate header ${JSON.stringify(header)} at columns ${indexes.join(",")}`)
    }
  }

  for (const requiredHeader of Object.values(institutionColumns)) {
    const indexes = headerIndexes.get(requiredHeader) ?? []
    if (indexes.length !== 1) {
      warnings.push(
        `${requiredHeader}: required identity/response header must map exactly once; found ${indexes.length}.`,
      )
      continue
    }
    identityColumns.set(requiredHeader, indexes[0] as number)
  }

  for (const spec of indicatorSpecs) {
    const labelMatches = parsedHeaders.filter((header) => header.parsed_label === spec.label_ko)
    if (labelMatches.length !== 1) {
      warnings.push(
        `${spec.indicator_id}: logical indicator label must map exactly once; found ${labelMatches.length}.`,
      )
      continue
    }

    const parsed = labelMatches[0]
    if (
      parsed === undefined ||
      parsed.parsed_year === null ||
      !Number.isInteger(parsed.parsed_year) ||
      parsed.parsed_year < spec.year ||
      parsed.parsed_unit !== spec.unit
    ) {
      warnings.push(
        `${spec.indicator_id}: source year must be a nondecreasing integer and unit must remain ${JSON.stringify(spec.unit)}.`,
      )
      continue
    }

    indicatorColumns.set(spec.indicator_id, parsed.column_index)
  }

  if (warnings.length > 0) {
    return { ok: false, parsedHeaders, warnings }
  }

  return { ok: true, parsedHeaders, indicatorColumns, identityColumns, warnings }
}

export function assertExactRowCoverage(coverage: CoverageSummary): void {
  if (
    coverage.source_rows !== coverage.raw_rows ||
    coverage.source_rows !== coverage.institutions
  ) {
    throw new Error(
      `NO-GO: row coverage mismatch: source=${coverage.source_rows}, raw=${coverage.raw_rows}, institutions=${coverage.institutions}.`,
    )
  }

  const expectedClassifications = coverage.source_rows * indicatorSpecs.length
  if (coverage.classifications !== expectedClassifications) {
    throw new Error(
      `NO-GO: classification coverage mismatch: expected=${expectedClassifications}, actual=${coverage.classifications}.`,
    )
  }
}

export function assertAllDefaultIndicatorsMapped(observationCounts: ObservationCountMap): void {
  for (const spec of indicatorSpecs) {
    if (!(spec.indicator_id in observationCounts)) {
      throw new Error(`Missing observation classification count for ${spec.indicator_id}.`)
    }
  }
}

/**
 * Returns the post-download checksum as audit evidence. A changed checksum is
 * neither source authentication nor a refresh rejection by itself.
 */
export function requireSourceChecksum(): string {
  return sha256File(rawFilePath)
}
