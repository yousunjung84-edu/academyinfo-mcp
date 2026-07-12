import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { indicatorCatalogSchema } from "./catalog-schema.js"
import { findProjectRoot } from "./database-paths.js"
import type { IndicatorCatalog } from "./catalog-schema.js"

export type SourceMetadata = {
  readonly dataset_id: string
  readonly dataset_name: string
  readonly provider: string
  readonly source_url: string
  readonly license: string
  readonly derived_database: boolean
  readonly bundled: boolean
  readonly source_column: string
  readonly base_year: string
  readonly unit: string
}

export type IndicatorDefinition = {
  readonly indicator: string
  readonly label: string
  readonly label_ko: string
  readonly source_column: string
  readonly source_column_verified: boolean
  readonly base_year: string
  readonly unit: string
  readonly enabled: boolean
  readonly dataset_id: string
  readonly note?: string
}

function freezeCatalog(catalog: IndicatorCatalog): Readonly<IndicatorCatalog> {
  Object.freeze(catalog.source)

  for (const indicator of catalog.indicators) {
    Object.freeze(indicator)
  }

  Object.freeze(catalog.indicators)
  return Object.freeze(catalog)
}

function loadCatalog(): Readonly<IndicatorCatalog> {
  try {
    const projectRoot = findProjectRoot(dirname(fileURLToPath(import.meta.url)))
    const catalogJson: unknown = JSON.parse(
      readFileSync(join(projectRoot, "data", "seed", "indicators.json"), "utf8"),
    )

    return freezeCatalog(indicatorCatalogSchema.parse(catalogJson))
  } catch {
    throw new Error("Bundled indicator catalog is missing or invalid.")
  }
}

export const indicatorCatalog = loadCatalog()

export const bundledSource: SourceMetadata = indicatorCatalog.source

export const granularEmploymentBacklogSource: SourceMetadata = {
  dataset_id: "15139279",
  dataset_name: "granular employment statistics backlog",
  provider: "NotVerified",
  source_url: "NotVerified",
  license: "NotVerified",
  derived_database: false,
  bundled: false,
  source_column: "NotVerified",
  base_year: "NotVerified",
  unit: "NotVerified",
}

export const defaultIndicators: readonly IndicatorDefinition[] = Object.freeze(
  indicatorCatalog.indicators.map((indicator) =>
    Object.freeze({
      indicator: indicator.indicator_id,
      label: indicator.label_ko,
      label_ko: indicator.label_ko,
      source_column: indicator.source_column,
      source_column_verified: indicator.source_column_verified,
      base_year: String(indicator.year),
      unit: indicator.unit,
      enabled: indicator.enabled_by_default,
      dataset_id: indicator.source_dataset_id,
      ...(indicator.note === undefined ? {} : { note: indicator.note }),
    }),
  ),
)

export function sourceForIndicator(indicator: IndicatorDefinition): SourceMetadata {
  return Object.freeze({
    ...bundledSource,
    source_column: indicator.source_column,
    base_year: indicator.base_year,
    unit: indicator.unit,
  })
}

export const defaultIndicatorSources: readonly SourceMetadata[] = Object.freeze(
  defaultIndicators.map(sourceForIndicator),
)

export function commonWarnings(extraWarnings: readonly string[]): readonly string[] {
  return [
    "v0.1 runs in file-first mode and does not require reserved API-key environment variables.",
    "The bundled seed DB is a normalized derivative of dataset 15118998, not a raw source file.",
    "15118998 indicator source columns, years, and units follow the verified header policy.",
    ...extraWarnings,
  ]
}

export function indicatorByName(
  indicatorName: string | undefined,
): IndicatorDefinition | undefined {
  return defaultIndicators.find((indicator) => indicator.indicator === indicatorName)
}

export function invalidIndicatorNames(
  indicatorNames: readonly string[] | undefined,
): readonly string[] {
  if (indicatorNames === undefined || indicatorNames.length === 0) {
    return []
  }

  return indicatorNames.filter((indicatorName) => indicatorByName(indicatorName.trim()) === undefined)
}