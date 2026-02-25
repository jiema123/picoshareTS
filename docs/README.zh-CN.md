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
```

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
