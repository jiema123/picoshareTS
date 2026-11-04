(function () {
  var marker = "__picoshareFloatingButtonInstalled";
  if (window[marker] || !document.documentElement || typeof PicoShareApi === "undefined" || typeof PicoShareI18n === "undefined") return;
  window[marker] = true;
  var extensionLanguage = PicoShareI18n.detectLanguage();

  function tr(text, values) {
    return PicoShareI18n.translate(text, extensionLanguage, values);
  }

  var host = document.createElement("div");
  host.id = "picoshare-floating-button-host";
  // Page styles can target injected elements by tag or id. Keep the host visible
  // and above page UI even when the site applies global hiding/reset rules.
  host.style.cssText = "all:initial !important;display:block !important;position:fixed !important;right:20px !important;bottom:20px !important;z-index:2147483647 !important;visibility:visible !important;opacity:1 !important;pointer-events:auto !important;";
  var shadow = host.attachShadow({ mode: "closed" });
  var style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    :host { all: initial; }
    .wrap { position: relative; font: 13px/1.4 system-ui, -apple-system, sans-serif; }
    .launcher { display: grid; width: 48px; height: 48px; padding: 8px; place-items: center; border: 1px solid #d5dcee; border-radius: 50%; color: #26354d; background: #fff; box-shadow: 0 5px 22px #17294b3b; cursor: grab; touch-action: none; user-select: none; transition: transform .16s ease, box-shadow .16s ease; }
    .launcher:hover { transform: translateY(-2px); box-shadow: 0 8px 24px #17294b4d; }
    .launcher.dragging { cursor: grabbing; transition: none; transform: none; }
    .launcher:focus-visible, .menu-item:focus-visible { outline: 3px solid #7087ec; outline-offset: 3px; }
    .launcher[aria-busy="true"] { opacity: .65; cursor: progress; }
    img { display: block; width: 30px; height: 30px; object-fit: contain; pointer-events: none; -webkit-user-drag: none; }
    .menu { position: fixed; display: grid; gap: 6px; width: min(290px, calc(100vw - 32px)); max-height: calc(100vh - 16px); overflow: auto; padding: 10px; border: 1px solid #d7dfed; border-radius: 13px; background: #fff; box-shadow: 0 8px 28px #17294b30; }
    .menu[hidden] { display: none; }
    .menu-title { margin: 0 3px 2px; color: #748199; font-size: 11px; font-weight: 700; letter-spacing: .03em; }
    .menu-item { width: 100%; padding: 10px 11px; border: 0; border-radius: 8px; color: #26354d; background: #f5f7fc; font: inherit; text-align: left; cursor: pointer; }
    .menu-item:hover { background: #eaf0ff; }
    .toast { position: fixed; width: max-content; max-width: min(320px, calc(100vw - 36px)); max-height: calc(100vh - 16px); overflow: auto; padding: 9px 12px; border: 1px solid #d7dfed; border-radius: 10px; color: #26354d; background: #fff; box-shadow: 0 4px 18px #17294b24; overflow-wrap: anywhere; }
    .toast.error { color: #9f342e; border-color: #edc2bf; }
    .toast[hidden] { display: none; }
    .file-input { display: none !important; }
    @media (max-width: 600px) { .launcher { width: 44px; height: 44px; } img { width: 27px; height: 27px; } }
  `;
  var wrap = document.createElement("div");
  wrap.className = "wrap";
  var button = document.createElement("button");
  button.className = "launcher";
  button.type = "button";
  button.draggable = false;
  button.title = tr("按住左键拖动可移动；单击打开上传菜单，右键保存当前网页链接");
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-busy", "false");
  var logo = document.createElement("img");
  logo.src = chrome.runtime.getURL("icons/picoshare-48.png");
  logo.alt = "PicoShare";
  logo.draggable = false;
  button.appendChild(logo);

  var menu = document.createElement("div");
  menu.className = "menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  var menuTitle = document.createElement("p");
  menuTitle.className = "menu-title";
  menuTitle.textContent = tr("PicoShare 快捷操作");
  var screenshotButton = createMenuButton(tr("网页长截图上传（PNG）"));
  var fileButton = createMenuButton(tr("选取本地文件上传"));
  var htmlButton = createMenuButton(tr("获取当前网页 HTML 上传"));
  menu.append(menuTitle, screenshotButton, fileButton, htmlButton);

  var fileInput = document.createElement("input");
  fileInput.className = "file-input";
  fileInput.type = "file";
  fileInput.tabIndex = -1;
  fileInput.setAttribute("aria-label", tr("选择要上传的本地文件"));
  var toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;

  wrap.append(menu, button, fileInput, toast);
  shadow.append(style, wrap);
  document.documentElement.appendChild(host);

  var isUploading = false;
  var activeRequestId = "";
  var toastTimer = 0;
  var uploadTimer = 0;
  var dragState = null;
  var suppressNextClick = false;
  var positionRatio = null;
  var positionManuallyChanged = false;

  function applyLanguage(language) {
    extensionLanguage = language === "en" ? "en" : "zh";
    button.title = tr("按住左键拖动可移动；单击打开上传菜单，右键保存当前网页链接");
    button.setAttribute("aria-label", button.title);
    menuTitle.textContent = tr("PicoShare 快捷操作");
    screenshotButton.textContent = tr("网页长截图上传（PNG）");
    fileButton.textContent = tr("选取本地文件上传");
    htmlButton.textContent = tr("获取当前网页 HTML 上传");
    fileInput.setAttribute("aria-label", tr("选择要上传的本地文件"));
    if (!menu.hidden) positionPopup(menu);
  }

  PicoShareI18n.getLanguage(function (language) { applyLanguage(language); });
  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName !== "local" || !changes.language) return;
    PicoShareI18n.getLanguage(function (language) { applyLanguage(language); });
  });

  function maxHostPosition() {
    return {
      x: Math.max(0, window.innerWidth - host.offsetWidth),
      y: Math.max(0, window.innerHeight - host.offsetHeight),
    };
  }

  function setHostPosition(left, top) {
    var max = maxHostPosition();
    var x = Math.max(0, Math.min(max.x, left));
    var y = Math.max(0, Math.min(max.y, top));
    host.style.setProperty("right", "auto", "important");
    host.style.setProperty("bottom", "auto", "important");
    host.style.setProperty("left", x + "px", "important");
    host.style.setProperty("top", y + "px", "important");
    host.style.setProperty("display", "block", "important");
    host.style.setProperty("visibility", "visible", "important");
    host.style.setProperty("opacity", "1", "important");
    host.style.setProperty("pointer-events", "auto", "important");
  }

  function applyPositionRatio() {
    if (!positionRatio) return;
    var max = maxHostPosition();
    setHostPosition(positionRatio.x * max.x, positionRatio.y * max.y);
  }

  function saveHostPosition() {
    var rect = host.getBoundingClientRect();
    var max = maxHostPosition();
    positionRatio = {
      x: max.x ? rect.left / max.x : 0,
      y: max.y ? rect.top / max.y : 0,
    };
    sendRuntimeMessage({ type: "SET_FLOATING_BUTTON_POSITION", position: positionRatio }).catch(function () {});
  }

  function restoreHostPosition() {
    sendRuntimeMessage({ type: "GET_FLOATING_BUTTON_POSITION" }).then(function (response) {
      if (positionManuallyChanged) return;
      var saved = response && response.position;
      if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return;
      positionRatio = {
        x: Math.max(0, Math.min(1, saved.x)),
        y: Math.max(0, Math.min(1, saved.y)),
      };
      applyPositionRatio();
    }).catch(function () {});
  }

  function positionPopup(element) {
    var rect = host.getBoundingClientRect();
    var popup = element.getBoundingClientRect();
    var width = popup.width || element.offsetWidth;
    var height = popup.height || element.offsetHeight;
    var gap = 10;
    var rightSpace = window.innerWidth - rect.right;
    var bottomSpace = window.innerHeight - rect.bottom;
    var openRight = rightSpace >= width + gap || rightSpace >= rect.left;
    var openDown = bottomSpace >= height + gap || bottomSpace >= rect.top;
    var left = openRight ? rect.left : rect.right - width;
    var top = openDown ? rect.bottom + gap : rect.top - height - gap;
    left = Math.max(8, Math.min(Math.max(8, window.innerWidth - width - 8), left));
    top = Math.max(8, Math.min(Math.max(8, window.innerHeight - height - 8), top));
    element.style.position = "fixed";
    element.style.left = left + "px";
    element.style.top = top + "px";
    element.style.right = "auto";
    element.style.bottom = "auto";
  }

  function createMenuButton(label) {
    var item = document.createElement("button");
    item.type = "button";
    item.className = "menu-item";
    item.setAttribute("role", "menuitem");
    item.textContent = label;
    return item;
  }

  function showToast(text, isError) {
    toast.textContent = String(text || "");
    toast.classList.toggle("error", Boolean(isError));
    toast.hidden = !text;
    if (text) positionPopup(toast);
    clearTimeout(toastTimer);
    if (text) toastTimer = setTimeout(function () { toast.hidden = true; }, 6000);
  }

  function setMenuOpen(open) {
    menu.hidden = !open;
    if (open) positionPopup(menu);
    button.setAttribute("aria-expanded", String(Boolean(open)));
  }

  function onPointerDown(event) {
    if (event.button !== 0 || event.isPrimary === false) return;
    var rect = host.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      moved: false,
    };
    try { button.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function onPointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    var dx = event.clientX - dragState.startX;
    var dy = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) < 5) return;
    if (!dragState.moved) {
      dragState.moved = true;
      positionManuallyChanged = true;
      button.classList.add("dragging");
      setMenuOpen(false);
    }
    event.preventDefault();
    setHostPosition(dragState.startLeft + dx, dragState.startTop + dy);
    if (!toast.hidden) positionPopup(toast);
  }

  function onPointerEnd(event) {
    if (!dragState || (event && event.pointerId !== dragState.pointerId)) return;
    var moved = dragState.moved;
    dragState = null;
    button.classList.remove("dragging");
    if (!moved) return;
    saveHostPosition();
    suppressNextClick = true;
    setTimeout(function () { suppressNextClick = false; }, 500);
  }

  button.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerEnd, true);
  document.addEventListener("pointercancel", onPointerEnd, true);
  window.addEventListener("resize", applyPositionRatio);

  function beginUpload(message) {
    if (isUploading) {
      showToast(tr("正在上传，请稍候。"), false);
      return "";
    }
    isUploading = true;
    activeRequestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    button.setAttribute("aria-busy", "true");
    setMenuOpen(false);
    showToast(message, false);
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(function () {
      if (activeRequestId) finishUpload(activeRequestId, false, tr("上传仍在处理中；完成后会打开分享链接。"), false);
    }, 180000);
    return activeRequestId;
  }

  function finishUpload(requestId, success, detail, isError) {
    if (!requestId || requestId !== activeRequestId) return;
    activeRequestId = "";
    isUploading = false;
    button.setAttribute("aria-busy", "false");
    clearTimeout(uploadTimer);
    showToast(detail || (success ? tr("上传完成。") : tr("上传失败。")), isError || !success);
  }

  function sendRuntimeMessage(message) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(message, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || response.ok === false) {
          reject(new Error(response && response.error || tr("扩展操作失败。")));
          return;
        }
        resolve(response);
      });
    });
  }

  function startBackgroundUpload(mode) {
    var requestId = beginUpload(mode === "html" ? tr("正在获取并上传当前网页 HTML…") : tr("正在保存当前网页链接…"));
    if (!requestId) return;
    chrome.runtime.sendMessage({
      type: "FLOATING_UPLOAD",
      mode: mode,
      requestId: requestId,
      title: document.title || location.hostname,
      url: location.href,
    }, function (response) {
      if (chrome.runtime.lastError) {
        finishUpload(requestId, false, tr("无法连接 PicoShare 扩展服务。"), true);
      } else if (!response || !response.ok) {
        finishUpload(requestId, false, response && response.error || tr("无法开始上传。"), true);
      }
    });
  }

  async function uploadLocalFile(file) {
    var requestId = beginUpload(tr("正在上传文件…"));
    if (!requestId) return;
    try {
      await uploadFileAndOpenResult(file, tr("浏览器插件上传"), requestId);
      finishUpload(requestId, true, tr("文件已上传，分享链接已打开。"), false);
    } catch (error) {
      finishUpload(requestId, false, error && error.message || String(error), true);
    }
  }

  async function uploadPageHtml() {
    var requestId = beginUpload(tr("正在获取并上传当前网页 HTML…"));
    if (!requestId) return;
    try {
      var html = "<!doctype html>\n" + document.documentElement.outerHTML;
      var title = safeFilename(document.title || location.hostname || "web-page");
      var file = new File([html], title + ".html", { type: "text/html;charset=utf-8" });
      await uploadFileAndOpenResult(file, tr("网页源码：") + safePageUrl(location.href), requestId);
      finishUpload(requestId, true, tr("网页 HTML 已上传，分享链接已打开。"), false);
    } catch (error) {
      finishUpload(requestId, false, error && error.message || String(error), true);
    }
  }

  async function uploadFileAndOpenResult(file, note, requestId) {
    var settings = await PicoShareApi.getSettings();
    if (!settings.baseUrl || !settings.apiKey) throw new Error(tr("请先在 PicoShare 扩展设置中填写网站地址和 API Key。"));
    var result = await PicoShareApi.uploadFile(file, settings, {
      note: note,
      onProgress: function (progress) {
        if (progress.phase === "uploading" && progress.total >= 100 * 1024 * 1024) {
          showToast(PicoShareI18n.t("uploading_large", { percent: Math.floor(progress.sent / progress.total * 100) }, extensionLanguage), false);
        }
      },
    });
    await sendRuntimeMessage({
      type: "OPEN_FLOATING_RESULT",
      requestId: requestId,
      name: file.name,
      shareUrl: result.shareUrl,
    });
  }

  async function captureLongScreenshot() {
    var requestId = beginUpload(tr("正在准备网页长截图…"));
    if (!requestId) return;
    var originalX = window.scrollX;
    var originalY = window.scrollY;
    var previousScrollBehavior = document.documentElement.style.scrollBehavior;
    var pageRestored = false;
    host.style.setProperty("visibility", "hidden", "important");
    document.documentElement.style.scrollBehavior = "auto";
    try {
      var metrics = await warmLazyContent();
      var viewHeight = metrics.viewportHeight;
      var step = Math.max(1, viewHeight - Math.min(120, Math.floor(viewHeight / 5)));
      var positions = getCapturePositions(metrics.documentHeight, viewHeight, step);
      var maxDimension = 32767;
      var maxPixels = 40000000;
      var requestedScale = Math.max(1, window.devicePixelRatio || 1);
      var outputScale = Math.min(
        requestedScale,
        maxDimension / metrics.viewportWidth,
        maxDimension / metrics.documentHeight,
        Math.sqrt(maxPixels / (metrics.viewportWidth * metrics.documentHeight)),
      );
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(metrics.viewportWidth * outputScale));
      canvas.height = Math.max(1, Math.round(metrics.documentHeight * outputScale));
      var context = canvas.getContext("2d");
      if (!context) throw new Error(tr("无法创建长截图画布。"));

      var lastCaptureAt = 0;
      for (var i = 0; i < positions.length; i += 1) {
        var y = positions[i];
        scrollInstantly(y);
        await waitForPaint(180);
        var delay = Math.max(0, 550 - (Date.now() - lastCaptureAt));
        if (delay) await wait(delay);
        var screenshot = await captureVisibleTab();
        lastCaptureAt = Date.now();
        var image = await decodeImage(screenshot);
        var drawHeight = Math.min(viewHeight, metrics.documentHeight - y);
        context.drawImage(
          image,
          0,
          0,
          image.naturalWidth,
          image.naturalHeight,
          0,
          Math.round(y * outputScale),
          canvas.width,
          Math.round(drawHeight * outputScale),
        );
        showToast(PicoShareI18n.t("screenshot_progress", { current: i + 1, total: positions.length }, extensionLanguage), false);
      }

      var blob = await canvasToBlob(canvas);
      if (!blob) throw new Error(tr("长截图生成失败，请缩短网页后重试。"));
      var fileName = safeFilename(document.title || location.hostname || "web-page") + "-long-screenshot.png";
      var file = new File([blob], fileName, { type: "image/png" });
      restorePage();
      showToast(tr("正在上传网页长截图…"), false);
      await uploadFileAndOpenResult(file, tr("网页长截图：") + safePageUrl(location.href), requestId);
      finishUpload(requestId, true, tr("网页长截图已上传，分享链接已打开。"), false);
    } catch (error) {
      restorePage();
      finishUpload(requestId, false, error && error.message || String(error), true);
    } finally {
      restorePage();
    }

    function restorePage() {
      if (pageRestored) return;
      pageRestored = true;
      host.style.setProperty("visibility", "visible", "important");
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
      scrollInstantly(originalY, originalX);
    }
  }

  async function warmLazyContent() {
    var viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight);
    var step = Math.max(1, viewportHeight - Math.min(120, Math.floor(viewportHeight / 5)));
    var previousHeight = pageHeight();
    for (var pass = 0; pass < 3; pass += 1) {
      var y = 0;
      var steps = 0;
      while (y < Math.max(0, pageHeight() - viewportHeight)) {
        scrollInstantly(y);
        await waitForPaint(100);
        steps += 1;
        if (steps > 100) throw new Error(tr("网页太长，暂时无法生成长截图。"));
        y += step;
      }
      var currentHeight = pageHeight();
      scrollInstantly(Math.max(0, currentHeight - viewportHeight));
      await waitForPaint(180);
      currentHeight = pageHeight();
      if (currentHeight <= previousHeight) break;
      previousHeight = currentHeight;
    }
    return getPageMetrics();
  }

  function getPageMetrics() {
    var root = document.documentElement;
    var body = document.body;
    var viewportWidth = Math.max(1, window.innerWidth || root.clientWidth);
    var viewportHeight = Math.max(1, window.innerHeight || root.clientHeight);
    var documentHeight = Math.max(root.scrollHeight, root.offsetHeight, body ? body.scrollHeight : 0, body ? body.offsetHeight : 0, viewportHeight);
    return { viewportWidth: viewportWidth, viewportHeight: viewportHeight, documentHeight: documentHeight };
  }

  function pageHeight() {
    return getPageMetrics().documentHeight;
  }

  function getCapturePositions(documentHeight, viewportHeight, step) {
    var maxScroll = Math.max(0, documentHeight - viewportHeight);
    var positions = [0];
    while (positions[positions.length - 1] < maxScroll) {
      positions.push(Math.min(maxScroll, positions[positions.length - 1] + step));
      if (positions.length > 40) throw new Error(tr("网页超过 40 屏，长截图暂不支持这么长的页面。"));
    }
    return positions;
  }

  function scrollInstantly(y, x) {
    try { window.scrollTo({ top: y, left: Number(x || 0), behavior: "instant" }); }
    catch (_) { window.scrollTo(Number(x || 0), y); }
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function waitForPaint(ms) {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { setTimeout(resolve, ms); });
    });
  }

  function captureVisibleTab() {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({ type: "CAPTURE_VISIBLE_TAB" }, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(tr("无法截取当前页面：") + chrome.runtime.lastError.message));
        } else if (!response || !response.ok || !response.dataUrl) {
          reject(new Error(response && response.error || tr("无法截取当前页面。")));
        } else {
          resolve(response.dataUrl);
        }
      });
    });
  }

  function decodeImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error(tr("读取截图画面失败。"))); };
      image.src = dataUrl;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, "image/png"); });
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

  button.addEventListener("click", function (event) {
    if (event.button !== 0) return;
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (isUploading) {
      showToast(tr("正在上传，请稍候。"), false);
      return;
    }
    setMenuOpen(menu.hidden);
  });
  button.addEventListener("contextmenu", function (event) {
    event.preventDefault();
    event.stopPropagation();
    startBackgroundUpload("url");
  });

  screenshotButton.addEventListener("click", function () { void captureLongScreenshot(); });
  fileButton.addEventListener("click", function () { fileInput.click(); });
  htmlButton.addEventListener("click", function () { uploadPageHtml(); });
  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    if (file) void uploadLocalFile(file);
    fileInput.value = "";
  });
  function onDocumentPointerDown(event) {
    if (!menu.hidden && event.target === host) return;
    if (!menu.hidden && !host.contains(event.target)) setMenuOpen(false);
  }
  function onDocumentKeyDown(event) {
    if (event.key === "Escape" && !menu.hidden) setMenuOpen(false);
  }
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("keydown", onDocumentKeyDown, true);

  function onRuntimeMessage(message) {
    if (message && message.type === "REMOVE_FLOATING_BUTTON") {
      window[marker] = false;
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerEnd, true);
      document.removeEventListener("pointercancel", onPointerEnd, true);
      document.removeEventListener("keydown", onDocumentKeyDown, true);
      window.removeEventListener("resize", applyPositionRatio);
      host.remove();
    } else if (message && message.type === "FLOATING_UPLOAD_RESULT") {
      finishUpload(message.requestId, Boolean(message.success), message.detail, !message.success);
    }
  }
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  restoreHostPosition();
})();
