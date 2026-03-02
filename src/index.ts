export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  CLIPBOARD: KVNamespace;
  PS_SHARED_SECRET: string;
}

type EntryRow = {
  id: string;
  filename: string;
  content_type: string | null;
  size: number;
  upload_time: string;
  expiration_time: string | null;
  note: string | null;
  guest_link_id: string | null;
};

type GuestLinkRow = {
  id: string;
  label: string | null;
  created_time: string | null;
  max_file_bytes: number | null;
  max_file_lifetime_days: number | null;
  max_file_uploads: number | null;
  url_expires: string | null;
  upload_count: number | null;
};

const ID_CHARS = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ID_LENGTH = 10;
const CLIPBOARD_KEY_PREFIX = "clipboard:";
const MAX_CLIPBOARD_CHARS = 200_000;
const MULTIPART_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
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
  content: string;
  createdAt: string;
  updatedAt: string;
  passwordHash?: string | null;
};

type ClipboardSummary = {
  slug: string;
  updatedAt: string;
  charCount: number;
  itemCount: number;
  hasPassword: boolean;
};

type MultipartUploadRow = {
  upload_id: string;
  entry_id: string;
  filename: string;
  content_type: string;
  size: number;
  expiration_time: string | null;
  note: string | null;
};

export function generateID(): string {
  let result = "";
  for (let i = 0; i < ID_LENGTH; i += 1) {
    result += ID_CHARS.charAt(Math.floor(Math.random() * ID_CHARS.length));
  }
  return result;
}

function withCors(headers: HeadersInit = {}): Headers {
  const h = new Headers(headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return h;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCors({ "Content-Type": "application/json" }),
  });
}

export function parseExpirationDays(input: string | null): number | null {
  if (!input) return null;
  const n = Number.parseInt(input, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 3650);
}

export function parseMultipartPartNumber(input: string | null): number | null {
  if (!input) return null;
  if (!/^\d+$/.test(input)) return null;
  const n = Number.parseInt(input, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function expirationToISO(days: number | null): string | null {
  if (!days) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
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

  const alterStatements = [
    "ALTER TABLE guest_links ADD COLUMN label TEXT",
    "ALTER TABLE guest_links ADD COLUMN created_time DATETIME DEFAULT CURRENT_TIMESTAMP",
    "ALTER TABLE guest_links ADD COLUMN upload_count INTEGER DEFAULT 0",
  ];

  for (const stmt of alterStatements) {
    try {
      await env.DB.exec(stmt);
    } catch {
      // Ignore if column already exists in deployed database.
    }
  }

  await env.DB.prepare(
    "INSERT OR IGNORE INTO settings(key, value) VALUES ('store_forever', '1')",
  ).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO settings(key, value) VALUES ('default_expiration_days', '30')",
  ).run();
}

let schemaReady: Promise<void> | null = null;

async function ensureSchemaOnce(env: Env): Promise<void> {
  if (!schemaReady) {
    schemaReady = ensureSchema(env).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401, headers: withCors() });
}

async function requireAuth(request: Request, env: Env): Promise<boolean> {
  return request.headers.get("Authorization") === env.PS_SHARED_SECRET;
}

function htmlPage(): string {
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
    table.files-table { min-width: 860px; }
    th, td {
      text-align: left;
      border-bottom: 1px solid rgba(145, 158, 185, 0.25);
      padding: 12px 10px;
      vertical-align: middle;
    }
    th { color: #43536f; font-weight: 700; font-size: 14px; }
    td.actions { white-space: nowrap; text-align: right; }
    .actions .btn { margin-left: 8px; }
    .file-cell {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .file-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 280px;
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
      .drop-primary { font-size: 16px; }
      td.actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      table.files-table { min-width: 700px; }
      .file-name { max-width: 180px; }
    }
  </style>
</head>
<body>
  <section id="login" aria-labelledby="login-title">
    <h1 id="login-title">Welcome Back</h1>
    <p id="login-subtitle" class="auth-sub">Sign in to your account to continue</p>
    <div class="stack">
      <div>
        <label id="pw-label" for="pw">Passphrase</label>
        <input id="pw" type="password" autocomplete="current-password" placeholder="Enter your passphrase" />
      </div>
      <button class="btn form-submit" id="login-btn" type="button">Sign In</button>
      <p id="login-help" class="small">Authentication uses the shared secret configured on the worker.</p>
    </div>
  </section>

  <div id="app" class="shell hidden">
    <header class="topbar">
      <div class="row" style="gap: 26px;">
        <div class="brand">PicoShare</div>
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
      var state = {
        pw: localStorage.getItem('ps_pw') || '',
        view: 'upload',
        selectedId: null,
        files: [],
        guestLinks: [],
        settings: { storeForever: true, defaultDays: 30 },
        downloadsUniqueOnly: false,
        lang: localStorage.getItem('ps_lang') === 'zh' ? 'zh' : 'en',
      };

      var I18N = {
        en: {
          login_title: 'Welcome Back',
          login_subtitle: 'Sign in to your account to continue',
          passphrase: 'Passphrase',
          passphrase_placeholder: 'Enter your passphrase',
          sign_in: 'Sign In',
          login_help: 'Authentication uses the shared secret configured on the worker.',
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
          supports_drag: 'Supports drag and drop upload',
          no_file_selected: 'No file selected',
          or_paste_here: 'Or paste something here',
          paste_placeholder: 'Paste text content to upload as .txt',
          expiration: 'Expiration',
          day_1: '1 day',
          day_7: '7 days',
          day_30: '30 days',
          day_90: '90 days',
          never: 'Never',
          note_optional: 'Note (optional)',
          note_placeholder: 'For Joe at ExampleCo',
          note_only_you: 'Note is only visible to you',
          upload_success: 'Upload succeeded.',
          select_or_paste_first: 'Select a file or paste text first.',
          files: 'Files',
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
          delete_after_expiration: 'Delete after expiration',
          save: 'Save',
          file_updated: 'File updated.',
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
          passphrase: '访问口令',
          passphrase_placeholder: '请输入访问口令',
          sign_in: '登录',
          login_help: '认证使用 Worker 配置的共享密钥。',
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
          supports_drag: '支持拖拽上传',
          no_file_selected: '未选择文件',
          or_paste_here: '或者在这里粘贴内容',
          paste_placeholder: '粘贴文本后将保存为 .txt 文件',
          expiration: '过期时间',
          day_1: '1 天',
          day_7: '7 天',
          day_30: '30 天',
          day_90: '90 天',
          never: '永不过期',
          note_optional: '备注（可选）',
          note_placeholder: '例如：给某同事',
          note_only_you: '备注仅自己可见',
          upload_success: '上传成功。',
          select_or_paste_first: '请先选择文件或粘贴内容。',
          files: '文件',
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
          delete_after_expiration: '到期后自动删除',
          save: '保存',
          file_updated: '文件已更新。',
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
      var appEl = document.getElementById('app');
      var mainEl = document.getElementById('main');
      var flashEl = document.getElementById('flash');
      var flashTimer = null;
      var pwEl = document.getElementById('pw');
      var loginBtn = document.getElementById('login-btn');
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

      function applyStaticTranslations() {
        document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
        document.getElementById('login-title').textContent = t('login_title');
        document.getElementById('login-subtitle').textContent = t('login_subtitle');
        document.getElementById('pw-label').textContent = t('passphrase');
        pwEl.setAttribute('placeholder', t('passphrase_placeholder'));
        loginBtn.textContent = t('sign_in');
        document.getElementById('login-help').textContent = t('login_help');
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
        h.Authorization = state.pw;
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

      async function multipartUploadFile(file, noteValue, expirationDays) {
        var init = await api('/api/entry/multipart/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name || 'upload.bin',
            contentType: file.type || 'application/octet-stream',
            size: Number(file.size || 0),
            note: noteValue || '',
            expirationDays: expirationDays,
          }),
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

      async function login() {
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
        localStorage.removeItem('ps_pw');
        state.pw = '';
        state.selectedId = null;
        state.view = 'upload';
        closeSystemMenu();
        appEl.classList.add('hidden');
        loginEl.classList.remove('hidden');
        setFlash(t('logged_out'), false);
      }

      async function loadInitialData() {
        var loaded = await Promise.all([api('/api/entries'), api('/api/guest-links'), api('/api/settings')]);
        state.files = loaded[0];
        state.guestLinks = loaded[1];
        state.settings = {
          storeForever: !!loaded[2].storeForever,
          defaultDays: Number(loaded[2].defaultDays || 30),
        };
      }

      async function refreshFiles() {
        state.files = await api('/api/entries');
      }

      async function refreshGuestLinks() {
        state.guestLinks = await api('/api/guest-links');
      }

      function createUploadView() {
        var form = el('form', { class: 'upload-grid' });

        var fileInput = el('input', { type: 'file', id: 'upload-file', 'aria-label': 'Choose file', class: 'hidden' });
        var dropFileName = el('div', { class: 'drop-file', text: t('no_file_selected') });
        var drop = el('button', { type: 'button', class: 'drop', onclick: function() { fileInput.click(); } }, [
          el('div', { class: 'drop-primary', text: t('drop_choose') }),
          el('div', { class: 'drop-secondary', text: t('supports_drag') }),
          dropFileName,
        ]);
        var selectedFile = null;

        function setSelectedFile(file) {
          selectedFile = file || null;
          dropFileName.textContent = selectedFile ? (t('selected_prefix') + ': ' + selectedFile.name) : t('no_file_selected');
        }

        fileInput.addEventListener('change', function() {
          setSelectedFile(fileInput.files && fileInput.files[0] ? fileInput.files[0] : null);
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
            setSelectedFile(files[0]);
          }
        });

        var pasteLabel = el('label', { for: 'paste', text: t('or_paste_here') });
        var paste = el('textarea', { id: 'paste', placeholder: t('paste_placeholder') });

        var expLabel = el('label', { for: 'exp-select', text: t('expiration') });
        var expSelect = el('select', { id: 'exp-select' }, [
          el('option', { value: '0', text: t('never') }),
          el('option', { value: '1', text: t('day_1') }),
          el('option', { value: '7', text: t('day_7') }),
          el('option', { value: '30', text: t('day_30') }),
          el('option', { value: '90', text: t('day_90') }),
        ]);
        if (!state.settings.storeForever) {
          expSelect.value = String(Math.max(1, state.settings.defaultDays || 30));
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
          var hasFile = selectedFile || (fileInput.files && fileInput.files[0]);
          var pastedText = paste.value.trim();
          if (!hasFile && !pastedText) {
            setFlash(t('select_or_paste_first'), true);
            return;
          }

          isUploading = true;
          setBusy(true, t('uploading_wait'));
          var noteValue = note.value.trim();
          var expirationDaysValue = expSelect.value;

          try {
            if (hasFile) {
              await multipartUploadFile(hasFile, noteValue, expirationDaysValue);
            } else {
              var fd = new FormData();
              fd.append('pastedText', pastedText);
              fd.append('note', noteValue);
              fd.append('expirationDays', expirationDaysValue);
              await api('/api/entry', { method: 'POST', body: fd });
            }
            setFlash(t('upload_success'), false);
            setSelectedFile(null);
            fileInput.value = '';
            paste.value = '';
            note.value = '';
            await refreshFiles();
            state.view = 'files';
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

        var tableWrap = el('div', { class: 'table-wrap' });
        var table = el('table', { class: 'files-table' });
        var thead = el('thead');
        var headRow = el('tr');
        [t('filename'), t('note'), t('size'), t('uploaded'), t('expires'), t('downloads'), t('actions')].forEach(function(title) {
          headRow.appendChild(el('th', { scope: 'col', text: title }));
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        var tbody = el('tbody');
        state.files.forEach(function(file) {
          var tr = el('tr');
          tr.addEventListener('mouseenter', function(evt) { showPreview(file, evt); });
          tr.addEventListener('mousemove', function(evt) { if (!filePreview.classList.contains('hidden')) movePreview(evt); });
          tr.addEventListener('mouseleave', hidePreview);

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
          tr.appendChild(el('td', { text: file.note || '' }));
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
            type: 'button', class: 'btn blue small', text: 'i', 'aria-label': t('view_file_info'), onclick: function() {
              state.selectedId = file.id;
              state.view = 'fileInfo';
              render();
            }
          }));
          actions.appendChild(el('button', {
            type: 'button', class: 'btn secondary small', text: '✎', 'aria-label': t('edit_file'), onclick: function() {
              state.selectedId = file.id;
              state.view = 'fileEdit';
              render();
            }
          }));
          actions.appendChild(el('button', {
            type: 'button', class: 'btn blue small', text: '⧉', 'aria-label': t('copy_short_link'), onclick: async function() {
              try {
                await navigator.clipboard.writeText(location.origin + '/-' + file.id);
                setFlash(t('link_copied'), false);
              } catch {
                setFlash(t('clipboard_denied'), true);
              }
            }
          }));
          actions.appendChild(el('button', {
            type: 'button', class: 'btn danger small', text: t('delete'), 'aria-label': t('delete_file'), onclick: async function() {
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

        table.appendChild(tbody);
        tableWrap.appendChild(table);
        root.appendChild(tableWrap);
        return root;
      }

      async function createFileInfoView() {
        var id = state.selectedId;
        var data = await api('/api/entry/' + encodeURIComponent(id));
        var root = el('section', { class: 'stack' });
        root.appendChild(el('h1', { text: t('file_information') }));
        function kv(label, value) {
          var block = el('div');
          block.appendChild(el('strong', { text: label }));
          block.appendChild(el('br'));
          block.appendChild(document.createTextNode(value));
          return block;
        }

        var fullLink = location.origin + '/-' + data.id + '/' + data.filename;
        var shortLink = location.origin + '/-' + data.id;

        var linksPanel = el('div', { class: 'panel stack' }, [
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

        var info = el('div', { class: 'stack' });
        info.appendChild(kv(t('filename'), data.filename));
        info.appendChild(kv(t('size'), formatSize(data.size)));
        info.appendChild(kv(t('expires'), formatDate(data.expiration_time)));
        var downloadsWrap = el('div');
        downloadsWrap.appendChild(el('strong', { text: t('downloads') }));
        downloadsWrap.appendChild(el('br'));
        var dlRow = el('span', { class: 'row' }, [
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

        root.appendChild(el('div', { class: 'submit-row' }, [
          el('button', {
            type: 'button', class: 'btn form-submit tight', text: t('back_to_files'), onclick: function() {
              state.view = 'files';
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
        var exp = el('select', { id: 'edit-exp' }, [
          el('option', { value: '0', text: t('never') }),
          el('option', { value: '1', text: t('day_1') }),
          el('option', { value: '7', text: t('day_7') }),
          el('option', { value: '30', text: t('day_30') }),
          el('option', { value: '90', text: t('day_90') }),
        ]);
        if (data.expiration_time) {
          var daysLeft = Math.max(1, Math.ceil((new Date(data.expiration_time).getTime() - Date.now()) / (24 * 3600 * 1000)));
          exp.value = String(daysLeft > 90 ? 90 : daysLeft);
          deleteAfter.checked = true;
        }

        var note = el('input', { id: 'edit-note', type: 'text', value: data.note || '' });

        form.appendChild(el('div', {}, [el('label', { for: 'edit-filename', text: t('filename') }), filename]));
        form.appendChild(el('div', {}, [el('label', { for: 'edit-exp', text: t('expiration') })]));
        form.appendChild(el('div', { class: 'check-row' }, [
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
        var days = el('input', { id: 'set-days', type: 'number', min: '1', value: String(state.settings.defaultDays || 30) });

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

        form.appendChild(toggleRow);
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
              defaultDays: Number(days.value || 30),
            }),
          });
          state.settings = { storeForever: storeForever.checked, defaultDays: Number(days.value || 30) };
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
      document.getElementById('nav-clips-btn').addEventListener('click', function() {
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
      langToggle.addEventListener('click', switchLang);
      loginBtn.addEventListener('click', login);
      pwEl.addEventListener('keydown', function(evt) {
        if (evt.key === 'Enter') login();
      });
      window.addEventListener('blur', hidePreview);
      document.addEventListener('visibilitychange', function() {
        if (document.hidden) hidePreview();
      });

      if (state.pw) {
        loginEl.classList.add('hidden');
        appEl.classList.remove('hidden');
        loadInitialData().then(render).catch(function() {
          logout();
          setFlash(t('session_expired'), true);
        });
      }
      applyStaticTranslations();
    })();
  </script>
</body>
</html>`;
}

async function getEntryById(env: Env, id: string): Promise<EntryRow | null> {
  return env.DB.prepare(
    "SELECT id, filename, content_type, size, upload_time, expiration_time, note, guest_link_id FROM entries WHERE id = ?",
  )
    .bind(id)
    .first<EntryRow>();
}

async function getMultipartUploadById(env: Env, uploadId: string): Promise<MultipartUploadRow | null> {
  return env.DB.prepare(
    `SELECT upload_id, entry_id, filename, content_type, size, expiration_time, note
     FROM multipart_uploads
     WHERE upload_id = ?`,
  )
    .bind(uploadId)
    .first<MultipartUploadRow>();
}

export function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() <= Date.now();
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

function clipboardKey(slug: string): string {
  return `${CLIPBOARD_KEY_PREFIX}${slug}`;
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

async function getClipboardRecord(env: Env, slug: string): Promise<ClipboardRecord | null> {
  return env.CLIPBOARD.get(clipboardKey(slug), "json");
}

async function listClipboards(env: Env): Promise<ClipboardSummary[]> {
  const keys = await env.CLIPBOARD.list({ prefix: CLIPBOARD_KEY_PREFIX, limit: 1000 });
  const records = await Promise.all(
    keys.keys.map(async (entry) => {
      const slug = entry.name.slice(CLIPBOARD_KEY_PREFIX.length);
      const record = await getClipboardRecord(env, slug);
      if (!record) return null;
      const stats = calculateClipboardStats(record.content);
      return {
        slug: record.slug,
        updatedAt: record.updatedAt,
        charCount: stats.charCount,
        itemCount: stats.itemCount,
        hasPassword: Boolean(record.passwordHash),
      } satisfies ClipboardSummary;
    }),
  );
  return records
    .filter((row): row is ClipboardSummary => Boolean(row))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function getGuestLinkById(env: Env, id: string): Promise<GuestLinkRow | null> {
  return env.DB.prepare(
    "SELECT id, label, created_time, max_file_bytes, max_file_lifetime_days, max_file_uploads, url_expires, upload_count FROM guest_links WHERE id = ?",
  )
    .bind(id)
    .first<GuestLinkRow>();
}

async function deleteEntryById(env: Env, id: string): Promise<void> {
  await env.BUCKET.delete(id);
  await env.DB.prepare("DELETE FROM download_events WHERE entry_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(id).run();
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

function clipboardListPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>云便签 - 列表</title>
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
      h1 { font-size: 34px; }
      input { min-width: 220px; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="head">
      <h1>云便签列表</h1>
      <div class="new">
        <input id="name" type="text" maxlength="64" placeholder="输入名字，例如：zhangsan" />
        <button id="go" type="button">打开/创建便签</button>
      </div>
    </div>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>最近更新</th>
            <th>保护</th>
            <th>便签项</th>
            <th>字符</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="rows">
          <tr><td colspan="6" class="muted">加载中...</td></tr>
        </tbody>
      </table>
    </div>
  </main>
  <script>
    (function() {
      function formatDate(iso) {
        if (!iso) return "-";
        var d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleString();
      }
      function normalize(value) {
        return (value || "").trim().toLowerCase().replace(/\\s+/g, "-");
      }
      async function loadList() {
        var rows = document.getElementById("rows");
        try {
          var res = await fetch("/clipboard-api/list");
          if (!res.ok) throw new Error(await res.text());
          var data = await res.json();
          if (!data.length) {
            rows.innerHTML = '<tr><td colspan="6" class="muted">暂无便签，右上角输入名字即可创建。</td></tr>';
            return;
          }
          rows.innerHTML = data.map(function(item) {
            var name = item.slug;
            var href = "/" + encodeURIComponent(name);
            return "<tr>" +
              "<td><a href=\\"" + href + "\\">" + name + "</a></td>" +
              "<td>" + formatDate(item.updatedAt) + "</td>" +
              "<td>" + (item.hasPassword ? "已加密" : "公开") + "</td>" +
              "<td>" + item.itemCount + "</td>" +
              "<td>" + item.charCount + "</td>" +
              "<td><a href=\\"" + href + "\\">进入</a></td>" +
            "</tr>";
          }).join("");
        } catch (err) {
          rows.innerHTML = '<tr><td colspan="6" class="muted">加载失败：' + String((err && err.message) || err) + '</td></tr>';
        }
      }

      var nameInput = document.getElementById("name");
      function go() {
        var normalized = normalize(nameInput.value);
        if (!normalized) return;
        location.href = "/" + encodeURIComponent(normalized);
      }
      document.getElementById("go").addEventListener("click", go);
      nameInput.addEventListener("keydown", function(evt) {
        if (evt.key === "Enter") go();
      });
      loadList();
    })();
  </script>
</body>
</html>`;
}

function clipboardDetailPage(slug: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>云便签 - ${escapeHtml(slug)}</title>
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
    @media (max-width: 960px) {
      body { padding: 10px; }
      .top { padding: 12px; }
      .title { font-size: 22px; }
      .grid { grid-template-columns: 1fr; min-height: auto; }
      textarea { height: 55vh; }
    }
  </style>
</head>
<body>
  <header class="top">
    <div class="title">云便签 <small>/${escapeHtml(slug)}</small></div>
    <div class="action">
      <button id="copy-link" class="secondary" type="button">复制链接</button>
      <button id="save" type="button">保存</button>
      <span id="msg" class="msg"></span>
    </div>
  </header>
  <main class="grid">
    <section class="editor-wrap">
      <textarea id="content" placeholder="可以随便记录点什么，支持多设备同步编辑。"></textarea>
    </section>
    <aside class="side">
      <section class="card">
        <h3>统计信息</h3>
        <div class="stats">
          <div><b id="item-count">0</b><span>便签项</span></div>
          <div><b id="line-count">0</b><span>行数</span></div>
          <div><b id="char-count">0</b><span>字符</span></div>
        </div>
      </section>
      <section class="card">
        <h3>分享</h3>
        <div class="link-row">
          <input id="url" readonly />
          <button id="copy-url" class="secondary" type="button">复制</button>
        </div>
        <p class="muted">复制此地址后，可在多台设备打开并编辑保存。</p>
      </section>
      <section class="card">
        <h3>密码保护</h3>
        <div class="stack">
          <input id="unlock-password" type="password" maxlength="128" placeholder="当前密码（若已加密）" />
          <div class="link-row">
            <button id="unlock-btn" class="secondary" type="button">解锁</button>
            <span id="lock-state" class="muted">状态：未加密</span>
          </div>
          <input id="new-password" type="password" maxlength="128" placeholder="新密码（留空为取消密码）" />
          <button id="set-password-btn" type="button">设置/更新密码</button>
        </div>
      </section>
      <section class="card">
        <h3>剪贴板列表</h3>
        <a href="/clips">打开列表页</a>
      </section>
    </aside>
  </main>
  <script>
    (function() {
      var slug = ${JSON.stringify(slug)};
      var contentEl = document.getElementById("content");
      var msgEl = document.getElementById("msg");
      var urlEl = document.getElementById("url");
      var unlockPasswordEl = document.getElementById("unlock-password");
      var newPasswordEl = document.getElementById("new-password");
      var lockStateEl = document.getElementById("lock-state");
      var passwordStorageKey = ${JSON.stringify(clipboardPasswordStorageKey(slug))};
      var clipPassword = "";
      var hasPassword = false;
      var isDirty = false;
      var isSaving = false;
      var lastSavedContent = "";
      var autoSaveTimer = null;
      urlEl.value = location.origin + "/" + encodeURIComponent(slug);

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

      function setLockState() {
        lockStateEl.textContent = hasPassword ? "状态：已加密" : "状态：未加密";
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
        var res = await fetch("/clipboard-api/item/" + encodeURIComponent(slug), { headers: headers });
        if (res.status === 401) {
          hasPassword = true;
          if (clipPassword) {
            clipPassword = "";
            unlockPasswordEl.value = "";
            persistPassword("");
          }
          setLockState();
          throw new Error("该便签已加密，请输入密码后解锁");
        }
        if (!res.ok) throw new Error(await res.text());
        var data = await res.json();
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
        if (text.length > ${MAX_CLIPBOARD_CHARS}) {
          if (!silent) setMsg("内容过长");
          return;
        }
        if (!isDirty && text === lastSavedContent) return;
        isSaving = true;
        var res = await fetch("/clipboard-api/item/" + encodeURIComponent(slug), {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ content: text }),
        });
        if (res.status === 401) {
          clipPassword = "";
          unlockPasswordEl.value = "";
          persistPassword("");
          isSaving = false;
          throw new Error("密码错误或未提供密码");
        }
        if (!res.ok) {
          isSaving = false;
          throw new Error(await res.text());
        }
        var data = await res.json();
        hasPassword = !!data.hasPassword;
        isSaving = false;
        isDirty = false;
        lastSavedContent = text;
        setLockState();
        if (!silent) setMsg("已保存");
      }

      function saveOnMouseLeave() {
        if (!isDirty) return;
        save(false).then(function() {
          setMsg("鼠标移出已自动保存");
        }).catch(function(err) {
          setMsg(String((err && err.message) || err));
        });
      }

      async function unlock() {
        clipPassword = String(unlockPasswordEl.value || "").trim();
        await load();
        if (clipPassword) persistPassword(clipPassword);
        setMsg("已解锁");
      }

      async function updatePassword() {
        var currentPassword = String(unlockPasswordEl.value || "").trim();
        var nextPassword = String(newPasswordEl.value || "").trim();
        var res = await fetch("/clipboard-api/item/" + encodeURIComponent(slug) + "/password", {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({
            password: currentPassword || null,
            newPassword: nextPassword || null,
          }),
        });
        if (res.status === 401) throw new Error("当前密码错误");
        if (!res.ok) throw new Error(await res.text());
        var data = await res.json();
        hasPassword = !!data.hasPassword;
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
        setMsg(hasPassword ? "密码已更新" : "密码已取消");
      }

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
        navigator.clipboard.writeText(urlEl.value).then(function() { setMsg("已复制"); });
      });
      document.getElementById("copy-link").addEventListener("click", function() {
        navigator.clipboard.writeText(urlEl.value).then(function() { setMsg("已复制"); });
      });
      document.addEventListener("mouseleave", saveOnMouseLeave);
      document.addEventListener("visibilitychange", function() {
        if (document.hidden && isDirty) {
          save(true).catch(function() {});
        }
      });

      setLockState();
      load().catch(function(err) { setMsg(String((err && err.message) || err)); });
    })();
  </script>
</body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    await ensureSchemaOnce(env);

    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: withCors() });
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

      const obj = await env.BUCKET.get(id);
      if (!obj) return new Response("Not Found", { status: 404, headers: withCors() });

      const h = withCors();
      obj.writeHttpMetadata(h);
      h.set("Content-Disposition", "inline");
      if (entry.content_type) h.set("Content-Type", entry.content_type);
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

      const obj = await env.BUCKET.get(id);
      if (!obj) return new Response("Not Found", { status: 404, headers: withCors() });

      await env.DB.prepare(
        "INSERT INTO download_events(entry_id, ip, user_agent) VALUES (?, ?, ?)",
      )
        .bind(id, request.headers.get("cf-connecting-ip"), request.headers.get("user-agent"))
        .run();

      const h = withCors();
      obj.writeHttpMetadata(h);
      h.set("Content-Disposition", `inline; filename="${entry.filename}"`);
      if (entry.content_type) h.set("Content-Type", entry.content_type);
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

        const expiration = link.max_file_lifetime_days
          ? expirationToISO(link.max_file_lifetime_days)
          : null;

        for (const item of candidates) {
          await env.BUCKET.put(item.id, item.bytes, { httpMetadata: { contentType: item.contentType } });
          await env.DB.prepare(
            "INSERT INTO entries (id, filename, content_type, size, expiration_time, note, guest_link_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
            .bind(item.id, item.filename, item.contentType, item.size, expiration, note, guestId)
            .run();
        }
        await env.DB.prepare(
          "UPDATE guest_links SET upload_count = COALESCE(upload_count, 0) + ? WHERE id = ?",
        )
          .bind(candidates.length, guestId)
          .run();

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
      const list = await listClipboards(env);
      return json(list);
    }

    if (url.pathname.startsWith("/clipboard-api/item/")) {
      const itemBase = "/clipboard-api/item/";
      const passwordSuffix = "/password";
      const isPasswordRoute = url.pathname.endsWith(passwordSuffix);
      const slugRaw = decodeURIComponent(
        isPasswordRoute
          ? url.pathname.slice(itemBase.length, -passwordSuffix.length)
          : url.pathname.slice(itemBase.length),
      );
      const slug = sanitizeClipboardSlug(slugRaw);
      if (!slug) return json({ error: "invalid clipboard name" }, 400);
      const existing = await getClipboardRecord(env, slug);

      if (isPasswordRoute) {
        if (request.method !== "PUT") {
          return new Response("Method Not Allowed", { status: 405, headers: withCors() });
        }
        const body = (await request.json()) as {
          password?: unknown;
          newPassword?: unknown;
        };
        const newPassword = normalizeClipboardPassword(body.newPassword);
        const oldPassword = normalizeClipboardPassword(body.password);
        if (existing?.passwordHash) {
          if (!oldPassword) return json({ error: "password required" }, 401);
          if (!(await verifyClipboardPassword(existing.passwordHash, oldPassword))) {
            return json({ error: "invalid password" }, 401);
          }
        }
        const now = new Date().toISOString();
        const next: ClipboardRecord = {
          slug,
          content: existing?.content || "",
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          passwordHash: newPassword ? await sha256Hex(newPassword) : null,
        };
        await env.CLIPBOARD.put(clipboardKey(slug), JSON.stringify(next));
        return json({ ok: true, hasPassword: Boolean(next.passwordHash), updatedAt: now });
      }

      if (request.method === "GET") {
        if (!existing) {
          return json({
            slug,
            content: "",
            createdAt: null,
            updatedAt: null,
            hasPassword: false,
            ...calculateClipboardStats(""),
          });
        }
        const auth = await authorizeClipboardRequest(request, existing);
        if (!auth.ok) return json({ error: "password required", hasPassword: true }, 401);
        return json({
          slug: existing.slug,
          content: existing.content,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          hasPassword: Boolean(existing.passwordHash),
          ...calculateClipboardStats(existing.content),
        });
      }

      if (request.method === "PUT") {
        const body = (await request.json()) as { content?: unknown };
        const content = typeof body.content === "string" ? body.content : "";
        if (content.length > MAX_CLIPBOARD_CHARS) {
          return json({ error: `content too large, max ${MAX_CLIPBOARD_CHARS} chars` }, 400);
        }
        const auth = await authorizeClipboardRequest(request, existing);
        if (!auth.ok) return json({ error: "password required", hasPassword: true }, 401);
        const now = new Date().toISOString();
        const next: ClipboardRecord = {
          slug,
          content,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          passwordHash: existing?.passwordHash || null,
        };
        await env.CLIPBOARD.put(clipboardKey(slug), JSON.stringify(next));
        return json({
          ok: true,
          slug,
          updatedAt: now,
          hasPassword: Boolean(next.passwordHash),
          ...calculateClipboardStats(content),
        });
      }

      return new Response("Method Not Allowed", { status: 405, headers: withCors() });
    }

    if (url.pathname === "/clips" && request.method === "GET") {
      return new Response(clipboardListPage(), {
        headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      if (!(await requireAuth(request, env))) {
        return unauthorized();
      }

      if (url.pathname === "/api/entry/multipart/init" && request.method === "POST") {
        const body = (await request.json()) as {
          filename?: unknown;
          contentType?: unknown;
          size?: unknown;
          note?: unknown;
          expirationDays?: unknown;
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
        const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null;
        const expirationInput = body.expirationDays == null ? null : String(body.expirationDays);
        const expiration = expirationToISO(parseExpirationDays(expirationInput));
        const entryId = generateID();
        const upload = await env.BUCKET.createMultipartUpload(entryId, { httpMetadata: { contentType } });
        await env.DB.prepare(
          `INSERT INTO multipart_uploads
            (upload_id, entry_id, filename, content_type, size, expiration_time, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(upload.uploadId, entryId, filename, contentType, Math.floor(size), expiration, note)
          .run();
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
        const upload = await getMultipartUploadById(env, uploadId);
        if (!upload) return json({ error: "multipart upload not found" }, 404);

        const bytes = await request.arrayBuffer();
        const multipart = env.BUCKET.resumeMultipartUpload(upload.entry_id, upload.upload_id);
        const part = await multipart.uploadPart(partNumber, bytes);
        await env.DB.prepare(
          `INSERT OR REPLACE INTO multipart_upload_parts (upload_id, part_number, etag)
           VALUES (?, ?, ?)`,
        )
          .bind(uploadId, part.partNumber, part.etag)
          .run();
        return json({ ok: true, partNumber: part.partNumber });
      }

      if (url.pathname === "/api/entry/multipart/complete" && request.method === "POST") {
        const body = (await request.json()) as { uploadId?: unknown };
        const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
        if (!uploadId) return json({ error: "uploadId is required" }, 400);
        const upload = await getMultipartUploadById(env, uploadId);
        if (!upload) return json({ error: "multipart upload not found" }, 404);
        const parts = await env.DB.prepare(
          `SELECT part_number AS partNumber, etag
           FROM multipart_upload_parts
           WHERE upload_id = ?
           ORDER BY part_number ASC`,
        )
          .bind(uploadId)
          .all<{ partNumber: number; etag: string }>();
        if (!parts.results.length) {
          return json({ error: "no uploaded parts found" }, 400);
        }

        const multipart = env.BUCKET.resumeMultipartUpload(upload.entry_id, upload.upload_id);
        await multipart.complete(parts.results);
        await env.DB.prepare(
          "INSERT INTO entries (id, filename, content_type, size, expiration_time, note) VALUES (?, ?, ?, ?, ?, ?)",
        )
          .bind(
            upload.entry_id,
            upload.filename,
            upload.content_type || "application/octet-stream",
            upload.size || 0,
            upload.expiration_time,
            upload.note,
          )
          .run();
        await env.DB.prepare("DELETE FROM multipart_upload_parts WHERE upload_id = ?").bind(uploadId).run();
        await env.DB.prepare("DELETE FROM multipart_uploads WHERE upload_id = ?").bind(uploadId).run();
        return json({ id: upload.entry_id, filename: upload.filename });
      }

      if (url.pathname === "/api/entry/multipart/abort" && request.method === "POST") {
        const body = (await request.json()) as { uploadId?: unknown };
        const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
        if (!uploadId) return json({ error: "uploadId is required" }, 400);
        const upload = await getMultipartUploadById(env, uploadId);
        if (upload) {
          try {
            await env.BUCKET.resumeMultipartUpload(upload.entry_id, upload.upload_id).abort();
          } catch {
            // Ignore abort failures so local metadata can still be cleaned.
          }
          await env.DB.prepare("DELETE FROM multipart_upload_parts WHERE upload_id = ?").bind(uploadId).run();
          await env.DB.prepare("DELETE FROM multipart_uploads WHERE upload_id = ?").bind(uploadId).run();
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
        const note = ((fd.get("note") as string | null) || "").trim() || null;
        const expirationDays = parseExpirationDays((fd.get("expirationDays") as string | null) || null);
        const expiration = expirationToISO(expirationDays);

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

        await env.BUCKET.put(id, bytes, { httpMetadata: { contentType } });
        await env.DB.prepare(
          "INSERT INTO entries (id, filename, content_type, size, expiration_time, note) VALUES (?, ?, ?, ?, ?, ?)",
        )
          .bind(id, filename, contentType, size, expiration, note)
          .run();

        return json({ id, filename });
      }

      if (url.pathname === "/api/entries" && request.method === "GET") {
        const res = await env.DB.prepare(
          `SELECT
             e.id,
             e.filename,
             e.content_type,
             e.size,
             e.upload_time,
             e.expiration_time,
             e.note,
             COALESCE(d.count, 0) AS download_count
           FROM entries e
           LEFT JOIN (
             SELECT entry_id, COUNT(*) AS count
             FROM download_events
             GROUP BY entry_id
           ) d ON d.entry_id = e.id
           ORDER BY e.upload_time DESC`,
        ).all();
        return json(res.results);
      }

      if (url.pathname.startsWith("/api/entry/") && !url.pathname.endsWith("/downloads") && request.method === "GET") {
        const id = decodeURIComponent(url.pathname.split("/").pop() || "");
        const entry = await getEntryById(env, id);
        if (!entry) return json({ error: "not found" }, 404);

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
        const entry = await getEntryById(env, id);
        if (!entry) return json({ error: "not found" }, 404);

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
        const expiration = deleteAfter && expDays > 0 ? expirationToISO(expDays) : null;

        await env.DB.prepare(
          "UPDATE entries SET filename = ?, note = ?, expiration_time = ? WHERE id = ?",
        )
          .bind(filename || entry.filename, note, expiration, id)
          .run();

        return json({ ok: true });
      }

      if (url.pathname.startsWith("/api/entry/") && request.method === "DELETE") {
        const id = decodeURIComponent(url.pathname.split("/").pop() || "");
        await deleteEntryById(env, id);
        return json({ ok: true });
      }

      if (url.pathname === "/api/guest-links" && request.method === "GET") {
        const res = await env.DB.prepare(
          "SELECT id, label, created_time, max_file_bytes, max_file_lifetime_days, max_file_uploads, url_expires, upload_count FROM guest_links ORDER BY COALESCE(created_time, url_expires) DESC",
        ).all();
        return json(res.results);
      }

      if (url.pathname === "/api/guest-links" && request.method === "POST") {
        const body = (await request.json()) as {
          label?: string | null;
          max_file_bytes?: number | null;
          max_file_lifetime_days?: number | null;
          max_file_uploads?: number | null;
          url_expires?: string | null;
        };

        const id = generateID();
        const label = (body.label || "").trim().slice(0, 120) || null;
        const maxFileBytes = Number(body.max_file_bytes || 0) || null;
        const maxFileLife = Number(body.max_file_lifetime_days || 0) || null;
        const maxFileUploads = Number(body.max_file_uploads || 0) || null;
        const urlExpires = parseDateFromUnknown(body.url_expires);

        await env.DB.prepare(
          "INSERT INTO guest_links (id, label, max_file_bytes, max_file_lifetime_days, max_file_uploads, url_expires, created_time, upload_count) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)",
        )
          .bind(id, label, maxFileBytes, maxFileLife, maxFileUploads, urlExpires)
          .run();

        return json({ id });
      }

      if (url.pathname.startsWith("/api/guest-links/") && request.method === "DELETE") {
        const id = decodeURIComponent(url.pathname.split("/").pop() || "");
        await env.DB.prepare("DELETE FROM guest_links WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }

      if (url.pathname === "/api/settings" && request.method === "GET") {
        const rows = await env.DB.prepare(
          "SELECT key, value FROM settings WHERE key IN ('store_forever', 'default_expiration_days')",
        ).all<{ key: string; value: string }>();

        const map = new Map<string, string>();
        for (const r of rows.results) map.set(r.key, r.value);

        return json({
          storeForever: boolFromSetting(map.get("store_forever") ?? "1"),
          defaultDays: Number(map.get("default_expiration_days") ?? "30"),
        });
      }

      if (url.pathname === "/api/settings" && request.method === "PUT") {
        const body = (await request.json()) as {
          storeForever?: boolean;
          defaultDays?: number;
        };

        const storeForever = body.storeForever ? "1" : "0";
        const defaultDays = String(Math.max(1, Math.min(3650, Number(body.defaultDays || 30))));

        await env.DB.prepare("REPLACE INTO settings(key, value) VALUES ('store_forever', ?)")
          .bind(storeForever)
          .run();
        await env.DB.prepare("REPLACE INTO settings(key, value) VALUES ('default_expiration_days', ?)")
          .bind(defaultDays)
          .run();

        return json({ ok: true });
      }

      if (url.pathname === "/api/system-info" && request.method === "GET") {
        const entryStats = await env.DB.prepare(
          "SELECT COALESCE(SUM(size), 0) AS total, COUNT(*) AS count FROM entries",
        ).first<{ total: number; count: number }>();
        const guestStats = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM guest_links",
        ).first<{ count: number }>();
        const downloadStats = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM download_events",
        ).first<{ count: number }>();

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
          if (decoded !== slug) {
            return Response.redirect(new URL(`/${encodeURIComponent(slug)}`, url).toString(), 302);
          }
          return new Response(clipboardDetailPage(slug), {
            headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
          });
        }
      }
    }

    return new Response(htmlPage(), {
      headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
    });
  },
};
