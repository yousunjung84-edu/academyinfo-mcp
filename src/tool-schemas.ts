import { z } from "zod"

export const emptyInputSchema = z.object({})
export const searchUniversityInputSchema = z.object({ query: z.string().optional() })
export const getUniversityMetricsInputSchema = z.object({
  university_name: z.string().optional(),
  indicators: z.array(z.string()).optional(),
})
export const compareUniversitiesInputSchema = z.object({
  university_names: z.array(z.string()).optional(),
  indicators: z.array(z.string()).optional(),
})
export const explainIndicatorInputSchema = z.object({ indicator: z.string().optional() })
export const exploreUniversitiesRegisteredInputSchema = z.looseObject({
  university_queries: z.unknown().optional(),
  indicators: z.unknown().optional(),
})

export type EmptyInput = z.infer<typeof emptyInputSchema>
export type SearchUniversityInput = z.infer<typeof searchUniversityInputSchema>
export type GetUniversityMetricsInput = z.infer<typeof getUniversityMetricsInputSchema>
export type CompareUniversitiesInput = z.infer<typeof compareUniversitiesInputSchema>
export type ExplainIndicatorInput = z.infer<typeof explainIndicatorInputSchema>
export type ExploreUniversitiesRegisteredInput = z.infer<
  typeof exploreUniversitiesRegisteredInputSchema
>
