import {
  expectedSourceChecksum,
  indicatorSpecs,
  rawFilePath,
  type HeaderValidationResult,
  type ObservationCountMap,
} from "./seed15118998-config.js"
import { parseHeader, sha256File } from "./seed15118998-utils.js"

export function validateDefaultIndicatorHeaders(headers: readonly string[]): HeaderValidationResult {
  const parsedHeaders = headers.map(parseHeader)
  const indicatorColumns = new Map<string, number>()
  const warnings: string[] = []

  for (const spec of indicatorSpecs) {
    const index = headers.findIndex((header) => header === spec.source_column)
    const parsed = index >= 0 ? parsedHeaders[index] : undefined

    if (
      index < 0 ||
      parsed === undefined ||
      parsed.parsed_label !== spec.label_ko ||
      parsed.parsed_year !== spec.year ||
      parsed.parsed_unit !== spec.unit
    ) {
      warnings.push(
        `${spec.indicator_id}: required source column was not verified from the 15118998 header.`,
      )
      continue
    }

    indicatorColumns.set(spec.indicator_id, index)
  }

  if (warnings.length > 0) {
    return { ok: false, parsedHeaders, warnings }
  }

  return { ok: true, parsedHeaders, indicatorColumns, warnings }
}

export function assertAllDefaultIndicatorsMapped(observationCounts: ObservationCountMap): void {
  for (const spec of indicatorSpecs) {
    if ((observationCounts[spec.indicator_id] ?? 0) <= 0) {
      throw new Error(`No mapped observations for ${spec.indicator_id}.`)
    }
  }
}

export function requireSourceChecksum(): string {
  const actual = sha256File(rawFilePath)

  if (actual !== expectedSourceChecksum) {
    throw new Error(`NO-GO: 15118998 source checksum mismatch: ${actual}.`)
  }

  return actual
}
