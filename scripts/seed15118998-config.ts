import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"

export type IndicatorSpec = {
  readonly indicator_id: string
  readonly label_ko: string
  readonly source_column: string
  readonly year: number
  readonly unit: string
  readonly note?: string
}

export type ParsedHeader = {
  readonly raw_header: string
  readonly parsed_label: string
  readonly parsed_year: number | null
  readonly parsed_unit: string | null
  readonly checksum_sha256: string
}

export type HeaderValidationResult =
  | {
      readonly ok: true
      readonly parsedHeaders: readonly ParsedHeader[]
      readonly indicatorColumns: ReadonlyMap<string, number>
      readonly warnings: readonly string[]
    }
  | {
      readonly ok: false
      readonly parsedHeaders: readonly ParsedHeader[]
      readonly warnings: readonly string[]
    }

export type ObservationCountMap = Readonly<Record<string, number>>

function findProjectRoot(startDirectory: string): string {
  let current = resolve(startDirectory)

  while (!existsSync(join(current, "package.json"))) {
    const parent = dirname(current)

    if (parent === current) {
      throw new Error("Could not locate project root package.json.")
    }

    current = parent
  }

  return current
}

export const projectRoot = findProjectRoot(dirname(fileURLToPath(import.meta.url)))
export const datasetId = "15118998"
export const datasetName = "교육부_대학알리미_대학주요정보"
export const provider = "교육부"
export const sourceUrl = "https://www.data.go.kr/data/15118998/fileData.do"
export const license = "KOGL-1 / 공공누리 제1유형(출처표시)"
export const sourceFileName = "대학주요정보.xlsx"
export const rawFilePath = join(projectRoot, "data", "raw", datasetId, sourceFileName)
export const seedDbPath = join(projectRoot, "data", "seed", "academyinfo_15118998.sqlite")
export const manifestPath = join(projectRoot, "data", "seed", "academyinfo_15118998.manifest.json")
export const indicatorJsonPath = join(projectRoot, "data", "seed", "indicators.json")
export const headerSnapshotPath = join(projectRoot, "evidence", "header-snapshots", "15118998.headers.json")
export const sampleRowsPath = join(projectRoot, "evidence", "sample-rows", "15118998.sample.json")
export const checksumsPath = join(projectRoot, "evidence", "checksums", "15118998.checksums.json")
export const expectedSourceChecksum = "53f7e7fbb446206a47fab1adc622d551ba88ba7f3c25ae0cdc8e41cddc637621"
export const expectedSheetName = "Sheet1"
export const expectedHeaderCount = 24

export const indicatorSpecs: readonly IndicatorSpec[] = [
  { indicator_id: "competition_rate", label_ko: "신입생 경쟁률", source_column: "신입생 경쟁률\n(2025,:1)", year: 2025, unit: ":1" },
  { indicator_id: "fill_rate", label_ko: "신입생 충원율", source_column: "신입생 충원율\n(2025,%)", year: 2025, unit: "%" },
  { indicator_id: "employment_rate", label_ko: "취업률", source_column: "취업률\n(2025,%)", year: 2025, unit: "%", note: "School-level employment rate from dataset 15118998." },
  { indicator_id: "scholarship_per_student", label_ko: "학생 1인당 연간 장학금", source_column: "학생 1인당 연간 장학금\n(2025,원)", year: 2025, unit: "원" },
  { indicator_id: "avg_tuition", label_ko: "평균 등록금", source_column: "평균 등록금\n(2026,천원)", year: 2026, unit: "천원" },
]

export const institutionColumns = {
  rowNumber: "No",
  schoolName: "학교명",
  campusName: "본분교명",
  schoolKind: "학교종류",
  schoolType: "학교유형",
  establishmentType: "설립유형",
  regionName: "지역명",
} as const
