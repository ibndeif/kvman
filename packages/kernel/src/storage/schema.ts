// The kernel's tables (plan 02 §2.5). Extensions never see SQL. A scope is a workspace id, or '' for the home-wide
// (global) scope. JSON columns hold text; times are ISO 8601 strings.

export const kernelSchema = `
CREATE TABLE IF NOT EXISTS store_kv (
  extension TEXT NOT NULL,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (extension, scope, key)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS store_documents (
  extension TEXT NOT NULL,
  scope TEXT NOT NULL,
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (extension, scope, collection, id)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT NOT NULL,
  scope TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (key, scope)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  owner TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS files_by_workspace ON files (workspace_id, id);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  caller TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  retries INTEGER NOT NULL,
  output TEXT,
  problem TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  run_at TEXT NOT NULL,
  from_handler INTEGER NOT NULL,
  handler_extension TEXT
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS jobs_by_status ON jobs (status, run_at, id);
CREATE INDEX IF NOT EXISTS jobs_by_workspace ON jobs (workspace_id, id);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  key TEXT,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  at TEXT,
  cron TEXT,
  next_run TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  retries INTEGER NOT NULL,
  from_handler INTEGER NOT NULL
) WITHOUT ROWID;

CREATE UNIQUE INDEX IF NOT EXISTS schedules_by_key ON schedules (owner, workspace_id, key) WHERE key IS NOT NULL;
CREATE INDEX IF NOT EXISTS schedules_by_next_run ON schedules (next_run);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  open INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS processes (
  extension TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pid INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  PRIMARY KEY (extension, workspace_id, name)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS kernel_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS accepted_extensions (
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  source TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (name, version, source)
) WITHOUT ROWID;
`;
