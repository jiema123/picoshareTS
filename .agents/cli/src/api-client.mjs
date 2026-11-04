import { open, mkdir, readFile, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_NOTE_LENGTH = 1_000_000;
const MAX_FILE_NOTE_LENGTH = 1_000;

const MIME_TYPES = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".gif", "image/gif"],
  [".htm", "text/html; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json"],
  [".md", "text/markdown; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".xml", "application/xml"],
  [".zip", "application/zip"],
]);

export class PicoShareError extends Error {
  constructor(message, { code = "PICOSHARE_ERROR", status, details, fix } = {}) {
    super(message);
    this.name = "PicoShareError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.fix = fix;
  }
}

function normalizeBaseUrl(value) {
  if (!value) {
    throw new PicoShareError(
      "PicoShare base URL is not configured.",
      { code: "CONFIG_MISSING", fix: "Set PICOSHARE_BASE_URL or pass --base-url." },
    );
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new PicoShareError("PICOSHARE_BASE_URL must be a valid HTTP(S) URL.", {
      code: "CONFIG_INVALID",
      fix: "Use a URL such as https://share.example.com, without query parameters or fragments.",
    });
  }

  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new PicoShareError("Base URL must be HTTP(S) and must not contain credentials, query parameters, or fragments.", {
      code: "CONFIG_INVALID",
    });
  }
  if (parsed.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) {
    throw new PicoShareError("HTTP is allowed only for a local PicoShare server; use HTTPS for remote services.", {
      code: "CONFIG_INVALID",
    });
  }

  return parsed.toString().replace(/\/+$/, "");
}

function parseResponseBody(response, text) {
  if (!text) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function apiError(response, payload) {
  const message = typeof payload === "object" && payload !== null && typeof payload.error === "string"
    ? payload.error
    : typeof payload === "string" && payload.trim()
      ? payload.trim().slice(0, 500)
      : response.statusText || `HTTP ${response.status}`;

  let fix;
  if (response.status === 401 && /password/i.test(message)) {
    fix = "Set the correct PICOSHARE_CLIP_PASSWORD or choose the environment variable named by --password-env.";
  } else if (response.status === 401) {
    fix = "Check that the API Key belongs to the account that owns this resource.";
  }
  else if (response.status === 413) fix = "Check the plan's per-file and total storage limits.";
  else if (response.status === 429) fix = "The account's monthly API request limit may be reached; check the subscription usage.";

  return new PicoShareError(message, {
    code: `HTTP_${response.status}`,
    status: response.status,
    details: payload,
    fix,
  });
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function safeFilename(value) {
  const name = basename(String(value || "download"));
  return name && name !== "." ? name : "download";
}

function mimeTypeFor(filePath) {
  return MIME_TYPES.get(extname(filePath).toLowerCase()) || "application/octet-stream";
}

function validateFileNote(note) {
  if (note != null && note.length > MAX_FILE_NOTE_LENGTH) {
    throw new PicoShareError(`File note must be ${MAX_FILE_NOTE_LENGTH} characters or fewer.`, { code: "INVALID_ARGUMENT" });
  }
}

export class PicoShareClient {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || process.env.PICOSHARE_BASE_URL);
    this.apiKey = process.env.PICOSHARE_API_KEY || "";
  }

  url(path) {
    return new URL(String(path).replace(/^\/+/, ""), `${this.baseUrl}/`);
  }

  fileShareUrl(id) {
    return this.url(`-${encodeURIComponent(id)}`).toString();
  }

  noteShareUrl(publicId) {
    return this.url(`c/${encodeURIComponent(publicId)}`).toString();
  }

  requireApiKey() {
    if (!this.apiKey) {
      throw new PicoShareError("PicoShare API Key is not configured.", {
        code: "CONFIG_MISSING",
        fix: "Set PICOSHARE_API_KEY in the CLI environment or secret store. Do not pass it as a command-line argument.",
      });
    }
  }

  async request(path, options = {}) {
    const method = options.method || "GET";
    const authenticated = options.authenticated !== false;
    if (authenticated) this.requireApiKey();

    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (authenticated) headers.set("X-API-Key", this.apiKey);

    let body = options.body;
    if (options.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.json);
    } else if (options.form) {
      body = options.form;
    }

    const url = this.url(path);
    const maxAttempts = method === "GET" ? 3 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(options.timeoutMs || 15 * 60 * 1000),
        });
      } catch (error) {
        throw new PicoShareError(`Request to ${url.pathname} failed: ${error.message}`, {
          code: "NETWORK_ERROR",
          fix: "Check the base URL and network connection, then retry.",
        });
      }

      const retryAfter = Number(response.headers.get("retry-after"));
      const retryable = response.status === 502 || response.status === 503 || response.status === 504 ||
        (response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 3);
      if (retryable && attempt + 1 < maxAttempts) {
        await delay(response.status === 429 ? retryAfter * 1000 : 250 * 2 ** attempt);
        continue;
      }

      const text = await response.text();
      const payload = parseResponseBody(response, text);
      if (!response.ok) throw apiError(response, payload);
      return payload;
    }

    throw new PicoShareError("Request failed after retries.", { code: "NETWORK_ERROR" });
  }

  async requestRaw(path, { headers: extraHeaders = {}, authenticated = false } = {}) {
    if (authenticated) this.requireApiKey();
    const headers = new Headers(extraHeaders);
    if (authenticated) headers.set("X-API-Key", this.apiKey);
    let response;
    try {
      response = await fetch(this.url(path), {
        headers,
        signal: AbortSignal.timeout(15 * 60 * 1000),
      });
    } catch (error) {
      throw new PicoShareError(`Download request failed: ${error.message}`, { code: "NETWORK_ERROR" });
    }
    if (!response.ok) {
      const text = await response.text();
      throw apiError(response, parseResponseBody(response, text));
    }
    return response;
  }

  async getFile(id) {
    return this.request(`api/entry/${encodeURIComponent(id)}`);
  }

  async listFiles() {
    return this.request("api/entries");
  }

  async uploadFile(filePath, { note, expirationDays, contentType } = {}) {
    this.requireApiKey();
    validateFileNote(note);

    const absolutePath = resolve(filePath);
    const fileStat = await stat(absolutePath).catch(() => null);
    if (!fileStat?.isFile()) {
      throw new PicoShareError(`File not found or not a regular file: ${filePath}`, { code: "FILE_NOT_FOUND" });
    }

    const filename = basename(absolutePath);
    const type = contentType || mimeTypeFor(absolutePath);
    const metadata = {
      filename,
      contentType: type,
      size: fileStat.size,
      ...(note ? { note } : {}),
      ...(expirationDays != null ? { expirationDays: Number(expirationDays) } : {}),
    };

    let uploaded;
    if (fileStat.size >= MULTIPART_THRESHOLD) {
      uploaded = await this.uploadMultipart(absolutePath, metadata);
    } else {
      const contents = await readFile(absolutePath);
      const form = new FormData();
      form.append("file", new Blob([contents], { type }), filename);
      if (note) form.append("note", note);
      if (expirationDays != null) form.append("expirationDays", String(expirationDays));
      uploaded = await this.request("api/entry", { method: "POST", form });
    }

    return {
      ...uploaded,
      size: fileStat.size,
      shareUrl: this.fileShareUrl(uploaded.id),
    };
  }

  async uploadMultipart(filePath, metadata) {
    const upload = await this.request("api/entry/multipart/init", { method: "POST", json: metadata });
    const chunkSize = Number(upload.chunkSize) || DEFAULT_CHUNK_SIZE;
    const file = await open(filePath, "r");
    let completed = false;

    try {
      let offset = 0;
      let partNumber = 1;
      while (offset < metadata.size) {
        const buffer = Buffer.allocUnsafe(Math.min(chunkSize, metadata.size - offset));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
        if (bytesRead <= 0) throw new PicoShareError("Unexpected end of file during multipart upload.", { code: "UPLOAD_INCOMPLETE" });
        await this.request(`api/entry/multipart/part/${encodeURIComponent(upload.uploadId)}/${partNumber}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: buffer.subarray(0, bytesRead),
        });
        offset += bytesRead;
        partNumber += 1;
      }

      const result = await this.request("api/entry/multipart/complete", {
        method: "POST",
        json: { uploadId: upload.uploadId },
      });
      completed = true;
      return { ...result, id: result.id || upload.id };
    } finally {
      await file.close();
      if (!completed) {
        await this.request("api/entry/multipart/abort", {
          method: "POST",
          json: { uploadId: upload.uploadId },
        }).catch(() => {});
      }
    }
  }

  async deleteFile(id) {
    return this.request(`api/entry/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async downloadFile(id, { output, overwrite = false } = {}) {
    const metadata = await this.getFile(id);
    const targetPath = resolve(output || safeFilename(metadata.filename));
    if (!overwrite) {
      try {
        await stat(targetPath);
        throw new PicoShareError(`Output file already exists: ${targetPath}`, {
          code: "FILE_EXISTS",
          fix: "Choose another --output path or pass --overwrite to replace it.",
        });
      } catch (error) {
        if (error instanceof PicoShareError) throw error;
        if (error.code !== "ENOENT") throw error;
      }
    }

    await mkdir(dirname(targetPath), { recursive: true });
    const response = await this.requestRaw(`-${encodeURIComponent(id)}`);
    try {
      await pipeline(response.body, createWriteStream(targetPath, { flags: overwrite ? "w" : "wx" }));
    } catch (error) {
      if (!overwrite) await rm(targetPath, { force: true }).catch(() => {});
      throw new PicoShareError(`Could not save downloaded file: ${error.message}`, { code: "DOWNLOAD_FAILED" });
    }

    return {
      id,
      filename: metadata.filename,
      output: targetPath,
      size: Number(metadata.size || 0),
      contentType: response.headers.get("content-type") || metadata.content_type,
    };
  }

  async listNotes() {
    return this.request("clipboard-api/list");
  }

  async getNote(slug) {
    return this.request(`clipboard-api/item/${encodeURIComponent(slug)}`);
  }

  async putNote(slug, content, { replace = false } = {}) {
    if (content.length > MAX_NOTE_LENGTH) {
      throw new PicoShareError(`Cloud note is too long (maximum ${MAX_NOTE_LENGTH} characters).`, { code: "INVALID_ARGUMENT" });
    }

    const current = await this.getNote(slug);
    if (current.content && current.content !== content && !replace) {
      throw new PicoShareError(`Cloud note '${current.slug || slug}' already has different content.`, {
        code: "NOTE_EXISTS",
        fix: "Inspect it with 'notes get' and pass --replace only when replacing the existing content is intended.",
      });
    }

    const saved = await this.request(`clipboard-api/item/${encodeURIComponent(slug)}`, {
      method: "PUT",
      json: { content },
    });
    const publicId = saved.publicId || current.publicId;
    return {
      ...saved,
      slug: saved.slug || current.slug || slug,
      publicId,
      ...(publicId ? { shareUrl: this.noteShareUrl(publicId) } : {}),
    };
  }

  async readPublicNote(publicId, password) {
    const headers = password ? { "X-Clip-Password": password } : {};
    return this.request(`clipboard-api/public/${encodeURIComponent(publicId)}`, {
      authenticated: false,
      headers,
    });
  }

  async setNotePassword(slug, newPassword) {
    return this.request(`clipboard-api/item/${encodeURIComponent(slug)}/password`, {
      method: "PUT",
      json: { newPassword },
    });
  }
}

export function normalizeNoteSlug(input) {
  const slug = String(input).trim().toLowerCase().replace(/\s+/g, "-");
  if (!slug || slug.length > 64 || !/^[a-z0-9_-]+$/.test(slug) || slug.startsWith("-") || slug.endsWith("-")) {
    throw new PicoShareError("Invalid cloud note slug.", {
      code: "INVALID_ARGUMENT",
      fix: "Use up to 64 lowercase letters, numbers, underscores, or hyphens; do not start or end with a hyphen.",
    });
  }
  if (["api", "guest", "clips", "_preview"].includes(slug)) {
    throw new PicoShareError(`The cloud note slug '${slug}' is reserved.`, { code: "INVALID_ARGUMENT" });
  }
  return slug;
}
