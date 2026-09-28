export const kernelSchemaVersion1 = [
  `CREATE TABLE messages (
    seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, type TEXT NOT NULL,
    source TEXT NOT NULL, target TEXT, handler TEXT NOT NULL, workspace_id TEXT, lane TEXT,
    payload TEXT, payload_ref TEXT, context TEXT NOT NULL, state TEXT NOT NULL,
    priority INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, not_before INTEGER, deadline_at INTEGER,
    correlation_id TEXT NOT NULL, causation_id TEXT, on_reply TEXT,
    idempotency_source TEXT, idempotency_key TEXT, digest TEXT, result TEXT, result_ref TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, retain_until INTEGER)`,
  'CREATE UNIQUE INDEX messages_idem ON messages(idempotency_source, idempotency_key) WHERE idempotency_key IS NOT NULL',
  'CREATE INDEX messages_runnable ON messages(state, priority, not_before)',
  'CREATE INDEX messages_correlation ON messages(correlation_id)',
  `CREATE TABLE events (seq INTEGER PRIMARY KEY, id TEXT UNIQUE, type TEXT, source TEXT,
    workspace_id TEXT, payload TEXT, correlation_id TEXT, causation_id TEXT, created_at INTEGER)`,
  `CREATE TABLE steps (message_id TEXT, name TEXT, state TEXT, result TEXT,
    retry_safe INTEGER, started_at INTEGER, finished_at INTEGER, PRIMARY KEY(message_id, name))`,
  `CREATE TABLE processes (id TEXT PRIMARY KEY, message_id TEXT, extension TEXT, pid INTEGER,
    pgid INTEGER, process_start TEXT, state TEXT, log_path TEXT, log_blob TEXT, exit_code INTEGER,
    started_at INTEGER, ended_at INTEGER)`,
  `CREATE TABLE kv (owner TEXT, ws TEXT, key TEXT, value TEXT, version INTEGER, updated_at INTEGER,
    PRIMARY KEY(owner, ws, key))`,
  `CREATE TABLE docs (owner TEXT, ws TEXT, collection TEXT, id TEXT, data TEXT, version INTEGER,
    created_at INTEGER, updated_at INTEGER, PRIMARY KEY(owner, ws, collection, id))`,
  `CREATE TABLE logs (owner TEXT, ws TEXT, log TEXT, seq INTEGER, data TEXT, at INTEGER,
    PRIMARY KEY(owner, ws, log, seq))`,
  'CREATE TABLE blobs (id TEXT PRIMARY KEY, size INTEGER, mime TEXT, created_at INTEGER)',
  `CREATE TABLE blob_refs (blob_id TEXT, owner TEXT, ws TEXT, ref TEXT, expires_at INTEGER,
    PRIMARY KEY(blob_id, owner, ws, ref))`,
  `CREATE TABLE extensions (name TEXT PRIMARY KEY, namespace TEXT, active_digest TEXT, pending_digest TEXT,
    migrating TEXT, status TEXT, quarantine_reason TEXT, installed_at INTEGER)`,
  `CREATE TABLE extension_versions (name TEXT, digest TEXT, source TEXT, integrity TEXT,
    manifest TEXT, data_schema INTEGER, installed_at INTEGER, PRIMARY KEY(name, digest))`,
  `CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT UNIQUE, name TEXT, kind TEXT NOT NULL DEFAULT 'normal',
    trust TEXT, created_at INTEGER)`,
  'CREATE TABLE workspace_presets (workspace_id TEXT PRIMARY KEY, preset TEXT, revision INTEGER, applied_at INTEGER)',
  `CREATE TABLE workspace_config (workspace_id TEXT, extension TEXT, value TEXT, revision INTEGER, updated_at INTEGER,
    PRIMARY KEY(workspace_id, extension))`,
  'CREATE TABLE presets (id TEXT PRIMARY KEY, doc TEXT, builtin INTEGER NOT NULL DEFAULT 0, revision INTEGER, updated_at INTEGER)',
  'CREATE TABLE global_config (extension TEXT PRIMARY KEY, value TEXT, revision INTEGER)',
  'CREATE TABLE schema_versions (owner TEXT PRIMARY KEY, version INTEGER)',
  'CREATE TABLE kernel_settings (key TEXT PRIMARY KEY, value TEXT, revision INTEGER, updated_at INTEGER)',
  `CREATE TABLE notifications (id TEXT PRIMARY KEY, ws TEXT, source TEXT, key TEXT,
    level TEXT, data TEXT, attention INTEGER, read_at INTEGER, dismissed_at INTEGER,
    expires_at INTEGER, created_at INTEGER, updated_at INTEGER)`,
  'CREATE UNIQUE INDEX notifications_key ON notifications(source, ws, key) WHERE key IS NOT NULL',
  'CREATE TABLE user_preferences (user_id TEXT PRIMARY KEY, data TEXT, revision INTEGER, updated_at INTEGER)',
  `CREATE TABLE llm_models (provider TEXT, id TEXT, extension TEXT, info TEXT, source TEXT,
    refreshed_at INTEGER, PRIMARY KEY(provider, id))`,
  `CREATE TABLE llm_usage (message_id TEXT PRIMARY KEY, ws TEXT, caller TEXT, provider TEXT, model TEXT,
    input INTEGER, output INTEGER, cache_read INTEGER, cache_write INTEGER,
    cost_usd REAL, correlation_id TEXT, at INTEGER)`,
];

// ADR 0070: a deferred command's onAbort, and ctx.ids.new() / ctx.now() values replayed on redelivery.
export const kernelSchemaVersion2 = [
  'ALTER TABLE messages ADD COLUMN on_abort TEXT',
  `CREATE TABLE recorded_values (message_id TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL, value TEXT NOT NULL,
    PRIMARY KEY(message_id, kind, n))`,
];

// ADRs 0134, 0135: the first put's file name, spilled event payloads, and the lookups GC and read rights make.
export const kernelSchemaVersion3 = [
  'ALTER TABLE blobs ADD COLUMN name TEXT',
  'ALTER TABLE events ADD COLUMN payload_ref TEXT',
  'CREATE INDEX blob_refs_owner ON blob_refs(owner, blob_id)',
  'CREATE INDEX blob_refs_ref ON blob_refs(ref)',
  'CREATE INDEX blob_refs_expiry ON blob_refs(expires_at) WHERE expires_at IS NOT NULL',
];

// ADR 0139: what boot reconciliation needs to end a process and send its onExit, and the lookups of the kill paths.
export const kernelSchemaVersion4 = [
  'ALTER TABLE processes ADD COLUMN ws TEXT',
  'ALTER TABLE processes ADD COLUMN command TEXT',
  'ALTER TABLE processes ADD COLUMN detached INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE processes ADD COLUMN on_exit TEXT',
  'ALTER TABLE processes ADD COLUMN signal TEXT',
  'ALTER TABLE processes ADD COLUMN reason TEXT',
  'ALTER TABLE processes ADD COLUMN truncated INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE processes ADD COLUMN spawned_by TEXT',
  'CREATE INDEX processes_state ON processes(state)',
  'CREATE INDEX processes_ws ON processes(ws)',
];

// ADR 0144: each declared schedule's one outstanding run per workspace (ws '' for a global run), and the lookup a
// run's end makes.
export const kernelSchemaVersion5 = [
  `CREATE TABLE schedules (extension TEXT NOT NULL, name TEXT NOT NULL, ws TEXT NOT NULL, anchor_at INTEGER NOT NULL,
    due_at INTEGER NOT NULL, message_id TEXT, PRIMARY KEY(extension, name, ws))`,
  'CREATE INDEX schedules_message ON schedules(message_id)',
];

// ADR 0163: the tray's order and cap, and the ui.* rows the rate limit counts (ADR 0162).
export const kernelSchemaVersion6 = [
  'CREATE INDEX notifications_ws ON notifications(ws, updated_at)',
  "CREATE INDEX messages_ui ON messages(source, type, created_at) WHERE type IN ('ui.toast', 'ui.notify')",
];
