# 小说工具箱 Novel Toolkit

网文一站式工具箱：**贴左/短行检查**、**排版整理**、**章节导航**，以及内置的
**cool18 禁忌书屋抓取**与 **Pixiv 小说抓取**（由原独立插件合并而来）。
检查只读不改；整理类命令与抓取仅在主动触发时运行，整理均可 Ctrl+Z 撤销。

## 安装

从 [Releases](https://github.com/ElmaTony/novel-toolkit/releases) 下载 vsix
（通用包即可，Windows / macOS / Linux 通用），然后在 VSCode 中执行
`Extensions: Install from VSIX...` 选择文件，或直接拖入扩展面板。
安装后执行 `Developer: Reload Window` 生效。

开发自装：仓库根目录运行 `npm run update`（自动打包最新版并安装）。

## 工具面板（Alt+F10 或状态栏 📖 工具箱）

面板采用 **Claude CDS 暖调编辑感**（陶土橙强调色、暖灰表面阶梯、发丝细边、克制的弹簧动效），深浅色自动跟随 VSCode 主题。

面板分两个标签页：

**📖 整理** —— 排版流水线：
- 文件卡片：文件名 + 贴左/短行/章节三枚状态徽章（✓绿=干净，黄=有问题）；
- 一键整理按钮：合并段落内换行 / 消除空白行 / 去除行首缩进 / 添加首行缩进 /
  章节名前插入空行（首章除外）；
- 检查跳转：全文检查 + 空白、短行、章节三组 ‹ › 按钮；
- 章节列表：搜索过滤、当前章自动高亮、定位当前章、点击跳转。

**📥 抓取** —— 两个来源：
- **cool18 · 禁忌书屋**：粘贴帖子链接/ID（每行一个）→ 爬全本（跟随帖内
  章节链接，按章节区间排序）或按列表顺序批量；每本书输出到
  `cool18OutputRoot/<书名>/`（NNN_标题.txt + 合集.txt，UTF-8 BOM+CRLF）；
- **Pixiv 小说**：粘贴小说/系列/作者链接或裸 ID → 单篇/系列/作者全量抓取，
  增量更新已抓系列（manifest 沿用旧插件数据，已抓记录无缝衔接）；
  已抓系列清单直接显示在面板里。

底部任务条实时显示抓取进度，进行中可点"取消"；cool18 走代理抓取（默认
`http://127.0.0.1:7897` 可配置），Pixiv 默认直连（可配代理）。

## 处理一本网文的标准流程

1. 抓取（📥 抓取标签）或打开本地 txt；
2. 合并段落内换行（此时段首缩进还在，正好用来识别段落）；
3. `Alt+F7`/`Shift+Alt+F7` 清理合并残留的标点短行（只定位，自己删）；
4. 去除行首缩进（贴左），`Alt+F8`/`Shift+Alt+F8` 逐行核对；
5. `Alt+F9`/`Shift+Alt+F9` 或章节列表翻章核对；
6. 章节名前插入空行（可选）→ 批量添加首行缩进（　　）。

保存（Ctrl+S）清空警告并暂停检查（`silenceAfterSave` 可关）。

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `Alt+F7` / `Shift+Alt+F7` | 下一处 / 上一处标点短行 |
| `Alt+F8` / `Shift+Alt+F8` | 下一处 / 上一处行首空白 |
| `Alt+F9` / `Shift+Alt+F9` | 下一章 / 上一章 |
| `Alt+F10` / `Alt+F11` | 打开工具面板 |

## 设置（settings 搜 "Novel Toolkit"）

整理：`enabled` / `ignoreBlankLines` / `excludedLanguages` /
`silenceAfterSave` / `shortLineCheck` / `shortLineMaxChars` /
`indentStartsParagraph` / `smartParagraphs` / `keepBlankLines` / `indentString` /
`indentSkipChapterTitles` / `indentNormalizeExisting` / `chapterPattern`
（`chapterPattern` 留空 = 内置智能识别，支持中等长度、标题内 `！？…` 与上下文兜底）

Pixiv 抓取：`pixivOutputRoot`（留空默认 `~/Novels/pixiv`）、
`pixivCookie`（推荐用命令存到私密存储）、`pixivProxy`（留空=直连）、
`pixivIntervalMs`（1200ms ±30% 抖动）、`pixivConcurrency`（1-3）、
`pixivMaxRetries`、`pixivPageSeparator`、`pixivRubyKeep`、`pixivSaveUrlNote`、
`pixivSaveMeta`、`pixivRawCache`

cool18 抓取：`cool18OutputRoot`（留空默认 `~/Novels/cool18`）、
`cool18Proxy`（默认 http://127.0.0.1:7897）、`cool18Delay`（默认 1.0s，±20% 抖动）、
`cool18MaxPages`（300）、`cool18MaxRetries`（单页最多尝试 4 次，失败页额外排队重试两轮）、
`scrapeCleanAds`（默认 true；保守清理明确广告/签名行，删除内容写入抓取日志）

旧插件配置兼容：`pixivNovel.*` 和 `cool18Novel.*` 里已设置的值会自动兜底生效。

## 源码结构

```
novel-toolkit/
├── extension.js         入口：依赖装配 + 编辑器事件接线（命令已按领域拆出）
├── src/
│   ├── core/
│   │   └── editor.js    文档行读取、整篇替换、问题行跳转
│   ├── commands/
│   │   ├── navigation.js 检查/跳转/章节列表
│   │   ├── organize.js   合并/缩进/空行/章节号/标点/繁简
│   │   ├── encoding.js   编码检测/转码/自动识别
│   │   ├── files.js      文件重命名
│   │   ├── batch.js      文件夹批量整理/转码
│   │   └── scrape.js     抓取命令（两个来源）
│   ├── engine/
│   │   ├── chapters.js   章节名识别（严格正则 + 上下文兜底）
│   │   ├── transforms.js 文本变换与检测（纯函数）
│   │   ├── encoding.js   编码检测/解码
│   │   ├── zh-convert.js 繁简转换（OpenCC 数据驱动 + 简体零误伤）
│   │   ├── cool18/       parse + fetcher + core
│   │   └── pixiv/        fetcher/api/render/writer/parseInput/index
│   ├── service/
│   │   ├── checker.js    检查引擎（诊断/静音/防抖/状态栏）
│   │   ├── scrape.js     抓取调度：任务闸门/日志/配置回退/Cookie
│   │   └── batch.js      批量处理与原子写盘
│   └── ui/
│       ├── panel.js      面板管理（数据推送/光标跟踪/抓取消息）
│       ├── panel-html.js 面板 HTML/CSS
│       ├── panel-webview.js 面板行为脚本（data-* 事件委托）
│       └── messages.js   面板消息白名单
├── test/                 引擎/面板/接线/抓取测试
└── README.md
```
