# 小说工具箱 Novel Toolkit

在 VS Code 中抓取、整理和校对小说文本：支持空白与标点检查、段落排版、章节导航、繁简转换，以及 cool18 书屋和 Pixiv 小说抓取。

检查只标记问题，不修改正文。当前文件的正文整理可用 `Ctrl+Z` 撤销；文件夹批量整理会直接写入磁盘，默认保留 `.bak` 备份。

## 安装

从 [最新发行版](https://github.com/ElmaTony/novel-toolkit/releases/latest) 下载一个 `.vsix` 安装包。

| 安装包 | 适用平台 |
| --- | --- |
| `novel-toolkit-<版本>.vsix` | 通用包，Windows / macOS / Linux 均可使用，推荐选择 |
| `novel-toolkit-win32-x64-<版本>.vsix` | Windows x64 |
| `novel-toolkit-darwin-arm64-<版本>.vsix` | macOS Apple Silicon（M 系列芯片） |
| `novel-toolkit-darwin-x64-<版本>.vsix` | macOS Intel |
| `novel-toolkit-linux-x64-<版本>.vsix` | Linux x64 |

在 VS Code 命令面板执行 `Extensions: Install from VSIX...`，选择下载的文件；也可拖入扩展面板。安装或更新后执行 `Developer: Reload Window`。

要求 VS Code 1.70 或更新版本。插件使用 JavaScript，无需安装 Python 或额外运行时。源码本地安装可在仓库根目录执行 `npm run update`，需要 Node.js 和可用的 `code` 命令。

## 工具面板

按 `Alt+F10` / `Alt+F11`，或点击状态栏的“小说工具箱”打开面板。面板采用“纸墨工作台”主题：暖白纸面、松绿强调色与配套深色界面。右上角主题按钮可在跟随 VS Code、浅色和深色之间切换，设置按钮可打开插件设置。

### 整理

- 文件名可点击重命名，并显示保存状态；检查结果以三行呈现，空白计数包含行首和正文，旁边可直接跳转问题行。
- 正文整理：合并段内换行、消除空白行、去除或添加缩进、章节名前插入空行、章节号转汉字、省略号整改。
- “更多处理”中提供繁体转简体、全角转半角、直角引号替换、章节号统一、章节前空行、缺章检查和文件夹批量整理。繁简转换后可查看字词替换次数和行号。
- 检查与跳转：行首空白、汉字间半角空格、行尾空格、标点短行、行内引号开合数量，以及按卷检查章节缺失和重复编号。
- 章节列表支持按卷分组、搜索、当前章节高亮及点击跳转。

引号检查以单行为单位比较开合数量，适合合并段内换行后使用。章节识别、段落合并和繁简转换包含启发式规则，处理后可结合原文核对。

### 推荐整理顺序

1. 抓取小说或打开本地 `.txt`。
2. 保留原有段首缩进，先合并段内换行；缩进和句末标点用于判断段落边界。
3. 用标点短行和引号检查核对合并结果。
4. 去除行首缩进，再检查行首、正文和行尾空格。
5. 核对章节列表、编号缺失和重复情况，按需统一章节号。
6. 按需进行繁简、标点、全角转换，插入章节前空行，最后添加首行缩进。

默认在保存或添加缩进后清空诊断并暂停自动检查。运行“全文检查”或按 `Alt+F8` 可恢复；保存后的暂停行为可通过 `silenceAfterSave` 关闭。

## 小说抓取

抓取页可切换 Pixiv 和 cool18 来源，两者共用任务入口，同一时间运行一个抓取任务。底部显示真实任务进度及完成或失败结果，提供取消、日志和最近 50 条抓取历史；输出目录与强制重抓选项位于相应来源页面。

### cool18 书屋

输入帖子链接或帖子 ID，每行一条。单个输入会自动跟随帖内章节链接；多个输入可按列表顺序抓取。“爬全本”从第一个输入出发遍历链接，不代表能发现站点中所有相关帖子。可用搜索选择帖子，或通过“抓当前文件链接”按列表抓取选中内容或全文中的链接。

自动遍历会按卷、章及上中下部序排序，同章同部序的重复帖保留正文较长的一份，并提示检测到的编号缺口。未相互链接的章节可能需要手动补入列表。

默认输出根目录为 `~/Novels/cool18`，每次输出到以首个输出帖子标题命名的子目录：

- 单帖文件：`001_帖子标题.txt`、`002_帖子标题.txt` 等。
- 抓到多个帖子时生成合集，如 `书名【完】作者：作者名.txt` 或 `书名【1-最新章号】作者：作者名.txt`；名称根据帖子标题推断。
- 文本采用 UTF-8 BOM 和 CRLF 换行，同名现有文件会跳过。

默认清理明确的站点广告和签名行，删除记录写入日志。单页请求默认最多尝试 4 次；自动遍历模式下，失败页还会额外排队重试两轮。

### Pixiv 小说

支持小说、系列、作者链接，包括旧式 `novel/show.php?id=...` 链接。多个链接可一起粘贴；裸数字仅支持单个输入。

| 入口 | 裸数字的含义 |
| --- | --- |
| “开始抓取”或普通 Pixiv 抓取命令 | 单篇小说 ID |
| “作者全量…” | 作者 ID |

默认输出根目录为 `~/Novels/pixiv`：单篇放在作者目录下，系列放在作者目录下的系列子目录中。系列包含编号章节文件和 `_合并.txt`，可选保存原始链接注记和 `.meta.json` 元数据。输出文本采用 UTF-8 和 CRLF 换行。

`pixiv-manifest.json` 记录已抓作品和系列进度。重新抓取系列时会跳过正常存在的章节，重试失败章，并补抓缺失文件或空壳文件。“增量更新”按系列总章数增长判断是否有新章；章数没变但本地缺章时，请重新抓取该系列。

普通抓取跳过同名正文文件；系列 `_合并.txt`、manifest 和可选元数据会更新，确认是空壳的章节文件可重新写入。勾选“强制重抓”会先删除目标单篇文件，或删除整个系列目录及其抓取记录，再重新下载。系列目录中的手动修改也会被删除，使用前请备份。

需要登录的作品及作者作品列表可能依赖 Cookie。使用“Cookie…”保存 PHPSESSID 值或完整 Cookie，插件会存入 VS Code 私密存储。受限作品还需要账号具备相应访问权限和显示设置；空正文会记录为失败，系列连续三章空正文时停止继续下载。取消后可重新抓取系列，沿用已保存的章节进度。

### 代理设置

cool18 和 Pixiv 的默认 HTTP 代理均为 `http://127.0.0.1:7897`，使用前需确保该地址有可用的代理服务，也可设置为自己的 HTTP 代理地址。

配置分别为 `novelToolkit.cool18Proxy` 和 `novelToolkit.pixivProxy`。新配置留空时会读取旧插件的 `cool18Novel.proxy` / `pixivNovel.proxy`；旧项未设置时仍回退到默认代理。因此，仅清空新项不一定会直连。需要直连时，将新项和对应旧项都显式设为空字符串。以抓取运行日志和实际配置为准。

## 文件夹批量整理

从“更多处理”或命令面板运行“批量整理文件夹”，递归处理 `.txt`，不跟随符号链接或目录联接。

- 批量整理依次执行合并段内换行、去缩进、添加首行缩进，有改动时写为 UTF-8 BOM 和 CRLF。
- `batchBackup` 默认开启，首次改写前保存 `原文件.txt.bak`，已有备份不覆盖。
- 支持取消，当前文件处理完后停止，已完成的修改和备份保留；同一时间只运行一个批量任务。

批量整理仍会在内部读取和解码原文件，便于处理常见中文文本。插件不再提供独立编码检测、转码或自动识别设置，也不会在启动时引导修改 VS Code 的编码配置。此前已经修改的 VS Code 设置由用户自行管理。

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `Alt+F7` / `Shift+Alt+F7` | 下一处 / 上一处标点短行 |
| `Alt+F8` / `Shift+Alt+F8` | 下一处 / 上一处空白问题，覆盖行首、汉字间和行尾空格 |
| `Alt+F9` / `Shift+Alt+F9` | 下一章 / 上一章（含卷名行） |
| `Alt+F10` / `Alt+F11` | 打开工具面板 |

引号跳转可通过面板按钮或命令面板运行，没有默认全局快捷键。

## 设置

在 VS Code 设置中搜索“Novel Toolkit”。以下名称均加前缀 `novelToolkit.`。

| 类别 | 设置项 |
| --- | --- |
| 自动检查 | `enabled`、`ignoreBlankLines`、`excludedLanguages`、`silenceAfterSave` |
| 标点与引号检查 | `shortLineCheck`、`shortLineMaxChars`、`quotePairCheck` |
| 段落合并 | `indentStartsParagraph`、`smartParagraphs`、`keepBlankLines` |
| 缩进与章节 | `indentString`、`indentSkipChapterTitles`、`indentNormalizeExisting`、`chapterPattern` |
| 批量备份 | `batchBackup` |
| cool18 | `cool18OutputRoot`、`cool18Proxy`、`cool18Delay`、`cool18MaxPages`、`cool18MaxRetries`、`scrapeCleanAds` |
| Pixiv 连接 | `pixivOutputRoot`、`pixivCookie`、`pixivProxy`、`pixivIntervalMs`、`pixivConcurrency`、`pixivMaxRetries` |
| Pixiv 输出 | `pixivPageSeparator`、`pixivRubyKeep`、`pixivSaveUrlNote`、`pixivSaveMeta`、`pixivRawCache` |

默认缩进为两个全角空格。`chapterPattern` 留空使用内置识别；自定义正则未命中的行仍可能进入内置上下文识别。

Pixiv 请求起步间隔默认 1200ms 并带抖动，并发设置是请求层的上限；当前目标和章节下载流程依次执行，调高上限不保证加速。

输出目录和 Cookie 保留旧插件配置兜底。旧版 `pixivNovel.*` / `cool18Novel.*` 中的其他设置请在迁移时核对，当前命名空间的默认值可能优先生效。旧插件私密存储中的 Cookie 不互通，需要重新设置。

## 源码与测试

| 路径 | 职责 |
| --- | --- |
| `extension.js` | 服务装配、命令注册、编辑器事件 |
| `src/core/`、`src/commands/` | 编辑器工具和按领域拆分的命令 |
| `src/engine/` | 文本变换、章节识别、编码、繁简转换和站点抓取引擎 |
| `src/service/` | 诊断、抓取调度、批量处理与写盘 |
| `src/ui/` | Webview 页面、交互脚本与消息协议 |
| `test/` | 引擎、离线抓取、面板、批量及命令测试 |

运行 `npm test` 和 `node test/wiring-audit.js`。测试使用离线样例与模拟响应，不代表已验证站点当前可用性。

繁简字表基于 OpenCC（Apache-2.0）数据并补充小说场景规则。插件采用 [MIT 许可证](LICENSE)。版本变化见 [更新记录](CHANGELOG.md)。
