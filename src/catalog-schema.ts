import { z } from "zod"

const catalogSourceSchema = z.strictObject({
  dataset_id: z.literal("15118998"),
  dataset_name: z.string().min(1),
  provider: z.string().min(1),
  source_url: z.url(),
  license: z.literal("KOGL-1 / 공공누리 제1유형(출처표시)"),
  derived_database: z.literal(true),
  bundled: z.literal(true),
  source_column: z.literal("NotVerified"),
  base_year: z.literal("NotVerified"),
  unit: z.literal("NotVerified"),
})

const expectedIndicators = [
  { indicator_id: "competition_rate", unit: ":1" },
  { indicator_id: "fill_rate", unit: "%" },
  { indicator_id: "employment_rate", unit: "%" },
  { indicator_id: "scholarship_per_student", unit: "원" },
  { indicator_id: "avg_tuition", unit: "천원" },
  { indicator_id: "admission_quota", unit: "명" },
  { indicator_id: "graduates_count", unit: "명" },
  { indicator_id: "fulltime_faculty_count", unit: "명" },
  { indicator_id: "enrolled_students", unit: "명" },
  { indicator_id: "international_students", unit: "명" },
  { indicator_id: "students_per_fulltime_faculty", unit: "명" },
  { indicator_id: "fulltime_faculty_ratio_quota", unit: "%" },
  { indicator_id: "fulltime_faculty_ratio_enrolled", unit: "%" },
  { indicator_id: "fulltime_faculty_lecture_ratio", unit: "%" },
  { indicator_id: "education_expense_per_student", unit: "천원" },
  { indicator_id: "dormitory_capacity_rate", unit: "%" },
  { indicator_id: "books_per_student", unit: "권" },
] as const

const catalogIndicatorSchema = z.strictObject({
  indicator_id: z.enum([
    "competition_rate",
    "fill_rate",
    "employment_rate",
    "scholarship_per_student",
    "avg_tuition",
    "admission_quota",
    "graduates_count",
    "fulltime_faculty_count",
    "enrolled_students",
    "international_students",
    "students_per_fulltime_faculty",
    "fulltime_faculty_ratio_quota",
    "fulltime_faculty_ratio_enrolled",
    "fulltime_faculty_lecture_ratio",
    "education_expense_per_student",
    "dormitory_capacity_rate",
    "books_per_student",
  ]),
  label_ko: z.string().min(1),
  source_column: z.string().min(1),
  year: z.number().int().positive(),
  unit: z.enum([":1", "%", "원", "천원", "명", "권"]),
  source_dataset_id: z.literal("15118998"),
  source_column_verified: z.literal(true),
  enabled_by_default: z.literal(true),
  note: z.string().min(1).optional(),
})

export const indicatorCatalogSchema = z
  .strictObject({
    catalog_schema_version: z.literal(1),
    source: catalogSourceSchema,
    indicators: z.array(catalogIndicatorSchema).length(expectedIndicators.length),
  })
  .superRefine((catalog, context) => {
    for (const [index, expectedIndicator] of expectedIndicators.entries()) {
      const indicator = catalog.indicators[index]

      if (indicator?.indicator_id !== expectedIndicator.indicator_id) {
        context.addIssue({
          code: "custom",
          message: `Expected indicator ${expectedIndicator.indicator_id} at index ${index}.`,
          path: ["indicators", index, "indicator_id"],
        })
      }
      if (indicator?.unit !== expectedIndicator.unit) {
        context.addIssue({
          code: "custom",
          message: `Expected unit ${expectedIndicator.unit} for ${expectedIndicator.indicator_id}.`,
          path: ["indicators", index, "unit"],
        })
      }
    }
  })

export type IndicatorCatalog = z.infer<typeof indicatorCatalogSchema>
