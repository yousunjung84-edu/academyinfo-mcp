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

export type IndexedCell = {
  readonly worksheet_row: number
  readonly column_index: number
  readonly column_ref: string
  readonly raw_text: string
}

export type ParsedHeader = Partial<IndexedCell> & {
  readonly raw_header: string
  readonly match_header?: string
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
      readonly identityColumns: ReadonlyMap<string, number>
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
/**
 * Historical values retained only so the existing writer can describe the
 * currently bundled artifact. They are not refresh acceptance criteria.
 */
export const priorAuditSourceChecksum = "53f7e7fbb446206a47fab1adc622d551ba88ba7f3c25ae0cdc8e41cddc637621"
export const priorAuditHeaderCount = 24
export const expectedSheetName = "Sheet1"

export const indicatorSpecs: readonly IndicatorSpec[] = [
  { indicator_id: "competition_rate", label_ko: "신입생 경쟁률", source_column: "신입생 경쟁률\n(2025,:1)", year: 2025, unit: ":1" },
  { indicator_id: "fill_rate", label_ko: "신입생 충원율", source_column: "신입생 충원율\n(2025,%)", year: 2025, unit: "%" },
  { indicator_id: "employment_rate", label_ko: "취업률", source_column: "취업률\n(2025,%)", year: 2025, unit: "%", note: "School-level employment rate from dataset 15118998." },
  { indicator_id: "scholarship_per_student", label_ko: "학생 1인당 연간 장학금", source_column: "학생 1인당 연간 장학금\n(2025,원)", year: 2025, unit: "원" },
  { indicator_id: "avg_tuition", label_ko: "평균 등록금", source_column: "평균 등록금\n(2026,천원)", year: 2026, unit: "천원" },
  { indicator_id: "admission_quota", label_ko: "입학정원", source_column: "입학정원\n(2025,명)", year: 2025, unit: "명" },
  { indicator_id: "graduates_count", label_ko: "졸업생수", source_column: "졸업생수\n(2025,명)", year: 2025, unit: "명" },
  { indicator_id: "fulltime_faculty_count", label_ko: "전임교원수(학부+대학원)", source_column: "전임교원수(학부+대학원)\n(2025,명)", year: 2025, unit: "명" },
  { indicator_id: "enrolled_students", label_ko: "재학생", source_column: "재학생\n(2025,명)", year: 2025, unit: "명" },
  { indicator_id: "international_students", label_ko: "외국인 학생 수", source_column: "외국인 학생 수\n(2025,명)", year: 2025, unit: "명" },
  { indicator_id: "students_per_fulltime_faculty", label_ko: "전임교원 1인당 학생 수(학생정원기준)(학부+대학원)", source_column: "전임교원 1인당 학생 수(학생정원기준)(학부+대학원)\n(2025,명)", year: 2025, unit: "명" },
  { indicator_id: "fulltime_faculty_ratio_quota", label_ko: "전임교원 확보율(학생정원기준)(학부+대학원)", source_column: "전임교원 확보율(학생정원기준)(학부+대학원)\n(2025,%)", year: 2025, unit: "%" },
  { indicator_id: "fulltime_faculty_ratio_enrolled", label_ko: "전임 교원 확보율(재학생 기준)(학부+대학원)", source_column: "전임 교원 확보율(재학생 기준)(학부+대학원)\n(2025,%)", year: 2025, unit: "%" },
  { indicator_id: "fulltime_faculty_lecture_ratio", label_ko: "전임교원 강의 담당 비율", source_column: "전임교원 강의 담당 비율\n(2025,%)", year: 2025, unit: "%" },
  { indicator_id: "education_expense_per_student", label_ko: "학생 1인당 교육비(학부+대학원)", source_column: "학생 1인당 교육비(학부+대학원)\n(2025,천원)", year: 2025, unit: "천원" },
  { indicator_id: "dormitory_capacity_rate", label_ko: "기숙사 수용율(학부+대학원)", source_column: "기숙사 수용율(학부+대학원)\n(2025,%)", year: 2025, unit: "%" },
  { indicator_id: "books_per_student", label_ko: "학생 1인당 도서 자료 수(학부+대학원)", source_column: "학생 1인당 도서 자료 수(학부+대학원)\n(2025,권)", year: 2025, unit: "권" },
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
