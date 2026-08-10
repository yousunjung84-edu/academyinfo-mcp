import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { z } from "zod"

import { bundledSource } from "./catalog.js"
import { findProjectRoot } from "./database-paths.js"

/**
 * Snapshot identity for citation and reproducibility. Callers that record a
 * number from this server need to be able to say which bundle produced it;
 * `generated_at` is call time and cannot serve that purpose.
 *
 * Values come from the bundled seed manifest, which already records them, so
 * this reads a packaged file rather than the database: the block stays
 * available even when the database is missing.
 */
const manifestSchema = z
  .object({
    source_file_checksum_sha256: z.string().min(1).optional(),
    seed_db_checksum_sha256: z.string().min(1).optional(),
    source_downloaded_at: z.string().min(1).optional(),
    seed_built_at: z.string().min(1).optional(),
    seed_is_latest_claim: z.boolean().optional(),
  })
  .passthrough()

const packageVersionSchema = z.object({ version: z.string().min(1) })

const UNRESOLVED = "unknown"

export type DatasetProvenance = {
  readonly dataset_id: string
  readonly dataset_name: string
  readonly provider: string
  readonly source_url: string
  readonly license: string
  readonly derived_database: boolean
  readonly bundled: boolean
  readonly bundle_version: string
  readonly source_downloaded_at: string
  readonly seed_built_at: string
  readonly source_file_sha256: string
  readonly seed_db_sha256: string
  /**
   * The bundle is one point-in-time snapshot. No tool accepts a year argument
   * and no tool can answer a trend question; saying so in the payload keeps a
   * caller from computing a series that does not exist.
   */
  readonly temporal_coverage: "single_snapshot"
  readonly claims_latest_source: boolean
}

function readJson(projectRoot: string, ...segments: readonly string[]): unknown {
  return JSON.parse(readFileSync(join(projectRoot, ...segments), "utf8"))
}

function loadProvenance(): DatasetProvenance {
  let bundleVersion = UNRESOLVED
  let manifest: z.infer<typeof manifestSchema> = {}

  // Degrade to explicit unknowns rather than refusing to start: a minimal
  // runtime root must still serve responses, as the version reader does.
  try {
    const projectRoot = findProjectRoot(dirname(fileURLToPath(import.meta.url)))

    const packageParsed = packageVersionSchema.safeParse(readJson(projectRoot, "package.json"))
    if (packageParsed.success) {
      bundleVersion = packageParsed.data.version
    }

    const manifestParsed = manifestSchema.safeParse(
      readJson(projectRoot, "data", "seed", "academyinfo_15118998.manifest.json"),
    )
    if (manifestParsed.success) {
      manifest = manifestParsed.data
    }
  } catch {
    // keep the unknown defaults
  }

  return Object.freeze({
    dataset_id: bundledSource.dataset_id,
    dataset_name: bundledSource.dataset_name,
    provider: bundledSource.provider,
    source_url: bundledSource.source_url,
    license: bundledSource.license,
    derived_database: bundledSource.derived_database,
    bundled: bundledSource.bundled,
    bundle_version: bundleVersion,
    source_downloaded_at: manifest.source_downloaded_at ?? UNRESOLVED,
    seed_built_at: manifest.seed_built_at ?? UNRESOLVED,
    source_file_sha256: manifest.source_file_checksum_sha256 ?? UNRESOLVED,
    seed_db_sha256: manifest.seed_db_checksum_sha256 ?? UNRESOLVED,
    temporal_coverage: "single_snapshot",
    claims_latest_source: manifest.seed_is_latest_claim ?? false,
  })
}

export const datasetProvenance: DatasetProvenance = loadProvenance()
