(function () {
  PicoShareI18n.getLanguage(function (language) {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    PicoShareI18n.apply(document, language);
    render(language);
  });

  function render(language) {
    function tr(text) { return PicoShareI18n.translate(text, language); }
    var params = new URLSearchParams(location.search);
    var title = params.get("name") || tr("文件");
    var error = params.get("error");
    var rawUrl = params.get("url");
    var titleElement = document.getElementById("title");
    var description = document.getElementById("description");
    var errorElement = document.getElementById("error");
    var link = document.getElementById("share-link");
    var copyButton = document.getElementById("copy");
    var shareUrl = "";

    if (error) {
      titleElement.textContent = tr("操作未完成");
      description.textContent = title;
      errorElement.textContent = tr(error);
      return;
    }

    try {
      var parsed = new URL(rawUrl || "");
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid url");
      shareUrl = parsed.toString();
    } catch (_) {
      titleElement.textContent = tr("无法生成分享链接");
      errorElement.textContent = tr("返回的文件链接无效。");
      return;
    }

    titleElement.textContent = tr("上传完成");
    description.textContent = PicoShareI18n.t("result_saved", { name: title }, language);
    link.href = shareUrl;
    link.textContent = shareUrl;
    link.classList.remove("hidden");
    copyButton.classList.remove("hidden");
    copyButton.addEventListener("click", async function () {
      try {
        await navigator.clipboard.writeText(shareUrl);
        copyButton.textContent = tr("已复制");
      } catch (_) {
        copyButton.textContent = tr("请手动复制上方链接");
      }
    });
  }
})();
