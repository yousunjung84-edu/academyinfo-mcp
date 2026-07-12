import type Database from "better-sqlite3"

export type RawCellRecord = {
  readonly worksheet_row: number
  readonly column_index: number
  readonly column_ref: string
  readonly raw_text: string
}

export type StoredObservationClassification =
  | {
      readonly classification: "numeric"
      readonly raw_text: string
      readonly missing_marker: null
      readonly canonical_value: string
      readonly value: number
    }
  | {
      readonly classification: "missing"
      readonly raw_text: string
      readonly missing_marker: "empty" | "dash"
      readonly canonical_value: null
      readonly value: null
    }

/**
 * The closed logical schema expected after the seed builder's semantic
 * extension has run. Keeping this declaration here makes schema drift
 * testable without deriving expectations from SQLite itself.
 */
export const seedSchemaContract = {
  source_files: [
    "id",
    "dataset_id",
    "dataset_name",
    "provider",
    "source_url",
    "license",
    "source_file_name",
    "source_file_checksum_sha256",
    "header_snapshot_checksum_sha256",
    "bundled",
    "derived_database",
    "observed_at",
    "source_file_private_path_excluded",
  ],
  institutions: [
    "id",
    "school_name",
    "campus_name",
    "school_kind",
    "school_type",
    "establishment_type",
    "region_name",
  ],
  indicators: [
    "indicator_id",
    "label_ko",
    "source_dataset_id",
    "source_column",
    "source_column_verified",
    "year",
    "unit",
    "enabled_by_default",
    "note",
  ],
  raw_rows: ["id", "source_file_id", "row_number", "row_json", "raw_cells_json"],
  observations: [
    "id",
    "institution_id",
    "indicator_id",
    "source_file_id",
    "raw_row_id",
    "value",
    "raw_value",
    "year",
    "unit",
    "source_column",
    "canonical_value",
  ],
  observation_classifications: [
    "raw_row_id",
    "institution_id",
    "indicator_id",
    "raw_text",
    "classification",
    "missing_marker",
    "canonical_value",
    "value",
  ],
  join_audits: ["id", "audit_type", "status", "detail"],
} as const

export function createSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA foreign_keys = ON;
    CREATE TABLE source_files (
      id INTEGER PRIMARY KEY,
      dataset_id TEXT NOT NULL,
      dataset_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      source_url TEXT NOT NULL,
      license TEXT NOT NULL,
      source_file_name TEXT NOT NULL,
      source_file_checksum_sha256 TEXT NOT NULL,
      header_snapshot_checksum_sha256 TEXT NOT NULL,
      bundled INTEGER NOT NULL,
      derived_database INTEGER NOT NULL,
      observed_at TEXT NOT NULL,
      source_file_private_path_excluded INTEGER NOT NULL
    );
    CREATE TABLE institutions (
      id INTEGER PRIMARY KEY,
      school_name TEXT NOT NULL,
      campus_name TEXT NOT NULL,
      school_kind TEXT NOT NULL,
      school_type TEXT NOT NULL,
      establishment_type TEXT NOT NULL,
      region_name TEXT NOT NULL,
      UNIQUE (school_name, campus_name)
    );
    CREATE TABLE indicators (
      indicator_id TEXT PRIMARY KEY,
      label_ko TEXT NOT NULL,
      source_dataset_id TEXT NOT NULL,
      source_column TEXT NOT NULL,
      source_column_verified INTEGER NOT NULL,
      year INTEGER NOT NULL,
      unit TEXT NOT NULL,
      enabled_by_default INTEGER NOT NULL,
      note TEXT
    );
    CREATE TABLE raw_rows (
      id INTEGER PRIMARY KEY,
      source_file_id INTEGER NOT NULL,
      row_number INTEGER NOT NULL,
      row_json TEXT NOT NULL,
      raw_cells_json TEXT NOT NULL
    );
    CREATE TABLE observations (
      id INTEGER PRIMARY KEY,
      institution_id INTEGER NOT NULL,
      indicator_id TEXT NOT NULL,
      source_file_id INTEGER NOT NULL,
      raw_row_id INTEGER NOT NULL,
      value REAL NOT NULL,
      raw_value TEXT NOT NULL,
      year INTEGER NOT NULL,
      unit TEXT NOT NULL,
      source_column TEXT NOT NULL,
      canonical_value TEXT NOT NULL,
      FOREIGN KEY (institution_id) REFERENCES institutions(id),
      FOREIGN KEY (indicator_id) REFERENCES indicators(indicator_id),
      FOREIGN KEY (source_file_id) REFERENCES source_files(id),
      FOREIGN KEY (raw_row_id) REFERENCES raw_rows(id)
    );
    CREATE TABLE observation_classifications (
      raw_row_id INTEGER NOT NULL,
      institution_id INTEGER NOT NULL,
      indicator_id TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      classification TEXT NOT NULL CHECK (classification IN ('numeric', 'missing')),
      missing_marker TEXT CHECK (missing_marker IN ('empty', 'dash')),
      canonical_value TEXT,
      value REAL,
      PRIMARY KEY (raw_row_id, indicator_id),
      FOREIGN KEY (raw_row_id) REFERENCES raw_rows(id),
      FOREIGN KEY (institution_id) REFERENCES institutions(id),
      FOREIGN KEY (indicator_id) REFERENCES indicators(indicator_id),
      CHECK (
        (classification = 'numeric' AND missing_marker IS NULL AND canonical_value IS NOT NULL AND value IS NOT NULL)
        OR
        (classification = 'missing' AND missing_marker IS NOT NULL AND canonical_value IS NULL AND value IS NULL)
      )
    );
    CREATE TABLE join_audits (
      id INTEGER PRIMARY KEY,
      audit_type TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL
    );
  `)
}
