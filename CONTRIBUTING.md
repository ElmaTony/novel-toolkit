# 贡献指南

## 开发环境

- Node.js（无外部依赖，无需 `npm install`）
- VSCode 扩展宿主
- Windows / macOS / Linux 均可，但 cool18 抓取在 Windows 下默认走本机代理

## 目录结构

```
extension.js              入口：依赖装配 + 编辑器事件接线
src/core/editor.js        共享编辑器工具
src/commands/             按领域拆分的命令模块
src/engine/               纯逻辑引擎（transforms/chapters/encoding/cool18/pixiv）
src/service/              checker / scrape / batch
src/ui/                   面板 HTML/CSS/JS 与面板管理
test/                     引擎 / 面板 / 接线 / 抓取测试
preview/                  面板视觉预览页（不影响插件运行）
scripts/update.js         打包并安装到 VSCode
```

## 测试

改完任何命令 / 设置 / 面板后，必跑：

```bash
node test/run-all.js        # 引擎 + cool18 + 面板 + 批量 + 命令
node test/wiring-audit.js   # 命令 / 设置 / 快捷键接线
```

## 打包安装

```bash
npm run update   # 等价于 node scripts/update.js
```

会自动 `vsce package` 并 `code --install-extension` 安装，之后在 VSCode 里 `Developer: Reload Window`。

## 提交约定

- 尽量小步提交，描述清楚改了什么
- 不要提交 `*.vsix`、`*.bak`、本地输出目录、Cookie 或个人路径
- 新增设置项时同步更新 `package.json` 和 `README.md`

## 发版流程（每次更新固定步骤）

用户已授权每次更新后自动完成测试、清理、安装到本机 VSCode、推送源码与版本标签，以及打包上传 GitHub Release。不要停在源码修改，也不要让用户再手动安装。完成后核实本地安装版本和远端发行版附件，保持工作树干净。具体工作约定见 `AGENTS.md`。

1. **改代码 → 测试**：`node test/run-all.js` + `node test/wiring-audit.js` 全绿
2. **升版本**：`package.json` version 递增，`CHANGELOG.md` 记一条
3. **打包安装**：`npm run update`（打包 + 安装到 VSCode），`Developer: Reload Window` 验证
4. **推送源码**（git 必须挂代理，直连会 502）：
   ```bash
   git add -A && git commit -m "..."
   git -c http.proxy=http://127.0.0.1:7897 push origin main
   ```
5. **打标签推送**：
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z 一句话说明"
   git -c http.proxy=http://127.0.0.1:7897 push origin main --tags
   ```
6. **发行版**（GitHub Release，API 也要挂代理 `-x http://127.0.0.1:7897`）：
   - `npx vsce package` 打通用包 + 4 个平台包（win32-x64 / darwin-x64 / darwin-arm64 / linux-x64）
   - **隐私审计**：解包 `unzip -l` 列全部文件 + grep 本地路径/token/cookie，确认只有插件代码
   - GitHub API 创建 Release（tag 指向新版本）并上传 5 个 vsix
7. **清理**：删 `*.vsix`、`tmp-*/` 等临时产物，`git status` 确认工作树干净

### 隐私红线（每次发行前必查）

- 不得包含：本地输出路径（F:\Telegram...）、任何 token/cookie、测试抓取产物、`tmp-*` 目录
- `.vscodeignore` 已排除 `tmp-*/`，打包后仍要解包抽查
- 面板 UI 文案避免使用站点全名
