export function accountPage(googleLoginEnabled: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title id="page-title">PicoShare Account</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font: 15px system-ui, sans-serif; color: #26354d; background: #eef1f8; }
    main { max-width: 820px; margin: 0 auto; }
    .page-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    h1 { margin: 8px 0 18px; }
    .card { margin: 14px 0; padding: 18px; border: 1px solid #ffffffa0; border-radius: 16px; background: #ffffff77; }
    .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    button, input, select { font: inherit; padding: 10px 13px; border: 1px solid #9ba9c0; border-radius: 10px; background: white; }
    button { cursor: pointer; color: #194d87; }
    button:disabled { cursor: not-allowed; opacity: .55; }
    button.danger { color: #a12626; }
    .muted { color: #687790; }
    .hidden { display: none; }
    .key { padding: 10px; margin: 8px 0; border-radius: 8px; background: #f4f6fb; overflow-wrap: anywhere; }
    .key-output { display: flex; gap: 10px; align-items: flex-start; flex-wrap: wrap; }
    .key-output code { flex: 1 1 320px; min-width: 0; padding: 10px; border-radius: 8px; background: white; overflow-wrap: anywhere; user-select: all; }
    #opcpay-qr-panel { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,.55); }
    #opcpay-qr-panel.hidden { display: none; }
    #opcpay-qr-card { width: min(100%, 380px); padding: 24px; border-radius: 14px; background: #fff; color: #111; text-align: center; }
    #opcpay-qr-image { display: block; width: 240px; height: 240px; max-width: 100%; margin: 16px auto; object-fit: contain; }
    #opcpay-qr-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
    #new-key-copy-status { min-height: 1.4em; margin: 6px 0 0; }
    #create-key { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(150px, 190px) auto; align-items: end; }
    #create-key label { display: block; margin-bottom: 5px; color: #687790; font-size: 13px; }
    #create-key input, #create-key select { width: 100%; min-width: 0; }
    #email-auth-form { display: grid; gap: 10px; max-width: 480px; }
    #email-auth-form label { display: block; margin-bottom: 5px; }
    #email-auth-form input { width: 100%; }
    #admin-users-search { display: grid; grid-template-columns: minmax(180px, 1fr) auto; align-items: end; }
    #admin-users-search label { display: block; color: #687790; font-size: 13px; }
    #admin-users-search input { display: block; width: 100%; margin-top: 5px; }
    #admin-users-list, #admin-files-list { display: grid; gap: 8px; margin-top: 12px; }
    .admin-user-row, .admin-file-row { display: grid; gap: 8px; align-items: center; padding: 12px; border-radius: 10px; background: #f4f6fb; }
    .admin-user-row { grid-template-columns: minmax(180px, 1.5fr) minmax(120px, 1fr) minmax(120px, 1fr) auto; }
    .admin-file-row { grid-template-columns: minmax(180px, 1.5fr) minmax(110px, 1fr) minmax(140px, 1fr) auto; }
    .admin-row-title { overflow-wrap: anywhere; font-weight: 600; }
    .admin-row-meta { color: #687790; font-size: 13px; overflow-wrap: anywhere; }
    .admin-row-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    #admin-users-pagination, #admin-files-pagination { justify-content: space-between; margin-top: 12px; }
    #admin-user-files-panel { margin-top: 18px; padding-top: 16px; border-top: 1px solid #d5ddea; }
    a { color: #245db2; text-decoration: none; }
    #message { min-height: 22px; color: #a12626; }
    @media (max-width: 700px) { .admin-user-row, .admin-file-row { grid-template-columns: 1fr; } .admin-row-actions { justify-content: flex-start; } }
    @media (max-width: 600px) { body { padding: 16px; } input, select { min-width: 0; width: 100%; } #create-key, #admin-users-search { grid-template-columns: 1fr; } }
    /* Account screens use the same warm paper and blue action language as the home page. */
    body { color: #111; background: #f6f5f4; font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
    main { max-width: 1280px; margin: 0 auto; }
    h1, h2, h3 { color: #111; font-weight: 600; letter-spacing: -.035em; }
    h1 { font-size: clamp(40px,4.5vw,56px); line-height: 1.08; }
    h2 { font-size: clamp(28px,3vw,36px); line-height: 1.15; }
    #account-title::before { content: ""; display: inline-block; width: 36px; height: 36px; margin-right: 12px; vertical-align: -5px; background: url("/favicon.svg") center / contain no-repeat; }
    .card { border: 1px solid rgba(0,0,0,.08); border-radius: 12px; background: #fff; }
    button, input, select { font: inherit; border-radius: 8px; }
    button { padding: 9px 15px; color: #0075de; border: 1px solid transparent; background: #e6f3fe; transition: background-color .2s ease, color .2s ease; }
    button:hover:not(:disabled) { background: #d8edfc; }
    .google-login-row { margin: 16px 0 0; }
    #google-login {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-width: 114px;
      min-height: 42px;
      padding: 0 16px;
      border: 1px solid #e2e2e2;
      border-radius: 10px;
      background: #f7f7f7;
      color: #1f1f1f;
      font-size: 14px;
      font-weight: 500;
      line-height: 20px;
    }
    #google-login:hover:not(:disabled) { border-color: #d5d5d5; background: #f1f1f1; }
    .google-login-icon { display: block; width: 18px; height: 18px; flex: none; }
    button:disabled { opacity: .5; }
    button.danger, #admin-user-delete { color: #fff; background: #f64932; }
    button.danger:hover:not(:disabled), #admin-user-delete:hover:not(:disabled) { background: #d93420; }
    #email-submit, #buy-monthly, #buy-yearly, #create-key button, #admin-grant { color: #fff; background: #0075de; }
    #email-submit:hover:not(:disabled), #buy-monthly:hover:not(:disabled), #buy-yearly:hover:not(:disabled), #create-key button:hover:not(:disabled), #admin-grant:hover:not(:disabled) { background: #0068c7; }
    input, select { color: #111; border-color: rgba(0,0,0,.16); background: #fff; }
    input:focus, select:focus { outline: 0; border-color: #0075de; box-shadow: 0 0 0 3px rgba(0,117,222,.12); }
    .muted, .admin-row-meta { color: #615d59; }
    .key { border-radius: 8px; background: #e6f3fe; }
    .key-output code { border: 1px solid rgba(0,0,0,.08); border-radius: 8px; background: #fff; }
    .admin-user-row, .admin-file-row { border: 1px solid rgba(0,0,0,.08); border-radius: 8px; background: #f6f5f4; }
    #admin-user-files-panel { border-top-color: rgba(0,0,0,.08); }
    a { color: #0075de; }
    #message { color: #f64932; }
    @media (max-width: 980px) { body { padding: 16px; } }
    @media (max-width: 720px) {
      body { padding: 16px; }
      .admin-user-row, .admin-file-row { grid-template-columns: 1fr; }
      .admin-row-actions { justify-content: flex-start; }
      input, select { min-width: 0; width: 100%; }
      #create-key, #admin-users-search { grid-template-columns: 1fr; }
    }
    @media (max-width: 600px) {
      body { padding: 12px; font-size: 16px; line-height: 1.55; }
      .page-head { align-items: flex-start; gap: 8px; flex-wrap: wrap; }
      .page-head p { margin: 8px 0; }
      h1 { margin: 8px 0 16px; font-size: clamp(30px, 8vw, 38px); line-height: 1.12; }
      h2 { font-size: clamp(23px, 6vw, 28px); line-height: 1.2; }
      h3 { font-size: 19px; line-height: 1.3; }
      .card { padding: 15px; }
      .row { align-items: stretch; }
      .row > button { min-height: 44px; }
      #buy-monthly, #buy-yearly, #manage-billing { flex: 1 1 100%; }
      #lang-toggle { min-height: 40px; }
      #message { font-size: 15px; overflow-wrap: anywhere; }
      #email-auth-note, .muted, .admin-row-meta { font-size: 14px; }
      .admin-user-row, .admin-file-row { padding: 10px; }
      #admin-users-pagination, #admin-files-pagination { align-items: center; }
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
    <div class="page-head">
      <p><a id="back-home" href="/">← Back to PicoShare</a></p>
      <button id="lang-toggle" type="button">中文</button>
    </div>
    <h1 id="account-title">Account &amp; Subscription</h1>
    <div id="message" role="status"></div>
    <div id="opcpay-qr-panel" class="hidden" role="dialog" aria-modal="true" aria-labelledby="opcpay-qr-title">
      <div id="opcpay-qr-card" class="card">
        <h2 id="opcpay-qr-title">支付宝扫码支付</h2>
        <p id="opcpay-qr-help" class="muted">请使用支付宝扫描二维码完成支付。</p>
        <img id="opcpay-qr-image" alt="支付宝支付二维码" />
        <div id="opcpay-qr-actions"><button id="opcpay-open-alipay" type="button">打开支付宝</button><button id="opcpay-qr-close" type="button">关闭</button></div>
      </div>
    </div>
    <section id="signed-out" class="card hidden">
      <h2 id="auth-title">Sign in or create an account</h2>
      <p id="auth-help" class="muted">Sign in to manage your files, API keys, and subscription.</p>
      <form id="email-auth-form">
        <div id="email-name-field" class="hidden"><label id="email-name-label" for="email-name">Name</label><input id="email-name" name="name" maxlength="80" autocomplete="name" /></div>
        <div><label id="email-address-label" for="email-address">Email</label><input id="email-address" name="email" type="email" required maxlength="254" autocomplete="email" /></div>
        <div><label id="email-password-label" for="email-password">Password</label><input id="email-password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="current-password" /></div>
        <div class="row"><button id="email-submit" type="submit">Sign in with email</button><button id="email-mode-toggle" type="button">Create an account</button></div>
        <p id="email-auth-note" class="muted">Password must be at least 8 characters. Email verification and password reset emails are not configured yet.</p>
      </form>
      ${googleLoginEnabled ? '<p class="google-login-row"><button id="google-login" type="button" aria-label="Continue with Google"><svg class="google-login-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.75 7.18l7.73 6C44.42 37.85 46.98 31.7 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.9 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg><span>Google</span></button></p>' : ''}
    </section>
    <div id="signed-in" class="hidden">
      <section class="card"><div class="row" style="justify-content:space-between"><div><strong id="user-name"></strong><div id="user-email" class="muted"></div></div><button id="logout" type="button">Sign out</button></div></section>
      <section class="card">
        <h2 id="plan-title">Plan &amp; Usage</h2>
        <p><span id="current-plan-label">Current plan:</span> <strong id="plan"></strong> (<span id="subscription-status"></span>)</p>
        <p><span id="storage-label">Storage:</span> <span id="storage"></span> · <span id="requests-label">API requests this month:</span> <span id="requests"></span></p>
        <p id="plan-limit-summary" class="muted"></p>
        <p id="period-end" class="muted"></p>
        <div id="waffo-checkout-row" class="row"><button id="buy-monthly" type="button">Subscribe to Pro · $5/month</button><button id="buy-yearly" type="button">Subscribe to Pro · $50/year</button><button id="manage-billing" type="button">Manage subscription</button></div>
        <div id="opcpay-checkout-row" class="row hidden"></div>
        <p id="billing-config-note" class="muted hidden"></p>
      </section>
      <section id="admin-grant-panel" class="card hidden">
        <h2 id="admin-title">Superadmin: manual Pro access</h2>
        <p id="admin-help" class="muted">Grant Pro directly without creating a Waffo transaction. Every change is audited.</p>
        <form id="admin-search-form" class="row">
          <label for="admin-target-email"><span id="admin-email-label">Account email</span><input id="admin-target-email" type="email" maxlength="254" autocomplete="off" required /></label>
          <button id="admin-lookup" type="submit">Find account</button>
        </form>
        <div id="admin-target-card" class="hidden">
          <p id="admin-target-summary"></p>
          <p id="admin-grant-info" class="muted"></p>
          <div class="row">
            <label for="admin-duration"><span id="admin-duration-label">Duration</span><select id="admin-duration">
              <option id="admin-duration-permanent" value="permanent">Permanent</option>
              <option id="admin-duration-30" value="30">30 days</option>
              <option id="admin-duration-90" value="90">90 days</option>
              <option id="admin-duration-365" value="365">365 days</option>
            </select></label>
            <label for="admin-note"><span id="admin-note-label">Internal note (optional)</span><input id="admin-note" maxlength="200" autocomplete="off" /></label>
          </div>
          <div class="row"><button id="admin-grant" type="button">Grant Pro</button><button id="admin-revoke" class="danger hidden" type="button">Revoke manual grant</button></div>
          <h3 id="admin-audit-title"></h3><ol id="admin-audit" class="muted"></ol>
        </div>
        <p id="admin-message" class="muted" role="status" aria-live="polite"></p>
      </section>
      <section id="admin-users-panel" class="card hidden">
        <h2 id="admin-users-title">User management</h2>
        <p id="admin-users-help" class="muted">Search registered users, inspect files, and remove data.</p>
        <form id="admin-users-search" class="row">
          <label for="admin-users-query"><span id="admin-users-search-label">Search</span><input id="admin-users-query" type="search" maxlength="254" autocomplete="off" /></label>
          <button id="admin-users-search-submit" type="submit">Search</button>
        </form>
        <p id="admin-users-message" class="muted" role="status" aria-live="polite"></p>
        <div id="admin-users-list"></div>
        <div id="admin-users-pagination" class="row">
          <button id="admin-users-prev" type="button">Previous</button><span id="admin-users-page-info" class="muted"></span><button id="admin-users-next" type="button">Next</button>
        </div>
        <div id="admin-user-files-panel" class="hidden">
          <h3 id="admin-files-title">Files</h3>
          <p id="admin-files-user" class="muted"></p>
          <p id="admin-files-message" class="muted" role="status" aria-live="polite"></p>
          <div id="admin-files-list"></div>
          <div id="admin-files-pagination" class="row">
            <button id="admin-files-prev" type="button">Previous</button><span id="admin-files-page-info" class="muted"></span><button id="admin-files-next" type="button">Next</button>
          </div>
          <div class="row" style="margin-top:12px"><button id="admin-user-delete" class="danger" type="button">Delete account</button><button id="admin-user-close" type="button">Close</button></div>
        </div>
      </section>
      <section class="card">
        <h2 id="api-key-title">API Keys</h2>
        <p id="api-key-note" class="muted">A key is shown in full only once when it is created. Do not put it in a public repository or web page.</p>
        <p class="muted"><span id="api-key-auth-hint">Call APIs with this request header:</span> <code>X-API-Key: YOUR_API_KEY</code> · <a id="api-docs-link" href="/api-docs">API call manual</a></p>
        <form id="create-key">
          <div><label id="key-name-label" for="key-name">Key name</label><input id="key-name" maxlength="32" placeholder="Name, e.g. browser-extension" required /></div>
          <div><label id="key-expiration-label" for="key-expiration">Expiration</label><select id="key-expiration">
            <option id="key-expiration-7" value="604800">7 days</option>
            <option id="key-expiration-30" value="2592000">30 days</option>
            <option id="key-expiration-90" value="7776000" selected>90 days</option>
            <option id="key-expiration-180" value="15552000">180 days</option>
            <option id="key-expiration-365" value="31536000">365 days</option>
            <option id="key-expiration-never" value="">Never expires</option>
          </select></div>
          <button id="create-key-submit" type="submit">Create API key</button>
        </form>
        <div id="new-key" class="key hidden" aria-live="polite">
          <p id="new-key-instructions"></p>
          <div class="key-output"><code id="new-key-value"></code><button id="copy-new-key" type="button">Copy API key</button></div>
          <p id="new-key-expiration" class="muted"></p>
          <p id="new-key-copy-status" class="muted" role="status"></p>
        </div>
        <div id="key-list"></div>
      </section>
    </div>
  </main>
  <script>
    (function() {
      var googleEnabled = ${googleLoginEnabled ? "true" : "false"};
      var state = { lang: localStorage.getItem("ps_lang") === "zh" ? "zh" : "en" };
      var I18N = {
        en: {
          page_title: "PicoShare Account", back_home: "← Back to PicoShare", lang_switch: "中文", account_title: "Account & Subscription",
          auth_title: "Sign in or create an account", auth_help: "Sign in to manage your files, API keys, and subscription.",
          name: "Name", email: "Email", password: "Password", email_sign_in: "Sign in with email", email_sign_up: "Create account",
          switch_to_sign_up: "Create an account", switch_to_sign_in: "Already have an account? Sign in",
          email_auth_note: "Password must be at least 8 characters. Email verification and password reset emails are not configured yet.",
          google_continue: "Continue with Google", logout: "Sign out", plan_title: "Plan & Usage", current_plan: "Current plan:",
          plan_free: "FREE", plan_pro: "PRO", opcpay_month: "Pay with Alipay · 1 month · ¥{price}", opcpay_year: "Pay with Alipay · 1 year · ¥{price}", opcpay_unavailable: "Alipay Pro plans are currently unavailable.", opcpay_use_alipay_app: "This Alipay link must be opened on a device with Alipay installed.", opcpay_qr_title: "Pay with Alipay QR code", opcpay_qr_help: "Scan this QR code with Alipay to complete your payment.", opcpay_open_alipay: "Open Alipay", opcpay_qr_close: "Close", opcpay_qr_alt: "Alipay payment QR code", status_active: "Active", status_trialing: "Trialing", status_past_due: "Payment past due",
          status_cancelled: "Cancelled", status_canceled: "Canceled", status_canceling: "Cancels at period end", status_inactive: "Inactive", status_pending: "Pending", status_expired: "Expired", status_free: "Free", status_admin_granted: "Admin granted",
          storage: "Storage:", monthly_requests: "API requests this month:", current_period_end: "Current period ends:",
          limit_summary: "Per file: {file} · retention: {retention} days · Pro file storage: permanent option · notes: {clips} up to {clip_bytes} each · API keys: {keys} · guest links: {guest_links} · API rate: {rate}/min",
          subscribe_monthly: "Subscribe to Pro · $5/month", subscribe_yearly: "Subscribe to Pro · $50/year", manage_subscription: "Manage subscription",
          checkout_unavailable: "Pro checkout is not configured yet. Configure Waffo merchant credentials and Pro subscription product IDs to enable it.", checkout_partial: "Some Pro billing options are not configured yet.", portal_unavailable: "Subscription management is not configured yet.", production_store_not_approved: "This Waffo store has not been approved to accept production payments yet. Complete production payment approval in Waffo, then retry. No payment was created.",
          payment_activating: "Payment returned successfully. Waiting for subscription activation…", subscription_active_message: "Pro is active. Your account limits have been updated.", payment_still_processing: "Payment was received. Pro activation is still processing; refresh this page in a moment.", payment_cancelled: "Checkout was cancelled.", payment_failed_status: "The subscription was not activated. Please try again or contact support.",
          api_key_title: "API Keys", api_key_note: "A key is shown in full only once when it is created. Do not put it in a public repository or web page.",
          api_key_auth_hint: "Call APIs with this request header:", api_docs_link: "API call manual",
          key_name_label: "Key name", key_expiration_label: "Expiration", expires_7: "7 days", expires_30: "30 days", expires_90: "90 days", expires_180: "180 days", expires_365: "365 days", never_expires: "Never expires", expires_on: "Expires", expired: "Expired",
          key_expiration_invalid: "Choose a supported API Key expiration.",
          key_name_placeholder: "Name, e.g. browser-extension", create_api_key: "Create API key", copy_save_key: "Copy and save this key now; it cannot be viewed again:",
          copy_api_key: "Copy API key", api_key_copied: "API key copied.", api_key_copy_failed: "Could not copy automatically. Select the key and copy it manually.",
          unnamed: "Unnamed", revoke: "Revoke", revoke_confirm: "Revoke this API key? Clients using it will stop working immediately.",
          no_api_keys: "No API keys yet.", default_user: "PicoShare user", request_failed: "Request failed",
          email_auth_failed: "Email authentication failed.", google_no_url: "Google sign-in did not return a redirect URL.",
          key_name_required: "An API key name is required.", key_limit_reached: "You have reached the API key limit for this plan.",
          key_id_required: "The API key ID is missing.", checkout_not_configured: "Checkout is not configured for this plan.",
          portal_not_configured: "The billing portal is not configured.", checkout_failed: "Could not create a checkout session.",
          portal_failed: "Could not open the billing portal.", invalid_credentials: "The email or password is incorrect.",
          email_exists: "An account already exists for this email.", invalid_email: "Enter a valid email address.",
          admin_title: "Superadmin: manual Pro access", admin_help: "Grant Pro directly without creating a Waffo transaction. Every change is audited.",
          admin_email_label: "Account email", admin_lookup: "Find account", admin_duration_label: "Duration", admin_note_label: "Internal note (optional)",
          admin_note_placeholder: "Reason for this grant", admin_duration_permanent: "Permanent", admin_duration_30: "30 days", admin_duration_90: "90 days", admin_duration_365: "365 days",
          admin_grant: "Grant Pro", admin_revoke: "Revoke manual grant", admin_user_summary: "{name} · {email} · {plan} ({status})",
          admin_manual_none: "No manual Pro grant is on record.", admin_manual_active: "Manual Pro access is active.", admin_manual_expired: "The manual Pro grant has expired.", admin_manual_revoked: "The manual Pro grant was revoked.",
          admin_grant_success: "Pro was granted to {email}.", admin_revoke_success: "The manual Pro grant for {email} was revoked.",
          admin_confirm_grant: "Grant Pro to {email} without a transaction?", admin_confirm_revoke: "Revoke the manual Pro grant for {email}?",
          admin_audit_grant: "Granted Pro", admin_audit_revoke: "Revoked manual Pro", admin_audit_title: "Recent admin actions",
          admin_user_not_found: "No account was found for that email.", admin_forbidden: "Superadmin access is required.", admin_bad_email: "Enter a valid account email.", admin_duration_invalid: "Choose permanent, 30, 90, or 365 days.",
          admin_users_title: "User management", admin_users_help: "Search registered users, inspect files, and remove data.", admin_users_search_label: "Search", admin_users_search_placeholder: "Email or name", admin_users_search: "Search",
          admin_users_no_users: "No matching users.", admin_users_plan: "Plan", admin_users_storage: "Storage", admin_users_files: "Files", admin_users_view_files: "View files", admin_users_delete_account: "Delete account", admin_users_previous: "Previous", admin_users_next: "Next", admin_users_page_info: "{start}–{end} of {total}",
          admin_files_title: "Files", admin_files_for: "Files for {email}", admin_files_no_files: "No files.", admin_file_uploaded: "Uploaded", admin_file_downloads: "Downloads", admin_file_note: "Note", admin_file_delete: "Delete file", admin_file_confirm: "Delete file {name}? This cannot be undone.", admin_file_deleted: "Deleted file {name}.",
          admin_user_delete_prompt: "Type {email} to confirm account deletion:", admin_user_delete_confirm: "Delete account {email} and all its files? This cannot be undone.", admin_user_deleted: "Deleted account {email}.", admin_user_email_mismatch: "The typed email does not match exactly.", admin_user_close: "Close",
          admin_subscription_active: "This Waffo subscription is still active. Cancel it and wait until it ends before deletion.", admin_cleanup_pending: "Account cleanup was interrupted. Retry deletion to resume it.", admin_cleanup_progress: "Deleting account data in batches… please keep this page open.", admin_protected_superadmin: "Protected superadmin accounts cannot be deleted.", admin_self_delete: "You cannot delete your own account.", admin_confirmation_email_mismatch: "The confirmation email does not match this account."
        },
        zh: {
          page_title: "PicoShare 账户", back_home: "← 返回 PicoShare", lang_switch: "EN", account_title: "账户与订阅",
          auth_title: "登录或注册", auth_help: "登录后管理个人文件、API Key 和订阅。", name: "姓名", email: "邮箱", password: "密码",
          email_sign_in: "邮箱登录", email_sign_up: "创建账号", switch_to_sign_up: "注册新账号", switch_to_sign_in: "已有账号？去登录",
          email_auth_note: "密码至少 8 位。注册后自动登录；邮箱验证和密码找回邮件暂未配置。", google_continue: "使用 Google 继续",
          logout: "退出登录", plan_title: "套餐与用量", current_plan: "当前套餐：", plan_free: "免费版", plan_pro: "专业版",
          status_active: "有效", status_trialing: "试用中", status_past_due: "待付款", status_cancelled: "已取消", status_canceled: "已取消",
          status_canceling: "到期后取消", status_inactive: "未启用", status_pending: "待处理", status_expired: "已过期", status_free: "免费", status_admin_granted: "超管开通", storage: "存储：", monthly_requests: "本月 API 请求：",
          current_period_end: "当前周期结束：", limit_summary: "单文件：{file} · 默认保留：{retention} 天，Pro 可选永久保存 · 便签：{clips} 条，每条最多 {clip_bytes} · API Key：{keys} 个 · 访客链接：{guest_links} 个 · API 频率：{rate}/分钟", subscribe_monthly: "订阅 Pro（月付 $5）", subscribe_yearly: "订阅 Pro（年付 $50）", opcpay_month: "支付宝购买 · 1个月 · ¥{price}", opcpay_year: "支付宝购买 · 1年 · ¥{price}", opcpay_unavailable: "支付宝 Pro 套餐暂不可用。", opcpay_use_alipay_app: "该支付宝链接需要在安装了支付宝的设备上打开。", opcpay_qr_title: "支付宝扫码支付", opcpay_qr_help: "请使用支付宝扫描二维码完成支付。", opcpay_open_alipay: "打开支付宝", opcpay_qr_close: "关闭", opcpay_qr_alt: "支付宝支付二维码", manage_subscription: "管理订阅",
          checkout_unavailable: "Pro 结账尚未配置。请配置 Waffo 商户凭据和 Pro 订阅商品 ID 后启用。", checkout_partial: "部分 Pro 订阅周期尚未配置。", portal_unavailable: "订阅管理入口尚未配置。", production_store_not_approved: "当前 Waffo 店铺尚未获准接收生产环境付款。请先在 Waffo 完成生产付款审批，再重试订阅；本次没有创建付款。",
          payment_activating: "支付已返回，正在等待订阅激活……", subscription_active_message: "Pro 已生效，账户额度已更新。", payment_still_processing: "已收到支付结果，Pro 权限仍在处理中，请稍后刷新页面。", payment_cancelled: "已取消结账。", payment_failed_status: "订阅未能激活，请重试或联系支持。",
          api_key_title: "API Key", api_key_note: "Key 仅在创建时完整显示一次。不要把它放在公开仓库或网页代码中。",
          api_key_auth_hint: "调用 API 时请在请求头中传入：", api_docs_link: "查看 API 调用手册",
          key_name_label: "Key 名称", key_expiration_label: "有效期", expires_7: "7 天", expires_30: "30 天", expires_90: "90 天", expires_180: "180 天", expires_365: "365 天", never_expires: "永不过期", expires_on: "到期时间", expired: "已过期",
          key_expiration_invalid: "请选择支持的 API Key 有效期。",
          key_name_placeholder: "名称，例如 browser-extension", create_api_key: "创建 API Key", copy_save_key: "请立即复制并保存，此后无法再次查看：",
          copy_api_key: "复制 API Key", api_key_copied: "API Key 已复制。", api_key_copy_failed: "无法自动复制，请手动选择并复制。",
          unnamed: "未命名", revoke: "撤销", revoke_confirm: "撤销这个 API Key？使用它的客户端会立即失效。",
          no_api_keys: "还没有 API Key。", default_user: "PicoShare 用户", request_failed: "请求失败",
          email_auth_failed: "邮箱登录失败。", google_no_url: "Google 登录没有返回跳转链接。",
          key_name_required: "请填写 API Key 名称。", key_limit_reached: "当前套餐的 API Key 数量已达上限。",
          key_id_required: "缺少 API Key ID。", checkout_not_configured: "当前套餐尚未配置结账。",
          portal_not_configured: "订阅管理入口尚未配置。", checkout_failed: "无法创建订阅结账会话。",
          portal_failed: "无法打开订阅管理页面。", invalid_credentials: "邮箱或密码错误。",
          email_exists: "该邮箱已经注册。", invalid_email: "请输入有效的邮箱地址。",
          admin_title: "超管：手动开通 Pro", admin_help: "直接为账号开通 Pro，不会创建 Waffo 交易；每次操作都会记录审计日志。",
          admin_email_label: "用户邮箱", admin_lookup: "查找账号", admin_duration_label: "开通期限", admin_note_label: "内部备注（可选）",
          admin_note_placeholder: "填写开通原因", admin_duration_permanent: "永久", admin_duration_30: "30 天", admin_duration_90: "90 天", admin_duration_365: "365 天",
          admin_grant: "开通 Pro", admin_revoke: "撤销手动开通", admin_user_summary: "{name} · {email} · {plan}（{status}）",
          admin_manual_none: "没有手动 Pro 开通记录。", admin_manual_active: "手动 Pro 权限有效。", admin_manual_expired: "手动 Pro 权限已过期。", admin_manual_revoked: "手动 Pro 权限已撤销。",
          admin_grant_success: "已为 {email} 开通 Pro。", admin_revoke_success: "已撤销 {email} 的手动 Pro 权限。",
          admin_confirm_grant: "确认跳过交易，为 {email} 开通 Pro？", admin_confirm_revoke: "确认撤销 {email} 的手动 Pro 权限？",
          admin_audit_grant: "开通 Pro", admin_audit_revoke: "撤销手动 Pro", admin_audit_title: "最近的超管操作",
          admin_user_not_found: "没有找到该邮箱对应的账号。", admin_forbidden: "此操作需要超管权限。", admin_bad_email: "请输入有效的用户邮箱。", admin_duration_invalid: "请选择永久、30 天、90 天或 365 天。",
          admin_users_title: "用户管理", admin_users_help: "搜索已注册用户，查看文件并删除数据。", admin_users_search_label: "搜索", admin_users_search_placeholder: "邮箱或姓名", admin_users_search: "搜索",
          admin_users_no_users: "没有匹配的用户。", admin_users_plan: "套餐", admin_users_storage: "存储", admin_users_files: "文件", admin_users_view_files: "查看文件", admin_users_delete_account: "删除账号", admin_users_previous: "上一页", admin_users_next: "下一页", admin_users_page_info: "第 {start}–{end} 条，共 {total} 条",
          admin_files_title: "文件", admin_files_for: "{email} 的文件", admin_files_no_files: "没有文件。", admin_file_uploaded: "上传时间", admin_file_downloads: "下载次数", admin_file_note: "备注", admin_file_delete: "删除文件", admin_file_confirm: "删除文件 {name}？此操作不可恢复。", admin_file_deleted: "文件 {name} 已删除。",
          admin_user_delete_prompt: "请输入 {email} 以确认删除账号：", admin_user_delete_confirm: "删除账号 {email} 及其全部文件？此操作不可恢复。", admin_user_deleted: "账号 {email} 已删除。", admin_user_email_mismatch: "输入的邮箱不完全匹配。", admin_user_close: "关闭",
          admin_subscription_active: "该账号的 Waffo 订阅仍有效，请先取消并等待订阅结束后再删除。", admin_cleanup_pending: "账号清理中断，请再次执行删除以继续。", admin_cleanup_progress: "正在分批清理账号数据，请保持页面打开……", admin_protected_superadmin: "受保护的超级管理员账号不能删除。", admin_self_delete: "不能删除当前登录的账号。", admin_confirmation_email_mismatch: "确认邮箱与该账号不匹配。"
        }
      };
      var $ = function(id) { return document.getElementById(id); };
      var messageEl = $("message"), adminMessageEl = $("admin-message"), signedOutEl = $("signed-out"), signedInEl = $("signed-in"), keyListEl = $("key-list");
      var emailMode = "sign-in", currentAccount = null, currentKeys = [], newApiKey = "", newApiKeyExpiresAt = null, newApiKeyCopyStatus = "", currentMessage = "", currentAdminMessage = "", currentAdminTarget = null;
      var adminUsersLoaded = false, deletionInProgress = false, currentAdminUsersMessage = "", adminUsersState = { search: "", users: [], total: 0, limit: 20, offset: 0, selectedUser: null, files: [], fileTotal: 0, fileLimit: 20, fileOffset: 0 };
      function t(key) { var pack = I18N[state.lang] || I18N.en; return pack[key] || I18N.en[key] || key; }
      function localizedError(text) {
        var raw = String(text || "");
        var errors = {
          "API Key name is required": "key_name_required",
          "API Key limit reached for this plan": "key_limit_reached",
          "API Key id is required": "key_id_required",
          "Invalid API Key expiration": "key_expiration_invalid",
          "Waffo checkout is not configured for this plan": "checkout_not_configured",
          "Waffo customer portal is not configured": "portal_not_configured",
          "Invalid email or password": "invalid_credentials",
          "User already exists. Use another email.": "email_exists",
          "Invalid email": "invalid_email",
          "Email authentication failed.": "email_auth_failed",
          "邮箱登录失败。": "email_auth_failed",
          "Account not found": "admin_user_not_found",
          "A valid account email is required": "admin_bad_email",
          "Superadmin access is required": "admin_forbidden",
          "Duration must be permanent, 30, 90, or 365 days": "admin_duration_invalid",
          "Google sign-in did not return a redirect URL.": "google_no_url",
          "Google 登录没有返回跳转链接。": "google_no_url",
          "The typed email does not match exactly.": "admin_user_email_mismatch",
          "输入的邮箱不完全匹配。": "admin_user_email_mismatch",
          "subscription_active": "admin_subscription_active",
          "account_cleanup_pending": "admin_cleanup_pending",
          "Protected superadmin accounts cannot be deleted": "admin_protected_superadmin",
          "You cannot delete your own account": "admin_self_delete",
          "The confirmation email does not match this account": "admin_confirmation_email_mismatch",
          "受保护的超级管理员账号不能删除。": "admin_protected_superadmin",
          "不能删除当前登录的账号。": "admin_self_delete",
          "确认邮箱与该账号不匹配。": "admin_confirmation_email_mismatch"
        };
        if (errors[raw]) return t(errors[raw]);
        if (/store is not approved for production payments/i.test(raw)) return t("production_store_not_approved");
        if (raw.indexOf("Could not create checkout:") === 0) return raw.slice("Could not create checkout:".length).trim() || t("checkout_failed");
        if (raw.indexOf("Could not create billing portal link:") === 0) return t("portal_failed");
        if (/^Request failed \\(\\d+\\)$/.test(raw)) return t("request_failed") + raw.match(/\\(\\d+\\)/)[0];
        return raw;
      }
      function message(text) { currentMessage = String(text || ""); messageEl.textContent = localizedError(currentMessage); }
      function renderNewKey() {
        var element = $("new-key");
        if (!newApiKey) { element.classList.add("hidden"); return; }
        var expiration = newApiKeyExpiresAt ? t("expires_on") + ": " + dateText(newApiKeyExpiresAt, true) : t("never_expires");
        $("new-key-instructions").textContent = t("copy_save_key");
        $("new-key-value").textContent = newApiKey;
        $("copy-new-key").textContent = t("copy_api_key");
        $("new-key-expiration").textContent = expiration;
        $("new-key-copy-status").textContent = newApiKeyCopyStatus ? t(newApiKeyCopyStatus) : "";
        element.classList.remove("hidden");
      }
      async function copyNewApiKey() {
        var copied = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(newApiKey);
            copied = true;
          }
        } catch (_) {}
        if (!copied) {
          var temporary = document.createElement("textarea");
          temporary.value = newApiKey;
          temporary.setAttribute("readonly", "");
          temporary.style.position = "fixed";
          temporary.style.opacity = "0";
          document.body.appendChild(temporary);
          temporary.select();
          try { copied = document.execCommand("copy"); } catch (_) {}
          temporary.remove();
        }
        newApiKeyCopyStatus = copied ? "api_key_copied" : "api_key_copy_failed";
        renderNewKey();
      }
      function locale() { return state.lang === "zh" ? "zh-CN" : "en-US"; }
      function dateText(value, dateOnly) {
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value || "");
        return date.toLocaleString(locale(), dateOnly ? { year: "numeric", month: "short", day: "numeric" } : undefined);
      }
      function planText(plan) {
        var value = String(plan || "").toLowerCase();
        return value === "free" ? t("plan_free") : value === "pro" ? t("plan_pro") : String(plan || "").toUpperCase();
      }
      function statusText(status) {
        var keys = { active: "status_active", admin_granted: "status_admin_granted", trialing: "status_trialing", past_due: "status_past_due", cancelled: "status_cancelled", canceled: "status_canceled", canceling: "status_canceling", inactive: "status_inactive", pending: "status_pending", expired: "status_expired", free: "status_free" };
        var value = String(status || "").toLowerCase();
        return keys[value] ? t(keys[value]) : String(status || "");
      }
      async function request(path, options) {
        var response = await fetch(path, Object.assign({ credentials: "same-origin" }, options || {}));
        var data = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(data.message || data.error || (t("request_failed") + " (" + response.status + ")"));
        return data;
      }
      function adminMessage(text) { currentAdminMessage = String(text || ""); adminMessageEl.textContent = localizedError(currentAdminMessage); }
      function renderAdminTarget(data) {
        currentAdminTarget = data || null;
        var targetCard = $("admin-target-card");
        if (!data || !data.user) { targetCard.classList.add("hidden"); return; }
        targetCard.classList.remove("hidden");
        var name = data.user.name || t("default_user"), email = data.user.email || "";
        $("admin-target-summary").textContent = t("admin_user_summary")
          .replace("{name}", name).replace("{email}", email).replace("{plan}", planText(data.plan)).replace("{status}", statusText(data.status));
        var grant = data.manualGrant, grantText = t("admin_manual_none");
        if (grant) {
          grantText = grant.active ? t("admin_manual_active") : grant.status === "revoked" ? t("admin_manual_revoked") : t("admin_manual_expired");
          if (grant.expiresAt) grantText += " " + t("current_period_end") + " " + dateText(grant.expiresAt, false);
          else if (grant.active) grantText += " " + t("admin_duration_permanent");
          if (grant.note) grantText += " · " + grant.note;
        }
        $("admin-grant-info").textContent = grantText;
        $("admin-revoke").classList.toggle("hidden", !grant || !grant.active);
        $("admin-audit-title").textContent = t("admin_audit_title");
        var auditList = $("admin-audit"); auditList.replaceChildren();
        (data.audit || []).forEach(function(item) {
          var row = document.createElement("li");
          row.textContent = t(item.action === "grant_pro" ? "admin_audit_grant" : "admin_audit_revoke") + " · " + dateText(item.created_at, false) + " · " + item.actor_email;
          if (item.expires_at) row.textContent += " · " + dateText(item.expires_at, true);
          if (item.note) row.textContent += " · " + item.note;
          auditList.appendChild(row);
        });
      }
      function adminPageInfo(offset, total, limit) {
        if (!total) return "";
        return t("admin_users_page_info").replace("{start}", String(offset + 1)).replace("{end}", String(Math.min(total, offset + limit))).replace("{total}", String(total));
      }
      function adminUsersMessage(text) {
        currentAdminUsersMessage = String(text || "");
        $("admin-users-message").textContent = localizedError(currentAdminUsersMessage);
      }
      function adminFilesMessage(text) {
        $("admin-files-message").textContent = localizedError(String(text || ""));
      }
      function renderAdminUsers() {
        var list = $("admin-users-list");
        list.replaceChildren();
        var users = adminUsersState.users || [];
        if (!users.length) list.textContent = t("admin_users_no_users");
        users.forEach(function(user) {
          var row = document.createElement("div"); row.className = "admin-user-row";
          var identity = document.createElement("div");
          var title = document.createElement("div"); title.className = "admin-row-title"; title.textContent = user.name || t("default_user");
          var email = document.createElement("div"); email.className = "admin-row-meta"; email.textContent = user.email || "";
          identity.append(title, email);
          var plan = document.createElement("div"); plan.className = "admin-row-meta"; plan.textContent = t("admin_users_plan") + ": " + planText(user.plan) + " · " + statusText(user.status);
          var stats = document.createElement("div"); stats.className = "admin-row-meta"; stats.textContent = t("admin_users_storage") + ": " + formatBytes(user.storageBytes) + " · " + t("admin_users_files") + ": " + Number(user.fileCount || 0).toLocaleString(locale());
          var actions = document.createElement("div"); actions.className = "admin-row-actions";
          var view = document.createElement("button"); view.type = "button"; view.textContent = t("admin_users_view_files");
          view.addEventListener("click", function() { loadAdminFiles(user, true).catch(function(error) { adminFilesMessage(error.message || t("request_failed")); }); });
          var remove = document.createElement("button"); remove.type = "button"; remove.className = "danger"; remove.textContent = t("admin_users_delete_account");
          remove.addEventListener("click", function() { deleteAdminUser(user); });
          actions.append(view, remove); row.append(identity, plan, stats, actions); list.appendChild(row);
        });
        $("admin-users-prev").disabled = adminUsersState.offset <= 0;
        $("admin-users-next").disabled = adminUsersState.offset + adminUsersState.limit >= adminUsersState.total;
        $("admin-users-page-info").textContent = adminPageInfo(adminUsersState.offset, adminUsersState.total, adminUsersState.limit);
      }
      function renderAdminFiles() {
        var panel = $("admin-user-files-panel"), list = $("admin-files-list");
        if (!adminUsersState.selectedUser) { panel.classList.add("hidden"); return; }
        panel.classList.remove("hidden");
        var user = adminUsersState.selectedUser;
        $("admin-files-title").textContent = t("admin_files_title");
        $("admin-files-user").textContent = t("admin_files_for").replace("{email}", user.email || "");
        list.replaceChildren();
        var files = adminUsersState.files || [];
        if (!files.length) list.textContent = t("admin_files_no_files");
        files.forEach(function(file) {
          var row = document.createElement("div"); row.className = "admin-file-row";
          var identity = document.createElement("div");
          var title = document.createElement("div"); title.className = "admin-row-title"; title.textContent = file.filename || file.id || "";
          var note = document.createElement("div"); note.className = "admin-row-meta"; note.textContent = file.note ? t("admin_file_note") + ": " + file.note : "";
          identity.append(title, note);
          var metadata = document.createElement("div"); metadata.className = "admin-row-meta"; metadata.textContent = formatBytes(file.size) + " · " + t("admin_file_downloads") + ": " + Number(file.downloadCount || 0).toLocaleString(locale());
          var uploaded = document.createElement("div"); uploaded.className = "admin-row-meta"; uploaded.textContent = t("admin_file_uploaded") + ": " + dateText(file.uploadTime, false);
          var actions = document.createElement("div"); actions.className = "admin-row-actions";
          var remove = document.createElement("button"); remove.type = "button"; remove.className = "danger"; remove.textContent = t("admin_file_delete");
          remove.addEventListener("click", function() { deleteAdminFile(file); });
          actions.appendChild(remove); row.append(identity, metadata, uploaded, actions); list.appendChild(row);
        });
        $("admin-files-prev").disabled = adminUsersState.fileOffset <= 0;
        $("admin-files-next").disabled = adminUsersState.fileOffset + adminUsersState.fileLimit >= adminUsersState.fileTotal;
        $("admin-files-page-info").textContent = adminPageInfo(adminUsersState.fileOffset, adminUsersState.fileTotal, adminUsersState.fileLimit);
      }
      async function loadAdminUsers(reset) {
        if (reset) adminUsersState.offset = 0;
        adminUsersState.search = $("admin-users-query").value.trim();
        var query = "?search=" + encodeURIComponent(adminUsersState.search) + "&limit=" + adminUsersState.limit + "&offset=" + adminUsersState.offset;
        var result = await request("/api/admin/users" + query);
        adminUsersState.users = result.users || []; adminUsersState.total = Number(result.total || 0);
        adminUsersState.limit = Number(result.limit || adminUsersState.limit); adminUsersState.offset = Number(result.offset || 0);
        adminUsersLoaded = true; adminUsersMessage(""); renderAdminUsers();
      }
      async function loadAdminFiles(user, reset) {
        adminUsersState.selectedUser = user;
        if (reset) adminUsersState.fileOffset = 0;
        renderAdminFiles(); adminFilesMessage("");
        var query = "?limit=" + adminUsersState.fileLimit + "&offset=" + adminUsersState.fileOffset;
        var result = await request("/api/admin/users/" + encodeURIComponent(user.id) + "/files" + query);
        adminUsersState.selectedUser = result.user || user; adminUsersState.files = result.files || []; adminUsersState.fileTotal = Number(result.total || 0);
        adminUsersState.fileLimit = Number(result.limit || adminUsersState.fileLimit); adminUsersState.fileOffset = Number(result.offset || 0);
        renderAdminFiles();
      }
      async function deleteAdminFile(file) {
        var user = adminUsersState.selectedUser; if (!user || !file || !file.id) return;
        var name = file.filename || file.id;
        if (!confirm(t("admin_file_confirm").replace("{name}", name))) return;
        try {
          await request("/api/admin/users/" + encodeURIComponent(user.id) + "/files/" + encodeURIComponent(file.id), { method: "DELETE" });
          adminFilesMessage(t("admin_file_deleted").replace("{name}", name));
          await loadAdminFiles(user, true);
          await loadAdminUsers(false);
        } catch (error) { adminFilesMessage(error.message || t("request_failed")); }
      }
      async function deleteAdminUser(user) {
        if (deletionInProgress || !user || !user.id || !user.email) return;
        var typed = prompt(t("admin_user_delete_prompt").replace("{email}", user.email));
        if (typed === null) return;
        if (typed !== user.email) { adminUsersMessage(t("admin_user_email_mismatch")); return; }
        if (!confirm(t("admin_user_delete_confirm").replace("{email}", user.email))) return;
        deletionInProgress = true;
        try {
          var result;
          do {
            result = await request("/api/admin/users/" + encodeURIComponent(user.id), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmEmail: typed }) });
            if (result.pending) adminUsersMessage(t("admin_cleanup_progress"));
          } while (result.pending);
          adminUsersMessage(t("admin_user_deleted").replace("{email}", user.email));
          if (adminUsersState.selectedUser && adminUsersState.selectedUser.id === user.id) {
            adminUsersState.selectedUser = null; adminUsersState.files = []; adminUsersState.fileTotal = 0; renderAdminFiles();
          }
          await loadAdminUsers(false);
        } catch (error) { adminUsersMessage(error.message || t("request_failed")); }
        finally { deletionInProgress = false; }
      }
      function renderEmailMode() {
        var registering = emailMode === "sign-up";
        $("email-name-field").classList.toggle("hidden", !registering);
        $("email-name").required = registering;
        $("email-password").autocomplete = registering ? "new-password" : "current-password";
        $("email-submit").textContent = t(registering ? "email_sign_up" : "email_sign_in");
        $("email-mode-toggle").textContent = t(registering ? "switch_to_sign_in" : "switch_to_sign_up");
      }
      function renderKeys(keys) {
        keyListEl.replaceChildren();
        (keys || []).forEach(function(key) {
          var row = document.createElement("div"), label = document.createElement("span"), revoke = document.createElement("button");
          var expiry = key.expiresAt
            ? ((new Date(key.expiresAt).getTime() <= Date.now() ? t("expired") : t("expires_on")) + ": " + dateText(key.expiresAt, true))
            : t("never_expires");
          row.className = "key row"; label.textContent = (key.name || t("unnamed")) + " · " + (key.start || key.prefix || "ps_live_…") + " · " + dateText(key.createdAt, true) + " · " + expiry;
          revoke.className = "danger"; revoke.type = "button"; revoke.textContent = t("revoke");
          revoke.addEventListener("click", async function() {
            if (!confirm(t("revoke_confirm"))) return;
            try { await request("/api/api-keys/" + encodeURIComponent(key.id), { method: "DELETE" }); await loadKeys(); }
            catch (error) { message(error.message || t("request_failed")); }
          });
          row.append(label, revoke); keyListEl.appendChild(row);
        });
        if (!keys || !keys.length) keyListEl.textContent = t("no_api_keys");
      }
      function renderAccount(account) {
        $("opcpay-checkout-row").replaceChildren();
        $("opcpay-checkout-row").dataset.loaded = "";
        $("user-name").textContent = account.user.name || t("default_user");
        $("user-email").textContent = account.user.email || "";
        $("plan").textContent = planText(account.plan);
        $("subscription-status").textContent = statusText(account.status);
        $("storage").textContent = formatBytes(account.storageUsed) + " / " + formatBytes(account.limits.storageBytes);
        $("requests").textContent = Number(account.apiRequestsUsed || 0).toLocaleString(locale()) + " / " + Number(account.limits.monthlyApiRequests).toLocaleString(locale());
        $("plan-limit-summary").textContent = t("limit_summary")
          .replace("{file}", formatBytes(account.limits.maxFileBytes))
          .replace("{retention}", String(account.limits.maxFileLifetimeDays))
          .replace("{clips}", String(account.limits.maxClipboards))
          .replace("{clip_bytes}", formatBytes(account.limits.maxClipboardBytes))
          .replace("{keys}", String(account.limits.maxApiKeys))
          .replace("{guest_links}", String(account.limits.maxGuestLinks))
          .replace("{rate}", String(account.limits.apiRequestsPerMinute));
        $("period-end").textContent = account.currentPeriodEnd ? t("current_period_end") + " " + dateText(account.currentPeriodEnd, false) : "";
        var chineseLocale = state.lang === "zh";
        var chinesePayments = chineseLocale && Boolean(account.opcpayAvailable);
        $("waffo-checkout-row").classList.toggle("hidden", chineseLocale);
        $("buy-monthly").classList.toggle("hidden", account.plan === "pro");
        $("buy-yearly").classList.toggle("hidden", account.plan === "pro");
        $("buy-monthly").disabled = !account.checkout.monthly;
        $("buy-yearly").disabled = !account.checkout.yearly;
        $("manage-billing").classList.toggle("hidden", !account.portalAvailable || chineseLocale);
        var opcRow = $("opcpay-checkout-row");
        opcRow.classList.toggle("hidden", !chinesePayments || account.plan === "pro");
        if (chinesePayments && account.plan !== "pro" && !opcRow.dataset.loaded) loadOpcPayPlans();
        $("admin-grant-panel").classList.toggle("hidden", !account.isSuperadmin);
        $("admin-users-panel").classList.toggle("hidden", !account.isSuperadmin);
        if (!account.isSuperadmin) { renderAdminTarget(null); adminUsersLoaded = false; adminUsersState.selectedUser = null; renderAdminFiles(); }
        else if (!adminUsersLoaded) loadAdminUsers(false).catch(function(error) { adminUsersMessage(error.message || t("request_failed")); });
        var billingNote = $("billing-config-note");
        var hasMonthlyCheckout = Boolean(account.checkout.monthly), hasYearlyCheckout = Boolean(account.checkout.yearly);
        billingNote.textContent = chinesePayments ? t("opcpay_unavailable") : account.plan === "pro"
          ? t("portal_unavailable")
          : (hasMonthlyCheckout || hasYearlyCheckout)
            ? t("checkout_partial")
            : t("checkout_unavailable");
        billingNote.classList.toggle("hidden", chinesePayments ? false : account.plan === "pro" ? account.portalAvailable : (hasMonthlyCheckout && hasYearlyCheckout));
      }
      function applyTranslations() {
        document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
        document.title = t("page_title"); $("page-title").textContent = t("page_title"); $("back-home").textContent = t("back_home");
        $("lang-toggle").textContent = t("lang_switch"); $("account-title").textContent = t("account_title"); $("auth-title").textContent = t("auth_title");
        $("opcpay-qr-title").textContent = t("opcpay_qr_title"); $("opcpay-qr-help").textContent = t("opcpay_qr_help");
        $("opcpay-open-alipay").textContent = t("opcpay_open_alipay"); $("opcpay-qr-close").textContent = t("opcpay_qr_close"); $("opcpay-qr-image").alt = t("opcpay_qr_alt");
        $("auth-help").textContent = t("auth_help"); $("email-name-label").textContent = t("name"); $("email-address-label").textContent = t("email");
        $("email-password-label").textContent = t("password"); $("email-auth-note").textContent = t("email_auth_note");
        $("plan-title").textContent = t("plan_title"); $("current-plan-label").textContent = t("current_plan"); $("storage-label").textContent = t("storage");
        $("requests-label").textContent = t("monthly_requests"); $("buy-monthly").textContent = t("subscribe_monthly"); $("buy-yearly").textContent = t("subscribe_yearly");
        $("manage-billing").textContent = t("manage_subscription"); $("api-key-title").textContent = t("api_key_title"); $("api-key-note").textContent = t("api_key_note");
        $("api-key-auth-hint").textContent = t("api_key_auth_hint"); $("api-docs-link").textContent = t("api_docs_link");
        $("key-name-label").textContent = t("key_name_label"); $("key-expiration-label").textContent = t("key_expiration_label");
        $("key-expiration-7").textContent = t("expires_7"); $("key-expiration-30").textContent = t("expires_30"); $("key-expiration-90").textContent = t("expires_90");
        $("key-expiration-180").textContent = t("expires_180"); $("key-expiration-365").textContent = t("expires_365"); $("key-expiration-never").textContent = t("never_expires");
        $("key-name").placeholder = t("key_name_placeholder"); $("create-key-submit").textContent = t("create_api_key"); $("logout").textContent = t("logout");
        $("admin-title").textContent = t("admin_title"); $("admin-help").textContent = t("admin_help");
        $("admin-email-label").textContent = t("admin_email_label"); $("admin-lookup").textContent = t("admin_lookup");
        $("admin-duration-label").textContent = t("admin_duration_label"); $("admin-note-label").textContent = t("admin_note_label");
        $("admin-note").placeholder = t("admin_note_placeholder"); $("admin-duration-permanent").textContent = t("admin_duration_permanent");
        $("admin-duration-30").textContent = t("admin_duration_30"); $("admin-duration-90").textContent = t("admin_duration_90");
        $("admin-duration-365").textContent = t("admin_duration_365"); $("admin-grant").textContent = t("admin_grant");
        $("admin-revoke").textContent = t("admin_revoke");
        $("admin-users-title").textContent = t("admin_users_title"); $("admin-users-help").textContent = t("admin_users_help");
        $("admin-users-search-label").textContent = t("admin_users_search_label"); $("admin-users-query").placeholder = t("admin_users_search_placeholder"); $("admin-users-search-submit").textContent = t("admin_users_search");
        $("admin-users-prev").textContent = t("admin_users_previous"); $("admin-users-next").textContent = t("admin_users_next");
        $("admin-files-title").textContent = t("admin_files_title"); $("admin-files-prev").textContent = t("admin_users_previous"); $("admin-files-next").textContent = t("admin_users_next"); $("admin-user-delete").textContent = t("admin_users_delete_account"); $("admin-user-close").textContent = t("admin_user_close");
        var googleButton = $("google-login"); if (googleButton) googleButton.setAttribute("aria-label", t("google_continue"));
        renderEmailMode(); if (currentAccount) renderAccount(currentAccount); renderKeys(currentKeys); renderNewKey(); renderAdminUsers(); renderAdminFiles();
        messageEl.textContent = localizedError(currentMessage);
        adminMessageEl.textContent = localizedError(currentAdminMessage);
        $("admin-users-message").textContent = localizedError(currentAdminUsersMessage);
        if (currentAdminTarget) renderAdminTarget(currentAdminTarget);
      }
      function switchLang() {
        state.lang = state.lang === "en" ? "zh" : "en";
        localStorage.setItem("ps_lang", state.lang); applyTranslations();
        if (currentAccount) renderAccount(currentAccount);
      }
      function formatBytes(bytes) {
        var value = Number(bytes || 0), units = ["B", "KiB", "MiB", "GiB", "TiB"], i = 0;
        while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
        return value.toFixed(i ? 1 : 0) + " " + units[i];
      }
      async function loadKeys() {
        var result = await request("/api/api-keys"); currentKeys = result.apiKeys || []; renderKeys(currentKeys);
      }
      var opcPayPollTimer = null;
      function stopOpcPayPolling() {
        if (opcPayPollTimer) clearInterval(opcPayPollTimer);
        opcPayPollTimer = null;
      }
      function showOpcPayQr(qrCode, purchaseUrl, reference) {
        var panel = $("opcpay-qr-panel"), image = $("opcpay-qr-image");
        stopOpcPayPolling();
        image.src = qrCode;
        image.onerror = function() { image.removeAttribute("src"); };
        $("opcpay-open-alipay").onclick = function() {
          location.href = purchaseUrl;
        };
        panel.classList.remove("hidden");
        var checks = 0;
        opcPayPollTimer = setInterval(async function() {
          checks += 1;
          try {
            var status = await request("/api/billing/checkout-status?reference=" + encodeURIComponent(reference));
            if (status.status === "paid") {
              stopOpcPayPolling(); panel.classList.add("hidden");
              await loadAccount(); message(t("subscription_active_message"));
            } else if (checks >= 100) {
              stopOpcPayPolling();
              $("opcpay-qr-help").textContent = t("payment_still_processing");
            }
          } catch (_) {
            if (checks >= 100) { stopOpcPayPolling(); $("opcpay-qr-help").textContent = t("payment_still_processing"); }
          }
        }, 3000);
      }
      async function loadOpcPayPlans() {
        var row = $("opcpay-checkout-row");
        try {
          var result = await request("/api/billing/opcpay/product");
          if (result.capabilityStatus !== "ENABLED") throw new Error(t("opcpay_unavailable"));
          row.replaceChildren();
          (result.options || []).forEach(function(option) {
            var durationKey = option.durationPeriod === "YEAR" ? "opcpay_year" : option.durationPeriod === "MONTH" ? "opcpay_month" : null;
            if (!durationKey || !option.skuId) return;
            var button = document.createElement("button"); button.type = "button";
            var price = Number(option.price).toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
            button.textContent = t(durationKey).replace("{price}", price);
            button.addEventListener("click", async function() {
              button.disabled = true; message("");
              try {
                var purchase = await request("/api/billing/opcpay/checkout", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ skuId: option.skuId, language: state.lang })
                });
                if (!purchase.checkoutUrl) throw new Error(t("payment_still_processing"));
                if (purchase.checkoutUrl.indexOf("alipays:") === 0) {
                  if (purchase.qrCode) showOpcPayQr(purchase.qrCode, purchase.checkoutUrl, purchase.reference);
                  else message(t("opcpay_use_alipay_app"));
                } else {
                  location.href = purchase.checkoutUrl;
                }
              } catch (error) { message(error.message || t("request_failed")); button.disabled = false; }
            });
            row.appendChild(button);
          });
          row.dataset.loaded = "1";
          if (!row.childElementCount) throw new Error(t("opcpay_unavailable"));
          $("billing-config-note").classList.add("hidden");
        } catch (_) {
          row.replaceChildren(); row.dataset.loaded = "1";
          $("billing-config-note").textContent = t("opcpay_unavailable");
          $("billing-config-note").classList.remove("hidden");
        }
      }
      async function loadAccount() {
        try {
          var account = await request("/api/account"); currentAccount = account; signedOutEl.classList.add("hidden"); signedInEl.classList.remove("hidden");
          renderAccount(account); await loadKeys();
        } catch (_) {
          currentAccount = null; currentKeys = []; signedInEl.classList.add("hidden"); signedOutEl.classList.remove("hidden");
        }
      }
      async function handleCheckoutReturn() {
        var params = new URLSearchParams(location.search);
        var checkoutState = params.get("checkout");
        if (checkoutState === "cancelled") { message(t("payment_cancelled")); return; }
        if (checkoutState !== "success" && checkoutState !== "opcpay") return;
        var reference = params.get("reference");
        if (!reference) { message(t("payment_still_processing")); return; }
        message(t("payment_activating"));
        try {
          for (var attempt = 0; attempt < 15; attempt += 1) {
            var result = await request("/api/billing/checkout-status?reference=" + encodeURIComponent(reference));
            if (result.status === "paid") {
              await loadAccount();
              if (currentAccount && currentAccount.plan === "pro") {
                message(t("subscription_active_message"));
                history.replaceState(null, "", "/account");
                return;
              }
            }
            if (result.status === "failed") {
              message(t("payment_failed_status"));
              history.replaceState(null, "", "/account");
              return;
            }
            await new Promise(function(resolve) { setTimeout(resolve, 2000); });
          }
          message(t("payment_still_processing"));
        } catch (error) { message(error.message || t("payment_still_processing")); }
      }
      async function submitEmailAuth(event) {
        event.preventDefault(); message(""); var registering = emailMode === "sign-up";
        var payload = { email: $("email-address").value.trim(), password: $("email-password").value, callbackURL: "/app" };
        if (registering) payload.name = $("email-name").value.trim();
        try {
          await request(registering ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          location.href = "/app";
        } catch (error) { message(error.message || t("email_auth_failed")); }
      }
      async function signIn() {
        if (!googleEnabled) return; message("");
        var result = await request("/api/auth/sign-in/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "google", callbackURL: "/app" }) });
        if (!result.url) throw new Error(t("google_no_url")); location.href = result.url;
      }
      async function refreshAdminTarget() {
        var email = currentAdminTarget && currentAdminTarget.user ? currentAdminTarget.user.email : $("admin-target-email").value.trim();
        var data = await request("/api/admin/pro-grant?email=" + encodeURIComponent(email));
        renderAdminTarget(data);
        return data;
      }
      $("opcpay-qr-close").addEventListener("click", function() { $("opcpay-qr-panel").classList.add("hidden"); stopOpcPayPolling(); });
      $("opcpay-qr-panel").addEventListener("click", function(event) { if (event.target === this) { this.classList.add("hidden"); stopOpcPayPolling(); } });
      $("lang-toggle").addEventListener("click", switchLang);
      $("email-auth-form").addEventListener("submit", submitEmailAuth);
      $("email-mode-toggle").addEventListener("click", function() { emailMode = emailMode === "sign-in" ? "sign-up" : "sign-in"; message(""); renderEmailMode(); });
      var googleButton = $("google-login");
      if (googleButton) googleButton.addEventListener("click", function() { signIn().catch(function(error) { message(error.message || t("request_failed")); }); });
      $("admin-search-form").addEventListener("submit", async function(event) {
        event.preventDefault(); adminMessage(""); renderAdminTarget(null);
        try { await refreshAdminTarget(); }
        catch (error) { adminMessage(error.message || t("request_failed")); }
      });
      $("admin-grant").addEventListener("click", async function() {
        if (!currentAdminTarget || !currentAdminTarget.user) return;
        var email = currentAdminTarget.user.email;
        if (!confirm(t("admin_confirm_grant").replace("{email}", email))) return;
        var button = $("admin-grant"); button.disabled = true; adminMessage("");
        try {
          var duration = $("admin-duration").value;
          await request("/api/admin/pro-grant", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email, durationDays: duration === "permanent" ? null : Number(duration), note: $("admin-note").value })
          });
          adminMessage(t("admin_grant_success").replace("{email}", email));
          await refreshAdminTarget();
          if (currentAccount && currentAccount.user.email.toLowerCase() === email.toLowerCase()) await loadAccount();
          if (adminUsersLoaded) loadAdminUsers(false).catch(function(error) { adminUsersMessage(error.message || t("request_failed")); });
        } catch (error) { adminMessage(error.message || t("request_failed")); }
        finally { button.disabled = false; }
      });
      $("admin-revoke").addEventListener("click", async function() {
        if (!currentAdminTarget || !currentAdminTarget.user) return;
        var email = currentAdminTarget.user.email;
        if (!confirm(t("admin_confirm_revoke").replace("{email}", email))) return;
        var button = $("admin-revoke"); button.disabled = true; adminMessage("");
        try {
          await request("/api/admin/pro-grant", {
            method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email })
          });
          adminMessage(t("admin_revoke_success").replace("{email}", email));
          await refreshAdminTarget();
          if (currentAccount && currentAccount.user.email.toLowerCase() === email.toLowerCase()) await loadAccount();
          if (adminUsersLoaded) loadAdminUsers(false).catch(function(error) { adminUsersMessage(error.message || t("request_failed")); });
        } catch (error) { adminMessage(error.message || t("request_failed")); }
        finally { button.disabled = false; }
      });
      $("admin-users-search").addEventListener("submit", function(event) {
        event.preventDefault();
        loadAdminUsers(true).catch(function(error) { adminUsersMessage(error.message || t("request_failed")); });
      });
      $("admin-users-prev").addEventListener("click", function() {
        if (adminUsersState.offset <= 0) return;
        adminUsersState.offset = Math.max(0, adminUsersState.offset - adminUsersState.limit);
        loadAdminUsers(false).catch(function(error) { adminUsersMessage(error.message || t("request_failed")); });
      });
      $("admin-users-next").addEventListener("click", function() {
        if (adminUsersState.offset + adminUsersState.limit >= adminUsersState.total) return;
        adminUsersState.offset += adminUsersState.limit;
        loadAdminUsers(false).catch(function(error) { adminUsersMessage(error.message || t("request_failed")); });
      });
      $("admin-files-prev").addEventListener("click", function() {
        if (!adminUsersState.selectedUser || adminUsersState.fileOffset <= 0) return;
        adminUsersState.fileOffset = Math.max(0, adminUsersState.fileOffset - adminUsersState.fileLimit);
        loadAdminFiles(adminUsersState.selectedUser, false).catch(function(error) { adminFilesMessage(error.message || t("request_failed")); });
      });
      $("admin-files-next").addEventListener("click", function() {
        if (!adminUsersState.selectedUser || adminUsersState.fileOffset + adminUsersState.fileLimit >= adminUsersState.fileTotal) return;
        adminUsersState.fileOffset += adminUsersState.fileLimit;
        loadAdminFiles(adminUsersState.selectedUser, false).catch(function(error) { adminFilesMessage(error.message || t("request_failed")); });
      });
      $("admin-user-delete").addEventListener("click", function() {
        if (adminUsersState.selectedUser) deleteAdminUser(adminUsersState.selectedUser);
      });
      $("admin-user-close").addEventListener("click", function() {
        adminUsersState.selectedUser = null; adminUsersState.files = []; adminUsersState.fileTotal = 0; renderAdminFiles();
      });
      $("logout").addEventListener("click", async function() {
        try { await request("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); } catch (_) {}
        location.href = "/account";
      });
      $("create-key").addEventListener("submit", async function(event) {
        event.preventDefault(); message("");
        try {
          var selectedExpiration = $("key-expiration").value;
          var result = await request("/api/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: $("key-name").value, expiresIn: selectedExpiration === "" ? null : Number(selectedExpiration) }) });
          newApiKey = result.key; newApiKeyExpiresAt = result.expiresAt || null; newApiKeyCopyStatus = ""; renderNewKey(); $("key-name").value = ""; await loadKeys();
        } catch (error) { message(error.message || t("request_failed")); }
      });
      $("copy-new-key").addEventListener("click", copyNewApiKey);
      ["monthly", "yearly"].forEach(function(period) {
        $("buy-" + period).addEventListener("click", async function() {
          try {
            var result = await request("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period: period }) });
            location.href = result.checkoutUrl;
          } catch (error) { message(error.message || t("request_failed")); }
        });
      });
      $("manage-billing").addEventListener("click", async function() {
        try { var result = await request("/api/billing/portal", { method: "POST" }); location.href = result.portalUrl; }
        catch (error) { message(error.message || t("request_failed")); }
      });
      applyTranslations(); loadAccount().then(handleCheckoutReturn);
    })();
  </script>
</body>
</html>`;
}
