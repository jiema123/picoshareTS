import { describe, expect, it } from "vitest";
import {
  calculateClipboardStats,
  clipboardPasswordStorageKey,
  cleanupExpiredEntries,
  escapeHtml,
  expirationToISO,
  isExpired,
  normalizeClipboardPassword,
  parseMultipartPartNumber,
  parseDateFromUnknown,
  parseExpirationDays,
  shouldUseMultipartUpload,
  sanitizeClipboardSlug,
  sha256Hex,
  verifyClipboardPassword,
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

describe("parseMultipartPartNumber", () => {
  it("accepts positive integer part numbers", () => {
    expect(parseMultipartPartNumber("1")).toBe(1);
    expect(parseMultipartPartNumber("9999")).toBe(9999);
  });

  it("rejects invalid part numbers", () => {
    expect(parseMultipartPartNumber(null)).toBeNull();
    expect(parseMultipartPartNumber("0")).toBeNull();
    expect(parseMultipartPartNumber("-3")).toBeNull();
    expect(parseMultipartPartNumber("1.5")).toBeNull();
    expect(parseMultipartPartNumber("abc")).toBeNull();
  });
});

describe("shouldUseMultipartUpload", () => {
  it("uses normal upload for files smaller than 100MB", () => {
    expect(shouldUseMultipartUpload(99 * 1024 * 1024)).toBe(false);
    expect(shouldUseMultipartUpload(0)).toBe(false);
  });

  it("uses multipart upload for files at or above 100MB", () => {
    expect(shouldUseMultipartUpload(100 * 1024 * 1024)).toBe(true);
    expect(shouldUseMultipartUpload(101 * 1024 * 1024)).toBe(true);
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

describe("sanitizeClipboardSlug", () => {
  it("accepts readable names and normalizes spaces", () => {
    expect(sanitizeClipboardSlug("Alice")).toBe("alice");
    expect(sanitizeClipboardSlug("  Team Board  ")).toBe("team-board");
    expect(sanitizeClipboardSlug("张三的便签")).toBe("张三的便签");
    expect(sanitizeClipboardSlug("A_B-C")).toBe("a_b-c");
  });

  it("returns null for invalid or reserved names", () => {
    expect(sanitizeClipboardSlug("")).toBeNull();
    expect(sanitizeClipboardSlug("  ")).toBeNull();
    expect(sanitizeClipboardSlug("api")).toBeNull();
    expect(sanitizeClipboardSlug("guest")).toBeNull();
    expect(sanitizeClipboardSlug("-hidden")).toBeNull();
    expect(sanitizeClipboardSlug("a".repeat(65))).toBeNull();
    expect(sanitizeClipboardSlug("name/with/slash")).toBeNull();
    expect(sanitizeClipboardSlug("bad<script>")).toBeNull();
  });
});

describe("calculateClipboardStats", () => {
  it("returns stats for empty content", () => {
    expect(calculateClipboardStats("")).toEqual({ itemCount: 0, lineCount: 0, charCount: 0 });
    expect(calculateClipboardStats("   ")).toEqual({ itemCount: 0, lineCount: 0, charCount: 0 });
  });

  it("counts non-empty lines and chars", () => {
    const text = "first line\n\nsecond line\n第三行";
    expect(calculateClipboardStats(text)).toEqual({
      itemCount: 3,
      lineCount: 4,
      charCount: text.length,
    });
  });
});

describe("clipboard password helpers", () => {
  it("normalizes password with validation", () => {
    expect(normalizeClipboardPassword("  abc123  ")).toBe("abc123");
    expect(normalizeClipboardPassword("")).toBeNull();
    expect(normalizeClipboardPassword("  ")).toBeNull();
    expect(normalizeClipboardPassword("a".repeat(129))).toBeNull();
    expect(normalizeClipboardPassword(123)).toBeNull();
  });

  it("hashes and verifies password", async () => {
    const hash = await sha256Hex("my-secret");
    expect(hash).toHaveLength(64);
    expect(await verifyClipboardPassword(hash, "my-secret")).toBe(true);
    expect(await verifyClipboardPassword(hash, "wrong")).toBe(false);
  });

  it("builds deterministic local storage key", () => {
    expect(clipboardPasswordStorageKey("alice")).toBe("ps_clip_pw_alice");
    expect(clipboardPasswordStorageKey("张三")).toBe("ps_clip_pw_%E5%BC%A0%E4%B8%89");
  });
});
