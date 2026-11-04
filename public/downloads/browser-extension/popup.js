(function () {
  var baseUrlInput = document.getElementById("base-url");
  var apiKeyInput = document.getElementById("api-key");
  var saveButton = document.getElementById("save-settings");
  var fileInput = document.getElementById("file-input");
  var uploadButton = document.getElementById("upload-file");
  var status = document.getElementById("status");
  var successAlert = document.getElementById("success-alert");
  var successTitle = document.getElementById("success-title");
  var successMessage = document.getElementById("success-message");
  var resultSection = document.getElementById("result");
  var resultTitle = document.getElementById("result-title");
  var shareLink = document.getElementById("share-link");
  var copyButton = document.getElementById("copy-link");
  var floatingEnabledInput = document.getElementById("floating-enabled");
  var languageSelect = document.getElementById("language-select");
  var dataUseConsentInput = document.getElementById("data-use-consent");
  var DATA_USE_CONSENT_VERSION = PicoShareI18n.dataUseConsentVersion;
  var currentShareUrl = "";
  var PAGE_ORIGINS = ["<all_urls>"];
  var savedSettings = null;
  var language = "zh";
  var privacyConsent = false;

  function tr(text) {
    return PicoShareI18n.translate(text, language);
  }

  function applyLanguage(nextLanguage) {
    language = nextLanguage === "en" ? "en" : "zh";
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    PicoShareI18n.apply(document, language);
  }

  applyLanguage(PicoShareI18n.detectLanguage());
  dataUseConsentInput.disabled = true;

  chrome.runtime.sendMessage({ type: "CLEAR_UPLOAD_BADGE" }, function () {
    void chrome.runtime.lastError;
  });

  function showStatus(text, isError, isSuccess) {
    status.textContent = text || "";
    status.style.color = isError ? "#a03b35" : "#4a6880";
    status.classList.toggle("success-status", Boolean(text) && !isError && Boolean(isSuccess));
  }

  function showResult(result, title) {
    currentShareUrl = result.shareUrl;
    resultTitle.textContent = title || tr("分享链接已生成");
    shareLink.href = result.shareUrl;
    shareLink.textContent = result.shareUrl;
    successTitle.textContent = tr("上传成功");
    successMessage.textContent = tr("分享链接已生成，可复制或点击链接打开。");
    successAlert.classList.remove("hidden");
    resultSection.classList.remove("hidden");
    showStatus("✓ " + tr("上传成功") + ". " + tr("分享链接已生成。"), false, true);
    chrome.runtime.sendMessage({ type: "UPLOAD_SUCCEEDED", name: result.filename || "文件", shareUrl: result.shareUrl }, function () {
      // Notifications are a secondary cue; the in-popup success state remains visible if they are disabled.
      void chrome.runtime.lastError;
    });
  }

  function setBusy(button, busy) {
    button.disabled = busy;
  }

  function sendFloatingMessage(enabled) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage({ type: "SET_FLOATING_ENABLED", enabled: Boolean(enabled) }, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || response.ok === false) {
          reject(new Error(response && response.error || tr("常驻网页按钮设置失败。")));
          return;
        }
        resolve(response);
      });
    });
  }

  async function loadFloatingSetting() {
    var items = await new Promise(function (resolve, reject) {
      chrome.storage.local.get(["floatingEnabled"], function (result) {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(result || {});
      });
    });
    var settings = await PicoShareApi.getSettings();
    var allowed = await chrome.permissions.contains({ origins: PAGE_ORIGINS });
    var hasSettings = Boolean(settings.baseUrl && settings.apiKey);
    var enabled = Boolean(items.floatingEnabled) && hasSettings && allowed;
    floatingEnabledInput.checked = enabled;
    if (items.floatingEnabled && !enabled) {
      await sendFloatingMessage(false).catch(function () {});
    }
  }

  function updateDocsLink(value) {
    var link = document.getElementById("docs-link");
    try {
      link.href = PicoShareApi.normalizeBaseUrl(value) + "/api-docs";
      link.classList.remove("hidden");
    } catch (_) {
      link.classList.add("hidden");
    }
  }

  function updateConsentGates() {
    saveButton.disabled = !privacyConsent;
    fileInput.disabled = !privacyConsent;
    uploadButton.disabled = !privacyConsent;
    floatingEnabledInput.disabled = !privacyConsent;
  }

  async function ensureSitePermission(baseUrl) {
    var origin = PicoShareApi.originPattern(baseUrl);
    var granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error(tr("未授予网站访问权限，设置未保存。"));
  }

  async function loadSettings() {
    if (!privacyConsent) {
      showStatus(PicoShareI18n.t("data_use_required", null, language), true);
      return;
    }
    try {
      var settings = await PicoShareApi.getSettings();
      baseUrlInput.value = settings.baseUrl;
      apiKeyInput.value = settings.apiKey;
      savedSettings = { baseUrl: settings.baseUrl, apiKey: settings.apiKey };
      updateDocsLink(settings.baseUrl);
      if (settings.baseUrl && settings.apiKey) {
        var allowed = await chrome.permissions.contains({ origins: [PicoShareApi.originPattern(settings.baseUrl)] });
        showStatus(allowed
          ? PicoShareI18n.t("connected", { baseUrl: settings.baseUrl }, language)
          : tr("请保存设置以重新授权 PicoShare 网站。"), !allowed, allowed);
      } else {
        showStatus(tr("请填写网站地址和 API Key。"), false);
      }
      await loadFloatingSetting();
    } catch (error) {
      showStatus(tr(error.message || String(error)), true);
    }
  }

  saveButton.addEventListener("click", async function () {
    if (!privacyConsent) {
      showStatus(PicoShareI18n.t("data_use_required", null, language), true);
      return;
    }
    showStatus("");
    setBusy(saveButton, true);
    try {
      var baseUrl = PicoShareApi.normalizeBaseUrl(baseUrlInput.value);
      var apiKey = apiKeyInput.value.trim();
      if (!apiKey) throw new Error(tr("请填写 API Key。"));
      await ensureSitePermission(baseUrl);
      await new Promise(function (resolve, reject) {
        chrome.storage.local.set({ baseUrl: baseUrl, apiKey: apiKey }, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
      savedSettings = { baseUrl: baseUrl, apiKey: apiKey };
      baseUrlInput.value = baseUrl;
      updateDocsLink(baseUrl);
      showStatus(tr("设置已保存。右键菜单已就绪。"), false, true);
    } catch (error) {
      showStatus(tr(error.message || String(error)), true);
    } finally {
      setBusy(saveButton, false);
    }
  });

  uploadButton.addEventListener("click", async function () {
    if (!privacyConsent) {
      showStatus(PicoShareI18n.t("data_use_required", null, language), true);
      return;
    }
    showStatus("");
    successAlert.classList.add("hidden");
    resultSection.classList.add("hidden");
    var file = fileInput.files && fileInput.files[0];
    if (!file) {
      showStatus(tr("请先选择一个本地文件。"), true);
      return;
    }
    setBusy(uploadButton, true);
    try {
      var settings = await PicoShareApi.getSettings();
      var allowed = await chrome.permissions.contains({ origins: [PicoShareApi.originPattern(settings.baseUrl)] });
      if (!allowed) throw new Error(tr("请先保存设置并授权 PicoShare 网站。"));
      var result = await PicoShareApi.uploadFile(file, settings, {
        onProgress: function (progress) {
          if (progress.phase === "uploading" && progress.total >= 100 * 1024 * 1024) {
            showStatus(tr("正在上传大文件：") + Math.floor(progress.sent / progress.total * 100) + "%", false);
          } else {
            showStatus(tr("正在上传文件…"), false);
          }
        },
      });
      showResult(result, result.filename || tr("上传完成"));
    } catch (error) {
      showStatus(tr(error.message || String(error)), true);
    } finally {
      setBusy(uploadButton, false);
    }
  });

  copyButton.addEventListener("click", async function () {
    if (!currentShareUrl) return;
    try {
      await navigator.clipboard.writeText(currentShareUrl);
      showStatus(tr("分享链接已复制。"), false, true);
    } catch (_) {
      showStatus(tr("无法访问剪贴板，请手动复制链接。"), true);
    }
  });

  floatingEnabledInput.addEventListener("change", async function () {
    if (!privacyConsent) {
      floatingEnabledInput.checked = false;
      showStatus(PicoShareI18n.t("data_use_required", null, language), true);
      return;
    }
    var enabled = floatingEnabledInput.checked;
    floatingEnabledInput.disabled = true;
    try {
      if (enabled) {
        var baseUrl = baseUrlInput.value.trim();
        var apiKey = apiKeyInput.value.trim();
        if (!baseUrl || !apiKey || !savedSettings || savedSettings.baseUrl !== baseUrl || savedSettings.apiKey !== apiKey) {
          throw new Error(tr("请先保存 PicoShare 网站地址和 API Key。"));
        }
        PicoShareApi.normalizeBaseUrl(baseUrl);
        var permissionRequest = chrome.permissions.request({ origins: PAGE_ORIGINS });
        var granted = await permissionRequest;
        if (!granted) throw new Error(tr("未授予网页访问权限，常驻按钮未启用。"));
      }
      await sendFloatingMessage(enabled);
      await new Promise(function (resolve, reject) {
        chrome.storage.local.set({ floatingEnabled: enabled }, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
      showStatus(tr(enabled ? "常驻网页按钮已启用。" : "常驻网页按钮已关闭。"), false, true);
    } catch (error) {
      floatingEnabledInput.checked = !enabled;
      showStatus(tr(error.message || String(error)), true);
    } finally {
      floatingEnabledInput.disabled = !privacyConsent;
    }
  });

  baseUrlInput.addEventListener("change", function () {
    updateDocsLink(baseUrlInput.value);
  });
  languageSelect.addEventListener("change", function () {
    var preference = languageSelect.value;
    PicoShareI18n.setLanguage(preference, function (nextLanguage) {
      applyLanguage(nextLanguage);
      if (privacyConsent) void loadSettings();
      else showStatus(PicoShareI18n.t("data_use_required", null, language), true);
    });
  });
  dataUseConsentInput.addEventListener("change", function () {
    var accepted = dataUseConsentInput.checked;
    if (accepted) {
      chrome.storage.local.set({ dataUseConsentVersion: DATA_USE_CONSENT_VERSION }, function () {
        if (chrome.runtime.lastError) {
          privacyConsent = false;
          dataUseConsentInput.checked = false;
          updateConsentGates();
          showStatus(PicoShareI18n.t("data_use_save_failed", null, language), true);
          return;
        }
        privacyConsent = true;
        updateConsentGates();
        void loadSettings();
      });
      return;
    }
    chrome.storage.local.remove("dataUseConsentVersion", function () {
      privacyConsent = false;
      savedSettings = null;
      updateConsentGates();
      chrome.storage.local.set({ floatingEnabled: false }, function () { void chrome.runtime.lastError; });
      chrome.runtime.sendMessage({ type: "SET_FLOATING_ENABLED", enabled: false }, function () { void chrome.runtime.lastError; });
      showStatus(PicoShareI18n.t("data_use_revoked", null, language), false);
    });
  });
  chrome.storage.local.get(["language", "dataUseConsentVersion"], function (items) {
    languageSelect.value = items && items.language || "auto";
    privacyConsent = Boolean(items && items.dataUseConsentVersion === DATA_USE_CONSENT_VERSION);
    dataUseConsentInput.checked = privacyConsent;
    updateConsentGates();
    PicoShareI18n.getLanguage(function (initialLanguage) {
      applyLanguage(initialLanguage);
      dataUseConsentInput.disabled = false;
      if (privacyConsent) void loadSettings();
      else showStatus(PicoShareI18n.t("data_use_required", null, language), true);
    });
  });
})();
