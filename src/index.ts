import { createAuth, isSaasEnabled, migrateAuthSchema } from "./lib/auth";
import { accountPage } from "./pages/account";
import { apiDocsPage } from "./pages/api-docs";
import { landingPage } from "./pages/landing";
import { privacyPolicyPage } from "./pages/privacy";
import {
  ADMIN_OWNER_ID,
  ensureSaasAccount,
  ensureSaasSchema,
  getAccountEntitlement,
  getManualProGrant,
  getMonthlyApiRequests,
  getOwnerStorageBytes,
  grantManualPro,
  isSaasSuperadmin,
  LOCAL_OWNER_ID,
  recordApiRequest,
  recordUploadBytes,
  releaseStorageReservation,
  reserveStorageBytes,
  revokeManualPro,
  type AccountEntitlement,
} from "./lib/saas";
import {
  createWaffoCustomerPortalLink,
  createWaffoSubscriptionCheckout,
  verifyWaffoWebhook,
  type WaffoEnv,
  type WaffoWebhookEvent,
  type WaffoWebhookEventData,
} from "./lib/waffo";
import { createOpcPayPurchase, getOpcPayAccess, getOpcPayProduct, type OpcPayEnv } from "./lib/opcpay";

export interface Env extends WaffoEnv, OpcPayEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  CLIPBOARD: KVNamespace;
  PS_SHARED_SECRET: string;
  PS_API_KEY?: string;
  ENABLE_SAAS?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SAAS_BOOTSTRAP_EMAIL?: string;
  SAAS_SUPERADMIN_EMAILS?: string;
  WAFFO_PRODUCT_PRO_MONTHLY?: string;
  WAFFO_PRODUCT_PRO_YEARLY?: string;
  WAFFO_CURRENCY?: string;
}

type EntryRow = {
  id: string;
  owner_id?: string | null;
  filename: string;
  content_type: string | null;
  size: number;
  md5: string | null;
  version: number;
  current_object_key: string | null;
  upload_time: string;
  updated_time: string | null;
  expiration_time: string | null;
  note: string | null;
  guest_link_id: string | null;
};

type FileVersionRow = {
  entry_id: string;
  version: number;
  filename: string;
  content_type: string | null;
  size: number;
  md5: string | null;
  created_time: string;
  object_key: string;
};

type GuestLinkRow = {
  id: string;
  owner_id?: string | null;
  label: string | null;
  created_time: string | null;
  max_file_bytes: number | null;
  max_file_lifetime_days: number | null;
  max_file_uploads: number | null;
  url_expires: string | null;
  upload_count: number | null;
};

const CLIPBOARD_KEY_PREFIX = "clipboard:";
export const MAX_CLIPBOARD_CHARS = 1_000_000;
const MULTIPART_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const MULTIPART_UPLOAD_THRESHOLD_BYTES = 100 * 1024 * 1024;
const API_KEY_EXPIRATION_SECONDS = new Set([7, 30, 90, 180, 365].map((days) => days * 24 * 60 * 60));
const RESERVED_CLIPBOARD_SLUGS = new Set([
  "api",
  "guest",
  "clips",
  "clipboard-api",
  "favicon.svg",
  "_preview",
]);

type ClipboardRecord = {
  slug: string;
  publicId?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  passwordHash?: string | null;
};

type ClipboardSummary = {
  slug: string;
  publicId?: string;
  updatedAt: string;
  charCount: number;
  itemCount: number;
  hasPassword: boolean;
};

type MultipartUploadRow = {
  upload_id: string;
  owner_id?: string | null;
  entry_id: string;
  filename: string;
  content_type: string;
  size: number;
  expiration_time: string | null;
  note: string | null;
  is_update: number;
  expected_version: number | null;
  object_key: string | null;
  complete_token: string | null;
  complete_started_at: string | null;
  active_parts: number;
};

const MD5_SHIFT_AMOUNTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_CONSTANTS = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0,
);

function md5LeftRotate(value: number, amount: number): number {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

class Md5Hasher {
  private a = 0x67452301;
  private b = 0xefcdab89;
  private c = 0x98badcfe;
  private d = 0x10325476;
  private totalBytes = 0;
  private pending = new Uint8Array(64);
  private pendingLength = 0;

  update(input: Uint8Array): this {
    this.totalBytes += input.byteLength;
    let offset = 0;

    if (this.pendingLength > 0) {
      const needed = 64 - this.pendingLength;
      const copied = Math.min(needed, input.byteLength);
      this.pending.set(input.subarray(0, copied), this.pendingLength);
      this.pendingLength += copied;
      offset += copied;
      if (this.pendingLength === 64) {
        this.processBlock(this.pending);
        this.pendingLength = 0;
      }
    }

    while (offset + 64 <= input.byteLength) {
      this.processBlock(input.subarray(offset, offset + 64));
      offset += 64;
    }

    if (offset < input.byteLength) {
      this.pending.set(input.subarray(offset), 0);
      this.pendingLength = input.byteLength - offset;
    }
    return this;
  }

  digest(): string {
    const tailLength = this.pendingLength;
    const paddedLength = tailLength < 56 ? 64 : 128;
    const finalBlock = new Uint8Array(paddedLength);
    finalBlock.set(this.pending.subarray(0, tailLength));
    finalBlock[tailLength] = 0x80;

    const bitLength = this.totalBytes * 8;
    for (let i = 0; i < 8; i += 1) {
      finalBlock[paddedLength - 8 + i] = Math.floor(bitLength / 2 ** (8 * i)) & 0xff;
    }

    this.processBlock(finalBlock.subarray(0, 64));
    if (paddedLength === 128) this.processBlock(finalBlock.subarray(64, 128));

    return [this.a, this.b, this.c, this.d]
      .map((word) => Array.from({ length: 4 }, (_, i) => ((word >>> (8 * i)) & 0xff).toString(16).padStart(2, "0")).join(""))
      .join("");
  }

  private processBlock(block: Uint8Array): void {
    const words = new Uint32Array(16);
    for (let i = 0; i < 16; i += 1) {
      const offset = i * 4;
      words[i] = (
        block[offset] |
        (block[offset + 1] << 8) |
        (block[offset + 2] << 16) |
        (block[offset + 3] << 24)
      ) >>> 0;
    }

    let a = this.a;
    let b = this.b;
    let c = this.c;
    let d = this.d;

    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const next = (a + f + MD5_CONSTANTS[i] + words[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + md5LeftRotate(next, MD5_SHIFT_AMOUNTS[i])) >>> 0;
    }

    this.a = (this.a + a) >>> 0;
    this.b = (this.b + b) >>> 0;
    this.c = (this.c + c) >>> 0;
    this.d = (this.d + d) >>> 0;
  }
}

export function md5Hex(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return new Md5Hasher().update(bytes).digest();
}

async function md5HexFromStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const hasher = new Md5Hasher();
  const reader = body.getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    hasher.update(chunk.value);
  }
  return hasher.digest();
}

export function generateID(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function withCors(headers: HeadersInit = {}): Headers {
  const h = new Headers(headers);
  // Only the public landing page opts back into indexing. All Worker-generated
  // pages, APIs, share links, previews, and downloads are excluded by default.
  if (!h.has("X-Robots-Tag")) h.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  return h;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCors({ "Content-Type": "application/json" }),
  });
}

function jsonNoStore(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCors({ "Content-Type": "application/json", "Cache-Control": "no-store" }),
  });
}

export function parseExpirationDays(input: string | null): number | null {
  if (!input) return null;
  const n = Number.parseInt(input, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 3650);
}

export function resolveUploadExpirationDays(input: unknown, maxDays: number | null): number | null {
  if (maxDays === null) return parseExpirationDays(input == null ? null : String(input));
  if (input === "0" || input === 0) return maxDays > 30 ? null : maxDays;
  const requested = parseExpirationDays(input == null ? null : String(input));
  return Math.min(requested || maxDays, maxDays);
}

export function parseMultipartPartNumber(input: string | null): number | null {
  if (!input) return null;
  if (!/^\d+$/.test(input)) return null;
  const n = Number.parseInt(input, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function shouldUseMultipartUpload(sizeBytes: number): boolean {
  return Number.isFinite(sizeBytes) && sizeBytes >= MULTIPART_UPLOAD_THRESHOLD_BYTES;
}

export function expirationToISO(days: number | null): string | null {
  if (!days) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function isAllowedRequestOrigin(origin: string | null, configuredBaseURL: string | undefined, requestURL: string): boolean {
  try {
    return origin === new URL(configuredBaseURL?.trim() || requestURL).origin;
  } catch {
    return false;
  }
}

function boolFromSetting(value: string | null): boolean {
  return value === "1" || value === "true";
}

async function ensureSchema(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`,
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS download_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id TEXT NOT NULL,
      downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip TEXT,
      user_agent TEXT
    )`,
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS multipart_uploads (
      upload_id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      expiration_time TEXT,
      note TEXT,
      created_time DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS multipart_upload_parts (
      upload_id TEXT NOT NULL,
      part_number INTEGER NOT NULL,
      etag TEXT NOT NULL,
      PRIMARY KEY(upload_id, part_number)
    )`,
  ).run();

  await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS file_versions (
      entry_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT,
      size INTEGER NOT NULL,
      md5 TEXT,
      created_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      object_key TEXT NOT NULL,
      PRIMARY KEY(entry_id, version)
    )`,
  ).run();

  const alterStatements = [
    "ALTER TABLE entries ADD COLUMN md5 TEXT",
    "ALTER TABLE entries ADD COLUMN version INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE entries ADD COLUMN current_object_key TEXT",
    "ALTER TABLE entries ADD COLUMN updated_time DATETIME",
    "ALTER TABLE guest_links ADD COLUMN label TEXT",
    "ALTER TABLE guest_links ADD COLUMN created_time DATETIME DEFAULT CURRENT_TIMESTAMP",
    "ALTER TABLE guest_links ADD COLUMN upload_count INTEGER DEFAULT 0",
    "ALTER TABLE multipart_uploads ADD COLUMN is_update INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE multipart_uploads ADD COLUMN expected_version INTEGER",
    "ALTER TABLE multipart_uploads ADD COLUMN object_key TEXT",
    "ALTER TABLE multipart_uploads ADD COLUMN complete_token TEXT",
    "ALTER TABLE multipart_uploads ADD COLUMN complete_started_at DATETIME",
    "ALTER TABLE multipart_uploads ADD COLUMN active_parts INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE multipart_uploads ADD COLUMN active_parts_updated_at DATETIME",
  ];

  for (const stmt of alterStatements) {
    const match = stmt.match(/^ALTER TABLE ([A-Za-z_][A-Za-z0-9_]*) ADD COLUMN ([A-Za-z_][A-Za-z0-9_]*)/i);
    if (!match) throw new Error(`Invalid schema alteration: ${stmt}`);
    const columns = await env.DB.prepare(`PRAGMA table_info(${match[1]})`).all<{ name: string }>();
    if (!columns.results.some((column) => column.name === match[2])) await env.DB.exec(stmt);
  }

  await env.DB.prepare(
    "INSERT OR IGNORE INTO settings(key, value) VALUES ('store_forever', '1')",
  ).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO settings(key, value) VALUES ('default_expiration_days', '30')",
  ).run();

  await ensureSaasSchema(env);
}

let schemaReady: Promise<void> | null = null;

async function ensureSchemaOnce(
  env: Env,
  auth?: ReturnType<typeof createAuth>,
): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureSchema(env);
      if (auth) await migrateAuthSchema(auth);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401, headers: withCors() });
}

async function resolveSaasSuperadmin(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth> | null,
  principal: Principal,
): Promise<{ userId: string; email: string } | null> {
  if (!auth || principal.authType !== "session" || !principal.userId) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.id !== principal.userId || !session.user.emailVerified) return null;
  if (!isSaasSuperadmin(session.user.email, env.SAAS_SUPERADMIN_EMAILS)) return null;
  return { userId: session.user.id, email: session.user.email.trim().toLowerCase() };
}

type Principal = {
  ownerId: string;
  userId: string | null;
  email: string | null;
  authType: "session" | "api-key" | "local-secret" | "admin-secret";
  isAdmin: boolean;
};

function requestCredential(request: Request): string | null {
  const apiKeyHeader = request.headers.get("X-API-Key");
  const authorization = request.headers.get("Authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  return apiKeyHeader ?? bearerMatch?.[1] ?? authorization;
}

async function resolvePrincipal(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth> | null,
  saasEnabled: boolean,
): Promise<Principal | null> {
  const credential = requestCredential(request);

  if (credential && credential === env.PS_SHARED_SECRET) {
    return {
      ownerId: saasEnabled ? ADMIN_OWNER_ID : LOCAL_OWNER_ID,
      userId: null,
      email: null,
      authType: saasEnabled ? "admin-secret" : "local-secret",
      isAdmin: true,
    };
  }

  if (!saasEnabled || !auth) {
    if (credential && credential === env.PS_API_KEY) {
      return { ownerId: LOCAL_OWNER_ID, userId: null, email: null, authType: "local-secret", isAdmin: true };
    }
    return null;
  }

  const apiKey = request.headers.get("X-API-Key") || credential;
  if (apiKey) {
    const result = await auth.api.verifyApiKey({ body: { key: apiKey } });
    if (!result.valid || !result.key?.referenceId) return null;
    const userId = result.key.referenceId;
    if (await env.DB.prepare("SELECT 1 AS deleted FROM deleted_saas_users WHERE user_id = ? LIMIT 1")
      .bind(userId).first<{ deleted: number }>()) return null;
    await ensureSaasAccount(env, userId, null);
    return { ownerId: userId, userId, email: null, authType: "api-key", isAdmin: false };
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  if (await env.DB.prepare("SELECT 1 AS deleted FROM deleted_saas_users WHERE user_id = ? LIMIT 1")
    .bind(session.user.id).first<{ deleted: number }>()) return null;
  await ensureSaasAccount(env, session.user.id, session.user.email);
  return {
    ownerId: session.user.id,
    userId: session.user.id,
    email: session.user.email,
    authType: "session",
    isAdmin: false,
  };
}

function checkoutPeriodEnd(productId: string, env: Env, periodStart: string): string | null {
  const months = productId === env.WAFFO_PRODUCT_PRO_MONTHLY
    ? 1
    : productId === env.WAFFO_PRODUCT_PRO_YEARLY
      ? 12
      : 0;
  if (!months) return null;

  const parsedStart = Date.parse(periodStart);
  const end = new Date(Number.isFinite(parsedStart) ? parsedStart : Date.now());
  const dayOfMonth = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
  return end.toISOString();
}

async function handleWaffoWebhook(request: Request, env: Env): Promise<Response> {
  if (!isSaasEnabled(env.ENABLE_SAAS)) return new Response("Not Found", { status: 404 });
  if (env.WAFFO_ENV !== "test" && env.WAFFO_ENV !== "prod") {
    return json({ error: "Set WAFFO_ENV to test or prod before enabling Waffo webhooks" }, 503);
  }

  let event: WaffoWebhookEvent<WaffoWebhookEventData>;
  try {
    event = await verifyWaffoWebhook<WaffoWebhookEventData>(request, env, { environment: env.WAFFO_ENV });
  } catch (err) {
    return json({ error: String((err as Error)?.message || err) }, 400);
  }
  if (!event.mode || event.mode.toLowerCase() !== env.WAFFO_ENV) {
    return json({ error: "Waffo event environment does not match this deployment" }, 400);
  }
  if (env.WAFFO_STORE_ID && event.storeId !== env.WAFFO_STORE_ID) {
    return json({ error: "Waffo event belongs to a different store" }, 400);
  }

  const data = event.data || {};
  // Waffo's `id` is unique per webhook delivery and is the retry-safe dedupe key.
  const eventId = event.id;
  if (!eventId) return json({ error: "Waffo event id is required" }, 400);
  const reference = data.orderMerchantExternalId || null;
  const attempt = reference
    ? await env.DB.prepare(
        "SELECT reference, user_id, plan_code, product_id, status FROM billing_checkout_attempts WHERE reference = ?",
      ).bind(reference).first<{ reference: string; user_id: string; plan_code: string; product_id: string; status: string }>()
    : null;
  const identity = data.merchantProvidedBuyerIdentity || null;
  const userId = attempt?.user_id || identity;
  const eventType = event.eventType || "unknown";
  const existingAccount = userId
    ? await env.DB.prepare("SELECT provider_product_id FROM billing_accounts WHERE user_id = ?")
        .bind(userId).first<{ provider_product_id: string | null }>()
    : null;
  const productId = data.productId || attempt?.product_id || existingAccount?.provider_product_id || "";
  const productIsPro = Boolean(
    [env.WAFFO_PRODUCT_PRO_MONTHLY, env.WAFFO_PRODUCT_PRO_YEARLY].includes(productId),
  );

  const lifecycleEvents = new Set([
    "subscription.activated", "subscription.renewed", "subscription.recovered",
    "subscription.plan_changed", "subscription.canceling", "subscription.uncanceled",
    "subscription.canceled", "subscription.past_due", "subscription.payment_succeeded", "refund.succeeded",
  ]);
  if (lifecycleEvents.has(eventType) && !userId) {
    return json({ error: "Waffo event could not be matched to a PicoShare account" }, 400);
  }
  if (userId && await env.DB.prepare("SELECT 1 AS deleted FROM deleted_saas_users WHERE user_id = ? LIMIT 1")
    .bind(userId).first<{ deleted: number }>()) {
    return json({ received: true, ignored: true, reason: "account_deleted" });
  }
  if (eventType === "subscription.activated" && (!attempt || !productIsPro || attempt.plan_code !== "pro")) {
    return json({ error: "Waffo activation does not match a pending Pro checkout" }, 400);
  }
  if (lifecycleEvents.has(eventType) && !productIsPro) {
    return json({ received: true, ignored: true });
  }
  if (attempt && identity && attempt.user_id !== identity) {
    return json({ error: "Waffo buyer identity does not match the checkout" }, 400);
  }
  if (userId) await ensureSaasAccount(env, userId, null);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO billing_webhook_events(event_id, event_type, reference, processing_status)
     VALUES (?, ?, ?, 'processing')`,
  ).bind(eventId, eventType, reference).run();
  await env.DB.prepare(
    `UPDATE billing_webhook_events SET processing_status = 'processing'
     WHERE event_id = ? AND processing_status = 'failed'`,
  ).bind(eventId).run();

  const currentPeriodStart = data.currentPeriodStart || null;
  const currentPeriodEnd = data.currentPeriodEnd || null;
  const orderId = data.orderId || null;
  const timestamp = new Date().toISOString();
  const updateAccount = async (
    status: string,
    grantPro: boolean,
    graceUntil: string | null = null,
    period: { start: string | null; end: string | null } | null = null,
  ) => {
    if (!userId) return;
    await env.DB.prepare(
      `UPDATE billing_accounts
       SET plan_code = ?, status = ?, provider = 'waffo',
           provider_order_id = COALESCE(?, provider_order_id),
           provider_product_id = COALESCE(?, provider_product_id),
           current_period_start = COALESCE(?, current_period_start),
           current_period_end = COALESCE(?, current_period_end),
           grace_until = ?, updated_at = ?
       WHERE user_id = ?
         AND EXISTS (SELECT 1 FROM billing_webhook_events WHERE event_id = ? AND processing_status = 'processing')`,
    ).bind(
      grantPro ? "pro" : "free", status, orderId, productId || null,
      period?.start ?? currentPeriodStart, period?.end ?? currentPeriodEnd,
      graceUntil, timestamp, userId, eventId,
    ).run();
  };

  try {
    switch (eventType) {
      case "subscription.activated":
      case "subscription.renewed":
      case "subscription.recovered":
      case "subscription.plan_changed":
      case "subscription.uncanceled":
        {
          const periodStart = currentPeriodStart || event.timestamp || timestamp;
          const calculatedEnd = currentPeriodEnd || checkoutPeriodEnd(productId, env, periodStart);
          if (!calculatedEnd || !Number.isFinite(Date.parse(calculatedEnd)) || Date.parse(calculatedEnd) <= Date.now()) {
            throw new Error("Waffo subscription event is missing a valid billing period end");
          }
          await updateAccount("active", true, null, { start: periodStart, end: calculatedEnd });
        }
        break;
      case "subscription.payment_succeeded":
        // Some Waffo webhook configurations deliver payment confirmations without
        // the separate activation event. Only use this as an activation fallback
        // for the matching unpaid PicoShare checkout; recurring payment notices
        // must not extend access without the lifecycle event's period dates.
        if (attempt && attempt.plan_code === "pro" && attempt.status !== "paid") {
          const eventTimestamp = Date.parse(event.timestamp || "");
          const periodStart = currentPeriodStart ||
            (Number.isFinite(eventTimestamp) ? new Date(eventTimestamp).toISOString() : timestamp);
          const periodEnd = currentPeriodEnd || checkoutPeriodEnd(productId, env, periodStart);
          if (periodEnd) await updateAccount("active", true, null, { start: periodStart, end: periodEnd });
        }
        break;
      case "subscription.canceling":
        await updateAccount("canceling", true);
        break;
      case "subscription.past_due":
        await updateAccount("past_due", true, new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString());
        break;
      case "subscription.canceled":
        await updateAccount("canceled", false);
        break;
      case "refund.succeeded":
        await updateAccount("refunded", false);
        break;
    }
    if (attempt && eventType.startsWith("subscription.")) {
      await env.DB.prepare(
        "UPDATE billing_checkout_attempts SET status = 'paid' WHERE reference = ?",
      ).bind(attempt.reference).run();
    }
    await env.DB.prepare(
      `UPDATE billing_webhook_events SET processing_status = 'processed', processed_at = CURRENT_TIMESTAMP
       WHERE event_id = ? AND processing_status = 'processing'`,
    ).bind(eventId).run();
    return json({ received: true });
  } catch (err) {
    await env.DB.prepare(
      "UPDATE billing_webhook_events SET processing_status = 'failed' WHERE event_id = ? AND processing_status = 'processing'",
    ).bind(eventId).run();
    return json({ error: `Could not process Waffo event: ${String((err as Error)?.message || err)}` }, 500);
  }
}

function htmlPage(saasMode = false, googleLoginEnabled = false): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>PicoShare TS</title>
  <style>
    :root {
      --bg: #eef1f8;
      --bg-2: #f7f9ff;
      --glass: rgba(255, 255, 255, 0.45);
      --glass-strong: rgba(255, 255, 255, 0.72);
      --text: #26354d;
      --muted: #6f7d94;
      --line: rgba(255, 255, 255, 0.68);
      --shadow: 0 24px 80px rgba(66, 82, 130, 0.24);
      --primary: #101b72;
      --accent: #4ec7a7;
      --danger: #eb4b70;
      --blue: #328ecf;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Avenir Next", "SF Pro Text", "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 18% 86%, rgba(68, 95, 255, 0.5), transparent 30%),
        radial-gradient(circle at 80% 30%, rgba(243, 173, 233, 0.6), transparent 30%),
        radial-gradient(circle at 55% 50%, rgba(255, 255, 255, 0.7), transparent 42%),
        linear-gradient(145deg, var(--bg-2), var(--bg));
      min-height: 100vh;
      padding: 18px;
    }
    .shell {
      max-width: 1240px;
      margin: 0 auto;
      background: transparent;
      border: 0;
      border-radius: 0;
      padding: 0 0 48px;
      min-height: calc(100vh - 36px);
      box-shadow: none;
      backdrop-filter: none;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 18px 52px;
    }
    .brand { font-size: 32px; font-weight: 600; letter-spacing: 0.5px; color: #42506a; }
    .nav { display: flex; gap: 10px; align-items: center; }
    .nav .nav-upload,
    .nav .btn.small {
      height: 40px;
      box-sizing: border-box;
    }
    .nav button:not(.btn):not(.nav-upload),
    .sys-toggle {
      border: 0;
      background: transparent;
      color: #58657d;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 24px;
      cursor: pointer;
      transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
    }
    .nav button:not(.btn):not(.nav-upload)[aria-current="page"],
    .sys-toggle.active {
      background: var(--accent);
      color: #fff;
    }
    .nav button:not(.btn):not(.nav-upload):hover,
    .sys-toggle:hover { background: rgba(78, 199, 167, 0.2); transform: translateY(-1px); }
    .nav button.nav-upload {
      cursor: pointer;
      font-weight: 700;
      transition: all 0.2s;
      padding: 0 18px;
      border-radius: 100px;
      background: #cfef00;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      font-size: 15px;
      color: #111;
      gap: 4px;
      min-width: 138px;
    }
    .nav button.nav-upload:hover {
      background: #c4e201;
      transform: translateY(-1px);
    }
    .nav button.nav-upload > svg {
      width: 24px;
      height: 24px;
      margin-left: 6px;
      transition: transform 0.3s ease-in-out;
      flex-shrink: 0;
    }
    .nav button.nav-upload:hover svg {
      transform: translateX(5px);
    }
    .nav button.nav-upload:active {
      transform: scale(0.95);
    }
    .nav button.nav-upload[aria-current="page"] {
      background: #cfef00;
      color: #111;
    }
    .top-right { position: relative; }
    .system-menu {
      position: absolute;
      right: 0;
      top: calc(100% + 8px);
      min-width: 220px;
      background: var(--glass-strong);
      border: 1px solid rgba(255, 255, 255, 0.75);
      border-radius: 12px;
      box-shadow: 0 12px 28px rgba(59, 77, 115, 0.24);
      backdrop-filter: blur(14px);
      display: none;
      overflow: hidden;
      z-index: 20;
    }
    .system-menu button {
      width: 100%;
      border: 0;
      background: transparent;
      text-align: left;
      padding: 12px 14px;
      font-size: 15px;
      color: #42506a;
      cursor: pointer;
    }
    .system-menu button:hover { background: rgba(255, 255, 255, 0.68); }
    main { padding: 10px 52px; }
    main:focus { outline: none; }
    h1 { font-size: 50px; margin: 18px 0 24px; letter-spacing: 0.2px; }
    h2 { font-size: 38px; margin: 0 0 16px; }
    h3 { font-size: 24px; margin: 14px 0; }
    .muted { color: var(--muted); }
    .small { font-size: 13px; color: var(--muted); }
    .stack { display: grid; gap: 16px; max-width: 920px; }
    .stack-wide { max-width: 1140px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    label { font-size: 15px; font-weight: 600; display: inline-block; margin-bottom: 6px; color: #4e5d77; }
    input, select, textarea {
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.7);
      border-radius: 12px;
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.36);
      color: #40506a;
      font-size: 16px;
      outline: none;
      backdrop-filter: blur(10px);
    }
    input:focus, select:focus, textarea:focus {
      border-color: rgba(16, 27, 114, 0.42);
      box-shadow: 0 0 0 3px rgba(16, 27, 114, 0.12);
    }
    textarea { min-height: 100px; resize: vertical; }
    .btn {
      --btn-color: rgb(40, 144, 241);
      background: transparent;
      position: relative;
      padding: 5px 15px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 17px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid var(--btn-color);
      border-radius: 25px;
      outline: none;
      overflow: hidden;
      color: var(--btn-color);
      transition: color 0.3s 0.1s ease-out, transform 0.2s ease;
      text-align: center;
      gap: 6px;
      min-width: 96px;
      z-index: 1;
    }
    .btn:hover {
      color: #fff;
      border: 1px solid var(--btn-color);
      transform: translateY(-1px);
    }
    .btn::before {
      position: absolute;
      inset: 0;
      content: '';
      border-radius: inherit;
      background: var(--btn-color);
      transform: scaleX(0);
      transform-origin: left center;
      transition: transform 0.3s ease-out;
      z-index: -1;
    }
    .btn:hover::before {
      transform: scaleX(1);
    }
    .btn span {
      margin: 10px;
    }
    .btn.small {
      font-size: 14px;
      padding: 0 12px;
      border-radius: 12px;
      min-width: 84px;
      min-height: 40px;
    }
    .btn.secondary.small {
      min-width: 42px;
      padding: 0 8px;
    }
    .btn.blue.small {
      min-width: 42px;
      padding: 0 8px;
    }
    .btn.blue {
      --btn-color: rgb(40, 144, 241);
    }
    .btn.danger {
      --btn-color: #eb4b70;
    }
    .btn.form-submit {
      min-width: 140px;
      padding: 8px 18px;
      font-size: 15px;
    }
    .btn.form-submit.tight {
      min-width: 92px;
      padding: 6px 14px;
      font-size: 14px;
    }
    .submit-row {
      width: 100%;
      display: flex;
      justify-content: flex-end;
    }
    .drop {
      border: 2px dashed rgba(148, 166, 196, 0.55);
      background: rgba(255, 255, 255, 0.24);
      border-radius: 16px;
      padding: 24px;
      width: 100%;
      min-height: 170px;
      text-align: center;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 8px;
      transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
    }
    .drop:hover {
      border-color: rgba(77, 143, 233, 0.72);
      background: rgba(255, 255, 255, 0.38);
    }
    .drop.dragover {
      border-color: rgba(34, 130, 255, 0.95);
      background: rgba(207, 231, 255, 0.38);
      box-shadow: inset 0 0 0 2px rgba(53, 143, 255, 0.15);
    }
    .drop-primary {
      font-size: 18px;
      font-weight: 700;
      color: #3d4f70;
    }
    .drop-secondary {
      font-size: 13px;
      color: #6f7d94;
    }
    .drop-file {
      margin-top: 2px;
      font-size: 13px;
      color: #385cc8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .upload-grid {
      display: grid;
      gap: 16px;
      max-width: 920px;
      width: 100%;
    }
    .note-box {
      border-left: 4px solid #5b72cf;
      background: rgba(190, 201, 239, 0.45);
      color: #4058b5;
      border-radius: 10px;
      padding: 18px 24px;
      max-width: 940px;
      font-size: 18px;
      line-height: 1.55;
    }
    .panel {
      border: 1px solid rgba(255, 255, 255, 0.7);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.32);
      padding: 18px 22px;
      backdrop-filter: blur(14px);
    }
    .settings-form {
      max-width: 620px;
      display: grid;
      gap: 14px;
      padding: 20px 22px;
    }
    .settings-form h3 {
      margin: 0 0 6px;
    }
    .check-row,
    .toggle-row {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      width: fit-content;
    }
    .check-row input[type="checkbox"],
    .toggle-row input[type="checkbox"] {
      width: 16px;
      height: 16px;
      margin: 0;
      border-radius: 4px;
    }
    .check-row label,
    .toggle-row label {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #46597c;
      cursor: pointer;
    }
    .days-row {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      width: fit-content;
    }
    .days-row input {
      width: 120px;
      text-align: center;
    }
    .days-row span {
      color: #60728f;
      font-size: 15px;
      font-weight: 600;
    }
    .days-row.disabled {
      opacity: 0.55;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 15px;
      background: rgba(255, 255, 255, 0.2);
    }
    .table-wrap {
      width: 100%;
      overflow-x: auto;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.5);
      background: rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(10px);
    }
    .files-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .files-search { flex: 1 1 260px; max-width: 420px; }
    .files-search input {
      width: 100%;
      min-width: 0;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.58);
    }
    .files-count, .files-page-info { color: #53627b; font-size: 14px; }
    .files-bulk-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: -4px;
    }
    .files-bulk-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .files-bulk-toolbar .btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
    .files-pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .files-pagination .btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
      pointer-events: none;
    }
    table.files-table { width: 100%; min-width: 900px; table-layout: fixed; }
    .files-table .file-col-select { width: 44px; }
    .files-table .file-col-note { width: 180px; }
    .files-table .file-col-size { width: 80px; }
    .files-table .file-col-uploaded,
    .files-table .file-col-expiration { width: 110px; }
    .files-table .file-col-downloads { width: 100px; }
    .files-table .file-col-actions { width: 230px; }
    th, td {
      text-align: left;
      border-bottom: 1px solid rgba(145, 158, 185, 0.25);
      padding: 12px 10px;
      vertical-align: middle;
    }
    th { color: #43536f; font-weight: 700; font-size: 14px; }
    td.actions { white-space: nowrap; text-align: right; }
    .files-table .file-select-cell { text-align: center; }
    .file-select-checkbox {
      width: 16px;
      height: 16px;
      min-width: 16px;
      min-height: 16px;
      margin: 0;
      padding: 0;
      accent-color: var(--primary);
      cursor: pointer;
    }
    .actions .btn { margin-left: 8px; }
    .files-table td.actions .btn.small {
      min-width: 36px;
      min-height: 34px;
      margin-left: 4px;
      padding: 0 6px;
    }
    .files-table td.actions .btn.danger.small { min-width: 64px; }
    .files-table .note-cell {
      max-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-cell {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-width: 0;
    }
    .file-name {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: inline-block;
    }
    .file-icon {
      width: 24px;
      height: 24px;
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: #fff;
      letter-spacing: 0.2px;
      flex-shrink: 0;
      box-shadow: 0 4px 14px rgba(36, 58, 92, 0.18);
    }
    .file-icon.type-image { background: linear-gradient(145deg, #4b9eff, #2e7bd8); }
    .file-icon.type-pdf { background: linear-gradient(145deg, #ff6b6b, #d74444); }
    .file-icon.type-text { background: linear-gradient(145deg, #5cc8a3, #34a37f); }
    .file-icon.type-video { background: linear-gradient(145deg, #7b7dff, #5f63d9); }
    .file-icon.type-audio { background: linear-gradient(145deg, #9d79ff, #7656d8); }
    .file-icon.type-archive { background: linear-gradient(145deg, #f7b059, #d08a35); }
    .file-icon.type-code { background: linear-gradient(145deg, #6070f0, #4c5ace); }
    .file-icon.type-other { background: linear-gradient(145deg, #92a1b8, #71839f); }
    .file-preview {
      position: fixed;
      top: 0;
      left: 0;
      width: 300px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.78);
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 18px 36px rgba(20, 30, 53, 0.28);
      backdrop-filter: blur(14px);
      pointer-events: none;
      z-index: 80;
    }
    .file-preview-title {
      padding: 8px 10px;
      font-size: 12px;
      color: #516079;
      border-bottom: 1px solid rgba(141, 157, 185, 0.25);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: rgba(255, 255, 255, 0.72);
    }
    .file-preview img {
      width: 100%;
      height: 190px;
      display: block;
      object-fit: contain;
      background: rgba(255, 255, 255, 0.85);
    }
    .flash {
      margin: 0 52px;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid;
      font-size: 14px;
      position: sticky;
      top: 10px;
      z-index: 30;
      backdrop-filter: blur(10px);
    }
    .flash.ok { background: #e7f8f2; border-color: #82d9be; color: #236a53; }
    .flash.err { background: #fdeef2; border-color: #f3a9bc; color: #8d2a45; }
    .busy-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(17, 24, 39, 0.42);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 95;
      backdrop-filter: blur(2px);
    }
    .busy-card {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.8);
      border-radius: 14px;
      padding: 12px 18px;
      color: #334766;
      font-weight: 700;
      box-shadow: 0 10px 34px rgba(28, 45, 78, 0.25);
    }
    .busy-spinner {
      width: 20px;
      height: 20px;
      border-radius: 999px;
      border: 3px solid rgba(50, 142, 207, 0.25);
      border-top-color: #328ecf;
      animation: busy-spin 0.85s linear infinite;
    }
    @keyframes busy-spin {
      to { transform: rotate(360deg); }
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(19, 21, 26, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 40;
      padding: 16px;
    }
    .modal {
      width: min(560px, 100%);
      background: rgba(255, 255, 255, 0.85);
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.75);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.16);
      padding: 18px;
      backdrop-filter: blur(12px);
    }
    .modal h2 {
      margin: 0 0 8px;
      font-size: 32px;
    }
    .modal p {
      margin: 0 0 16px;
      font-size: 16px;
      color: #525f70;
    }
    .modal .row { justify-content: flex-end; }
    .bar {
      width: min(860px, 100%);
      border-radius: 999px;
      overflow: hidden;
      height: 16px;
      background: #ddd;
    }
    .bar > span { display: block; height: 100%; background: linear-gradient(90deg, #37c1a1, #4ac7c5); }
    #login {
      max-width: 420px;
      margin: 17vh auto 0;
      background: linear-gradient(175deg, rgba(244, 220, 249, 0.55), rgba(213, 226, 255, 0.5));
      border: 1px solid rgba(255, 255, 255, 0.7);
      border-radius: 18px;
      padding: 26px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(22px) saturate(130%);
    }
    #auth-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 13px;
      max-width: 420px;
      min-height: 76px;
      margin: 28vh auto 0;
      padding: 18px 22px;
      border: 1px solid rgba(255, 255, 255, 0.78);
      border-radius: 16px;
      color: #53627b;
      background: rgba(255, 255, 255, 0.72);
      box-shadow: 0 14px 40px rgba(66, 82, 130, 0.12);
      backdrop-filter: blur(16px);
    }
    .auth-loading-spinner {
      flex: 0 0 22px;
      width: 22px;
      height: 22px;
      border: 3px solid rgba(81, 107, 215, 0.2);
      border-top-color: #526bd7;
      border-radius: 50%;
      animation: auth-spin 0.8s linear infinite;
    }
    #auth-loading-message { margin: 0; }
    #auth-retry { margin-left: auto; }
    @keyframes auth-spin { to { transform: rotate(360deg); } }
    #login h1 { font-size: 46px; margin: 0 0 8px; text-align: center; }
    #login .auth-sub { margin: 0 0 18px; text-align: center; color: #75829a; font-size: 14px; }
    #login .btn { justify-content: center; border-radius: 12px; min-width: 180px; }
    .hidden { display: none !important; }
    @media (max-width: 980px) {
      body { padding: 10px; }
      .shell { min-height: calc(100vh - 20px); }
      .topbar, main { padding-left: 18px; padding-right: 18px; }
      .flash { margin-left: 18px; margin-right: 18px; }
      .brand { font-size: 28px; }
      .nav button, .sys-toggle { font-size: 15px; padding: 7px 10px; }
      h1 { font-size: 40px; }
      h2 { font-size: 34px; }
      h3 { font-size: 24px; }
      label, input, select, textarea, .btn, table { font-size: 14px; }
      .row { gap: 8px; }
      .drop { width: 100%; }
      .actions .btn { margin-left: 0; }
      .files-table td.actions .btn.small { margin-left: 0; }
      .drop-primary { font-size: 16px; }
      td.actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      table.files-table { min-width: 820px; }
      .files-table .file-col-note { width: 140px; }
      .files-table .file-col-size { width: 60px; }
      .files-table .file-col-uploaded,
      .files-table .file-col-expiration { width: 90px; }
      .files-table .file-col-downloads { width: 80px; }
      .files-table .file-col-actions { width: 200px; }
      .files-toolbar { align-items: stretch; }
      .files-search { flex-basis: 100%; max-width: none; }
      .files-count { width: 100%; }
      .files-pagination { justify-content: space-between; gap: 8px; }
      .files-pagination .btn.small { min-width: 76px; }
    }

    /* Shared Notion-inspired visual language used by the public home page. */
    :root {
      --bg: #f6f5f4;
      --bg-2: #f6f5f4;
      --glass: #ffffff;
      --glass-strong: #ffffff;
      --text: #111111;
      --muted: #615d59;
      --line: rgba(0,0,0,.08);
      --shadow: 0 4px 12px rgba(0,0,0,.1);
      --primary: #0075de;
      --accent: #0075de;
      --danger: #f64932;
      --blue: #0075de;
    }
    body { padding: 0; color: #111; background: #f6f5f4; font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .shell { width: 100%; max-width: 1328px; min-height: 100vh; }
    .topbar { padding: 16px 24px; }
    main { padding: 12px 24px 40px; }
    .flash { margin-left: 24px; margin-right: 24px; }
    .brand { display: flex; align-items: center; gap: 9px; color: #111; font-size: 18px; font-weight: 650; letter-spacing: -.04em; }
    .brand-icon { display: block; width: 28px; height: 28px; object-fit: contain; }
    .nav button:not(.btn):not(.nav-upload), .sys-toggle { color: #615d59; border-radius: 8px; }
    .nav button:not(.btn):not(.nav-upload)[aria-current="page"], .sys-toggle.active { color: #0075de; background: #e6f3fe; }
    .nav button:not(.btn):not(.nav-upload):hover, .sys-toggle:hover { color: #0075de; background: #e6f3fe; transform: none; }
    .nav button.nav-upload { color: #fff; background: #0075de; border-color: #0075de; border-radius: 8px; }
    .nav button.nav-upload:hover { background: #0068c7; transform: none; }
    .nav button.nav-upload[aria-current="page"] { color: #fff; background: #0075de; }
    .nav button.nav-upload > svg { color: #fff; }
    .system-menu { background: #fff; border-color: rgba(0,0,0,.08); border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.1); backdrop-filter: none; }
    .system-menu button { color: #111; }
    .system-menu button:hover { background: #e6f3fe; }
    main { padding-top: 12px; }
    h1, h2, h3 { color: #111; letter-spacing: -.035em; font-weight: 600; }
    h1 { font-size: clamp(40px,4vw,48px); line-height: 1.08; }
    h2 { font-size: clamp(28px,3vw,36px); line-height: 1.15; }
    h3 { font-size: clamp(20px,2.2vw,24px); line-height: 1.25; }
    .muted, .small { color: #615d59; }
    .stack-wide, .upload-grid { max-width: 1280px; }
    label { color: #615d59; }
    input, select, textarea { color: #111; border-color: rgba(0,0,0,.16); border-radius: 8px; background: #fff; backdrop-filter: none; }
    input:focus, select:focus, textarea:focus { border-color: #0075de; box-shadow: 0 0 0 3px rgba(0,117,222,.12); }
    .btn { --btn-color: #0075de; color: #0075de; border-radius: 8px; transition: color .2s ease, background-color .2s ease, border-color .2s ease; }
    .btn:hover { color: #fff; border-color: #0075de; }
    .btn::before { background: #0075de; transition: transform .2s ease; }
    .btn.blue { --btn-color: #0075de; }
    .btn.danger { --btn-color: #f64932; }
    .btn.small { border-radius: 8px; }
    .drop { border-color: rgba(0,0,0,.2); border-radius: 12px; background: #fff; }
    .drop:hover, .drop.dragover { border-color: #0075de; background: #e6f3fe; box-shadow: none; }
    .drop-primary { color: #111; }
    .drop-secondary { color: #615d59; }
    .drop-file { color: #0075de; }
    .note-box { color: #111; border-left-color: #0075de; border-radius: 8px; background: #e6f3fe; }
    .panel { border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; backdrop-filter: none; }
    .file-info-page { width: 100%; max-width: 1280px; min-width: 0; }
    .file-info-page .file-links, .file-info-page .versions-panel { width: 100%; max-width: none; min-width: 0; }
    .file-info-page .file-links .row { align-items: stretch; }
    .file-info-page .file-links .row a { flex: 1 1 320px; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    .file-meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; max-width: none; min-width: 0; }
    .file-meta-item { min-width: 0; padding: 14px 16px; border: 1px solid rgba(0,0,0,.08); border-radius: 8px; background: #fff; }
    .file-meta-item > strong { display: block; margin-bottom: 6px; color: #615d59; font-size: 13px; }
    .file-meta-value { display: block; min-width: 0; color: #111; line-height: 1.5; overflow-wrap: anywhere; word-break: break-word; }
    .file-meta-downloads .file-meta-value { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    table.version-history-table { width: 100%; min-width: 0; table-layout: fixed; }
    .version-history-table th, .version-history-table td { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    .version-history-table th:nth-child(1), .version-history-table td:nth-child(1) { width: 10%; }
    .version-history-table th:nth-child(2), .version-history-table td:nth-child(2) { width: 14%; }
    .version-history-table th:nth-child(3), .version-history-table td:nth-child(3) { width: 28%; }
    .version-history-table th:nth-child(4), .version-history-table td:nth-child(4) { width: 32%; }
    .version-history-table th:nth-child(5), .version-history-table td:nth-child(5) { width: 16%; }
    .version-history-table .version-md5 { font-size: 12px; word-break: break-all; }
    .version-history-table .version-time { font-size: 13px; }
    .version-history-table td.version-actions { text-align: right; white-space: nowrap; }
    .check-row label, .toggle-row label, .days-row span { color: #615d59; }
    table, .table-wrap { background: #fff; }
    .table-wrap { border-color: rgba(0,0,0,.08); border-radius: 12px; backdrop-filter: none; }
    .files-search input { background: #fff; }
    .files-count, .files-page-info { color: #615d59; }
    th, td { border-bottom-color: rgba(0,0,0,.08); }
    th { color: #615d59; }
    .file-icon { box-shadow: none; }
    .file-icon.type-image { background: #097fe8; }
    .file-icon.type-pdf { background: #f64932; }
    .file-icon.type-text { background: #ffb110; }
    .file-icon.type-video { background: #02093a; }
    .file-icon.type-audio { background: #62aef0; }
    .file-icon.type-archive { background: #b18164; }
    .file-icon.type-code { background: #0075de; }
    .file-icon.type-other { background: #757575; }
    .file-preview { border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.1); backdrop-filter: none; }
    .file-preview-title { color: #615d59; border-bottom-color: rgba(0,0,0,.08); background: #fff; }
    .file-preview img { background: #f6f5f4; }
    .flash { border-radius: 8px; background: #fff; backdrop-filter: none; }
    .flash.ok { background: #e6f3fe; border-color: rgba(0,117,222,.22); color: #111; }
    .flash.err { background: #fff0ed; border-color: rgba(246,73,50,.3); color: #9e2416; }
    .busy-card { color: #111; border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.1); }
    .busy-spinner { border-color: rgba(0,117,222,.18); border-top-color: #0075de; }
    .modal { border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.1); backdrop-filter: none; }
    .modal p { color: #615d59; }
    .bar { background: #e6f3fe; }
    .bar > span { background: #0075de; }
    #login { border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; box-shadow: none; backdrop-filter: none; }
    #login .auth-sub { color: #615d59; }
    #auth-loading { color: #615d59; border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; box-shadow: none; backdrop-filter: none; }
    .auth-loading-spinner { border-color: rgba(0,117,222,.18); border-top-color: #0075de; }
    #login .btn { border-radius: 8px; }
    #login .google-login-button {
      align-self: center;
      min-width: 114px;
      min-height: 42px;
      padding: 0 16px;
      gap: 8px;
      border: 1px solid #e2e2e2;
      border-radius: 10px;
      background: #f7f7f7;
      color: #1f1f1f;
      font-size: 14px;
      font-weight: 500;
      line-height: 20px;
      box-shadow: none;
    }
    #login .google-login-button::before { display: none; }
    #login .google-login-button:hover {
      transform: none;
      border-color: #d5d5d5;
      background: #f1f1f1;
      color: #1f1f1f;
    }
    .google-login-icon { display: block; width: 18px; height: 18px; flex: none; }
    @media (max-width: 980px) {
      body { padding: 0; }
      .topbar, main { padding-left: 16px; padding-right: 16px; }
      .flash { margin-left: 16px; margin-right: 16px; }
      .topbar { padding-top: 12px; padding-bottom: 12px; }
      .file-meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 640px) {
      .topbar { align-items: stretch; flex-direction: column; gap: 8px; }
      .topbar > .row:first-child { width: 100%; align-items: stretch; flex-direction: column; gap: 8px !important; }
      .topbar .nav { width: 100%; min-width: 0; flex-wrap: nowrap; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
      .topbar .nav button { flex: 0 0 auto; white-space: nowrap; }
      .topbar .nav button.nav-upload { min-width: 0; padding: 0 10px; }
      .topbar .nav button.nav-upload > svg { width: 20px; height: 20px; margin-left: 2px; }
      .topbar .top-right { align-self: flex-end; }
      .file-info-page .file-links .row { align-items: stretch; flex-direction: column; }
      .file-info-page .file-links .row a { flex-basis: auto; }
      .file-meta-grid { grid-template-columns: minmax(0, 1fr); }
      .file-info-page > .submit-row { align-items: stretch; flex-direction: column; }
      .file-info-page > .submit-row .btn { width: 100%; }
      .version-history-table { display: block; }
      .version-history-table thead { display: none; }
      .version-history-table tbody { display: grid; gap: 10px; padding: 10px; }
      .version-history-table tbody tr { display: grid; grid-template-columns: minmax(0, 1fr); border: 1px solid rgba(0,0,0,.08); border-radius: 8px; }
      .version-history-table tbody td { display: flex; min-width: 0; flex-direction: column; gap: 4px; border: 0; padding: 10px; }
      .version-history-table tbody td:nth-child(n) { width: auto; }
      .version-history-table tbody td::before { content: attr(data-label); color: #615d59; font-size: 12px; font-weight: 600; }
      .version-history-table tbody td.version-actions { grid-column: 1 / -1; align-items: flex-start; text-align: left; }
      body { font-size: 16px; line-height: 1.55; }
      h1, #login h1 { font-size: clamp(30px, 8vw, 38px); line-height: 1.12; }
      h2 { font-size: clamp(23px, 6vw, 28px); line-height: 1.2; }
      h3 { font-size: 19px; line-height: 1.3; }
      label, input, select, textarea, .btn, table, .file-meta-value { font-size: 15px; }
      .small, .file-meta-item > strong, .admin-row-meta, .version-history-table .version-time { font-size: 14px; }
      .file-preview-title, .flash, .modal p, #auth-loading-message, #login .auth-sub { font-size: 15px; }
      .file-info-page .submit-row .btn { min-height: 44px; }
      .version-history-table .version-md5 { font-size: 13px; }
    }
    @media (max-width: 360px) {
      h1 { font-size: 29px; }
      h2 { font-size: 22px; }
      .topbar, main { padding-left: 12px; padding-right: 12px; }
    }
  </style>
</head>
<body>
  <section id="auth-loading" class="${saasMode ? "" : "hidden"}" role="status" aria-live="polite" aria-busy="true">
    <span class="auth-loading-spinner" aria-hidden="true"></span>
    <p id="auth-loading-message">Restoring your session…</p>
    <button id="auth-retry" class="btn blue small hidden" type="button">Try again</button>
  </section>
  <section id="login" class="${saasMode ? "hidden" : ""}" aria-labelledby="login-title">
    <h1 id="login-title">Welcome Back</h1>
    <p id="login-subtitle" class="auth-sub">Sign in to your account to continue</p>
    <div class="stack">
      <div>
        <label id="pw-label" for="pw">Passphrase</label>
        <input id="pw" type="password" autocomplete="current-password" placeholder="Enter your passphrase" />
      </div>
      <button class="btn form-submit" id="login-btn" type="button">Sign In</button>
      <button class="btn google-login-button" id="google-login-btn" type="button" aria-label="Continue with Google" style="display:none"><svg class="google-login-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.75 7.18l7.73 6C44.42 37.85 46.98 31.7 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.9 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg><span>Google</span></button>
      <form id="saas-email-auth-form" class="stack" style="display:none">
        <div id="saas-name-field" style="display:none">
          <label id="saas-name-label" for="saas-name">Name</label>
          <input id="saas-name" type="text" maxlength="80" autocomplete="name" />
        </div>
        <div>
          <label id="saas-email-label" for="saas-email">Email</label>
          <input id="saas-email" type="email" maxlength="254" autocomplete="email" required />
        </div>
        <div>
          <label id="saas-password-label" for="saas-password">Password</label>
          <input id="saas-password" type="password" minlength="8" maxlength="128" autocomplete="current-password" required />
        </div>
        <button class="btn form-submit" id="saas-email-submit" type="submit">Sign in with email</button>
        <button class="btn form-submit" id="saas-email-mode-toggle" type="button">Create an account</button>
        <p id="saas-email-help" class="small"></p>
      </form>
      <p id="login-help" class="small">Authentication uses the shared secret configured on the worker.</p>
      <p id="saas-email-error" class="small" role="status" aria-live="polite" style="color:var(--danger)"></p>
    </div>
  </section>

  <div id="app" class="shell hidden">
    <header class="topbar">
      <div class="row" style="gap: 26px;">
        <div class="brand"><img class="brand-icon" src="/favicon.svg" alt="" />PicoShare</div>
        <nav class="nav" aria-label="Primary">
          <button type="button" class="nav-upload" data-view="upload" aria-current="page">
            <span id="nav-upload-text">Upload</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 74 74"
              height="34"
              width="34"
              aria-hidden="true"
            >
              <circle stroke-width="3" stroke="black" r="35.5" cy="37" cx="37"></circle>
              <path
                fill="black"
                d="M25 35.5C24.1716 35.5 23.5 36.1716 23.5 37C23.5 37.8284 24.1716 38.5 25 38.5V35.5ZM49.0607 38.0607C49.6464 37.4749 49.6464 36.5251 49.0607 35.9393L39.5147 26.3934C38.9289 25.8076 37.9792 25.8076 37.3934 26.3934C36.8076 26.9792 36.8076 27.9289 37.3934 28.5147L45.8787 37L37.3934 45.4853C36.8076 46.0711 36.8076 47.0208 37.3934 47.6066C37.9792 48.1924 38.9289 48.1924 39.5147 47.6066L49.0607 38.0607ZM25 38.5L48 38.5V35.5L25 35.5V38.5Z"
              ></path>
            </svg>
          </button>
          <button id="nav-files-btn" type="button" class="btn blue small" data-view="files">Files</button>
          <button id="nav-clips-btn" type="button" class="btn blue small">Clips</button>
          <button id="nav-guest-btn" type="button" class="btn blue small" data-view="guestLinks">Guest Links</button>
        </nav>
      </div>
      <div class="top-right">
        <div class="row" style="gap:8px;">
          <button id="lang-toggle" type="button" class="btn blue small">中文</button>
          <button id="system-toggle" class="sys-toggle" type="button" aria-haspopup="menu" aria-expanded="false">
            System ▾
          </button>
        </div>
        <div id="system-menu" class="system-menu" role="menu" aria-label="System pages">
          <button type="button" id="menu-account" role="menuitem" style="display:none">账户与订阅</button>
          <button id="menu-system-info" type="button" data-view="systemInfo" role="menuitem">System Information</button>
          <button id="menu-settings" type="button" data-view="settings" role="menuitem">Settings</button>
          <button type="button" id="logout-btn" role="menuitem">Logout</button>
        </div>
      </div>
    </header>

    <div id="flash" class="flash hidden" role="status" aria-live="polite"></div>
    <div id="confirm-backdrop" class="modal-backdrop hidden" role="presentation">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">Confirm action</h2>
        <p id="confirm-text">Are you sure?</p>
        <div class="row">
          <button id="confirm-cancel" type="button" class="btn secondary">Cancel</button>
          <button id="confirm-ok" type="button" class="btn danger">Delete</button>
        </div>
      </section>
    </div>
    <div id="file-preview" class="file-preview hidden" aria-hidden="true">
      <div id="file-preview-title" class="file-preview-title"></div>
      <img id="file-preview-image" alt="Image preview" />
    </div>
    <div id="busy-backdrop" class="busy-backdrop hidden" aria-live="polite" aria-busy="true">
      <div class="busy-card">
        <span class="busy-spinner" aria-hidden="true"></span>
        <span id="busy-text">Uploading, please wait...</span>
      </div>
    </div>
    <main id="main" tabindex="-1"></main>
  </div>

  <script>
    (function() {
      var PS_SAAS_MODE = ${saasMode ? "true" : "false"};
      var PS_GOOGLE_LOGIN_ENABLED = ${googleLoginEnabled ? "true" : "false"};
      var state = {
        pw: localStorage.getItem('ps_pw') || '',
        view: 'upload',
        selectedId: null,
        files: [],
        guestLinks: [],
          settings: { storeForever: true, defaultDays: PS_SAAS_MODE ? 365 : 30 },
        planLimits: null,
        downloadsUniqueOnly: false,
        fileSearch: '',
        filePage: 1,
        lang: localStorage.getItem('ps_lang') === 'zh' ? 'zh' : 'en',
      };
      var multipartUploadThresholdBytes = ${MULTIPART_UPLOAD_THRESHOLD_BYTES};

      var I18N = {
        en: {
          login_title: 'Welcome Back',
          login_subtitle: 'Sign in to your account to continue',
          auth_loading: 'Restoring your session…',
          auth_loading_error: 'Could not restore your session. Check your connection and try again.',
          retry: 'Try again',
          passphrase: 'Passphrase',
          passphrase_placeholder: 'Enter your passphrase',
          sign_in: 'Sign In',
          login_help: 'Authentication uses the shared secret configured on the worker.',
          email: 'Email',
          name: 'Name',
          password: 'Password',
          email_placeholder: 'name@example.com',
          email_sign_in: 'Sign in with email',
          email_sign_up: 'Create account',
          google_login_aria: 'Continue with Google',
          email_switch_to_sign_up: 'Create an account',
          email_switch_to_sign_in: 'Already registered? Sign in',
          saas_login_help: 'Sign in with your email and password or Google account.',
          saas_email_help: 'Password must be at least 8 characters. Email verification and password reset are not configured.',
          saas_signin_required: 'Please sign in with email or Google first.',
          email_auth_failed: 'Email authentication failed.',
          nav_upload: 'Upload',
          nav_files: 'Files',
          nav_clips: 'Clips',
          nav_guest_links: 'Guest Links',
          system: 'System',
          system_info: 'System Information',
          settings: 'Settings',
          logout: 'Logout',
          lang_switch: '中文',
          confirm_action: 'Confirm action',
          are_you_sure: 'Are you sure?',
          cancel: 'Cancel',
          delete: 'Delete',
          please_enter_passphrase: 'Please enter the passphrase.',
          auth_failed: 'Authentication failed. Check shared secret.',
          logged_out: 'Logged out.',
          upload: 'Upload',
          drop_choose: 'Drop files here or click to choose',
          choose_files: 'Choose files',
          supports_drag: 'Choose or drop multiple files at once',
          no_file_selected: 'No file selected',
          selected_files_count: '{count} files selected',
          batch_upload_progress: 'Uploading file {current} of {total}...',
          batch_upload_success: 'Uploaded {count} files.',
          batch_upload_partial: 'Uploaded {uploaded} of {total} files. Failed files remain selected; submit again to retry.',
          or_paste_here: 'Or paste something here',
          paste_placeholder: 'Paste text content to upload as .txt',
          expiration: 'Expiration',
          day_1: '1 day',
          day_7: '7 days',
          day_30: '30 days',
          day_90: '90 days',
          day_365: '365 days',
          never: 'Never',
          retention_plan_help: 'Pro defaults to 365 days. Enable permanent storage to use no expiration for new uploads.',
          note_optional: 'Note (optional)',
          note_placeholder: 'For Joe at ExampleCo',
          note_only_you: 'Note is only visible to you',
          upload_success: 'Upload succeeded.',
          select_or_paste_first: 'Select a file or paste text first.',
          files: 'Files',
          files_search: 'Search files',
          files_search_placeholder: 'Search by filename or note',
          files_count: '{count} files',
          select_all_files_page: 'Select all files on this page',
          select_file: 'Select {name}',
          files_selected_count: '{count} selected',
          delete_selected_files: 'Delete selected',
          delete_selected_files_confirm: 'Delete {count} selected files? This cannot be undone.',
          files_deleted_count: 'Deleted {count} files.',
          files_delete_partial: 'Deleted {deleted} files; {failed} failed.',
          copy_selected_file_links: 'Copy selected links',
          selected_file_links_copied: 'Copied {count} file links.',
          files_page_info: 'Page {page} of {pages}',
          previous_page: 'Previous',
          next_page: 'Next',
          no_files_in_list: 'No files uploaded yet.',
          no_matching_files: 'No files match your search.',
          filename: 'Filename',
          note: 'Note',
          size: 'Size',
          uploaded: 'Uploaded',
          expires: 'Expires',
          downloads: 'Downloads',
          actions: 'Actions',
          view_file_info: 'View file information',
          edit_file: 'Edit file',
          copy_short_link: 'Copy short link',
          delete_file: 'Delete file',
          delete_file_confirm: 'Delete this file?',
          file_deleted: 'File deleted.',
          link_copied: 'Link copied.',
          clipboard_denied: 'Clipboard permission denied.',
          file_information: 'File Information',
          links: 'Links',
          full_link: 'Full Link',
          short_link: 'Shortlink',
          copy: 'Copy',
          back_to_files: 'Back to files',
          full_link_copied: 'Full link copied.',
          short_link_copied: 'Short link copied.',
          edit_file_title: 'Edit File',
          update_file: 'Update file',
          update_file_title: 'Update File Content',
          update_same_name_hint: 'Choose a replacement file with the same filename. The existing link will stay unchanged.',
          choose_update_file: 'Choose replacement file',
          select_one_update_file: 'Choose one replacement file at a time.',
          same_name_required: 'The replacement file must keep the same filename.',
          delete_after_expiration: 'Delete after expiration',
          save: 'Save',
          file_updated: 'File updated.',
          current_version: 'Current version',
          file_md5: 'MD5',
          last_updated: 'Last updated',
          versions: 'File versions',
          version_number: 'Version',
          version_time: 'Updated at',
          download_version: 'Download',
          no_versions: 'No version history yet',
          guest_links: 'Guest Links',
          guest_desc_1: 'Guest links allow other users to upload files to this PicoShare server without signing in.',
          guest_desc_2: 'Share a guest link if you want an easy way for someone to share a file with you.',
          create_new_guest_link: 'Create new guest link',
          label: 'Label',
          url_expiration: 'URL expiration',
          file_exp_days: 'File expiration (days)',
          max_upload_size_mb: 'Max upload size (MB)',
          max_uploads: 'Max uploads',
          create_new: 'Create new',
          created: 'Created',
          max_upload_size: 'Max Upload Size',
          copy_guest_link: 'Copy guest link',
          delete_guest_link: 'Delete guest link',
          guest_link_created: 'Guest link created.',
          guest_link_deleted: 'Guest link deleted.',
          guest_link_copied: 'Guest link copied.',
          delete_guest_confirm: 'Delete this guest link?',
          default_value: 'Default',
          unlimited: 'Unlimited',
          days_unit: 'days',
          system_information: 'System Information',
          picoshare_usage: 'PicoShare Usage',
          upload_data: 'Upload data',
          guest_links_count: 'Guest links',
          total_downloads: 'Total downloads',
          version: 'Version',
          built_at: 'Built at',
          default_file_expiration: 'Default File Expiration',
          store_files_forever: 'Store files forever',
          days: 'Days',
          settings_saved: 'Settings saved.',
          downloads_title: 'Downloads',
          unique_ips_only: 'Unique IPs only',
          download: 'Download',
          time: 'Time',
          downloader_ip: 'Downloader IP',
          browser: 'Browser',
          platform: 'Platform',
          close: 'Close',
          no_downloads_yet: 'No downloads yet',
          history: 'History',
          session_expired: 'Session expired. Please sign in again.',
          uploading_wait: 'Uploading, please wait...',
          selected_prefix: 'Selected',
          none: 'None',
          uploaded_by: 'Uploaded by',
          you: 'You',
          unknown_file: 'Unknown file',
          not_available: 'N/A',
        },
        zh: {
          login_title: '欢迎回来',
          login_subtitle: '登录后继续使用',
          auth_loading: '正在恢复登录状态…',
          auth_loading_error: '暂时无法确认登录状态，请检查网络后重试。',
          retry: '重试',
          passphrase: '访问口令',
          passphrase_placeholder: '请输入访问口令',
          sign_in: '登录',
          login_help: '认证使用 Worker 配置的共享密钥。',
          email: '邮箱',
          name: '姓名',
          password: '密码',
          email_placeholder: 'name@example.com',
          email_sign_in: '邮箱登录',
          email_sign_up: '创建账号',
          google_login_aria: '使用 Google 登录',
          email_switch_to_sign_up: '注册新账号',
          email_switch_to_sign_in: '已有账号？去登录',
          saas_login_help: '使用邮箱密码或 Google 账号登录。',
          saas_email_help: '密码至少 8 位。邮箱验证和密码找回邮件暂未配置。',
          saas_signin_required: '请先使用邮箱或 Google 登录。',
          email_auth_failed: '邮箱登录失败。',
          nav_upload: '上传',
          nav_files: '文件',
          nav_clips: '云便签',
          nav_guest_links: '访客链接',
          system: '系统',
          system_info: '系统信息',
          settings: '设置',
          logout: '退出登录',
          lang_switch: 'EN',
          confirm_action: '确认操作',
          are_you_sure: '确定继续吗？',
          cancel: '取消',
          delete: '删除',
          please_enter_passphrase: '请输入访问口令。',
          auth_failed: '认证失败，请检查共享密钥。',
          logged_out: '已退出登录。',
          upload: '上传',
          drop_choose: '拖拽文件到这里，或点击选择',
          choose_files: '选择文件',
          supports_drag: '支持一次拖拽或选择多个文件',
          no_file_selected: '未选择文件',
          selected_files_count: '已选择 {count} 个文件',
          batch_upload_progress: '正在上传第 {current} / {total} 个文件…',
          batch_upload_success: '成功上传 {count} 个文件。',
          batch_upload_partial: '已上传 {uploaded} / {total} 个文件。失败的文件仍保留在选择列表中，可再次提交重试。',
          or_paste_here: '或者在这里粘贴内容',
          paste_placeholder: '粘贴文本后将保存为 .txt 文件',
          expiration: '过期时间',
          day_1: '1 天',
          day_7: '7 天',
          day_30: '30 天',
          day_90: '90 天',
          day_365: '365 天',
          never: '永不过期',
          retention_plan_help: 'Pro 默认保存 365 天；开启永久保存后，新上传文件不设过期时间。',
          note_optional: '备注（可选）',
          note_placeholder: '例如：给某同事',
          note_only_you: '备注仅自己可见',
          upload_success: '上传成功。',
          select_or_paste_first: '请先选择文件或粘贴内容。',
          files: '文件',
          files_search: '搜索文件',
          files_search_placeholder: '按文件名或备注搜索',
          files_count: '共 {count} 个文件',
          select_all_files_page: '全选本页文件',
          select_file: '选择文件 {name}',
          files_selected_count: '已选择 {count} 个',
          delete_selected_files: '批量删除',
          delete_selected_files_confirm: '确认删除选中的 {count} 个文件吗？删除后无法恢复。',
          files_deleted_count: '已删除 {count} 个文件。',
          files_delete_partial: '已删除 {deleted} 个文件，{failed} 个失败。',
          copy_selected_file_links: '复制选中文件链接',
          selected_file_links_copied: '已复制 {count} 个文件链接。',
          files_page_info: '第 {page} / {pages} 页',
          previous_page: '上一页',
          next_page: '下一页',
          no_files_in_list: '还没有上传文件。',
          no_matching_files: '没有找到匹配的文件。',
          filename: '文件名',
          note: '备注',
          size: '大小',
          uploaded: '上传时间',
          expires: '过期时间',
          downloads: '下载次数',
          actions: '操作',
          view_file_info: '查看文件信息',
          edit_file: '编辑文件',
          copy_short_link: '复制短链接',
          delete_file: '删除文件',
          delete_file_confirm: '确认删除这个文件吗？',
          file_deleted: '文件已删除。',
          link_copied: '链接已复制。',
          clipboard_denied: '无法访问剪贴板权限。',
          file_information: '文件信息',
          links: '链接',
          full_link: '完整链接',
          short_link: '短链接',
          copy: '复制',
          back_to_files: '返回文件列表',
          full_link_copied: '完整链接已复制。',
          short_link_copied: '短链接已复制。',
          edit_file_title: '编辑文件',
          update_file: '更新文件',
          update_file_title: '更新文件内容',
          update_same_name_hint: '请选择同名替换文件，原有链接地址保持不变。',
          choose_update_file: '选择替换文件',
          select_one_update_file: '每次请只选择或拖入一个替换文件。',
          same_name_required: '替换文件必须保持相同文件名。',
          delete_after_expiration: '到期后自动删除',
          save: '保存',
          file_updated: '文件已更新。',
          current_version: '当前版本',
          file_md5: 'MD5',
          last_updated: '最后更新',
          versions: '文件版本',
          version_number: '版本',
          version_time: '更新时间',
          download_version: '下载',
          no_versions: '暂无版本记录',
          guest_links: '访客链接',
          guest_desc_1: '访客链接允许他人在不登录的情况下上传文件到当前 PicoShare 服务。',
          guest_desc_2: '你可以分享访客链接，让他人更方便地向你发送文件。',
          create_new_guest_link: '创建新访客链接',
          label: '标签',
          url_expiration: '链接过期时间',
          file_exp_days: '文件保留天数',
          max_upload_size_mb: '最大上传大小 (MB)',
          max_uploads: '最多上传次数',
          create_new: '创建',
          created: '创建时间',
          max_upload_size: '最大上传大小',
          copy_guest_link: '复制访客链接',
          delete_guest_link: '删除访客链接',
          guest_link_created: '访客链接已创建。',
          guest_link_deleted: '访客链接已删除。',
          guest_link_copied: '访客链接已复制。',
          delete_guest_confirm: '确认删除这个访客链接吗？',
          default_value: '默认',
          unlimited: '不限',
          days_unit: '天',
          system_information: '系统信息',
          picoshare_usage: 'PicoShare 使用情况',
          upload_data: '上传数据',
          guest_links_count: '访客链接数量',
          total_downloads: '总下载次数',
          version: '版本',
          built_at: '构建时间',
          default_file_expiration: '默认文件过期策略',
          store_files_forever: '永久保存文件',
          days: '天',
          settings_saved: '设置已保存。',
          downloads_title: '下载记录',
          unique_ips_only: '仅显示唯一 IP',
          download: '序号',
          time: '时间',
          downloader_ip: '下载 IP',
          browser: '浏览器',
          platform: '平台',
          close: '关闭',
          no_downloads_yet: '暂无下载记录',
          history: '历史',
          session_expired: '会话已过期，请重新登录。',
          uploading_wait: '正在上传，请稍候...',
          selected_prefix: '已选择',
          none: '无',
          uploaded_by: '上传者',
          you: '你',
          unknown_file: '未知文件',
          not_available: '不可用',
        },
      };

      function t(key) {
        var langPack = I18N[state.lang] || I18N.en;
        return langPack[key] || I18N.en[key] || key;
      }

      var loginEl = document.getElementById('login');
      var authLoadingEl = document.getElementById('auth-loading');
      var authLoadingMessage = document.getElementById('auth-loading-message');
      var authRetryButton = document.getElementById('auth-retry');
      var appEl = document.getElementById('app');
      var mainEl = document.getElementById('main');
      var flashEl = document.getElementById('flash');
      var flashTimer = null;
      var pwEl = document.getElementById('pw');
      var loginBtn = document.getElementById('login-btn');
      var saasEmailMode = 'sign-in';
      var systemToggle = document.getElementById('system-toggle');
      var systemMenu = document.getElementById('system-menu');
      var confirmBackdrop = document.getElementById('confirm-backdrop');
      var confirmText = document.getElementById('confirm-text');
      var confirmOk = document.getElementById('confirm-ok');
      var confirmCancel = document.getElementById('confirm-cancel');
      var filePreview = document.getElementById('file-preview');
      var filePreviewTitle = document.getElementById('file-preview-title');
      var filePreviewImage = document.getElementById('file-preview-image');
      var busyBackdrop = document.getElementById('busy-backdrop');
      var busyText = document.getElementById('busy-text');
      var langToggle = document.getElementById('lang-toggle');

      function renderSaasEmailMode() {
        var registering = saasEmailMode === 'sign-up';
        document.getElementById('saas-name-field').style.display = registering ? 'block' : 'none';
        document.getElementById('saas-name').required = registering;
        document.getElementById('saas-password').setAttribute('autocomplete', registering ? 'new-password' : 'current-password');
        document.getElementById('saas-email-submit').textContent = t(registering ? 'email_sign_up' : 'email_sign_in');
        document.getElementById('saas-email-mode-toggle').textContent = t(registering ? 'email_switch_to_sign_in' : 'email_switch_to_sign_up');
      }

      function applyStaticTranslations() {
        document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
        document.getElementById('login-title').textContent = t('login_title');
        document.getElementById('login-subtitle').textContent = t('login_subtitle');
        authLoadingMessage.textContent = t('auth_loading');
        authRetryButton.textContent = t('retry');
        document.getElementById('pw-label').textContent = t('passphrase');
        pwEl.setAttribute('placeholder', t('passphrase_placeholder'));
        loginBtn.textContent = t('sign_in');
        document.getElementById('google-login-btn').setAttribute('aria-label', t('google_login_aria'));
        document.getElementById('login-help').textContent = t('login_help');
        document.getElementById('saas-name-label').textContent = t('name');
        document.getElementById('saas-email-label').textContent = t('email');
        document.getElementById('saas-email').setAttribute('placeholder', t('email_placeholder'));
        document.getElementById('saas-password-label').textContent = t('password');
        document.getElementById('saas-email-help').textContent = t('saas_email_help');
        renderSaasEmailMode();
        document.getElementById('nav-upload-text').textContent = t('nav_upload');
        document.getElementById('nav-files-btn').textContent = t('nav_files');
        document.getElementById('nav-clips-btn').textContent = t('nav_clips');
        document.getElementById('nav-guest-btn').textContent = t('nav_guest_links');
        systemToggle.textContent = t('system') + ' ▾';
        document.getElementById('menu-system-info').textContent = t('system_info');
        document.getElementById('menu-settings').textContent = t('settings');
        document.getElementById('logout-btn').textContent = t('logout');
        document.getElementById('confirm-title').textContent = t('confirm_action');
        document.getElementById('confirm-text').textContent = t('are_you_sure');
        confirmCancel.textContent = t('cancel');
        if (confirmOk.textContent === 'Delete' || confirmOk.textContent === '删除') {
          confirmOk.textContent = t('delete');
        }
        langToggle.textContent = t('lang_switch');
      }

      function switchLang() {
        state.lang = state.lang === 'en' ? 'zh' : 'en';
        localStorage.setItem('ps_lang', state.lang);
        applyStaticTranslations();
        render();
      }

      function setBusy(isBusy, text) {
        busyText.textContent = text || t('uploading_wait');
        if (isBusy) busyBackdrop.classList.remove('hidden');
        else busyBackdrop.classList.add('hidden');
      }

      function setFlash(text, isError) {
        if (flashTimer) {
          clearTimeout(flashTimer);
          flashTimer = null;
        }
        if (!text) {
          flashEl.className = 'flash hidden';
          flashEl.textContent = '';
          return;
        }
        flashEl.className = 'flash ' + (isError ? 'err' : 'ok');
        flashEl.textContent = text;
        flashTimer = setTimeout(function() {
          flashEl.className = 'flash hidden';
          flashEl.textContent = '';
        }, isError ? 6000 : 3500);
      }

      function confirmAction(message, dangerText) {
        return new Promise(function(resolve) {
          confirmText.textContent = message;
          confirmOk.textContent = dangerText || t('confirm_action');
          confirmBackdrop.classList.remove('hidden');
          confirmOk.focus();

          function cleanup(value) {
            confirmBackdrop.classList.add('hidden');
            confirmOk.removeEventListener('click', onOk);
            confirmCancel.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKeydown);
            resolve(value);
          }

          function onOk() { cleanup(true); }
          function onCancel() { cleanup(false); }
          function onKeydown(evt) {
            if (evt.key === 'Escape') cleanup(false);
          }

          confirmOk.addEventListener('click', onOk);
          confirmCancel.addEventListener('click', onCancel);
          document.addEventListener('keydown', onKeydown);
        });
      }

      function formatSize(bytes) {
        var n = Number(bytes || 0);
        if (!Number.isFinite(n) || n <= 0) return '0 B';
        var units = ['B', 'kB', 'MB', 'GB', 'TB'];
        var i = 0;
        while (n >= 1024 && i < units.length - 1) {
          n /= 1024;
          i += 1;
        }
        return n.toFixed(i === 0 ? 0 : 2) + ' ' + units[i];
      }

      function formatDate(iso) {
        if (!iso) return t('never');
        var d = new Date(iso);
        if (Number.isNaN(d.getTime())) return t('never');
        return d.toISOString().slice(0, 10);
      }

      function formatDateTime(iso) {
        if (!iso) return '-';
        var d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        var p = function(v) { return String(v).padStart(2, '0'); };
        var offset = -d.getTimezoneOffset();
        var sign = offset >= 0 ? '+' : '-';
        var oh = p(Math.floor(Math.abs(offset) / 60));
        var om = p(Math.abs(offset) % 60);
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
          ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
          ' ' + sign + oh + om;
      }

      function parseUa(uaRaw) {
        var ua = String(uaRaw || '').toLowerCase();
        var browser = 'Unknown';
        var platform = '';
        if (ua.includes('edg/')) browser = 'Edge';
        else if (ua.includes('chrome/') && !ua.includes('edg/')) browser = 'Chrome';
        else if (ua.includes('firefox/')) browser = 'Firefox';
        else if (ua.includes('safari/') && !ua.includes('chrome/')) browser = 'Safari';
        else if (ua.includes('wget/')) browser = 'Wget';
        else if (ua.includes('curl/')) browser = 'curl';

        if (ua.includes('android')) platform = 'Android';
        else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) platform = 'iOS';
        else if (ua.includes('windows')) platform = 'Windows';
        else if (ua.includes('mac os') || ua.includes('macintosh')) platform = 'macOS';
        else if (ua.includes('linux')) platform = 'Linux';

        return { browser: browser, platform: platform };
      }

      function fileExtension(filename) {
        var idx = filename.lastIndexOf('.');
        if (idx <= 0 || idx === filename.length - 1) return '';
        return filename.slice(idx + 1).toLowerCase();
      }

      function fileTypeInfo(file) {
        var ct = String(file.content_type || '').toLowerCase();
        var ext = fileExtension(String(file.filename || ''));

        if (ct.indexOf('image/') === 0 || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) {
          return { icon: 'IMG', typeClass: 'type-image', label: 'Image' };
        }
        if (ct === 'application/pdf' || ext === 'pdf') {
          return { icon: 'PDF', typeClass: 'type-pdf', label: 'PDF' };
        }
        if (ct.indexOf('text/') === 0 || ['txt', 'md', 'log', 'csv'].includes(ext)) {
          return { icon: 'TXT', typeClass: 'type-text', label: 'Text' };
        }
        if (ct.indexOf('video/') === 0 || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
          return { icon: 'VID', typeClass: 'type-video', label: 'Video' };
        }
        if (ct.indexOf('audio/') === 0 || ['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext)) {
          return { icon: 'AUD', typeClass: 'type-audio', label: 'Audio' };
        }
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
          return { icon: 'ZIP', typeClass: 'type-archive', label: 'Archive' };
        }
        if (['js', 'ts', 'tsx', 'jsx', 'json', 'yaml', 'yml', 'html', 'css', 'sh'].includes(ext)) {
          return { icon: 'CODE', typeClass: 'type-code', label: 'Code' };
        }
        return { icon: 'FILE', typeClass: 'type-other', label: 'File' };
      }

      function isImageFile(file) {
        return fileTypeInfo(file).typeClass === 'type-image';
      }

      function movePreview(evt) {
        var x = evt.clientX + 18;
        var y = evt.clientY + 18;
        var w = 300;
        var h = 230;
        if (x + w > window.innerWidth - 8) x = Math.max(8, evt.clientX - w - 18);
        if (y + h > window.innerHeight - 8) y = Math.max(8, evt.clientY - h - 18);
        filePreview.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      }

      function hidePreview() {
        filePreview.classList.add('hidden');
        filePreviewImage.removeAttribute('src');
      }

      function showPreview(file, evt) {
        if (!isImageFile(file)) return;
        filePreviewTitle.textContent = file.filename;
        filePreviewImage.src = '/_preview/' + encodeURIComponent(file.id);
        filePreview.classList.remove('hidden');
        movePreview(evt);
      }

      function authHeaders(extra) {
        var h = Object.assign({}, extra || {});
        if (!PS_SAAS_MODE) h.Authorization = state.pw;
        return h;
      }

      async function api(path, options) {
        var res = await fetch(path, Object.assign({}, options || {}, {
          headers: authHeaders((options && options.headers) || {}),
        }));
        if (res.status === 401) {
          logout();
          throw new Error('Unauthorized');
        }
        if (!res.ok) {
          var txt = await res.text();
          throw new Error(txt || ('Request failed: ' + res.status));
        }
        var ct = res.headers.get('content-type') || '';
        if (ct.indexOf('application/json') >= 0) return res.json();
        return res.text();
      }

      async function multipartUploadFile(file, noteValue, expirationDays, updateEntryId, updateVersion) {
        var initPayload = {
          filename: file.name || 'upload.bin',
          contentType: file.type || 'application/octet-stream',
          size: Number(file.size || 0),
          note: noteValue || '',
          expirationDays: expirationDays,
        };
        if (updateEntryId) {
          initPayload.entryId = updateEntryId;
          initPayload.version = Number(updateVersion || 1);
        }
        var init = await api('/api/entry/multipart/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(initPayload),
        });
        var uploadId = init && init.uploadId ? String(init.uploadId) : '';
        var chunkSize = Number(init && init.chunkSize ? init.chunkSize : 0) || (8 * 1024 * 1024);
        if (!uploadId) throw new Error('multipart init failed');

        var total = Number(file.size || 0);
        var partCount = Math.max(1, Math.ceil(total / chunkSize));
        try {
          for (var i = 0; i < partCount; i += 1) {
            var start = i * chunkSize;
            var end = Math.min(total, start + chunkSize);
            var chunk = file.slice(start, end);
            var partNumber = i + 1;
            setBusy(true, t('uploading_wait') + ' ' + partNumber + '/' + partCount);
            var res = await fetch('/api/entry/multipart/part/' + encodeURIComponent(uploadId) + '/' + String(partNumber), {
              method: 'PUT',
              headers: authHeaders({ 'Content-Type': 'application/octet-stream' }),
              body: chunk,
            });
            if (res.status === 401) {
              logout();
              throw new Error('Unauthorized');
            }
            if (!res.ok) {
              var errText = await res.text();
              throw new Error(errText || ('Chunk upload failed: ' + res.status));
            }
          }
          return await api('/api/entry/multipart/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId: uploadId }),
          });
        } catch (err) {
          try {
            await api('/api/entry/multipart/abort', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uploadId: uploadId }),
            });
          } catch (_) {
            // Ignore abort errors and bubble up the original upload error.
          }
          throw err;
        }
      }

      async function updateFileContent(id, file, version) {
        var fd = new FormData();
        fd.append('file', file);
        fd.append('version', String(version || 1));
        return await api('/api/entry/' + encodeURIComponent(id) + '/content', {
          method: 'PUT',
          body: fd,
        });
      }

      async function downloadFileVersion(id, version, filename) {
        var res = await fetch('/api/entry/' + encodeURIComponent(id) + '/versions/' + String(version) + '/content', {
          headers: authHeaders(),
        });
        if (res.status === 401) {
          logout();
          throw new Error('Unauthorized');
        }
        if (!res.ok) throw new Error((await res.text()) || ('Request failed: ' + res.status));
        var blob = await res.blob();
        var objectUrl = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename || 'download';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function() { URL.revokeObjectURL(objectUrl); }, 1000);
      }

      async function directUploadFile(file, noteValue, expirationDays) {
        var fd = new FormData();
        fd.append('file', file);
        fd.append('note', noteValue || '');
        fd.append('expirationDays', expirationDays);
        return await api('/api/entry', { method: 'POST', body: fd });
      }

      function el(tag, attrs, children) {
        var node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function(k) {
          var v = attrs[k];
          if (k === 'class') node.className = v;
          else if (k === 'text') node.textContent = v;
          else if (k === 'html') node.innerHTML = v;
          else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
          else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
        });
        (children || []).forEach(function(child) {
          if (typeof child === 'string') node.appendChild(document.createTextNode(child));
          else if (child) node.appendChild(child);
        });
        return node;
      }

      function updateActiveNav() {
        document.querySelectorAll('.nav [data-view]').forEach(function(btn) {
          if (btn.getAttribute('data-view') === state.view) btn.setAttribute('aria-current', 'page');
          else btn.removeAttribute('aria-current');
        });
      }

      function closeSystemMenu() {
        systemMenu.style.display = 'none';
        systemToggle.classList.remove('active');
        systemToggle.setAttribute('aria-expanded', 'false');
      }

      function openSystemMenu() {
        systemMenu.style.display = 'block';
        systemToggle.classList.add('active');
        systemToggle.setAttribute('aria-expanded', 'true');
      }

      async function submitSaasEmailAuth(evt) {
        evt.preventDefault();
        var errorEl = document.getElementById('saas-email-error');
        errorEl.textContent = '';
        var registering = saasEmailMode === 'sign-up';
        var payload = {
          email: document.getElementById('saas-email').value.trim(),
          password: document.getElementById('saas-password').value,
          callbackURL: '/app',
        };
        if (registering) payload.name = document.getElementById('saas-name').value.trim();
        try {
          var response = await fetch(registering ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          var data = await response.json().catch(function() { return {}; });
          if (!response.ok) throw new Error(data.message || data.error || t('email_auth_failed'));
          location.href = '/app';
        } catch (err) {
          errorEl.textContent = String((err && err.message) || err || t('email_auth_failed'));
        }
      }

      async function login() {
        if (PS_SAAS_MODE) {
          try {
            await api('/api/entries');
            setFlash('', false);
            loginEl.classList.add('hidden');
            appEl.classList.remove('hidden');
            await loadInitialData();
            await render();
          } catch (_) {
            setFlash(t('saas_signin_required'), true);
          }
          return;
        }
        state.pw = (pwEl.value || state.pw || '').trim();
        if (!state.pw) {
          setFlash(t('please_enter_passphrase'), true);
          return;
        }
        try {
          await api('/api/entries');
          localStorage.setItem('ps_pw', state.pw);
          setFlash('', false);
          loginEl.classList.add('hidden');
          appEl.classList.remove('hidden');
          await loadInitialData();
          await render();
        } catch (err) {
          setFlash(t('auth_failed'), true);
        }
      }

      function logout() {
        if (PS_SAAS_MODE) {
          fetch('/api/auth/sign-out', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }).finally(function() { location.href = '/'; });
          return;
        }
        localStorage.removeItem('ps_pw');
        state.pw = '';
        state.selectedId = null;
        state.view = 'upload';
        closeSystemMenu();
        appEl.classList.add('hidden');
        loginEl.classList.remove('hidden');
        setFlash(t('logged_out'), false);
      }

      async function restoreSaasSession() {
        authLoadingEl.classList.remove('hidden');
        authLoadingEl.setAttribute('aria-busy', 'true');
        authLoadingMessage.textContent = t('auth_loading');
        authRetryButton.classList.add('hidden');
        loginEl.classList.add('hidden');
        appEl.classList.add('hidden');
        try {
          var response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
          if (!response.ok) throw new Error('Session request failed: ' + response.status);
          var session = await response.json();
          if (!session.user) {
            authLoadingEl.classList.add('hidden');
            authLoadingEl.setAttribute('aria-busy', 'false');
            loginEl.classList.remove('hidden');
            return;
          }
          await loadInitialData();
          render();
          authLoadingEl.classList.add('hidden');
          authLoadingEl.setAttribute('aria-busy', 'false');
          loginEl.classList.add('hidden');
          appEl.classList.remove('hidden');
        } catch (_) {
          authLoadingMessage.textContent = t('auth_loading_error');
          authLoadingEl.setAttribute('aria-busy', 'false');
          authRetryButton.classList.remove('hidden');
        }
      }

      async function loadInitialData() {
        var requests = [api('/api/entries'), api('/api/guest-links'), api('/api/settings')];
        if (PS_SAAS_MODE) requests.push(api('/api/account'));
        var loaded = await Promise.all(requests);
        state.files = loaded[0];
        state.guestLinks = loaded[1];
        state.settings = {
          storeForever: !!loaded[2].storeForever,
          defaultDays: Number(loaded[2].defaultDays || 30),
        };
        state.planLimits = PS_SAAS_MODE ? loaded[3].limits : null;
      }

      async function refreshFiles() {
        state.files = await api('/api/entries');
      }

      async function refreshGuestLinks() {
        state.guestLinks = await api('/api/guest-links');
      }

      function createUploadView() {
        var form = el('form', { class: 'upload-grid' });

        var fileInput = el('input', { type: 'file', id: 'upload-file', multiple: true, 'aria-label': t('choose_files'), class: 'hidden' });
        var dropFileName = el('div', { class: 'drop-file', text: t('no_file_selected') });
        var drop = el('button', { type: 'button', class: 'drop', onclick: function() { fileInput.click(); } }, [
          el('div', { class: 'drop-primary', text: t('drop_choose') }),
          el('div', { class: 'drop-secondary', text: t('supports_drag') }),
          dropFileName,
        ]);
        var selectedFiles = [];

        function selectedFilesSummary() {
          if (!selectedFiles.length) return t('no_file_selected');
          var names = selectedFiles.slice(0, 3).map(function(file) { return file.name; }).join(', ');
          if (selectedFiles.length > 3) names += ' +' + String(selectedFiles.length - 3);
          return t('selected_files_count').replace('{count}', String(selectedFiles.length)) + ': ' + names;
        }

        function setSelectedFiles(files, append) {
          var nextFiles = append ? selectedFiles.slice() : [];
          for (var i = 0; files && i < files.length; i += 1) {
            var file = files[i];
            var duplicate = nextFiles.some(function(existing) {
              return existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified;
            });
            if (!duplicate) nextFiles.push(file);
          }
          selectedFiles = nextFiles;
          dropFileName.textContent = selectedFilesSummary();
        }

        fileInput.addEventListener('change', function() {
          setSelectedFiles(fileInput.files, false);
          fileInput.value = '';
        });

        ['dragenter', 'dragover'].forEach(function(type) {
          drop.addEventListener(type, function(evt) {
            evt.preventDefault();
            drop.classList.add('dragover');
          });
        });
        ['dragleave', 'dragend'].forEach(function(type) {
          drop.addEventListener(type, function(evt) {
            evt.preventDefault();
            drop.classList.remove('dragover');
          });
        });
        drop.addEventListener('drop', function(evt) {
          evt.preventDefault();
          drop.classList.remove('dragover');
          var files = evt.dataTransfer && evt.dataTransfer.files;
          if (files && files.length > 0) {
            setSelectedFiles(files, true);
          }
        });

        var pasteLabel = el('label', { for: 'paste', text: t('or_paste_here') });
        var paste = el('textarea', { id: 'paste', placeholder: t('paste_placeholder') });

        var expLabel = el('label', { for: 'exp-select', text: t('expiration') });
        var maxRetentionDays = Number(state.planLimits && state.planLimits.maxFileLifetimeDays) || 3650;
        var expirationOptions = [];
        if (!PS_SAAS_MODE || (PS_SAAS_MODE && state.planLimits && state.planLimits.maxFileLifetimeDays > 30)) {
          expirationOptions.push(el('option', { value: '0', text: t('never') }));
        }
        [[1, 'day_1'], [7, 'day_7'], [30, 'day_30'], [90, 'day_90'], [365, 'day_365']].forEach(function(item) {
          if (item[0] <= maxRetentionDays) expirationOptions.push(el('option', { value: String(item[0]), text: t(item[1]) }));
        });
        var expSelect = el('select', { id: 'exp-select' }, expirationOptions);
        if (state.settings.storeForever) {
          expSelect.value = '0';
        } else {
          var defaultExpirationDays = state.settings.defaultDays || (PS_SAAS_MODE && maxRetentionDays > 30 ? 365 : 30);
          expSelect.value = String(defaultExpirationDays);
        }

        var noteLabel = el('label', { for: 'note', text: t('note_optional') });
        var note = el('input', { id: 'note', type: 'text', placeholder: t('note_placeholder') });
        var hint = el('div', { class: 'small', text: t('note_only_you') });

        form.appendChild(el('h1', { text: t('upload') }));
        form.appendChild(drop);
        form.appendChild(fileInput);
        form.appendChild(el('div', {}, [pasteLabel, paste]));
        form.appendChild(el('div', {}, [expLabel, expSelect]));
        form.appendChild(el('div', {}, [noteLabel, note, hint]));
        form.appendChild(
          el('div', { class: 'submit-row' }, [
            el('button', { class: 'btn neon form-submit', type: 'submit', text: t('upload') }),
          ]),
        );
        var isUploading = false;

        form.addEventListener('submit', async function(evt) {
          evt.preventDefault();
          if (isUploading) return;
          var filesToUpload = selectedFiles.slice();
          var pastedText = paste.value.trim();
          if (!filesToUpload.length && !pastedText) {
            setFlash(t('select_or_paste_first'), true);
            return;
          }

          isUploading = true;
          setBusy(true, t('uploading_wait'));
          var noteValue = note.value.trim();
          var expirationDaysValue = expSelect.value;

          try {
            if (filesToUpload.length) {
              var failedFiles = [];
              var uploadedCount = 0;
              for (var fileIndex = 0; fileIndex < filesToUpload.length; fileIndex += 1) {
                var file = filesToUpload[fileIndex];
                setBusy(true, t('batch_upload_progress')
                  .replace('{current}', String(fileIndex + 1))
                  .replace('{total}', String(filesToUpload.length)));
                try {
                  var fileSize = Number(file.size || 0);
                  if (fileSize >= multipartUploadThresholdBytes) {
                    await multipartUploadFile(file, noteValue, expirationDaysValue);
                  } else {
                    await directUploadFile(file, noteValue, expirationDaysValue);
                  }
                  uploadedCount += 1;
                } catch (fileError) {
                  failedFiles.push(file);
                  if (String(fileError && fileError.message) === 'Unauthorized') {
                    failedFiles = filesToUpload.slice(fileIndex);
                    break;
                  }
                }
              }

              selectedFiles = failedFiles;
              dropFileName.textContent = selectedFilesSummary();
              fileInput.value = '';
              paste.value = '';
              if (uploadedCount > 0) await refreshFiles();
              if (failedFiles.length) {
                setFlash(t('batch_upload_partial')
                  .replace('{uploaded}', String(uploadedCount))
                  .replace('{total}', String(filesToUpload.length)), true);
                return;
              }
              setFlash(t('batch_upload_success').replace('{count}', String(uploadedCount)), false);
            } else {
              var fd = new FormData();
              fd.append('pastedText', pastedText);
              fd.append('note', noteValue);
              fd.append('expirationDays', expirationDaysValue);
              await api('/api/entry', { method: 'POST', body: fd });
              setFlash(t('upload_success'), false);
              paste.value = '';
              await refreshFiles();
            }
            note.value = '';
            state.view = 'files';
            state.fileSearch = '';
            state.filePage = 1;
            await render();
          } catch (err) {
            setFlash(String(err.message || err), true);
          } finally {
            isUploading = false;
            setBusy(false);
          }
        });

        return form;
      }

      function createFilesView() {
        var root = el('section', { class: 'stack stack-wide' });
        root.appendChild(el('h1', { text: t('files') }));
        var selectedFileIds = new Set();
        var pageFiles = [];

        var searchInput = el('input', {
          type: 'search',
          class: 'files-search-input',
          placeholder: t('files_search_placeholder'),
          'aria-label': t('files_search'),
          value: state.fileSearch,
        });
        var countLabel = el('span', { class: 'files-count' });
        var selectionCountLabel = el('span', { class: 'files-count' });
        var bulkCopyButton = el('button', { type: 'button', class: 'btn secondary small', text: t('copy_selected_file_links') });
        var bulkDeleteButton = el('button', { type: 'button', class: 'btn danger small', text: t('delete_selected_files') });
        bulkCopyButton.disabled = true;
        bulkDeleteButton.disabled = true;
        var bulkToolbar = el('div', { class: 'files-bulk-toolbar hidden' }, [
          selectionCountLabel,
          el('div', { class: 'files-bulk-actions' }, [bulkCopyButton, bulkDeleteButton]),
        ]);
        root.appendChild(el('div', { class: 'files-toolbar' }, [
          el('div', { class: 'files-search' }, [searchInput]),
          countLabel,
        ]));
        root.appendChild(bulkToolbar);

        var selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllCheckbox.className = 'file-select-checkbox';
        selectAllCheckbox.setAttribute('aria-label', t('select_all_files_page'));
        function updateSelectionToolbar() {
          var selectedCount = selectedFileIds.size;
          selectionCountLabel.textContent = t('files_selected_count').replace('{count}', String(selectedCount));
          bulkCopyButton.disabled = selectedCount === 0;
          bulkDeleteButton.disabled = selectedCount === 0;
          bulkToolbar.classList.toggle('hidden', selectedCount === 0);
          var selectedOnPage = pageFiles.filter(function(file) { return selectedFileIds.has(file.id); }).length;
          selectAllCheckbox.checked = pageFiles.length > 0 && selectedOnPage === pageFiles.length;
          selectAllCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < pageFiles.length;
          selectAllCheckbox.disabled = pageFiles.length === 0;
        }
        selectAllCheckbox.addEventListener('change', function() {
          pageFiles.forEach(function(file) {
            if (selectAllCheckbox.checked) selectedFileIds.add(file.id);
            else selectedFileIds.delete(file.id);
          });
          renderFileRows();
        });

        bulkCopyButton.addEventListener('click', async function() {
          var ids = Array.from(selectedFileIds);
          if (!ids.length) return;
          try {
            await navigator.clipboard.writeText(ids.map(function(id) { return location.origin + '/-' + id; }).join('\\n'));
            setFlash(t('selected_file_links_copied').replace('{count}', String(ids.length)), false);
          } catch {
            setFlash(t('clipboard_denied'), true);
          }
        });

        bulkDeleteButton.addEventListener('click', async function() {
          var ids = Array.from(selectedFileIds);
          if (!ids.length) return;
          var message = t('delete_selected_files_confirm').replace('{count}', String(ids.length));
          if (!(await confirmAction(message, t('delete')))) return;
          bulkDeleteButton.disabled = true;
          bulkCopyButton.disabled = true;
          var deleted = 0;
          var failed = 0;
          for (var i = 0; i < ids.length; i += 1) {
            try {
              await api('/api/entry/' + encodeURIComponent(ids[i]), { method: 'DELETE' });
              deleted += 1;
            } catch (err) {
              failed += 1;
              if (String(err && err.message) === 'Unauthorized') {
                failed += ids.length - i - 1;
                break;
              }
            }
          }
          selectedFileIds.clear();
          try {
            await refreshFiles();
            setFlash(failed
              ? t('files_delete_partial').replace('{deleted}', String(deleted)).replace('{failed}', String(failed))
              : t('files_deleted_count').replace('{count}', String(deleted)), failed > 0);
            await render();
          } catch (err) {
            setFlash(String(err.message || err), true);
          }
        });

        var tableWrap = el('div', { class: 'table-wrap' });
        var table = el('table', { class: 'files-table' });
        var colgroup = el('colgroup');
        ['file-col-select', 'file-col-name', 'file-col-note', 'file-col-size', 'file-col-uploaded', 'file-col-expiration', 'file-col-downloads', 'file-col-actions'].forEach(function(className) {
          colgroup.appendChild(el('col', { class: className }));
        });
        table.appendChild(colgroup);
        var thead = el('thead');
        var headRow = el('tr');
        var selectHeader = el('th', { scope: 'col', class: 'file-select-cell' });
        selectHeader.appendChild(selectAllCheckbox);
        headRow.appendChild(selectHeader);
        [t('filename'), t('note'), t('size'), t('uploaded'), t('expires'), t('downloads'), t('actions')].forEach(function(title) {
          headRow.appendChild(el('th', { scope: 'col', text: title }));
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        var tbody = el('tbody');
        var previousButton = el('button', {
          type: 'button',
          class: 'btn secondary small',
          text: t('previous_page'),
          onclick: function() {
            if (state.filePage > 1) {
              selectedFileIds.clear();
              state.filePage -= 1;
              renderFileRows();
            }
          },
        });
        var pageInfo = el('span', { class: 'files-page-info' });
        var nextButton = el('button', {
          type: 'button',
          class: 'btn secondary small',
          text: t('next_page'),
          onclick: function() {
            selectedFileIds.clear();
            state.filePage += 1;
            renderFileRows();
          },
        });

        function renderFileRows() {
          var query = searchInput.value.trim().toLocaleLowerCase();
          state.fileSearch = searchInput.value;
          var filteredFiles = state.files.filter(function(file) {
            return !query || (String(file.filename || '') + ' ' + String(file.note || '')).toLocaleLowerCase().includes(query);
          });
          var pageCount = Math.max(1, Math.ceil(filteredFiles.length / 50));
          state.filePage = Math.min(Math.max(1, state.filePage), pageCount);
          var start = (state.filePage - 1) * 50;
          pageFiles = filteredFiles.slice(start, start + 50);

          countLabel.textContent = t('files_count').replace('{count}', String(filteredFiles.length));
          pageInfo.textContent = t('files_page_info')
            .replace('{page}', String(state.filePage))
            .replace('{pages}', String(pageCount));
          previousButton.disabled = state.filePage <= 1;
          nextButton.disabled = state.filePage >= pageCount;
          tbody.innerHTML = '';
          updateSelectionToolbar();

          if (pageFiles.length === 0) {
            var emptyRow = el('tr');
            emptyRow.appendChild(el('td', {
              colspan: 8,
              class: 'muted',
              text: state.files.length ? t('no_matching_files') : t('no_files_in_list'),
            }));
            tbody.appendChild(emptyRow);
            return;
          }

          pageFiles.forEach(function(file) {
            var tr = el('tr');
            tr.addEventListener('mouseenter', function(evt) { showPreview(file, evt); });
            tr.addEventListener('mousemove', function(evt) { if (!filePreview.classList.contains('hidden')) movePreview(evt); });
            tr.addEventListener('mouseleave', hidePreview);

            var selectCell = el('td', { class: 'file-select-cell' });
            var rowCheckbox = document.createElement('input');
            rowCheckbox.type = 'checkbox';
            rowCheckbox.className = 'file-select-checkbox';
            rowCheckbox.checked = selectedFileIds.has(file.id);
            rowCheckbox.setAttribute('aria-label', t('select_file').replace('{name}', String(file.filename || file.id)));
            rowCheckbox.addEventListener('change', function() {
              if (rowCheckbox.checked) selectedFileIds.add(file.id);
              else selectedFileIds.delete(file.id);
              updateSelectionToolbar();
            });
            selectCell.appendChild(rowCheckbox);
            tr.appendChild(selectCell);

            var typeInfo = fileTypeInfo(file);
            var filenameCell = el('td');
            filenameCell.appendChild(
              el('span', { class: 'file-cell' }, [
                el('span', {
                  class: 'file-icon ' + typeInfo.typeClass,
                  text: typeInfo.icon,
                  title: typeInfo.label,
                  'aria-label': typeInfo.label + ' file',
                }),
                el('span', { class: 'file-name', text: file.filename }),
              ]),
            );

            tr.appendChild(filenameCell);
            var noteCell = el('td', {
              class: 'note-cell',
              text: file.note || '',
              title: file.note ? String(file.note) : null,
              'aria-label': file.note ? String(file.note) : null,
            });
            noteCell.addEventListener('mouseenter', hidePreview);
            tr.appendChild(noteCell);
            tr.appendChild(el('td', { text: formatSize(file.size) }));
            tr.appendChild(el('td', { text: formatDate(file.upload_time) }));
            tr.appendChild(el('td', { text: formatDate(file.expiration_time) }));
            tr.appendChild(
              el('td', {}, [
                el('button', {
                  type: 'button',
                  class: 'btn blue small',
                  text: String(file.download_count || 0),
                  'aria-label': t('history'),
                  onclick: function() {
                    state.selectedId = file.id;
                    state.downloadsUniqueOnly = false;
                    state.view = 'downloads';
                    render();
                  },
                }),
              ]),
            );

            var actions = el('td', { class: 'actions' });
            actions.appendChild(el('button', {
              type: 'button', class: 'btn blue small', text: 'i', 'aria-label': t('view_file_info'), title: t('view_file_info'), onclick: function() {
                state.selectedId = file.id;
                state.view = 'fileInfo';
                render();
              }
            }));
            actions.appendChild(el('button', {
              type: 'button', class: 'btn secondary small', text: '✎', 'aria-label': t('edit_file'), title: t('edit_file'), onclick: function() {
                state.selectedId = file.id;
                state.view = 'fileEdit';
                render();
              }
            }));
            actions.appendChild(el('button', {
              type: 'button', class: 'btn blue small', text: '⧉', 'aria-label': t('copy_short_link'), title: t('copy_short_link'), onclick: async function() {
                try {
                  await navigator.clipboard.writeText(location.origin + '/-' + file.id);
                  setFlash(t('link_copied'), false);
                } catch {
                  setFlash(t('clipboard_denied'), true);
                }
              }
            }));
            actions.appendChild(el('button', {
              type: 'button', class: 'btn danger small', text: t('delete'), 'aria-label': t('delete_file'), title: t('delete_file'), onclick: async function() {
                if (!(await confirmAction(t('delete_file_confirm'), t('delete')))) return;
                try {
                  await api('/api/entry/' + encodeURIComponent(file.id), { method: 'DELETE' });
                  await refreshFiles();
                  setFlash(t('file_deleted'), false);
                  render();
                } catch (err) {
                  setFlash(String(err.message || err), true);
                }
              }
            }));
            tr.appendChild(actions);
            tbody.appendChild(tr);
          });
        }

        searchInput.addEventListener('input', function() {
          selectedFileIds.clear();
          state.filePage = 1;
          renderFileRows();
        });

        table.appendChild(tbody);
        tableWrap.appendChild(table);
        root.appendChild(tableWrap);
        var pagination = el('div', { class: 'files-pagination' }, [previousButton, pageInfo, nextButton]);
        root.appendChild(pagination);
        renderFileRows();
        return root;
      }

      async function createFileInfoView() {
        var id = state.selectedId;
        var data = await api('/api/entry/' + encodeURIComponent(id));
        var versionsData = await api('/api/entry/' + encodeURIComponent(id) + '/versions');
        var versions = versionsData.versions || [];
        var root = el('section', { class: 'stack file-info-page' });
        root.appendChild(el('h1', { text: t('file_information') }));
        function kv(label, value) {
          var block = el('div', { class: 'file-meta-item' });
          block.appendChild(el('strong', { text: label }));
          block.appendChild(el('span', { class: 'file-meta-value', text: value }));
          return block;
        }

        var fullLink = location.origin + '/-' + data.id + '/' + data.filename;
        var shortLink = location.origin + '/-' + data.id;

        var linksPanel = el('div', { class: 'panel stack file-links' }, [
          el('h3', { text: t('links') }),
          el('div', { class: 'row' }, [
            el('a', { href: fullLink, target: '_blank', rel: 'noreferrer', text: fullLink }),
            el('button', { type: 'button', class: 'btn blue small', text: t('copy'), onclick: function() { navigator.clipboard.writeText(fullLink); setFlash(t('full_link_copied'), false); } })
          ]),
          el('div', { class: 'small', text: t('full_link') }),
          el('div', { class: 'row' }, [
            el('a', { href: shortLink, target: '_blank', rel: 'noreferrer', text: shortLink }),
            el('button', { type: 'button', class: 'btn blue small', text: t('copy'), onclick: function() { navigator.clipboard.writeText(shortLink); setFlash(t('short_link_copied'), false); } })
          ]),
          el('div', { class: 'small', text: t('short_link') }),
        ]);

        root.appendChild(linksPanel);

        var info = el('div', { class: 'file-meta-grid' });
        info.appendChild(kv(t('filename'), data.filename));
        info.appendChild(kv(t('size'), formatSize(data.size)));
        info.appendChild(kv(t('current_version'), String(data.version || 1)));
        info.appendChild(kv(t('file_md5'), data.md5 || t('not_available')));
        info.appendChild(kv(t('last_updated'), formatDateTime(data.updated_time)));
        info.appendChild(kv(t('expires'), data.expiration_time ? formatDate(data.expiration_time) : t('never')));
        var downloadsWrap = el('div', { class: 'file-meta-item file-meta-downloads' });
        downloadsWrap.appendChild(el('strong', { text: t('downloads') }));
        var dlRow = el('span', { class: 'file-meta-value' }, [
          document.createTextNode(String(data.download_count || 0)),
          el('button', {
            type: 'button',
            class: 'btn blue small',
            text: t('history'),
            onclick: function() {
              state.selectedId = data.id;
              state.downloadsUniqueOnly = false;
              state.view = 'downloads';
              render();
            },
          }),
        ]);
        downloadsWrap.appendChild(dlRow);
        info.appendChild(downloadsWrap);
        info.appendChild(kv(t('note'), data.note || t('none')));
        info.appendChild(kv(t('uploaded_by'), t('you')));
        root.appendChild(info);

        var versionsPanel = el('div', { class: 'panel stack versions-panel' });
        versionsPanel.appendChild(el('h3', { text: t('versions') }));
        if (versions.length === 0) {
          versionsPanel.appendChild(el('div', { class: 'muted', text: t('no_versions') }));
        } else {
          var versionsWrap = el('div', { class: 'table-wrap' });
          var versionsTable = el('table', { class: 'version-history-table' });
          var versionsHead = el('tr');
          [t('version_number'), t('size'), t('file_md5'), t('version_time'), t('actions')].forEach(function(title) {
            versionsHead.appendChild(el('th', { scope: 'col', text: title }));
          });
          versionsTable.appendChild(el('thead', {}, [versionsHead]));
          var versionsBody = el('tbody');
          versions.forEach(function(version) {
            var row = el('tr');
            row.appendChild(el('td', { text: String(version.version), 'data-label': t('version_number') }));
            row.appendChild(el('td', { text: formatSize(version.size), 'data-label': t('size') }));
            row.appendChild(el('td', { class: 'version-md5', text: version.md5 || t('not_available'), 'data-label': t('file_md5') }));
            row.appendChild(el('td', { class: 'version-time', text: formatDateTime(version.created_time), 'data-label': t('version_time') }));
            row.appendChild(el('td', { class: 'actions version-actions', 'data-label': t('actions') }, [
              el('button', {
                type: 'button',
                class: 'btn blue small',
                text: t('download_version'),
                onclick: async function() {
                  try {
                    setBusy(true, t('download_version'));
                    await downloadFileVersion(data.id, version.version, version.filename);
                  } catch (err) {
                    setFlash(String(err.message || err), true);
                  } finally {
                    setBusy(false);
                  }
                },
              }),
            ]));
            versionsBody.appendChild(row);
          });
          versionsTable.appendChild(versionsBody);
          versionsWrap.appendChild(versionsTable);
          versionsPanel.appendChild(versionsWrap);
        }
        root.appendChild(versionsPanel);

        root.appendChild(el('div', { class: 'submit-row' }, [
          el('button', {
            type: 'button', class: 'btn blue form-submit tight', text: t('update_file'), onclick: function() {
              state.selectedId = data.id;
              state.view = 'fileUpdate';
              render();
            }
          }),
          el('button', {
            type: 'button', class: 'btn secondary form-submit tight', text: t('edit_file'), onclick: function() {
              state.selectedId = data.id;
              state.view = 'fileEdit';
              render();
            }
          }),
          el('button', {
            type: 'button', class: 'btn form-submit tight', text: t('back_to_files'), onclick: function() {
              state.view = 'files';
              render();
            }
          }),
        ]));

        return root;
      }

      async function createFileUpdateView() {
        var id = state.selectedId;
        var data = await api('/api/entry/' + encodeURIComponent(id));
        var root = el('section', { class: 'stack' });
        root.appendChild(el('h1', { text: t('update_file_title') }));
        root.appendChild(el('div', { class: 'note-box', text: t('update_same_name_hint') }));

        var form = el('form', { class: 'upload-grid' });
        var fileInput = el('input', { id: 'update-file', type: 'file', class: 'hidden' });
        var selectedLabel = el('div', { class: 'drop-file', text: t('no_file_selected') });
        var drop = el('button', { type: 'button', class: 'drop', onclick: function() { fileInput.click(); } }, [
          el('div', { class: 'drop-primary', text: t('choose_update_file') }),
          el('div', { class: 'drop-secondary', text: data.filename }),
          selectedLabel,
        ]);
        var selectedFile = null;
        var submit = el('button', { type: 'submit', class: 'btn form-submit', text: t('update_file') });

        function syncSelection(file) {
          selectedFile = file || null;
          if (!selectedFile) {
            selectedLabel.textContent = t('no_file_selected');
            submit.disabled = true;
            return;
          }
          selectedLabel.textContent = selectedFile.name;
          submit.disabled = selectedFile.name !== data.filename;
        }

        fileInput.addEventListener('change', function() {
          syncSelection(fileInput.files && fileInput.files[0] ? fileInput.files[0] : null);
          fileInput.value = '';
        });
        ['dragenter', 'dragover'].forEach(function(type) {
          drop.addEventListener(type, function(evt) {
            evt.preventDefault();
            drop.classList.add('dragover');
          });
        });
        ['dragleave', 'dragend'].forEach(function(type) {
          drop.addEventListener(type, function(evt) {
            evt.preventDefault();
            drop.classList.remove('dragover');
          });
        });
        drop.addEventListener('drop', function(evt) {
          evt.preventDefault();
          drop.classList.remove('dragover');
          var files = evt.dataTransfer && evt.dataTransfer.files;
          if (!files || files.length === 0) return;
          if (files.length > 1) {
            syncSelection(null);
            setFlash(t('select_one_update_file'), true);
            return;
          }
          syncSelection(files[0]);
        });
        syncSelection(null);
        form.appendChild(drop);
        form.appendChild(fileInput);
        form.appendChild(el('div', { class: 'small', text: t('same_name_required') }));
        form.appendChild(el('div', { class: 'submit-row' }, [submit]));
        form.addEventListener('submit', async function(evt) {
          evt.preventDefault();
          if (!selectedFile) {
            setFlash(t('select_or_paste_first'), true);
            return;
          }
          if (selectedFile.name !== data.filename) {
            setFlash(t('same_name_required'), true);
            return;
          }
          try {
            setBusy(true, t('uploading_wait'));
            if (Number(selectedFile.size || 0) >= multipartUploadThresholdBytes) {
              await multipartUploadFile(selectedFile, '', null, id, data.version);
            } else {
              await updateFileContent(id, selectedFile, data.version);
            }
            await refreshFiles();
            setFlash(t('file_updated'), false);
            state.view = 'fileInfo';
            await render();
          } catch (err) {
            setFlash(String(err.message || err), true);
          } finally {
            setBusy(false);
          }
        });
        root.appendChild(form);
        root.appendChild(el('div', { class: 'submit-row' }, [
          el('button', {
            type: 'button', class: 'btn form-submit tight', text: t('cancel'), onclick: function() {
              state.view = 'fileInfo';
              render();
            }
          }),
        ]));
        return root;
      }

      async function createDownloadsView() {
        var id = state.selectedId;
        var file = state.files.find(function(f) { return f.id === id; });
        if (!file) file = await api('/api/entry/' + encodeURIComponent(id));
        var res = await api('/api/entry/' + encodeURIComponent(id) + '/downloads?uniqueIps=' + (state.downloadsUniqueOnly ? '1' : '0'));
        var rows = res.events || [];

        var root = el('section', { class: 'stack stack-wide' });
        root.appendChild(el('h1', { text: t('downloads_title') }));
        root.appendChild(el('h3', { text: file.filename || t('unknown_file') }));

        var uniqueToggle = el('input', { id: 'downloads-unique', type: 'checkbox' });
        if (state.downloadsUniqueOnly) uniqueToggle.checked = true;
        uniqueToggle.addEventListener('change', function() {
          state.downloadsUniqueOnly = uniqueToggle.checked;
          render();
        });
        root.appendChild(el('div', { class: 'check-row' }, [
          uniqueToggle,
          el('label', { for: 'downloads-unique', text: t('unique_ips_only') }),
        ]));

        var tableWrap = el('div', { class: 'table-wrap' });
        var table = el('table', { class: 'files-table' });
        var thead = el('thead');
        var hr = el('tr');
        [t('download'), t('time'), t('downloader_ip'), t('browser'), t('platform')].forEach(function(h) {
          hr.appendChild(el('th', { scope: 'col', text: h }));
        });
        thead.appendChild(hr);
        table.appendChild(thead);
        var tbody = el('tbody');
        var total = Number(res.total || rows.length);
        rows.forEach(function(r, idx) {
          var ua = parseUa(r.user_agent);
          var tr = el('tr');
          tr.appendChild(el('td', { text: String(Math.max(1, total - idx)) }));
          tr.appendChild(el('td', { text: formatDateTime(r.downloaded_at) }));
          tr.appendChild(el('td', { text: r.ip || '-' }));
          tr.appendChild(el('td', { text: ua.browser || '-' }));
          tr.appendChild(el('td', { text: ua.platform || '' }));
          tbody.appendChild(tr);
        });
        if (rows.length === 0) {
          var empty = el('tr');
          empty.appendChild(el('td', { text: t('no_downloads_yet'), colspan: '5' }));
          tbody.appendChild(empty);
        }
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        root.appendChild(tableWrap);
        root.appendChild(el('div', { class: 'submit-row' }, [
          el('button', {
            type: 'button',
            class: 'btn form-submit tight',
            text: t('close'),
            onclick: function() {
              state.view = 'files';
              render();
            },
          }),
        ]));
        return root;
      }

      async function createFileEditView() {
        var id = state.selectedId;
        var data = await api('/api/entry/' + encodeURIComponent(id));
        var root = el('section', { class: 'stack' });
        root.appendChild(el('h1', { text: t('edit_file_title') }));

        var form = el('form', { class: 'stack' });
        var filename = el('input', { id: 'edit-filename', type: 'text', value: data.filename });
        var deleteAfter = el('input', { id: 'edit-delete-after', type: 'checkbox' });
        var maxRetentionDays = Number(state.planLimits && state.planLimits.maxFileLifetimeDays) || 3650;
        var expirationOptions = [];
        if (!PS_SAAS_MODE || (PS_SAAS_MODE && maxRetentionDays > 30)) expirationOptions.push(el('option', { value: '0', text: t('never') }));
        [[1, 'day_1'], [7, 'day_7'], [30, 'day_30'], [90, 'day_90'], [365, 'day_365']].forEach(function(item) {
          if (item[0] <= maxRetentionDays) expirationOptions.push(el('option', { value: String(item[0]), text: t(item[1]) }));
        });
        var exp = el('select', { id: 'edit-exp' }, expirationOptions);
        if (data.expiration_time) {
          var daysLeft = Math.max(1, Math.ceil((new Date(data.expiration_time).getTime() - Date.now()) / (24 * 3600 * 1000)));
          var availableDays = [1, 7, 30, 90, 365].filter(function(days) { return days <= maxRetentionDays && days <= daysLeft; });
          exp.value = String(availableDays.length ? availableDays[availableDays.length - 1] : 1);
          deleteAfter.checked = true;
        } else if (PS_SAAS_MODE) {
          var maxOptionDays = [1, 7, 30, 90, 365].filter(function(days) { return days <= maxRetentionDays; });
          exp.value = maxRetentionDays > 30 ? '0' : String(maxOptionDays[maxOptionDays.length - 1] || 30);
          deleteAfter.checked = true;
        }
        if (PS_SAAS_MODE && maxRetentionDays <= 30) {
          deleteAfter.checked = true;
          deleteAfter.disabled = true;
        }

        var note = el('input', { id: 'edit-note', type: 'text', value: data.note || '' });

        form.appendChild(el('div', {}, [el('label', { for: 'edit-filename', text: t('filename') }), filename]));
        form.appendChild(el('div', {}, [el('label', { for: 'edit-exp', text: t('expiration') })]));
        if (!PS_SAAS_MODE) form.appendChild(el('div', { class: 'check-row' }, [
          deleteAfter,
          el('label', { for: 'edit-delete-after', text: t('delete_after_expiration') })
        ]));
        form.appendChild(exp);
        form.appendChild(el('div', {}, [el('label', { for: 'edit-note', text: t('note') }), note, el('div', { class: 'small', text: t('note_only_you') })]));

        var actions = el('div', { class: 'row', style: 'justify-content: space-between;' });
        actions.appendChild(el('button', {
          type: 'button', class: 'btn danger', text: t('delete'), onclick: async function() {
            if (!(await confirmAction(t('delete_file_confirm'), t('delete')))) return;
            await api('/api/entry/' + encodeURIComponent(id), { method: 'DELETE' });
            await refreshFiles();
            setFlash(t('file_deleted'), false);
            state.view = 'files';
            render();
          }
        }));

        var right = el('div', { class: 'row' });
        right.appendChild(el('button', {
          type: 'button', class: 'btn form-submit', text: t('cancel'), onclick: function() {
            state.view = 'files';
            render();
          }
        }));
        right.appendChild(el('button', { type: 'submit', class: 'btn form-submit', text: t('save') }));
        actions.appendChild(right);

        form.appendChild(actions);
        form.addEventListener('submit', async function(evt) {
          evt.preventDefault();
          var payload = {
            filename: filename.value.trim(),
            note: note.value.trim(),
            deleteAfterExpiration: deleteAfter.checked,
            expirationDays: deleteAfter.checked ? Number(exp.value || 0) : 0,
          };
          await api('/api/entry/' + encodeURIComponent(id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          await refreshFiles();
          setFlash(t('file_updated'), false);
          state.view = 'files';
          render();
        });

        root.appendChild(form);
        return root;
      }

      function createGuestLinksView() {
        var root = el('section', { class: 'stack' });
        root.appendChild(el('h1', { text: t('guest_links') }));
        root.appendChild(el('div', { class: 'note-box' }, [
          t('guest_desc_1'),
          el('br'),
          el('br'),
          t('guest_desc_2')
        ]));

        var form = el('form', { class: 'panel stack' });
        form.appendChild(el('h3', { text: t('create_new_guest_link') }));
        var label = el('input', { id: 'gl-label', type: 'text', placeholder: t('note_optional') });
        var urlExpires = el('input', { id: 'gl-url-exp', type: 'date' });
        var fileLife = el('input', { id: 'gl-file-life', type: 'number', min: '1', placeholder: t('file_exp_days') });
        var maxSizeMb = el('input', { id: 'gl-max-size', type: 'number', min: '1', placeholder: t('max_upload_size_mb') });
        var maxUploads = el('input', { id: 'gl-max-up', type: 'number', min: '1', placeholder: t('max_uploads') });

        [
          [t('label'), label],
          [t('url_expiration'), urlExpires],
          [t('file_exp_days'), fileLife],
          [t('max_upload_size_mb'), maxSizeMb],
          [t('max_uploads'), maxUploads],
        ].forEach(function(tuple) {
          var wrap = el('div');
          wrap.appendChild(el('label', { text: tuple[0] }));
          wrap.appendChild(tuple[1]);
          form.appendChild(wrap);
        });

        form.appendChild(
          el('div', { class: 'submit-row' }, [
            el('button', { type: 'submit', class: 'btn form-submit', text: t('create_new') }),
          ]),
        );
        form.addEventListener('submit', async function(evt) {
          evt.preventDefault();
          var payload = {
            label: label.value.trim() || null,
            url_expires: urlExpires.value ? new Date(urlExpires.value + 'T00:00:00.000Z').toISOString() : null,
            max_file_lifetime_days: fileLife.value ? Number(fileLife.value) : null,
            max_file_bytes: maxSizeMb.value ? Number(maxSizeMb.value) * 1024 * 1024 : null,
            max_file_uploads: maxUploads.value ? Number(maxUploads.value) : null,
          };
          await api('/api/guest-links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          await refreshGuestLinks();
          setFlash(t('guest_link_created'), false);
          render();
        });
        root.appendChild(form);

        var table = el('table');
        var thead = el('thead');
        var hr = el('tr');
        [t('label'), t('created'), t('url_expiration'), t('file_exp_days'), t('max_upload_size'), t('max_uploads'), t('actions')].forEach(function(h) {
          hr.appendChild(el('th', { scope: 'col', text: h }));
        });
        thead.appendChild(hr);
        table.appendChild(thead);

        var tbody = el('tbody');
        state.guestLinks.forEach(function(gl) {
          var tr = el('tr');
          tr.appendChild(el('td', { text: gl.label || gl.id }));
          tr.appendChild(el('td', { text: formatDate(gl.created_time) }));
          tr.appendChild(el('td', { text: formatDate(gl.url_expires) }));
          tr.appendChild(el('td', { text: gl.max_file_lifetime_days ? (gl.max_file_lifetime_days + ' ' + t('days_unit')) : t('default_value') }));
          tr.appendChild(el('td', { text: gl.max_file_bytes ? formatSize(gl.max_file_bytes) : t('unlimited') }));
          tr.appendChild(el('td', { text: String(gl.upload_count || 0) + (gl.max_file_uploads ? (' / ' + gl.max_file_uploads) : '') }));
          var actions = el('td', { class: 'actions' });
          actions.appendChild(el('button', {
            type: 'button',
            class: 'btn blue small',
            text: t('copy'),
            'aria-label': t('copy_guest_link'),
            onclick: function() {
              navigator.clipboard.writeText(location.origin + '/guest/' + gl.id);
              setFlash(t('guest_link_copied'), false);
            }
          }));
          actions.appendChild(el('button', {
            type: 'button',
            class: 'btn danger small',
            text: t('delete'),
            'aria-label': t('delete_guest_link'),
            onclick: async function() {
              if (!(await confirmAction(t('delete_guest_confirm'), t('delete')))) return;
              await api('/api/guest-links/' + encodeURIComponent(gl.id), { method: 'DELETE' });
              await refreshGuestLinks();
              setFlash(t('guest_link_deleted'), false);
              render();
            }
          }));
          tr.appendChild(actions);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        root.appendChild(table);

        return root;
      }

      async function createSystemInfoView() {
        var info = await api('/api/system-info');
        function liStrong(label, value, indent) {
          var li = el('li');
          if (indent) li.style.paddingLeft = '20px';
          li.appendChild(el('strong', { text: label + ': ' }));
          li.appendChild(document.createTextNode(value));
          return li;
        }
        var root = el('section', { class: 'stack' });
        root.appendChild(el('h1', { text: t('system_information') }));
        root.appendChild(el('h2', { text: t('picoshare_usage') }));

        var list = el('ul', { style: 'font-size: 30px; line-height: 1.7;' });
        list.appendChild(liStrong(t('upload_data'), formatSize(info.upload_data_bytes || 0)));
        list.appendChild(liStrong(t('files'), String(info.db_entry_count || 0)));
        list.appendChild(liStrong(t('guest_links_count'), String(info.db_guest_link_count || 0)));
        list.appendChild(liStrong(t('total_downloads'), String(info.download_count || 0)));
        root.appendChild(list);

        root.appendChild(el('h2', { text: 'PicoShare ' + t('version') }));
        var vList = el('ul', { style: 'font-size: 30px; line-height: 1.7;' });
        vList.appendChild(liStrong(t('version'), '1.0.0-ts'));
        vList.appendChild(liStrong(t('built_at'), t('not_available')));
        root.appendChild(vList);

        return root;
      }

      function createSettingsView() {
        var root = el('section', { class: 'stack stack-wide' });
        root.appendChild(el('h1', { text: t('settings') }));

        var form = el('form', { class: 'panel settings-form' });
        form.appendChild(el('h3', { text: t('default_file_expiration') }));

        var storeForever = el('input', { id: 'set-store-forever', type: 'checkbox' });
        if (state.settings.storeForever) storeForever.checked = true;
        if (PS_SAAS_MODE) storeForever.disabled = !(state.planLimits && state.planLimits.maxFileLifetimeDays > 30);
        var days = el('input', { id: 'set-days', type: 'number', min: '1', value: String(state.settings.defaultDays || (PS_SAAS_MODE && state.planLimits && state.planLimits.maxFileLifetimeDays > 30 ? 365 : 30)) });

        var toggleRow = el('div', { class: 'toggle-row' }, [
          storeForever,
          el('label', { for: 'set-store-forever', text: t('store_files_forever') }),
        ]);
        var daysRow = el('div', { class: 'days-row' }, [
          days,
          el('span', { text: t('days') }),
        ]);

        function syncDaysState() {
          days.disabled = storeForever.checked;
          if (storeForever.checked) daysRow.classList.add('disabled');
          else daysRow.classList.remove('disabled');
        }

        storeForever.addEventListener('change', syncDaysState);
        syncDaysState();

        if (!PS_SAAS_MODE) form.appendChild(toggleRow);
        else form.appendChild(el('div', { class: 'small', text: t('retention_plan_help') }));
        form.appendChild(daysRow);

        form.appendChild(
          el('div', { class: 'submit-row' }, [
            el('button', { type: 'submit', class: 'btn form-submit', text: t('save') }),
          ]),
        );

        form.addEventListener('submit', async function(evt) {
          evt.preventDefault();
          await api('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storeForever: storeForever.checked,
              defaultDays: storeForever.checked && PS_SAAS_MODE ? 0 : Number(days.value || 30),
            }),
          });
          state.settings = {
            storeForever: storeForever.checked,
            defaultDays: storeForever.checked && PS_SAAS_MODE ? 0 : Number(days.value || 30),
          };
          setFlash(t('settings_saved'), false);
        });

        root.appendChild(form);
        return root;
      }

      async function render() {
        closeSystemMenu();
        hidePreview();
        updateActiveNav();
        mainEl.innerHTML = '';

        try {
          if (state.view === 'upload') mainEl.appendChild(createUploadView());
          else if (state.view === 'files') mainEl.appendChild(createFilesView());
          else if (state.view === 'guestLinks') mainEl.appendChild(createGuestLinksView());
          else if (state.view === 'systemInfo') mainEl.appendChild(await createSystemInfoView());
          else if (state.view === 'settings') mainEl.appendChild(createSettingsView());
          else if (state.view === 'fileInfo') mainEl.appendChild(await createFileInfoView());
          else if (state.view === 'fileUpdate') mainEl.appendChild(await createFileUpdateView());
          else if (state.view === 'downloads') mainEl.appendChild(await createDownloadsView());
          else if (state.view === 'fileEdit') mainEl.appendChild(await createFileEditView());
          mainEl.focus();
        } catch (err) {
          setFlash(String(err.message || err), true);
        }
      }

      document.querySelectorAll('.nav [data-view]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          state.view = btn.getAttribute('data-view');
          state.selectedId = null;
          setFlash('', false);
          render();
        });
      });
      var clipsButton = document.getElementById('nav-clips-btn');
      if (clipsButton) clipsButton.addEventListener('click', function() {
        location.href = '/clips';
      });

      systemToggle.addEventListener('click', function() {
        if (systemMenu.style.display === 'block') closeSystemMenu();
        else openSystemMenu();
      });

      document.addEventListener('click', function(evt) {
        if (!systemMenu.contains(evt.target) && !systemToggle.contains(evt.target)) closeSystemMenu();
      });
      confirmBackdrop.addEventListener('click', function(evt) {
        if (evt.target === confirmBackdrop) confirmCancel.click();
      });

      systemMenu.querySelectorAll('[data-view]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          state.view = btn.getAttribute('data-view');
          setFlash('', false);
          render();
        });
      });

      document.getElementById('logout-btn').addEventListener('click', logout);
      authRetryButton.addEventListener('click', restoreSaasSession);
      document.getElementById('menu-account').addEventListener('click', function() { location.href = '/account'; });
      langToggle.addEventListener('click', switchLang);
      loginBtn.addEventListener('click', login);
      document.getElementById('saas-email-auth-form').addEventListener('submit', submitSaasEmailAuth);
      document.getElementById('saas-email-mode-toggle').addEventListener('click', function() {
        saasEmailMode = saasEmailMode === 'sign-in' ? 'sign-up' : 'sign-in';
        document.getElementById('saas-email-error').textContent = '';
        renderSaasEmailMode();
      });
      document.getElementById('google-login-btn').addEventListener('click', async function() {
        if (!PS_GOOGLE_LOGIN_ENABLED) return;
        try {
          var response = await fetch('/api/auth/sign-in/social', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'google', callbackURL: '/app' }),
          });
          var data = await response.json();
          if (!response.ok || !data.url) throw new Error(data.message || 'Google 登录失败');
          location.href = data.url;
        } catch (err) {
          setFlash(String((err && err.message) || err), true);
        }
      });
      pwEl.addEventListener('keydown', function(evt) {
        if (evt.key === 'Enter') login();
      });
      window.addEventListener('blur', hidePreview);
      document.addEventListener('visibilitychange', function() {
        if (document.hidden) hidePreview();
      });

      applyStaticTranslations();
      if (PS_SAAS_MODE) {
        pwEl.parentElement.style.display = 'none';
        loginBtn.style.display = 'none';
        document.getElementById('saas-email-auth-form').style.display = 'grid';
        document.getElementById('menu-account').style.display = 'block';
        document.getElementById('login-help').textContent = t('saas_login_help');
        document.getElementById('google-login-btn').style.display = PS_GOOGLE_LOGIN_ENABLED ? 'inline-flex' : 'none';
        restoreSaasSession();
      } else if (state.pw) {
        loginEl.classList.add('hidden');
        appEl.classList.remove('hidden');
        loadInitialData().then(render).catch(function() {
          logout();
          setFlash(t('session_expired'), true);
        });
      }
    })();
  </script>
</body>
</html>`;
}

async function getEntryById(env: Env, id: string, ownerId?: string | null): Promise<EntryRow | null> {
  return env.DB.prepare(
    `SELECT id, filename, content_type, size, md5,
            COALESCE(version, 1) AS version, current_object_key,
            upload_time, COALESCE(updated_time, upload_time) AS updated_time, owner_id,
            expiration_time, note, guest_link_id
     FROM entries
     WHERE id = ?${ownerId ? " AND owner_id = ?" : ""}`,
  )
    .bind(...(ownerId ? [id, ownerId] : [id]))
    .first<EntryRow>();
}

async function getMultipartUploadById(env: Env, uploadId: string, ownerId?: string | null): Promise<MultipartUploadRow | null> {
  return env.DB.prepare(
    `SELECT upload_id, entry_id, filename, content_type, size, expiration_time, note, owner_id,
            is_update, expected_version, object_key, complete_token, complete_started_at, active_parts
     FROM multipart_uploads
     WHERE upload_id = ?${ownerId ? " AND owner_id = ?" : ""}`,
  )
    .bind(...(ownerId ? [uploadId, ownerId] : [uploadId]))
    .first<MultipartUploadRow>();
}

async function claimMultipartCompletion(
  env: Env,
  uploadId: string,
  ownerId: string | null,
  token: string,
  allowStaleAbortRecovery = false,
): Promise<boolean> {
  const ownerClause = ownerId ? " AND owner_id = ?" : "";
  // Normal completion never takes over another request's live claim. An owner
  // may recover a crashed completion through abort after a full day; that is
  // longer than a Worker request can remain active, and the token also fences
  // any late D1 commit from the abandoned request.
  const staleClaimClause = allowStaleAbortRecovery
    ? " OR complete_started_at < datetime('now', '-24 hours')"
    : "";
  const activePartsClause = allowStaleAbortRecovery
    ? "(active_parts = 0 OR active_parts_updated_at < datetime('now', '-24 hours'))"
    : "active_parts = 0";
  const resetStaleParts = allowStaleAbortRecovery ? ", active_parts = 0" : "";
  const values = ownerId
    ? [token, uploadId, ownerId]
    : [token, uploadId];
  const result = await env.DB.prepare(
    `UPDATE multipart_uploads
     SET complete_token = ?, complete_started_at = CURRENT_TIMESTAMP${resetStaleParts}
     WHERE upload_id = ?${ownerClause}
       AND ${activePartsClause}
       AND (complete_token IS NULL${staleClaimClause})`,
  ).bind(...values).run();
  return result.meta.changes === 1;
}

async function releaseMultipartCompletionClaim(env: Env, uploadId: string, token: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE multipart_uploads
     SET complete_token = NULL, complete_started_at = NULL
     WHERE upload_id = ? AND complete_token = ? AND active_parts = 0`,
  ).bind(uploadId, token).run();
}

async function cleanupMultipartUpload(
  env: Env,
  uploadId: string,
  objectKey: string,
  entryId: string,
  reservationOwnerId?: string,
  completionToken?: string,
  deleteCompletedObject = false,
): Promise<boolean> {
  if (!completionToken) return false;
  let ownsClaim = false;
  try {
    const refresh = await env.DB.prepare(
      `UPDATE multipart_uploads SET complete_started_at = CURRENT_TIMESTAMP
       WHERE upload_id = ? AND complete_token = ?`,
    ).bind(uploadId, completionToken).run();
    ownsClaim = refresh.meta.changes === 1;
  } catch { /* Keep the reservation and claim if D1 is unavailable. */ }
  if (!ownsClaim) return false;

  try {
    await env.DB.prepare("DELETE FROM multipart_upload_parts WHERE upload_id = ?").bind(uploadId).run();
  } catch {
    return false;
  }
  try { await env.BUCKET.resumeMultipartUpload(objectKey, uploadId).abort(); } catch { /* Completed uploads are already closed. */ }
  if (deleteCompletedObject) {
    try {
      const referenced = await env.DB.prepare(
        `SELECT
           EXISTS(SELECT 1 FROM entries WHERE id = ? AND COALESCE(current_object_key, id) = ?) OR
           EXISTS(SELECT 1 FROM file_versions WHERE object_key = ?) AS referenced`,
      ).bind(entryId, objectKey, objectKey).first<{ referenced: number }>();
      if (!referenced) return false;
      if (!referenced.referenced) await env.BUCKET.delete(objectKey);
    } catch {
      return false;
    }
  }

  const cleanupStatements = [env.DB.prepare(
    "DELETE FROM multipart_uploads WHERE upload_id = ? AND complete_token = ?",
  ).bind(uploadId, completionToken)];
  if (reservationOwnerId) {
    cleanupStatements.push(env.DB.prepare(
      `DELETE FROM saas_storage_reservations
       WHERE reservation_id = ? AND user_id = ?
         AND NOT EXISTS (SELECT 1 FROM multipart_uploads WHERE upload_id = ?)`,
    ).bind(uploadId, reservationOwnerId, uploadId));
  }
  try {
    // D1 removes the claim and any leftover reservation atomically. If the token
    // changed during cleanup, the new claim and its reservation remain intact.
    const results = await env.DB.batch(cleanupStatements);
    return results[0].meta.changes === 1;
  } catch { /* Leave the refreshed claim for a stale-upload retry. */ }
  return false;
}

function fileVersionObjectKey(entryId: string, version: number): string {
  return `${entryId}/versions/${version}`;
}

function newFileVersionObjectKey(entryId: string, version: number): string {
  return `${fileVersionObjectKey(entryId, version)}-${generateID()}`;
}

function currentObjectKey(entry: Pick<EntryRow, "id" | "current_object_key">): string {
  return entry.current_object_key || entry.id;
}

const HTML_FILE_PREVIEW_CSP = [
  // Render uploaded HTML prototypes and interactive pages inside an opaque-origin
  // sandbox. Scripts and cross-origin API connections are allowed, but the page
  // gets no same-origin access, form submission, nested frames, plugins, or base-URL override.
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline' http: https:",
  "style-src 'unsafe-inline' http: https:",
  "img-src data: blob: http: https:",
  "font-src data: http: https:",
  "media-src data: blob: http: https:",
  "connect-src http: https: ws: wss:",
  "form-action 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

function setSharedFileContentType(headers: Headers, entry: Pick<EntryRow, "filename" | "content_type">): void {
  const contentType = (entry.content_type || "").split(";")[0].trim().toLowerCase();
  const isHtml = /\.html?$/i.test(entry.filename) || contentType === "text/html";
  if (isHtml) {
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Content-Security-Policy", HTML_FILE_PREVIEW_CSP);
    headers.set("X-Content-Type-Options", "nosniff");
  } else if (entry.content_type) {
    headers.set("Content-Type", entry.content_type);
  }
}

async function getFileVersion(
  env: Env,
  entryId: string,
  version: number,
): Promise<FileVersionRow | null> {
  return env.DB.prepare(
    `SELECT entry_id, version, filename, content_type, size, md5, created_time, object_key
     FROM file_versions
     WHERE entry_id = ? AND version = ?`,
  )
    .bind(entryId, version)
    .first<FileVersionRow>();
}

async function snapshotCurrentFileVersion(env: Env, entry: EntryRow): Promise<FileVersionRow> {
  const currentVersion = Math.max(1, Number(entry.version || 1));
  const currentKey = currentObjectKey(entry);
  const existing = await getFileVersion(env, entry.id, currentVersion);
  if (existing) return existing;

  const object = await env.BUCKET.get(currentKey);
  if (!object || !object.body) throw new Error("current file content not found");
  const md5 = entry.md5 || await md5HexFromStream(object.body);

  const record = {
    entry_id: entry.id,
    version: currentVersion,
    filename: entry.filename,
    content_type: entry.content_type,
    size: entry.size,
    md5: md5,
    created_time: entry.upload_time,
    // Keep the current object as the version snapshot. Content updates replace
    // the entry's current_object_key, so the previous bytes remain addressable.
    object_key: currentKey,
  };
  await env.DB.prepare(
    `INSERT OR IGNORE INTO file_versions
      (entry_id, version, filename, content_type, size, md5, created_time, object_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(record.entry_id, record.version, record.filename, record.content_type, record.size, record.md5, record.created_time, record.object_key)
    .run();
  return (await getFileVersion(env, entry.id, currentVersion)) || record;
}

async function saveNewFileEntry(
  env: Env,
  entry: { id: string; filename: string; contentType: string; size: number; md5: string; expiration: string | null; note: string | null; ownerId: string },
  reservation?: { id: string; consumeBytes: number; final: boolean },
  completionClaim?: { uploadId: string; token: string },
): Promise<void> {
  const reservationGate = reservation
    ? `EXISTS (SELECT 1 FROM saas_storage_reservations
              WHERE reservation_id = ? AND user_id = ? AND reserved_bytes >= ?
                AND expires_at > CURRENT_TIMESTAMP)`
    : "1 = 1";
  const claimGate = completionClaim
    ? "EXISTS (SELECT 1 FROM multipart_uploads WHERE upload_id = ? AND complete_token = ?)"
    : "1 = 1";
  const gateSql = `(${reservationGate}) AND (${claimGate})`;
  const reservationValues = reservation
    ? [reservation.id, entry.ownerId, Math.max(0, Math.floor(reservation.consumeBytes))]
    : [];
  const claimValues = completionClaim ? [completionClaim.uploadId, completionClaim.token] : [];
  const gateValues = [...reservationValues, ...claimValues];
  const insertEntry = env.DB.prepare(
    `INSERT INTO entries
       (id, filename, content_type, size, md5, version, updated_time, expiration_time, note, owner_id)
     SELECT ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, ?, ?
     WHERE ${gateSql}`,
  ).bind(entry.id, entry.filename, entry.contentType, entry.size, entry.md5, entry.expiration, entry.note, entry.ownerId, ...gateValues);
  const insertVersion = env.DB.prepare(
    `INSERT INTO file_versions(entry_id, version, filename, content_type, size, md5, object_key)
     SELECT ?, 1, ?, ?, ?, ?, ?
     WHERE EXISTS (SELECT 1 FROM entries WHERE id = ?)
       AND ${gateSql}`,
  ).bind(entry.id, entry.filename, entry.contentType, entry.size, entry.md5, entry.id, entry.id, ...gateValues);
  const statements = [insertEntry, insertVersion];
  if (reservation?.final) {
    statements.push(env.DB.prepare(
      `DELETE FROM saas_storage_reservations
       WHERE reservation_id = ? AND user_id = ? AND reserved_bytes >= ? AND expires_at > CURRENT_TIMESTAMP
         AND EXISTS (SELECT 1 FROM entries WHERE id = ?)
         AND (${claimGate})`,
    ).bind(reservation.id, entry.ownerId, Math.max(0, Math.floor(reservation.consumeBytes)), entry.id, ...claimValues));
  } else if (reservation) {
    statements.push(env.DB.prepare(
      `UPDATE saas_storage_reservations SET reserved_bytes = reserved_bytes - ?
       WHERE reservation_id = ? AND user_id = ? AND reserved_bytes >= ? AND expires_at > CURRENT_TIMESTAMP
         AND EXISTS (SELECT 1 FROM entries WHERE id = ?)
         AND (${claimGate})`,
    ).bind(Math.max(0, Math.floor(reservation.consumeBytes)), reservation.id, entry.ownerId,
      Math.max(0, Math.floor(reservation.consumeBytes)), entry.id, ...claimValues));
  }
  const results = await env.DB.batch(statements);
  if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1 || (reservation && results[2].meta.changes !== 1)) {
    throw new Error("Could not commit file within the account storage quota");
  }
}

async function commitFileContentUpdate(
  env: Env,
  entry: EntryRow,
  contentType: string,
  size: number,
  md5: string,
  objectKey: string,
  expectedVersion = Math.max(1, Number(entry.version || 1)),
  reservation?: { id: string; ownerId: string; consumeBytes: number },
  completionClaim?: { uploadId: string; token: string },
): Promise<number> {
  const nextVersion = expectedVersion + 1;
  const reservationGate = reservation
    ? "AND EXISTS (SELECT 1 FROM saas_storage_reservations WHERE reservation_id = ? AND user_id = ? AND reserved_bytes >= ? AND expires_at > CURRENT_TIMESTAMP)"
    : "";
  const reservationValues = reservation ? [reservation.id, reservation.ownerId, Math.max(0, Math.floor(reservation.consumeBytes))] : [];
  const completionGate = completionClaim
    ? "AND EXISTS (SELECT 1 FROM multipart_uploads WHERE upload_id = ? AND complete_token = ?)"
    : "";
  const completionValues = completionClaim ? [completionClaim.uploadId, completionClaim.token] : [];
  const updateStatement = env.DB.prepare(
    `UPDATE entries
     SET content_type = ?, size = ?, md5 = ?, version = ?, current_object_key = ?, updated_time = CURRENT_TIMESTAMP
     WHERE id = ? AND COALESCE(version, 1) = ? ${reservationGate} ${completionGate}`,
  )
    .bind(contentType, size, md5, nextVersion, objectKey, entry.id, expectedVersion, ...reservationValues, ...completionValues);
  const versionStatement = env.DB.prepare(
    `INSERT INTO file_versions
      (entry_id, version, filename, content_type, size, md5, object_key)
     SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (
       SELECT 1 FROM entries WHERE id = ? AND COALESCE(version, 1) = ?
     ) ${reservationGate} ${completionGate}`,
  )
    .bind(entry.id, nextVersion, entry.filename, contentType, size, md5, objectKey, entry.id, nextVersion,
      ...reservationValues, ...completionValues);
  const statements = [updateStatement, versionStatement];
  if (reservation) {
    statements.push(env.DB.prepare(
      `DELETE FROM saas_storage_reservations
       WHERE reservation_id = ? AND user_id = ? AND reserved_bytes >= ? AND expires_at > CURRENT_TIMESTAMP
         AND EXISTS (SELECT 1 FROM entries WHERE id = ? AND COALESCE(version, 1) = ?)
         ${completionClaim ? "AND EXISTS (SELECT 1 FROM multipart_uploads WHERE upload_id = ? AND complete_token = ?)" : ""}`,
    ).bind(reservation.id, reservation.ownerId, Math.max(0, Math.floor(reservation.consumeBytes)),
      entry.id, nextVersion, ...completionValues));
  }
  const [updateResult, versionResult, reservationResult] = await env.DB.batch(statements);
  if (updateResult.meta.changes !== 1 || versionResult.meta.changes !== 1 || (reservation && reservationResult.meta.changes !== 1)) {
    throw new Error("file changed while updating; please reload and try again");
  }
  return nextVersion;
}

async function listFileVersions(env: Env, entry: EntryRow): Promise<FileVersionRow[]> {
  const existing = await env.DB.prepare(
    `SELECT entry_id, version, filename, content_type, size, md5, created_time, object_key
     FROM file_versions
     WHERE entry_id = ?
     ORDER BY version DESC`,
  )
    .bind(entry.id)
    .all<FileVersionRow>();

  if (existing.results.length > 0) return existing.results;

  const object = await env.BUCKET.get(currentObjectKey(entry));
  let md5 = entry.md5;
  if (object?.body) md5 = await md5HexFromStream(object.body);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO file_versions
      (entry_id, version, filename, content_type, size, md5, created_time, object_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(entry.id, Math.max(1, Number(entry.version || 1)), entry.filename, entry.content_type, entry.size, md5, entry.upload_time, entry.id)
    .run();
  if (!entry.md5 && md5) {
    await env.DB.prepare("UPDATE entries SET md5 = ? WHERE id = ?").bind(md5, entry.id).run();
  }

  const refreshed = await env.DB.prepare(
    `SELECT entry_id, version, filename, content_type, size, md5, created_time, object_key
     FROM file_versions
     WHERE entry_id = ?
     ORDER BY version DESC`,
  )
    .bind(entry.id)
    .all<FileVersionRow>();
  return refreshed.results;
}

export function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() <= Date.now();
}

async function rejectExpiredEntry(env: Env, entry: EntryRow): Promise<Response | null> {
  if (!isExpired(entry.expiration_time)) return null;
  await deleteEntryById(env, entry.id);
  return json({ error: "file expired" }, 410);
}

export function parseDateFromUnknown(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clipboardKey(slug: string, ownerId?: string | null): string {
  return ownerId
    ? `${CLIPBOARD_KEY_PREFIX}saas:${ownerId}:${slug}`
    : `${CLIPBOARD_KEY_PREFIX}${slug}`;
}

export function sanitizeClipboardSlug(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > 64) return null;

  const normalized = trimmed
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (!normalized) return null;
  if (normalized.startsWith("-") || normalized.endsWith("-")) return null;
  if (RESERVED_CLIPBOARD_SLUGS.has(normalized)) return null;

  const slugPattern = /^[\p{L}\p{N}_-]+$/u;
  if (!slugPattern.test(normalized)) return null;
  return normalized;
}

export function calculateClipboardStats(content: string): {
  itemCount: number;
  lineCount: number;
  charCount: number;
} {
  const text = String(content || "");
  const trimmed = text.trim();
  if (!trimmed) {
    return { itemCount: 0, lineCount: 0, charCount: 0 };
  }
  const lines = text.split(/\r?\n/);
  return {
    itemCount: lines.filter((line) => line.trim() !== "").length,
    lineCount: lines.length,
    charCount: text.length,
  };
}

export function normalizeClipboardPassword(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  if (value.length > 128) return null;
  return value;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyClipboardPassword(hash: string, password: string): Promise<boolean> {
  return (await sha256Hex(password)) === hash;
}

export function clipboardPasswordStorageKey(slug: string): string {
  return `ps_clip_pw_${encodeURIComponent(slug)}`;
}

async function authorizeClipboardRequest(
  request: Request,
  record: ClipboardRecord | null,
): Promise<{ ok: boolean; normalized: string | null }> {
  if (!record?.passwordHash) return { ok: true, normalized: null };
  const provided = normalizeClipboardPassword(request.headers.get("x-clip-password"));
  if (!provided) return { ok: false, normalized: null };
  const ok = await verifyClipboardPassword(record.passwordHash, provided);
  return { ok, normalized: provided };
}

type SaasClipboardMapping = { owner_id: string; slug: string; public_id: string };

async function getSaasClipboardMapping(
  env: Env,
  ownerId: string,
  slug: string,
): Promise<SaasClipboardMapping | null> {
  return env.DB.prepare(
    "SELECT owner_id, slug, public_id FROM saas_clipboards WHERE owner_id = ? AND slug = ?",
  ).bind(ownerId, slug).first<SaasClipboardMapping>();
}

async function ensureSaasClipboardMapping(
  env: Env,
  ownerId: string,
  slug: string,
  maxClipboards: number | null = null,
): Promise<SaasClipboardMapping | null> {
  const current = await getSaasClipboardMapping(env, ownerId, slug);
  if (current) return current;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO saas_clipboards(owner_id, slug, public_id)
     SELECT ?, ?, ?
     WHERE ? IS NULL OR (SELECT COUNT(*) FROM saas_clipboards WHERE owner_id = ?) < ?`,
  ).bind(ownerId, slug, crypto.randomUUID().replaceAll("-", ""), maxClipboards, ownerId, maxClipboards).run();
  const mapping = await getSaasClipboardMapping(env, ownerId, slug);
  if (!mapping && maxClipboards === null) throw new Error("Could not create clipboard mapping");
  return mapping;
}

async function getClipboardRecord(env: Env, slug: string, ownerId?: string | null): Promise<ClipboardRecord | null> {
  return env.CLIPBOARD.get(clipboardKey(slug, ownerId), "json");
}

async function listClipboards(env: Env, ownerId?: string | null): Promise<ClipboardSummary[]> {
  const source = ownerId
    ? (await env.DB.prepare("SELECT owner_id, slug, public_id FROM saas_clipboards WHERE owner_id = ? ORDER BY created_at DESC")
        .bind(ownerId).all<SaasClipboardMapping>()).results
    : (await env.CLIPBOARD.list({ prefix: CLIPBOARD_KEY_PREFIX, limit: 1000 })).keys.map((entry) => ({
        owner_id: "",
        slug: entry.name.slice(CLIPBOARD_KEY_PREFIX.length),
        public_id: "",
      }));
  const records: Array<ClipboardSummary | null> = await Promise.all(
    source.map(async (entry) => {
      const record = await getClipboardRecord(env, entry.slug, ownerId);
      if (!record) return null;
      const stats = calculateClipboardStats(record.content);
      return {
        slug: record.slug,
        publicId: entry.public_id || record.publicId,
        updatedAt: record.updatedAt,
        charCount: stats.charCount,
        itemCount: stats.itemCount,
        hasPassword: Boolean(record.passwordHash),
      };
    }),
  );
  return records
    .filter((row): row is ClipboardSummary => Boolean(row))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function getGuestLinkById(env: Env, id: string, ownerId?: string | null): Promise<GuestLinkRow | null> {
  return env.DB.prepare(
    `SELECT id, label, created_time, max_file_bytes, max_file_lifetime_days, max_file_uploads,
            url_expires, upload_count, owner_id
     FROM guest_links WHERE id = ?${ownerId ? " AND owner_id = ?" : ""}`,
  )
    .bind(...(ownerId ? [id, ownerId] : [id]))
    .first<GuestLinkRow>();
}

async function reserveGuestUploadSlots(env: Env, guestId: string, count: number): Promise<boolean> {
  const amount = Math.max(1, Math.floor(count));
  const result = await env.DB.prepare(
    `UPDATE guest_links
     SET upload_count = COALESCE(upload_count, 0) + ?
     WHERE id = ?
       AND (COALESCE(max_file_uploads, 0) <= 0 OR COALESCE(upload_count, 0) + ? <= max_file_uploads)
       AND (url_expires IS NULL OR julianday(url_expires) > julianday('now'))`,
  ).bind(amount, guestId, amount).run();
  return Number(result.meta.changes || 0) === 1;
}

async function releaseGuestUploadSlots(env: Env, guestId: string, count: number): Promise<void> {
  const amount = Math.max(1, Math.floor(count));
  await env.DB.prepare(
    "UPDATE guest_links SET upload_count = MAX(COALESCE(upload_count, 0) - ?, 0) WHERE id = ?",
  ).bind(amount, guestId).run();
}

async function deleteEntryById(env: Env, id: string): Promise<void> {
  const [versions, currentRows] = await Promise.all([
    env.DB.prepare(
    "SELECT object_key FROM file_versions WHERE entry_id = ?",
    ).bind(id).all<{ object_key: string }>(),
    env.DB.prepare("SELECT current_object_key FROM entries WHERE id = ? LIMIT 1")
      .bind(id).all<{ current_object_key: string | null }>(),
  ]);
  const objectKeys = new Set(
    versions.results
      .map((version) => version.object_key)
      .filter((objectKey): objectKey is string => Boolean(objectKey) && objectKey !== id),
  );
  const currentObjectKey = currentRows.results[0]?.current_object_key;
  if (currentObjectKey && currentObjectKey !== id) objectKeys.add(currentObjectKey);
  for (const objectKey of objectKeys) await env.BUCKET.delete(objectKey);
  await env.BUCKET.delete(id);
  await env.DB.prepare("DELETE FROM download_events WHERE entry_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM file_versions WHERE entry_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(id).run();
}

type AdminActor = { userId: string; email: string };
type AdminTargetUser = { id: string; name: string | null; email: string };

function isProtectedAdminEmail(env: Env, email: string): boolean {
  return isSaasSuperadmin(email, env.SAAS_SUPERADMIN_EMAILS);
}

async function recordAdminAction(
  env: Env,
  actor: AdminActor,
  target: AdminTargetUser,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO admin_action_audit
      (id, actor_user_id, actor_email, target_user_id, target_email, action, details_json, status, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', CURRENT_TIMESTAMP)`,
  ).bind(
    crypto.randomUUID(), actor.userId, actor.email, target.id, target.email,
    action, JSON.stringify(details),
  ).run();
}

async function deleteSaasUserData(
  env: Env,
  actor: AdminActor,
  target: AdminTargetUser,
): Promise<boolean> {
  let auditId = await env.DB.prepare(
    `SELECT id FROM admin_action_audit
     WHERE target_user_id = ? AND action = 'delete_user' AND status = 'started'
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(target.id).first<{ id: string }>().then((row) => row?.id || null);
  if (!auditId) auditId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO deleted_saas_users(user_id, email, deleted_by_user_id, deleted_by_email)
       VALUES (?, ?, ?, ?)`,
    ).bind(target.id, target.email, actor.userId, actor.email),
    env.DB.prepare(
      `INSERT OR IGNORE INTO admin_action_audit
        (id, actor_user_id, actor_email, target_user_id, target_email, action, details_json, status)
       VALUES (?, ?, ?, ?, ?, 'delete_user', '{}', 'started')`,
    ).bind(auditId, actor.userId, actor.email, target.id, target.email),
  ]);

  // R2, multipart uploads and KV cannot participate in a D1 transaction. Keep
  // the auth and account rows until these resources are removed so a retry can
  // resume cleanup if a provider request fails.
  const entries = await env.DB.prepare(
    "SELECT id FROM entries WHERE owner_id = ? ORDER BY id LIMIT 10",
  ).bind(target.id).all<{ id: string }>();
  for (const entry of entries.results) await deleteEntryById(env, entry.id);
  if (entries.results.length) return false;

  const uploads = await env.DB.prepare(
    "SELECT upload_id, entry_id, object_key FROM multipart_uploads WHERE owner_id = ? ORDER BY upload_id LIMIT 10",
  ).bind(target.id).all<{ upload_id: string; entry_id: string; object_key: string | null }>();
  for (const upload of uploads.results) {
    const cleanupToken = generateID();
    if (!(await claimMultipartCompletion(env, upload.upload_id, target.id, cleanupToken, true))) return false;
    const removed = await cleanupMultipartUpload(
      env, upload.upload_id, upload.object_key || upload.entry_id, upload.entry_id,
      target.id, cleanupToken, true,
    );
    if (!removed) return false;
  }
  if (uploads.results.length) return false;

  const clipboardPage = await env.CLIPBOARD.list({ prefix: `clipboard:saas:${target.id}:`, limit: 100 });
  if (clipboardPage.keys.length) {
    await Promise.all(clipboardPage.keys.map((key) => env.CLIPBOARD.delete(key.name)));
    return false;
  }

  const settingsPrefix = `${target.id}:`;
  const statements = [
    env.DB.prepare("DELETE FROM multipart_upload_parts WHERE upload_id IN (SELECT upload_id FROM multipart_uploads WHERE owner_id = ?)").bind(target.id),
    env.DB.prepare("DELETE FROM multipart_uploads WHERE owner_id = ?").bind(target.id),
    env.DB.prepare("DELETE FROM guest_links WHERE owner_id = ?").bind(target.id),
    env.DB.prepare("DELETE FROM saas_clipboards WHERE owner_id = ?").bind(target.id),
    env.DB.prepare("DELETE FROM settings WHERE key IN (?, ?)").bind(`${settingsPrefix}store_forever`, `${settingsPrefix}default_expiration_days`),
    env.DB.prepare("DELETE FROM download_events WHERE entry_id IN (SELECT id FROM entries WHERE owner_id = ?)").bind(target.id),
    env.DB.prepare("DELETE FROM file_versions WHERE entry_id IN (SELECT id FROM entries WHERE owner_id = ?)").bind(target.id),
    env.DB.prepare("DELETE FROM entries WHERE owner_id = ?").bind(target.id),
    env.DB.prepare("DELETE FROM apikey WHERE referenceId = ?").bind(target.id),
    env.DB.prepare('DELETE FROM "session" WHERE userId = ?').bind(target.id),
    env.DB.prepare('DELETE FROM "account" WHERE userId = ?').bind(target.id),
    env.DB.prepare("DELETE FROM verification WHERE identifier = ? OR value = ?").bind(target.email, target.id),
    env.DB.prepare("DELETE FROM admin_pro_grant_audit WHERE user_id = ?").bind(target.id),
    env.DB.prepare("DELETE FROM admin_pro_grants WHERE user_id = ?").bind(target.id),
    env.DB.prepare("DELETE FROM billing_checkout_attempts WHERE user_id = ?").bind(target.id),
    env.DB.prepare("DELETE FROM monthly_usage WHERE user_id = ?").bind(target.id),
    env.DB.prepare("DELETE FROM saas_storage_reservations WHERE user_id = ?").bind(target.id),
    env.DB.prepare("DELETE FROM billing_accounts WHERE user_id = ?").bind(target.id),
    env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(target.id),
    env.DB.prepare("UPDATE admin_action_audit SET status = 'completed', details_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(JSON.stringify({ cleanup: "complete" }), auditId),
  ];
  await env.DB.batch(statements);
  return true;
}

export async function cleanupExpiredEntries(
  env: Env,
  nowIso = new Date().toISOString(),
  limit = 100,
): Promise<number> {
  const res = await env.DB.prepare(
    `SELECT id
     FROM entries
     WHERE expiration_time IS NOT NULL
       AND expiration_time <= ?
     ORDER BY expiration_time ASC
     LIMIT ?`,
  )
    .bind(nowIso, Math.max(1, Math.min(1000, limit)))
    .all<{ id: string }>();

  const ids = res.results.map((r) => r.id);
  for (const id of ids) {
    await deleteEntryById(env, id);
  }
  return ids.length;
}

let lastExpiredCleanupAt = 0;
async function maybeCleanupExpiredEntries(env: Env): Promise<void> {
  const now = Date.now();
  if (now - lastExpiredCleanupAt < 60_000) return;
  lastExpiredCleanupAt = now;
  try {
    await cleanupExpiredEntries(env);
  } catch {
    // Don't fail requests if cleanup fails; retry next interval.
    lastExpiredCleanupAt = 0;
  }
}

type GuestLang = "en" | "zh";

const GUEST_I18N: Record<
  GuestLang,
  {
    page_title: string;
    back_home: string;
    switch_lang: string;
    guest_link: string;
    hint_prefix: string;
    max_mb: string;
    unlimited_size: string;
    uploads: string;
    unlimited_uploads: string;
    file_exp_days: string;
    default_exp: string;
    url_expires: string;
    url_never: string;
    files: string;
    drop_choose: string;
    drop_support: string;
    no_files: string;
    or_paste: string;
    paste_placeholder: string;
    note_optional: string;
    upload: string;
    upload_limit_reached: string;
    select_or_paste_first: string;
    upload_limit_exceeded: string;
    file_too_large: string;
    uploaded_files: string;
    upload_wait: string;
  }
> = {
  en: {
    page_title: "Guest Upload - PicoShare",
    back_home: "← Back to PicoShare",
    switch_lang: "中文",
    guest_link: "Guest link",
    hint_prefix: "Upload a file without signing in. Limits:",
    max_mb: "max {size} MB",
    unlimited_size: "unlimited size",
    uploads: "uploads {used}/{max}",
    unlimited_uploads: "unlimited uploads",
    file_exp_days: "file expiration {days} days",
    default_exp: "default expiration",
    url_expires: "URL expires {date}",
    url_never: "URL never expires",
    files: "Files",
    drop_choose: "Drop files here or click to choose",
    drop_support: "Supports drag and drop and batch upload",
    no_files: "No files selected",
    or_paste: "Or paste text",
    paste_placeholder: "Paste plain text and it will be uploaded as a .txt file",
    note_optional: "Note (optional)",
    upload: "Upload",
    upload_limit_reached: "Upload limit reached for this guest link.",
    select_or_paste_first: "Select a file or paste text first.",
    upload_limit_exceeded: "Upload limit exceeded. You can upload {left} more file(s).",
    file_too_large: "File \"{name}\" is too large. Max allowed is {max} MB.",
    uploaded_files: "Uploaded {count} file(s). URL(s): {urls}{suffix}",
    upload_wait: "Uploading, please wait...",
  },
  zh: {
    page_title: "访客上传 - PicoShare",
    back_home: "← 返回 PicoShare",
    switch_lang: "EN",
    guest_link: "访客链接",
    hint_prefix: "无需登录即可上传文件。限制：",
    max_mb: "最大 {size} MB",
    unlimited_size: "大小不限",
    uploads: "上传次数 {used}/{max}",
    unlimited_uploads: "上传次数不限",
    file_exp_days: "文件保留 {days} 天",
    default_exp: "默认过期策略",
    url_expires: "链接过期 {date}",
    url_never: "链接永不过期",
    files: "文件",
    drop_choose: "拖拽文件到这里，或点击选择",
    drop_support: "支持拖拽和批量上传",
    no_files: "未选择文件",
    or_paste: "或粘贴文本",
    paste_placeholder: "粘贴纯文本后将上传为 .txt 文件",
    note_optional: "备注（可选）",
    upload: "上传",
    upload_limit_reached: "该访客链接已达到上传次数上限。",
    select_or_paste_first: "请先选择文件或粘贴文本。",
    upload_limit_exceeded: "超出上传限制，你还可以上传 {left} 个文件。",
    file_too_large: "文件“{name}”过大，最大允许 {max} MB。",
    uploaded_files: "成功上传 {count} 个文件。URL：{urls}{suffix}",
    upload_wait: "正在上传，请稍候...",
  },
};

function normalizeGuestLang(value: string | null): GuestLang {
  return value === "zh" ? "zh" : "en";
}

function guestText(lang: GuestLang, key: keyof (typeof GUEST_I18N)["en"], vars: Record<string, string | number> = {}): string {
  const template = GUEST_I18N[lang][key];
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

function guestUploadPage(link: GuestLinkRow, message: string | null, isError: boolean, lang: GuestLang): string {
  const tr = GUEST_I18N[lang];
  const title = link.label || `${tr.guest_link} ${link.id}`;
  const infoParts = [
    link.max_file_bytes ? guestText(lang, "max_mb", { size: Math.round(link.max_file_bytes / (1024 * 1024)) }) : tr.unlimited_size,
    link.max_file_uploads ? guestText(lang, "uploads", { used: link.upload_count || 0, max: link.max_file_uploads }) : tr.unlimited_uploads,
    link.max_file_lifetime_days ? guestText(lang, "file_exp_days", { days: link.max_file_lifetime_days }) : tr.default_exp,
    link.url_expires ? guestText(lang, "url_expires", { date: link.url_expires.slice(0, 10) }) : tr.url_never,
  ];
  const flash = message ? `<div class="flash ${isError ? "err" : "ok"}">${escapeHtml(message)}</div>` : "";
  const nextLang = lang === "en" ? "zh" : "en";

  return `<!doctype html>
<html lang="${lang === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>${escapeHtml(tr.page_title)}</title>
  <style>
    body {
      margin: 0;
      font-family: "Avenir Next", "SF Pro Text", "Segoe UI", sans-serif;
      color: #2f4161;
      background:
        radial-gradient(circle at 18% 86%, rgba(68, 95, 255, 0.5), transparent 30%),
        radial-gradient(circle at 80% 30%, rgba(243, 173, 233, 0.6), transparent 30%),
        radial-gradient(circle at 55% 50%, rgba(255, 255, 255, 0.7), transparent 42%),
        linear-gradient(145deg, #f7f9ff, #eef1f8);
      min-height: 100vh;
      padding: 22px;
      box-sizing: border-box;
    }
    .wrap {
      max-width: 1140px;
      margin: 0 auto;
      padding: 16px 36px 28px;
    }
    .top-nav {
      margin: 0 0 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #2b5cc9;
      text-decoration: none;
      border: 1px solid rgba(43, 92, 201, 0.35);
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 14px;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.35);
      transition: transform 0.2s ease, background 0.2s ease;
    }
    .back-link:hover {
      transform: translateY(-1px);
      background: rgba(255, 255, 255, 0.6);
    }
    h1 { margin: 0 0 8px; font-size: 50px; letter-spacing: 0.2px; }
    .hint { color: #6f7d94; margin: 0 0 18px; line-height: 1.5; max-width: 880px; }
    .flash { margin: 0 0 14px; border: 1px solid; border-radius: 12px; padding: 10px 12px; font-size: 14px; backdrop-filter: blur(10px); }
    .ok { background: #e8f7f1; color: #1f6b53; border-color: #8dd8bf; }
    .err { background: #fdeef2; color: #942946; border-color: #f3a9bc; }
    label { display: block; margin: 10px 0 6px; font-weight: 600; color: #4e5d77; }
    input, textarea {
      width: 100%;
      border: 1px solid rgba(255,255,255,0.72);
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 16px;
      box-sizing: border-box;
      background: rgba(255,255,255,0.36);
      color: #40506a;
      outline: none;
      backdrop-filter: blur(10px);
    }
    input:focus, textarea:focus {
      border-color: rgba(16, 27, 114, 0.42);
      box-shadow: 0 0 0 3px rgba(16, 27, 114, 0.12);
    }
    textarea { min-height: 150px; resize: vertical; }
    .drop-zone {
      margin-top: 6px;
      min-height: 210px;
      border: 2px dashed rgba(148, 166, 196, 0.55);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.24);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
      padding: 18px;
      color: #4d6081;
    }
    .drop-zone.dragover {
      border-color: rgba(34, 130, 255, 0.95);
      background: rgba(207, 231, 255, 0.38);
      box-shadow: inset 0 0 0 2px rgba(53, 143, 255, 0.15);
    }
    .dz-primary { font-size: 18px; font-weight: 700; }
    .dz-secondary { font-size: 13px; color: #6f7d94; }
    .dz-list {
      margin-top: 6px;
      width: 100%;
      max-width: 760px;
      font-size: 13px;
      color: #3f5a9b;
      max-height: 84px;
      overflow: auto;
      text-align: left;
      border: 1px solid rgba(255,255,255,0.52);
      border-radius: 10px;
      padding: 8px 10px;
      background: rgba(255,255,255,0.35);
      white-space: pre-line;
    }
    .actions {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
    }
    .busy-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(17, 24, 39, 0.42);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 95;
      backdrop-filter: blur(2px);
    }
    .busy-card {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.8);
      border-radius: 14px;
      padding: 12px 18px;
      color: #334766;
      font-weight: 700;
      box-shadow: 0 10px 34px rgba(28, 45, 78, 0.25);
    }
    .busy-spinner {
      width: 20px;
      height: 20px;
      border-radius: 999px;
      border: 3px solid rgba(50, 142, 207, 0.25);
      border-top-color: #328ecf;
      animation: busy-spin 0.85s linear infinite;
    }
    @keyframes busy-spin {
      to { transform: rotate(360deg); }
    }
    button[type="submit"] {
      background: transparent;
      position: relative;
      padding: 8px 18px;
      display: inline-flex;
      align-items: center;
      font-size: 16px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid rgb(40, 144, 241);
      border-radius: 25px;
      outline: none;
      overflow: hidden;
      color: rgb(40, 144, 241);
      transition: color 0.3s 0.1s ease-out, transform 0.2s ease;
      text-align: center;
      min-width: 140px;
      justify-content: center;
      z-index: 1;
    }
    button[type="submit"]::before {
      position: absolute;
      top: 0;
      left: -5em;
      right: 0;
      bottom: 0;
      margin: auto;
      content: '';
      border-radius: 50%;
      display: block;
      width: 20em;
      height: 20em;
      text-align: center;
      transition: box-shadow 0.5s ease-out;
      z-index: -1;
    }
    button[type="submit"]:hover {
      color: #fff;
      transform: translateY(-1px);
    }
    button[type="submit"]:hover::before {
      box-shadow: inset 0 0 0 10em rgb(40, 144, 241);
    }
    .hidden { display: none !important; }
    @media (max-width: 980px) {
      .wrap { padding: 8px 12px 24px; }
      h1 { font-size: 34px; }
      .drop-zone { min-height: 170px; }
    }
    body { padding: 0 24px; color: #111; background: #f6f5f4; font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .wrap { max-width: 1280px; padding: 16px 0 28px; }
    .back-link { color: #0075de; border: 0; border-radius: 8px; background: #e6f3fe; }
    .back-link:hover { background: #d8edfc; transform: none; }
    .top-nav .back-link:first-child::before { content: ""; display: inline-block; flex: 0 0 22px; width: 22px; height: 22px; background: url("/favicon.svg") center / contain no-repeat; }
    h1 { color: #111; font-size: clamp(40px,4.5vw,56px); font-weight: 600; line-height: 1.08; letter-spacing: -.04em; }
    .hint { color: #615d59; }
    .flash { border-radius: 8px; backdrop-filter: none; }
    label { color: #615d59; }
    input, textarea { color: #111; border-color: rgba(0,0,0,.16); border-radius: 8px; background: #fff; backdrop-filter: none; }
    input:focus, textarea:focus { border-color: #0075de; box-shadow: 0 0 0 3px rgba(0,117,222,.12); }
    .drop-zone { color: #111; border-color: rgba(0,0,0,.2); border-radius: 12px; background: #fff; }
    .drop-zone.dragover { border-color: #0075de; background: #e6f3fe; box-shadow: none; }
    .dz-secondary { color: #615d59; }
    .dz-list { color: #615d59; border-color: rgba(0,0,0,.08); border-radius: 8px; background: #f6f5f4; }
    button[type="submit"] { color: #fff; border: 1px solid #0075de; border-radius: 8px; background: #0075de; transition: background-color .2s ease; }
    button[type="submit"]::before { display: none; }
    button[type="submit"]:hover { color: #fff; background: #0068c7; transform: none; }
    .busy-card { color: #111; border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.1); }
    .busy-spinner { border-color: rgba(0,117,222,.18); border-top-color: #0075de; }
    @media (max-width: 980px) { body { padding: 0 16px; } .wrap { padding: 16px 0 24px; } }
    @media (max-width: 600px) { body { font-size: 16px; line-height: 1.6; } h1 { font-size: clamp(30px, 8vw, 38px); line-height: 1.12; } h2 { font-size: 23px; } .hint, label, input, button, .flash { font-size: 15px; } .wrap { padding: 14px 0 22px; } }
    @media (max-width: 360px) { body { padding: 0 12px; } h1 { font-size: 29px; } }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="top-nav">
      <a class="back-link" href="/">${escapeHtml(tr.back_home)}</a>
      <a class="back-link" href="?lang=${nextLang}">${escapeHtml(tr.switch_lang)}</a>
    </div>
    <h1>${escapeHtml(title)}</h1>
    <p class="hint">${escapeHtml(tr.hint_prefix)} ${escapeHtml(infoParts.join(" • "))}.</p>
    ${flash}
    <form id="guest-form" method="post" enctype="multipart/form-data">
      <input type="hidden" name="lang" value="${lang}" />
      <label for="files">${escapeHtml(tr.files)}</label>
      <input id="files" name="files" type="file" multiple class="hidden" />
      <div id="drop-zone" class="drop-zone" role="button" tabindex="0" aria-label="${escapeHtml(tr.drop_choose)}">
        <div class="dz-primary">${escapeHtml(tr.drop_choose)}</div>
        <div class="dz-secondary">${escapeHtml(tr.drop_support)}</div>
        <div id="file-list" class="dz-list">${escapeHtml(tr.no_files)}</div>
      </div>
      <label for="pastedText">${escapeHtml(tr.or_paste)}</label>
      <textarea id="pastedText" name="pastedText" placeholder="${escapeHtml(tr.paste_placeholder)}"></textarea>
      <label for="note">${escapeHtml(tr.note_optional)}</label>
      <input id="note" name="note" type="text" maxlength="240" />
      <div class="actions"><button type="submit">${escapeHtml(tr.upload)}</button></div>
    </form>
  </main>
  <div id="guest-busy" class="busy-backdrop hidden" aria-live="polite" aria-busy="true">
    <div class="busy-card">
      <span class="busy-spinner" aria-hidden="true"></span>
      <span>${escapeHtml(tr.upload_wait)}</span>
    </div>
  </div>
  <script>
    (function() {
      var form = document.getElementById('guest-form');
      var filesInput = document.getElementById('files');
      var dropZone = document.getElementById('drop-zone');
      var fileList = document.getElementById('file-list');
      var guestBusy = document.getElementById('guest-busy');
      var selectedFiles = [];
      var uploading = false;

      function syncFileList() {
        if (!selectedFiles.length) {
          fileList.textContent = ${JSON.stringify(tr.no_files)};
          return;
        }
        fileList.textContent = selectedFiles.map(function(f, idx) {
          return (idx + 1) + '. ' + f.name;
        }).join('\\n');
      }

      filesInput.addEventListener('change', function() {
        selectedFiles = Array.from(filesInput.files || []);
        syncFileList();
      });

      dropZone.addEventListener('click', function() { filesInput.click(); });
      dropZone.addEventListener('keydown', function(evt) {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          filesInput.click();
        }
      });

      ['dragenter', 'dragover'].forEach(function(type) {
        dropZone.addEventListener(type, function(evt) {
          evt.preventDefault();
          dropZone.classList.add('dragover');
        });
      });
      ['dragleave', 'dragend'].forEach(function(type) {
        dropZone.addEventListener(type, function(evt) {
          evt.preventDefault();
          dropZone.classList.remove('dragover');
        });
      });
      dropZone.addEventListener('drop', function(evt) {
        evt.preventDefault();
        dropZone.classList.remove('dragover');
        var files = Array.from((evt.dataTransfer && evt.dataTransfer.files) || []);
        if (files.length) {
          selectedFiles = files;
          syncFileList();
        }
      });

      form.addEventListener('submit', function(evt) {
        evt.preventDefault();
        if (uploading) return;
        uploading = true;
        guestBusy.classList.remove('hidden');
        var fd = new FormData();
        if (selectedFiles.length) {
          selectedFiles.forEach(function(f) { fd.append('files', f); });
        } else if (filesInput.files && filesInput.files.length) {
          Array.from(filesInput.files).forEach(function(f) { fd.append('files', f); });
        }
        fd.append('lang', ${JSON.stringify(lang)});
        var pastedText = document.getElementById('pastedText').value.trim();
        var note = document.getElementById('note').value.trim();
        if (pastedText) fd.append('pastedText', pastedText);
        if (note) fd.append('note', note);
        fetch(location.href, { method: 'POST', body: fd })
          .then(function(r) { return r.text(); })
          .then(function(html) {
            document.open();
            document.write(html);
            document.close();
          })
          .catch(function() {
            uploading = false;
            guestBusy.classList.add('hidden');
          });
      });
    })();
  </script>
</body>
</html>`;
}

function clipboardListPage(_saasMode = false): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>Clip Notes | PicoShare</title>
  <style>
    :root {
      --bg: #eef1f8;
      --bg-2: #f7f9ff;
      --text: #26354d;
      --muted: #6f7d94;
      --line: rgba(255, 255, 255, 0.68);
      --line-soft: rgba(145, 158, 185, 0.25);
      --primary: #328ecf;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Avenir Next", "SF Pro Text", "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 18% 86%, rgba(68, 95, 255, 0.5), transparent 30%),
        radial-gradient(circle at 80% 30%, rgba(243, 173, 233, 0.6), transparent 30%),
        radial-gradient(circle at 55% 50%, rgba(255, 255, 255, 0.7), transparent 42%),
        linear-gradient(145deg, var(--bg-2), var(--bg));
      min-height: 100vh;
      padding: 18px;
    }
    .wrap { max-width: 1140px; margin: 0 auto; }
    .head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 14px;
      padding: 2px 2px 8px;
    }
    .head-right { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
    h1 { margin: 0; font-size: 44px; letter-spacing: 0.2px; }
    .new { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    input {
      border: 1px solid rgba(255, 255, 255, 0.7);
      border-radius: 12px;
      padding: 11px 14px;
      min-width: 280px;
      font-size: 15px;
      background: rgba(255, 255, 255, 0.36);
      color: #40506a;
      outline: none;
      backdrop-filter: blur(10px);
    }
    input:focus {
      border-color: rgba(16, 27, 114, 0.42);
      box-shadow: 0 0 0 3px rgba(16, 27, 114, 0.12);
    }
    button {
      background: transparent;
      position: relative;
      padding: 8px 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--primary);
      border-radius: 12px;
      overflow: hidden;
      color: var(--primary);
      transition: color 0.3s ease, transform 0.2s ease;
      min-height: 42px;
    }
    button:hover { color: #fff; transform: translateY(-1px); }
    button::before {
      position: absolute;
      inset: 0;
      content: "";
      border-radius: inherit;
      background: var(--primary);
      transform: scaleX(0);
      transform-origin: left center;
      transition: transform 0.3s ease-out;
      z-index: -1;
    }
    button:hover::before { transform: scaleX(1); }
    .card {
      border: 1px solid rgba(255, 255, 255, 0.5);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(10px);
      overflow: hidden;
    }
    .bulk-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin: 0 0 12px; }
    .bulk-toolbar[hidden] { display: none; }
    .selection-cell { width: 44px; text-align: center; }
    table input[type="checkbox"] { width: 16px; height: 16px; min-width: 16px; margin: 0; padding: 0; accent-color: var(--primary); cursor: pointer; }
    table { width: 100%; border-collapse: collapse; font-size: 15px; background: rgba(255, 255, 255, 0.2); }
    th, td {
      padding: 12px 12px;
      border-bottom: 1px solid var(--line-soft);
      text-align: left;
      vertical-align: middle;
    }
    th { color: #43536f; font-weight: 700; font-size: 14px; }
    .muted { color: var(--muted); }
    a { color: #2b5cc9; text-decoration: none; font-weight: 600; }
    @media (max-width: 980px) {
      body { padding: 10px; }
      .head { align-items: flex-start; flex-direction: column; }
      .head-right { justify-content: flex-start; width: 100%; }
      h1 { font-size: 34px; }
      input { min-width: 0; }
    }
    :root { --bg: #f6f5f4; --bg-2: #f6f5f4; --text: #111; --muted: #615d59; --line: rgba(0,0,0,.08); --line-soft: rgba(0,0,0,.08); --primary: #0075de; }
    body { padding: 0 24px; color: #111; background: #f6f5f4; font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .wrap { max-width: 1280px; }
    .head { padding: 22px 0 12px; }
    .page-nav { display: inline-flex; align-items: center; gap: 8px; }
    .page-nav a { display: inline-flex; align-items: center; min-height: 40px; padding: 0 13px; border-radius: 8px; color: #0075de; background: #e6f3fe; font-size: 14px; font-weight: 600; text-decoration: none; }
    .page-nav a:hover { background: #d8edfc; }
    h1 { color: #111; font-size: clamp(40px,4.5vw,56px); font-weight: 600; line-height: 1.08; letter-spacing: -.04em; }
    input { color: #111; border-color: rgba(0,0,0,.16); border-radius: 8px; background: #fff; backdrop-filter: none; }
    input:focus { border-color: #0075de; box-shadow: 0 0 0 3px rgba(0,117,222,.12); }
    button { color: #0075de; border: 1px solid transparent; border-radius: 8px; background: #e6f3fe; transition: color .2s ease, background-color .2s ease; }
    button::before { display: none; }
    button:hover { color: #005fb8; background: #d8edfc; transform: none; }
    #go { color: #fff; background: #0075de; }
    #go:hover { color: #fff; background: #0068c7; }
    .card { border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; backdrop-filter: none; }
    table { background: #fff; }
    th, td { border-bottom-color: rgba(0,0,0,.08); }
    th { color: #615d59; }
    .muted { color: #615d59; }
    a { color: #0075de; }
    @media (max-width: 980px) { body { padding: 0 16px; } }
    @media (max-width: 600px) { body { font-size: 16px; line-height: 1.6; } h1 { font-size: clamp(30px, 8vw, 38px); line-height: 1.12; } h2 { font-size: 23px; } p, li, th, td, button, input, .muted { font-size: 15px; } .page-nav a { min-height: 42px; font-size: 14px; } }
    @media (max-width: 360px) { body { padding: 0 12px; } h1 { font-size: 29px; } }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="head">
      <h1 data-i18n="page_title">Clip Notes</h1>
      <div class="head-right">
        <nav class="page-nav" aria-label="主导航"><a href="/" data-i18n="home">主页</a><a href="/app" data-i18n="upload_files">上传文件</a></nav>
        <button id="lang-toggle" type="button">中文</button>
        <div class="new">
          <input id="name" type="text" maxlength="64" data-i18n-placeholder="name_placeholder" placeholder="Enter a name, e.g. zhangsan" />
          <button id="go" type="button" data-i18n="open_create">Open / create note</button>
        </div>
      </div>
    </div>
    <div class="bulk-toolbar" id="bulk-toolbar" hidden>
      <span class="muted" id="selected-count"></span>
      <button id="delete-selected" type="button" data-i18n="delete_selected_notes"></button>
    </div>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th class="selection-cell" id="select-heading" hidden><input id="select-all" type="checkbox" /></th>
            <th data-i18n="name">Name</th>
            <th data-i18n="last_updated">Last updated</th>
            <th data-i18n="protection">Protection</th>
            <th data-i18n="items">Items</th>
            <th data-i18n="characters">Characters</th>
            <th data-i18n="actions">Actions</th>
          </tr>
        </thead>
        <tbody id="rows">
          <tr><td colspan="7" class="muted">Loading...</td></tr>
        </tbody>
      </table>
    </div>
  </main>
  <script>
    (function() {
      var I18N = {
        en: {
          document_title: "Clip Notes | PicoShare",
          page_title: "Clip Notes",
          home: "Home",
          upload_files: "Upload files",
          language_switch: "中文",
          name_placeholder: "Enter a name, e.g. zhangsan",
          open_create: "Open / create note",
          name: "Name",
          last_updated: "Last updated",
          protection: "Protection",
          items: "Items",
          characters: "Characters",
          actions: "Actions",
          loading: "Loading...",
          empty: "No notes yet. Enter a name above to create one.",
          load_failed: "Could not load notes. Please refresh and try again.",
          encrypted: "Encrypted",
          public: "Public",
          open: "Open",
          remove: "Delete",
          delete_confirm: "Delete note {name} and its share link?",
          delete_failed: "Could not delete this note. Please try again.",
          select_all_notes: "Select all notes",
          select_note: "Select note {name}",
          notes_selected_count: "{count} selected",
          delete_selected_notes: "Delete selected",
          delete_selected_notes_confirm: "Delete {count} selected notes and their share links? This cannot be undone.",
          notes_deleted_count: "Deleted {count} notes.",
          notes_delete_partial: "Deleted {deleted} notes; {failed} failed."
        },
        zh: {
          document_title: "云便签 - 列表",
          page_title: "云便签列表",
          home: "主页",
          upload_files: "上传文件",
          language_switch: "EN",
          name_placeholder: "输入名字，例如：zhangsan",
          open_create: "打开/创建便签",
          name: "名称",
          last_updated: "最近更新",
          protection: "保护",
          items: "便签项",
          characters: "字符",
          actions: "操作",
          loading: "加载中...",
          empty: "暂无便签，右上角输入名字即可创建。",
          load_failed: "便签加载失败，请刷新页面重试。",
          encrypted: "已加密",
          public: "公开",
          open: "进入",
          remove: "删除",
          delete_confirm: "确定删除便签 {name} 和它的分享链接吗？",
          delete_failed: "便签删除失败，请重试。",
          select_all_notes: "全选云便签",
          select_note: "选择便签 {name}",
          notes_selected_count: "已选择 {count} 个",
          delete_selected_notes: "批量删除",
          delete_selected_notes_confirm: "确认删除选中的 {count} 个便签及其分享链接吗？删除后无法恢复。",
          notes_deleted_count: "已删除 {count} 个便签。",
          notes_delete_partial: "已删除 {deleted} 个便签，{failed} 个失败。"
        }
      };
      var lang = localStorage.getItem("ps_lang") === "zh" ? "zh" : "en";
      var canDelete = ${_saasMode ? "true" : "false"};
      var listState = { status: "loading", data: [] };
      var selectedSlugs = new Set();
      var selectAllCheckbox = document.getElementById("select-all");
      var bulkToolbar = document.getElementById("bulk-toolbar");
      var selectedCountLabel = document.getElementById("selected-count");
      var deleteSelectedButton = document.getElementById("delete-selected");
      function t(key) {
        return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
      }
      function formatDate(iso) {
        if (!iso) return "-";
        var d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString(lang === "zh" ? "zh-CN" : "en-US");
      }
      function normalize(value) {
        return (value || "").trim().toLowerCase().replace(/\\s+/g, "-");
      }
      function updateBulkUI() {
        var available = new Set(listState.data.map(function(item) { return String(item.slug || ""); }));
        selectedSlugs.forEach(function(slug) { if (!available.has(slug)) selectedSlugs.delete(slug); });
        var selectedCount = selectedSlugs.size;
        var selectedOnList = listState.data.filter(function(item) { return selectedSlugs.has(String(item.slug || "")); }).length;
        document.getElementById("select-heading").hidden = !canDelete;
        bulkToolbar.hidden = !canDelete || listState.status !== "loaded" || selectedCount === 0;
        selectedCountLabel.textContent = t("notes_selected_count").replace("{count}", String(selectedCount));
        deleteSelectedButton.disabled = selectedCount === 0;
        selectAllCheckbox.disabled = !canDelete || !listState.data.length;
        selectAllCheckbox.checked = listState.data.length > 0 && selectedOnList === listState.data.length;
        selectAllCheckbox.indeterminate = selectedOnList > 0 && selectedOnList < listState.data.length;
        selectAllCheckbox.setAttribute("aria-label", t("select_all_notes"));
      }
      function renderMessage(text) {
        var rows = document.getElementById("rows");
        var tr = document.createElement("tr");
        var td = document.createElement("td");
        td.colSpan = canDelete ? 7 : 6;
        td.className = "muted";
        td.textContent = text;
        tr.appendChild(td);
        rows.replaceChildren(tr);
      }
      selectAllCheckbox.addEventListener("change", function() {
        listState.data.forEach(function(item) {
          var slug = String(item.slug || "");
          if (selectAllCheckbox.checked) selectedSlugs.add(slug);
          else selectedSlugs.delete(slug);
        });
        renderList();
      });
      deleteSelectedButton.addEventListener("click", async function() {
        var slugs = Array.from(selectedSlugs);
        if (!slugs.length) return;
        var message = t("delete_selected_notes_confirm").replace("{count}", String(slugs.length));
        if (!confirm(message)) return;
        deleteSelectedButton.disabled = true;
        var deleted = 0;
        var failed = 0;
        for (var i = 0; i < slugs.length; i += 1) {
          try {
            var response = await fetch("/clipboard-api/item/" + encodeURIComponent(slugs[i]), { method: "DELETE" });
            if (!response.ok) throw new Error("delete failed");
            selectedSlugs.delete(slugs[i]);
            deleted += 1;
          } catch (_) {
            failed += 1;
          }
        }
        await loadList();
        alert(failed
          ? t("notes_delete_partial").replace("{deleted}", String(deleted)).replace("{failed}", String(failed))
          : t("notes_deleted_count").replace("{count}", String(deleted)));
      });
      function renderList() {
        updateBulkUI();
        if (listState.status === "loading") {
          renderMessage(t("loading"));
          return;
        }
        if (listState.status === "error") {
          renderMessage(t("load_failed"));
          return;
        }
        if (!listState.data.length) {
          renderMessage(t("empty"));
          return;
        }
        var rows = document.getElementById("rows");
        rows.replaceChildren();
        listState.data.forEach(function(item) {
          var name = String(item.slug || "");
          var href = "/" + encodeURIComponent(name);
          var tr = document.createElement("tr");
          var selectCell = document.createElement("td");
          selectCell.className = "selection-cell";
          selectCell.hidden = !canDelete;
          if (canDelete) {
            var checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = selectedSlugs.has(name);
            checkbox.setAttribute("aria-label", t("select_note").replace("{name}", name));
            checkbox.addEventListener("change", function() {
              if (checkbox.checked) selectedSlugs.add(name);
              else selectedSlugs.delete(name);
              updateBulkUI();
            });
            selectCell.appendChild(checkbox);
          }
          var nameCell = document.createElement("td");
          var nameLink = document.createElement("a");
          nameLink.href = href;
          nameLink.textContent = name;
          nameCell.appendChild(nameLink);
          var updatedCell = document.createElement("td");
          updatedCell.textContent = formatDate(item.updatedAt);
          var protectionCell = document.createElement("td");
          protectionCell.textContent = item.hasPassword ? t("encrypted") : t("public");
          var itemsCell = document.createElement("td");
          itemsCell.textContent = String(item.itemCount);
          var charactersCell = document.createElement("td");
          charactersCell.textContent = String(item.charCount);
          var actionsCell = document.createElement("td");
          var openLink = document.createElement("a");
          openLink.href = href;
          openLink.textContent = t("open");
          actionsCell.appendChild(openLink);
          if (canDelete) {
            var deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.textContent = t("remove");
            deleteButton.addEventListener("click", async function() {
              if (!confirm(t("delete_confirm").replace("{name}", name))) return;
              try {
                var response = await fetch("/clipboard-api/item/" + encodeURIComponent(name), { method: "DELETE" });
                if (!response.ok) throw new Error("delete failed");
                await loadList();
              } catch (_) {
                alert(t("delete_failed"));
              }
            });
            actionsCell.appendChild(deleteButton);
          }
          tr.append(selectCell, nameCell, updatedCell, protectionCell, itemsCell, charactersCell, actionsCell);
          rows.appendChild(tr);
        });
        updateBulkUI();
      }
      function applyLanguage() {
        document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
        document.title = t("document_title");
        document.querySelectorAll("[data-i18n]").forEach(function(element) {
          var key = element.getAttribute("data-i18n");
          element.textContent = t(key);
        });
        document.querySelectorAll("[data-i18n-placeholder]").forEach(function(element) {
          var key = element.getAttribute("data-i18n-placeholder");
          element.setAttribute("placeholder", t(key));
        });
        document.getElementById("lang-toggle").textContent = t("language_switch");
        selectAllCheckbox.setAttribute("aria-label", t("select_all_notes"));
        renderList();
      }
      async function loadList() {
        listState.status = "loading";
        renderList();
        try {
          var res = await fetch("/clipboard-api/list");
          if (!res.ok) throw new Error("Request failed");
          var data = await res.json();
          if (!Array.isArray(data)) throw new Error("Invalid list response");
          listState.data = data;
          listState.status = "loaded";
        } catch (_) {
          listState.data = [];
          listState.status = "error";
        }
        renderList();
      }

      var nameInput = document.getElementById("name");
      function go() {
        var normalized = normalize(nameInput.value);
        if (!normalized) return;
        location.href = "/" + encodeURIComponent(normalized);
      }
      document.getElementById("go").addEventListener("click", go);
      document.getElementById("lang-toggle").addEventListener("click", function() {
        lang = lang === "en" ? "zh" : "en";
        localStorage.setItem("ps_lang", lang);
        applyLanguage();
      });
      nameInput.addEventListener("keydown", function(evt) {
        if (evt.key === "Enter") go();
      });
      applyLanguage();
      loadList();
    })();
  </script>
</body>
</html>`;
}

function clipboardDetailPage(
  slug: string,
  saasMode = false,
  publicId: string | null = null,
  publicRoute = false,
  maxContentBytes: number | null = null,
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title id="page-title">Cloud note - ${escapeHtml(slug)}</title>
  <style>
    :root {
      --bg: #eef1f8;
      --bg-2: #f7f9ff;
      --text: #26354d;
      --muted: #6f7d94;
      --line: rgba(255, 255, 255, 0.68);
      --line-soft: rgba(145, 158, 185, 0.25);
      --primary: #328ecf;
      --ok: #2ea86f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Avenir Next", "SF Pro Text", "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 18% 86%, rgba(68, 95, 255, 0.5), transparent 30%),
        radial-gradient(circle at 80% 30%, rgba(243, 173, 233, 0.6), transparent 30%),
        radial-gradient(circle at 55% 50%, rgba(255, 255, 255, 0.7), transparent 42%),
        linear-gradient(145deg, var(--bg-2), var(--bg));
      min-height: 100vh;
      padding: 14px;
    }
    .top {
      max-width: 1240px;
      margin: 0 auto 8px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.32);
      border-radius: 14px;
      backdrop-filter: blur(14px);
      padding: 14px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .title { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 28px; }
    .title small { font-size: 14px; color: var(--muted); font-weight: 500; }
    .action { display: flex; gap: 8px; align-items: center; }
    button {
      background: transparent;
      position: relative;
      padding: 8px 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--primary);
      border-radius: 12px;
      color: var(--primary);
      overflow: hidden;
      transition: color 0.3s ease, transform 0.2s ease;
      min-height: 40px;
      z-index: 1;
    }
    button:hover { color: #fff; transform: translateY(-1px); }
    button::before {
      position: absolute;
      inset: 0;
      content: "";
      border-radius: inherit;
      background: var(--primary);
      transform: scaleX(0);
      transform-origin: left center;
      transition: transform 0.3s ease-out;
      z-index: -1;
    }
    button:hover::before { transform: scaleX(1); }
    button.secondary { border-color: #8fa2c4; color: #4b5d78; }
    button.secondary::before { background: #8fa2c4; }
    .msg { color: var(--ok); font-size: 13px; min-width: 68px; text-align: right; }
    .grid {
      max-width: 1240px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 12px;
      min-height: calc(100vh - 92px);
    }
    .editor-wrap {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.32);
      border-radius: 14px;
      overflow: hidden;
      backdrop-filter: blur(14px);
    }
    textarea {
      width: 100%;
      height: calc(100vh - 110px);
      border: 0;
      outline: none;
      resize: none;
      padding: 18px;
      font-size: 16px;
      line-height: 1.7;
      color: #283145;
      background: rgba(255, 255, 255, 0.5);
    }
    .side { display: grid; gap: 12px; align-content: start; }
    .card {
      background: rgba(255, 255, 255, 0.32);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      backdrop-filter: blur(14px);
    }
    .card h3 { margin: 0 0 10px; font-size: 14px; color: #5c6781; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; }
    .stats b { display: block; font-size: 22px; color: #2e384c; }
    .stats span { font-size: 12px; color: var(--muted); }
    .link-row { display: flex; gap: 8px; }
    .link-row input,
    .stack input[type="text"],
    .stack input[type="password"],
    .stack select {
      flex: 1;
      border: 1px solid rgba(255, 255, 255, 0.7);
      border-radius: 10px;
      padding: 9px 10px;
      font-size: 13px;
      color: #4f5a72;
      background: rgba(255, 255, 255, 0.36);
      outline: none;
    }
    .link-row input:focus,
    .stack input[type="text"]:focus,
    .stack input[type="password"]:focus,
    .stack select:focus {
      border-color: rgba(16, 27, 114, 0.42);
      box-shadow: 0 0 0 3px rgba(16, 27, 114, 0.12);
    }
    .stack { display: grid; gap: 8px; }
    .muted { color: var(--muted); font-size: 12px; }
    a { color: #2b5cc9; text-decoration: none; font-weight: 600; }
    @media (max-width: 980px) {
      body { padding: 10px; }
      .top { padding: 12px; }
      .title { font-size: 22px; }
      .grid { grid-template-columns: 1fr; min-height: auto; }
      textarea { height: 55vh; }
    }
    :root { --bg: #f6f5f4; --bg-2: #f6f5f4; --text: #111; --muted: #615d59; --line: rgba(0,0,0,.08); --line-soft: rgba(0,0,0,.08); --primary: #0075de; --ok: #0075de; }
    body { padding: 16px 24px; color: #111; background: #f6f5f4; font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .top, .grid { max-width: 1280px; }
    .top { border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; backdrop-filter: none; }
    .title { color: #111; font-weight: 600; letter-spacing: -.035em; }
    .title::before { content: ""; display: inline-block; flex: 0 0 32px; width: 32px; height: 32px; background: url("/favicon.svg") center / contain no-repeat; }
    .title small, .muted { color: #615d59; }
    .action { flex-wrap: wrap; }
    .page-nav { display: inline-flex; align-items: center; gap: 8px; }
    .page-nav a { display: inline-flex; align-items: center; min-height: 40px; padding: 0 13px; border-radius: 8px; color: #0075de; background: #e6f3fe; font-size: 14px; font-weight: 600; text-decoration: none; }
    .page-nav a:hover { background: #d8edfc; }
    button { color: #0075de; border-color: transparent; border-radius: 8px; background: #e6f3fe; transition: color .2s ease, background-color .2s ease; }
    button::before { display: none; }
    button:hover { color: #005fb8; background: #d8edfc; transform: none; }
    button.secondary { color: #0075de; border-color: transparent; background: #e6f3fe; }
    button.secondary:hover { color: #005fb8; background: #d8edfc; }
    #save { color: #fff; border-color: #0075de; background: #0075de; }
    #save:hover { color: #fff; background: #0068c7; }
    .grid { gap: 16px; }
    .editor-wrap, .card { border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; backdrop-filter: none; }
    textarea { color: #111; background: #fff; }
    .card h3, .stats b { color: #111; }
    .link-row input, .stack input[type="text"], .stack input[type="password"], .stack select { color: #111; border-color: rgba(0,0,0,.16); border-radius: 8px; background: #fff; }
    .link-row input:focus, .stack input[type="text"]:focus, .stack input[type="password"]:focus, .stack select:focus { border-color: #0075de; box-shadow: 0 0 0 3px rgba(0,117,222,.12); }
    a { color: #0075de; }
    @media (max-width: 980px) { body { padding: 12px 16px; } .top { flex-wrap: wrap; } .action { width: 100%; justify-content: flex-start; } }
    @media (max-width: 600px) { body { padding: 12px; font-size: 16px; line-height: 1.6; } h1 { font-size: clamp(30px, 8vw, 38px); line-height: 1.12; } .card h3 { font-size: 17px; } .muted { font-size: 14px; } button, input, select, label { font-size: 15px; } .top { gap: 10px; } .action { gap: 8px; } }
    @media (max-width: 360px) { body { padding: 10px; } h1 { font-size: 29px; } }
  </style>
</head>
<body>
  <header class="top">
    <div class="title"><span id="brand-title" data-i18n="title">Cloud note</span> <small>/${escapeHtml(slug)}</small></div>
    <div class="action">
      <nav class="page-nav" aria-label="Primary navigation"><a href="/" data-i18n="home">Home</a><a href="/app" data-i18n="upload">Upload files</a></nav>
      <button id="lang-toggle" class="secondary" type="button" aria-label="Switch to Chinese">中文</button>
      <button id="copy-link" class="secondary" type="button" data-i18n="copy_link">Copy link</button>
      <button id="save" type="button" data-i18n="save">Save</button>
      <span id="msg" class="msg"></span>
    </div>
  </header>
  <main class="grid">
    <section class="editor-wrap">
      <textarea id="content" placeholder="Write a note and keep it in sync across devices." data-i18n-placeholder="content_placeholder"></textarea>
    </section>
    <aside class="side">
      <section class="card">
        <h3 data-i18n="statistics">Statistics</h3>
        <div class="stats">
          <div><b id="item-count">0</b><span data-i18n="items">Items</span></div>
          <div><b id="line-count">0</b><span data-i18n="lines">Lines</span></div>
          <div><b id="char-count">0</b><span data-i18n="characters">Characters</span></div>
        </div>
      </section>
      <section class="card">
        <h3 data-i18n="sharing">Sharing</h3>
        <div class="link-row">
          <input id="url" readonly />
          <button id="copy-url" class="secondary" type="button" data-i18n="copy">Copy</button>
        </div>
        <p class="muted" data-i18n="sharing_help">Open this address on your devices to edit and save the note.</p>
      </section>
      <section class="card">
        <h3 data-i18n="password_protection">Password protection</h3>
        <div class="stack">
          <input id="unlock-password" type="password" maxlength="128" placeholder="Current password (if protected)" data-i18n-placeholder="current_password" />
          <div class="link-row">
            <button id="unlock-btn" class="secondary" type="button" data-i18n="unlock">Unlock</button>
            <span id="lock-state" class="muted"></span>
          </div>
          <input id="new-password" type="password" maxlength="128" placeholder="New password (leave blank to remove protection)" data-i18n-placeholder="new_password" />
          <button id="set-password-btn" type="button" data-i18n="set_password">Set / update password</button>
        </div>
      </section>
      <section class="card">
        <h3 data-i18n="notes_list">Notes list</h3>
        <a href="/clips" data-i18n="open_list">Open list</a>
      </section>
    </aside>
  </main>
  <script>
    (function() {
      var slug = ${JSON.stringify(slug)};
      var publicId = ${JSON.stringify(publicId)};
      var lang = localStorage.getItem("ps_lang") === "zh" ? "zh" : "en";
      var I18N = {
        en: {
          document_title: "Cloud note - {slug}", title: "Cloud note", home: "Home", upload: "Upload files", copy_link: "Copy link", save: "Save",
          statistics: "Statistics", items: "Items", lines: "Lines", characters: "Characters", sharing: "Sharing",
          sharing_help: "Open this address on your devices to edit and save the note.", copy: "Copy", password_protection: "Password protection",
          current_password: "Current password (if protected)", unlock: "Unlock", new_password: "New password (leave blank to remove protection)", set_password: "Set / update password",
          notes_list: "Notes list", open_list: "Open list", content_placeholder: "Write a note and keep it in sync across devices.", switch_language: "Switch to Chinese",
          encrypted: "Status: password protected", not_encrypted: "Status: not protected", encrypted_unlock: "This note is protected. Enter its password to unlock it.",
          plan_limit_upload: "This note exceeds your plan limit. Upload it as a file instead.", content_too_long: "The note is too long.", wrong_password: "The password is incorrect or missing.",
          current_password_wrong: "The current password is incorrect.", saved: "Saved", auto_saved: "Saved automatically when you left the page.", unlocked: "Unlocked",
          password_updated: "Password updated", password_removed: "Password protection removed", copied: "Copied", note_limit_reached: "You have reached the note limit for this plan."
        },
        zh: {
          document_title: "云便签 - {slug}", title: "云便签", home: "主页", upload: "上传文件", copy_link: "复制链接", save: "保存",
          statistics: "统计信息", items: "便签项", lines: "行数", characters: "字符", sharing: "分享",
          sharing_help: "复制此地址后，可在多台设备打开并编辑保存。", copy: "复制", password_protection: "密码保护",
          current_password: "当前密码（若已加密）", unlock: "解锁", new_password: "新密码（留空为取消密码）", set_password: "设置/更新密码",
          notes_list: "剪贴板列表", open_list: "打开列表页", content_placeholder: "可以随便记录点什么，支持多设备同步编辑。", switch_language: "Switch to English",
          encrypted: "状态：已加密", not_encrypted: "状态：未加密", encrypted_unlock: "该便签已加密，请输入密码后解锁",
          plan_limit_upload: "便签内容超出套餐限制，请上传为文件", content_too_long: "内容过长", wrong_password: "密码错误或未提供密码",
          current_password_wrong: "当前密码错误", saved: "已保存", auto_saved: "鼠标移出已自动保存", unlocked: "已解锁",
          password_updated: "密码已更新", password_removed: "密码已取消", copied: "已复制", note_limit_reached: "已达到当前套餐的云便签数量上限。"
        }
      };
      function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }
      function applyLanguage() {
        document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
        document.title = t("document_title").replace("{slug}", slug);
        document.querySelectorAll("[data-i18n]").forEach(function(element) { element.textContent = t(element.getAttribute("data-i18n")); });
        document.querySelectorAll("[data-i18n-placeholder]").forEach(function(element) { element.placeholder = t(element.getAttribute("data-i18n-placeholder")); });
        var toggle = document.getElementById("lang-toggle");
        toggle.textContent = lang === "zh" ? "EN" : "中文";
        toggle.setAttribute("aria-label", t("switch_language"));
      }
      var itemApiPath = ${JSON.stringify(publicRoute
        ? `/clipboard-api/public/${publicId || ""}`
        : `/clipboard-api/item/${slug}`)};
      var isSaas = ${saasMode ? "true" : "false"};
      var isPublicRoute = ${publicRoute ? "true" : "false"};
      var maxContentBytes = ${JSON.stringify(maxContentBytes)};
      var contentEl = document.getElementById("content");
      var msgEl = document.getElementById("msg");
      var urlEl = document.getElementById("url");
      var unlockPasswordEl = document.getElementById("unlock-password");
      var newPasswordEl = document.getElementById("new-password");
      var lockStateEl = document.getElementById("lock-state");
      var passwordStorageKey = ${JSON.stringify(clipboardPasswordStorageKey(saasMode ? (publicId || "saas:" + slug) : slug))};
      var clipPassword = "";
      var hasPassword = false;
      var isDirty = false;
      var isSaving = false;
      var lastSavedContent = "";
      var autoSaveTimer = null;
      if (isPublicRoute) {
        contentEl.readOnly = true;
        document.getElementById("save").classList.add("hidden");
        document.getElementById("set-password-btn").classList.add("hidden");
        newPasswordEl.classList.add("hidden");
      }
      urlEl.value = location.origin + (isSaas && publicId ? "/c/" + encodeURIComponent(publicId) : "/" + encodeURIComponent(slug));

      function persistPassword(value) {
        try {
          if (value) localStorage.setItem(passwordStorageKey, value);
          else localStorage.removeItem(passwordStorageKey);
        } catch {}
      }
      try {
        var remembered = localStorage.getItem(passwordStorageKey) || "";
        if (remembered) {
          clipPassword = remembered;
          unlockPasswordEl.value = remembered;
        }
      } catch {}

      function setMsg(text) {
        msgEl.textContent = text || "";
        if (!text) return;
        setTimeout(function() { msgEl.textContent = ""; }, 1600);
      }

      async function responseError(res) {
        var raw = await res.text();
        var message = raw;
        try {
          var body = JSON.parse(raw);
          if (body && typeof body.error === "string") message = body.error;
        } catch {}
        if (message === "clipboard limit reached") return new Error(t("note_limit_reached"));
        if (message === "clipboard exceeds plan limit") return new Error(t("plan_limit_upload"));
        return new Error(message || "Request failed");
      }

      function setLockState() {
        lockStateEl.textContent = hasPassword ? t("encrypted") : t("not_encrypted");
      }

      function authHeaders() {
        var headers = { "Content-Type": "application/json" };
        if (clipPassword) headers["x-clip-password"] = clipPassword;
        return headers;
      }

      function updateStats() {
        var text = String(contentEl.value || "");
        var lines = text ? text.split(/\\r?\\n/) : [];
        var items = lines.filter(function(line) { return line.trim() !== ""; }).length;
        document.getElementById("item-count").textContent = String(items);
        document.getElementById("line-count").textContent = String(lines.length);
        document.getElementById("char-count").textContent = String(text.length);
      }

      async function load() {
        var headers = {};
        if (clipPassword) headers["x-clip-password"] = clipPassword;
        var res = await fetch(itemApiPath, { headers: headers });
        if (res.status === 401) {
          hasPassword = true;
          if (clipPassword) {
            clipPassword = "";
            unlockPasswordEl.value = "";
            persistPassword("");
          }
          setLockState();
          throw new Error(t("encrypted_unlock"));
        }
        if (!res.ok) throw await responseError(res);
        var data = await res.json();
        if (typeof data.maxContentBytes === "number") maxContentBytes = data.maxContentBytes;
        if (isSaas && data.publicId) urlEl.value = location.origin + "/c/" + encodeURIComponent(data.publicId);
        if (isPublicRoute) contentEl.readOnly = !data.canEdit;
        if (isPublicRoute && data.canEdit) {
          document.getElementById("save").classList.remove("hidden");
          document.getElementById("set-password-btn").classList.remove("hidden");
          newPasswordEl.classList.remove("hidden");
        }
        if (isPublicRoute && !data.canEdit) {
          document.getElementById("save").classList.add("hidden");
          document.getElementById("set-password-btn").classList.add("hidden");
          newPasswordEl.classList.add("hidden");
        }
        hasPassword = !!data.hasPassword;
        if (!hasPassword) persistPassword("");
        else if (clipPassword) persistPassword(clipPassword);
        setLockState();
        contentEl.value = data.content || "";
        lastSavedContent = contentEl.value;
        isDirty = false;
        updateStats();
      }

      function scheduleAutoSave() {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(function() {
          save(true).catch(function() {});
        }, 900);
      }

      async function save(silent) {
        if (isSaving) return;
        var text = String(contentEl.value || "");
        var textBytes = new TextEncoder().encode(text).byteLength;
        if ((maxContentBytes !== null && textBytes > maxContentBytes) || (!isSaas && text.length > ${MAX_CLIPBOARD_CHARS})) {
          if (!silent) setMsg(isSaas ? t("plan_limit_upload") : t("content_too_long"));
          return;
        }
        if (!isDirty && text === lastSavedContent) return;
        isSaving = true;
        var res = await fetch(itemApiPath, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ content: text }),
        });
        if (res.status === 401) {
          clipPassword = "";
          unlockPasswordEl.value = "";
          persistPassword("");
          isSaving = false;
          throw new Error(t("wrong_password"));
        }
        if (!res.ok) {
          isSaving = false;
          throw await responseError(res);
        }
        var data = await res.json();
        if (typeof data.maxContentBytes === "number") maxContentBytes = data.maxContentBytes;
        hasPassword = !!data.hasPassword;
        if (isSaas && data.publicId) urlEl.value = location.origin + "/c/" + encodeURIComponent(data.publicId);
        isSaving = false;
        isDirty = false;
        lastSavedContent = text;
        setLockState();
        if (!silent) setMsg(t("saved"));
      }

      function saveOnMouseLeave() {
        if (!isDirty) return;
        save(false).then(function() {
          setMsg(t("auto_saved"));
        }).catch(function(err) {
          setMsg(String((err && err.message) || err));
        });
      }

      async function unlock() {
        clipPassword = String(unlockPasswordEl.value || "").trim();
        await load();
        if (clipPassword) persistPassword(clipPassword);
        setMsg(t("unlocked"));
      }

      async function updatePassword() {
        var currentPassword = String(unlockPasswordEl.value || "").trim();
        var nextPassword = String(newPasswordEl.value || "").trim();
        var res = await fetch(itemApiPath + "/password", {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            password: currentPassword || null,
            newPassword: nextPassword || null,
          }),
        });
        if (res.status === 401) throw new Error(t("current_password_wrong"));
        if (!res.ok) throw await responseError(res);
        var data = await res.json();
        hasPassword = !!data.hasPassword;
        if (isSaas && data.publicId) urlEl.value = location.origin + "/c/" + encodeURIComponent(data.publicId);
        if (nextPassword) {
          clipPassword = nextPassword;
          unlockPasswordEl.value = nextPassword;
          persistPassword(nextPassword);
        } else {
          clipPassword = "";
          unlockPasswordEl.value = "";
          persistPassword("");
        }
        newPasswordEl.value = "";
        setLockState();
        setMsg(hasPassword ? t("password_updated") : t("password_removed"));
      }

      document.getElementById("lang-toggle").addEventListener("click", function() {
        lang = lang === "zh" ? "en" : "zh";
        localStorage.setItem("ps_lang", lang);
        applyLanguage();
        setLockState();
      });
      contentEl.addEventListener("input", function() {
        isDirty = true;
        updateStats();
        scheduleAutoSave();
      });
      contentEl.addEventListener("keydown", function(evt) {
        if (evt.key !== "Enter" || evt.isComposing) return;
        if (evt.metaKey || evt.ctrlKey || evt.altKey) return;
        evt.preventDefault();
        var start = contentEl.selectionStart || 0;
        var end = contentEl.selectionEnd || 0;
        var text = contentEl.value || "";
        contentEl.value = text.slice(0, start) + "\\n" + text.slice(end);
        contentEl.selectionStart = contentEl.selectionEnd = start + 1;
        isDirty = true;
        updateStats();
        scheduleAutoSave();
      });
      document.getElementById("save").addEventListener("click", function() {
        save(false).catch(function(err) { setMsg(String((err && err.message) || err)); });
      });
      document.getElementById("unlock-btn").addEventListener("click", function() {
        unlock().catch(function(err) { setMsg(String((err && err.message) || err)); });
      });
      document.getElementById("set-password-btn").addEventListener("click", function() {
        updatePassword().catch(function(err) { setMsg(String((err && err.message) || err)); });
      });
      document.getElementById("copy-url").addEventListener("click", function() {
        navigator.clipboard.writeText(urlEl.value).then(function() { setMsg(t("copied")); });
      });
      document.getElementById("copy-link").addEventListener("click", function() {
        navigator.clipboard.writeText(urlEl.value).then(function() { setMsg(t("copied")); });
      });
      document.addEventListener("mouseleave", saveOnMouseLeave);
      document.addEventListener("visibilitychange", function() {
        if (document.hidden && isDirty) {
          save(true).catch(function() {});
        }
      });

      applyLanguage();
      setLockState();
      load().catch(function(err) { setMsg(String((err && err.message) || err)); });
    })();
  </script>
</body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Serve static assets only for safe read requests. Forwarding a POST request
    // to ASSETS consumes/locks its body stream, which breaks downstream handlers
    // such as Better Auth email registration even when ASSETS returns 404.
    if (url.pathname === "/robots.txt" && (request.method === "GET" || request.method === "HEAD")) {
      const body = request.method === "HEAD" ? null : "User-agent: *\nAllow: /\nDisallow: /-\nDisallow: /_preview/\nDisallow: /c/\nDisallow: /clipboard-api/public/\nDisallow: /guest/\nDisallow: /api/\nDisallow: /app\nDisallow: /upload\nDisallow: /account\nDisallow: /clips\nDisallow: /api-docs\nDisallow: /privacy\nDisallow: /downloads/\nDisallow: /videos/\nDisallow: /*?\n";
      return new Response(body, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex, nofollow, noarchive" },
      });
    }

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname !== "/") {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        const headers = new Headers(assetResponse.headers);
        headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
        return new Response(assetResponse.body, { status: assetResponse.status, statusText: assetResponse.statusText, headers });
      }
    }

    if (url.pathname === "/privacy" && request.method === "GET") {
      return new Response(privacyPolicyPage(url.searchParams.get("lang")), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
      });
    }
    const saasEnabled = isSaasEnabled(env.ENABLE_SAAS);
    const googleLoginEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    let auth: ReturnType<typeof createAuth> | null = null;

    if (saasEnabled) {
      try {
        auth = createAuth(env, request.url);
      } catch (err) {
        return json({ error: String((err as Error)?.message || err) }, 503);
      }
    }

    await ensureSchemaOnce(env, auth || undefined);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: withCors() });
    }

    if (auth && url.pathname.startsWith("/api/auth")) {
      if (url.pathname === "/api/auth/api-key/create" && request.method === "POST") {
        return json({ error: "Create API Keys through POST /api/api-keys" }, 403);
      }
      return auth.handler(request);
    }

    if (url.pathname === "/api/session" && request.method === "GET") {
      if (!auth) return jsonNoStore({ user: null, saasEnabled: false });
      const session = await auth.api.getSession({ headers: request.headers });
      return jsonNoStore({ user: session?.user || null, saasEnabled: true });
    }

    if (url.pathname === "/" && request.method === "GET") {
      const landingSession = auth ? await auth.api.getSession({ headers: request.headers }) : null;
      const headers = withCors({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      headers.set("X-Robots-Tag", "index, follow");
      return new Response(landingPage(saasEnabled, Boolean(landingSession?.user)), { headers });
    }

    if ((url.pathname === "/app" || url.pathname === "/upload") && request.method === "GET") {
      return new Response(htmlPage(saasEnabled, googleLoginEnabled), {
        headers: withCors({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }),
      });
    }

    if (url.pathname === "/account" && request.method === "GET") {
      if (!saasEnabled) return new Response("Not Found", { status: 404, headers: withCors() });
      return new Response(accountPage(googleLoginEnabled), {
        headers: withCors({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }),
      });
    }

    if (url.pathname === "/api-docs" && request.method === "GET") {
      return new Response(apiDocsPage(url.origin), {
        headers: withCors({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }),
      });
    }

    if (url.pathname === "/api/webhooks/waffo" && request.method === "POST") {
      return handleWaffoWebhook(request, env);
    }

    if (url.pathname.startsWith("/c/") && request.method === "GET") {
      if (!saasEnabled) return new Response("Not Found", { status: 404, headers: withCors() });
      const publicId = decodeURIComponent(url.pathname.slice("/c/".length));
      const mapping = await env.DB.prepare(
        "SELECT owner_id, slug, public_id FROM saas_clipboards WHERE public_id = ?",
      ).bind(publicId).first<SaasClipboardMapping>();
      if (!mapping) return new Response("Not Found", { status: 404, headers: withCors() });
      return new Response(clipboardDetailPage(mapping.slug, true, mapping.public_id, true), {
        headers: withCors({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }),
      });
    }

    await maybeCleanupExpiredEntries(env);

    if (url.pathname.startsWith("/_preview/") && request.method === "GET") {
      const id = decodeURIComponent(url.pathname.split("/").pop() || "");
      const entry = await getEntryById(env, id);
      if (!entry) return new Response("Not Found", { status: 404, headers: withCors() });
      if (isExpired(entry.expiration_time)) {
        await deleteEntryById(env, id);
        return new Response("File expired", { status: 410, headers: withCors() });
      }

      const obj = await env.BUCKET.get(currentObjectKey(entry));
      if (!obj) return new Response("Not Found", { status: 404, headers: withCors() });

      const h = withCors();
      obj.writeHttpMetadata(h);
      h.set("Content-Disposition", "inline");
      h.set("Cache-Control", "no-cache, must-revalidate");
      if (entry.md5) h.set("ETag", `"${entry.md5}"`);
      setSharedFileContentType(h, entry);
      return new Response(obj.body, { headers: h });
    }

    if (url.pathname.startsWith("/-") && request.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice(2).split("/")[0] || "");
      const entry = await getEntryById(env, id);
      if (!entry) return new Response("Not Found", { status: 404, headers: withCors() });
      if (isExpired(entry.expiration_time)) {
        await deleteEntryById(env, id);
        return new Response("File expired", { status: 410, headers: withCors() });
      }

      const obj = await env.BUCKET.get(currentObjectKey(entry));
      if (!obj) return new Response("Not Found", { status: 404, headers: withCors() });

      await env.DB.prepare(
        "INSERT INTO download_events(entry_id, ip, user_agent) VALUES (?, ?, ?)",
      )
        .bind(id, request.headers.get("cf-connecting-ip"), request.headers.get("user-agent"))
        .run();

      const h = withCors();
      obj.writeHttpMetadata(h);
      h.set("Content-Disposition", `inline; filename="${entry.filename}"`);
      h.set("Cache-Control", "no-cache, must-revalidate");
      if (entry.md5) h.set("ETag", `"${entry.md5}"`);
      setSharedFileContentType(h, entry);
      return new Response(obj.body, { headers: h });
    }

    if (url.pathname.startsWith("/guest/")) {
      const guestId = decodeURIComponent(url.pathname.split("/").pop() || "");
      const guestLang = normalizeGuestLang(url.searchParams.get("lang"));
      const link = await getGuestLinkById(env, guestId);
      if (!link) return new Response("Guest link not found", { status: 404, headers: withCors() });
      if (isExpired(link.url_expires)) {
        return new Response("Guest link expired", { status: 410, headers: withCors() });
      }

      if (request.method === "GET") {
        return new Response(guestUploadPage(link, null, false, guestLang), {
          headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
        });
      }

      if (request.method === "POST") {
        if (link.max_file_uploads && (link.upload_count || 0) >= link.max_file_uploads) {
          return new Response(guestUploadPage(link, guestText(guestLang, "upload_limit_reached"), true, guestLang), {
            status: 429,
            headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
          });
        }

        const fd = await request.formData();
        const postLang = normalizeGuestLang((fd.get("lang") as string | null) || guestLang);
        const isFileLike = (v: unknown): v is File =>
          typeof v === "object" &&
          v !== null &&
          "arrayBuffer" in v &&
          "size" in v &&
          "name" in v;
        const filesFromAll = (fd.getAll("files") as unknown[]).filter(isFileLike);
        const fallbackFile = fd.get("file");
        const files: File[] = filesFromAll.length
          ? filesFromAll
          : (isFileLike(fallbackFile) ? [fallbackFile] : []);
        const pastedText = (fd.get("pastedText") as string | null)?.trim() || "";
        const note = ((fd.get("note") as string | null) || "").trim().slice(0, 1000) || null;
        if (files.length === 0 && !pastedText) {
          return new Response(guestUploadPage(link, guestText(postLang, "select_or_paste_first"), true, postLang), {
            status: 400,
            headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
          });
        }

        const candidates: Array<{
          id: string;
          filename: string;
          contentType: string;
          bytes: ArrayBuffer | Uint8Array;
          size: number;
        }> = [];

        for (const file of files) {
          const id = generateID();
          candidates.push({
            id,
            filename: file.name || `guest-file-${id}`,
            contentType: file.type || "application/octet-stream",
            bytes: await file.arrayBuffer(),
            size: file.size,
          });
        }

        if (pastedText) {
          const id = generateID();
          const bytes = new TextEncoder().encode(pastedText);
          candidates.push({
            id,
            filename: `guest-paste-${id}.txt`,
            contentType: "text/plain",
            bytes,
            size: bytes.byteLength,
          });
        }

        if (link.max_file_uploads) {
          const left = Math.max(0, link.max_file_uploads - (link.upload_count || 0));
          if (candidates.length > left) {
            return new Response(
              guestUploadPage(link, guestText(postLang, "upload_limit_exceeded", { left }), true, postLang),
              {
                status: 429,
                headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
              },
            );
          }
        }

        for (const item of candidates) {
          if (link.max_file_bytes && item.size > link.max_file_bytes) {
            return new Response(
              guestUploadPage(
                link,
                guestText(postLang, "file_too_large", {
                  name: item.filename,
                  max: Math.round(link.max_file_bytes / (1024 * 1024)),
                }),
                true,
                postLang,
              ),
              {
                status: 413,
                headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
              },
            );
          }
        }

        let guestEntitlement: AccountEntitlement | null = null;
        let guestStorageReservationId: string | null = null;
        if (saasEnabled && link.owner_id && link.owner_id !== ADMIN_OWNER_ID) {
          guestEntitlement = await getAccountEntitlement(env, link.owner_id);
          const oversized = candidates.find((item) => item.size > guestEntitlement!.limits.maxFileBytes);
          if (oversized) {
            return new Response(
              guestUploadPage(link, guestText(postLang, "file_too_large", {
                name: oversized.filename,
                max: Math.round(guestEntitlement.limits.maxFileBytes / (1024 * 1024)),
              }), true, postLang),
              { status: 413, headers: withCors({ "Content-Type": "text/html; charset=utf-8" }) },
            );
          }
          const incoming = candidates.reduce((sum, item) => sum + item.size, 0);
          guestStorageReservationId = generateID();
          if (!(await reserveStorageBytes(env, link.owner_id, guestStorageReservationId, incoming, guestEntitlement.limits.storageBytes))) {
            return new Response(guestUploadPage(link, "Storage quota reached for this PicoShare account.", true, postLang), {
              status: 413,
              headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
            });
          }
        }

        const guestLifetimeDays = guestEntitlement
          ? Math.min(link.max_file_lifetime_days || guestEntitlement.limits.maxFileLifetimeDays, guestEntitlement.limits.maxFileLifetimeDays)
          : link.max_file_lifetime_days;
        const expiration = guestLifetimeDays
          ? expirationToISO(guestLifetimeDays)
          : null;

        const committedIds: string[] = [];
        let guestUploadSlotsReserved = false;
        try {
          if (!(await reserveGuestUploadSlots(env, guestId, candidates.length))) {
            if (guestStorageReservationId) await releaseStorageReservation(env, guestStorageReservationId, link.owner_id || undefined);
            return new Response(guestUploadPage(link, guestText(postLang, "upload_limit_reached"), true, postLang), {
              status: 429,
              headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
            });
          }
          guestUploadSlotsReserved = true;
          for (let index = 0; index < candidates.length; index++) {
            const item = candidates[index];
            await env.BUCKET.put(item.id, item.bytes, { httpMetadata: { contentType: item.contentType } });
            const md5 = md5Hex(item.bytes);
            await saveNewFileEntry(env, {
              id: item.id,
              filename: item.filename,
              contentType: item.contentType,
              size: item.size,
              md5,
              expiration,
              note,
              ownerId: link.owner_id || LOCAL_OWNER_ID,
            }, guestStorageReservationId ? {
              id: guestStorageReservationId,
              consumeBytes: item.size,
              final: index === candidates.length - 1,
            } : undefined);
            committedIds.push(item.id);
            if (guestEntitlement && link.owner_id) await recordUploadBytes(env, link.owner_id, item.size);
          }
        } catch (err) {
          if (guestStorageReservationId) await releaseStorageReservation(env, guestStorageReservationId, link.owner_id || undefined);
          if (guestUploadSlotsReserved) await releaseGuestUploadSlots(env, guestId, candidates.length);
          for (const id of committedIds) await deleteEntryById(env, id).catch(() => undefined);
          for (const { id } of candidates) await env.BUCKET.delete(id).catch(() => undefined);
          throw err;
        }
        const refreshed = await getGuestLinkById(env, guestId);
        const uploadedUrls = candidates
          .slice(0, 3)
          .map((c) => new URL(`/-${c.id}`, request.url).toString());
        const suffix = candidates.length > 3
          ? (postLang === "zh" ? `（另 ${candidates.length - 3} 个）` : ` (+${candidates.length - 3} more)`)
          : "";
        return new Response(
          guestUploadPage(
            refreshed || link,
            guestText(postLang, "uploaded_files", {
              count: candidates.length,
              urls: uploadedUrls.join(", "),
              suffix,
            }),
            false,
            postLang,
          ),
          { headers: withCors({ "Content-Type": "text/html; charset=utf-8" }) },
        );
      }

      return new Response("Method Not Allowed", { status: 405, headers: withCors() });
    }

    if (url.pathname === "/clipboard-api/list" && request.method === "GET") {
      let ownerId: string | undefined;
      if (saasEnabled) {
        const principal = await resolvePrincipal(request, env, auth, true);
        if (!principal) return unauthorized();
        ownerId = principal.ownerId;
        if (principal.userId && principal.authType === "api-key") {
          const entitlement = await getAccountEntitlement(env, principal.userId);
          const usage = await recordApiRequest(env, principal.userId, entitlement.limits.monthlyApiRequests, entitlement.limits.apiRequestsPerMinute);
          if (!usage.allowed) return json({
            error: usage.reason === "rate" ? "API request rate limit reached" : "monthly API request limit reached",
            used: usage.used,
            retryAfterSeconds: usage.reason === "rate" ? 60 : undefined,
          }, 429);
        }
      }
      return json(await listClipboards(env, ownerId));
    }

    if (url.pathname.startsWith("/clipboard-api/item/") || url.pathname.startsWith("/clipboard-api/public/")) {
      const publicRoute = url.pathname.startsWith("/clipboard-api/public/");
      if (publicRoute && !saasEnabled) return new Response("Not Found", { status: 404, headers: withCors() });
      const itemBase = publicRoute ? "/clipboard-api/public/" : "/clipboard-api/item/";
      const passwordSuffix = "/password";
      const isPasswordRoute = url.pathname.endsWith(passwordSuffix);
      const keyRaw = decodeURIComponent(
        isPasswordRoute
          ? url.pathname.slice(itemBase.length, -passwordSuffix.length)
          : url.pathname.slice(itemBase.length),
      );

      let ownerId: string | undefined;
      let canEdit = false;
      let mapping: SaasClipboardMapping | null = null;
      let principal: Principal | null = null;
      let maxClipboardBytes: number | null = null;
      let maxClipboards: number | null = null;
      let slug: string | null;
      if (saasEnabled && publicRoute) {
        mapping = await env.DB.prepare(
          "SELECT owner_id, slug, public_id FROM saas_clipboards WHERE public_id = ?",
        ).bind(keyRaw).first<SaasClipboardMapping>();
        if (!mapping) return new Response("Not Found", { status: 404, headers: withCors() });
        ownerId = mapping.owner_id;
        slug = mapping.slug;
        principal = await resolvePrincipal(request, env, auth, true);
        canEdit = Boolean(principal && (principal.isAdmin || principal.ownerId === ownerId));
        if (request.method !== "GET" && !canEdit) return unauthorized();
        if (principal?.userId && canEdit) {
          const entitlement = await getAccountEntitlement(env, principal.userId);
          maxClipboardBytes = entitlement.limits.maxClipboardBytes;
          maxClipboards = entitlement.limits.maxClipboards;
          if (principal.authType === "api-key") {
            const usage = await recordApiRequest(env, principal.userId, entitlement.limits.monthlyApiRequests, entitlement.limits.apiRequestsPerMinute);
            if (!usage.allowed) return json({
              error: usage.reason === "rate" ? "API request rate limit reached" : "monthly API request limit reached",
              used: usage.used,
              retryAfterSeconds: usage.reason === "rate" ? 60 : undefined,
            }, 429);
          }
        }
      } else {
        slug = sanitizeClipboardSlug(keyRaw);
        if (!slug) return json({ error: "invalid clipboard name" }, 400);
        if (saasEnabled) {
          principal = await resolvePrincipal(request, env, auth, true);
          if (!principal) return unauthorized();
          ownerId = principal.ownerId;
          canEdit = true;
          if (principal.userId) {
            const entitlement = await getAccountEntitlement(env, principal.userId);
            maxClipboardBytes = entitlement.limits.maxClipboardBytes;
            maxClipboards = entitlement.limits.maxClipboards;
            if (principal.authType === "api-key") {
              const usage = await recordApiRequest(env, principal.userId, entitlement.limits.monthlyApiRequests, entitlement.limits.apiRequestsPerMinute);
              if (!usage.allowed) return json({
                error: usage.reason === "rate" ? "API request rate limit reached" : "monthly API request limit reached",
                used: usage.used,
                retryAfterSeconds: usage.reason === "rate" ? 60 : undefined,
              }, 429);
            }
          }
        }
        if (ownerId) mapping = await getSaasClipboardMapping(env, ownerId, slug);
      }

      const existing = await getClipboardRecord(env, slug, ownerId);
      if (isPasswordRoute) {
        if (request.method !== "PUT") {
          return new Response("Method Not Allowed", { status: 405, headers: withCors() });
        }
        const body = (await request.json()) as { password?: unknown; newPassword?: unknown };
        const newPassword = normalizeClipboardPassword(body.newPassword);
        const oldPassword = normalizeClipboardPassword(body.password);
        if (existing?.passwordHash && !canEdit) {
          if (!oldPassword) return json({ error: "password required" }, 401);
          if (!(await verifyClipboardPassword(existing.passwordHash, oldPassword))) {
            return json({ error: "invalid password" }, 401);
          }
        }
        if (saasEnabled && ownerId && slug) {
          mapping = await ensureSaasClipboardMapping(env, ownerId, slug, maxClipboards);
          if (!mapping) return json({ error: "clipboard limit reached", limit: maxClipboards }, 403);
        }
        const now = new Date().toISOString();
        const next: ClipboardRecord = {
          slug,
          publicId: mapping?.public_id || existing?.publicId,
          content: existing?.content || "",
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          passwordHash: newPassword ? await sha256Hex(newPassword) : null,
        };
        await env.CLIPBOARD.put(clipboardKey(slug, ownerId), JSON.stringify(next));
        return json({
          ok: true,
          hasPassword: Boolean(next.passwordHash),
          publicId: next.publicId,
          updatedAt: now,
          maxContentBytes: canEdit ? maxClipboardBytes : null,
        });
      }

      if (request.method === "GET") {
        if (!existing) {
          if (publicRoute) return new Response("Not Found", { status: 404, headers: withCors() });
          return json({
            slug,
            content: "",
            createdAt: null,
            updatedAt: null,
            hasPassword: false,
            canEdit,
            maxContentBytes: canEdit ? maxClipboardBytes : null,
            ...calculateClipboardStats(""),
          });
        }
        const authorized = canEdit ? { ok: true, normalized: null } : await authorizeClipboardRequest(request, existing);
        if (!authorized.ok) return json({ error: "password required", hasPassword: true }, 401);
        return jsonNoStore({
          slug: existing.slug,
          publicId: mapping?.public_id || existing.publicId,
          canEdit,
          content: existing.content,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          hasPassword: Boolean(existing.passwordHash),
          maxContentBytes: canEdit ? maxClipboardBytes : null,
          ...calculateClipboardStats(existing.content),
        });
      }

      if (request.method === "DELETE") {
        if (!saasEnabled || !canEdit || !ownerId || !slug || !mapping) return unauthorized();
        await env.CLIPBOARD.delete(clipboardKey(slug, ownerId));
        await env.DB.prepare("DELETE FROM saas_clipboards WHERE owner_id = ? AND slug = ?")
          .bind(ownerId, slug).run();
        return json({ ok: true });
      }

      if (request.method === "PUT") {
        const body = (await request.json()) as { content?: unknown };
        const content = typeof body.content === "string" ? body.content : "";
        const contentBytes = new TextEncoder().encode(content).byteLength;
        if (content.length > MAX_CLIPBOARD_CHARS || (maxClipboardBytes !== null && contentBytes > maxClipboardBytes)) {
          return json({ error: "clipboard text exceeds this plan's limit", maxBytes: maxClipboardBytes ?? null }, 413);
        }
        const authorized = canEdit ? { ok: true, normalized: null } : await authorizeClipboardRequest(request, existing);
        if (!authorized.ok) return json({ error: "password required", hasPassword: true }, 401);
        if (saasEnabled && ownerId && slug) {
          mapping = await ensureSaasClipboardMapping(env, ownerId, slug, maxClipboards);
          if (!mapping) return json({ error: "clipboard limit reached", limit: maxClipboards }, 403);
        }
        const now = new Date().toISOString();
        const next: ClipboardRecord = {
          slug,
          publicId: mapping?.public_id || existing?.publicId,
          content,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          passwordHash: existing?.passwordHash || null,
        };
        await env.CLIPBOARD.put(clipboardKey(slug, ownerId), JSON.stringify(next));
        return json({
          ok: true,
          slug,
          publicId: next.publicId,
          updatedAt: now,
          hasPassword: Boolean(next.passwordHash),
          maxContentBytes: canEdit ? maxClipboardBytes : null,
          ...calculateClipboardStats(content),
        });
      }

      return new Response("Method Not Allowed", { status: 405, headers: withCors() });
    }

    if (url.pathname === "/clips" && request.method === "GET") {
      if (saasEnabled && !(await resolvePrincipal(request, env, auth, true))) {
        return Response.redirect(new URL("/account", url).toString(), 302);
      }
      return new Response(clipboardListPage(saasEnabled), {
        headers: withCors({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      const principal = await resolvePrincipal(request, env, auth, saasEnabled);
      if (!principal) return unauthorized();
      const ownerId = principal.ownerId;
      const ownerFilter = saasEnabled && !principal.isAdmin ? ownerId : undefined;
      let entitlement: AccountEntitlement | null = null;
      if (saasEnabled && principal.userId) {
        entitlement = await getAccountEntitlement(env, principal.userId);
        if (principal.authType === "api-key") {
          const usage = await recordApiRequest(env, principal.userId, entitlement.limits.monthlyApiRequests, entitlement.limits.apiRequestsPerMinute);
          if (!usage.allowed) {
            return json({
              error: usage.reason === "rate" ? "API request rate limit reached" : "monthly API request limit reached",
              used: usage.used,
              retryAfterSeconds: usage.reason === "rate" ? 60 : undefined,
            }, 429);
          }
        }
      }

      if (url.pathname === "/api/admin/pro-grant") {
        const superadmin = await resolveSaasSuperadmin(request, env, auth, principal);
        if (!superadmin) return json({ error: "Superadmin access is required" }, 403);

        if (request.method === "GET") {
          const targetEmail = url.searchParams.get("email")?.trim().toLowerCase() || "";
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail) || targetEmail.length > 254) {
            return json({ error: "A valid account email is required" }, 400);
          }
          const target = await env.DB.prepare(
            'SELECT id, name, email FROM "user" WHERE lower(email) = ? LIMIT 1',
          ).bind(targetEmail).first<{ id: string; name: string | null; email: string }>();
          if (!target) return json({ error: "Account not found" }, 404);
          await ensureSaasAccount(env, target.id, target.email);
          const entitlement = await getAccountEntitlement(env, target.id);
          const manualGrant = await getManualProGrant(env, target.id);
          const audit = await env.DB.prepare(
            `SELECT action, actor_email, expires_at, note, created_at
             FROM admin_pro_grant_audit WHERE user_id = ?
             ORDER BY created_at DESC LIMIT 10`,
          ).bind(target.id).all<{
            action: string;
            actor_email: string;
            expires_at: string | null;
            note: string | null;
            created_at: string;
          }>();
          return jsonNoStore({
            user: { id: target.id, name: target.name, email: target.email },
            plan: entitlement.plan,
            status: entitlement.status,
            source: entitlement.source,
            currentPeriodEnd: entitlement.currentPeriodEnd,
            manualGrant,
            audit: audit.results || [],
          });
        }

        if (request.method !== "POST" && request.method !== "DELETE") {
          return new Response("Method Not Allowed", { status: 405, headers: withCors() });
        }
        if (!isAllowedRequestOrigin(request.headers.get("Origin"), env.BETTER_AUTH_URL, request.url)) {
          return json({ error: "Request origin is not allowed" }, 403);
        }

        let body: { email?: unknown; durationDays?: unknown; note?: unknown };
        try {
          body = await request.json() as { email?: unknown; durationDays?: unknown; note?: unknown };
        } catch {
          return json({ error: "A JSON request body is required" }, 400);
        }
        const targetEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail) || targetEmail.length > 254) {
          return json({ error: "A valid account email is required" }, 400);
        }
        const target = await env.DB.prepare(
          'SELECT id, name, email FROM "user" WHERE lower(email) = ? LIMIT 1',
        ).bind(targetEmail).first<{ id: string; name: string | null; email: string }>();
        if (!target) return json({ error: "Account not found" }, 404);
        await ensureSaasAccount(env, target.id, target.email);

        if (request.method === "POST") {
          let expiresAt: string | null = null;
          if (body.durationDays !== undefined && body.durationDays !== null && body.durationDays !== "permanent") {
            if (typeof body.durationDays !== "number" || ![30, 90, 365].includes(body.durationDays)) {
              return json({ error: "Duration must be permanent, 30, 90, or 365 days" }, 400);
            }
            expiresAt = new Date(Date.now() + body.durationDays * 24 * 60 * 60 * 1000).toISOString();
          }
          if (body.note !== undefined && typeof body.note !== "string") {
            return json({ error: "Note must be text" }, 400);
          }
          const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null;
          const auditId = await grantManualPro(env, {
            userId: target.id,
            targetEmail: target.email,
            actorUserId: superadmin.userId,
            actorEmail: superadmin.email,
            expiresAt,
            note,
          });
          return jsonNoStore({ ok: true, auditId, expiresAt });
        }

        const auditId = await revokeManualPro(env, {
          userId: target.id,
          targetEmail: target.email,
          actorUserId: superadmin.userId,
          actorEmail: superadmin.email,
        });
        if (!auditId) return json({ error: "No manual Pro grant is active for this account" }, 404);
        return jsonNoStore({ ok: true, auditId });
      }

      if (url.pathname === "/api/admin/users" || url.pathname.startsWith("/api/admin/users/")) {
        const superadmin = await resolveSaasSuperadmin(request, env, auth, principal);
        if (!superadmin) return json({ error: "Superadmin access is required" }, 403);

        if (url.pathname === "/api/admin/users" && request.method === "GET") {
          const search = (url.searchParams.get("search") || "").trim().slice(0, 100);
          const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
          const offset = Math.max(0, Math.min(1_000_000, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0));
          const protectedEmails = (env.SAAS_SUPERADMIN_EMAILS || "")
            .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
          const protectedFilter = protectedEmails.length
            ? `AND lower(u.email) NOT IN (${protectedEmails.map(() => "?").join(",")})`
            : "";
          const where = `(? = '' OR instr(lower(u.email), lower(?)) > 0 OR instr(lower(COALESCE(u.name, '')), lower(?)) > 0) ${protectedFilter}`;
          const params = [search, search, search, ...protectedEmails];
          const totalRow = await env.DB.prepare(
            `SELECT COUNT(*) AS total FROM "user" u WHERE ${where}`,
          ).bind(...params).first<{ total: number }>();
          const result = await env.DB.prepare(
            `SELECT u.id, u.email, u.name, u.createdAt AS createdAt,
                    CASE WHEN g.status = 'active'
                              AND (g.expires_at IS NULL OR datetime(g.expires_at) > CURRENT_TIMESTAMP)
                         THEN 'pro' ELSE COALESCE(b.plan_code, 'free') END AS plan,
                    CASE WHEN g.status = 'active'
                              AND (g.expires_at IS NULL OR datetime(g.expires_at) > CURRENT_TIMESTAMP)
                         THEN 'admin_granted' ELSE COALESCE(b.status, 'free') END AS status,
                    COALESCE(SUM(e.size), 0) AS storageBytes,
                    COUNT(DISTINCT e.id) AS fileCount
             FROM "user" u
             LEFT JOIN billing_accounts b ON b.user_id = u.id
             LEFT JOIN admin_pro_grants g ON g.user_id = u.id
             LEFT JOIN entries e ON e.owner_id = u.id
             WHERE ${where}
             GROUP BY u.id
             ORDER BY u.createdAt DESC, u.id ASC
             LIMIT ? OFFSET ?`,
          ).bind(...params, limit, offset).all<{
            id: string;
            email: string;
            name: string | null;
            createdAt: string;
            plan: string;
            status: string;
            storageBytes: number;
            fileCount: number;
          }>();
          return jsonNoStore({
            users: result.results || [], total: Number(totalRow?.total || 0), limit, offset,
          });
        }

        const userRoute = /^\/api\/admin\/users\/([^/]+)(?:\/files(?:\/([^/]+))?)?$/.exec(url.pathname);
        if (!userRoute) return json({ error: "Unknown admin user route" }, 404);
        let targetId = "";
        let fileId: string | null = null;
        try {
          targetId = decodeURIComponent(userRoute[1]);
          fileId = userRoute[2] ? decodeURIComponent(userRoute[2]) : null;
        } catch {
          return json({ error: "Invalid user or file id" }, 400);
        }
        if (!targetId || targetId.length > 200 || (fileId && fileId.length > 200)) {
          return json({ error: "Invalid user or file id" }, 400);
        }

        if (url.pathname.endsWith("/files") && !fileId && request.method === "GET") {
          const target = await env.DB.prepare(
            'SELECT id, name, email FROM "user" WHERE id = ? LIMIT 1',
          ).bind(targetId).first<AdminTargetUser>();
          if (!target || isProtectedAdminEmail(env, target.email)) return json({ error: "Account not found" }, 404);
          const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
          const offset = Math.max(0, Math.min(1_000_000, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0));
          const totalRow = await env.DB.prepare(
            "SELECT COUNT(*) AS total FROM entries WHERE owner_id = ?",
          ).bind(targetId).first<{ total: number }>();
          const result = await env.DB.prepare(
            `SELECT e.id, e.filename, e.size, e.upload_time AS uploadTime,
                    e.expiration_time AS expirationTime, e.note,
                    (SELECT COUNT(*) FROM download_events d WHERE d.entry_id = e.id) AS downloadCount
             FROM entries e WHERE e.owner_id = ?
             ORDER BY e.upload_time DESC, e.id ASC LIMIT ? OFFSET ?`,
          ).bind(targetId, limit, offset).all<{
            id: string;
            filename: string;
            size: number;
            uploadTime: string;
            expirationTime: string | null;
            note: string | null;
            downloadCount: number;
          }>();
          return jsonNoStore({
            user: { id: target.id, email: target.email, name: target.name },
            files: result.results || [], total: Number(totalRow?.total || 0), limit, offset,
          });
        }

        if (fileId && url.pathname.includes("/files/") && request.method === "DELETE") {
          if (request.headers.get("Origin") !== url.origin) return json({ error: "Request origin is not allowed" }, 403);
          const target = await env.DB.prepare(
            'SELECT id, name, email FROM "user" WHERE id = ? LIMIT 1',
          ).bind(targetId).first<AdminTargetUser>();
          if (!target || isProtectedAdminEmail(env, target.email)) return json({ error: "Account not found" }, 404);
          const entry = await getEntryById(env, fileId, targetId);
          if (!entry) return json({ error: "File not found" }, 404);
          await deleteEntryById(env, entry.id);
          await recordAdminAction(env, superadmin, target, "delete_file", {
            fileId: entry.id, filename: entry.filename, size: entry.size,
          });
          return jsonNoStore({ ok: true });
        }

        if (!fileId && !url.pathname.endsWith("/files") && request.method === "DELETE") {
          if (request.headers.get("Origin") !== url.origin) return json({ error: "Request origin is not allowed" }, 403);
          let body: { confirmEmail?: unknown };
          try {
            body = await request.json() as { confirmEmail?: unknown };
          } catch {
            return json({ error: "A JSON request body is required" }, 400);
          }
          const target = await env.DB.prepare(
            'SELECT id, name, email FROM "user" WHERE id = ? LIMIT 1',
          ).bind(targetId).first<AdminTargetUser>();
          if (!target) {
            const deleted = await env.DB.prepare(
              "SELECT email FROM deleted_saas_users WHERE user_id = ? LIMIT 1",
            ).bind(targetId).first<{ email: string }>();
            if (deleted && typeof body.confirmEmail === "string" && body.confirmEmail.trim().toLowerCase() === deleted.email.toLowerCase()) {
              return jsonNoStore({ ok: true, alreadyDeleted: true });
            }
            return json({ error: "Account not found" }, 404);
          }
          if (isProtectedAdminEmail(env, target.email)) return json({ error: "Protected superadmin accounts cannot be deleted" }, 403);
          if (target.id === superadmin.userId) return json({ error: "You cannot delete your own account" }, 400);
          if (typeof body.confirmEmail !== "string" || body.confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
            return json({ error: "The confirmation email does not match this account" }, 400);
          }
          const billing = await env.DB.prepare(
            "SELECT provider, status FROM billing_accounts WHERE user_id = ? LIMIT 1",
          ).bind(target.id).first<{ provider: string | null; status: string }>();
          if (["waffo", "opcpay"].includes(billing?.provider || "") && ["active", "canceling", "past_due", "pending"].includes(billing?.status.toLowerCase() || "")) {
            return json({ error: "subscription_active" }, 409);
          }
          try {
            const complete = await deleteSaasUserData(env, superadmin, target);
            if (!complete) return jsonNoStore({ ok: true, pending: true });
          } catch (error) {
            console.error("Superadmin account deletion did not finish", target.id, error);
            return json({ error: "account_cleanup_pending" }, 500);
          }
          return jsonNoStore({ ok: true });
        }

        return new Response("Method Not Allowed", { status: 405, headers: withCors() });
      }

      if (url.pathname === "/api/account" && request.method === "GET") {
        if (!auth || principal.authType !== "session" || !principal.userId) return unauthorized();
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return unauthorized();
        const userEntitlement = entitlement || await getAccountEntitlement(env, principal.userId);
        const billingAccount = await env.DB.prepare(
          "SELECT provider FROM billing_accounts WHERE user_id = ?",
        ).bind(principal.userId).first<{ provider: string | null }>();
        return json({
          user: session.user,
          isSuperadmin: Boolean(session.user.emailVerified && isSaasSuperadmin(session.user.email, env.SAAS_SUPERADMIN_EMAILS)),
          plan: userEntitlement.plan,
          status: userEntitlement.status,
          currentPeriodEnd: userEntitlement.currentPeriodEnd,
          limits: userEntitlement.limits,
          storageUsed: await getOwnerStorageBytes(env, principal.userId),
          apiRequestsUsed: await getMonthlyApiRequests(env, principal.userId),
          checkout: {
            monthly: Boolean(env.WAFFO_PRODUCT_PRO_MONTHLY && env.WAFFO_MERCHANT_ID && env.WAFFO_PRIVATE_KEY),
            yearly: Boolean(env.WAFFO_PRODUCT_PRO_YEARLY && env.WAFFO_MERCHANT_ID && env.WAFFO_PRIVATE_KEY),
          },
          opcpayAvailable: Boolean(env.OPCPAY_API_KEY),
          portalAvailable: Boolean(userEntitlement.plan === "pro" && billingAccount?.provider === "waffo" && env.WAFFO_STORE_ID && env.WAFFO_MERCHANT_ID && env.WAFFO_PRIVATE_KEY),
        });
      }

      if (url.pathname === "/api/billing/checkout-status" && request.method === "GET") {
        if (!auth || principal.authType !== "session" || !principal.userId) return unauthorized();
        const reference = url.searchParams.get("reference")?.trim() || "";
        if (!reference || reference.length > 128) return json({ error: "A valid checkout reference is required" }, 400);
        const attempt = await env.DB.prepare(
          "SELECT status, plan_code, product_id, session_id FROM billing_checkout_attempts WHERE reference = ? AND user_id = ?",
        ).bind(reference, principal.userId).first<{ status: string; plan_code: string; product_id: string; session_id: string | null }>();
        if (!attempt) return json({ error: "Checkout reference not found" }, 404);
        let checkoutStatus = attempt.status;
        if (attempt.status !== "paid" && reference.startsWith("ps-opc-") && env.OPCPAY_API_KEY) {
          try {
            const access = await getOpcPayAccess(env, principal.userId);
              if (access.access_granted === true && access.decision === "ALLOW" && access.valid_until) {
                const validUntil = Date.parse(access.valid_until);
                if (Number.isFinite(validUntil) && validUntil > Date.now()) {
                  const validFrom = typeof access.valid_from === "string" && Number.isFinite(Date.parse(access.valid_from))
                    ? new Date(Date.parse(access.valid_from)).toISOString()
                    : new Date().toISOString();
                  const end = new Date(validUntil).toISOString();
                  await env.DB.batch([
                    env.DB.prepare("UPDATE billing_checkout_attempts SET status = 'paid' WHERE reference = ? AND user_id = ?")
                      .bind(reference, principal.userId),
                    env.DB.prepare(
                      `UPDATE billing_accounts SET plan_code = 'pro', status = 'active', provider = 'opcpay',
                         provider_order_id = COALESCE(?, provider_order_id), provider_product_id = ?,
                         current_period_start = ?, current_period_end = ?, grace_until = NULL,
                         updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
                    ).bind(attempt.session_id, attempt.product_id, validFrom, end, principal.userId),
                  ]);
                  checkoutStatus = "paid";
                }
              }
          } catch (error) {
            console.error("OPCPay entitlement check failed", { reference, detail: (error as Error)?.message || String(error) });
          }
        }
        if (attempt.status === "paid" && attempt.plan_code === "pro") {
          // Recover checkouts acknowledged by older builds where
          // subscription.payment_succeeded marked the attempt paid but did not
          // grant the matching Pro entitlement.
          const latestEvent = await env.DB.prepare(
            `SELECT event_type, received_at FROM billing_webhook_events
             WHERE reference = ? AND processing_status = 'processed'
             ORDER BY received_at DESC, rowid DESC LIMIT 1`,
          ).bind(reference).first<{ event_type: string; received_at: string }>();
          if (latestEvent?.event_type === "subscription.payment_succeeded") {
            const periodEnd = attempt.product_id.startsWith("PROD_")
              ? checkoutPeriodEnd(attempt.product_id, env, latestEvent.received_at)
              : null;
            if (periodEnd) {
              await env.DB.prepare(
                `UPDATE billing_accounts
                 SET plan_code = 'pro', status = 'active', provider = 'waffo',
                     provider_product_id = ?, current_period_start = ?, current_period_end = ?,
                     grace_until = NULL, updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = ?`,
              ).bind(attempt.product_id, latestEvent.received_at, periodEnd, principal.userId).run();
            }
          }
        }
        return jsonNoStore({ status: checkoutStatus });
      }

      if (url.pathname === "/api/api-keys" && request.method === "GET") {
        if (!auth || principal.authType !== "session") return unauthorized();
        const result = await auth.api.listApiKeys({ headers: request.headers });
        const apiKeys = Array.isArray(result) ? result : ((result as { apiKeys?: unknown[] }).apiKeys || []);
        return jsonNoStore({ apiKeys });
      }

      if (url.pathname === "/api/api-keys" && request.method === "POST") {
        if (!auth || principal.authType !== "session" || !principal.userId) return unauthorized();
        const body = (await request.json()) as { name?: unknown; expiresIn?: unknown };
        const name = typeof body.name === "string" ? body.name.trim().slice(0, 32) : "";
        if (!name) return json({ error: "API Key name is required" }, 400);
        const expiresInValue = body.expiresIn === undefined ? null : body.expiresIn;
        if (expiresInValue !== null && (typeof expiresInValue !== "number" || !API_KEY_EXPIRATION_SECONDS.has(expiresInValue))) {
          return json({ error: "Invalid API Key expiration" }, 400);
        }
        const expiresIn = typeof expiresInValue === "number" ? expiresInValue : null;
        const lockToken = crypto.randomUUID();
        const lock = await env.DB.prepare(
          `INSERT INTO saas_api_key_creation_locks(user_id, lock_token, expires_at)
           VALUES (?, ?, datetime('now', '+30 seconds'))
           ON CONFLICT(user_id) DO UPDATE SET lock_token = excluded.lock_token, expires_at = excluded.expires_at
           WHERE saas_api_key_creation_locks.expires_at <= CURRENT_TIMESTAMP`,
        ).bind(principal.userId, lockToken).run();
        if (Number(lock.meta.changes || 0) !== 1) {
          return json({ error: "Another API Key is being created for this account; retry shortly" }, 409);
        }
        try {
          const current = await auth.api.listApiKeys({ headers: request.headers });
          const apiKeys = Array.isArray(current) ? current : ((current as { apiKeys?: unknown[] }).apiKeys || []);
          const userEntitlement = entitlement || await getAccountEntitlement(env, principal.userId);
          if (apiKeys.length >= userEntitlement.limits.maxApiKeys) {
            return json({ error: "API Key limit reached for this plan" }, 403);
          }
          const created = await auth.api.createApiKey({ body: { name, expiresIn }, headers: request.headers });
          return jsonNoStore({ key: created.key, id: created.id, name: created.name, start: created.start, expiresAt: created.expiresAt }, 201);
        } finally {
          await env.DB.prepare("DELETE FROM saas_api_key_creation_locks WHERE user_id = ? AND lock_token = ?")
            .bind(principal.userId, lockToken).run();
        }
      }

      if (url.pathname.startsWith("/api/api-keys/") && request.method === "DELETE") {
        if (!auth || principal.authType !== "session") return unauthorized();
        const keyId = decodeURIComponent(url.pathname.slice("/api/api-keys/".length));
        if (!keyId) return json({ error: "API Key id is required" }, 400);
        await auth.api.deleteApiKey({ body: { keyId }, headers: request.headers });
        return json({ ok: true });
      }

      if (url.pathname === "/api/billing/opcpay/product" && request.method === "GET") {
        if (!auth || principal.authType !== "session" || !principal.userId) return unauthorized();
        if (!env.OPCPAY_API_KEY) return json({ error: "OPCPay checkout is not configured" }, 503);
        try {
          const product = await getOpcPayProduct(env);
          return jsonNoStore({
            capabilityStatus: product.capability_status || "UNKNOWN",
            billingMode: product.billing_mode || null,
            options: (product.charging_options || []).filter((option) => option.billing_mode === "ONE_TIME_DURATION").map((option) => ({
              skuId: option.sku_id,
              displayName: option.display_name,
              price: option.price,
              currency: option.currency,
              durationPeriod: option.duration_period || null,
            })),
          });
        } catch (error) {
          console.error("OPCPay product lookup failed", (error as Error)?.message || String(error));
          return json({ error: "Could not load available Pro plans" }, 502);
        }
      }

      if (url.pathname === "/api/billing/opcpay/checkout" && request.method === "POST") {
        if (!auth || principal.authType !== "session" || !principal.userId) return unauthorized();
        if (!env.OPCPAY_API_KEY) return json({ error: "OPCPay checkout is not configured" }, 503);
        const body = (await request.json()) as { skuId?: unknown; language?: unknown };
        if (body.language !== "zh") return json({ error: "OPCPay is only available in the Chinese interface" }, 403);
        const skuId = typeof body.skuId === "string" ? body.skuId.trim() : "";
        if (!skuId || skuId.length > 128) return json({ error: "A valid plan is required" }, 400);
        try {
          const product = await getOpcPayProduct(env);
          if (product.capability_status !== "ENABLED") return json({ error: "OPCPay purchasing is not enabled" }, 503);
          const option = (product.charging_options || []).find((item) => item.sku_id === skuId && item.billing_mode === "ONE_TIME_DURATION" && item.entitlement_rule === "FIXED_DURATION");
          if (!option || !option.duration_period) return json({ error: "The selected duration plan is unavailable" }, 400);
          const reference = `ps-opc-${Date.now()}-${generateID()}`;
          const callbackUrl = new URL("/account", env.BETTER_AUTH_URL || url.origin);
          callbackUrl.searchParams.set("checkout", "opcpay");
          callbackUrl.searchParams.set("reference", reference);
          await env.DB.prepare(
            `INSERT INTO billing_checkout_attempts(reference, user_id, plan_code, product_id)
             VALUES (?, ?, 'pro', ?)`
          ).bind(reference, principal.userId, skuId).run();
          const purchase = await createOpcPayPurchase(env, {
            userId: principal.userId,
            idempotencyKey: reference,
            skuId,
            callbackUrl: callbackUrl.toString(),
          });
          if (purchase.status !== "READY" || !purchase.purchase_url) {
            await env.DB.prepare("UPDATE billing_checkout_attempts SET status = ? WHERE reference = ?")
              .bind(purchase.status === "FAILED" ? "failed" : "pending", reference).run();
            return jsonNoStore({ status: purchase.status || "UNKNOWN", checkoutUrl: null });
          }
          const purchaseUrl = typeof purchase.purchase_url === "string" ? purchase.purchase_url : "";
          const qrCode = typeof purchase.purchase_qr_code === "string" ? purchase.purchase_qr_code : "";
          let parsedPurchaseUrl: URL;
          try {
            parsedPurchaseUrl = new URL(purchaseUrl);
          } catch {
            await env.DB.prepare("UPDATE billing_checkout_attempts SET status = 'failed' WHERE reference = ?").bind(reference).run();
            return json({ error: "The payment provider returned an invalid purchase URL" }, 502);
          }
          if (!["https:", "alipays:"].includes(parsedPurchaseUrl.protocol) || parsedPurchaseUrl.username || parsedPurchaseUrl.password) {
            await env.DB.prepare("UPDATE billing_checkout_attempts SET status = 'failed' WHERE reference = ?").bind(reference).run();
            return json({ error: "The payment provider returned an unsupported purchase URL" }, 502);
          }
          if (qrCode) {
            try {
              const parsedQrCode = new URL(qrCode);
              if (parsedQrCode.protocol !== "https:" || parsedQrCode.hostname !== "mobilecodec.alipay.com" || parsedQrCode.username || parsedQrCode.password) throw new Error("invalid QR URL");
            } catch {
              return json({ error: "The payment provider returned an invalid QR code URL" }, 502);
            }
          }
          return jsonNoStore({ checkoutUrl: purchaseUrl, qrCode: qrCode || null, reference });
        } catch (error) {
          console.error("OPCPay purchase creation failed", (error as Error)?.message || String(error));
          return json({ error: "Could not create an Alipay purchase entry" }, 502);
        }
      }

      if (url.pathname === "/api/billing/checkout" && request.method === "POST") {
        if (!auth || principal.authType !== "session" || !principal.userId) return unauthorized();
        const body = (await request.json()) as { period?: unknown; provider?: unknown; skuId?: unknown };
        if (body.provider === "opcpay") {
          return json({ error: "Use the language-specific OPCPay checkout endpoint" }, 400);
        }
        const period = body.period === "yearly" ? "yearly" : body.period === "monthly" ? "monthly" : null;
        if (!period) return json({ error: "period must be monthly or yearly" }, 400);
        const productId = period === "yearly" ? env.WAFFO_PRODUCT_PRO_YEARLY : env.WAFFO_PRODUCT_PRO_MONTHLY;
        if (!productId || !env.WAFFO_MERCHANT_ID || !env.WAFFO_PRIVATE_KEY) {
          return json({ error: "Waffo checkout is not configured for this plan" }, 503);
        }
        const reference = `ps-${Date.now()}-${generateID()}`;
        const successUrl = new URL("/account", env.BETTER_AUTH_URL || url.origin);
        successUrl.searchParams.set("checkout", "success");
        successUrl.searchParams.set("reference", reference);
        await env.DB.prepare(
          `INSERT INTO billing_checkout_attempts(reference, user_id, plan_code, product_id)
           VALUES (?, ?, 'pro', ?)`,
        ).bind(reference, principal.userId, productId).run();
        try {
          const checkout = await createWaffoSubscriptionCheckout(env, {
            productId,
            buyerIdentity: principal.userId,
            buyerEmail: principal.email || undefined,
            orderReference: reference,
            currency: env.WAFFO_CURRENCY || "USD",
            successUrl: successUrl.toString(),
            cancelUrl: new URL("/account?checkout=cancelled", env.BETTER_AUTH_URL || url.origin).toString(),
            metadata: { userId: principal.userId, plan: "pro", period },
            idempotencyKey: reference,
          });
          await env.DB.prepare(
            "UPDATE billing_checkout_attempts SET session_id = ? WHERE reference = ?",
          ).bind(checkout.sessionId, reference).run();
          return jsonNoStore({ checkoutUrl: checkout.checkoutUrl });
        } catch (err) {
          await env.DB.prepare(
            "UPDATE billing_checkout_attempts SET status = 'failed' WHERE reference = ?",
          ).bind(reference).run();
          const detail = String((err as Error)?.message || err);
          console.error("Waffo checkout session creation failed", { reference, period, detail });
          return json({ error: `Could not create checkout: ${detail}` }, 502);
        }
      }

      if (url.pathname === "/api/billing/portal" && request.method === "POST") {
        if (!auth || principal.authType !== "session" || !principal.userId) return unauthorized();
        if (!env.WAFFO_STORE_ID || !env.WAFFO_MERCHANT_ID || !env.WAFFO_PRIVATE_KEY) {
          return json({ error: "Waffo customer portal is not configured" }, 503);
        }
        try {
          const portal = await createWaffoCustomerPortalLink(env, { buyerIdentity: principal.userId });
          return jsonNoStore({ portalUrl: portal.portalUrl });
        } catch (err) {
          return json({ error: `Could not create billing portal link: ${String((err as Error)?.message || err)}` }, 502);
        }
      }

      if (url.pathname === "/api/entry/multipart/init" && request.method === "POST") {
        const body = (await request.json()) as {
          filename?: unknown;
          contentType?: unknown;
          size?: unknown;
          note?: unknown;
          expirationDays?: unknown;
          entryId?: unknown;
          version?: unknown;
        };
        const filename = typeof body.filename === "string" && body.filename.trim()
          ? body.filename.trim().slice(0, 255)
          : `upload-${generateID()}.bin`;
        const contentType = typeof body.contentType === "string" && body.contentType.trim()
          ? body.contentType.trim()
          : "application/octet-stream";
        const size = Number(body.size || 0);
        if (!Number.isFinite(size) || size < 0) {
          return json({ error: "invalid file size" }, 400);
        }
        if (entitlement && size > entitlement.limits.maxFileBytes) {
          return json({ error: "file exceeds this plan's per-file limit", maxFileBytes: entitlement.limits.maxFileBytes }, 413);
        }
        if (!shouldUseMultipartUpload(size)) {
          return json({ error: "file smaller than 100MB should use regular upload" }, 400);
        }
        const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null;
        const maxFileLifetimeDays = entitlement?.limits.maxFileLifetimeDays ?? null;
        const expirationDays = resolveUploadExpirationDays(body.expirationDays, maxFileLifetimeDays);
        const expiration = expirationToISO(expirationDays);
        const requestedEntryId = typeof body.entryId === "string" ? body.entryId.trim() : "";
        let entryId = generateID();
        let objectKey = entryId;
        let isUpdate = 0;
        let expectedVersion: number | null = null;
        if (requestedEntryId) {
          const existing = await getEntryById(env, requestedEntryId, ownerFilter);
          if (!existing) return json({ error: "not found" }, 404);
          const expiredResponse = await rejectExpiredEntry(env, existing);
          if (expiredResponse) return expiredResponse;
          if (filename !== existing.filename) {
            return json({ error: "updated file must keep the same filename" }, 400);
          }
          const requestedVersion = Number(body.version || existing.version || 1);
          if (!Number.isInteger(requestedVersion) || requestedVersion !== Math.max(1, Number(existing.version || 1))) {
            return json({ error: "file changed while updating; please reload and try again" }, 409);
          }
          entryId = existing.id;
          expectedVersion = requestedVersion;
          objectKey = newFileVersionObjectKey(entryId, requestedVersion + 1);
          isUpdate = 1;
        }
        const upload = await env.BUCKET.createMultipartUpload(objectKey, { httpMetadata: { contentType } });
        if (entitlement && principal.userId && !(await reserveStorageBytes(
          env, principal.userId, upload.uploadId, size, entitlement.limits.storageBytes,
        ))) {
          await env.BUCKET.resumeMultipartUpload(objectKey, upload.uploadId).abort().catch(() => undefined);
          const stored = await getOwnerStorageBytes(env, principal.userId);
          return json({ error: "storage quota exceeded", storageUsed: stored, storageLimit: entitlement.limits.storageBytes }, 413);
        }
        try {
          await env.DB.prepare(
            `INSERT INTO multipart_uploads
              (upload_id, entry_id, filename, content_type, size, expiration_time, note, is_update, expected_version, object_key, owner_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(upload.uploadId, entryId, filename, contentType, Math.floor(size), expiration, note, isUpdate, expectedVersion, objectKey, ownerId)
            .run();
        } catch (err) {
          if (principal.userId) await releaseStorageReservation(env, upload.uploadId, principal.userId);
          await env.BUCKET.resumeMultipartUpload(objectKey, upload.uploadId).abort().catch(() => undefined);
          throw err;
        }
        return json({
          uploadId: upload.uploadId,
          id: entryId,
          chunkSize: MULTIPART_CHUNK_SIZE_BYTES,
        });
      }

      if (url.pathname.startsWith("/api/entry/multipart/part/") && request.method === "PUT") {
        const seg = url.pathname.split("/");
        const uploadId = decodeURIComponent(seg[5] || "");
        const partNumber = parseMultipartPartNumber(seg[6] || null);
        if (!uploadId || !partNumber) return json({ error: "invalid upload id or part number" }, 400);
        const upload = await getMultipartUploadById(env, uploadId, ownerFilter);
        if (!upload) return json({ error: "multipart upload not found" }, 404);
        if (upload.complete_token) return json({ error: "multipart upload is completing" }, 409);

        const bytes = await request.arrayBuffer();
        const ownerClause = ownerFilter ? " AND owner_id = ?" : "";
        const activePart = await env.DB.prepare(
          `UPDATE multipart_uploads
           SET active_parts = active_parts + 1, active_parts_updated_at = CURRENT_TIMESTAMP
           WHERE upload_id = ?${ownerClause} AND complete_token IS NULL`,
        ).bind(...(ownerFilter ? [uploadId, ownerFilter] : [uploadId])).run();
        if (activePart.meta.changes !== 1) return json({ error: "multipart upload is completing" }, 409);

        try {
          const multipart = env.BUCKET.resumeMultipartUpload(upload.object_key || upload.entry_id, upload.upload_id);
          const part = await multipart.uploadPart(partNumber, bytes);
          const [savedPart, releasedPart] = await env.DB.batch([
            env.DB.prepare(
              `INSERT OR REPLACE INTO multipart_upload_parts (upload_id, part_number, etag)
               SELECT ?, ?, ? WHERE EXISTS (
                 SELECT 1 FROM multipart_uploads
                 WHERE upload_id = ? AND complete_token IS NULL AND active_parts > 0
               )`,
            ).bind(uploadId, part.partNumber, part.etag, uploadId),
            env.DB.prepare(
              `UPDATE multipart_uploads SET active_parts = active_parts - 1, active_parts_updated_at = CURRENT_TIMESTAMP
               WHERE upload_id = ? AND complete_token IS NULL AND active_parts > 0`,
            ).bind(uploadId),
          ]);
          if (savedPart.meta.changes !== 1 || releasedPart.meta.changes !== 1) {
            return json({ error: "multipart upload is completing" }, 409);
          }
          return json({ ok: true, partNumber: part.partNumber });
        } catch (err) {
          await env.DB.prepare(
            `UPDATE multipart_uploads
             SET active_parts = MAX(0, active_parts - 1), active_parts_updated_at = CURRENT_TIMESTAMP
             WHERE upload_id = ? AND complete_token IS NULL AND active_parts > 0`,
          ).bind(uploadId).run().catch(() => undefined);
          throw err;
        }
      }

      if (url.pathname === "/api/entry/multipart/complete" && request.method === "POST") {
        const body = (await request.json()) as { uploadId?: unknown };
        const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
        if (!uploadId) return json({ error: "uploadId is required" }, 400);
        const upload = await getMultipartUploadById(env, uploadId, ownerFilter);
        if (!upload) return json({ error: "multipart upload not found" }, 404);
        const completionToken = generateID();
        if (!(await claimMultipartCompletion(env, uploadId, ownerFilter || null, completionToken))) {
          return json({ error: "multipart upload is already completing" }, 409);
        }
        let parts: D1Result<{ partNumber: number; etag: string }>;
        try {
          parts = await env.DB.prepare(
            `SELECT part_number AS partNumber, etag
             FROM multipart_upload_parts
             WHERE upload_id = ?
             ORDER BY part_number ASC`,
          ).bind(uploadId).all<{ partNumber: number; etag: string }>();
        } catch (err) {
          await releaseMultipartCompletionClaim(env, uploadId, completionToken).catch(() => undefined);
          return json({ error: String((err as Error)?.message || err) }, 500);
        }
        if (!parts.results.length) {
          await releaseMultipartCompletionClaim(env, uploadId, completionToken).catch(() => undefined);
          return json({ error: "no uploaded parts found" }, 400);
        }

        const uploadObjectKey = upload.object_key || upload.entry_id;
        const cleanup = (deleteObject = false) => cleanupMultipartUpload(
          env, uploadId, uploadObjectKey, upload.entry_id, principal.userId || undefined,
          completionToken, deleteObject,
        );
        const existingEntry = upload.is_update ? await getEntryById(env, upload.entry_id, ownerFilter) : null;
        if (upload.is_update && !existingEntry) {
          await cleanup();
          return json({ error: "not found" }, 404);
        }
        if (existingEntry && isExpired(existingEntry.expiration_time)) {
          await deleteEntryById(env, existingEntry.id);
          await cleanup();
          return json({ error: "file expired" }, 410);
        }
        if (
          existingEntry &&
          upload.expected_version !== null &&
          Math.max(1, Number(existingEntry.version || 1)) !== upload.expected_version
        ) {
          await cleanup();
          return json({ error: "file changed while updating; please reload and try again" }, 409);
        }

        const size = upload.size || 0;
        if (entitlement && size > entitlement.limits.maxFileBytes) {
          await cleanup();
          return json({ error: "file exceeds this plan's per-file limit", maxFileBytes: entitlement.limits.maxFileBytes }, 413);
        }
        if (entitlement && principal.userId) {
          const totals = await env.DB.prepare(
            `SELECT
               (SELECT COALESCE(SUM(size), 0) FROM entries WHERE owner_id = ?) +
               (SELECT COALESCE(SUM(history.size), 0) FROM file_versions history
                JOIN entries e ON e.id = history.entry_id
                WHERE e.owner_id = ? AND history.version < COALESCE(e.version, 1)) +
               (SELECT COALESCE(SUM(reserved_bytes), 0) FROM saas_storage_reservations
                WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP) AS total`,
          ).bind(principal.userId, principal.userId, principal.userId).first<{ total: number }>();
          if (Number(totals?.total || 0) > entitlement.limits.storageBytes) {
            await cleanup();
            return json({ error: "storage quota exceeded", storageUsed: await getOwnerStorageBytes(env, principal.userId), storageLimit: entitlement.limits.storageBytes }, 413);
          }
        }
        const contentType = upload.content_type || "application/octet-stream";
        let resultingVersion = 1;
        let md5 = "";

        try {
          const multipart = env.BUCKET.resumeMultipartUpload(uploadObjectKey, upload.upload_id);
          await multipart.complete(parts.results);
          const completed = await env.BUCKET.get(uploadObjectKey);
          if (!completed?.body) throw Object.assign(new Error("completed file not found"), { status: 500 });
          if (completed.size !== size) {
            throw Object.assign(new Error("uploaded byte count does not match the declared size"), { status: 400 });
          }
          md5 = await md5HexFromStream(completed.body);
          if (existingEntry) {
            await snapshotCurrentFileVersion(env, existingEntry);
            resultingVersion = await commitFileContentUpdate(
              env,
              existingEntry,
              contentType,
              size,
              md5,
              uploadObjectKey,
              upload.expected_version || Math.max(1, Number(existingEntry.version || 1)),
              entitlement && principal.userId ? { id: uploadId, ownerId: principal.userId, consumeBytes: size } : undefined,
              { uploadId, token: completionToken },
            );
          } else {
            await saveNewFileEntry(env, {
              id: upload.entry_id,
              filename: upload.filename,
              contentType,
              size,
              md5,
              expiration: upload.expiration_time,
              note: upload.note,
              ownerId: ownerId || LOCAL_OWNER_ID,
            }, entitlement && principal.userId ? { id: uploadId, consumeBytes: size, final: true } : undefined,
            { uploadId, token: completionToken });
          }
        } catch (err) {
          await cleanup(true);
          const message = String((err as Error)?.message || err);
          const status = Number((err as Error & { status?: number })?.status || 0);
          return json({ error: message }, status || (message.includes("file changed") ? 409 : 500));
        }
        if (saasEnabled && principal.userId) await recordUploadBytes(env, principal.userId, size).catch(() => undefined);
        await cleanup().catch(() => undefined);
        return json({ id: upload.entry_id, filename: upload.filename, version: resultingVersion, md5 });
      }

      if (url.pathname === "/api/entry/multipart/abort" && request.method === "POST") {
        const body = (await request.json()) as { uploadId?: unknown };
        const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
        if (!uploadId) return json({ error: "uploadId is required" }, 400);
        const upload = await getMultipartUploadById(env, uploadId, ownerFilter);
        if (upload) {
          const abortToken = generateID();
          if (!(await claimMultipartCompletion(env, uploadId, ownerFilter || null, abortToken, true))) {
            return json({ error: "multipart upload is completing" }, 409);
          }
          await cleanupMultipartUpload(
            env, uploadId, upload.object_key || upload.entry_id, upload.entry_id,
            principal.userId || undefined, abortToken, true,
          );
        }
        return json({ ok: true });
      }

      if (url.pathname === "/api/entry" && request.method === "POST") {
        const fd = await request.formData();
        const file = fd.get("file") as File | null;
        const pastedText = (fd.get("pastedText") as string | null)?.trim() || "";

        if (!file && !pastedText) {
          return json({ error: "file or pastedText is required" }, 400);
        }

        const id = generateID();
        const note = ((fd.get("note") as string | null) || "").trim().slice(0, 1000) || null;
        let filename = `paste-${id}.txt`;
        let contentType = "text/plain";
        let bytes: ArrayBuffer | Uint8Array;
        let size = 0;

        if (file) {
          filename = file.name;
          contentType = file.type || "application/octet-stream";
          bytes = await file.arrayBuffer();
          size = file.size;
        } else {
          bytes = new TextEncoder().encode(pastedText);
          size = bytes.byteLength;
        }

        const maxFileLifetimeDays = entitlement?.limits.maxFileLifetimeDays ?? null;
        const expirationDays = resolveUploadExpirationDays(fd.get("expirationDays"), maxFileLifetimeDays);
        const expiration = expirationToISO(expirationDays);
        if (entitlement && size > entitlement.limits.maxFileBytes) {
          return json({ error: "file exceeds this plan's per-file limit", maxFileBytes: entitlement.limits.maxFileBytes }, 413);
        }
        const storageReservationId = entitlement && principal.userId ? generateID() : null;
        if (storageReservationId && !(await reserveStorageBytes(
          env, principal.userId!, storageReservationId, size, entitlement!.limits.storageBytes,
        ))) {
          const stored = await getOwnerStorageBytes(env, principal.userId!);
          return json({ error: "storage quota exceeded", storageUsed: stored, storageLimit: entitlement!.limits.storageBytes }, 413);
        }

        const md5 = md5Hex(bytes);
        try {
          await env.BUCKET.put(id, bytes, { httpMetadata: { contentType } });
          await saveNewFileEntry(env, {
            id,
            filename,
            contentType,
            size,
            md5,
            expiration,
            note,
            ownerId: ownerId || LOCAL_OWNER_ID,
          }, storageReservationId ? { id: storageReservationId, consumeBytes: size, final: true } : undefined);
        } catch (err) {
          if (storageReservationId) await releaseStorageReservation(env, storageReservationId, principal.userId || undefined);
          await env.BUCKET.delete(id).catch(() => undefined);
          throw err;
        }
        if (saasEnabled && principal.userId) await recordUploadBytes(env, principal.userId, size);

        return json({ id, filename, md5 });
      }

      if (url.pathname.startsWith("/api/entry/") && url.pathname.endsWith("/content") && (request.method === "POST" || request.method === "PUT")) {
        const id = decodeURIComponent(url.pathname.split("/")[3] || "");
        const entry = await getEntryById(env, id, ownerFilter);
        if (!entry) return json({ error: "not found" }, 404);
        const expiredResponse = await rejectExpiredEntry(env, entry);
        if (expiredResponse) return expiredResponse;

        const fd = await request.formData();
        const fileValue = fd.get("file");
        if (
          !fileValue ||
          typeof fileValue !== "object" ||
          !("arrayBuffer" in fileValue) ||
          !("name" in fileValue)
        ) {
          return json({ error: "file is required" }, 400);
        }
        const file = fileValue as File;
        if (file.name !== entry.filename) {
          return json({ error: "updated file must keep the same filename" }, 400);
        }

        const expectedVersion = Number(fd.get("version") || entry.version || 1);
        if (!Number.isInteger(expectedVersion) || expectedVersion !== Math.max(1, Number(entry.version || 1))) {
          return json({ error: "file changed while updating; please reload and try again" }, 409);
        }
        const bytes = await file.arrayBuffer();
        if (entitlement && bytes.byteLength > entitlement.limits.maxFileBytes) {
          return json({ error: "file exceeds this plan's per-file limit", maxFileBytes: entitlement.limits.maxFileBytes }, 413);
        }
        const contentType = file.type || "application/octet-stream";
        const objectKey = newFileVersionObjectKey(id, expectedVersion + 1);
        const storageReservationId = entitlement && principal.userId ? generateID() : null;
        if (storageReservationId && !(await reserveStorageBytes(
          env, principal.userId!, storageReservationId, bytes.byteLength, entitlement!.limits.storageBytes,
        ))) {
          const stored = await getOwnerStorageBytes(env, principal.userId!);
          return json({ error: "storage quota exceeded", storageUsed: stored, storageLimit: entitlement!.limits.storageBytes }, 413);
        }
        let md5 = "";
        let version: number;
        try {
          md5 = md5Hex(bytes);
          await snapshotCurrentFileVersion(env, entry);
          await env.BUCKET.put(objectKey, bytes, { httpMetadata: { contentType } });
          version = await commitFileContentUpdate(
            env, entry, contentType, bytes.byteLength, md5, objectKey, expectedVersion,
            storageReservationId ? { id: storageReservationId, ownerId: principal.userId!, consumeBytes: bytes.byteLength } : undefined,
          );
        } catch (err) {
          if (storageReservationId) {
            await releaseStorageReservation(env, storageReservationId, principal.userId || undefined).catch(() => undefined);
          }
          const references = await env.DB.prepare(
            `SELECT
               EXISTS(SELECT 1 FROM entries WHERE id = ? AND COALESCE(current_object_key, id) = ?) OR
               EXISTS(SELECT 1 FROM file_versions WHERE object_key = ?) AS referenced`,
          ).bind(entry.id, objectKey, objectKey).first<{ referenced: number }>().catch(() => ({ referenced: 1 }));
          if (references && !references.referenced) await env.BUCKET.delete(objectKey).catch(() => undefined);
          const message = String((err as Error)?.message || err);
          return json({ error: message }, message.includes("file changed") ? 409 : 500);
        }
        if (saasEnabled && principal.userId) await recordUploadBytes(env, principal.userId, bytes.byteLength);
        return json({ ok: true, id, filename: entry.filename, version, md5 });
      }

      if (url.pathname === "/api/entries" && request.method === "GET") {
        const res = await env.DB.prepare(
          `SELECT
             e.id,
             e.filename,
             e.content_type,
             e.size,
             e.md5,
             COALESCE(e.version, 1) AS version,
             e.upload_time,
             COALESCE(e.updated_time, e.upload_time) AS updated_time,
             e.expiration_time,
             e.note,
             COALESCE(d.count, 0) AS download_count
           FROM entries e
           LEFT JOIN (
             SELECT entry_id, COUNT(*) AS count
             FROM download_events
             GROUP BY entry_id
           ) d ON d.entry_id = e.id
           WHERE (? IS NULL OR e.owner_id = ?)
             AND (e.expiration_time IS NULL OR datetime(e.expiration_time) > CURRENT_TIMESTAMP)
           ORDER BY e.upload_time DESC`,
        ).bind(ownerFilter ?? null, ownerFilter ?? null).all();
        return json(res.results);
      }

      if (url.pathname.startsWith("/api/entry/") && url.pathname.endsWith("/versions") && request.method === "GET") {
        const id = decodeURIComponent(url.pathname.split("/")[3] || "");
        const entry = await getEntryById(env, id, ownerFilter);
        if (!entry) return json({ error: "not found" }, 404);
        if (isExpired(entry.expiration_time)) {
          await deleteEntryById(env, id);
          return json({ error: "file expired" }, 410);
        }
        const versions = await listFileVersions(env, entry);
        return json({
          versions: versions.map(({ object_key: _objectKey, ...version }) => version),
        });
      }

      if (url.pathname.startsWith("/api/entry/") && url.pathname.includes("/versions/") && url.pathname.endsWith("/content") && request.method === "GET") {
        const parts = url.pathname.split("/");
        const id = decodeURIComponent(parts[3] || "");
        const version = Number(parts[5] || 0);
        if (!Number.isInteger(version) || version <= 0) return json({ error: "invalid version" }, 400);
        const entry = await getEntryById(env, id, ownerFilter);
        if (!entry) return json({ error: "not found" }, 404);
        if (isExpired(entry.expiration_time)) {
          await deleteEntryById(env, id);
          return json({ error: "file expired" }, 410);
        }
        let fileVersion = await getFileVersion(env, id, version);
        if (!fileVersion) {
          await listFileVersions(env, entry);
          fileVersion = await getFileVersion(env, id, version);
        }
        if (!fileVersion) return json({ error: "version not found" }, 404);

        const object = await env.BUCKET.get(fileVersion.object_key);
        if (!object) return new Response("Not Found", { status: 404, headers: withCors() });
        const h = withCors();
        object.writeHttpMetadata(h);
        h.set("Content-Disposition", `attachment; filename="${fileVersion.filename.replaceAll('"', "")}"`);
        if (fileVersion.content_type) h.set("Content-Type", fileVersion.content_type);
        if (fileVersion.md5) h.set("ETag", `"${fileVersion.md5}"`);
        return new Response(object.body, { headers: h });
      }

      if (url.pathname.startsWith("/api/entry/") && !url.pathname.endsWith("/downloads") && request.method === "GET") {
        const id = decodeURIComponent(url.pathname.split("/").pop() || "");
        const entry = await getEntryById(env, id, ownerFilter);
        if (!entry) return json({ error: "not found" }, 404);
        const expiredResponse = await rejectExpiredEntry(env, entry);
        if (expiredResponse) return expiredResponse;

        const count = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM download_events WHERE entry_id = ?",
        )
          .bind(id)
          .first<{ count: number }>();

        return json({ ...entry, download_count: Number(count?.count || 0) });
      }

      if (url.pathname.startsWith("/api/entry/") && url.pathname.endsWith("/downloads") && request.method === "GET") {
        const parts = url.pathname.split("/");
        const id = decodeURIComponent(parts[3] || "");
        const uniqueIps = url.searchParams.get("uniqueIps") === "1";
        const entry = await getEntryById(env, id, ownerFilter);
        if (!entry) return json({ error: "not found" }, 404);
        const expiredResponse = await rejectExpiredEntry(env, entry);
        if (expiredResponse) return expiredResponse;

        const totalRes = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM download_events WHERE entry_id = ?",
        ).bind(id).first<{ count: number }>();

        if (uniqueIps) {
          const events = await env.DB.prepare(
            `SELECT
               MAX(downloaded_at) AS downloaded_at,
               ip,
               user_agent
             FROM download_events
             WHERE entry_id = ?
             GROUP BY ip
             ORDER BY downloaded_at DESC`,
          ).bind(id).all();
          return json({ total: Number(totalRes?.count || 0), events: events.results });
        }

        const events = await env.DB.prepare(
          `SELECT downloaded_at, ip, user_agent
           FROM download_events
           WHERE entry_id = ?
           ORDER BY downloaded_at DESC`,
        ).bind(id).all();
        return json({ total: Number(totalRes?.count || 0), events: events.results });
      }

      if (url.pathname.startsWith("/api/entry/") && request.method === "PUT") {
        const id = decodeURIComponent(url.pathname.split("/").pop() || "");
        const entry = await getEntryById(env, id, ownerFilter);
        if (!entry) return json({ error: "not found" }, 404);
        const expiredResponse = await rejectExpiredEntry(env, entry);
        if (expiredResponse) return expiredResponse;

        const body = (await request.json()) as {
          filename?: string;
          note?: string;
          deleteAfterExpiration?: boolean;
          expirationDays?: number;
        };

        const filename = (body.filename || entry.filename).trim().slice(0, 255);
        const note = (body.note || "").trim().slice(0, 1000) || null;
        const deleteAfter = Boolean(body.deleteAfterExpiration);
        const expDays = Number(body.expirationDays || 0);
        let expiration: string | null;
        if (entitlement) {
          const expirationWasSpecified = body.deleteAfterExpiration !== undefined || body.expirationDays !== undefined;
          const allowsPermanentStorage = entitlement.limits.maxFileLifetimeDays > 30;
          if (expirationWasSpecified && (!deleteAfter || !Number.isInteger(expDays) || expDays < 0 || (expDays === 0 && !allowsPermanentStorage))) {
            return json({ error: "permanent file storage is not available on this plan" }, 400);
          }
          if (!expirationWasSpecified) {
            expiration = entry.expiration_time || expirationToISO(entitlement.limits.maxFileLifetimeDays);
          } else {
            expiration = expirationToISO(expDays === 0 ? null : Math.min(expDays, entitlement.limits.maxFileLifetimeDays));
          }
        } else {
          expiration = deleteAfter && expDays > 0 ? expirationToISO(expDays) : null;
        }

        await env.DB.prepare(
          "UPDATE entries SET filename = ?, note = ?, expiration_time = ? WHERE id = ? AND (? IS NULL OR owner_id = ?)",
        )
          .bind(filename || entry.filename, note, expiration, id, ownerFilter ?? null, ownerFilter ?? null)
          .run();

        return json({ ok: true });
      }

      if (url.pathname.startsWith("/api/entry/") && request.method === "DELETE") {
        const id = decodeURIComponent(url.pathname.split("/").pop() || "");
        const entry = await getEntryById(env, id, ownerFilter);
        if (!entry) return json({ error: "not found" }, 404);
        await deleteEntryById(env, id);
        return json({ ok: true });
      }

      if (url.pathname === "/api/guest-links" && request.method === "GET") {
        const res = await env.DB.prepare(
          "SELECT id, label, created_time, max_file_bytes, max_file_lifetime_days, max_file_uploads, url_expires, upload_count FROM guest_links WHERE (? IS NULL OR owner_id = ?) ORDER BY COALESCE(created_time, url_expires) DESC",
        ).bind(ownerFilter ?? null, ownerFilter ?? null).all();
        return json(res.results);
      }

      if (url.pathname === "/api/guest-links" && request.method === "POST") {
        const body = (await request.json()) as {
          label?: unknown;
          max_file_bytes?: unknown;
          max_file_lifetime_days?: unknown;
          max_file_uploads?: unknown;
          url_expires?: unknown;
        };

        const optionalNonNegativeInteger = (value: unknown): number | null | undefined => {
          if (value === undefined || value === null || value === "") return null;
          const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
          if (!Number.isSafeInteger(number) || number < 0) return undefined;
          return number === 0 ? null : number;
        };
        const requestedMaxFileBytes = optionalNonNegativeInteger(body.max_file_bytes);
        const requestedMaxFileLife = optionalNonNegativeInteger(body.max_file_lifetime_days);
        const maxFileUploads = optionalNonNegativeInteger(body.max_file_uploads);
        if (requestedMaxFileBytes === undefined || requestedMaxFileLife === undefined || maxFileUploads === undefined) {
          return json({ error: "guest link limits must be non-negative integers" }, 400);
        }
        if (body.label !== undefined && body.label !== null && typeof body.label !== "string") {
          return json({ error: "label must be a string" }, 400);
        }
        const urlExpires = parseDateFromUnknown(body.url_expires);
        if (body.url_expires !== undefined && body.url_expires !== null && body.url_expires !== "" && !urlExpires) {
          return json({ error: "url_expires must be a valid date" }, 400);
        }
        const id = generateID();
        const label = (typeof body.label === "string" ? body.label : "").trim().slice(0, 120) || null;
        const maxFileBytes = entitlement
          ? Math.min(requestedMaxFileBytes || entitlement.limits.maxFileBytes, entitlement.limits.maxFileBytes)
          : requestedMaxFileBytes;
        const maxFileLife = entitlement
          ? Math.min(requestedMaxFileLife || entitlement.limits.maxFileLifetimeDays, entitlement.limits.maxFileLifetimeDays)
          : requestedMaxFileLife;
        const maxUploadCount = maxFileUploads;
        const maxActiveLinks = entitlement && ownerFilter ? entitlement.limits.maxGuestLinks : null;
        const insertResult = await env.DB.prepare(
          `INSERT INTO guest_links
             (id, label, max_file_bytes, max_file_lifetime_days, max_file_uploads, url_expires, created_time, upload_count, owner_id)
           SELECT ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0, ?
           WHERE ? IS NULL OR
             (SELECT COUNT(*) FROM guest_links
              WHERE owner_id = ? AND (url_expires IS NULL OR julianday(url_expires) > julianday('now'))) < ?`,
        ).bind(
          id, label, maxFileBytes, maxFileLife, maxUploadCount, urlExpires, ownerId,
          maxActiveLinks, ownerFilter, maxActiveLinks,
        ).run();
        if (Number(insertResult.meta.changes || 0) !== 1) {
          return json({ error: "guest upload link limit reached", limit: maxActiveLinks }, 403);
        }

        return json({ id });
      }

      if (url.pathname.startsWith("/api/guest-links/") && request.method === "DELETE") {
        const id = decodeURIComponent(url.pathname.split("/").pop() || "");
        await env.DB.prepare("DELETE FROM guest_links WHERE id = ? AND (? IS NULL OR owner_id = ?)")
          .bind(id, ownerFilter ?? null, ownerFilter ?? null).run();
        return json({ ok: true });
      }

      if (url.pathname === "/api/settings" && request.method === "GET") {
        const storeForeverKey = ownerFilter ? `${ownerFilter}:store_forever` : "store_forever";
        const defaultDaysKey = ownerFilter ? `${ownerFilter}:default_expiration_days` : "default_expiration_days";
        const rows = await env.DB.prepare(
          "SELECT key, value FROM settings WHERE key IN (?, ?)",
        ).bind(storeForeverKey, defaultDaysKey).all<{ key: string; value: string }>();

        const map = new Map<string, string>();
        for (const r of rows.results) map.set(r.key, r.value);

        const defaultDaysSetting = map.get(defaultDaysKey);
        const defaultDays = Number(defaultDaysSetting ?? (entitlement ? String(entitlement.limits.maxFileLifetimeDays) : "30"));
        return json({
          storeForever: entitlement
            ? defaultDaysSetting === "0" && entitlement.limits.maxFileLifetimeDays > 30
            : boolFromSetting(map.get(storeForeverKey) ?? "1"),
          defaultDays: defaultDays === 0 ? 0 : Math.min(defaultDays, entitlement?.limits.maxFileLifetimeDays || 3650),
        });
      }

      if (url.pathname === "/api/settings" && request.method === "PUT") {
        const body = (await request.json()) as {
          storeForever?: boolean;
          defaultDays?: number;
        };

        const requestedDefaultDays = Number(body.defaultDays ?? (entitlement ? entitlement.limits.maxFileLifetimeDays : 30));
        const allowsPermanentStorage = Boolean(entitlement && entitlement.limits.maxFileLifetimeDays > 30);
        if (!Number.isInteger(requestedDefaultDays) || requestedDefaultDays < 0 || (requestedDefaultDays === 0 && !allowsPermanentStorage)) {
          return json({ error: "defaultDays must be a positive integer, or 0 for Pro permanent storage" }, 400);
        }
        if (entitlement && body.storeForever === true && !allowsPermanentStorage) {
          return json({ error: "permanent file storage is not available on this plan" }, 400);
        }
        const storeForever = entitlement
          ? (requestedDefaultDays === 0 ? "1" : "0")
          : (body.storeForever ? "1" : "0");
        const maxDays = entitlement?.limits.maxFileLifetimeDays || 3650;
        const defaultDays = String(requestedDefaultDays === 0 ? 0 : Math.min(maxDays, requestedDefaultDays));
        const storeForeverKey = ownerFilter ? `${ownerFilter}:store_forever` : "store_forever";
        const defaultDaysKey = ownerFilter ? `${ownerFilter}:default_expiration_days` : "default_expiration_days";

        await env.DB.prepare("REPLACE INTO settings(key, value) VALUES (?, ?)")
          .bind(storeForeverKey, storeForever)
          .run();
        await env.DB.prepare("REPLACE INTO settings(key, value) VALUES (?, ?)")
          .bind(defaultDaysKey, defaultDays)
          .run();

        return json({ ok: true });
      }

      if (url.pathname === "/api/system-info" && request.method === "GET") {
        const entryStats = await env.DB.prepare(
          "SELECT COALESCE(SUM(size), 0) AS total, COUNT(*) AS count FROM entries WHERE (? IS NULL OR owner_id = ?)",
        ).bind(ownerFilter ?? null, ownerFilter ?? null).first<{ total: number; count: number }>();
        const guestStats = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM guest_links WHERE (? IS NULL OR owner_id = ?)",
        ).bind(ownerFilter ?? null, ownerFilter ?? null).first<{ count: number }>();
        const downloadStats = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM download_events d WHERE (? IS NULL OR EXISTS (SELECT 1 FROM entries e WHERE e.id = d.entry_id AND e.owner_id = ?))",
        ).bind(ownerFilter ?? null, ownerFilter ?? null).first<{ count: number }>();

        const uploadDataBytes = Number(entryStats?.total || 0);

        return json({
          upload_data_bytes: uploadDataBytes,
          db_entry_count: Number(entryStats?.count || 0),
          db_guest_link_count: Number(guestStats?.count || 0),
          download_count: Number(downloadStats?.count || 0),
        });
      }

      return json({ error: "Not Found" }, 404);
    }

    if (request.method === "GET") {
      const rawPath = url.pathname.slice(1);
      const isSingleSegment = rawPath.length > 0 && !rawPath.includes("/");
      const notReservedPrefix = !url.pathname.startsWith("/-") && !url.pathname.startsWith("/_preview/");
      if (isSingleSegment && notReservedPrefix) {
        const decoded = decodeURIComponent(rawPath);
        const slug = sanitizeClipboardSlug(decoded);
        if (slug) {
          let publicId: string | null = null;
          if (saasEnabled) {
            const principal = await resolvePrincipal(request, env, auth, true);
            if (!principal) return Response.redirect(new URL("/account", url).toString(), 302);
            const mapping = await getSaasClipboardMapping(env, principal.ownerId, slug);
            publicId = mapping?.public_id || null;
          }
          if (decoded !== slug) {
            return Response.redirect(new URL(`/${encodeURIComponent(slug)}`, url).toString(), 302);
          }
          return new Response(clipboardDetailPage(slug, saasEnabled, publicId), {
            headers: withCors({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }),
          });
        }
      }
    }

    return new Response(htmlPage(saasEnabled, googleLoginEnabled), {
      headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
    });
  },
};
