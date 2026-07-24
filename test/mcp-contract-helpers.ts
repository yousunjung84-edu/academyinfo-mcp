import { expect } from "vitest"
import { z } from "zod"

const reservedDataKeyName = ["DATA", "GO", "KR", "SERVICE", "KEY"].join("_")
const reservedAcademyinfoKeyName = ["ACADEMYINFO", "SERVICE", "KEY"].join("_")

export const sourceSchema = z.object({
  dataset_id: z.string(),
  dataset_name: z.string(),
  provider: z.string(),
  source_url: z.string(),
  license: z.string(),
  derived_database: z.boolean(),
  bundled: z.boolean(),
  source_column: z.string(),
  year: z.string().optional(),
  base_year: z.string(),
  unit: z.string(),
})

export const responseSchema = z
  .object({
    status: z.string(),
    tool: z.string(),
    query: z.record(z.string(), z.unknown()),
    data: z.unknown(),
    warnings: z.array(z.string()),
    generated_at: z.string(),
  })
  .and(z.union([z.object({ source: sourceSchema }), z.object({ sources: z.array(sourceSchema) })]))

export const indicatorSchema = z.object({
  indicator: z.string(),
  label: z.string(),
  label_ko: z.string(),
  dataset_id: z.string(),
  source_column: z.string(),
  source_column_verified: z.boolean(),
  base_year: z.string(),
  unit: z.string(),
  enabled: z.boolean(),
  note: z.string().optional(),
})

export const metricContractSchema = z.object({
  indicator: z.string(),
  dataset_id: z.string(),
  source_column: z.string(),
  base_year: z.string(),
  unit: z.string(),
  source: sourceSchema,
  warnings: z.array(z.string()),
})

export const expectedDefaultIndicators = [
  {
    indicator: "competition_rate",
    label_ko: "\uC2E0\uC785\uC0DD \uACBD\uC7C1\uB960",
    source_column: "\uC2E0\uC785\uC0DD \uACBD\uC7C1\uB960\n(2025,:1)",
    base_year: "2025",
    unit: ":1",
  },
  {
    indicator: "fill_rate",
    label_ko: "\uC2E0\uC785\uC0DD \uCDA9\uC6D0\uC728",
    source_column: "\uC2E0\uC785\uC0DD \uCDA9\uC6D0\uC728\n(2025,%)",
    base_year: "2025",
    unit: "%",
  },
  {
    indicator: "employment_rate",
    label_ko: "\uCDE8\uC5C5\uB960",
    source_column: "\uCDE8\uC5C5\uB960\n(2025,%)",
    base_year: "2025",
    unit: "%",
  },
  {
    indicator: "scholarship_per_student",
    label_ko: "\uD559\uC0DD 1\uC778\uB2F9 \uC5F0\uAC04 \uC7A5\uD559\uAE08",
    source_column: "\uD559\uC0DD 1\uC778\uB2F9 \uC5F0\uAC04 \uC7A5\uD559\uAE08\n(2025,\uC6D0)",
    base_year: "2025",
    unit: "\uC6D0",
  },
  {
    indicator: "avg_tuition",
    label_ko: "\uD3C9\uADE0 \uB4F1\uB85D\uAE08",
    source_column: "\uD3C9\uADE0 \uB4F1\uB85D\uAE08\n(2026,\uCC9C\uC6D0)",
    base_year: "2026",
    unit: "\uCC9C\uC6D0",
  },
  {
    indicator: "admission_quota",
    label_ko: "입학정원",
    source_column: "입학정원\n(2025,명)",
    base_year: "2025",
    unit: "명",
  },
  {
    indicator: "graduates_count",
    label_ko: "졸업생수",
    source_column: "졸업생수\n(2025,명)",
    base_year: "2025",
    unit: "명",
  },
  {
    indicator: "fulltime_faculty_count",
    label_ko: "전임교원수(학부+대학원)",
    source_column: "전임교원수(학부+대학원)\n(2025,명)",
    base_year: "2025",
    unit: "명",
  },
  {
    indicator: "enrolled_students",
    label_ko: "재학생",
    source_column: "재학생\n(2025,명)",
    base_year: "2025",
    unit: "명",
  },
  {
    indicator: "international_students",
    label_ko: "외국인 학생 수",
    source_column: "외국인 학생 수\n(2025,명)",
    base_year: "2025",
    unit: "명",
  },
  {
    indicator: "students_per_fulltime_faculty",
    label_ko: "전임교원 1인당 학생 수(학생정원기준)(학부+대학원)",
    source_column: "전임교원 1인당 학생 수(학생정원기준)(학부+대학원)\n(2025,명)",
    base_year: "2025",
    unit: "명",
  },
  {
    indicator: "fulltime_faculty_ratio_quota",
    label_ko: "전임교원 확보율(학생정원기준)(학부+대학원)",
    source_column: "전임교원 확보율(학생정원기준)(학부+대학원)\n(2025,%)",
    base_year: "2025",
    unit: "%",
  },
  {
    indicator: "fulltime_faculty_ratio_enrolled",
    label_ko: "전임 교원 확보율(재학생 기준)(학부+대학원)",
    source_column: "전임 교원 확보율(재학생 기준)(학부+대학원)\n(2025,%)",
    base_year: "2025",
    unit: "%",
  },
  {
    indicator: "fulltime_faculty_lecture_ratio",
    label_ko: "전임교원 강의 담당 비율",
    source_column: "전임교원 강의 담당 비율\n(2025,%)",
    base_year: "2025",
    unit: "%",
  },
  {
    indicator: "education_expense_per_student",
    label_ko: "학생 1인당 교육비(학부+대학원)",
    source_column: "학생 1인당 교육비(학부+대학원)\n(2025,천원)",
    base_year: "2025",
    unit: "천원",
  },
  {
    indicator: "dormitory_capacity_rate",
    label_ko: "기숙사 수용율(학부+대학원)",
    source_column: "기숙사 수용율(학부+대학원)\n(2025,%)",
    base_year: "2025",
    unit: "%",
  },
  {
    indicator: "books_per_student",
    label_ko: "학생 1인당 도서 자료 수(학부+대학원)",
    source_column: "학생 1인당 도서 자료 수(학부+대학원)\n(2025,권)",
    base_year: "2025",
    unit: "권",
  },
] as const

export function reservedKeyOverrides(dataValue: string, academyinfoValue: string): Record<string, string> {
  return Object.fromEntries([
    [reservedDataKeyName, dataValue],
    [reservedAcademyinfoKeyName, academyinfoValue],
  ])
}

export function expectBundled15118998SourceContract(
  source: z.infer<typeof sourceSchema>,
  expected: (typeof expectedDefaultIndicators)[number],
): void {
  expect(source.dataset_id).toBe("15118998")
  expect(source.license).toContain("KOGL-1")
  expect(source.bundled).toBe(true)
  expect(source.source_column).toBe(expected.source_column)
  expect(source.base_year).toBe(expected.base_year)
  expect(source.unit).toBe(expected.unit)
}
