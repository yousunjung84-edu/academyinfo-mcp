import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  assertAllDefaultIndicatorsMapped,
  validateDefaultIndicatorHeaders,
} from "../scripts/seed15118998-validate.ts"
import { withMcpServer } from "./support/mcp-stdio-harness.ts"

const projectRoot = fileURLToPath(new URL("..", import.meta.url))
const expectedSourceChecksum =
  "53f7e7fbb446206a47fab1adc622d551ba88ba7f3c25ae0cdc8e41cddc637621"

const expectedIndicators = [
  {
    indicator_id: "competition_rate",
    label_ko: "신입생 경쟁률",
    source_column: "신입생 경쟁률\n(2025,:1)",
    year: 2025,
    unit: ":1",
  },
  {
    indicator_id: "fill_rate",
    label_ko: "신입생 충원율",
    source_column: "신입생 충원율\n(2025,%)",
    year: 2025,
    unit: "%",
  },
  {
    indicator_id: "employment_rate",
    label_ko: "취업률",
    source_column: "취업률\n(2025,%)",
    year: 2025,
    unit: "%",
  },
  {
    indicator_id: "scholarship_per_student",
    label_ko: "학생 1인당 연간 장학금",
    source_column: "학생 1인당 연간 장학금\n(2025,원)",
    year: 2025,
    unit: "원",
  },
  {
    indicator_id: "avg_tuition",
    label_ko: "평균 등록금",
    source_column: "평균 등록금\n(2026,천원)",
    year: 2026,
    unit: "천원",
  },
] as const

const headerSnapshotSchema = z.object({
  dataset_id: z.literal("15118998"),
  sheet_name: z.literal("Sheet1"),
  column_count: z.literal(24),
  source_file_checksum_sha256: z.literal(expectedSourceChecksum),
  columns: z.array(
    z.object({
      raw_header: z.string(),
      parsed_label: z.string(),
      parsed_year: z.number().nullable(),
      parsed_unit: z.string().nullable(),
      checksum_sha256: z.string(),
    }),
  ),
})

const manifestSchema = z.object({
  dataset_id: z.literal("15118998"),
  source_file_name: z.literal("대학주요정보.xlsx"),
  source_file_checksum_sha256: z.literal(expectedSourceChecksum),
  header_snapshot_checksum_sha256: z.string().min(64),
  seed_db_checksum_sha256: z.string().min(64),
  seed_is_latest_claim: z.literal(false),
  api_key_required: z.literal(false),
  source_file_private_path_excluded: z.literal(true),
  indicators: z.array(
    z.object({
      indicator_id: z.string(),
      label_ko: z.string(),
      source_column: z.string(),
      source_column_verified: z.literal(true),
      year: z.number(),
      unit: z.string(),
      enabled_by_default: z.literal(true),
      source_dataset_id: z.literal("15118998"),
    }),
  ),
  observation_counts: z.record(z.string(), z.number().int().positive()),
})

function sha256File(relativePath: string): string {
  const bytes = readFileSync(join(projectRoot, relativePath))
  return createHash("sha256").update(bytes).digest("hex")
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(projectRoot, relativePath), "utf8"))
}

describe("15118998 evidence lock and seed DB", () => {
  it("locks the placed source file, header evidence, manifest, and seed counts", () => {
    expect(sha256File("data/raw/15118998/대학주요정보.xlsx")).toBe(expectedSourceChecksum)
    expect(existsSync(join(projectRoot, "data/seed/academyinfo_15118998.sqlite"))).toBe(true)

    const headerSnapshot = headerSnapshotSchema.parse(
      readJson("evidence/header-snapshots/15118998.headers.json"),
    )
    const manifest = manifestSchema.parse(
      readJson("data/seed/academyinfo_15118998.manifest.json"),
    )

    expect(existsSync(join(projectRoot, "evidence/sample-rows/15118998.sample.json"))).toBe(true)
    expect(existsSync(join(projectRoot, "evidence/checksums/15118998.checksums.json"))).toBe(true)
    expect(JSON.stringify(manifest)).not.toMatch(/[A-Za-z]:[\\/]/u)

    for (const expectedIndicator of expectedIndicators) {
      expect(headerSnapshot.columns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            raw_header: expectedIndicator.source_column,
            parsed_label: expectedIndicator.label_ko,
            parsed_year: expectedIndicator.year,
            parsed_unit: expectedIndicator.unit,
          }),
        ]),
      )
      expect(manifest.indicators).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            indicator_id: expectedIndicator.indicator_id,
            label_ko: expectedIndicator.label_ko,
            source_column: expectedIndicator.source_column,
            year: expectedIndicator.year,
            unit: expectedIndicator.unit,
          }),
        ]),
      )
      expect(manifest.observation_counts[expectedIndicator.indicator_id]).toBeGreaterThan(0)
    }
  })

  it("fails closed when required indicator headers or mapped observations are invalid", () => {
    const malformedHeaders = expectedIndicators.map((indicator) =>
      indicator.indicator_id === "avg_tuition" ? "평균 등록금" : indicator.source_column,
    )
    const validation = validateDefaultIndicatorHeaders(malformedHeaders)

    expect(validation.ok).toBe(false)
    expect(validation.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("avg_tuition")]),
    )

    const zeroObservationCounts = Object.fromEntries(
      expectedIndicators.map((indicator) => [indicator.indicator_id, 1]),
    )
    zeroObservationCounts["employment_rate"] = 0

    expect(() => assertAllDefaultIndicatorsMapped(zeroObservationCounts)).toThrow(
      /employment_rate/u,
    )
  })

  it("serves real five-indicator metrics from the bundled seed without API keys", async () => {
    await withMcpServer(
      { DATA_GO_KR_SERVICE_KEY: "", ACADEMYINFO_SERVICE_KEY: "" },
      async (harness) => {
        const indicators = await harness.callTool("list_indicators", {})
        const indicatorResponse = z
          .object({
            status: z.literal("ok"),
            data: z.object({
              default_indicator_count: z.literal(5),
              indicators: z.array(z.object({ indicator: z.string() })),
            }),
          })
          .passthrough()
          .parse(indicators.structuredContent)

        expect(indicatorResponse.data.indicators.map((indicator) => indicator.indicator)).toEqual(
          expectedIndicators.map((indicator) => indicator.indicator_id),
        )

        const comparison = await harness.callTool("compare_universities", {
          university_names: ["전남대학교 본교"],
        })
        const comparisonResponse = z
          .object({
            status: z.literal("ok"),
            data: z.object({
              comparisons: z.array(
                z.object({
                  university_name: z.string(),
                  metrics: z.array(
                    z.object({
                      indicator: z.string(),
                      value: z.number(),
                      source: z.object({
                        dataset_id: z.literal("15118998"),
                        source_column: z.string(),
                        license: z.string(),
                        bundled: z.literal(true),
                        unit: z.string(),
                      }),
                      year: z.number(),
                      unit: z.string(),
                      warnings: z.array(z.string()),
                    }),
                  ),
                }),
              ),
            }),
            warnings: z.array(z.string()),
          })
          .passthrough()
          .parse(comparison.structuredContent)

        expect(comparisonResponse.data.comparisons).toHaveLength(1)
        expect(comparisonResponse.data.comparisons[0]?.university_name).toBe("전남대학교")
        expect(comparisonResponse.data.comparisons[0]?.metrics).toHaveLength(
          expectedIndicators.length,
        )
      },
    )
  }, 20_000)
})
