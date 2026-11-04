export function privacyPolicyPage(initialLanguage: string | null = null): string {
  const language = initialLanguage === "en" ? "en" : "zh";
  return `<!doctype html>
<html lang="${language === "en" ? "en" : "zh-CN"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="PicoShare browser extension privacy policy: what data the extension handles, why it is used, and how it is shared and retained." />
  <title>Privacy Policy · PicoShare</title>
  <style>
    :root{color-scheme:light;--paper:#f6f5f4;--white:#fff;--ink:#111;--muted:#615d59;--blue:#0075de;--line:rgba(0,0,0,.08);--sky:#e6f3fe}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}.wrap{width:min(100% - 40px,960px);margin:0 auto}
    header{position:sticky;top:0;z-index:2;border-bottom:1px solid var(--line);background:rgba(246,245,244,.96);backdrop-filter:blur(12px)}
    .nav{height:64px;display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{display:flex;align-items:center;gap:10px;color:var(--ink);font-size:20px;font-weight:700;letter-spacing:-.04em}.brand img{width:32px;height:32px;object-fit:contain}
    .nav-actions{display:flex;align-items:center;gap:10px}.nav-link,.lang-button{border:1px solid var(--line);border-radius:8px;background:var(--white);padding:7px 12px;font:inherit;font-size:14px;font-weight:500}.lang-button{color:var(--blue);cursor:pointer}
    main{padding:56px 0 80px}.eyebrow{margin:0 0 12px;color:var(--blue);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
    h1{margin:0;font-size:clamp(38px,7vw,60px);line-height:1.04;letter-spacing:-.045em} .updated{margin:16px 0 28px;color:var(--muted);font-size:14px}
    .intro{margin:0 0 24px;padding:18px 20px;border-left:4px solid var(--blue);border-radius:8px;background:var(--sky);color:#263b50}
    .policy-section{margin:14px 0;padding:24px 26px;border:1px solid var(--line);border-radius:12px;background:var(--white)}
    h2{margin:0 0 12px;font-size:21px;line-height:1.25;letter-spacing:-.02em}p{margin:8px 0;color:var(--muted)}ul{margin:8px 0 0;padding-left:22px;color:var(--muted)}li{margin:7px 0}strong{color:var(--ink)}
    .policy-copy{display:none}.policy-copy.active{display:block}.footer{padding:24px 0 36px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}.footer-row{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
    @media(max-width:600px){.wrap{width:min(100% - 28px,960px)}main{padding:36px 0 52px}.policy-section{padding:19px}.nav{height:58px}.brand{font-size:18px}}
    @media(max-width:480px){
      body{font-size:16px;line-height:1.65}.nav{height:auto;min-height:58px;flex-wrap:wrap;padding:8px 0}.nav-actions{gap:6px}.nav-link,.lang-button{min-height:40px;padding:7px 10px;font-size:14px}main{padding:28px 0 44px}h1{font-size:clamp(30px,8vw,38px);line-height:1.12}.eyebrow{font-size:13px}.updated{font-size:14px}.intro{padding:15px 16px}.policy-section{padding:16px}h2{font-size:20px;line-height:1.3}p,ul{font-size:15px}.footer{font-size:14px}
    }
  </style>
</head>
<body data-language="${language}">
  <header><div class="wrap nav">
    <a class="brand" href="/" aria-label="PicoShare home"><img src="/favicon.svg" alt="" />PicoShare</a>
    <nav class="nav-actions" aria-label="Page navigation"><a id="home-link" class="nav-link" href="/">${language === "en" ? "Home" : "返回首页"}</a><button id="language-toggle" class="lang-button" type="button" aria-label="Switch language">${language === "en" ? "中文" : "EN"}</button></nav>
  </div></header>
  <main class="wrap">
    <section class="policy-copy ${language === "zh" ? "active" : ""}" data-language="zh" lang="zh-CN">
      <p class="eyebrow">PicoShare · 浏览器扩展</p>
      <h1>隐私政策</h1>
      <p class="updated">最后更新：2026 年 10 月 31 日</p>
      <p class="intro">本政策说明 PicoShare 浏览器扩展在你主动使用上传、网页保存和截图功能时，如何处理数据。扩展不会在后台收集浏览记录，也不包含广告或分析跟踪。</p>
      <section class="policy-section"><h2>适用范围</h2><p>本政策适用于 PicoShare 浏览器扩展。扩展会把你主动选择上传的数据发送到你在扩展设置中填写的 PicoShare 服务地址。若你连接的是 <strong>pico.justnow.uk</strong> 官方托管服务，该服务由 PicoShare 运营并使用 Cloudflare 提供的基础设施；若你填写自托管或其他兼容服务，该服务运营者负责其接收数据的处理方式、保存期限和删除流程。</p></section>
      <section class="policy-section"><h2>扩展处理哪些数据</h2><ul>
        <li><strong>你选择的文件：</strong>文件内容、名称、类型、大小，以及你填写的可选备注。</li>
        <li><strong>你主动选择的网页内容：</strong>使用“上传当前网页 HTML”时读取当前页面标题、地址和 DOM HTML；上传长截图时读取当前页面可见内容并生成图片；保存网页链接时使用页面标题和网址。写入备注或链接文本的网址会去除查询参数和片段，但网页 HTML 本身仍可能含有页面中的个人信息或其他敏感内容。</li>
        <li><strong>你右键选择的图片：</strong>扩展会从图片原始网址读取图片内容，再上传到所配置的 PicoShare 服务。图片来源网站可能收到相应网络请求；请求可能携带浏览器允许发送给该网站的凭据。扩展不会读取或保存 Cookie 内容。</li>
        <li><strong>扩展设置：</strong>API Key、服务地址、语言偏好、悬浮按钮开关和位置，以及通知中待打开的分享链接。它们保存在当前浏览器的扩展本地存储中；API Key 不会发给 PicoShare 开发者的其他服务器。Chrome 扩展本地存储不由扩展单独加密，请保护好你的浏览器用户目录和设备。</li>
        <li><strong>服务请求信息：</strong>你配置的服务会处理完成请求所需的网络信息。官方托管服务会在访问分享文件时记录 IP 地址和 User-Agent，用于下载次数统计和服务运行。</li>
      </ul></section>
      <section class="policy-section"><h2>数据如何使用和共享</h2><p>扩展只在你主动点击上传、网页 HTML、长截图、图片保存或网页链接等操作后，读取相应数据并将其发送到你配置的服务，用于保存内容、生成分享链接和显示上传结果。API Key 随 API 请求通过 <code>X-API-Key</code> 请求头发送到该服务。</p><p>官方托管服务使用 Cloudflare Workers、D1、R2 和 KV 提供应用运行、数据库和对象存储。官方服务的授权管理员在技术上可通过管理功能查看文件信息和内容；管理员访问应限于处理你主动发起的支持请求、安全或滥用调查，或履行法律义务。扩展不向分析或广告系统发送数据，不出售用户数据，也不将网页内容用于广告画像。图片保存功能会向你右键选择的图片来源发起请求；该来源网站可能处理该请求。</p><p><strong>Chrome Web Store Limited Use：</strong>扩展仅将数据用于提供你主动请求的上传与分享功能；不用于广告、画像或无关用途，不出售数据。数据仅会提供给你配置的 PicoShare 服务、官方服务所需的基础设施服务商，以及保存图片时你选择的图片来源网站；分享链接访问由你发起。人工访问按上文所述情形限制。详见 <a href="https://developer.chrome.com/docs/webstore/program-policies/user-data-faq">Chrome Web Store 用户数据政策</a>。</p><p>分享链接可能允许任何持有链接的人查看对应内容。分享前请确认内容适合通过链接访问，并只把链接发给预期接收者。</p></section>
      <section class="policy-section"><h2>保存期限与删除</h2><p>扩展本身不会为上传内容另设保存期限。文件由接收的 PicoShare 服务按照该服务的过期设置、账户规则和删除操作管理；扩展无法替自托管服务运营者承诺具体保留时间。官方托管服务中的文件在到期或被删除后会按服务清理流程移除；底层服务提供商的备份或运行日志可能依其规则保留一段时间。</p><p>你可以在 PicoShare 文件管理页面删除文件，在账户页面撤销 API Key；扩展本地设置可通过扩展设置或清除/卸载扩展删除。账户信息或隐私请求，请使用 Chrome Web Store PicoShare 发布者资料中公开的联系邮箱。自托管服务的数据请求请联系该服务运营者。</p></section>
      <section class="policy-section"><h2>你的选择与安全</h2><ul>
        <li>上传由你主动触发；上传前请检查文件、网页 HTML、截图或图片中是否含有密码、个人信息或不应分享的内容。</li>
        <li>你可以不启用悬浮按钮、拒绝可选网站权限，或停止使用扩展。拒绝权限会让相应网页功能无法工作。</li>
        <li>建议使用 HTTPS 服务地址。若你配置 HTTP 地址，网络传输可能无法获得 HTTPS 提供的加密保护。</li>
        <li>扩展的代码和资源随扩展包分发；扩展不使用远程 JavaScript/Wasm、广告跟踪或第三方分析脚本。</li>
      </ul></section>
      <section class="policy-section"><h2>政策更新与联系</h2><p>当扩展的数据处理方式发生重要变化时，我们会更新本页面，并在扩展界面中说明相关变化。隐私问题或数据请求，请使用 Chrome Web Store 中显示的 PicoShare 发布者联系邮箱；若使用自托管实例，请联系相应实例的运营者。</p></section>
    </section>

    <section class="policy-copy ${language === "en" ? "active" : ""}" data-language="en" lang="en">
      <p class="eyebrow">PicoShare · Browser Extension</p>
      <h1>Privacy Policy</h1>
      <p class="updated">Last updated: October 31, 2026</p>
      <p class="intro">This policy explains how the PicoShare browser extension handles data when you choose its upload, webpage-saving, or screenshot features. The extension does not collect browsing activity in the background and does not include advertising or analytics tracking.</p>
      <section class="policy-section"><h2>Scope</h2><p>This policy applies to the PicoShare browser extension. The extension sends data you choose to upload to the PicoShare service address configured in its settings. If you use the official hosted service at <strong>pico.justnow.uk</strong>, PicoShare operates that service using infrastructure provided by Cloudflare. If you configure a self-hosted or other compatible service, that service operator controls how received data is processed, retained, and deleted.</p></section>
      <section class="policy-section"><h2>Data the extension handles</h2><ul>
        <li><strong>Files you select:</strong> file contents, name, type, size, and any optional note you enter.</li>
        <li><strong>Webpage content you explicitly select:</strong> “Upload current page HTML” reads the current page title, URL, and DOM HTML; long screenshot captures visible page content and creates an image; saving a page link uses its title and URL. Query parameters and fragments are removed from URLs placed in notes or link text, but the HTML itself may still contain personal or other sensitive information from the page.</li>
        <li><strong>Images you select with the context menu:</strong> the extension reads the image from its source URL and uploads its contents to your configured PicoShare service. The image source site may receive the network request, which may include credentials the browser permits for that site. The extension does not read or store cookie contents.</li>
        <li><strong>Extension settings:</strong> your API Key, service URL, language preference, floating-button setting and position, and share links awaiting notification actions. These are stored in this browser’s extension storage. The API Key is not sent to other servers operated by the PicoShare developer. Chrome extension storage is not separately encrypted by the extension, so protect your browser profile and device.</li>
        <li><strong>Service request information:</strong> your configured service processes network information needed to handle requests. The official hosted service records IP address and User-Agent when a shared file is accessed, to provide download counts and operate the service.</li>
      </ul></section>
      <section class="policy-section"><h2>How data is used and shared</h2><p>Only after you choose an upload, page HTML, long screenshot, image-saving, or page-link action does the extension read the corresponding data and send it to your configured service to store the content, create a share link, and show the result. The API Key is sent to that service in the <code>X-API-Key</code> request header.</p><p>The official hosted service uses Cloudflare Workers, D1, R2, and KV for application hosting, database, and object storage. Authorized administrators of the official service can technically view file information and content through management features; administrator access is limited to support requests you initiate, security or abuse investigations, or legal obligations. The extension does not send data to analytics or advertising systems, sell user data, or use webpage content for advertising profiles. The image-saving feature makes a request to the source of the image you selected; that site may process the request.</p><p><strong>Chrome Web Store Limited Use:</strong> The extension uses data only to provide the upload and sharing features you request. It is not used for advertising, profiling, or unrelated purposes, and is not sold. Data is shared only with your configured PicoShare service, infrastructure providers needed to host the official service, and the selected image source when you save an image. Share-link access is initiated by you. Human access is limited as described above. See the <a href="https://developer.chrome.com/docs/webstore/program-policies/user-data-faq">Chrome Web Store User Data Policy</a>.</p><p>A share link may allow anyone who has the link to view the associated content. Check the content before sharing and send the link only to its intended recipients.</p></section>
      <section class="policy-section"><h2>Retention and deletion</h2><p>The extension does not set a separate retention period for uploaded content. The receiving PicoShare service manages files under its expiration settings, account rules, and deletion actions; the extension cannot promise a specific retention period for self-hosted services. Files on the official hosted service are removed through the service cleanup process after expiration or deletion. Infrastructure-provider backups or operational logs may be retained for a period under the provider’s rules.</p><p>You can delete files from the PicoShare file-management page and revoke an API Key from the account page. Extension settings can be removed in the extension settings or by clearing/uninstalling the extension. For account information or privacy requests, use the public contact email in the PicoShare publisher profile on the Chrome Web Store. For a self-hosted service, contact that service operator.</p></section>
      <section class="policy-section"><h2>Your choices and security</h2><ul>
        <li>Uploads are initiated by you. Before uploading, check whether a file, webpage HTML, screenshot, or image contains passwords, personal information, or content you should not share.</li>
        <li>You can leave the floating button disabled, decline optional site permissions, or stop using the extension. Declining a permission makes the related webpage feature unavailable.</li>
        <li>Use an HTTPS service URL where possible. If you configure an HTTP URL, network traffic may not receive the encryption protection provided by HTTPS.</li>
        <li>The extension’s code and resources are included in the extension package. It does not use remotely hosted JavaScript/Wasm, advertising trackers, or third-party analytics scripts.</li>
      </ul></section>
      <section class="policy-section"><h2>Changes and contact</h2><p>We will update this page and explain relevant changes in the extension interface if the extension’s data practices materially change. For privacy questions or data requests, use the PicoShare publisher contact email shown in the Chrome Web Store. For a self-hosted instance, contact its operator.</p></section>
    </section>
  </main>
  <footer class="footer"><div class="wrap footer-row"><span>© PicoShare</span><a href="/">PicoShare home</a></div></footer>
  <script>
    (function(){
      var body=document.body;
      var explicit=new URLSearchParams(location.search).get("lang");
      var language=explicit==="en"||explicit==="zh"?explicit:body.dataset.language;
      if(explicit!=="en"&&explicit!=="zh"){
        try{var stored=localStorage.getItem("ps_lang");if(stored==="en"||stored==="zh")language=stored;else if((navigator.language||"").toLowerCase().startsWith("en"))language="en";}catch(_){}
      }
      var toggle=document.getElementById("language-toggle");
      function apply(next){language=next;body.dataset.language=next;document.documentElement.lang=next==="en"?"en":"zh-CN";document.querySelectorAll(".policy-copy").forEach(function(section){section.classList.toggle("active",section.dataset.language===next);});toggle.textContent=next==="en"?"中文":"EN";toggle.setAttribute("aria-label",next==="en"?"Switch to Chinese":"切换到英文");document.getElementById("home-link").textContent=next==="en"?"Home":"返回首页";document.title=next==="en"?"Privacy Policy · PicoShare":"隐私政策 · PicoShare";try{localStorage.setItem("ps_lang",next);}catch(_){}}
      toggle.addEventListener("click",function(){var next=language==="en"?"zh":"en";var url=new URL(location.href);url.searchParams.set("lang",next);history.replaceState(null,"",url);apply(next);});
      apply(language);
    })();
  </script>
</body>
</html>`;
}
