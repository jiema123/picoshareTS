# Cloudflare 部署与发布指南

本文说明如何把 PicoShare TS 部署到一个新的 Cloudflare 账号，并分别进行本地调试、SaaS 登录配置和线上验收。

项目使用 Cloudflare Workers 运行应用，D1 保存文件元数据和账号信息，R2 保存文件对象，KV 保存云便签。Wrangler 配置模板见 [`wrangler.toml.example`](../wrangler.toml.example)，本地变量模板见 [`.dev.vars.example`](../.dev.vars.example)。

## 1. 准备环境并登录新账号

需要 Node.js 20 或更新版本。进入项目根目录安装依赖，然后授权 Wrangler：

```sh
npm ci
npx wrangler login
npx wrangler whoami
```

确认 `whoami` 显示的 Cloudflare 账号正确。若该用户属于多个账号，创建资源时选择新账号，或在 `wrangler.toml` 中设置新账号的 `account_id`。

如果仓库里已经有本地 `wrangler.toml` 或 `.dev.vars`，先保留现有文件，不要直接用模板覆盖。它们是本地配置，模板只用于核对字段。

## 2. 在新账号创建 Cloudflare 资源

```sh
npx wrangler d1 create picoshare_db
npx wrangler r2 bucket create picoshare-files
npx wrangler kv namespace create picoshare-clips
```

记录 D1 输出的 `database_id` 和 KV 输出的 namespace `id`，再填入本地 `wrangler.toml`。资源绑定名称必须与应用代码一致：

```toml
[[d1_databases]]
binding = "DB"
database_name = "picoshare_db"
database_id = "<新建 D1 返回的 ID>"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "picoshare-files"

[[kv_namespaces]]
binding = "CLIPBOARD"
id = "<新建 KV 返回的 ID>"
```

R2 bucket 名须与创建时一致。R2 由 Worker 通过 `BUCKET` 绑定访问，不需要公开 bucket。

Wrangler 创建资源的官方说明：[D1](https://developers.cloudflare.com/d1/wrangler-commands/)、[R2](https://developers.cloudflare.com/r2/get-started/workers-api/)、[KV](https://developers.cloudflare.com/kv/reference/kv-commands/)。

## 3. 本地调试

### 3.1 配置本地变量

如果 `.dev.vars` 尚不存在，可以从模板复制：

```sh
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，至少设置一个本地强随机 `PS_SHARED_SECRET`。仅调试自托管模式时保持 `ENABLE_SAAS=false`。本地调试 SaaS 邮箱登录时，还需要设置至少 32 个字符的 `BETTER_AUTH_SECRET` 并设置 `ENABLE_SAAS=true`。配置 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET` 后才会启用 Google 登录按钮；没有 Google 凭据时，邮箱注册和登录仍可使用。

本地 SaaS 登录使用的 `BETTER_AUTH_URL` 应指向本地端口，例如：

```text
http://localhost:8788
```

本地登录也允许在同一端口使用 `127.0.0.1` 访问；Google OAuth 回调仍使用 `BETTER_AUTH_URL` 指定的规范主机名。生产环境只信任配置的规范来源。

如果测试本地 Google 登录，还需在 Google OAuth 客户端中添加本地回调地址：

```text
http://localhost:8788/api/auth/callback/google
```

`.dev.vars` 和 `.env` 都可提供本地变量；本项目已有 `.dev.vars` 时只维护它，不要同时依赖两种文件。不要提交包含真实密钥的文件。

### 3.2 启动本地 Worker

先初始化本地 D1，再启动服务：

```sh
npx wrangler d1 execute picoshare_db --local --file=./schema.sql
npm run typecheck
npm test
npx wrangler dev --port 8788
```

打开 `http://localhost:8788`。默认情况下，`wrangler dev` 使用本地模拟的 D1、R2 和 KV；上传的文件和便签不会出现在 Cloudflare 账号的远程资源中。应用也会在首次请求时执行幂等 schema 初始化和 Better Auth 数据库迁移。

若配置 remote bindings 连接 Cloudflare 远程资源，本地 Worker 的写入和删除会直接影响这些远程数据。调试时优先使用本地模拟，或为 staging 单独创建 D1、R2、KV，避免使用生产资源。

## 4. 初始化远程 D1 并进行首次部署

首次部署建议先保持 `ENABLE_SAAS = "false"`，确认基础 Worker 和存储绑定正常，再启用 SaaS。

确认本地 `wrangler.toml` 的 D1、R2、KV 配置指向新账号，然后初始化新建的远程 D1：

```sh
npx wrangler d1 execute picoshare_db --remote --file=./schema.sql
npx wrangler deploy
```

部署完成后，Wrangler 会输出 `workers.dev` 地址；当前产品的规范域名是 `https://pico.justnow.uk`。先验证首页和接口文档：

```sh
curl -i https://pico.justnow.uk/
curl -i https://pico.justnow.uk/api-docs
```

## 5. 启用 SaaS 登录

SaaS 模式需要配置 `BETTER_AUTH_SECRET`。Google OAuth 凭据是可选的：配置 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET` 后启用 Google 登录；未配置时仍可使用邮箱密码注册和登录。

### 5.1 配置 Google OAuth

在 Google OAuth 客户端的授权重定向 URI 中添加：

```text
https://pico.justnow.uk/api/auth/callback/google
```

Google OAuth 客户端还应将 `https://pico.justnow.uk` 加入授权 JavaScript 来源。

### 5.2 设置 Worker Secrets

确认 `[vars]` 中没有明文 `PS_SHARED_SECRET = "replace-me"`，再运行以下命令并按提示输入真实值：

```sh
npx wrangler secret put PS_SHARED_SECRET
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

`wrangler secret put` 会创建并部署新的 Worker 版本。敏感值不要写进 `wrangler.toml` 或提交到 Git。[Cloudflare Secrets 文档](https://developers.cloudflare.com/workers/configuration/secrets/)

### 5.3 启用 SaaS 并重新部署

将 `wrangler.toml` 的 `[vars]` 更新为实际站点地址：

```toml
ENABLE_SAAS = "true"
BETTER_AUTH_URL = "https://pico.justnow.uk"
```

然后部署：

```sh
npx wrangler deploy
```

访问 `/account` 测试注册和登录。用户登录后可创建自己的 API Key；SaaS 模式下 API Key 按用户隔离。自托管模式的全局 `PS_API_KEY` 不用于替代 SaaS 用户的个人 Key。

Waffo 商户、商品和 Webhook 配置不是基础部署、注册登录或 API Key 测试的前置条件。未配置 Waffo 时，订阅购买流程不可用；接入支付时再配置 `WAFFO_ENV`、商品 ID、商户凭据和 Webhook。

## 6. 线上验收与查看日志

部署后可在一个终端持续查看实时日志：

```sh
npx wrangler tail picoshare-ts --format pretty
```

在另一个终端或浏览器依次检查：

1. `/`：首页可以正常打开。
2. `/api-docs`：接口文档可以打开。
3. `/account`：注册、登录和创建 API Key 正常。
4. 用账号 API Key 请求文件列表：

```sh
export PICOSHARE_BASE_URL="https://pico.justnow.uk"
curl -i -H "X-API-Key: $PICOSHARE_API_KEY" \
  "$PICOSHARE_BASE_URL/api/entries"
```

5. 上传一个无敏感内容的小文件，确认响应包含 `id`，并验证分享地址 `https://pico.justnow.uk/-<id>` 可访问。
6. 创建云便签后访问 `/clips` 或便签公开链接，确认读写和公开读取行为符合预期。

不要在终端开启会回显请求头的调试模式，也不要把 API Key、OAuth Secret 或 Worker Secret 粘贴到日志、工单或聊天中。

## 7. 发布检查与常见故障

每次发布前建议执行：

```sh
npm run typecheck
npm test
npx wrangler deploy
npx wrangler deployments list
```

| 现象 | 优先检查 |
|---|---|
| `wrangler` 资源命令创建到了错误账号 | `npx wrangler whoami` 输出，以及 `wrangler.toml` 的 `account_id` |
| Worker 提示 D1/R2/KV binding 不存在 | `DB`、`BUCKET`、`CLIPBOARD` 绑定名和新账号资源 ID |
| 数据库提示表或列不存在 | 是否对新 D1 执行了 `--remote --file=./schema.sql`；查看 `wrangler tail` 中迁移错误 |
| SaaS 请求返回 503 | 检查 `ENABLE_SAAS=true` 和 `BETTER_AUTH_SECRET`（至少 32 字符）；Google Client ID/Secret 只影响 Google 登录按钮 |
| Google 登录出现回调地址错误 | `BETTER_AUTH_URL` 与 Google OAuth 的授权重定向 URI 是否使用同一域名和 `/api/auth/callback/google` 路径 |
| API 返回 401 | 是否使用该账号自己的 API Key，并通过 `X-API-Key` 请求头传入 |
| 本地数据和线上数据不一致 | `wrangler dev` 默认使用本地模拟资源；确认当前是在 `--local` 还是 remote binding 模式 |

Worker 实时日志和 Wrangler 调试说明：[Cloudflare Local Development](https://developers.cloudflare.com/workers/local-development/)、[Real-time Logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/)。
