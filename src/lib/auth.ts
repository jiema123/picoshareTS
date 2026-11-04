import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export function isSaasEnabled(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

export function createAuth(env: AuthEnv, requestUrl: string) {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters when SaaS mode is enabled");
  }

  const origin = new URL(requestUrl).origin;
  const configuredBaseURL = env.BETTER_AUTH_URL?.trim() || origin;
  const parsedBaseURL = new URL(configuredBaseURL);
  if (parsedBaseURL.protocol !== "https:" && parsedBaseURL.protocol !== "http:") {
    throw new Error("BETTER_AUTH_URL must use http or https");
  }
  const baseURL = parsedBaseURL.origin;
  const trustedOrigins = new Set([baseURL]);
  if (parsedBaseURL.hostname === "localhost" || parsedBaseURL.hostname === "127.0.0.1") {
    const localAlias = new URL(baseURL);
    localAlias.hostname = parsedBaseURL.hostname === "localhost" ? "127.0.0.1" : "localhost";
    trustedOrigins.add(localAlias.origin);
  }
  const socialProviders = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {};

  return betterAuth({
    database: env.DB,
    baseURL,
    basePath: "/api/auth",
    secret,
    trustedOrigins: [...trustedOrigins],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: false,
    },
    socialProviders,
    plugins: [
      apiKey({
        defaultPrefix: "ps_live_",
        requireName: true,
        startingCharactersConfig: { charactersLength: 12 },
        rateLimit: { enabled: false },
      }),
    ],
  });
}

export async function migrateAuthSchema(auth: ReturnType<typeof createAuth>): Promise<void> {
  const migration = await getMigrations(auth.options);
  await migration.runMigrations();
}
