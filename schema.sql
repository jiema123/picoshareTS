-- Canonical D1 schema for a fresh PicoShare deployment.
-- Existing installations are upgraded by the Worker schema migrations.

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER NOT NULL,
  md5 TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  current_object_key TEXT,
  upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  expiration_time TEXT,
  note TEXT,
  guest_link_id TEXT,
  owner_id TEXT
);

CREATE TABLE IF NOT EXISTS guest_links (
  id TEXT PRIMARY KEY,
  label TEXT,
  max_file_bytes INTEGER,
  max_file_lifetime_days INTEGER,
  max_file_uploads INTEGER,
  url_expires TEXT,
  created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  upload_count INTEGER DEFAULT 0,
  owner_id TEXT
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

CREATE TABLE IF NOT EXISTS file_versions (
  entry_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER NOT NULL,
  md5 TEXT,
  created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  object_key TEXT NOT NULL,
  PRIMARY KEY(entry_id, version)
);

CREATE TABLE IF NOT EXISTS multipart_uploads (
  upload_id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  expiration_time TEXT,
  note TEXT,
  is_update INTEGER NOT NULL DEFAULT 0,
  expected_version INTEGER,
  object_key TEXT,
  owner_id TEXT,
  complete_token TEXT,
  complete_started_at DATETIME,
  active_parts INTEGER NOT NULL DEFAULT 0,
  active_parts_updated_at DATETIME,
  created_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS multipart_upload_parts (
  upload_id TEXT NOT NULL,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  PRIMARY KEY(upload_id, part_number)
);

-- Better Auth tables (including the API key plugin schema).
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL,
  image TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  id TEXT NOT NULL PRIMARY KEY,
  expiresAt DATE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  id TEXT NOT NULL PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt DATE,
  refreshTokenExpiresAt DATE,
  scope TEXT,
  password TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  id TEXT NOT NULL PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt DATE NOT NULL,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "apikey" (
  id TEXT NOT NULL PRIMARY KEY,
  configId TEXT NOT NULL,
  name TEXT,
  start TEXT,
  referenceId TEXT NOT NULL,
  prefix TEXT,
  key TEXT NOT NULL,
  refillInterval INTEGER,
  refillAmount INTEGER,
  lastRefillAt DATE,
  enabled INTEGER,
  rateLimitEnabled INTEGER,
  rateLimitTimeWindow INTEGER,
  rateLimitMax INTEGER,
  requestCount INTEGER,
  remaining INTEGER,
  lastRequest DATE,
  expiresAt DATE,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  permissions TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS session_userId_idx ON "session" (userId);
CREATE INDEX IF NOT EXISTS account_userId_idx ON "account" (userId);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON "verification" (identifier);
CREATE INDEX IF NOT EXISTS apikey_configId_idx ON "apikey" (configId);
CREATE INDEX IF NOT EXISTS apikey_referenceId_idx ON "apikey" (referenceId);
CREATE INDEX IF NOT EXISTS apikey_key_idx ON "apikey" (key);

CREATE TABLE IF NOT EXISTS billing_accounts (
  user_id TEXT PRIMARY KEY,
  plan_code TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'free',
  provider TEXT,
  provider_order_id TEXT,
  provider_product_id TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  grace_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_pro_grants (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  granted_by_user_id TEXT NOT NULL,
  granted_by_email TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  revoked_by_user_id TEXT,
  revoked_by_email TEXT,
  revoked_at TEXT,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_pro_grant_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_email TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  expires_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_action_audit (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  target_email TEXT NOT NULL,
  action TEXT NOT NULL,
  details_json TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS deleted_saas_users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  deleted_by_user_id TEXT NOT NULL,
  deleted_by_email TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_pro_grant_audit_user_created
  ON admin_pro_grant_audit(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_checkout_attempts (
  reference TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  product_id TEXT NOT NULL,
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  reference TEXT,
  processing_status TEXT NOT NULL DEFAULT 'processing',
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS monthly_usage (
  user_id TEXT NOT NULL,
  period TEXT NOT NULL,
  api_requests INTEGER NOT NULL DEFAULT 0,
  minute_bucket TEXT,
  minute_requests INTEGER NOT NULL DEFAULT 0,
  uploaded_bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, period)
);

CREATE TABLE IF NOT EXISTS saas_storage_reservations (
  reservation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reserved_bytes INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saas_storage_reservations_user_expiry
  ON saas_storage_reservations(user_id, expires_at);

CREATE TABLE IF NOT EXISTS saas_api_key_creation_locks (
  user_id TEXT PRIMARY KEY,
  lock_token TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saas_clipboards (
  owner_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(owner_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_entries_owner_upload
  ON entries(owner_id, upload_time DESC);
CREATE INDEX IF NOT EXISTS idx_guest_links_owner_created
  ON guest_links(owner_id, created_time DESC);
CREATE INDEX IF NOT EXISTS idx_multipart_owner
  ON multipart_uploads(owner_id, upload_id);
