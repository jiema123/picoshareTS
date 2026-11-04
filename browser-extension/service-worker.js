importScripts("i18n.js", "api.js");

var PAGE_MENU_ID = "picoshare-upload-page-html";
var IMAGE_MENU_ID = "picoshare-save-image";
var FLOATING_SCRIPT_ID = "picoshare-floating-button";
var FLOATING_MATCHES = ["http://*/*", "https://*/*"];
var SCREENSHOT_PERMISSION_ORIGIN = "<all_urls>";
var DATA_USE_CONSENT_VERSION = PicoShareI18n.dataUseConsentVersion;
var extensionLanguage = PicoShareI18n.detectLanguage();

function tr(text, values) {
  return PicoShareI18n.translate(text, extensionLanguage, values);
}

async function requireDataUseConsent() {
  var items = await chrome.storage.local.get("dataUseConsentVersion");
  if (!items || items.dataUseConsentVersion !== DATA_USE_CONSENT_VERSION) {
    throw new Error(PicoShareI18n.t("data_use_required", null, extensionLanguage));
  }
}

function refreshContextMenuLanguage() {
  chrome.contextMenus.update(PAGE_MENU_ID, { title: tr("上传当前网页 HTML 到 PicoShare") }, function () {
    void chrome.runtime.lastError;
  });
  chrome.contextMenus.update(IMAGE_MENU_ID, { title: tr("保存图片到 PicoShare 并生成分享链接") }, function () {
    void chrome.runtime.lastError;
  });
}

function createContextMenus() {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      id: PAGE_MENU_ID,
      title: tr("上传当前网页 HTML 到 PicoShare"),
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: IMAGE_MENU_ID,
      title: tr("保存图片到 PicoShare 并生成分享链接"),
      contexts: ["image"],
    });
  });
}

async function syncContextMenus() {
  var items = await chrome.storage.local.get("dataUseConsentVersion");
  if (!items || items.dataUseConsentVersion !== DATA_USE_CONSENT_VERSION) {
    chrome.contextMenus.removeAll();
    return;
  }
  createContextMenus();
}

PicoShareI18n.getLanguage(function (language) {
  extensionLanguage = language;
  refreshContextMenuLanguage();
});

chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName !== "local") return;
  if (changes.language) {
    PicoShareI18n.getLanguage(function (language) {
      extensionLanguage = language;
      refreshContextMenuLanguage();
    });
  }
  if (changes.dataUseConsentVersion) void syncContextMenus();
});

chrome.runtime.onInstalled.addListener(function () {
  PicoShareI18n.getLanguage(function (language) {
    extensionLanguage = language;
    void syncContextMenus();
  });
  void restoreFloatingButton();
});

chrome.runtime.onStartup.addListener(function () {
  void restoreFloatingButton();
  void syncContextMenus();
});

chrome.permissions.onRemoved.addListener(function () {
  chrome.permissions.contains({ origins: [SCREENSHOT_PERMISSION_ORIGIN] }, function (granted) {
    if (!granted) void disableFloatingButton();
  });
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (!tab || !tab.id) return;
  if (info.menuItemId === PAGE_MENU_ID) {
    void uploadCurrentPage(info, tab);
  } else if (info.menuItemId === IMAGE_MENU_ID) {
    requestContextImagePermission(info, tab);
  }
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message && message.type === "UPLOAD_SUCCEEDED" && message.shareUrl) {
    notifyUploadSuccess(message.name || tr("文件"), message.shareUrl);
  } else if (message && message.type === "CLEAR_UPLOAD_BADGE") {
    chrome.action.setBadgeText({ text: "" });
  } else if (message && message.type === "GET_PICOSHARE_SETTINGS") {
    chrome.storage.local.get(["baseUrl", "apiKey"], function (items) {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({
        ok: true,
        settings: { baseUrl: items.baseUrl || "", apiKey: items.apiKey || "" },
      });
    });
    return true;
  } else if (message && message.type === "GET_FLOATING_BUTTON_POSITION") {
    chrome.storage.local.get("picoshareFloatingButtonPosition", function (items) {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true, position: items.picoshareFloatingButtonPosition || null });
    });
    return true;
  } else if (message && message.type === "SET_FLOATING_BUTTON_POSITION") {
    var position = message.position;
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      sendResponse({ ok: false, error: tr("悬浮按钮位置无效。") });
      return;
    }
    chrome.storage.local.set({
      picoshareFloatingButtonPosition: {
        x: Math.max(0, Math.min(1, position.x)),
        y: Math.max(0, Math.min(1, position.y)),
      },
    }, function () {
      if (chrome.runtime.lastError) sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      else sendResponse({ ok: true });
    });
    return true;
  } else if (message && message.type === "SET_FLOATING_ENABLED") {
    configureFloatingButton(Boolean(message.enabled)).then(function () {
      sendResponse({ ok: true, enabled: Boolean(message.enabled) });
    }).catch(function (error) {
      sendResponse({ ok: false, error: friendlyError(error) });
    });
    return true;
  } else if (message && message.type === "FLOATING_UPLOAD") {
    if (!sender.tab || !Number.isInteger(sender.tab.id) || !message.requestId) {
      sendResponse({ ok: false, error: tr("无法识别当前网页标签。") });
      return;
    }
    if (message.mode !== "html" && message.mode !== "url") {
      sendResponse({ ok: false, error: tr("不支持的上传方式。") });
      return;
    }
    sendResponse({ ok: true });
    if (message.mode === "html") {
      void uploadCurrentPage({ frameId: sender.frameId }, sender.tab, message.requestId);
    } else if (message.mode === "url") {
      void uploadCurrentPageLink(sender.tab, {
        title: message.title,
        url: sender.url || message.url,
      }, message.requestId);
    }
  } else if (message && message.type === "CAPTURE_VISIBLE_TAB") {
    if (!sender.tab || !Number.isInteger(sender.tab.id) || !Number.isInteger(sender.tab.windowId)) {
      sendResponse({ ok: false, error: tr("无法识别当前网页标签。") });
      return;
    }
    requireDataUseConsent().then(function () {
      chrome.permissions.contains({ origins: [SCREENSHOT_PERMISSION_ORIGIN] }, function (permissionGranted) {
        if (!permissionGranted) {
          sendResponse({ ok: false, error: tr("长截图权限未启用。请重新启用弹窗中的“常驻网页按钮”并允许所有网站访问。") });
          return;
        }
        chrome.tabs.query({ active: true, windowId: sender.tab.windowId }, function (tabs) {
          if (!tabs || !tabs[0] || tabs[0].id !== sender.tab.id) {
            sendResponse({ ok: false, error: tr("截图期间页面标签发生变化，请重试。") });
            return;
          }
          chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, function (dataUrl) {
            var captureError = chrome.runtime.lastError;
            if (captureError) {
              console.error("captureVisibleTab failed:", captureError.message);
              sendResponse({ ok: false, error: tr("Chrome 截图失败：") + captureError.message });
              return;
            }
            if (!dataUrl) {
              sendResponse({ ok: false, error: tr("Chrome 没有返回截图数据，请确认当前标签页仍处于前台。") });
              return;
            }
            sendResponse({ ok: true, dataUrl: dataUrl });
          });
        });
      });
    }).catch(function (error) {
      sendResponse({ ok: false, error: friendlyError(error) });
    });
    return true;
  } else if (message && message.type === "OPEN_FLOATING_RESULT") {
    if (!sender.tab || !Number.isInteger(sender.tab.id) || !message.requestId || !message.shareUrl) {
      sendResponse({ ok: false, error: tr("无法打开分享结果。") });
      return;
    }
    try {
      var shareUrl = new URL(String(message.shareUrl));
      if (shareUrl.protocol !== "http:" && shareUrl.protocol !== "https:") throw new Error("invalid URL");
    } catch (_) {
      sendResponse({ ok: false, error: tr("返回的分享链接无效。") });
      return;
    }
    var resultName = String(message.name || tr("文件")).slice(0, 180);
    var parsedShareUrl = new URL(String(message.shareUrl));
    notifyUploadSuccess(resultName, parsedShareUrl.toString());
    openResult({ name: resultName, shareUrl: parsedShareUrl.toString() }).then(function () {
      sendResponse({ ok: true });
    }).catch(function (error) {
      sendResponse({ ok: false, error: friendlyError(error) });
    });
    return true;
  }
});

chrome.notifications.onClicked.addListener(function (notificationId) {
  var storageKey = "picoshare-notification-links";
  chrome.storage.local.get([storageKey], function (items) {
    var links = items[storageKey] || {};
    var shareUrl = links[notificationId];
    if (!shareUrl) return;
    delete links[notificationId];
    chrome.storage.local.set({ [storageKey]: links }, function () {
      chrome.tabs.create({ url: shareUrl });
    });
  });
});

function notifyUploadSuccess(name, shareUrl) {
  var notificationId = "picoshare-upload-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  var storageKey = "picoshare-notification-links";
  chrome.action.setBadgeBackgroundColor({ color: "#21936f" });
  chrome.action.setBadgeText({ text: "✓" });
  chrome.storage.local.get([storageKey], function (items) {
    var links = items[storageKey] || {};
    links[notificationId] = shareUrl;
    var keys = Object.keys(links);
    while (keys.length > 20) delete links[keys.shift()];
    chrome.storage.local.set({ [storageKey]: links }, function () {
      chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/picoshare-128.png"),
        title: PicoShareI18n.t("notification_title", null, extensionLanguage),
        message: PicoShareI18n.t("notification_message", { name: name || tr("文件") }, extensionLanguage),
        priority: 0,
      }, function () {
        void chrome.runtime.lastError;
      });
    });
  });
}

async function currentSettings() {
  var settings = await PicoShareApi.getSettings();
  var normalized = {
    baseUrl: PicoShareApi.normalizeBaseUrl(settings.baseUrl),
    apiKey: settings.apiKey,
  };
  if (!normalized.apiKey) throw new Error(tr("请先在 PicoShare 扩展设置中填写网站地址和 API Key。"));
  var allowed = await chrome.permissions.contains({ origins: [PicoShareApi.originPattern(normalized.baseUrl)] });
  if (!allowed) throw new Error(tr("插件尚未获得 PicoShare 网站权限。请打开插件设置并保存网站地址。"));
  return normalized;
}

async function configureFloatingButton(enabled) {
  if (!enabled) {
    await disableFloatingButton();
    return;
  }

  await requireDataUseConsent();

  var granted = await chrome.permissions.contains({ origins: [SCREENSHOT_PERMISSION_ORIGIN] });
  if (!granted) throw new Error(tr("请先授予扩展访问网页的权限。"));
  var settings = await PicoShareApi.getSettings();
  if (!settings.baseUrl || !settings.apiKey) throw new Error(tr("请先保存 PicoShare 网站地址和 API Key。"));

  await unregisterFloatingScript();
  await chrome.scripting.registerContentScripts([{
    id: FLOATING_SCRIPT_ID,
    matches: FLOATING_MATCHES,
    js: ["i18n.js", "api.js", "floating-button.js"],
    runAt: "document_idle",
    allFrames: false,
    persistAcrossSessions: true,
  }]);
  await chrome.storage.local.set({ floatingEnabled: true });
  await injectFloatingButtonIntoOpenTabs();
}

async function restoreFloatingButton() {
  var items = await chrome.storage.local.get(["floatingEnabled", "dataUseConsentVersion"]);
  if (!items.floatingEnabled) return;
  if (items.dataUseConsentVersion !== DATA_USE_CONSENT_VERSION) {
    await disableFloatingButton();
    return;
  }
  var granted = await chrome.permissions.contains({ origins: [SCREENSHOT_PERMISSION_ORIGIN] });
  if (!granted) {
    await chrome.storage.local.set({ floatingEnabled: false });
    await unregisterFloatingScript();
    return;
  }
  try {
    await unregisterFloatingScript();
    await chrome.scripting.registerContentScripts([{
      id: FLOATING_SCRIPT_ID,
      matches: FLOATING_MATCHES,
      js: ["i18n.js", "api.js", "floating-button.js"],
      runAt: "document_idle",
      allFrames: false,
      persistAcrossSessions: true,
    }]);
    await injectFloatingButtonIntoOpenTabs();
  } catch (error) {
    console.warn("Could not restore PicoShare floating button:", error);
  }
}

async function disableFloatingButton() {
  await chrome.storage.local.set({ floatingEnabled: false });
  await unregisterFloatingScript();
  var tabs = await chrome.tabs.query({ url: FLOATING_MATCHES });
  await Promise.all(tabs.filter(function (tab) { return Number.isInteger(tab.id); }).map(function (tab) {
    return chrome.tabs.sendMessage(tab.id, { type: "REMOVE_FLOATING_BUTTON" }).catch(function () {});
  }));
}

async function unregisterFloatingScript() {
  try { await chrome.scripting.unregisterContentScripts({ ids: [FLOATING_SCRIPT_ID] }); } catch (_) {}
}

async function injectFloatingButtonIntoOpenTabs() {
  var tabs = await chrome.tabs.query({ url: FLOATING_MATCHES });
  await Promise.all(tabs.filter(function (tab) { return Number.isInteger(tab.id); }).map(function (tab) {
    return chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["i18n.js", "api.js", "floating-button.js"] }).catch(function () {});
  }));
}

function reportFloatingUpload(tabId, requestId, success, detail) {
  if (!requestId || !Number.isInteger(tabId)) return;
  chrome.tabs.sendMessage(tabId, {
    type: "FLOATING_UPLOAD_RESULT",
    requestId: requestId,
    success: success,
    detail: String(detail || ""),
  }, function () {
    void chrome.runtime.lastError;
  });
}

async function uploadCurrentPage(info, tab, floatingRequestId) {
  try {
    await requireDataUseConsent();
    var settings = await currentSettings();
    var frameId = Number.isInteger(info.frameId) ? info.frameId : 0;
    var captured = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [frameId] },
      func: function () {
        return {
          title: document.title || location.hostname || "web-page",
          url: location.href,
          html: "<!doctype html>\n" + document.documentElement.outerHTML,
        };
      },
    });
    var page = captured && captured[0] && captured[0].result;
    if (!page || !page.html) throw new Error(tr("无法读取当前网页内容。"));
    var filename = safeFilename(page.title) + ".html";
    // Store captured markup as text/plain to prevent scripts in shared HTML from running on the PicoShare origin.
    var file = new File([page.html], filename, { type: "text/plain;charset=utf-8" });
    var result = await PicoShareApi.uploadFile(file, settings, { note: tr("网页源码：") + safePageUrl(page.url) });
    notifyUploadSuccess(filename, result.shareUrl);
    await openResult({ name: filename, shareUrl: result.shareUrl });
    reportFloatingUpload(tab.id, floatingRequestId, true, tr("网页 HTML 已上传，分享链接已打开。"));
  } catch (error) {
    await openResult({ error: friendlyError(error), name: tr("网页 HTML 上传失败") });
    reportFloatingUpload(tab.id, floatingRequestId, false, friendlyError(error));
  }
}

async function uploadCurrentPageLink(tab, pageDetails, floatingRequestId) {
  try {
    await requireDataUseConsent();
    var settings = await currentSettings();
    var pageUrl = safePageUrl(pageDetails.url || tab.url || "");
    if (!/^https?:\/\//i.test(pageUrl)) throw new Error(tr("当前网页地址无法识别。"));
    var parsed = new URL(pageUrl);
    var title = safeFilename(pageDetails.title || parsed.hostname);
    var filename = title + ".url.txt";
    var file = new File([pageUrl + "\n"], filename, { type: "text/plain;charset=utf-8" });
    var result = await PicoShareApi.uploadFile(file, settings, { note: tr("网页链接：") + pageUrl });
    notifyUploadSuccess(filename, result.shareUrl);
    await openResult({ name: filename, shareUrl: result.shareUrl });
    reportFloatingUpload(tab.id, floatingRequestId, true, tr("网页链接已保存，分享链接已打开。"));
  } catch (error) {
    await openResult({ error: friendlyError(error), name: tr("网页链接保存失败") });
    reportFloatingUpload(tab.id, floatingRequestId, false, friendlyError(error));
  }
}

function requestContextImagePermission(info, tab) {
  var sourceUrl = String(info.srcUrl || "");
  var parsed;
  try { parsed = new URL(sourceUrl); } catch (_) {
    void showContextImageError(new Error(tr("图片地址无法识别。")));
    return;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    void showContextImageError(new Error(tr("暂不支持 data: 或 blob: 图片，请使用图片的 http(s) 地址。")));
    return;
  }

  // Request the origin permission in the original context-menu click stack.
  // Awaiting consent or storage first loses Edge's required user gesture.
  chrome.permissions.request({ origins: [parsed.origin + "/*"] }, function (granted) {
    var permissionError = chrome.runtime.lastError;
    if (permissionError) {
      void showContextImageError(new Error(permissionError.message));
      return;
    }
    if (!granted) {
      void showContextImageError(new Error(tr("未授予图片网站访问权限，无法读取这张图片。")));
      return;
    }
    void uploadContextImage(info, tab, parsed);
  });
}

async function showContextImageError(error) {
  await openResult({ error: friendlyError(error), name: tr("图片保存失败") });
}

async function uploadContextImage(info, tab, parsed) {
  try {
    await requireDataUseConsent();
    var settings = await currentSettings();

    var response = await fetch(sourceUrl, { credentials: "include", redirect: "follow" });
    if (!response.ok) throw new Error(PicoShareI18n.t("image_read_failed", { status: response.status }, extensionLanguage));
    var blob = await response.blob();
    var contentType = (blob.type || response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    var filename = imageFilename(parsed, contentType);
    var file = new File([blob], filename, { type: contentType || "application/octet-stream" });
    var result = await PicoShareApi.uploadFile(file, settings, { note: tr("网页图片：") + safePageUrl(info.pageUrl || "") });
    notifyUploadSuccess(filename, result.shareUrl);
    await openResult({ name: filename, shareUrl: result.shareUrl });
  } catch (error) {
    await openResult({ error: friendlyError(error), name: tr("图片保存失败") });
  }
}

function imageFilename(url, contentType) {
  var filename = "";
  try { filename = decodeURIComponent(url.pathname.split("/").pop() || ""); } catch (_) {}
  filename = safeFilename(filename);
  if (!filename || filename === "image") filename = "image";
  if (!/\.[a-z0-9]{2,8}$/i.test(filename)) {
    var extensions = {
      "image/avif": "avif", "image/gif": "gif", "image/jpeg": "jpg",
      "image/png": "png", "image/svg+xml": "svg", "image/webp": "webp",
    };
    var extension = extensions[contentType];
    if (extension) filename += "." + extension;
  }
  return filename.slice(0, 180);
}

function safeFilename(value) {
  return String(value || "file")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120) || "file";
}

function safePageUrl(value) {
  try {
    var url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, 900);
  } catch (_) {
    return "";
  }
}

function friendlyError(error) {
  return tr(String(error && error.message || error || "未知错误")).slice(0, 500);
}

async function openResult(result) {
  var params = new URLSearchParams();
  if (result.shareUrl) params.set("url", result.shareUrl);
  if (result.name) params.set("name", result.name);
  if (result.error) params.set("error", result.error);
  await chrome.tabs.create({ url: chrome.runtime.getURL("result.html") + "?" + params.toString() });
}
