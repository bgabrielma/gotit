CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  install_id TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  active_session_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  title TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id, started_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS images (
  ref TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
