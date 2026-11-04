# PicoShare CLI + Agent Skill 工具包

此工具包包含 PicoShare 命令行、可安装到常见 Agent 环境的 `picoshare` Skill，以及可单独下载的 AI 提示词示例。

## 环境要求

- Node.js 20 或更新版本
- npm
- PicoShare 账户 API Key

## 安装

下载并解压 ZIP 或 tar.gz，在解压后的目录运行：

```sh
sh install.sh
```

安装程序会安装 `picoshare` 命令，并将 Skill 安装到 Codex、Claude、Hermes、OpenCode、OpenClaw 和通用 `.agents` Skill 目录。安装文件保存在 `~/.local/share/picoshare/releases/<version>`。本地安装、不注册全局命令：

```sh
sh install.sh --local
```

配置 API 站点和 Key：

```sh
export PICOSHARE_BASE_URL="https://你的 PicoShare 域名"
export PICOSHARE_API_KEY="你的账户 API Key"
picoshare --help
```

生产环境建议将 API Key 放入 shell Secret、Agent Secret 或操作系统凭据库，不要写进公开仓库或命令行历史。

## 常用命令

```sh
picoshare files upload ./report.pdf --note "版本评审" --expires 30
picoshare files list --search "设计稿"
picoshare files share FILE_ID
picoshare files download FILE_ID --output ./downloads/report.pdf
picoshare notes list
picoshare notes get deploy-checklist
picoshare notes put deploy-checklist --file ./steps.md
picoshare notes share deploy-checklist
```

完整参数通过 `picoshare --help` 查看。云便签覆盖和文件删除具有破坏性，CLI 会要求显式确认参数。

## Agent 使用

在 Agent 的安全配置中设置 `PICOSHARE_BASE_URL`、`PICOSHARE_API_KEY`。安装 Skill 后，可用自然语言要求 Agent 上传、搜索文件、读取云便签或生成分享链接。提示词模板在 `PROMPTS.md`；API 字段和边界说明在 `.agents/skills/picoshare/references/api.md`。
