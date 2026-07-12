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
  canonical_value: z.string(),
  raw_value: z.string(),
  year: z.number(),
  unit: z.string(),
  source_column: z.string(),
})

export const metricBatchRowSchema = metricRowSchema.extend({
  institution_id: z.number(),
})
export const metricObservationRowSchema = metricBatchRowSchema.extend({
  observation_id: z.number(),
})
export const observationKeyRowSchema = z.object({
  institution_id: z.number(),
  indicator_id: z.string(),
})
export const observationMetadataRowSchema = observationKeyRowSchema.extend({
  label_ko: z.string().nullable(),
  value: z.number(),
  canonical_value: z.string(),
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
export const rawRowValueSchema = z.record(z.string(), z.unknown())
