# PicoShare AI 提示词

把下面任一提示发给已安装 PicoShare Skill 的 Agent。Agent 需要使用你在 Agent Secret 中配置的 `PICOSHARE_BASE_URL` 和 `PICOSHARE_API_KEY`。

## 文件上传与分享

```text
请使用 PicoShare 上传这个文件，备注写“版本评审”，保存 30 天。上传成功后把文件名和分享链接返回给我。
```

```text
把当前目录下最新导出的 HTML 视觉稿上传到 PicoShare，生成预览分享链接。上传前不要修改原文件。
```

## 搜索与下载

```text
在我的 PicoShare 文件中搜索文件名或备注包含“设计稿”的内容，列出匹配项的文件名、更新时间和分享链接，不要删除或覆盖文件。
```

```text
请从 PicoShare 下载文件 ID `FILE_ID` 到当前目录的 `handoff/` 文件夹；如果目标文件已存在，先询问我，不要覆盖。
```

## 云便签

```text
把下面这段部署命令保存到 PicoShare 云便签 `prod-deploy-checklist`，先检查同名便签。若已有内容，告诉我并询问是否覆盖。
```

```text
读取 PicoShare 云便签 `prod-deploy-checklist`，只返回便签内容，不要修改它。
```

```text
将云便签 `incident-handoff` 创建只读分享链接并返回给我。不要在便签或回复中暴露 API Key。
```

## CLI 直接调用

安装工具包后，可在终端使用：

```sh
picoshare files upload ./report.pdf --note "版本评审" --expires 30
picoshare files list --search "设计稿"
picoshare files share FILE_ID
picoshare notes get prod-deploy-checklist
picoshare notes share prod-deploy-checklist
```

## 使用边界

- API Key 仅保存在本地 Secret 或可信服务器环境变量中，不放进提示词、命令参数、公开仓库或上传内容。
- 删除文件、覆盖已有云便签等不可逆操作，必须先获得用户明确指示。
- 分享链接持有者可以访问内容；仅在用户要求时返回链接。
- 文件 ID 与便签 public ID 是不同类型的标识，不要混用分享地址。
