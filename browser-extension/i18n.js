(function (root) {
  "use strict";

  var STORAGE_KEY = "language";
  var DATA_USE_CONSENT_VERSION = "2026-10-31";
  var AUTO = "auto";
  var preference = AUTO;
  var language = detectLanguage();

  // The Chinese values are also accepted by translate(), so existing callers can
  // migrate incrementally without introducing message IDs everywhere at once.
  var MESSAGES = {
    zh: {
      extension_title: "PicoShare 上传助手",
      extension_description: "上传文件、网页和图片到你的 PicoShare 账户。",
      brand_subtitle: "文件分享助手",
      language: "语言",
      language_auto: "跟随浏览器",
      language_zh: "简体中文",
      language_en: "English",
      data_use_title: "上传数据说明",
      data_use_detail: "当你主动点击上传、网页 HTML、长截图、图片保存或网页链接操作时，扩展会读取你选择的文件、当前页面内容或图片，并发送到你设置的 PicoShare 服务以生成分享链接。保存网页图片时，来源网站会收到读取请求，浏览器可能按该站点规则附带凭据；官方托管服务会处理访问者 IP 和浏览器信息以统计下载次数。API Key 和设置保存在本浏览器扩展存储中；持有分享链接的人可能可以打开对应内容。",
      data_use_consent: "我已阅读并同意上述数据处理方式。",
      privacy_policy_link: "查看隐私政策",
      data_use_required: "请先阅读并确认上方的数据使用说明，才能使用上传功能。",
      data_use_revoked: "已撤回数据使用同意；上传和常驻按钮已暂停。",
      data_use_save_failed: "无法保存数据使用确认，请重试。",
      account_connection: "连接账户",
      site_url_label: "PicoShare 网站地址",
      site_url_placeholder: "https://share.example.com",
      api_key_label: "API Key",
      api_key_placeholder: "粘贴账户页创建的 API Key",
      save_authorize: "保存并授权网站",
      settings_saved: "设置已保存。右键菜单已就绪。",
      secret_storage_hint: "密钥保存在本浏览器扩展存储中。首次保存会请求访问你填写的 PicoShare 网站。",
      floating_title: "常驻网页按钮",
      floating_hint: "在网页右下角显示 PicoShare 小图标，不用每次打开插件菜单。",
      floating_aria: "启用常驻网页按钮",
      floating_detail: "按住常驻图标可拖动并记忆位置。左键打开菜单：可将整页截图上传为 PNG、选择本地文件上传，或上传当前网页 HTML；右键将清理后的当前网页地址保存为 .txt 分享（会移除查询参数和片段）。首次启用会请求所有网站权限，供常驻图标和长截图使用。",
      local_upload_title: "上传本地文件",
      upload_share: "上传并生成分享链接",
      context_menu_title: "网页右键菜单",
      context_upload_html: "上传当前网页 HTML 到 PicoShare",
      context_save_image: "保存图片到 PicoShare 并生成分享链接",
      context_menu_detail: "网页空白处右键可上传当前网页 HTML；图片上右键可保存图片到 PicoShare。完成后会打开分享链接。",
      html_plain_text_hint: "页面 HTML 会以纯文本类型分享，打开链接时显示源码，不会执行网页脚本。",
      success_upload: "上传成功",
      share_created: "分享链接已生成。",
      share_created_detail: "分享链接已生成，可复制或点击链接打开。",
      upload_complete: "上传完成",
      copy_share: "复制分享链接",
      api_docs: "API 调用手册",
      connected: "已连接 {baseUrl}",
      reauthorize: "请保存设置以重新授权 PicoShare 网站。",
      fill_settings: "请填写网站地址和 API Key。",
      fill_api_key: "请填写 API Key。",
      permission_not_granted: "未授予网站访问权限，设置未保存。",
      site_permission_required: "请先保存设置并授权 PicoShare 网站。",
      floating_enabled: "常驻网页按钮已启用。",
      floating_disabled: "常驻网页按钮已关闭。",
      floating_enable_requires_settings: "请先保存 PicoShare 网站地址和 API Key。",
      floating_settings_failed: "常驻网页按钮设置失败。",
      floating_permission_not_granted: "未授予网页访问权限，常驻按钮未启用。",
      choose_file_first: "请先选择一个本地文件。",
      no_file: "没有可上传的文件。",
      uploading: "正在上传文件…",
      uploading_large: "正在上传大文件：{percent}%",
      uploading_wait: "正在上传，请稍候。",
      upload_processing: "上传仍在处理中；完成后会打开分享链接。",
      upload_done: "文件已上传，分享链接已打开。",
      html_upload_done: "网页 HTML 已上传，分享链接已打开。",
      screenshot_upload_done: "网页长截图已上传，分享链接已打开。",
      page_html_uploading: "正在获取并上传当前网页 HTML…",
      page_link_saving: "正在保存当前网页链接…",
      screenshot_preparing: "正在准备网页长截图…",
      screenshot_uploading: "正在上传网页长截图…",
      screenshot_progress: "长截图：{current} / {total} 屏",
      page_html_note: "网页源码：{url}",
      page_image_note: "网页图片：{url}",
      page_link_note: "网页链接：{url}",
      browser_upload_note: "浏览器插件上传",
      screenshot_file_too_long: "网页超过 40 屏，长截图暂不支持这么长的页面。",
      screenshot_page_too_long: "网页太长，暂时无法生成长截图。",
      screenshot_canvas_failed: "无法创建长截图画布。",
      screenshot_generate_failed: "长截图生成失败，请缩短网页后重试。",
      screenshot_capture_failed: "无法截取当前页面。",
      screenshot_capture_prefix: "无法截取当前页面：",
      screenshot_read_failed: "读取截图画面失败。",
      capture_permission_required: "长截图权限未启用。请重新启用弹窗中的“常驻网页按钮”并允许所有网站访问。",
      capture_tab_changed: "截图期间页面标签发生变化，请重试。",
      chrome_capture_failed: "Chrome 截图失败：{message}",
      chrome_capture_empty: "Chrome 没有返回截图数据，请确认当前标签页仍处于前台。",
      result_open_failed: "无法打开分享结果。",
      invalid_share_url: "返回的分享链接无效。",
      operation_failed: "扩展操作失败。",
      connect_failed: "无法连接 PicoShare 扩展服务。",
      cannot_start_upload: "无法开始上传。",
      invalid_position: "悬浮按钮位置无效。",
      invalid_tab: "无法识别当前网页标签。",
      picoshare_settings_api_key: "请先在 PicoShare 扩展设置中填写网站地址和 API Key。",
      site_access_setup: "插件尚未获得 PicoShare 网站权限。请打开插件设置并保存网站地址。",
      extension_page_permission: "请先授予扩展访问网页的权限。",
      current_page_unreadable: "无法读取当前网页内容。",
      current_page_url_invalid: "当前网页地址无法识别。",
      unsupported_upload: "不支持的上传方式。",
      upload_failed: "上传失败。",
      upload_complete_period: "上传完成。",
      copied: "已复制",
      clipboard_manual: "请手动复制上方链接",
      share_copied: "分享链接已复制。",
      clipboard_denied: "无法访问剪贴板，请手动复制链接。",
      page_link_done: "网页链接已保存，分享链接已打开。",
      page_link_failed: "网页链接保存失败",
      page_html_failed: "网页 HTML 上传失败",
      image_save_failed: "图片保存失败",
      image_url_invalid: "图片地址无法识别。",
      image_data_unsupported: "暂不支持 data: 或 blob: 图片，请使用图片的 http(s) 地址。",
      image_permission_required: "未授予图片网站访问权限，无法读取这张图片。",
      image_read_failed: "读取图片失败（HTTP {status}）。",
      unknown_error: "未知错误",
      no_connection: "无法连接 PicoShare。请检查网站地址和网络连接。 {message}",
      invalid_site_url: "请输入有效的 PicoShare 网站地址。",
      site_url_protocol: "网站地址必须以 http:// 或 https:// 开头。",
      site_url_credentials: "网站地址不能包含账号、密码、查询参数或片段。",
      settings_read_failed: "无法读取 PicoShare 插件设置。",
      api_key_required: "请先在插件设置中填写 API Key。",
      api_key_invalid: "API Key 无效或已撤销，请检查插件设置。",
      quota_exhausted: "本月 API 请求额度已用完。",
      invalid_multipart: "PicoShare 返回了无效的分片上传信息。",
      upload_response_invalid: "上传完成，但响应中没有文件 ID。",
      menu_title: "PicoShare 快捷操作",
      menu_screenshot: "网页长截图上传（PNG）",
      menu_file: "选取本地文件上传",
      menu_html: "获取当前网页 HTML 上传",
      file_select: "选择要上传的本地文件",
      launcher_title: "按住左键拖动可移动；单击打开上传菜单，右键保存当前网页链接",
      notification_title: "PicoShare 上传成功",
      notification_message: "{name} 已生成分享链接。点击通知打开。",
      result_error_title: "操作未完成",
      result_invalid_title: "无法生成分享链接",
      result_invalid_detail: "返回的文件链接无效。",
      result_saved: "{name} 已保存到 PicoShare。",
      result_title: "PicoShare 分享链接",
      result_file_fallback: "文件",
      result_copy: "复制分享链接",
    },
    en: {
      extension_title: "PicoShare Uploader",
      extension_description: "Upload files, web pages, and images to your PicoShare account.",
      brand_subtitle: "File sharing assistant",
      language: "Language",
      language_auto: "Browser default",
      language_zh: "Simplified Chinese",
      language_en: "English",
      data_use_title: "Upload data notice",
      data_use_detail: "When you choose an upload, page HTML, long screenshot, image-saving, or page-link action, the extension reads the file, current page content, or image you selected and sends it to your configured PicoShare service to create a share link. Saving a webpage image sends a read request to its source site and may include credentials the browser permits for that site. The official hosted service processes visitors’ IP and browser information to count file downloads. Your API Key and settings are stored in this browser extension; anyone with a share link may be able to open its content.",
      data_use_consent: "I have read and consent to the data handling described above.",
      privacy_policy_link: "Read the privacy policy",
      data_use_required: "Read and accept the data-use notice above before using upload features.",
      data_use_revoked: "Data-use consent withdrawn; uploads and the floating button are paused.",
      data_use_save_failed: "Could not save the data-use confirmation. Try again.",
      account_connection: "Connect account",
      site_url_label: "PicoShare website",
      site_url_placeholder: "https://share.example.com",
      api_key_label: "API Key",
      api_key_placeholder: "Paste the API Key created in your account",
      save_authorize: "Save and authorize site",
      settings_saved: "Settings saved. Context menus are ready.",
      secret_storage_hint: "The key is stored in this browser extension. Saving for the first time requests access to the PicoShare site you entered.",
      floating_title: "Floating page button",
      floating_hint: "Show a PicoShare icon in the lower-right corner so you do not need to open the extension menu.",
      floating_aria: "Enable floating page button",
      floating_detail: "Hold the floating icon to drag it and remember its position. Click to open a menu for a full-page PNG screenshot, a local file, or the current page HTML; right-click saves the cleaned page URL as a .txt share (query parameters and fragments are removed). Enabling it requests access to all sites for the floating icon and long screenshots.",
      local_upload_title: "Upload local file",
      upload_share: "Upload and create share link",
      context_menu_title: "Web page context menu",
      context_upload_html: "Upload current page HTML to PicoShare",
      context_save_image: "Save image to PicoShare and create a share link",
      context_menu_detail: "Right-click a blank area to upload the current page HTML; right-click an image to save it to PicoShare. A share link opens when finished.",
      html_plain_text_hint: "Page HTML is shared as plain text, so opening the link displays source code without executing page scripts.",
      success_upload: "Upload succeeded",
      share_created: "Share link created.",
      share_created_detail: "A share link is ready to copy or open.",
      upload_complete: "Upload complete",
      copy_share: "Copy share link",
      api_docs: "API guide",
      connected: "Connected to {baseUrl}",
      reauthorize: "Save settings to authorize the PicoShare site again.",
      fill_settings: "Enter the website address and API Key.",
      fill_api_key: "Enter an API Key.",
      permission_not_granted: "Site access was not granted; settings were not saved.",
      site_permission_required: "Save settings and authorize the PicoShare site first.",
      floating_enabled: "Floating page button enabled.",
      floating_disabled: "Floating page button disabled.",
      floating_enable_requires_settings: "Save the PicoShare website and API Key first.",
      floating_settings_failed: "Could not update the floating page button setting.",
      floating_permission_not_granted: "Page access was not granted; the floating button was not enabled.",
      choose_file_first: "Choose a local file first.",
      no_file: "There is no file to upload.",
      uploading: "Uploading file…",
      uploading_large: "Uploading large file: {percent}%",
      uploading_wait: "Upload in progress, please wait.",
      upload_processing: "Upload is still processing; the share link will open when it finishes.",
      upload_done: "File uploaded; the share link is open.",
      html_upload_done: "Page HTML uploaded; the share link is open.",
      screenshot_upload_done: "Long screenshot uploaded; the share link is open.",
      page_html_uploading: "Reading and uploading the current page HTML…",
      page_link_saving: "Saving the current page link…",
      screenshot_preparing: "Preparing a long page screenshot…",
      screenshot_uploading: "Uploading the long page screenshot…",
      screenshot_progress: "Long screenshot: {current} / {total} screens",
      page_html_note: "Web source: {url}",
      page_image_note: "Web image: {url}",
      page_link_note: "Web link: {url}",
      browser_upload_note: "Browser extension upload",
      screenshot_file_too_long: "This page is over 40 screens; long screenshots do not support pages this long yet.",
      screenshot_page_too_long: "This page is too long to create a screenshot right now.",
      screenshot_canvas_failed: "Could not create the long screenshot canvas.",
      screenshot_generate_failed: "Could not create the long screenshot. Shorten the page and try again.",
      screenshot_capture_failed: "Could not capture the current page.",
      screenshot_capture_prefix: "Could not capture the current page: ",
      screenshot_read_failed: "Could not read the captured image.",
      capture_permission_required: "Long screenshot permission is not enabled. Re-enable the floating page button in the popup and allow access to all sites.",
      capture_tab_changed: "The active tab changed during capture. Try again.",
      chrome_capture_failed: "Chrome screenshot failed: {message}",
      chrome_capture_empty: "Chrome returned no screenshot data. Keep the current tab in the foreground and try again.",
      result_open_failed: "Could not open the share result.",
      invalid_share_url: "The returned share link is invalid.",
      operation_failed: "The extension operation failed.",
      connect_failed: "Could not connect to the PicoShare extension service.",
      cannot_start_upload: "Could not start the upload.",
      invalid_position: "The floating button position is invalid.",
      invalid_tab: "Could not identify the current page tab.",
      picoshare_settings_api_key: "Enter the website address and API Key in PicoShare extension settings first.",
      site_access_setup: "The extension does not have access to PicoShare. Open the extension settings and save the website address.",
      extension_page_permission: "Grant the extension permission to access web pages first.",
      current_page_unreadable: "Could not read the current page content.",
      current_page_url_invalid: "The current page URL is invalid.",
      unsupported_upload: "This upload mode is not supported.",
      upload_failed: "Upload failed.",
      upload_complete_period: "Upload complete.",
      copied: "Copied",
      clipboard_manual: "Copy the link above manually",
      share_copied: "Share link copied.",
      clipboard_denied: "Clipboard access is unavailable; copy the link manually.",
      page_link_done: "Page link saved; the share link is open.",
      page_link_failed: "Page link save failed",
      page_html_failed: "Page HTML upload failed",
      image_save_failed: "Image save failed",
      image_url_invalid: "The image URL is invalid.",
      image_data_unsupported: "data: and blob: images are not supported. Use an http(s) image URL.",
      image_permission_required: "Image site access was not granted, so this image cannot be read.",
      image_read_failed: "Could not read the image (HTTP {status}).",
      unknown_error: "Unknown error",
      no_connection: "Could not connect to PicoShare. Check the website address and network connection. {message}",
      invalid_site_url: "Enter a valid PicoShare website address.",
      site_url_protocol: "The website address must start with http:// or https://.",
      site_url_credentials: "The website address cannot contain credentials, query parameters, or fragments.",
      settings_read_failed: "Could not read PicoShare extension settings.",
      api_key_required: "Enter an API Key in the extension settings first.",
      api_key_invalid: "The API Key is invalid or revoked. Check the extension settings.",
      quota_exhausted: "The monthly API request quota has been used.",
      invalid_multipart: "PicoShare returned invalid multipart upload details.",
      upload_response_invalid: "Upload completed, but the response did not include a file ID.",
      menu_title: "PicoShare quick actions",
      menu_screenshot: "Upload long page screenshot (PNG)",
      menu_file: "Upload local file",
      menu_html: "Upload current page HTML",
      file_select: "Choose a local file to upload",
      launcher_title: "Hold the left button to drag; click to open the upload menu; right-click to save the current page link",
      notification_title: "PicoShare upload succeeded",
      notification_message: "{name} has a share link. Click this notification to open it.",
      result_error_title: "Operation incomplete",
      result_invalid_title: "Could not create a share link",
      result_invalid_detail: "The returned file link is invalid.",
      result_saved: "{name} was saved to PicoShare.",
      result_title: "PicoShare share link",
      result_file_fallback: "File",
      result_copy: "Copy share link",
    },
  };

  var PREFIXES = [
    ["网页源码：", "Web source: "],
    ["网页图片：", "Web image: "],
    ["网页链接：", "Web link: "],
    ["网页长截图：", "Web long screenshot: "],
    ["正在上传大文件：", "Uploading large file: "],
    ["长截图：", "Long screenshot: "],
    ["Chrome 截图失败：", "Chrome screenshot failed: "],
    ["无法截取当前页面：", "Could not capture the current page: "],
    ["读取图片失败（HTTP ", "Could not read the image (HTTP "],
  ];

  var REVERSE = {};
  Object.keys(MESSAGES.zh).forEach(function (key) {
    var zh = MESSAGES.zh[key];
    var en = MESSAGES.en[key];
    if (typeof zh === "string" && typeof en === "string") REVERSE[en] = zh;
  });

  function normalize(value) {
    return value === "zh" || value === "en" || value === AUTO ? value : AUTO;
  }

  function detectLanguage() {
    var locale = "";
    try {
      if (root.chrome && root.chrome.i18n && typeof root.chrome.i18n.getUILanguage === "function") {
        locale = root.chrome.i18n.getUILanguage() || "";
      }
    } catch (_) {}
    if (!locale && root.navigator) locale = root.navigator.language || root.navigator.userLanguage || "";
    return /^zh(?:[-_]|$)/i.test(String(locale)) ? "zh" : "en";
  }

  function resolve(value) {
    var selected = normalize(value === undefined ? preference : value);
    return selected === AUTO ? detectLanguage() : selected;
  }

  function interpolate(text, values) {
    if (!values || typeof values !== "object") return text;
    return String(text).replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : "{" + key + "}";
    });
  }

  function translate(text, selectedLanguage) {
    if (text === null || text === undefined) return text;
    var source = String(text);
    var selected = resolve(selectedLanguage);
    if (selected === "zh") {
      return Object.prototype.hasOwnProperty.call(REVERSE, source) ? REVERSE[source] : source;
    }
    for (var i = 0; i < PREFIXES.length; i += 1) {
      if (source.indexOf(PREFIXES[i][0]) === 0) return PREFIXES[i][1] + source.slice(PREFIXES[i][0].length);
    }
    var originals = Object.keys(MESSAGES.zh);
    for (var j = 0; j < originals.length; j += 1) {
      if (source.indexOf(MESSAGES.zh[originals[j]]) === 0 && MESSAGES.zh[originals[j]].indexOf("{") === -1) {
        return MESSAGES.en[originals[j]] + source.slice(MESSAGES.zh[originals[j]].length);
      }
    }
    return Object.prototype.hasOwnProperty.call(REVERSE, source) ? source : source;
  }

  function t(key, values, selectedLanguage) {
    var selected = resolve(selectedLanguage);
    var dictionary = MESSAGES[selected] || MESSAGES.en;
    var message = Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : translate(key, selected);
    return interpolate(message, values);
  }

  function storageGet(callback) {
    if (root.chrome && root.chrome.storage && root.chrome.storage.local) {
      root.chrome.storage.local.get([STORAGE_KEY], function (items) {
        callback(items && items[STORAGE_KEY]);
      });
      return;
    }
    var stored = null;
    try { stored = root.localStorage.getItem("picoshare_" + STORAGE_KEY); } catch (_) {}
    callback(stored);
  }

  function getLanguage(callback) {
    storageGet(function (stored) {
      preference = normalize(stored);
      language = resolve(preference);
      if (typeof callback === "function") callback(language, preference);
    });
    return language;
  }

  function storageSet(value, callback) {
    if (root.chrome && root.chrome.storage && root.chrome.storage.local) {
      root.chrome.storage.local.set({ [STORAGE_KEY]: value }, function () {
        if (typeof callback === "function") callback();
      });
      return;
    }
    try { root.localStorage.setItem("picoshare_" + STORAGE_KEY, value); } catch (_) {}
    if (typeof callback === "function") callback();
  }

  function setLanguage(value, callback) {
    preference = normalize(value);
    language = resolve(preference);
    storageSet(preference, function () {
      if (typeof callback === "function") callback(language, preference);
    });
    return language;
  }

  function apply(rootElement, selectedLanguage) {
    var target = rootElement || (root.document || null);
    var selected = resolve(selectedLanguage);
    if (!target || typeof target.querySelectorAll !== "function") return selected;
    function applyNode(node) {
      if (node.hasAttribute("data-i18n")) node.textContent = t(node.getAttribute("data-i18n"), null, selected);
      if (node.hasAttribute("data-i18n-placeholder")) node.setAttribute("placeholder", t(node.getAttribute("data-i18n-placeholder"), null, selected));
      if (node.hasAttribute("data-i18n-title")) node.setAttribute("title", t(node.getAttribute("data-i18n-title"), null, selected));
      if (node.hasAttribute("data-i18n-aria-label")) node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria-label"), null, selected));
    }
    if (target.nodeType === 1) applyNode(target);
    target.querySelectorAll("[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria-label]").forEach(applyNode);
    if (target.documentElement) target.documentElement.lang = selected === "zh" ? "zh-CN" : "en";
    return selected;
  }

  root.PicoShareI18n = {
    AUTO: AUTO,
    dataUseConsentVersion: DATA_USE_CONSENT_VERSION,
    messages: MESSAGES,
    get language() { return language; },
    get preference() { return preference; },
    detectLanguage: detectLanguage,
    translate: translate,
    t: t,
    getLanguage: getLanguage,
    setLanguage: setLanguage,
    apply: apply,
  };
})(typeof self !== "undefined" ? self : window);
