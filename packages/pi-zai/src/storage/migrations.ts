export const SCHEMA_VERSION = 1;

export const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS provider_attempts (
  id INTEGER PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  project_id TEXT,
  session_hash TEXT,
  query_id TEXT,
  request_id TEXT,
  attempt INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  endpoint_kind TEXT NOT NULL,
  thinking_level TEXT,
  pi_version TEXT,
  extension_version TEXT NOT NULL,
  system_fingerprint TEXT,
  toolset_fingerprint TEXT,
  payload_fingerprint TEXT,
  input_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  output_tokens INTEGER,
  request_to_headers_ms REAL,
  request_to_first_delta_ms REAL,
  total_ms REAL,
  http_status INTEGER,
  error_category TEXT,
  estimated_api_cost_microusd INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS daily_rollups (
  day TEXT NOT NULL,
  project_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  extension_version TEXT NOT NULL,
  turn_count INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL,
  error_count INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_api_cost_microusd INTEGER NOT NULL,
  PRIMARY KEY(day, project_id, provider, model, extension_version)
) STRICT;

CREATE TABLE IF NOT EXISTS benchmark_runs (
  run_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  variant TEXT NOT NULL,
  scenario TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  report_json TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS attempts_by_time
ON provider_attempts(occurred_at);

CREATE INDEX IF NOT EXISTS attempts_by_project_time
ON provider_attempts(project_id, occurred_at);

CREATE INDEX IF NOT EXISTS attempts_by_query
ON provider_attempts(query_id, attempt);
`;
