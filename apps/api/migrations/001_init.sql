CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  install_id TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  active_session_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  title TEXT
);
CREATE INDEX idx_sessions_device ON sessions(device_id, started_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_session ON messages(session_id, created_at);

CREATE TABLE images (
  ref TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
