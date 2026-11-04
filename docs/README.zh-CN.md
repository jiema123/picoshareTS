# PicoShare TS 中文使用说明

基于 Cloudflare Workers + D1 + R2 的轻量文件分享服务。

## 功能补充：云便签（Clips）

- 列表页：`/clips`
- 详情页：`/:名字`（例如 `/jiema66`）
- 支持多设备共享同一地址编辑
- 支持便签独立密码保护
- 支持自动保存（含鼠标移出页面自动保存）

## 1. 环境准备

1. 安装 Node.js（建议 `>=18`）。
2. 安装依赖：

```bash
npm install
```

3. 安装 Wrangler（任选一种）：

```bash
# 方式 A：项目内使用（推荐）
npm install -D wrangler

# 方式 B：全局安装
npm install -g wrangler
```

4. 登录 Cloudflare：

```bash
npx wrangler login
```

## 2. 创建 Cloudflare 资源

### 2.1 创建 D1 数据库

```bash
npx wrangler d1 create picoshare_db
```

执行后会返回 `database_id`，把它写入本地 `wrangler.toml` 的 `[[d1_databases]]`。

### 2.2 创建 R2 Bucket

```bash
npx wrangler r2 bucket create picoshare-files
```

把 Bucket 名称写入 `wrangler.toml` 的 `[[r2_buckets]]`。

### 2.3 创建 KV（用于云便签 Clips）

```bash
npx wrangler kv namespace create "picoshare-clips"
```

把返回的 `id` 写入 `wrangler.toml` 的 `[[kv_namespaces]]`：

```toml
[[kv_namespaces]]
binding = "CLIPBOARD"
id = "你的_KV_ID"
```

## 3. 本地配置

1. 从模板生成配置文件：

```bash
cp wrangler.toml.example wrangler.toml
cp .dev.vars.example .dev.vars
```

2. 修改本地配置：

- `wrangler.toml`：
  - `database_id` 改为你创建的 D1 ID
  - `bucket_name` 改为你创建的 R2 名称
  - `kv_namespaces` 的 `CLIPBOARD` 改为你创建的 KV ID
- `.dev.vars`：
  - `PS_SHARED_SECRET` 改为强口令

## 4. 初始化数据库

本地初始化：

```bash
npx wrangler d1 execute picoshare_db --local --file=./schema.sql
```

远程初始化（生产）：

```bash
npx wrangler d1 execute picoshare_db --remote --file=./schema.sql
```

## 5. 启动与测试

本地启动：

```bash
npx wrangler dev --port 8788
```

质量检查：

```bash
npm run typecheck
npm test
```

## 6. 部署

1. 配置生产密钥：

```bash
npx wrangler secret put PS_SHARED_SECRET
npx wrangler secret put PS_API_KEY
```

自托管模式下，`PS_API_KEY` 是可选的，供 Skill、浏览器插件等 API 客户端使用；本地开发时可在 `.dev.vars` 中设置。客户端请求受保护的 `/api/*` 接口时，通过 `X-API-Key: <密钥>` 或 `Authorization: Bearer <密钥>` 传入。可使用 `PS_API_KEY` 或 `PS_SHARED_SECRET`；若不希望把网页登录密钥交给客户端，建议单独配置 `PS_API_KEY`。SaaS 模式下，每位用户在 `/account` 创建自己的 API Key，接口权限和用量按账号隔离。

例如列出文件和上传文件：

```bash
curl -H "X-API-Key: $PS_API_KEY" "$PICOSHARE_URL/api/entries"
curl -X POST -H "X-API-Key: $PS_API_KEY" \
  -F "file=@./example.png" "$PICOSHARE_URL/api/entry"
```

上传响应中的 `id` 可用于构造分享链接：`$PICOSHARE_URL/-<id>`。自托管模式的 API Key 拥有与网页管理界面相同的 `/api/*` 权限，请按密钥保存和管理。

## 6.2 SaaS 模式（可选）

SaaS 模式支持 Google OAuth 和邮箱密码登录。用户可使用邮箱和至少 8 位密码注册，然后在 `/account` 查看套餐用量、创建/撤销个人 API Key，并开始或管理 Waffo Pancake 订阅。当前未接入邮件发送服务，因此注册后不会发送邮箱验证或密码找回邮件；正式开放前应配置邮件服务和验证流程。个人文件、访客上传链接、设置和云便签均按账号隔离；公开文件分享链接和云便签链接使用随机 ID。

配置步骤：

1. 在 Google Cloud 创建 OAuth 客户端，将 `https://你的域名/api/auth/callback/google` 加入授权重定向 URI。
2. 在 Waffo Pancake 创建美元计价的 Pro 订阅商品：月付 $5、年付 $50。
3. 在 Waffo Dashboard 添加 Webhook，使用 Raw payload，地址填写 `https://你的域名/api/webhooks/waffo`。至少订阅 `subscription.activated`、`subscription.payment_succeeded`、`subscription.renewed`、`subscription.recovered`、`subscription.plan_changed`、`subscription.canceling`、`subscription.uncanceled`、`subscription.canceled`、`subscription.past_due` 和 `refund.succeeded`。首次结账时，如果单独的激活事件未送达，支付成功事件也会作为待处理订单的激活兜底。
4. 先使用 `WAFFO_ENV=test` 完成沙盒购买与回调验证，再切换到 `prod`。

启用 SaaS：在 Wrangler 变量中设置 `ENABLE_SAAS=true`、`BETTER_AUTH_URL`（站点的规范 HTTPS 域名）、`WAFFO_ENV`、`WAFFO_CURRENCY`、`WAFFO_PRODUCT_PRO_MONTHLY` 和 `WAFFO_PRODUCT_PRO_YEARLY`。设置 `SAAS_SUPERADMIN_EMAILS`，用逗号分隔经过验证的超管账号邮箱；超管可在 `/account` 手动开通或撤销 Pro，也可搜索用户、查看用户文件、删除单个文件或删除账号。超管必须使用已验证邮箱的 Google 登录账号，且不允许删除超管账号。删除用户前需在 Waffo 取消其有效订阅；删除会清理该用户的 R2 文件、KV 云便签、API Key、登录会话及 SaaS 记录，并保留管理员操作审计。Portal 还需要 `WAFFO_STORE_ID`。通过 `wrangler secret put` 配置 `BETTER_AUTH_SECRET`（至少 32 个字符）、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`WAFFO_MERCHANT_ID` 和 `WAFFO_PRIVATE_KEY`。Waffo 的测试/生产 Webhook 公钥已内置，可选配置 `WAFFO_WEBHOOK_*_PUBLIC_KEY` 覆盖。

若要将现有自托管文件和访客链接交给首位 SaaS 用户，启用前设置 `SAAS_BOOTSTRAP_EMAIL` 为该用户 Google 账号的邮箱。该账号首次登录后会一次性认领旧数据，随后应移除此变量。旧云便签仍保留在原 KV 命名空间；SaaS 账号的便签会使用独立命名空间，不会与其他用户共享。

托管版套餐额度定义在 `src/lib/saas.ts`。Free 包含 1 GiB 存储、单文件最大 100 MiB、文件最长保存 30 天、5 条云便签（每条 32 KiB）、每个账号每月 500 次 API Key 请求（每分钟最多 10 次）、1 个 API Key 和 3 个有效访客上传链接。Pro 为月付 $5 或年付 $50，包含 5 GiB 存储、单文件最大 1 GiB、最长保存 365 天、20 条云便签（每条 128 KiB）、每账号每月 5,000 次 API Key 请求（每分钟最多 60 次）、3 个 API Key 和 20 个有效访客上传链接。Waffo 商品应配置为 USD $5/月和 $50/年，并将 `WAFFO_CURRENCY` 设为 `USD`；结账会按配置的商品 ID 收费。API 请求额度由账号下所有 Key 共享；网页登录操作不计入。云便签用于配置片段、命令等小文本，较大内容请作为文件上传。需要更大容量、更高 API 用量或内网访问时，可按客户自己的 Cloudflare 账号提供私有化部署；其他基础设施方案需单独评估适配。

2. 发布：

```bash
npx wrangler deploy
```

## 6.1 Docker 容器部署（仅本地运行时）

该模式不依赖 Cloudflare 远端资源，使用容器内本地 D1/R2，数据持久化到容器目录 `/data`（建议挂载卷）。

```bash
docker build -t picoshare-ts:local .
docker run --rm -it \
  -p 8787:8787 \
  -v $(pwd)/.docker-data:/data \
  picoshare-ts:local
```

访问：`http://localhost:8787`

## 7. 常用命令

- 列出 D1：
```bash
npx wrangler d1 list
```
- 查看 R2 Bucket：
```bash
npx wrangler r2 bucket list
```
- 查看已部署 Worker：
```bash
npx wrangler deployments list
```

## 8. 安全注意事项

- `wrangler.toml`、`.dev.vars` 含敏感配置，不应提交到仓库。
- 仅提交 `wrangler.toml.example`、`.dev.vars.example`。
- 密钥泄露后请立即更换 `PS_SHARED_SECRET`。
- 若仅文件分享可不使用 Clips，但启用 `/clips` 必须配置 `CLIPBOARD` KV 绑定。
