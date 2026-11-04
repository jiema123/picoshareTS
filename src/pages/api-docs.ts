export function apiDocsPage(siteUrl: string): string {
  const siteOrigin = new URL(siteUrl).origin;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>PicoShare API Documentation</title>
  <style>
    * { box-sizing: border-box; }
    :root { color-scheme: light; --ink: #26354d; --muted: #687790; --line: #dce3ef; --blue: #245db2; }
    body { margin: 0; padding: 24px; color: var(--ink); background: #eef1f8; font: 15px/1.65 system-ui, sans-serif; }
    main { max-width: 1000px; margin: 0 auto; }
    .topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 18px; }
    a { color: var(--blue); text-decoration: none; }
    a:hover { text-decoration: underline; }
    button { padding: 8px 12px; border: 1px solid #9ba9c0; border-radius: 9px; color: var(--blue); background: white; font: inherit; cursor: pointer; }
    h1 { margin: 0; font-size: clamp(30px, 5vw, 42px); line-height: 1.15; }
    h2 { margin: 0 0 12px; font-size: 22px; }
    h3 { margin: 24px 0 8px; font-size: 17px; }
    p { margin: 8px 0; }
    .intro { margin: 10px 0 22px; color: var(--muted); }
    .card { margin: 16px 0; padding: 22px; border: 1px solid #ffffffb8; border-radius: 16px; background: #ffffffb8; box-shadow: 0 12px 36px #50618a12; }
    .callout { padding: 13px 15px; border-left: 4px solid #5976d9; border-radius: 8px; background: #f0f4ff; }
    .warn { border-left-color: #d79724; background: #fff8e8; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    code { overflow-wrap: anywhere; }
    pre { margin: 10px 0; padding: 14px 16px; overflow-x: auto; border-radius: 10px; color: #eaf0ff; background: #172238; font-size: 13px; line-height: 1.55; }
    .method { display: inline-block; min-width: 54px; margin-right: 8px; padding: 1px 7px; border-radius: 5px; color: #fff; background: #5267b8; font: 700 12px ui-monospace, monospace; text-align: center; }
    .endpoint { padding: 13px 0; border-top: 1px solid var(--line); }
    .endpoint:first-of-type { border-top: 0; }
    .endpoint > code { font-weight: 700; }
    .muted { color: var(--muted); }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 9px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: #53627b; font-size: 13px; }
    ul { padding-left: 22px; }
    li { margin: 4px 0; }
    .hidden { display: none !important; }
    footer { padding: 18px 0 30px; color: var(--muted); text-align: center; }
    @media (max-width: 640px) { body { padding: 16px; } .card { padding: 16px; } th, td { padding: 8px 6px; } }
    /* Keep technical docs visually aligned with the home, account, and workspace screens. */
    :root { --ink: #111111; --muted: #615d59; --line: rgba(0,0,0,.08); --blue: #0075de; }
    body { color: #111; background: #f6f5f4; font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
    main { max-width: 1280px; }
    h1, h2, h3 { color: #111; font-weight: 600; letter-spacing: -.035em; }
    h1 { font-size: clamp(40px,4.5vw,56px); line-height: 1.08; }
    h2 { font-size: clamp(28px,3vw,36px); line-height: 1.15; }
    h1::before { content: ""; display: inline-block; width: 38px; height: 38px; margin-right: 12px; vertical-align: -5px; background: url("/favicon.svg") center / contain no-repeat; }
    .intro, .muted { color: #615d59; }
    a { color: #0075de; }
    button { padding: 8px 14px; border: 1px solid transparent; border-radius: 8px; color: #0075de; background: #e6f3fe; transition: background-color .2s ease; }
    button:hover { background: #d8edfc; }
    .card { border-color: rgba(0,0,0,.08); border-radius: 12px; background: #fff; box-shadow: none; }
    .callout { border-left-color: #0075de; border-radius: 8px; background: #e6f3fe; }
    .callout.warn { border-left-color: #f64932; background: #fff0ed; }
    pre { border-radius: 8px; color: #fff; background: #02093a; }
    .method { border-radius: 9999px; background: #0075de; }
    .endpoint { border-top-color: rgba(0,0,0,.08); }
    th, td { border-bottom-color: rgba(0,0,0,.08); }
    th { color: #615d59; }
    @media (max-width: 980px) { body { padding: 16px; } }
    @media (max-width: 600px) {
      body { padding: 12px; font-size: 16px; line-height: 1.6; }
      .topbar { align-items: flex-start; gap: 10px; flex-wrap: wrap; }
      h1 { font-size: clamp(30px, 8vw, 38px); line-height: 1.12; }
      h1::before { width: 28px; height: 28px; margin-right: 8px; }
      h2 { font-size: 23px; line-height: 1.2; }
      h3 { font-size: 17px; }
      .card { padding: 14px; }
      pre { font-size: 13px; }
      th, td { font-size: 14px; }
      .method { font-size: 12px; }
    }
    @media (max-width: 360px) {
      body { padding: 10px; }
      .card { padding: 12px; }
      h1 { font-size: 29px; }
    }
  </style>
</head>
<body>
  <main>
    <div class="topbar"><a id="back-link" href="/account">← Account &amp; Subscription</a><button id="lang-toggle" type="button">中文</button></div>
    <section id="docs-en" class="doc-language">
      <h1>PicoShare API</h1>
      <p class="intro">API reference and integration guide for uploading and managing files with your API Key.</p>
      <section class="card">
        <h2>Quick start</h2>
        <ol>
          <li>Create an API Key in <a href="/account">Account &amp; Subscription → API Keys</a>. The full key is shown once; copy it and store it securely.</li>
          <li>Send the key with each API request using the <code>X-API-Key</code> header.</li>
        </ol>
        <pre><code>curl "https://YOUR-DOMAIN/api/entries" -H "X-API-Key: YOUR_API_KEY"</code></pre>
        <pre><code>const response = await fetch("https://YOUR-DOMAIN/api/entries", { headers: { "X-API-Key": "YOUR_API_KEY" } });
const files = await response.json();</code></pre>
        <div class="callout warn">Keep your API Key on a trusted client. Do not embed it in a public web page, public source repository, or client-side code that anyone can inspect. Revoke a leaked key from the account page.</div>
      </section>
      <section class="card">
        <h2>Install the CLI</h2>
        <p>Install Node.js 20 or newer and npm. This command downloads the CLI and PicoShare Agent Skill from this site:</p>
        <pre><code>curl -fsSL "https://YOUR-DOMAIN/install.sh" | sh -s -- "https://YOUR-DOMAIN"</code></pre>
        <p>Then set the site URL and API Key, and check the available commands:</p>
        <pre><code>export PICOSHARE_BASE_URL="https://YOUR-DOMAIN"
export PICOSHARE_API_KEY="YOUR_API_KEY"
picoshare --help</code></pre>
        <p class="muted">The installer downloads the latest package from this PicoShare site. Keep the API Key in your shell or secret manager; it is not sent to the installer.</p>
      </section>
      <section class="card">
        <h2>Authentication and response</h2>
        <p>Use your site's origin as the base URL. API Keys are scoped to the account that created them. The recommended header is:</p>
        <pre><code>X-API-Key: YOUR_API_KEY</code></pre>
        <p><code>Authorization: Bearer YOUR_API_KEY</code> is also accepted. JSON endpoints return JSON; file content endpoints return the file bytes.</p>
        <div class="table-wrap"><table><thead><tr><th>Status</th><th>Meaning</th></tr></thead><tbody>
          <tr><td><code>400</code></td><td>Invalid or missing input.</td></tr>
          <tr><td><code>401</code></td><td>API Key is missing, invalid, or revoked.</td></tr>
          <tr><td><code>403</code></td><td>A plan limit was reached, such as the maximum number of clips or active guest upload links.</td></tr>
          <tr><td><code>404</code></td><td>File or upload was not found in this account.</td></tr>
          <tr><td><code>409</code></td><td>File version changed during an update; reload its metadata and retry.</td></tr>
          <tr><td><code>413</code></td><td>File size or storage quota limit was exceeded.</td></tr>
          <tr><td><code>429</code></td><td>The account-wide API Key quota was reached: Free allows 500 requests/month and 10/minute; Pro allows 5,000/month and 60/minute. Monthly quota resets at the start of each month. For a per-minute limit response, wait 60 seconds; the JSON response includes <code>retryAfterSeconds</code>.</td></tr>
        </tbody></table></div>
      </section>
      <section class="card">
        <h2>Files</h2>
        <div class="endpoint"><span class="method">POST</span><code>/api/entry</code><p>Upload a file or text as <code>multipart/form-data</code>. Fields: <code>file</code> (file, optional), <code>pastedText</code> (text, optional), <code>note</code> (optional, up to 1,000 characters), and <code>expirationDays</code> (optional positive whole number of days; Pro may send <code>0</code> for permanent storage). Hosted Free files are limited to 100 MiB and 30 days; Pro files are limited to 1 GiB and 365 days, with permanent storage available. If omitted, hosted uploads use the plan's default retention (365 days on Pro). Self-hosted deployments can configure their own retention behavior. Provide either <code>file</code> or <code>pastedText</code>.</p>
          <pre><code>curl -X POST "https://YOUR-DOMAIN/api/entry" -H "X-API-Key: YOUR_API_KEY" -F "file=@./photo.png" -F "note=From my integration" -F "expirationDays=30"</code></pre>
          <p>Response: <code>{"id":"FILE_ID","filename":"photo.png","md5":"..."}</code></p>
        </div>
        <div class="endpoint"><span class="method">GET</span><code>/api/entries</code><p>List files owned by this account. Returns a JSON array; each item includes <code>id</code>, <code>filename</code>, <code>content_type</code>, <code>size</code>, <code>md5</code>, <code>version</code>, timestamps, <code>expiration_time</code>, <code>note</code>, and <code>download_count</code>.</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/api/entry/{id}</code><p>Get one file's metadata and download count.</p></div>
        <div class="endpoint"><span class="method">PUT</span><code>/api/entry/{id}</code><p>Update file metadata with a JSON body: <code>{"filename":"new-name.png","note":"A note","deleteAfterExpiration":true,"expirationDays":30}</code>. Omitting <code>note</code> clears it. On hosted plans, omitting expiration fields preserves the current expiration (or applies the plan maximum if it is missing); Free is capped at 30 days, while Pro is capped at 365 days and may use <code>deleteAfterExpiration:false</code> or <code>expirationDays:0</code> for permanent storage. On self-hosted deployments, setting <code>deleteAfterExpiration</code> to <code>false</code> clears expiration.</p></div>
        <div class="endpoint"><span class="method">PUT</span><code>/api/entry/{id}/content</code><p>Replace file content using <code>multipart/form-data</code> with <code>file</code> and the current <code>version</code>. The replacement must keep the same filename. A successful response includes the incremented version and MD5.</p></div>
        <div class="endpoint"><span class="method">DELETE</span><code>/api/entry/{id}</code><p>Delete a file and its stored versions. Response: <code>{"ok":true}</code>.</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/api/entry/{id}/versions</code><p>List versions for a file.</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/api/entry/{id}/versions/{version}/content</code><p>Download a specific version. Returns the file bytes.</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/api/entry/{id}/downloads?uniqueIps=0</code><p>Get download count and events. Use <code>uniqueIps=1</code> to group events by IP. Response: <code>{"total":1,"events":[...]}</code>.</p></div>
        <div class="callout">A normal upload is for files under 100 MB. For files at or above 100 MB, use multipart upload below. Public share URLs such as <code>/-FILE_ID</code> do not require an API Key; anyone with the link can access the file.</div>
      </section>
      <section class="card">
        <h2>Large file upload (100 MB or more)</h2>
        <ol>
          <li><code>POST /api/entry/multipart/init</code> with JSON: <code>{"filename":"archive.zip","contentType":"application/zip","size":123456789,"note":"optional","expirationDays":30}</code>. Response includes <code>uploadId</code>, <code>id</code>, and <code>chunkSize</code> (8 MiB).</li>
          <li>Split the file into chunks no larger than <code>chunkSize</code>. Send each raw chunk to <code>PUT /api/entry/multipart/part/{uploadId}/{partNumber}</code> (part numbers start at 1). Include the API Key header on every request.</li>
          <li><code>POST /api/entry/multipart/complete</code> with JSON <code>{"uploadId":"UPLOAD_ID"}</code>. The response contains <code>id</code>, <code>filename</code>, <code>version</code>, and <code>md5</code>.</li>
        </ol>
        <p>To stop an upload, call <code>POST /api/entry/multipart/abort</code> with <code>{"uploadId":"UPLOAD_ID"}</code>.</p>
        <pre><code>curl -X POST "https://YOUR-DOMAIN/api/entry/multipart/init" -H "X-API-Key: YOUR_API_KEY" -H "Content-Type: application/json" -d '{"filename":"archive.zip","contentType":"application/zip","size":123456789}'</code></pre>
      </section>
      <section class="card">
        <h2>Guest links, settings, and usage</h2>
        <div class="endpoint"><span class="method">GET</span><code>/api/guest-links</code><p>List this account's guest upload links.</p></div>
        <div class="endpoint"><span class="method">POST</span><code>/api/guest-links</code><p>Create a guest upload link. JSON fields: <code>label</code>, <code>max_file_bytes</code>, <code>max_file_lifetime_days</code>, <code>max_file_uploads</code>, and <code>url_expires</code> (date/time). Returns <code>{"id":"GUEST_ID"}</code>; the guest URL is <code>/guest/GUEST_ID</code>. Hosted accounts can have 3 active links on Free or 20 on Pro. Link file size and retention settings are capped by the owner's plan; omitted retention defaults to that plan's maximum. Negative limits and invalid expiration dates are rejected.</p></div>
        <div class="endpoint"><span class="method">DELETE</span><code>/api/guest-links/{id}</code><p>Delete a guest upload link. Response: <code>{"ok":true}</code>.</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/api/settings</code><p>Get account upload settings: <code>storeForever</code> and <code>defaultDays</code>. Hosted Pro defaults to 365 days; set <code>defaultDays</code> to <code>0</code> to make Pro uploads permanent.</p></div>
        <div class="endpoint"><span class="method">PUT</span><code>/api/settings</code><p>Update settings with JSON: <code>{"storeForever":true,"defaultDays":30}</code>.</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/api/system-info</code><p>Get account storage and item counts, including <code>upload_data_bytes</code>, <code>db_entry_count</code>, <code>db_guest_link_count</code>, and <code>download_count</code>.</p></div>
      </section>
      <section class="card">
        <h2>Cloud Clipboard</h2>
        <p>In SaaS mode, use the same <code>X-API-Key</code> header as the file APIs. Each key can only read and write its own account's clips. API Key requests share one account-wide quota across all keys: Free allows 500 requests/month and 10/minute; Pro allows 5,000/month and 60/minute. Signed-in browser activity is not counted.</p>
        <div class="endpoint"><span class="method">GET</span><code>/clipboard-api/list</code><p>List this account's saved clips. Returns an array with <code>slug</code>, <code>publicId</code>, <code>updatedAt</code>, <code>charCount</code>, <code>itemCount</code>, and <code>hasPassword</code>.</p>
          <pre><code>curl "https://YOUR-DOMAIN/clipboard-api/list" -H "X-API-Key: YOUR_API_KEY"</code></pre>
        </div>
        <div class="endpoint"><span class="method">GET</span><code>/clipboard-api/item/{slug}</code><p>Read a clip's content and metadata. If the clip does not exist yet, this returns an empty clip. The response includes <code>content</code>, <code>createdAt</code>, <code>updatedAt</code>, <code>itemCount</code>, <code>lineCount</code>, and <code>charCount</code>.</p></div>
        <div class="endpoint"><span class="method">PUT</span><code>/clipboard-api/item/{slug}</code><p>Create or replace a clip with a JSON body <code>{"content":"..."}</code>. In SaaS mode, Free allows 5 clips with up to 32 KiB of UTF-8 text each; Pro allows 20 clips with up to 128 KiB each. Self-hosted mode allows up to 1,000,000 characters per clip. The response includes the generated <code>publicId</code> in SaaS mode.</p>
          <pre><code>curl -X PUT "https://YOUR-DOMAIN/clipboard-api/item/browser-notes" -H "X-API-Key: YOUR_API_KEY" -H "Content-Type: application/json" -d '{"content":"Saved from my integration"}'</code></pre>
          <pre><code>const response = await fetch("https://YOUR-DOMAIN/clipboard-api/item/browser-notes", {
  method: "PUT",
  headers: { "X-API-Key": "YOUR_API_KEY", "Content-Type": "application/json" },
  body: JSON.stringify({ content: "Saved from my integration" })
});
const clip = await response.json();
const shareUrl = "https://YOUR-DOMAIN/c/" + clip.publicId;</code></pre>
        </div>
        <div class="endpoint"><span class="method">DELETE</span><code>/clipboard-api/item/{slug}</code><p>Delete one of your clips and its public share link. SaaS mode requires an authenticated owner.</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/clipboard-api/public/{publicId}</code><p>Read a clip through its share ID. This endpoint is read-only and does not require an API Key. If password protection is enabled, send <code>X-Clip-Password: YOUR_CLIP_PASSWORD</code>; a missing or incorrect password returns <code>401</code>.</p></div>
        <div class="endpoint"><span class="method">PUT</span><code>/clipboard-api/item/{slug}/password</code><p>Set, change, or remove a clip password (up to 128 characters). An authenticated owner may call this with <code>{"newPassword":"secret"}</code>; set <code>newPassword</code> to <code>null</code> to remove the password. The response includes <code>hasPassword</code> and <code>publicId</code>.</p>
          <pre><code>curl -X PUT "https://YOUR-DOMAIN/clipboard-api/item/browser-notes/password" -H "X-API-Key: YOUR_API_KEY" -H "Content-Type: application/json" -d '{"newPassword":"secret"}'</code></pre>
        </div>
        <p>Slugs are trimmed, converted to lowercase, and spaces become hyphens. They may contain letters, numbers, underscores, or hyphens, must be at most 64 characters, and cannot start or end with a hyphen. Some route names are reserved.</p>
        <div class="callout">Use the generated public link <code>https://YOUR-DOMAIN/c/{publicId}</code> to share a clip. Keep the API Key private; use the public ID URL for read-only sharing.</div>
      </section>
      <section class="card">
        <h2>API Key management</h2>
        <p>Create, list, and revoke API Keys from <a href="/account">Account &amp; Subscription → API Keys</a>. Choose an expiration when creating a key; the default is 90 days, with 7, 30, 180, 365 days, and never-expire options. These management requests use your signed-in browser session; an API Key cannot create or revoke another API Key.</p>
        <p>For account details, subscription checkout, and billing portal actions, use the account page. Those endpoints require a signed-in session.</p>
      </section>
    </section>

    <section id="docs-zh" class="doc-language hidden">
      <h1>PicoShare API 接口文档</h1>
      <p class="intro">使用 API Key 上传和管理文件的调用手册与接口参考。</p>
      <section class="card">
        <h2>快速开始</h2>
        <ol>
          <li>前往<a href="/account">账户与订阅 → API Key</a>创建密钥。完整密钥只显示一次，请复制并妥善保存。</li>
          <li>每次 API 请求都通过 <code>X-API-Key</code> 请求头传入密钥。</li>
        </ol>
        <pre><code>curl "https://你的域名/api/entries" -H "X-API-Key: YOUR_API_KEY"</code></pre>
        <pre><code>const response = await fetch("https://你的域名/api/entries", { headers: { "X-API-Key": "YOUR_API_KEY" } });
const files = await response.json();</code></pre>
        <div class="callout warn">请只在可信客户端保存 API Key。不要将密钥写入公开网页、公开代码仓库或任何用户可查看的前端代码中。若密钥泄露，请到账户页面撤销。</div>
      </section>
      <section class="card">
        <h2>安装命令行工具</h2>
        <p>先安装 Node.js 20 或更新版本及 npm。下面的命令会从当前 PicoShare 站点下载 CLI 和 Agent Skill：</p>
        <pre><code>curl -fsSL "https://你的域名/install.sh" | sh -s -- "https://你的域名"</code></pre>
        <p>然后设置站点地址和 API Key，并查看可用命令：</p>
        <pre><code>export PICOSHARE_BASE_URL="https://你的域名"
export PICOSHARE_API_KEY="YOUR_API_KEY"
picoshare --help</code></pre>
        <p class="muted">安装器会从当前 PicoShare 站点下载最新工具包。API Key 留在本地 shell 或 Secret 管理器中，不会发送给安装器。</p>
      </section>
      <section class="card">
        <h2>鉴权与响应</h2>
        <p>使用你的网站域名作为 API 根地址。API Key 仅访问创建该 Key 的账号数据。推荐使用以下请求头：</p>
        <pre><code>X-API-Key: YOUR_API_KEY</code></pre>
        <p>也支持 <code>Authorization: Bearer YOUR_API_KEY</code>。JSON 接口返回 JSON；文件内容接口直接返回文件字节。</p>
        <div class="table-wrap"><table><thead><tr><th>状态码</th><th>说明</th></tr></thead><tbody>
          <tr><td><code>400</code></td><td>请求参数缺失或无效。</td></tr>
          <tr><td><code>401</code></td><td>API Key 缺失、无效或已撤销。</td></tr>
          <tr><td><code>403</code></td><td>已达到套餐资源数量限制，例如云便签数量或有效访客上传链接数量。</td></tr>
          <tr><td><code>404</code></td><td>当前账号下没有找到文件或上传任务。</td></tr>
          <tr><td><code>409</code></td><td>更新期间文件版本发生变化；重新读取文件信息后再试。</td></tr>
          <tr><td><code>413</code></td><td>超过文件大小或存储空间限制。</td></tr>
          <tr><td><code>429</code></td><td>账号 API Key 请求额度已达到：Free 每月 500 次、每分钟 10 次；Pro 每月 5,000 次、每分钟 60 次。月额度在每月初重置。触发每分钟限速时请等待 60 秒，JSON 响应会返回 <code>retryAfterSeconds</code>。</td></tr>
        </tbody></table></div>
      </section>
      <section class="card">
        <h2>文件接口</h2>
        <div class="endpoint"><span class="method">POST</span><code>/api/entry</code><p>上传文件或文本，使用 <code>multipart/form-data</code>。字段：<code>file</code>（文件，可选）、<code>pastedText</code>（文本，可选）、<code>note</code>（可选，最多 1000 字符）、<code>expirationDays</code>（可选，正整数天数）。托管免费版单文件最多 100 MiB、保留 30 天；Pro 单文件最多 1 GiB、保留 365 天。未传过期时间时，托管版本默认使用套餐允许的最长时间。自托管部署可自行配置保留规则。<code>file</code> 和 <code>pastedText</code> 至少提供一个。</p>
          <pre><code>curl -X POST "https://你的域名/api/entry" -H "X-API-Key: YOUR_API_KEY" -F "file=@./photo.png" -F "note=来自我的集成" -F "expirationDays=30"</code></pre>
          <p>响应：<code>{"id":"FILE_ID","filename":"photo.png","md5":"..."}</code></p>
        </div>
        <div class="endpoint"><span class="method">GET</span><code>/api/entries</code><p>列出当前账号的文件，返回 JSON 数组。每项包含 <code>id</code>、<code>filename</code>、<code>content_type</code>、<code>size</code>、<code>md5</code>、<code>version</code>、时间戳、<code>expiration_time</code>、<code>note</code> 和 <code>download_count</code> 等信息。</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/api/entry/{id}</code><p>读取单个文件的元数据和下载次数。</p></div>
        <div class="endpoint"><span class="method">PUT</span><code>/api/entry/{id}</code><p>用 JSON 更新文件信息：<code>{"filename":"新文件名.png","note":"备注","deleteAfterExpiration":true,"expirationDays":30}</code>。未传 <code>note</code> 会清空备注。托管版本中，未传过期字段会保留现有过期时间（若没有则按套餐最长时间设置）；托管文件必须过期，免费版最长 30 天、Pro 最长 365 天。自托管部署中，<code>deleteAfterExpiration=false</code> 会清除过期时间。</p></div>
        <div class="endpoint"><span class="method">PUT</span><code>/api/entry/{id}/content</code><p>使用 <code>multipart/form-data</code> 替换文件内容，包含 <code>file</code> 和当前的 <code>version</code>。替换文件必须保留原文件名。成功响应包含更新后的版本号和 MD5。</p></div>
        <div class="endpoint"><span class="method">DELETE</span><code>/api/entry/{id}</code><p>删除文件及其历史版本。响应：<code>{"ok":true}</code>。</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/api/entry/{id}/versions</code><p>列出文件历史版本。</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/api/entry/{id}/versions/{version}/content</code><p>下载指定版本的文件，响应为文件字节。</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/api/entry/{id}/downloads?uniqueIps=0</code><p>读取下载总数和下载记录。设置 <code>uniqueIps=1</code> 时按 IP 合并记录。响应示例：<code>{"total":1,"events":[...]}</code>。</p></div>
        <div class="callout">普通上传用于 100 MB 以下的文件；100 MB 及以上请使用下方分片上传。公开分享地址（例如 <code>/-FILE_ID</code>）不需要 API Key，任何拿到链接的人都可以访问文件。</div>
      </section>
      <section class="card">
        <h2>大文件分片上传（100 MB 及以上）</h2>
        <ol>
          <li>调用 <code>POST /api/entry/multipart/init</code> 并发送 JSON：<code>{"filename":"archive.zip","contentType":"application/zip","size":123456789,"note":"可选","expirationDays":30}</code>。响应包含 <code>uploadId</code>、<code>id</code> 和 <code>chunkSize</code>（8 MiB）。</li>
          <li>将文件切成不超过 <code>chunkSize</code> 的数据块，逐块调用 <code>PUT /api/entry/multipart/part/{uploadId}/{partNumber}</code>，请求体直接放该块的二进制数据，分片编号从 1 开始。每次请求都要带 API Key。</li>
          <li>调用 <code>POST /api/entry/multipart/complete</code> 并发送 JSON <code>{"uploadId":"UPLOAD_ID"}</code>。响应包含 <code>id</code>、<code>filename</code>、<code>version</code> 和 <code>md5</code>。</li>
        </ol>
        <p>若需中止上传，调用 <code>POST /api/entry/multipart/abort</code> 并发送 <code>{"uploadId":"UPLOAD_ID"}</code>。</p>
        <pre><code>curl -X POST "https://你的域名/api/entry/multipart/init" -H "X-API-Key: YOUR_API_KEY" -H "Content-Type: application/json" -d '{"filename":"archive.zip","contentType":"application/zip","size":123456789}'</code></pre>
      </section>
      <section class="card">
        <h2>访客链接、设置与用量</h2>
        <div class="endpoint"><span class="method">GET</span><code>/api/guest-links</code><p>列出当前账号的访客上传链接。</p></div>
        <div class="endpoint"><span class="method">POST</span><code>/api/guest-links</code><p>创建访客上传链接。JSON 字段：<code>label</code>、<code>max_file_bytes</code>、<code>max_file_lifetime_days</code>、<code>max_file_uploads</code>、<code>url_expires</code>（日期时间）。返回 <code>{"id":"GUEST_ID"}</code>，访客链接为 <code>/guest/GUEST_ID</code>。托管免费版最多 3 个有效链接，Pro 最多 20 个；文件大小和保留时间不能超过所属账号套餐限制。未指定时保留时间默认为套餐上限。负数限制和无效过期时间会被拒绝。</p></div>
        <div class="endpoint"><span class="method">DELETE</span><code>/api/guest-links/{id}</code><p>删除访客上传链接。响应：<code>{"ok":true}</code>。</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/api/settings</code><p>读取账号上传设置：<code>storeForever</code> 和 <code>defaultDays</code>。</p></div>
        <div class="endpoint"><span class="method">PUT</span><code>/api/settings</code><p>用 JSON 更新设置：<code>{"storeForever":true,"defaultDays":30}</code>。</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/api/system-info</code><p>读取账号存储用量和项目计数，字段包括 <code>upload_data_bytes</code>、<code>db_entry_count</code>、<code>db_guest_link_count</code> 和 <code>download_count</code>。</p></div>
      </section>
      <section class="card">
        <h2>云便签接口</h2>
        <p>SaaS 模式下使用与文件接口相同的 <code>X-API-Key</code> 请求头。每个 API Key 只能访问所属账号的云便签。所有 Key 共享账号额度：Free 每月 500 次、每分钟 10 次；Pro 每月 5,000 次、每分钟 60 次。网页登录操作不计入 API 额度。</p>
        <div class="endpoint"><span class="method">GET</span><code>/clipboard-api/list</code><p>列出当前账号的云便签，返回数组。每项包含 <code>slug</code>、<code>publicId</code>、<code>updatedAt</code>、<code>charCount</code>、<code>itemCount</code> 和 <code>hasPassword</code>。</p>
          <pre><code>curl "https://你的域名/clipboard-api/list" -H "X-API-Key: YOUR_API_KEY"</code></pre>
        </div>
        <div class="endpoint"><span class="method">GET</span><code>/clipboard-api/item/{slug}</code><p>读取云便签内容和信息。便签不存在时返回空内容。响应包含 <code>content</code>、<code>createdAt</code>、<code>updatedAt</code>、<code>itemCount</code>、<code>lineCount</code> 和 <code>charCount</code>。</p></div>
        <div class="endpoint"><span class="method">PUT</span><code>/clipboard-api/item/{slug}</code><p>新建或覆盖云便签，JSON 请求体为 <code>{"content":"..."}</code>。SaaS 免费版最多 5 条便签，每条最多 32 KiB UTF-8 文本；Pro 最多 20 条，每条最多 128 KiB。自托管模式每条最多 1,000,000 个字符。SaaS 模式响应会返回用于分享的 <code>publicId</code>。</p>
          <pre><code>curl -X PUT "https://你的域名/clipboard-api/item/browser-notes" -H "X-API-Key: YOUR_API_KEY" -H "Content-Type: application/json" -d '{"content":"通过我的集成保存"}'</code></pre>
          <pre><code>const response = await fetch("https://你的域名/clipboard-api/item/browser-notes", {
  method: "PUT",
  headers: { "X-API-Key": "YOUR_API_KEY", "Content-Type": "application/json" },
  body: JSON.stringify({ content: "通过我的集成保存" })
});
const clip = await response.json();
const shareUrl = "https://你的域名/c/" + clip.publicId;</code></pre>
        </div>
        <div class="endpoint"><span class="method">DELETE</span><code>/clipboard-api/item/{slug}</code><p>删除当前账号的一条云便签及其公开分享链接；SaaS 模式需要便签所有者身份验证。</p></div>
        <div class="endpoint"><span class="method">GET</span><code>/clipboard-api/public/{publicId}</code><p>通过分享 ID 读取便签，只读且不需要 API Key。若便签设置了密码，请发送 <code>X-Clip-Password: YOUR_CLIP_PASSWORD</code> 请求头；密码缺失或错误会返回 <code>401</code>。</p></div>
        <div class="endpoint"><span class="method">PUT</span><code>/clipboard-api/item/{slug}/password</code><p>设置、更换或取消便签密码（最多 128 个字符）。已鉴权的便签所有者发送 <code>{"newPassword":"secret"}</code> 设置密码；将 <code>newPassword</code> 设为 <code>null</code> 可取消密码。响应包含 <code>hasPassword</code> 和 <code>publicId</code>。</p>
          <pre><code>curl -X PUT "https://你的域名/clipboard-api/item/browser-notes/password" -H "X-API-Key: YOUR_API_KEY" -H "Content-Type: application/json" -d '{"newPassword":"secret"}'</code></pre>
        </div>
        <p><code>slug</code> 会去除首尾空格并转成小写，空格会变成连字符；可使用字母、数字、下划线和连字符，最长 64 个字符，且不能以连字符开头或结尾。部分路由名称为保留字。</p>
        <div class="callout">分享地址格式为 <code>https://你的域名/c/{publicId}</code>。API Key 请保密；分享时使用 publicId 地址，它只能读取便签。</div>
      </section>
      <section class="card">
        <h2>API Key 管理</h2>
        <p>请到账户与订阅页面的 API Key 区域创建、查看或撤销 Key。创建时可选择有效期，默认 90 天，也可选 7、30、180、365 天或永不过期。相关管理请求使用已登录的浏览器会话；API Key 本身不能创建或撤销其他 API Key。</p>
        <p>账户信息、订阅结账和账单管理请到账户页面操作。这些接口要求已登录会话。</p>
      </section>
    </section>
    <footer id="footer-brand">PicoShare API</footer>
  </main>
  <script>
    (function() {
      var state = { lang: localStorage.getItem("ps_lang") === "zh" ? "zh" : "en" };
      var en = document.getElementById("docs-en"), zh = document.getElementById("docs-zh");
      var toggle = document.getElementById("lang-toggle"), back = document.getElementById("back-link");
      var footer = document.getElementById("footer-brand");
      function render() {
        document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
        document.title = state.lang === "zh" ? "PicoShare API 接口文档" : "PicoShare API Documentation";
        en.classList.toggle("hidden", state.lang === "zh");
        zh.classList.toggle("hidden", state.lang !== "zh");
        toggle.textContent = state.lang === "zh" ? "EN" : "中文";
        back.textContent = state.lang === "zh" ? "← 返回账户与订阅" : "← Account & Subscription";
        footer.textContent = state.lang === "zh" ? "PicoShare API 接口文档" : "PicoShare API";
      }
      toggle.addEventListener("click", function() {
        state.lang = state.lang === "en" ? "zh" : "en";
        localStorage.setItem("ps_lang", state.lang);
        render();
      });
      render();
    })();
  </script>
</body>
</html>`.replaceAll("https://YOUR-DOMAIN", siteOrigin).replaceAll("https://你的域名", siteOrigin);
}
