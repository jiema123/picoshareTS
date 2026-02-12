import { describe, expect, it } from "vitest";
import {
  cleanupExpiredEntries,
  escapeHtml,
  expirationToISO,
  isExpired,
  parseDateFromUnknown,
  parseExpirationDays,
} from "../src/index";

describe("parseExpirationDays", () => {
  it("returns null for empty or invalid input", () => {
    expect(parseExpirationDays(null)).toBeNull();
    expect(parseExpirationDays("0")).toBeNull();
    expect(parseExpirationDays("-8")).toBeNull();
    expect(parseExpirationDays("abc")).toBeNull();
  });

  it("returns positive numbers and caps very large values", () => {
    expect(parseExpirationDays("1")).toBe(1);
    expect(parseExpirationDays("3651")).toBe(3650);
  });
});

describe("expirationToISO and isExpired", () => {
  it("returns null when no expiration days is set", () => {
    expect(expirationToISO(null)).toBeNull();
    expect(expirationToISO(0)).toBeNull();
  });

  it("generates a future timestamp and handles expiration checks", () => {
    const iso = expirationToISO(1);
    expect(iso).toBeTruthy();
    expect(isExpired(iso)).toBe(false);
    expect(isExpired("2000-01-01T00:00:00.000Z")).toBe(true);
    expect(isExpired("not-a-date")).toBe(false);
    expect(isExpired(null)).toBe(false);
  });
});

describe("parseDateFromUnknown", () => {
  it("parses valid string dates", () => {
    expect(parseDateFromUnknown("2026-02-11T00:00:00Z")).toBe("2026-02-11T00:00:00.000Z");
  });

  it("returns null for invalid values", () => {
    expect(parseDateFromUnknown("")).toBeNull();
    expect(parseDateFromUnknown(123)).toBeNull();
    expect(parseDateFromUnknown("invalid")).toBeNull();
  });
});

describe("escapeHtml", () => {
  it("escapes dangerous html characters", () => {
    expect(escapeHtml("<script>alert('x')</script>"))
      .toBe("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  });
});

describe("cleanupExpiredEntries", () => {
  it("deletes expired entries from bucket and db tables", async () => {
    const deletedFromBucket: string[] = [];
    const deletedEvents: string[] = [];
    const deletedEntries: string[] = [];

    const env = {
      BUCKET: {
        delete: async (id: string) => {
          deletedFromBucket.push(id);
        },
      },
      DB: {
        prepare: (sql: string) => ({
          bind: (...args: unknown[]) => ({
            all: async () => {
              if (sql.includes("SELECT id") && sql.includes("FROM entries")) {
                expect(args[0]).toBe("2026-02-11T00:00:00.000Z");
                return { results: [{ id: "exp-1" }, { id: "exp-2" }] };
              }
              return { results: [] };
            },
            run: async () => {
              if (sql.includes("DELETE FROM download_events")) {
                deletedEvents.push(String(args[0]));
              }
              if (sql.includes("DELETE FROM entries")) {
                deletedEntries.push(String(args[0]));
              }
              return {};
            },
          }),
        }),
      },
    } as unknown as Parameters<typeof cleanupExpiredEntries>[0];

    const count = await cleanupExpiredEntries(env, "2026-02-11T00:00:00.000Z", 100);

    expect(count).toBe(2);
    expect(deletedFromBucket).toEqual(["exp-1", "exp-2"]);
    expect(deletedEvents).toEqual(["exp-1", "exp-2"]);
    expect(deletedEntries).toEqual(["exp-1", "exp-2"]);
  });

  it("returns 0 when no expired entries exist", async () => {
    const env = {
      BUCKET: {
        delete: async () => {},
      },
      DB: {
        prepare: (_sql: string) => ({
          bind: () => ({
            all: async () => ({ results: [] }),
            run: async () => ({}),
          }),
        }),
      },
    } as unknown as Parameters<typeof cleanupExpiredEntries>[0];

    const count = await cleanupExpiredEntries(env, "2026-02-11T00:00:00.000Z", 10);
    expect(count).toBe(0);
  });
});
