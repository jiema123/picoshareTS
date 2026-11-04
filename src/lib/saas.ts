export const LOCAL_OWNER_ID = "__local__";
export const ADMIN_OWNER_ID = "__admin__";

export type AccountPlan = "free" | "pro";

export interface PlanLimits {
  storageBytes: number;
  maxFileBytes: number;
  maxFileLifetimeDays: number;
  monthlyApiRequests: number;
  apiRequestsPerMinute: number;
  maxApiKeys: number;
  maxGuestLinks: number;
  maxClipboards: number;
  maxClipboardBytes: number;
}

export interface AccountEntitlement {
  ownerId: string;
  plan: AccountPlan;
  status: string;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  limits: PlanLimits;
  source: "free" | "waffo" | "opcpay" | "manual";
}

export interface SaasEnv {
  DB: D1Database;
  SAAS_BOOTSTRAP_EMAIL?: string;
  SAAS_SUPERADMIN_EMAILS?: string;
}

export interface ManualProGrant {
  userId: string;
  status: "active" | "revoked";
  grantedByUserId: string;
  grantedByEmail: string;
  grantedAt: string;
  expiresAt: string | null;
  revokedByUserId: string | null;
  revokedByEmail: string | null;
  revokedAt: string | null;
  note: string | null;
  active: boolean;
}

export function isSaasSuperadmin(email: string | null | undefined, configuredEmails: string | undefined): boolean {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !configuredEmails) return false;
  return configuredEmails.split(",").some((entry) => entry.trim().toLowerCase() === normalizedEmail);
}

const PLAN_LIMITS: Record<AccountPlan, PlanLimits> = {
  free: {
    storageBytes: 1024 * 1024 * 1024,
    maxFileBytes: 100 * 1024 * 1024,
    maxFileLifetimeDays: 30,
    monthlyApiRequests: 500,
    apiRequestsPerMinute: 10,
    maxApiKeys: 1,
    maxGuestLinks: 3,
    maxClipboards: 5,
    maxClipboardBytes: 32 * 1024,
  },
  pro: {
    storageBytes: 5 * 1024 * 1024 * 1024,
    maxFileBytes: 1024 * 1024 * 1024,
    maxFileLifetimeDays: 365,
    monthlyApiRequests: 5_000,
    apiRequestsPerMinute: 60,
    maxApiKeys: 3,
    maxGuestLinks: 20,
    maxClipboards: 20,
    maxClipboardBytes: 128 * 1024,
  },
};

async function addColumnIfMissing(env: SaasEnv, statement: string): Promise<void> {
  const match = statement.match(/^ALTER TABLE ([A-Za-z_][A-Za-z0-9_]*) ADD COLUMN ([A-Za-z_][A-Za-z0-9_]*)/i);
  if (!match) throw new Error(`Invalid schema alteration: ${statement}`);
  const columns = await env.DB.prepare(`PRAGMA table_info(${match[1]})`).all<{ name: string }>();
  if (!columns.results.some((column) => column.name === match[2])) await env.DB.exec(statement);
}

export async function ensureSaasSchema(env: SaasEnv): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS billing_accounts (
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
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS admin_pro_grants (
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
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS admin_pro_grant_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      target_email TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      expires_at TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS admin_action_audit (
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
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS deleted_saas_users (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      deleted_by_user_id TEXT NOT NULL,
      deleted_by_email TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_admin_pro_grant_audit_user_created ON admin_pro_grant_audit(user_id, created_at DESC)",
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS billing_checkout_attempts (
      reference TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      product_id TEXT NOT NULL,
      session_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS billing_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      reference TEXT,
      processing_status TEXT NOT NULL DEFAULT 'processing',
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS monthly_usage (
      user_id TEXT NOT NULL,
      period TEXT NOT NULL,
      api_requests INTEGER NOT NULL DEFAULT 0,
      minute_bucket TEXT,
      minute_requests INTEGER NOT NULL DEFAULT 0,
      uploaded_bytes INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id, period)
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS saas_storage_reservations (
      reservation_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      reserved_bytes INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_saas_storage_reservations_user_expiry ON saas_storage_reservations(user_id, expires_at)",
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS saas_api_key_creation_locks (
      user_id TEXT PRIMARY KEY,
      lock_token TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`,
  ).run();
  await addColumnIfMissing(env, "ALTER TABLE monthly_usage ADD COLUMN minute_bucket TEXT");
  await addColumnIfMissing(env, "ALTER TABLE monthly_usage ADD COLUMN minute_requests INTEGER NOT NULL DEFAULT 0");
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS saas_clipboards (
      owner_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      public_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(owner_id, slug)
    )`,
  ).run();

  await addColumnIfMissing(env, "ALTER TABLE entries ADD COLUMN owner_id TEXT");
  await addColumnIfMissing(env, "ALTER TABLE guest_links ADD COLUMN owner_id TEXT");
  await addColumnIfMissing(env, "ALTER TABLE multipart_uploads ADD COLUMN owner_id TEXT");

  await env.DB.prepare("UPDATE entries SET owner_id = ? WHERE owner_id IS NULL OR owner_id = ''")
    .bind(LOCAL_OWNER_ID)
    .run();
  await env.DB.prepare("UPDATE guest_links SET owner_id = ? WHERE owner_id IS NULL OR owner_id = ''")
    .bind(LOCAL_OWNER_ID)
    .run();
  await env.DB.prepare("UPDATE multipart_uploads SET owner_id = ? WHERE owner_id IS NULL OR owner_id = ''")
    .bind(LOCAL_OWNER_ID)
    .run();

  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_entries_owner_upload ON entries(owner_id, upload_time DESC)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_guest_links_owner_created ON guest_links(owner_id, created_time DESC)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_multipart_owner ON multipart_uploads(owner_id, upload_id)").run();
}

export async function ensureSaasAccount(
  env: SaasEnv,
  userId: string,
  email: string | null | undefined,
): Promise<void> {
  const deleted = await env.DB.prepare(
    "SELECT 1 AS deleted FROM deleted_saas_users WHERE user_id = ? LIMIT 1",
  ).bind(userId).first<{ deleted: number }>();
  if (deleted) return;

  await env.DB.prepare(
    `INSERT OR IGNORE INTO billing_accounts(user_id, plan_code, status)
     SELECT ?, 'free', 'free'
     WHERE NOT EXISTS (SELECT 1 FROM deleted_saas_users WHERE user_id = ?)`,
  ).bind(userId, userId).run();

  const bootstrapEmail = env.SAAS_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (bootstrapEmail && email && email.trim().toLowerCase() === bootstrapEmail) {
    const claimKey = "saas:legacy_data_owner";
    const claim = await env.DB.prepare("SELECT value FROM settings WHERE key = ?")
      .bind(claimKey)
      .first<{ value: string }>();
    if (!claim) {
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)").bind(claimKey, userId),
        env.DB.prepare(
          `UPDATE entries SET owner_id = ? WHERE owner_id = ?
           AND EXISTS (SELECT 1 FROM settings WHERE key = ? AND value = ?)`,
        ).bind(userId, LOCAL_OWNER_ID, claimKey, userId),
        env.DB.prepare(
          `UPDATE guest_links SET owner_id = ? WHERE owner_id = ?
           AND EXISTS (SELECT 1 FROM settings WHERE key = ? AND value = ?)`,
        ).bind(userId, LOCAL_OWNER_ID, claimKey, userId),
        env.DB.prepare(
          `UPDATE multipart_uploads SET owner_id = ? WHERE owner_id = ?
           AND EXISTS (SELECT 1 FROM settings WHERE key = ? AND value = ?)`,
        ).bind(userId, LOCAL_OWNER_ID, claimKey, userId),
        env.DB.prepare(
          `INSERT OR IGNORE INTO settings(key, value)
           SELECT ?, value FROM settings WHERE key = 'store_forever'
             AND EXISTS (SELECT 1 FROM settings WHERE key = ? AND value = ?)`,
        ).bind(`${userId}:store_forever`, claimKey, userId),
        env.DB.prepare(
          `INSERT OR IGNORE INTO settings(key, value)
           SELECT ?, value FROM settings WHERE key = 'default_expiration_days'
             AND EXISTS (SELECT 1 FROM settings WHERE key = ? AND value = ?)`,
        ).bind(`${userId}:default_expiration_days`, claimKey, userId),
      ]);
      const unbounded = await env.DB.prepare(
        "SELECT 1 AS found FROM entries WHERE owner_id = ? AND expiration_time IS NULL LIMIT 1",
      ).bind(userId).first<{ found: number }>();
      if (unbounded) {
        const entitlement = await getAccountEntitlement(env, userId);
        const cutoff = new Date(Date.now() + entitlement.limits.maxFileLifetimeDays * 24 * 60 * 60 * 1000).toISOString();
        await env.DB.prepare(
          "UPDATE entries SET expiration_time = ? WHERE owner_id = ? AND expiration_time IS NULL",
        ).bind(cutoff, userId).run();
      }
    }
  }
}

type ManualProGrantRow = {
  user_id: string;
  status: "active" | "revoked";
  granted_by_user_id: string;
  granted_by_email: string;
  granted_at: string;
  expires_at: string | null;
  revoked_by_user_id: string | null;
  revoked_by_email: string | null;
  revoked_at: string | null;
  note: string | null;
};

function mapManualProGrant(row: ManualProGrantRow): ManualProGrant {
  const expiry = row.expires_at ? Date.parse(row.expires_at) : null;
  const active = row.status === "active" && (expiry === null || (Number.isFinite(expiry) && expiry > Date.now()));
  return {
    userId: row.user_id,
    status: row.status,
    grantedByUserId: row.granted_by_user_id,
    grantedByEmail: row.granted_by_email,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    revokedByUserId: row.revoked_by_user_id,
    revokedByEmail: row.revoked_by_email,
    revokedAt: row.revoked_at,
    note: row.note,
    active,
  };
}

export async function getManualProGrant(env: SaasEnv, userId: string): Promise<ManualProGrant | null> {
  const row = await env.DB.prepare(
    `SELECT user_id, status, granted_by_user_id, granted_by_email, granted_at,
            expires_at, revoked_by_user_id, revoked_by_email, revoked_at, note
     FROM admin_pro_grants WHERE user_id = ?`,
  ).bind(userId).first<ManualProGrantRow>();
  return row ? mapManualProGrant(row) : null;
}

export async function grantManualPro(
  env: SaasEnv,
  input: { userId: string; targetEmail: string; actorUserId: string; actorEmail: string; expiresAt: string | null; note: string | null },
): Promise<string> {
  const updatedAt = new Date().toISOString();
  const auditId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO admin_pro_grants(
         user_id, status, granted_by_user_id, granted_by_email, granted_at,
         expires_at, revoked_by_user_id, revoked_by_email, revoked_at, note, updated_at
       ) VALUES (?, 'active', ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         status = 'active', granted_by_user_id = excluded.granted_by_user_id,
         granted_by_email = excluded.granted_by_email, granted_at = excluded.granted_at,
         expires_at = excluded.expires_at, revoked_by_user_id = NULL,
         revoked_by_email = NULL, revoked_at = NULL, note = excluded.note,
         updated_at = excluded.updated_at`,
    ).bind(input.userId, input.actorUserId, input.actorEmail, updatedAt, input.expiresAt, input.note, updatedAt),
    env.DB.prepare(
      `INSERT INTO admin_pro_grant_audit(
         id, user_id, target_email, action, actor_user_id, actor_email, expires_at, note
       ) VALUES (?, ?, ?, 'grant_pro', ?, ?, ?, ?)`,
    ).bind(auditId, input.userId, input.targetEmail, input.actorUserId, input.actorEmail, input.expiresAt, input.note),
  ]);
  return auditId;
}

export async function revokeManualPro(
  env: SaasEnv,
  input: { userId: string; targetEmail: string; actorUserId: string; actorEmail: string },
): Promise<string | null> {
  const grant = await getManualProGrant(env, input.userId);
  if (!grant || grant.status !== "active") return null;
  const auditId = crypto.randomUUID();
  const revokedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE admin_pro_grants
       SET status = 'revoked', revoked_by_user_id = ?, revoked_by_email = ?,
           revoked_at = ?, updated_at = ?
       WHERE user_id = ? AND status = 'active'`,
    ).bind(input.actorUserId, input.actorEmail, revokedAt, revokedAt, input.userId),
    env.DB.prepare(
      `INSERT INTO admin_pro_grant_audit(
         id, user_id, target_email, action, actor_user_id, actor_email, expires_at, note
       ) VALUES (?, ?, ?, 'revoke_pro', ?, ?, NULL, NULL)`,
    ).bind(auditId, input.userId, input.targetEmail, input.actorUserId, input.actorEmail),
  ]);
  return auditId;
}

export async function getAccountEntitlement(env: SaasEnv, userId: string): Promise<AccountEntitlement> {
  const row = await env.DB.prepare(
    `SELECT billing_accounts.plan_code, billing_accounts.status, billing_accounts.provider,
            billing_accounts.current_period_end, billing_accounts.grace_until,
            admin_pro_grants.status AS manual_grant_status,
            admin_pro_grants.expires_at AS manual_grant_expires_at
     FROM billing_accounts
     LEFT JOIN admin_pro_grants ON admin_pro_grants.user_id = billing_accounts.user_id
     WHERE billing_accounts.user_id = ?`,
  ).bind(userId).first<{
    plan_code: string;
    status: string;
    provider: string | null;
    current_period_end: string | null;
    grace_until: string | null;
    manual_grant_status: "active" | "revoked" | null;
    manual_grant_expires_at: string | null;
  }>();

  if (!row) {
    await ensureSaasAccount(env, userId, null);
    return getAccountEntitlement(env, userId);
  }

  const manualExpiry = row.manual_grant_expires_at ? Date.parse(row.manual_grant_expires_at) : null;
  const manualGrantActive = row.manual_grant_status === "active" &&
    (manualExpiry === null || (Number.isFinite(manualExpiry) && manualExpiry > Date.now()));
  if (manualGrantActive) {
    return {
      ownerId: userId,
      plan: "pro",
      status: "admin_granted",
      currentPeriodEnd: row.manual_grant_expires_at,
      graceUntil: null,
      limits: PLAN_LIMITS.pro,
      source: "manual",
    };
  }

  const now = Date.now();
  const periodEnd = row.current_period_end ? Date.parse(row.current_period_end) : 0;
  const graceEnd = row.grace_until ? Date.parse(row.grace_until) : 0;
  const active = (row.status === "active" || row.status === "canceling") && Number.isFinite(periodEnd) && periodEnd > now;
  const inGracePeriod = row.status === "past_due" && graceEnd > now;
  const plan: AccountPlan = row.plan_code === "pro" && (active || inGracePeriod) ? "pro" : "free";

  return {
    ownerId: userId,
    plan,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    graceUntil: row.grace_until,
    limits: PLAN_LIMITS[plan],
    source: plan === "pro" && row.provider === "waffo" ? "waffo" : plan === "pro" && row.provider === "opcpay" ? "opcpay" : "free",
  };
}

export async function getOwnerStorageBytes(env: SaasEnv, ownerId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COALESCE(SUM(size), 0) FROM entries WHERE owner_id = ?) +
       (SELECT COALESCE(SUM(history.size), 0)
        FROM file_versions history
        JOIN entries e ON e.id = history.entry_id
        WHERE e.owner_id = ? AND history.version < COALESCE(e.version, 1)) AS total`,
  ).bind(ownerId, ownerId).first<{ total: number }>();
  return Number(row?.total || 0);
}

export async function reserveStorageBytes(
  env: SaasEnv,
  userId: string,
  reservationId: string,
  bytes: number,
  storageLimit: number,
): Promise<boolean> {
  const requestedBytes = Math.max(0, Math.floor(bytes));
  await env.DB.prepare("DELETE FROM saas_storage_reservations WHERE expires_at <= CURRENT_TIMESTAMP").run();
  const result = await env.DB.prepare(
    `INSERT INTO saas_storage_reservations(reservation_id, user_id, reserved_bytes, expires_at)
     SELECT ?, ?, ?, datetime('now', '+7 days')
     WHERE
       (SELECT COALESCE(SUM(e.size), 0) FROM entries e WHERE e.owner_id = ?) +
       (SELECT COALESCE(SUM(history.size), 0)
        FROM file_versions history
        JOIN entries e ON e.id = history.entry_id
        WHERE e.owner_id = ? AND history.version < COALESCE(e.version, 1)) +
       (SELECT COALESCE(SUM(reserved_bytes), 0) FROM saas_storage_reservations
        WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP) + ? <= ?`,
  ).bind(reservationId, userId, requestedBytes, userId, userId, userId, requestedBytes, storageLimit).run();
  return Number(result.meta.changes || 0) === 1;
}

export async function releaseStorageReservation(
  env: SaasEnv,
  reservationId: string,
  userId?: string,
): Promise<void> {
  await env.DB.prepare(
    "DELETE FROM saas_storage_reservations WHERE reservation_id = ? AND (? IS NULL OR user_id = ?)",
  ).bind(reservationId, userId ?? null, userId ?? null).run();
}

export async function recordApiRequest(
  env: SaasEnv,
  userId: string,
  maxRequests: number,
  maxRequestsPerMinute: number,
): Promise<{ allowed: boolean; used: number; reason?: "monthly" | "rate" }> {
  const now = new Date().toISOString();
  const period = now.slice(0, 7);
  const minuteBucket = now.slice(0, 16);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO monthly_usage(user_id, period, api_requests)
     VALUES (?, ?, 0)`,
  ).bind(userId, period).run();
  const increment = await env.DB.prepare(
    `UPDATE monthly_usage
     SET api_requests = api_requests + 1,
         minute_bucket = ?,
         minute_requests = CASE WHEN minute_bucket = ? THEN minute_requests + 1 ELSE 1 END
     WHERE user_id = ? AND period = ? AND api_requests < ?
       AND (COALESCE(minute_bucket, '') <> ? OR minute_requests < ?)`,
  ).bind(minuteBucket, minuteBucket, userId, period, maxRequests, minuteBucket, maxRequestsPerMinute).run();
  const row = await env.DB.prepare(
    "SELECT api_requests FROM monthly_usage WHERE user_id = ? AND period = ?",
  ).bind(userId, period).first<{ api_requests: number }>();
  const used = Number(row?.api_requests || 0);
  const allowed = Number(increment.meta.changes || 0) > 0;
  return {
    allowed,
    used,
    ...(allowed ? {} : { reason: used >= maxRequests ? "monthly" as const : "rate" as const }),
  };
}

export async function recordUploadBytes(env: SaasEnv, userId: string, bytes: number): Promise<void> {
  const period = new Date().toISOString().slice(0, 7);
  await env.DB.prepare(
    `INSERT INTO monthly_usage(user_id, period, uploaded_bytes)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, period)
     DO UPDATE SET uploaded_bytes = uploaded_bytes + excluded.uploaded_bytes`,
  ).bind(userId, period, Math.max(0, Math.floor(bytes))).run();
}

export async function getMonthlyApiRequests(env: SaasEnv, userId: string): Promise<number> {
  const period = new Date().toISOString().slice(0, 7);
  const row = await env.DB.prepare(
    "SELECT api_requests FROM monthly_usage WHERE user_id = ? AND period = ?",
  ).bind(userId, period).first<{ api_requests: number }>();
  return Number(row?.api_requests || 0);
}

export async function getOwnedOrGlobalEntryFilter(ownerId: string, isAdmin: boolean): Promise<{
  sql: string;
  bindings: unknown[];
}> {
  return isAdmin ? { sql: "", bindings: [] } : { sql: " AND owner_id = ?", bindings: [ownerId] };
}
