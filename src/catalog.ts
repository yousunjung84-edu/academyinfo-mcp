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

export const bundledSource: SourceMetadata = {
  dataset_id: "15118998",
  dataset_name: "교육부_대학알리미_대학주요정보",
  provider: "교육부",
  source_url: "https://www.data.go.kr/data/15118998/fileData.do",
  license: "KOGL-1 / 공공누리 제1유형(출처표시)",
  derived_database: true,
  bundled: true,
  source_column: "NotVerified",
  base_year: "NotVerified",
  unit: "NotVerified",
}

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

export const defaultIndicators: readonly IndicatorDefinition[] = [
  {
    indicator: "competition_rate",
    label: "\uC2E0\uC785\uC0DD \uACBD\uC7C1\uB960",
    label_ko: "\uC2E0\uC785\uC0DD \uACBD\uC7C1\uB960",
    source_column: "\uC2E0\uC785\uC0DD \uACBD\uC7C1\uB960\n(2025,:1)",
    source_column_verified: true,
    base_year: "2025",
    unit: ":1",
    enabled: true,
    dataset_id: "15118998",
  },
  {
    indicator: "fill_rate",
    label: "\uC2E0\uC785\uC0DD \uCDA9\uC6D0\uC728",
    label_ko: "\uC2E0\uC785\uC0DD \uCDA9\uC6D0\uC728",
    source_column: "\uC2E0\uC785\uC0DD \uCDA9\uC6D0\uC728\n(2025,%)",
    source_column_verified: true,
    base_year: "2025",
    unit: "%",
    enabled: true,
    dataset_id: "15118998",
  },
  {
    indicator: "employment_rate",
    label: "\uCDE8\uC5C5\uB960",
    label_ko: "\uCDE8\uC5C5\uB960",
    source_column: "\uCDE8\uC5C5\uB960\n(2025,%)",
    source_column_verified: true,
    base_year: "2025",
    unit: "%",
    enabled: true,
    dataset_id: "15118998",
    note: "School-level employment rate from dataset 15118998.",
  },
  {
    indicator: "scholarship_per_student",
    label: "\uD559\uC0DD 1\uC778\uB2F9 \uC5F0\uAC04 \uC7A5\uD559\uAE08",
    label_ko: "\uD559\uC0DD 1\uC778\uB2F9 \uC5F0\uAC04 \uC7A5\uD559\uAE08",
    source_column: "\uD559\uC0DD 1\uC778\uB2F9 \uC5F0\uAC04 \uC7A5\uD559\uAE08\n(2025,\uC6D0)",
    source_column_verified: true,
    base_year: "2025",
    unit: "\uC6D0",
    enabled: true,
    dataset_id: "15118998",
  },
  {
    indicator: "avg_tuition",
    label: "\uD3C9\uADE0 \uB4F1\uB85D\uAE08",
    label_ko: "\uD3C9\uADE0 \uB4F1\uB85D\uAE08",
    source_column: "\uD3C9\uADE0 \uB4F1\uB85D\uAE08\n(2026,\uCC9C\uC6D0)",
    source_column_verified: true,
    base_year: "2026",
    unit: "\uCC9C\uC6D0",
    enabled: true,
    dataset_id: "15118998",
  },
]

export function sourceForIndicator(indicator: IndicatorDefinition): SourceMetadata {
  return {
    ...bundledSource,
    source_column: indicator.source_column,
    base_year: indicator.base_year,
    unit: indicator.unit,
  }
}

export const defaultIndicatorSources: readonly SourceMetadata[] =
  defaultIndicators.map(sourceForIndicator)

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
