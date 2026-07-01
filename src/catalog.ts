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
  readonly source_column: string
  readonly source_column_verified: boolean
  readonly base_year: string
  readonly unit: string
  readonly enabled: boolean
  readonly dataset_id: string
}

export const bundledSource: SourceMetadata = {
  dataset_id: "15118998",
  dataset_name:
    "Ministry of Education academyinfo university major information disclosure file",
  provider: "Ministry of Education",
  source_url: "https://www.data.go.kr/data/15118998/fileData.do",
  license: "KOGL-1 / Open Government License Type 1 (Attribution)",
  derived_database: true,
  bundled: true,
  source_column: "NotVerified",
  base_year: "NotVerified",
  unit: "NotVerified",
}

export const employmentLocalIngestSource: SourceMetadata = {
  dataset_id: "15139279",
  dataset_name: "employment data",
  provider: "NotVerified",
  source_url: "NotVerified",
  license: "NotVerified",
  derived_database: false,
  bundled: false,
  source_column: "NotVerified",
  base_year: "NotVerified",
  unit: "NotVerified",
}

export const defaultIndicators: readonly IndicatorDefinition[] = [
  {
    indicator: "freshman_competition_rate",
    label: "freshman competition rate",
    source_column: "NotVerified",
    source_column_verified: false,
    base_year: "NotVerified",
    unit: "NotVerified",
    enabled: true,
    dataset_id: "15118998",
  },
  {
    indicator: "freshman_fill_rate",
    label: "freshman fill rate",
    source_column: "NotVerified",
    source_column_verified: false,
    base_year: "NotVerified",
    unit: "NotVerified",
    enabled: true,
    dataset_id: "15118998",
  },
  {
    indicator: "average_undergraduate_tuition",
    label: "average undergraduate tuition",
    source_column: "NotVerified",
    source_column_verified: false,
    base_year: "NotVerified",
    unit: "NotVerified",
    enabled: true,
    dataset_id: "15118998",
  },
  {
    indicator: "scholarship_per_undergraduate_student",
    label: "scholarship per undergraduate student",
    source_column: "NotVerified",
    source_column_verified: false,
    base_year: "NotVerified",
    unit: "NotVerified",
    enabled: true,
    dataset_id: "15118998",
  },
]

export function commonWarnings(extraWarnings: readonly string[]): readonly string[] {
  return [
    "v0.1 runs in file-first mode and does not require reserved API-key environment variables.",
    "The bundled seed artifact is currently metadata-only and contains no observation rows.",
    "Source columns, base years, and units remain NotVerified until header evidence is locked.",
    ...extraWarnings,
  ]
}

export function indicatorByName(
  indicatorName: string | undefined,
): IndicatorDefinition | undefined {
  return defaultIndicators.find((indicator) => indicator.indicator === indicatorName)
}
