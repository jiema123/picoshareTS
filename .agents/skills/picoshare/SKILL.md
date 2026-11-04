---
name: picoshare
version: 1.0.0
description: "当用户需要通过 PicoShare API 上传文件、查找文件或获取分享链接，或创建、读取、更新、分享云便签时使用；支持通过 API Key 访问 SaaS 账户。"
display_name: PicoShare 文件与云便签
display_name_en: PicoShare Files and Cloud Notes
description_zh: 通过 PicoShare API 上传和查找文件、生成分享链接，并管理云便签。
description_en: Upload and find files, create share links, and manage PicoShare cloud notes through its API.
category: developer-tools
author: PicoShare
allowed-tools: Bash
---

# PicoShare 文件与云便签

通过 PicoShare API 管理当前用户自己的文件和云便签。常用任务包括上传文件并返回分享链接、搜索已上传文件、读取云便签，以及新建或更新云便签并生成只读分享链接。

## 配置

调用前从 Agent 工具配置的环境变量或 secret store 读取：

- `PICOSHARE_BASE_URL`：PicoShare 服务根地址。若部署在子路径下，保留该路径；不要包含用户名、密码、查询参数或片段。
- `PICOSHARE_API_KEY`：拥有目标文件和便签的账户 API Key。

使用 `X-API-Key: $PICOSHARE_API_KEY` 请求头；服务也接受 `Authorization: Bearer <key>`。如果配置缺失，请让用户在 Agent 的安全配置中设置，不要让用户把 key 粘贴到对话中，也不要搜索不相关文件寻找 key。不要回显 key、将 key 放入 URL、分享链接、上传内容或日志。API Key 请求会计入账户的月度 API 请求额度。

通过 Bash 发 HTTP 请求时使用 `curl -sS`，避免 `-v`、shell tracing 或其他会打印请求头的选项。保留错误响应体并检查 HTTP 状态码；不要把失败响应当成成功结果。

## 常用操作

### 上传文件并返回分享链接

小于 100 MiB 的文件使用 `POST /api/entry` multipart 上传，必填字段为 `file`，可选字段为 `note` 和 `expirationDays`。成功响应中的 `id` 用于生成公开链接：`<PICOSHARE_BASE_URL>/-<id>`。链接持有者可访问文件，只有用户要求分享时才返回链接。

100 MiB 及以上文件使用分片上传。初始化、上传分片、完成和失败时中止的请求示例见 [API 参考](references/api.md#large-files-100-mib-or-larger)。每个请求都要带 API Key。

### 列出、搜索或查看文件

- `GET /api/entries` 获取当前账户文件列表；接口没有服务端搜索和分页参数。按文件名或备注在 Agent 侧过滤结果。
- `GET /api/entry/{id}` 获取单个文件的元数据和下载次数。
- 上传纯文本作为可分享 `.txt` 文件时，使用 `/api/entry` 的 `pastedText` 字段；它不是云便签。

### 创建、读取或分享云便签

- `GET /clipboard-api/list` 列出账户便签及其 slug、publicId 和更新时间。
- `GET /clipboard-api/item/{slug}` 读取私有便签。
- `PUT /clipboard-api/item/{slug}` 以 JSON `{"content":"..."}` 创建便签或替换该 slug 下的全部内容。
- 成功响应包含 `publicId` 时，公开只读链接为 `<PICOSHARE_BASE_URL>/c/<publicId>`。便签分享链接对持有者开放；只在用户要求分享时返回。
- 受密码保护的公开便签通过 `GET /clipboard-api/public/{publicId}` 读取，并在请求头中提供 `X-Clip-Password`。

写便签前先检查目标 slug。若已有内容且用户没有明确要求更新/替换，询问是覆盖还是使用新 slug。云便签没有删除接口，不要用空内容覆盖来冒充删除。

slug 会规范化为小写，空格变为连字符；最多 64 个字母、数字、下划线或连字符，不能以连字符开头或结尾。创建便签和密码操作的完整字段、示例及错误码见 [API 参考](references/api.md#cloud-notes)。

## 操作边界

- 仅在用户当前请求明确要求时上传文件、创建或更新便签、设置便签密码或删除文件。
- 删除文件使用 `DELETE /api/entry/{id}`，属于不可逆操作；仅在用户明确指定要删除的文件时执行。
- 不要猜测文件所有者或将 API Key 换成其他账户的凭据。
- 分享前确认返回的是文件 `id` 对应的 `/-<id>`，还是便签 `publicId` 对应的 `/c/<publicId>`，不要混用。
- 报告操作结果时给出文件 ID、便签 slug 或用户要求的分享链接；准确报告 API 错误。常见状态码包括 `400` 输入无效、`401` 认证失败或便签密码错误、`404` 资源不存在、`413` 文件/存储限制、`429` 月度 API 请求额度用尽。

更多请求示例、字段说明、密码便签和大文件分片流程见 [API 参考](references/api.md)。
