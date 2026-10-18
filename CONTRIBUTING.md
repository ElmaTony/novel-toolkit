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
node test/run-all.js        # 引擎 + cool18 + 面板
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
