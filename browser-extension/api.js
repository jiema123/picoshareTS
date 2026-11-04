var PicoShareApi = (function () {
  var MULTIPART_THRESHOLD = 100 * 1024 * 1024;

  function tr(text) {
    return typeof PicoShareI18n !== "undefined" ? PicoShareI18n.translate(text) : text;
  }

  function normalizeBaseUrl(value) {
    var parsed;
    try {
      parsed = new URL(String(value || "").trim());
    } catch (_) {
      throw new Error(tr("请输入有效的 PicoShare 网站地址。"));
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(tr("网站地址必须以 http:// 或 https:// 开头。"));
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error(tr("网站地址不能包含账号、密码、查询参数或片段。"));
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/$/, "");
  }

  function getSettings() {
    return new Promise(function (resolve, reject) {
      var storage = chrome.storage && chrome.storage.local;
      if (storage) {
        storage.get(["baseUrl", "apiKey"], function (items) {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve({
            baseUrl: items.baseUrl || "",
            apiKey: items.apiKey || "",
          });
        });
        return;
      }

      chrome.runtime.sendMessage({ type: "GET_PICOSHARE_SETTINGS" }, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response || response.ok === false) {
          reject(new Error(response && response.error || tr("无法读取 PicoShare 插件设置。")));
        } else {
          resolve(response.settings || { baseUrl: "", apiKey: "" });
        }
      });
    });
  }

  function requireDataUseConsent() {
    return new Promise(function (resolve, reject) {
      var storage = chrome.storage && chrome.storage.local;
      if (!storage) {
        reject(new Error(typeof PicoShareI18n !== "undefined"
          ? PicoShareI18n.t("data_use_required")
          : "Read and accept the data-use notice in the extension popup first."));
        return;
      }
      storage.get(["dataUseConsentVersion"], function (items) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        var requiredVersion = typeof PicoShareI18n !== "undefined" ? PicoShareI18n.dataUseConsentVersion : null;
        if (!requiredVersion || !items || items.dataUseConsentVersion !== requiredVersion) {
          reject(new Error(typeof PicoShareI18n !== "undefined"
            ? PicoShareI18n.t("data_use_required")
            : "Read and accept the data-use notice in the extension popup first."));
          return;
        }
        resolve();
      });
    });
  }

  function requireSettings(settings) {
    if (!settings || !settings.apiKey) throw new Error(tr("请先在插件设置中填写 API Key。"));
    return { baseUrl: normalizeBaseUrl(settings.baseUrl), apiKey: String(settings.apiKey) };
  }

  async function request(settings, path, options) {
    var config = requireSettings(settings);
    var init = Object.assign({}, options || {});
    var headers = new Headers(init.headers || {});
    headers.set("X-API-Key", config.apiKey);
    init.headers = headers;

    var response;
    try {
      response = await fetch(config.baseUrl + path, init);
    } catch (error) {
      var detail = String(error && error.message || error);
      throw new Error(typeof PicoShareI18n !== "undefined"
        ? PicoShareI18n.t("no_connection", { message: detail })
        : "无法连接 PicoShare。请检查网站地址和网络连接。 " + detail);
    }
    var text = await response.text();
    var data = null;
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { message: text }; }
    if (!response.ok) {
      var reason = data && (data.message || data.error) || "HTTP " + response.status;
      if (response.status === 401) reason = tr("API Key 无效或已撤销，请检查插件设置。");
      if (response.status === 429) reason = tr("本月 API 请求额度已用完。");
      throw new Error(String(reason));
    }
    return data;
  }

  async function uploadFile(file, settings, options) {
    await requireDataUseConsent();
    var config = requireSettings(settings);
    var opts = options || {};
    if (!file || typeof file.size !== "number" || !file.name) {
      throw new Error(tr("没有可上传的文件。"));
    }
    if (file.size >= MULTIPART_THRESHOLD) {
      return uploadMultipart(file, config, opts);
    }

    var form = new FormData();
    form.append("file", file, file.name);
    if (opts.note) form.append("note", String(opts.note).slice(0, 1000));
    if (opts.expirationDays) form.append("expirationDays", String(opts.expirationDays));
    if (opts.onProgress) opts.onProgress({ sent: 0, total: file.size, phase: "uploading" });
    var result = await request(config, "/api/entry", { method: "POST", body: form });
    if (opts.onProgress) opts.onProgress({ sent: file.size, total: file.size, phase: "complete" });
    return withShareUrl(result, config);
  }

  async function uploadMultipart(file, config, options) {
    var opts = options || {};
    var init = await request(config, "/api/entry/multipart/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        note: opts.note ? String(opts.note).slice(0, 1000) : undefined,
        expirationDays: opts.expirationDays || undefined,
      }),
    });
    if (!init.uploadId || !init.chunkSize) throw new Error(tr("PicoShare 返回了无效的分片上传信息。"));

    var chunkSize = Number(init.chunkSize);
    var partNumber = 1;
    try {
      for (var start = 0; start < file.size; start += chunkSize) {
        var chunk = file.slice(start, Math.min(start + chunkSize, file.size));
        await request(config, "/api/entry/multipart/part/" + encodeURIComponent(init.uploadId) + "/" + partNumber, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: chunk,
        });
        if (opts.onProgress) opts.onProgress({ sent: Math.min(start + chunk.size, file.size), total: file.size, phase: "uploading" });
        partNumber += 1;
      }
      var completed = await request(config, "/api/entry/multipart/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: init.uploadId }),
      });
      if (opts.onProgress) opts.onProgress({ sent: file.size, total: file.size, phase: "complete" });
      return withShareUrl(completed, config);
    } catch (error) {
      try {
        await request(config, "/api/entry/multipart/abort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId: init.uploadId }),
        });
      } catch (_) {}
      throw error;
    }
  }

  function withShareUrl(result, settings) {
    var config = requireSettings(settings);
    if (!result || !result.id) throw new Error(tr("上传完成，但响应中没有文件 ID。"));
    return Object.assign({}, result, {
      shareUrl: config.baseUrl + "/-" + encodeURIComponent(result.id),
    });
  }

  function originPattern(value) {
    return new URL(normalizeBaseUrl(value)).origin + "/*";
  }

  return {
    getSettings: getSettings,
    requireDataUseConsent: requireDataUseConsent,
    normalizeBaseUrl: normalizeBaseUrl,
    originPattern: originPattern,
    request: request,
    uploadFile: uploadFile,
  };
})();
