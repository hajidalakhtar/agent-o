export interface Migration {
	id: number;
	name: string;
	sql: string;
}

/**
 * Migrasi ditulis inline sebagai string (bukan file `.sql` di disk) supaya
 * tidak ada masalah resolusi path setelah aplikasi di-bundle.
 */
export const migrations: Migration[] = [
	{
		id: 1,
		name: 'init',
		sql: `
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  default_agent_id TEXT,
  wip_limit INTEGER NOT NULL DEFAULT 3,
  permission_policy_id TEXT,
  available INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS card (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog',
  position INTEGER NOT NULL DEFAULT 0,
  agent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_card_project ON card(project_id, status, position);

CREATE TABLE IF NOT EXISTS run (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL,
  kind TEXT NOT NULL,
  agent_id TEXT,
  session_id TEXT,
  worktree_id TEXT,
  status TEXT NOT NULL,
  stop_reason TEXT,
  reason TEXT,
  started_at INTEGER,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_run_card ON run(card_id, attempt_no);

CREATE TABLE IF NOT EXISTS worktree (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  branch TEXT NOT NULL,
  base_sha TEXT,
  head_sha TEXT,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_worktree_card ON worktree(card_id);

CREATE TABLE IF NOT EXISTS card_event (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  run_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_card_event_card ON card_event(card_id, created_at);

CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  run_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_message_card ON message(card_id, created_at);

CREATE TABLE IF NOT EXISTS permission_policy (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  rules TEXT NOT NULL DEFAULT '[]',
  default_decision TEXT NOT NULL DEFAULT 'deny',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_registration (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '[]',
  env TEXT NOT NULL DEFAULT '{}',
  max_concurrency INTEGER NOT NULL DEFAULT 1,
  capabilities TEXT,
  auth_method TEXT,
  health TEXT NOT NULL DEFAULT 'ok',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_checked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`
	},
	{
		id: 2,
		name: 'permission_policy_scope_id',
		sql: `
ALTER TABLE permission_policy ADD COLUMN scope_id TEXT;
`
	}
];
