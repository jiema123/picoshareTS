-- Migration to initialize PicoShare D1 database
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER NOT NULL,
  upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  expiration_time TEXT,
  note TEXT,
  guest_link_id TEXT
);

CREATE TABLE IF NOT EXISTS guest_links (
  id TEXT PRIMARY KEY,
  label TEXT,
  max_file_bytes INTEGER,
  max_file_lifetime_days INTEGER,
  max_file_uploads INTEGER,
  url_expires TEXT,
  created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  upload_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS download_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id TEXT NOT NULL,
  downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS multipart_uploads (
  upload_id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  expiration_time TEXT,
  note TEXT,
  created_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS multipart_upload_parts (
  upload_id TEXT NOT NULL,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  PRIMARY KEY(upload_id, part_number)
);
