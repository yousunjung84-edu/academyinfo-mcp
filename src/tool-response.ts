import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

import {
  bundledSource,
  commonWarnings,
  sourceForIndicator,
  defaultIndicators,
  type SourceMetadata,
} from "./catalog.js"
import { getDatabaseStatus } from "./database-status.js"

type ToolResponseInput = {
  readonly tool: string
  readonly query: Record<string, unknown>
  readonly status: string
  readonly data: Record<string, unknown>
  readonly warnings: readonly string[]
  readonly sources?: readonly SourceMetadata[]
}

export type MetricContract = {
  readonly indicator: string
  readonly dataset_id: string
  readonly source_column: string
  readonly base_year: string
  readonly unit: string
  readonly source: SourceMetadata
  readonly warnings: readonly string[]
}

export function compareMetricContracts(): readonly MetricContract[] {
  return defaultIndicators.map((indicator) => ({
    indicator: indicator.indicator,
    dataset_id: indicator.dataset_id,
    source_column: indicator.source_column,
    base_year: indicator.base_year,
    unit: indicator.unit,
    source: sourceForIndicator(indicator),
    warnings: commonWarnings([
      "Metric values are served from the normalized bundled 15118998 derivative seed DB when available.",
    ]),
  }))
}

export function toolResponse(input: ToolResponseInput): CallToolResult {
  const databaseStatus = getDatabaseStatus()
  const finalStatus = databaseStatus.kind === "missing" ? "missing_db" : input.status
  const finalData =
    databaseStatus.kind === "missing"
      ? {
          error: {
            code: "missing_db",
            message: "Configured database file was not found.",
            configured_database: "missing",
          },
        }
      : input.data
  const finalWarnings =
    databaseStatus.kind === "missing"
      ? [
          ...input.warnings,
          "ACADEMYINFO_DB_PATH is configured but the database file was not found; the path is omitted from this response.",
        ]
      : input.warnings
  const response: Record<string, unknown> = {
    status: finalStatus,
    tool: input.tool,
    query: input.query,
    sources: input.sources ?? [bundledSource],
    data: finalData,
    warnings: finalWarnings,
    generated_at: new Date().toISOString(),
  }

  return {
    content: [{ type: "text", text: JSON.stringify(response) }],
    structuredContent: response,
  }
}
