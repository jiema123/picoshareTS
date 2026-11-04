const DEFAULT_OPCPAY_API_BASE_URL = "https://pay.66opc.com/api/pay/v1";

export interface OpcPayEnv {
  OPCPAY_API_KEY?: string;
  OPCPAY_API_BASE_URL?: string;
}

export interface OpcPayChargingOption {
  sku_id: string;
  plan_id?: string;
  display_name: string;
  billing_mode: string;
  price: string;
  currency: string;
  duration_period?: "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  entitlement_rule?: string;
}

export interface OpcPayProduct {
  capability_status?: string;
  billing_mode?: string;
  charging_options?: OpcPayChargingOption[];
  product_name?: string;
}

export interface OpcPayAccess {
  access_granted?: boolean;
  decision?: string;
  valid_from?: string;
  valid_until?: string;
  purchase_url?: string;
  purchase_qr_code?: string;
  [key: string]: unknown;
}

export interface OpcPayPurchase {
  status?: string;
  purchase_url?: string;
  purchase_qr_code?: string;
  expire_time?: string;
  [key: string]: unknown;
}

export class OpcPayApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "OpcPayApiError";
  }
}

function apiBase(env: OpcPayEnv): string {
  return (env.OPCPAY_API_BASE_URL || DEFAULT_OPCPAY_API_BASE_URL).replace(/\/+$/, "");
}

async function callOpcPay<T>(env: OpcPayEnv, path: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<T> {
  const key = env.OPCPAY_API_KEY?.trim();
  if (!key) throw new Error("OPCPAY_API_KEY is not configured");
  const response = await fetch(`${apiBase(env)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const requestId = response.headers.get("X-Request-ID") || "";
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof payload.code === "string" ? payload.code : "OPCPAY_ERROR";
    const message = typeof payload.message === "string" ? payload.message : `OPCPay request failed (${response.status})`;
    throw new OpcPayApiError(response.status, code, `${message}${requestId ? ` [request_id: ${requestId}]` : ""}`);
  }
  return payload as T;
}

export async function getOpcPayProduct(env: OpcPayEnv): Promise<OpcPayProduct> {
  return callOpcPay<OpcPayProduct>(env, "/product", "GET");
}

export async function getOpcPayAccess(env: OpcPayEnv, userId: string): Promise<OpcPayAccess> {
  return callOpcPay<OpcPayAccess>(env, "/access", "POST", { user_id: userId });
}

export async function createOpcPayPurchase(
  env: OpcPayEnv,
  input: { userId: string; idempotencyKey: string; skuId: string; callbackUrl: string },
): Promise<OpcPayPurchase> {
  return callOpcPay<OpcPayPurchase>(env, "/purchase", "POST", {
    user_id: input.userId,
    idempotency_key: input.idempotencyKey,
    sku_id: input.skuId,
    callback_url: input.callbackUrl,
  });
}
