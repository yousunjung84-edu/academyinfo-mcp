import { z } from "zod"

export const institutionRowSchema = z.object({
  id: z.number(),
  school_name: z.string(),
  campus_name: z.string(),
  school_kind: z.string(),
  school_type: z.string(),
  establishment_type: z.string(),
  region_name: z.string(),
})

export const metricRowSchema = z.object({
  indicator_id: z.string(),
  label_ko: z.string(),
  value: z.number(),
  raw_value: z.string(),
  year: z.number(),
  unit: z.string(),
  source_column: z.string(),
})

export const countRowSchema = z.object({
  indicator_id: z.string(),
  count: z.number(),
})

export const singleCountRowSchema = z.object({ count: z.number() })
export const rawRowJsonSchema = z.object({ row_json: z.string() })
