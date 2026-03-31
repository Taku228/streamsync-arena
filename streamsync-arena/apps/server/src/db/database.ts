import Database from 'better-sqlite3';

const db = new Database(process.env.DB_PATH ?? './streamsync.sqlite');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS viewer_history (
    id TEXT PRIMARY KEY,
    platform_user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    display_name TEXT NOT NULL,
    times_participated INTEGER NOT NULL DEFAULT 0,
    last_joined_at TEXT,
    membership INTEGER NOT NULL DEFAULT 0,
    gifted INTEGER NOT NULL DEFAULT 0
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_viewer_history_user
  ON viewer_history(platform_user_id, platform);

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export default db;
