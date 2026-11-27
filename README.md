<div align="center">

# 小说工具箱 · Novel Toolkit

**面向 VS Code 的朱墨主题小说抓取、校对、排版整理与章节导航工作台**

<p>
  <a href="https://github.com/ElmaTony/novel-toolkit/releases/latest">
    <img src="https://img.shields.io/badge/Release-VSIX%20%E9%80%9A%E7%94%A8%20%2F%20%E5%A4%9A%E5%B9%B3%E5%8F%B0-2A2622?style=flat-square" alt="Latest Release" />
  </a>
  <img src="https://img.shields.io/badge/VS%20Code-1.70%2B-6C6459?style=flat-square" alt="VS Code 1.70+" />
  <img src="https://img.shields.io/badge/Runtime-Pure%20JavaScript-837A6D?style=flat-square" alt="Pure JavaScript" />
  <img src="https://img.shields.io/badge/Theme-%E6%9C%B1%E5%A2%A8%E5%B7%A5%E4%BD%9C%E5%8F%B0%20%E5%AE%A3%E7%BA%B8%2F%E5%A4%9C%E5%A2%A8-B03A28?style=flat-square" alt="Vermilion Ink Workbench Theme" />
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-6A645B?style=flat-square" alt="MIT License" />
  </a>
</p>

<p>
  <strong>简体中文</strong> · <a href="README.en.md">English</a>
</p>

<p>
  <a href="https://github.com/ElmaTony/novel-toolkit/releases/latest">下载最新版</a> ·
  <a href="#核心特性">核心特性</a> ·
  <a href="#快速上手">快速上手</a> ·
  <a href="#朱墨工作台">朱墨工作台</a> ·
  <a href="#小说抓取">小说抓取</a> ·
  <a href="#开发者指南">开发者指南</a>
</p>

</div>

---

## 核心特性

<table>
  <tr>
    <td width="50%">
      <strong>🖌️ 朱墨工作台与深浅主题</strong><br />
      以墨色为主、朱色作批注：问题计数、当前章节与焦点用朱色标出，其余保持安静。提供「宣纸」浅色与「夜墨」深色，可跟随 VS Code 或手动切换；宽面板自动分为工具栏与目录双栏，全部资源离线分发。
    </td>
    <td width="50%">
      <strong>🔍 文本校对与章节导航</strong><br />
      精准定位行首空白、汉字间半角空格、行尾空格、标点短行与行内引号不配对；支持按卷分组、章节搜索、当前章高亮及缺章/重号检查。
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>✨ 一键排版与繁简转换</strong><br />
      内置段内换行合并、缩进规范、空行整理、章节号转汉字、省略号与引号整改、全角转半角，以及基于 OpenCC 的小说语境繁简转换与转换清单。
    </td>
    <td width="50%">
      <strong>📥 cool18 与 Pixiv 小说抓取</strong><br />
      统一任务队列、真实进度、随时取消与最近 50 条抓取历史；支持 cool18 爬全本/搜索与 Pixiv 单篇/系列/作者增量更新，强制重抓先下载后备份替换。
    </td>
  </tr>
</table>

---

## 快速上手

### 下载与安装

要求 **VS Code 1.70 或更新版本**。插件为纯 JavaScript 实现，无需安装 Python 或额外运行时。

1. 前往 [GitHub Releases](https://github.com/ElmaTony/novel-toolkit/releases/latest) 下载一个 `.vsix` 安装包（不确定平台时直接选通用包）：

| 安装包 | 适用平台 | 说明 |
| --- | --- | :---: |
| `novel-toolkit-<版本>.vsix` | Windows / macOS / Linux | 通用包（推荐） |
| `novel-toolkit-win32-x64-<版本>.vsix` | Windows x64 | 平台包 |
| `novel-toolkit-darwin-arm64-<版本>.vsix` | macOS Apple Silicon（M 系列） | 平台包 |
| `novel-toolkit-darwin-x64-<版本>.vsix` | macOS Intel | 平台包 |
| `novel-toolkit-linux-x64-<版本>.vsix` | Linux x64 | 平台包 |

2. 在 VS Code 命令面板执行 `Extensions: Install from VSIX...` 选择该文件，或直接将 `.vsix` 拖入扩展面板。
3. 安装或更新完成后执行 `Developer: Reload Window` 使新版本生效。

> [!TIP]
> **从源码本地安装**：在仓库根目录运行 `npm run update`（需要 Node.js 与可用的 `code` 命令），脚本会自动打包、强制安装到本机 VS Code、校验版本并清理临时文件。

### 推荐整理流程

检查只标记问题，不修改正文；当前文件的正文整理支持 `Ctrl+Z` 撤销，文件夹批量整理会直接写入磁盘并默认保留 `.bak` 备份。

| 步骤 | 操作 | 核心细节 |
| :---: | --- | --- |
| **1** | **打开或抓取文稿** | 打开本地 `.txt`，或通过抓取页从 cool18 / Pixiv 下载小说到本地目录 |
| **2** | **合并段内换行** | 保留原有段首缩进再合并；插件结合段首缩进、句末标点与对话引号识别段落边界 |
| **3** | **核对短行与引号** | 用「标点短行」（`Alt+F7`）和「引号配对」检查合并后是否残留孤立标点或漏闭合引号 |
| **4** | **去除缩进并查空白** | 先「去除行首缩进」，再用「空白」检查（`Alt+F8`）逐一清理行首空白、汉字间半角空格与行尾空格 |
| **5** | **核对章节与编号** | 通过章节目录核对分卷结构，运行「检查缺章与重复」，按需执行「章节号转汉字」 |
| **6** | **转换与最终排版** | 按需执行繁简、省略号、直角引号与全角转换，插入章节前空行，最后「添加首行缩进」并保存 |

> [!NOTE]
> 默认在**保存文件**或**添加首行缩进**后清空诊断并暂停自动检查，避免缩进触发满屏警告。执行「检查全文」或按 `Alt+F8` 即可立即恢复；保存后的暂停行为可在设置中关闭 `novelToolkit.silenceAfterSave`。

---

## 朱墨工作台

按 `Alt+F10` / `Alt+F11` 或点击状态栏的 **小说工具箱** 打开面板。页眉集成「整理 / 抓取」标签，右上角主题按钮在 **跟随 VS Code / 宣纸 / 夜墨** 之间循环切换（图标随当前模式变化），设置按钮直达本插件配置。面板宽度不小于 640px 时，整理页自动分为左侧工具栏与右侧全高目录；窄面板时上下排列，目录只在自身区域内滚动，光标移动不会带动整个面板。

| 外观模式 | 纸面 / 强调色 | 风格定位 |
| --- | :---: | --- |
| **宣纸（浅色）** | `#F4F0E6` · `#B03A28` | 米黄宣纸配墨黑主按钮，朱砂色只用于批注与当前位置 |
| **夜墨（深色）** | `#181715` · `#E2745D` | 暖调炭黑底配米白文字与柔和朱色，夜间校对不刺眼 |
| **跟随 VS Code** | 自动适配（含高对比度主题） | 默认模式，随编辑器外观实时切换 |

### 整理页能力一览

| 区域 | 功能说明 |
| --- | --- |
| **文件栏** | 显示当前文件名与保存状态（未保存时以琥珀色圆点提示），点击文件名可直接重命名同目录文件 |
| **校对** | 三张计数卡汇总「空白（行首 + 正文空格）」「标点短行」「引号配对」，有问题显示朱色数字、通过显示绿色 ✓，左右箭头跳至上/下一处；自动检查暂停时显示「恢复检查」提示条 |
| **整理 · 段落** | 按推荐流程排列：`合并段内换行`、`去除行首缩进`、`消除空白行`、`章节前插空行`、`添加首行缩进` |
| **整理 · 文字** | `繁体转简体`（附字词替换次数与行号清单）、`省略号整改`、`直角引号替换`、`全角转半角` |
| **整理 · 章节与批量** | `检查缺章重复`、`章节号转汉字`、`批量整理文件夹`；整理区可折叠，折叠状态会被记住 |
| **目录** | 自动识别卷与章，卷标题吸顶；支持搜索过滤（回车跳到首个匹配、Esc 清空）、当前章朱色高亮、定位当前章、上一章/下一章与点击跳转 |

> 引号配对按单行顺序匹配开合引号（可检出闭前开后）并豁免英文缩写撇号，建议在合并段内换行后使用。章节识别、段落合并与繁简转换含启发式规则，处理后建议结合原文抽查核对。

---

## 小说抓取

抓取页可切换 **Pixiv 小说** 与 **cool18 书屋** 来源，两者共用单任务闸门（同一时间运行一个抓取或搜索任务）。底部任务栏展示真实进度及完成/失败结果，提供 **取消**、**日志** 与 **最近 50 条抓取历史**。

### Pixiv 小说

支持单篇、系列、作者主页及旧式 `novel/show.php?id=...` 链接。多个链接可直接多行粘贴；**裸数字仅支持单个输入**：

| 入口 | 裸数字的含义 |
| --- | --- |
| **开始抓取** 或普通 Pixiv 抓取命令 | 单篇小说 ID |
| **作者全量…** | 作者 ID |

- **路径与命名隔离**：默认输出到 `~/Novels/pixiv`。作者目录带作者 ID、单篇文件带作品 ID、系列目录带系列 ID，避免同名作品或作者互相覆盖。系列包含编号章节文件、`_合并.txt`，以及可选的原始链接注记与 `.meta.json` 元数据；正文采用 UTF-8 与 CRLF 换行。
- **进度记录与自愈**：`pixiv-manifest.json` 采用相对路径记录已抓作品与系列进度，并兼容读取旧版目录记录。重新抓取系列时自动跳过已有正常正文、重试失败章、补抓缺失文件或确认正文为空的空壳文件，保留正常短正文。「增量更新」既检测系列总章数增长，也会自动续传上次中途取消或有失败章节的未完成系列。
- **安全强制重抓**：普通抓取跳过同名正文文件；勾选 **强制重抓** 后，先下载目标正文，**下载成功后**才将同名旧文件备份为带时间标记的 `.bak` 再替换，**下载失败或取消时保留原文件**，且绝不删除整个系列目录。输出路径越界或包含符号链接/目录联接（含断链）时拒绝写入。
- **Cookie 与受限作品**：需要登录的作品与作者作品列表依赖 Cookie。通过「管理 Cookie」保存 `PHPSESSID` 值或整段 Cookie（输入 `CLEAR` 可清除已存私密 Cookie），存入 VS Code 私密存储（不写入明文设置）。受限作品同时要求账号具备对应访问权限与显示设置；空正文记为失败，系列连续 3 章空正文时自动熔断停止，处理后可续传。

### cool18 书屋

输入帖子链接或帖子 ID，每行一条；也支持站内关键词搜索多选抓取，或通过「当前文件链接」抓取选中文本/当前文件中的链接。

- **爬全本与列表模式**：单个输入自动从首帖出发跟随帖内章节链接遍历（不保证发现站内全部未互联帖子）；多个输入按给定列表顺序抓取。
- **排序、去重与缺章提示**：自动遍历按卷、章及上/中/下部序排序，同章同部序重复帖保留正文较长的一份，并在结束时提示检测到的编号缺口。
- **输出与重试策略**：默认输出到 `~/Novels/cool18/<首个输出帖子标题>/`，生成 `001_帖子标题.txt` 等单帖文件；抓到多帖时额外生成合集（如 `书名【完】作者：作者名.txt` 或 `书名【1-最新章号】作者：作者名.txt`）。输出为 UTF-8 BOM 与 CRLF，同名既有文件跳过。默认保守清理明确站点广告/签名行并将删除记录写入日志；单页默认最多尝试 4 次，自动遍历失败页额外排队重试 2 轮（计入访问上限），取消时已获取的帖子照常落盘。

### 代理设置

cool18 与 Pixiv 的默认 HTTP 代理均为 **`http://127.0.0.1:7897`**（配置项为 `novelToolkit.cool18Proxy` 与 `novelToolkit.pixivProxy`，支持省略 `http://` 前缀及 `http://user:pass@host:port` 代理鉴权）。

> [!IMPORTANT]
> 在设置中将 `novelToolkit.cool18Proxy` / `novelToolkit.pixivProxy` 显式清空为空字符串 `""` 即可直连。仅当新配置项未被显式设置时，才会回退读取旧插件命名空间 `cool18Novel.proxy` / `pixivNovel.proxy`，均未设置时使用默认代理 `http://127.0.0.1:7897`（实际连接方式可在抓取日志中核对）。

---

<details>
<summary><strong>⌨️ 快捷键速查</strong></summary>

<br />

| 快捷键 | 功能 |
| --- | --- |
| `Alt+F7` / `Shift+Alt+F7` | 下一处 / 上一处标点短行 |
| `Alt+F8` / `Shift+Alt+F8` | 下一处 / 上一处空白问题（覆盖行首空白、汉字间半角空格与行尾空格） |
| `Alt+F9` / `Shift+Alt+F9` | 下一章 / 上一章（含卷名行） |
| `Alt+F10` / `Alt+F11` | 打开小说工具箱面板 |

> 引号配对跳转可通过面板按钮或命令面板运行，默认不占用全局快捷键。

</details>

<details>
<summary><strong>📁 文件夹批量整理与内部解码说明</strong></summary>

<br />

从整理区「章节与批量」或命令面板执行 **批量整理文件夹**，递归处理目录下全部 `.txt`（不跟随符号链接或目录联接，同一时间仅运行一个批量任务）：

- **处理流水线**：依次执行合并段内换行 → 去除行首缩进 → 添加首行缩进；文本有改动或原文件为非 UTF-8 编码（GB18030 / Big5 / UTF-16）时原子写盘为 UTF-8 与 CRLF（保留原文件既有的 UTF-8 BOM，无 BOM 文件不额外注入 BOM），0 字节空文件不改写。
- **备份与取消**：`novelToolkit.batchBackup` 默认开启，首次改写前创建 `原文件.txt.bak`（已有备份绝不覆盖）；支持随时取消，当前文件处理完毕后停止并保留已完成结果与备份。
- **大文件与并发安全**：超过 512 KB 的文件在后台工作线程计算变换，落盘前核对文件未被外部修改。
- **内部解码边界**：批量整理与抓取仍会在内部读取并解码常见中文文本（优先保留合法 UTF-8，支持 UTF-8 BOM / UTF-16 LE & BE / GB18030 / Big5）；解码出现替换字符（`U+FFFD`）或 `NUL` 时自动跳过并保留原文件，将路径写入日志供复核。
- **已精简功能说明**：插件不再提供独立编码检测、当前文件转码、批量转码、中文编码自动识别设置及启动引导，也不会修改用户已有的 VS Code 编码配置。

</details>

<details>
<summary><strong>⚙️ 设置项一览（前缀 <code>novelToolkit.</code>）</strong></summary>

<br />

在 VS Code 设置中搜索 **Novel Toolkit** 即可配置，所有修改即时刷新诊断与面板（大文件与超长单行的诊断、目录分析在后台线程执行并按文档版本缓存）：

| 类别 | 设置项 |
| --- | --- |
| **自动检查** | `enabled`、`ignoreBlankLines`、`excludedLanguages`、`silenceAfterSave` |
| **短行与引号** | `shortLineCheck`、`shortLineMaxChars`、`quotePairCheck` |
| **段落合并** | `indentStartsParagraph`、`smartParagraphs`、`keepBlankLines` |
| **缩进与章节** | `indentString`（默认两全角空格）、`indentSkipChapterTitles`、`indentNormalizeExisting`、`chapterPattern`（留空使用内置识别） |
| **批量备份** | `batchBackup` |
| **cool18** | `cool18OutputRoot`、`cool18Proxy`、`cool18Delay`、`cool18MaxPages`、`cool18MaxRetries`、`scrapeCleanAds` |
| **Pixiv 连接** | `pixivOutputRoot`、`pixivCookie`、`pixivProxy`、`pixivIntervalMs`（默认 `1200` ±30% 抖动）、`pixivConcurrency`（请求层并发上限 1–3，当前流程串行下载）、`pixivMaxRetries` |
| **Pixiv 输出** | `pixivPageSeparator`、`pixivRubyKeep`、`pixivSaveUrlNote`、`pixivSaveMeta`、`pixivRawCache` |

> 输出目录与明文 Cookie 保留旧插件配置（`pixivNovel.*` / `cool18Novel.*`）兜底，但旧插件私密存储中的 Cookie 不互通，首次迁移需重新通过「管理 Cookie」设置一次。

</details>

---

## 开发者指南

需要 **VS Code 1.70+** 与 **Node.js**。版本演变见 [更新记录（CHANGELOG.md）](CHANGELOG.md)。

<details>
<summary><strong>🛠️ 测试、接线审计与本地安装</strong></summary>

<br />

| 命令 | 用途 |
| --- | --- |
| `npm test` | 运行 `node test/run-all.js`，执行语法、引擎、离线抓取、面板、批量、命令与回归全部测试套件 |
| `node test/wiring-audit.js` | 校验命令注册、`package.json` 声明、快捷键、设置项读取与面板消息白名单一致性 |
| `npm run update` | 打包本地 VSIX、自动安装到本机 VS Code、核对版本并清理临时目录 |

> 抓取测试使用离线样例与模拟响应，用于验证解析、排序、续传与边界逻辑，不代表已验证外部站点当前线上可用性。

</details>

<details>
<summary><strong>🗂️ 项目目录结构</strong></summary>

<br />

```text
novel-toolkit/
├── extension.js          # 扩展入口：服务装配、命令注册与编辑器事件监听
├── package.json          # 扩展清单：命令、快捷键、设置项声明
├── src/
│   ├── core/             # 编辑器共享操作（行读取、整篇替换、问题跳转）
│   ├── commands/         # 按领域拆分的命令模块（整理、导航、文件、批量、抓取）
│   ├── engine/           # 纯逻辑引擎：文本变换、章节识别、内部解码、繁简转换、后台线程与 cool18/Pixiv 抓取
│   ├── service/          # 诊断检查、抓取任务调度、文件夹批量处理服务
│   └── ui/               # 朱墨工作台 Webview 页面、交互脚本与消息协议
├── scripts/              # OpenCC 字表生成脚本（gen-zh-data.js）与本地安装脚本（update.js）
└── test/                 # 语法、引擎、面板、批量、命令、接线审计与回归测试套件
```

</details>

---

<div align="center">
  基于 <a href="LICENSE">MIT License</a> 开源 · 繁简字表基于 OpenCC（Apache-2.0）数据并补充小说场景规则
</div>
