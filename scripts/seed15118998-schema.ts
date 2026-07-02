import type Database from "better-sqlite3"

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
      region_name TEXT NOT NULL
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
      row_json TEXT NOT NULL
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
      FOREIGN KEY (institution_id) REFERENCES institutions(id),
      FOREIGN KEY (indicator_id) REFERENCES indicators(indicator_id),
      FOREIGN KEY (source_file_id) REFERENCES source_files(id),
      FOREIGN KEY (raw_row_id) REFERENCES raw_rows(id)
    );
    CREATE TABLE join_audits (
      id INTEGER PRIMARY KEY,
      audit_type TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL
    );
  `)
}
