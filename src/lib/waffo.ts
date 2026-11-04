/**
 * Small Cloudflare Workers client for the Waffo Pancake checkout and webhook
 * flows used by PicoShare's SaaS billing layer.
 *
 * The official @waffo/pancake-ts package currently imports Node's `crypto`
 * module. This module intentionally uses only `fetch` and Web Crypto so the
 * Worker does not need `nodejs_compat`.
 */

const DEFAULT_WAFFO_API_BASE_URL = "https://api.waffo.ai";
const DEFAULT_WEBHOOK_TOLERANCE_MS = 45 * 60 * 1000;
const DEFAULT_WEBHOOK_FUTURE_TOLERANCE_MS = 60 * 1000;
const BUILTIN_TEST_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxnmRY6yMMA3lVqmAU6ZG
b1sjL/+r/z6E+ZjkXaDAKiqOhk9rpazni0bNsGXwmftTPk9jy2wn+j6JHODD/WH/
SCnSfvKkLIjy4Hk7BuCgB174C0ydan7J+KgXLkOwgCAxxB68t2tezldwo74ZpXgn
F49opzMvQ9prEwIAWOE+kV9iK6gx/AckSMtHIHpUesoPDkldpmFHlB2qpf1vsFTZ
5kD6DmGl+2GIVK01aChy2lk8pLv0yUMu18v44sLkO5M44TkGPJD9qG09wrvVG2wp
OTVCn1n5pP8P+HRLcgzbUB3OlZVfdFurn6EZwtyL4ZD9kdkQ4EZE/9inKcp3c1h4
xwIDAQAB
-----END PUBLIC KEY-----`;
const BUILTIN_PROD_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz+xApdTIb4ua+DgZKQ54
iBsD82ybyhGCLRETONW4Jgbb3A8DUM1LqBk6r/CmTOCHqLalTQHNigvP3R5zkDNX
iRJz6gA4MJ/+8K0+mnEE2RISQzN+Qu65TNd6svb+INm/kMaftY4uIXr6y6kchtTJ
dwnQhcKdAL2v7h7IFnkVelQsKxDdb2PqX8xX/qwd01iXvMcpCCaXovUwZsxH2QN5
ZKBTseJivbhUeyJCco4fdUyxOMHe2ybCVhyvim2uxAl1nkvL5L8RCWMCAV55LLo0
9OhmLahz/DYNu13YLVP6dvIT09ZFBYU6Owj1NxdinTynlJCFS9VYwBgmftosSE1U
dwIDAQAB
-----END PUBLIC KEY-----`;

export type WaffoEnvironment = "test" | "prod";

export interface WaffoEnv {
  WAFFO_ENV?: WaffoEnvironment;
  WAFFO_MERCHANT_ID?: string;
  WAFFO_PRIVATE_KEY?: string;
  WAFFO_STORE_ID?: string;
  WAFFO_API_BASE_URL?: string;
  WAFFO_WEBHOOK_PUBLIC_KEY?: string;
  WAFFO_WEBHOOK_TEST_PUBLIC_KEY?: string;
  WAFFO_WEBHOOK_PROD_PUBLIC_KEY?: string;
}

export interface WaffoCheckoutInput {
  /** Pancake subscription product ID (for example, `PROD_...`). */
  productId: string;
  /** Stable PicoShare user ID used as Pancake's merchant-side buyer identity. */
  buyerIdentity: string;
  /** PicoShare order reference stored on Pancake's order and webhook payload. */
  orderReference: string;
  /** ISO 4217 currency code, for example `USD`. */
  currency: string;
  /** Absolute success URL shown by Pancake after checkout. */
  successUrl: string;
  /**
   * PicoShare fallback URL for a user who closes the hosted checkout. Pancake
   * currently has no `cancelUrl` field, so this is returned to the caller and
   * deliberately not sent to Pancake.
   */
  cancelUrl?: string;
  /** Optional email prefill for the hosted checkout page. */
  buyerEmail?: string;
  /** Optional trial override for the subscription product. */
  withTrial?: boolean;
  /** Optional checkout session lifetime in seconds. */
  expiresInSeconds?: number;
  /** Optional metadata attached to the Pancake checkout session. */
  metadata?: Record<string, string>;
  /** Optional idempotency key for safe retries of the checkout write. */
  idempotencyKey?: string;
}

export interface WaffoCheckoutResult {
  sessionId: string;
  checkoutUrl: string;
  expiresAt?: string;
  token: string;
  tokenExpiresAt?: string;
  /** The local fallback supplied in the input; Pancake does not process it. */
  cancelUrl?: string;
}

export interface WaffoCustomerPortalLinkResult {
  /** Hosted Pancake customer portal URL with the session token in its fragment. */
  portalUrl: string;
  /** Pancake customer-session expiry, when returned by the platform. */
  expiresAt?: string;
  /** The short-lived customer-session token, retained for callers that need it. */
  token: string;
}

export interface WaffoWebhookEvent<T = WaffoWebhookEventData> {
  id: string;
  timestamp: string;
  eventType: string;
  eventId: string;
  storeId: string;
  storeName: string;
  mode: string;
  data: T;
  [key: string]: unknown;
}

export interface WaffoWebhookEventData {
  productId?: string;
  orderId?: string;
  orderStatus?: string;
  buyerEmail?: string;
  merchantProvidedBuyerIdentity?: string;
  orderMerchantExternalId?: string;
  currency?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  billingPeriod?: string;
  [key: string]: unknown;
}

export interface VerifyWaffoWebhookOptions {
  /** Explicit public key override for this request. */
  publicKey?: string;
  /** Selects the test or production key when both are configured. */
  environment?: WaffoEnvironment;
  /** Set to 0 to disable timestamp replay protection (use only in tests). */
  toleranceMs?: number;
  /** Maximum timestamp skew into the future. */
  futureToleranceMs?: number;
}

interface WaffoErrorDetail {
  message?: string;
  layer?: string;
  [key: string]: unknown;
}

interface WaffoEnvelope<T = unknown> {
  data?: T;
  errors?: WaffoErrorDetail[];
  warnings?: unknown[];
  [key: string]: unknown;
}

export class WaffoApiError extends Error {
  readonly status: number;
  readonly errors: WaffoErrorDetail[];

  constructor(status: number, errors: WaffoErrorDetail[]) {
    super(errors[0]?.message || `Waffo API request failed with HTTP ${status}`);
    this.name = "WaffoApiError";
    this.status = status;
    this.errors = errors;
  }
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function validateUrl(value: string, field: string): string {
  const normalized = asNonEmptyString(value, field);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${field} must be an absolute http(s) URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${field} must be an absolute http(s) URL`);
  }
  return parsed.toString();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function derLength(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function derTlv(tag: number, value: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array([tag]), derLength(value.length), value);
}

function derSequence(...parts: Uint8Array[]): Uint8Array {
  return derTlv(0x30, concatBytes(...parts));
}

function derOctetString(value: Uint8Array): Uint8Array {
  return derTlv(0x04, value);
}

function derBitString(value: Uint8Array): Uint8Array {
  return derTlv(0x03, concatBytes(new Uint8Array([0]), value));
}

const RSA_ENCRYPTION_ALGORITHM = new Uint8Array([
  0x30,
  0x0d,
  0x06,
  0x09,
  0x2a,
  0x86,
  0x48,
  0x86,
  0xf7,
  0x0d,
  0x01,
  0x01,
  0x01,
  0x05,
  0x00,
]);

function wrapPkcs1PrivateKeyAsPkcs8(pkcs1: Uint8Array): Uint8Array {
  return derSequence(derTlv(0x02, new Uint8Array([0])), RSA_ENCRYPTION_ALGORITHM, derOctetString(pkcs1));
}

function wrapPkcs1PublicKeyAsSpki(pkcs1: Uint8Array): Uint8Array {
  return derSequence(RSA_ENCRYPTION_ALGORITHM, derBitString(pkcs1));
}

interface ParsedPem {
  der: Uint8Array;
  kind: "pkcs8" | "pkcs1" | "spki" | "pkcs1-public" | "raw";
}

function parsePem(raw: string): ParsedPem {
  const normalized = asNonEmptyString(raw, "key")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
  const isPrivatePkcs1 = normalized.includes("BEGIN RSA PRIVATE KEY");
  const isPrivatePkcs8 = normalized.includes("BEGIN PRIVATE KEY");
  const isPublicPkcs1 = normalized.includes("BEGIN RSA PUBLIC KEY");
  const isPublicSpki = normalized.includes("BEGIN PUBLIC KEY");
  const base64 = normalized
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("Waffo key is not valid PEM or base64");
  }
  return {
    der: base64ToBytes(base64),
    kind: isPrivatePkcs1
      ? "pkcs1"
      : isPrivatePkcs8
        ? "pkcs8"
        : isPublicPkcs1
          ? "pkcs1-public"
          : isPublicSpki
            ? "spki"
            : "raw",
  };
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

async function importPrivateKey(raw: string): Promise<CryptoKey> {
  const parsed = parsePem(raw);
  const candidates = parsed.kind === "pkcs1" ? [wrapPkcs1PrivateKeyAsPkcs8(parsed.der)] : [parsed.der];
  if (parsed.kind === "raw") candidates.push(wrapPkcs1PrivateKeyAsPkcs8(parsed.der));
  for (const candidate of candidates) {
    try {
      return await crypto.subtle.importKey(
        "pkcs8",
        asArrayBuffer(candidate),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      );
    } catch {
      // Try the next supported DER representation.
    }
  }
  throw new Error("Waffo private key could not be imported; use a PKCS#8 or PKCS#1 RSA key");
}

async function importPublicKey(raw: string): Promise<CryptoKey> {
  const parsed = parsePem(raw);
  const candidates = parsed.kind === "pkcs1-public" ? [wrapPkcs1PublicKeyAsSpki(parsed.der)] : [parsed.der];
  if (parsed.kind === "raw") candidates.push(wrapPkcs1PublicKeyAsSpki(parsed.der));
  for (const candidate of candidates) {
    try {
      return await crypto.subtle.importKey(
        "spki",
        asArrayBuffer(candidate),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
    } catch {
      // Try the next supported DER representation.
    }
  }
  throw new Error("Waffo webhook public key could not be imported; use an SPKI or PKCS#1 RSA key");
}

async function sha256Base64(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

async function signCanonicalRequest(
  method: string,
  path: string,
  timestamp: string,
  body: string,
  privateKey: CryptoKey,
): Promise<string> {
  const bodyHash = await sha256Base64(body);
  const canonical = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(canonical),
  );
  return bytesToBase64(new Uint8Array(signature));
}

async function signedPost<T>(
  env: WaffoEnv,
  privateKey: CryptoKey,
  path: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const serializedBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await signCanonicalRequest("POST", path, timestamp, serializedBody, privateKey);
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Merchant-Id": asNonEmptyString(env.WAFFO_MERCHANT_ID, "WAFFO_MERCHANT_ID"),
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  });
  if (env.WAFFO_ENV) headers.set("X-Environment", env.WAFFO_ENV);
  if (idempotencyKey) headers.set("X-Idempotency-Key", idempotencyKey);

  const baseUrl = (env.WAFFO_API_BASE_URL || DEFAULT_WAFFO_API_BASE_URL).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: serializedBody,
  });
  const rawResponse = await response.text();
  let envelope: WaffoEnvelope<T>;
  try {
    envelope = JSON.parse(rawResponse) as WaffoEnvelope<T>;
  } catch {
    throw new WaffoApiError(response.status, [{ message: `Non-JSON response from ${path}`, layer: "sdk" }]);
  }
  if (!response.ok || (Array.isArray(envelope.errors) && envelope.errors.length > 0)) {
    throw new WaffoApiError(response.status, envelope.errors || [{ message: `Waffo request failed for ${path}` }]);
  }
  if (envelope.data && typeof envelope.data === "object") return envelope.data;
  return envelope as unknown as T;
}

function validateCheckoutInput(input: WaffoCheckoutInput): void {
  asNonEmptyString(input.productId, "productId");
  asNonEmptyString(input.buyerIdentity, "buyerIdentity");
  const orderReference = asNonEmptyString(input.orderReference, "orderReference");
  if (orderReference.length > 128) throw new Error("orderReference must be at most 128 characters");
  const currency = asNonEmptyString(input.currency, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a 3-letter uppercase ISO 4217 code");
  validateUrl(input.successUrl, "successUrl");
  if (input.cancelUrl) validateUrl(input.cancelUrl, "cancelUrl");
  if (input.expiresInSeconds !== undefined && (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds <= 0)) {
    throw new Error("expiresInSeconds must be a positive integer");
  }
}

/**
 * Create a Pancake authenticated subscription checkout session.
 *
 * Pancake's authenticated flow is two signed requests: issue a customer token,
 * then create the checkout session. The returned URL includes the token as a
 * fragment. The caller should redirect immediately and avoid logging it.
 */
export async function createWaffoSubscriptionCheckout(
  env: WaffoEnv,
  input: WaffoCheckoutInput,
): Promise<WaffoCheckoutResult> {
  asNonEmptyString(env.WAFFO_MERCHANT_ID, "WAFFO_MERCHANT_ID");
  const privateKey = await importPrivateKey(asNonEmptyString(env.WAFFO_PRIVATE_KEY, "WAFFO_PRIVATE_KEY"));
  validateCheckoutInput(input);

  const token = await signedPost<{ token?: string; expiresAt?: string }>(
    env,
    privateKey,
    "/v1/actions/auth/issue-session-token",
    { productId: input.productId, buyerIdentity: input.buyerIdentity },
  );
  if (!token.token) throw new Error("Waffo did not return a checkout session token");

  const sessionBody: Record<string, unknown> = {
    productId: input.productId,
    currency: input.currency,
    successUrl: validateUrl(input.successUrl, "successUrl"),
    orderMerchantExternalId: input.orderReference,
  };
  if (input.buyerEmail) sessionBody.buyerEmail = input.buyerEmail;
  if (input.withTrial !== undefined) sessionBody.withTrial = input.withTrial;
  if (input.expiresInSeconds !== undefined) sessionBody.expiresInSeconds = input.expiresInSeconds;
  if (input.metadata) sessionBody.metadata = input.metadata;

  const session = await signedPost<{ sessionId?: string; checkoutUrl?: string; expiresAt?: string }>(
    env,
    privateKey,
    "/v1/actions/checkout/create-session",
    sessionBody,
    input.idempotencyKey,
  );
  if (!session.sessionId || !session.checkoutUrl) {
    throw new Error("Waffo did not return a checkout session URL");
  }

  return {
    sessionId: session.sessionId,
    checkoutUrl: `${session.checkoutUrl}#token=${encodeURIComponent(token.token)}`,
    expiresAt: session.expiresAt,
    token: token.token,
    tokenExpiresAt: token.expiresAt,
    cancelUrl: input.cancelUrl,
  };
}

/**
 * Create a short-lived Pancake customer-portal link for a signed-in PicoShare
 * user. The caller must supply the same buyer identity used at checkout.
 */
export async function createWaffoCustomerPortalLink(
  env: WaffoEnv,
  input: { buyerIdentity: string; storeId?: string },
): Promise<WaffoCustomerPortalLinkResult> {
  asNonEmptyString(env.WAFFO_MERCHANT_ID, "WAFFO_MERCHANT_ID");
  const privateKey = await importPrivateKey(asNonEmptyString(env.WAFFO_PRIVATE_KEY, "WAFFO_PRIVATE_KEY"));
  const buyerIdentity = asNonEmptyString(input.buyerIdentity, "buyerIdentity");
  const storeId = asNonEmptyString(input.storeId || env.WAFFO_STORE_ID, "storeId");

  const result = await signedPost<{ token?: string; expiresAt?: string; portalUrl?: string }>(
    env,
    privateKey,
    "/v1/actions/auth/issue-session-token",
    { storeId, buyerIdentity, purpose: "portal" },
  );
  if (!result.portalUrl || !result.token) {
    throw new Error("Waffo did not return a customer portal URL and token");
  }

  return {
    portalUrl: `${result.portalUrl}#token=${encodeURIComponent(result.token)}`,
    expiresAt: result.expiresAt,
    token: result.token,
  };
}

function parseSignatureHeader(signatureHeader: string): { timestamp: string; signatures: string[] } {
  const values = new Map<string, string[]>();
  for (const part of signatureHeader.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key || !value) continue;
    const current = values.get(key) || [];
    current.push(value);
    values.set(key, current);
  }
  const timestamp = values.get("t")?.[0];
  const signatures = values.get("v1") || [];
  if (!timestamp || signatures.length === 0) {
    throw new Error("Malformed X-Waffo-Signature header: missing t or v1");
  }
  return { timestamp, signatures };
}

function publicKeysForVerification(env: WaffoEnv, environment?: WaffoEnvironment): string[] {
  if (environment === "test") {
    return [env.WAFFO_WEBHOOK_TEST_PUBLIC_KEY, env.WAFFO_WEBHOOK_PUBLIC_KEY, BUILTIN_TEST_WEBHOOK_PUBLIC_KEY].filter(
      (value): value is string => Boolean(value && value.trim()),
    );
  }
  if (environment === "prod") {
    return [env.WAFFO_WEBHOOK_PROD_PUBLIC_KEY, env.WAFFO_WEBHOOK_PUBLIC_KEY, BUILTIN_PROD_WEBHOOK_PUBLIC_KEY].filter(
      (value): value is string => Boolean(value && value.trim()),
    );
  }
  return [
    env.WAFFO_WEBHOOK_PROD_PUBLIC_KEY,
    env.WAFFO_WEBHOOK_TEST_PUBLIC_KEY,
    env.WAFFO_WEBHOOK_PUBLIC_KEY,
    BUILTIN_PROD_WEBHOOK_PUBLIC_KEY,
    BUILTIN_TEST_WEBHOOK_PUBLIC_KEY,
  ].filter((value): value is string => Boolean(value && value.trim()));
}

/** Verify and parse a Waffo webhook from a raw Worker Request body. */
export async function verifyWaffoWebhook<T = WaffoWebhookEventData>(
  request: Request,
  env: WaffoEnv,
  options: VerifyWaffoWebhookOptions = {},
): Promise<WaffoWebhookEvent<T>> {
  const payload = await request.text();
  return verifyWaffoWebhookPayload<T>(payload, request.headers.get("X-Waffo-Signature"), env, options);
}

/** Verify and parse a Waffo webhook when the raw body has already been read. */
export async function verifyWaffoWebhookPayload<T = WaffoWebhookEventData>(
  payload: string,
  signatureHeader: string | null | undefined,
  env: WaffoEnv,
  options: VerifyWaffoWebhookOptions = {},
): Promise<WaffoWebhookEvent<T>> {
  if (!signatureHeader) throw new Error("Missing X-Waffo-Signature header");
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  const toleranceMs = options.toleranceMs ?? DEFAULT_WEBHOOK_TOLERANCE_MS;
  if (toleranceMs > 0) {
    const timestampValue = Number(timestamp);
    const timestampMs = timestampValue < 10_000_000_000 ? timestampValue * 1000 : timestampValue;
    if (!Number.isFinite(timestampMs)) throw new Error("Invalid timestamp in X-Waffo-Signature header");
    const ageMs = Date.now() - timestampMs;
    const futureToleranceMs = options.futureToleranceMs ?? DEFAULT_WEBHOOK_FUTURE_TOLERANCE_MS;
    if (ageMs > toleranceMs || ageMs < -futureToleranceMs) {
      throw new Error("Webhook timestamp outside tolerance window (possible replay attack)");
    }
  }

  const keys = options.publicKey ? [options.publicKey] : publicKeysForVerification(env, options.environment || env.WAFFO_ENV);
  if (keys.length === 0) {
    throw new Error("Missing Waffo webhook public key; configure WAFFO_WEBHOOK_PUBLIC_KEY");
  }
  const signatureInput = new TextEncoder().encode(`${timestamp}.${payload}`);
  let verified = false;
  for (const keyValue of keys) {
    const publicKey = await importPublicKey(keyValue);
    for (const signature of signatures) {
      try {
        if (
          await crypto.subtle.verify(
            { name: "RSASSA-PKCS1-v1_5" },
            publicKey,
            base64ToBytes(signature),
            signatureInput,
          )
        ) {
          verified = true;
          break;
        }
      } catch {
        // A malformed signature or incompatible key is simply not a match.
      }
    }
    if (verified) break;
  }
  if (!verified) throw new Error("Invalid Waffo webhook signature");

  try {
    return JSON.parse(payload) as WaffoWebhookEvent<T>;
  } catch {
    throw new Error("Waffo webhook body is not valid JSON");
  }
}
