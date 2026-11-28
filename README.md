<div align="center">

# 小说工具箱 · Novel Toolkit

**面向中文网文阅读、校对、排版整理与离线归档的 VS Code 朱墨主题工作台**

<p>
  <a href="https://github.com/ElmaTony/novel-toolkit/releases/latest">
    <img src="https://img.shields.io/badge/Release-VSIX%20%E9%80%9A%E7%94%A8%20%2F%20%E5%A4%9A%E5%B9%B3%E5%8F%B0-2A2622?style=flat-square" alt="Latest Release" />
  </a>
  <img src="https://img.shields.io/badge/VS%20Code-1.70%2B-6C6459?style=flat-square" alt="VS Code 1.70+" />
  <img src="https://img.shields.io/badge/Runtime-Pure%20JavaScript%20%C2%B7%20Zero%20Deps-837A6D?style=flat-square" alt="Pure JavaScript" />
  <img src="https://img.shields.io/badge/Theme-%E6%9C%B1%E5%A2%A8%E5%B7%A5%E4%BD%9C%E5%8F%B0%20%E5%AE%A3%E7%BA%B8%2F%E5%A4%9C%E5%A2%A8-B03A28?style=flat-square" alt="Vermilion Ink Workbench" />
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-6A645B?style=flat-square" alt="MIT License" />
  </a>
</p>

<p>
  <strong>简体中文</strong> · <a href="README.en.md">English</a>
</p>

<p>
  <a href="#核心特性">核心特性</a> ·
  <a href="#快速上手">快速上手</a> ·
  <a href="#朱墨工作台">朱墨工作台</a> ·
  <a href="#文本校对与整理">文本校对与整理</a> ·
  <a href="#小说抓取与归档">小说抓取与归档</a> ·
  <a href="#批量整理与编码处理">批量整理与编码处理</a> ·
  <a href="#参考速查">参考速查</a> ·
  <a href="#开发者指南">开发者指南</a>
</p>

</div>

---

## 核心特性

<table>
  <tr>
    <td width="50%">
      <strong>🖌️ 朱墨双栏工作台</strong><br />
      以墨色作纸笔基底、朱砂仅作批注与当前焦点：内置「宣纸」浅色与「夜墨」深色主题，并支持跟随 VS Code 与高对比度自动适配；面板宽 ≥ 640px 自动切换为左工具栏 + 右全高目录双栏，标签页支持方向键无障碍切换，全部资源离线内嵌。
    </td>
    <td width="50%">
      <strong>🔍 四维校对与精确导航</strong><br />
      精准检出行首空白（区分半角空格 / Tab / BOM / 全角空白）、汉字间半角空格（豁免章节头正常分隔空格）、行尾空格、标点短行与行内顺序引号配对（豁免 <code>don’t</code> 等英文撇号）；严格区分未检查、扫描中、失败、已静音与已通过状态，支持逐处精确列选区跳转及分卷目录/缺章重号检查。
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>✨ 一键排版与小说语境繁转简</strong><br />
      支持智能段落折行合并、缩进规范、空行清理、章节前单空行归一、章节号与卷号一次转汉字、省略号整改（保留人名/数字间隔号）、直角引号换弯引号、双模式全角转半角，以及基于 OpenCC 全量表与网文规则的繁转简，输出字词频次、行号与真实专名保护清单。
    </td>
    <td width="50%">
      <strong>📥 Pixiv &amp; cool18 抓取与文件夹批处理</strong><br />
      统一单任务队列、实时进度条、随时取消、运行日志与 50 条历史记录；Pixiv 支持私密 Cookie 存储、断点自愈续传与安全备份强制重抓；cool18 支持自动爬全本、搜索多选与三级排序去重；支持多编码自动解码及大文件后台线程原子批处理。
    </td>
  </tr>
</table>

---

## 快速上手

### 安装插件

要求 **VS Code 1.70 或更新版本**。插件为纯 JavaScript 零外部依赖实现，无需配置 Python 或其他运行时。

1. 前往 [GitHub Releases](https://github.com/ElmaTony/novel-toolkit/releases/latest) 下载对应 `.vsix` 安装包（不确定平台时推荐直接下载通用包）：

| 安装包 | 适用平台 | 说明 |
| --- | --- | :---: |
| `novel-toolkit-<版本>.vsix` | Windows / macOS / Linux | 通用包（推荐） |
| `novel-toolkit-win32-x64-<版本>.vsix` | Windows x64 | 平台构建 |
| `novel-toolkit-darwin-arm64-<版本>.vsix` | macOS Apple Silicon（M 系列） | 平台构建 |
| `novel-toolkit-darwin-x64-<版本>.vsix` | macOS Intel | 平台构建 |
| `novel-toolkit-linux-x64-<版本>.vsix` | Linux x64 | 平台构建 |

2. 在 VS Code 命令面板运行 `Extensions: Install from VSIX...` 选择安装包，或直接将 `.vsix` 拖入扩展视图。
3. 安装或更新完成后执行 `Developer: Reload Window` 使新版本生效。

> [!TIP]
> **从源码本机安装**：在仓库根目录运行 `npm run update`（需要 Node.js 与可用的 `code` CLI），脚本会自动打包 VSIX、强制安装到本机 VS Code、核对已安装版本并清理临时产物。

### 推荐六步校排流程

检查操作只输出诊断标记而不改动正文；针对当前编辑文件的所有整理操作均可随时 `Ctrl+Z` 撤销，文件夹批量整理则会原子写盘并默认保留 `.bak` 原始备份。

```mermaid
flowchart LR
  S1["1. 打开或抓取文稿"] --> S2["2. 合并段内换行"]
  S2 --> S3["3. 核对短行与引号"]
  S3 --> S4["4. 去除缩进并查空白"]
  S4 --> S5["5. 核对卷章与编号"]
  S5 --> S6["6. 转换排版并加缩进"]
```

| 步骤 | 推荐操作 | 核心细节 |
| :---: | --- | --- |
| **1** | **打开或抓取文稿** | 打开本地 `.txt` / 未保存文本，或通过「抓取」页下载 Pixiv / cool18 小说 |
| **2** | **合并段内换行** | 趁源文件还保留原缩进时先合并硬换行，帮助识别段落边界并拆开行内接缝 |
| **3** | **核对短行与引号** | 用「标点短行」（`Alt+F7`）与「引号配对」检查合并后是否残留孤立标点或漏闭合引号 |
| **4** | **去除缩进并查空白** | 先「去除行首缩进」，再用「空白」跳转（`Alt+F8`）逐处清理行首空白、汉字间空格与行尾空格 |
| **5** | **核对卷章与编号** | 在目录区核对分卷结构，运行「检查缺章重复」，按需执行「章节号转汉字」 |
| **6** | **转换排版并加缩进** | 按需执行繁简、省略号、直角引号、全角转半角与「章节前插空行」，最后「添加首行缩进」并保存 |

> [!NOTE]
> 为避免「添加首行缩进」或保存成稿后满屏出现行首空白警告，插件默认在**保存文件**或**添加首行缩进**后清空诊断并暂停自动检查。点击提示条「恢复检查」、运行「检查全文」或按 `Alt+F8` 即可立即恢复；也可在设置中关闭 `novelToolkit.silenceAfterSave`。

---

## 朱墨工作台

按 `Alt+F10` / `Alt+F11` 或点击右下角状态栏的 **$(book) 小说工具箱** 即可打开工作台面板。宽面板（`≥ 640px`）自动分为左侧工具栏与右侧全高章节目录，窄面板自动切换为紧凑单栏与单行计数条。

| 外观模式 | 画布 / 强调色 | 视觉定位 |
| --- | :---: | --- |
| **跟随 VS Code** | 自动适配（含高对比度） | 默认模式，随当前 VS Code 主题实时同步 |
| **宣纸（浅色）** | `#F4F0E6` · `#B03A28` | 暖米宣纸底配墨黑主按钮，朱砂色仅用于问题批注与当前位置 |
| **夜墨（深色）** | `#181715` · `#E2745D` | 暖炭黑底配米白正文与柔和朱砂，适合长时间夜间校对 |

| 面板区域 | 功能与交互细节 |
| --- | --- |
| **顶栏** | 「整理 / 抓取」标签切换（支持聚焦后用 `←` / `→` / `Home` / `End` 键切换），右侧为三态主题切换与直达本插件设置按钮 |
| **文件栏** | 显示当前文稿文件名及保存状态（未保存时以琥珀圆点提示）；点击文件名可在同目录安全重命名（支持大小写改名、自动补扩展名、拦截非法字符与 Windows 保留设备名） |
| **校对区** | 汇总「空白（行首 + 正文空格）」「标点短行」「引号配对」三张状态计数卡：未就绪显示 `—`、有问题显示朱色数字、通过显示绿色 ✓；左右箭头按精确区间逐处跳转；暂停时显示「恢复检查」提示条 |
| **整理区** | 可折叠并记住展开状态；11 个当前文件命令与「批量整理文件夹」按 **段落 / 文字 / 章节与批量** 三组排布 |
| **目录区** | 自动识别卷与章（卷标题吸顶），支持搜索过滤（`Enter` 跳首个匹配、`Esc` 清空并回滚定位）、当前章朱色高亮、定位当前章与上/下一章跳转；光标移动只滚动目录本身，不带动面板整体跳动 |
| **底部任务栏** | 实时显示抓取/搜索状态圆点、顶部进度条、任务结果（错误时朱色提示）、取消按钮、抓取日志与最近 50 条抓取历史入口 |

---

## 文本校对与整理

### 校对与导航边界

- **状态准确性**：仅当扫描完成且确认 0 问题时状态栏显示 `贴左:✓`、面板显示 `0 ✓`；大文件后台扫描期间显示 `贴左:扫描中…`（面板为 `—`），分析异常时显示 `贴左:失败`，绝不以空诊断冒充“已通过”。
- **空白检查与精确跳转**：
  - **行首空白**：分别统计半角空格、`Tab`、`BOM` 字符（`U+FEFF`）与全角/不间断空格；`ignoreBlankLines` 默认忽略纯空白行。
  - **正文空格**：检出汉字（含扩展 A 区）之间的半角空格或制表符及行尾多余空白；自动豁免英文单词间空格、中英文间空格以及章节标题标记后的合法分隔空格。
  - **逐处跳转**：`Alt+F8` / `Shift+Alt+F8` 按诊断精确区间在同行多处空白间逐处跳转并选中对应列，跳过章节标题分隔空格，跳转总处数与面板计数完全一致。
- **标点短行与引号配对**：
  - **标点短行**（`Alt+F7` / `Shift+Alt+F7`）：检出非空、非纯省略号且长度 `≤ shortLineMaxChars`（默认 `2`）的纯标点行，长分隔线（如 `————`）自动放行。
  - **引号配对**：按左→右顺序检查 `「」`、`『』`、`“”`、`‘’` 在行内的开合配对，可检出“闭前开后”错序引号，并豁免英文缩写与所有格撇号（如 `don’t`、`John’s`）。

### 排版整理与章节处理

- **合并段内换行**：结合行首缩进、句末标点（`。！？…”’」』】）)`）与对话开引号（`“「『‘`）判定段落起点；开启 `smartParagraphs` 时，即使源文件几乎每行都有缩进也能正确合并段内硬折行；自动切分段落中出现的连续多空格接缝，保留章节行与分隔线边界；开启 `keepBlankLines: false` 对空文档保持幂等。
- **缩进与空行整理**：支持去除全文件行首缩进、消除全部空白行、在章节名前归一为“恰好一个空行”（首个章节除外，多个空行折叠为 1 个），以及按 `indentString`（默认两全角空格）批量添加或统一已有缩进（可选跳过章节标题）。
- **章节识别、缺章检查与号转汉字**：
  - 内置识别支持 `第X章/节/卷/回/部/集/话`（含 `廿/卅/卌` 与 `第 12 章` 空格）、`卷N`、括号包裹、`序章/楔子/尾声/番外/終章/後記/尾聲`、`Chapter N` 以及无空格中等标题上下文兜底；填写合法 `novelToolkit.chapterPattern` 时严格按自定义正则匹配。
  - **缺章重复检查**：按分卷分组检测编号跳号与重复，支持中文数字（含略位如 `一百一二`、`一百二`）与英文 `Chapter N`。
  - **章节号转汉字**：仅转换已识别章节名行头部的阿拉伯/全角数字，自动收拢 `第 12 章` 空格为 `第十二章`，支持同行 `第1卷 第12章` 与 `【卷1】 第12章` 双前缀一次转完，不动正文或标题内无关数字。
- **文字专项转换**：
  - **繁体转简体**：基于 OpenCC 全量繁简字词表与 CJK 兼容区/日文新字体组合映射，叠加小说高频规则（`著→着`、`祇→只`、`瞭→了`、`妳/牠/姪` 等）及误伤还原，确保 GB2312 简体零误伤；仅对二次转换确实会被破坏的专名补充保护条目；写回成功后输出按频次排序的字词替换清单、行号与真实专名保护统计。
  - **省略号整改**：合并连续点类字符（`≥4` 点 → `……`，`2~3` 点 → `…`），静默放行句号/小数点以及 `哈利·波特`、`蒙奇·D·路飞`、`3·15` 等中外文间隔号，行尾等孤立点号单列提示。
  - **直角引号与全角半角**：`「」→“”`、`『』→‘’` 一次替换并统计嵌套数；全角转半角提供「仅全角英数（保留中文常用标点）」与「全部全角字符」两档，两种模式均保留全角空格 `　` 与汉字/假名。

### 大文档性能设计

- 超过 `8,000` 行或 `300 KB` 的文档，诊断扫描、章节目录解析与繁简转换自动在后台 `worker_threads` 线程执行，按文档版本缓存并自动清理过期任务；小文件改动采用 `100ms` 防抖，大文件采用 `250ms` 防抖；大文档少量行修改（`≥200` 行且变更比例 `≤20%`、不超过 200 处）自动采用局部行精确替换以缩短写回耗时。

---

## 小说抓取与归档

「抓取」页集成 **Pixiv 小说** 与 **cool18 书屋**，共用单任务互斥闸门、底部真实进度条、随时取消、统一日志通道与最近 50 条历史记录。

### Pixiv 小说

支持单篇、系列、作者主页及旧式 `novel/show.php?id=...` 链接，可多行粘贴批量抓取；**裸数字仅在单独输入单个 ID 时识别**：

| 入口 | 裸数字含义 |
| --- | --- |
| **开始抓取** / `novelToolkit.pixivGrab` | 单篇小说 ID |
| **作者全量…** / `novelToolkit.pixivGrabUser` | 作者（用户）ID |

- **ID 隔离目录结构**（默认根目录 `~/Novels/pixiv`，输出为 UTF-8 + CRLF）：

```text
~/Novels/pixiv/
├── pixiv-manifest.json                 # 相对路径进度清单（兼容旧版目录结构）
└── 作者名 [作者ID]/
    ├── 单篇标题 [作品ID].txt
    └── 系列标题 [系列ID]/
        ├── 001 第一章 标题.txt         # 首行自动规范为可识别章节行
        ├── _合并.txt                   # 整本合集（缺章留可见占位，续传自动更新）
        └── 系列标题（链接）.txt        # 可选原始链接注记（及可选 .meta.json 旁车）
```

- **自愈续传与增量更新**：重新抓取系列时自动跳过已有正常正文、重试失败章、补抓缺失文件或空壳文件，保留正常短正文；「检查更新」既检测总章数增长，也自动续传上次中途取消或有失败章节的系列，并在完成后补写更新 `_合并.txt`；若抓取单篇发现所属未抓系列，会在释放全局任务锁后异步提示是否顺手抓全系列。
- **安全强制重抓**：支持「开始抓取」、「当前文件链接」与「作者全量…」。开启后先请求下载新正文，**下载成功后**才将同名旧文件备份为 `.bak` 再替换；下载失败或取消时保留原文，绝不删除整个系列目录。全流程拦截越界路径与符号链接/目录联接（含断链）。
- **Cookie 与受限作品**：通过「管理 Cookie」将 `PHPSESSID` 或整段 Cookie 写入 VS Code `SecretStorage`（输入 `CLEAR` 可清除私密存储，自动拦截误粘 `uids=` 等追踪 Cookie）。需登录或 R-18 作品需具备对应访问权限与显示设置；空正文记为失败，连续 3 章空正文自动熔断停止。

### cool18 书屋

支持粘贴帖子链接/ID（每行一条）、站内关键词搜索多选抓取，以及抓取当前文件/选区中的链接。

- **爬全本与列表模式**：单条输入默认触发自动爬全本，从首帖出发 BFS 跟随帖内 `tid=` 章节链（不保证发现站内无互链帖）；多条输入按列表顺序抓取。
- **三级排序、去重与缺章检查**：自动遍历按 **卷号 → 章号 → 上/中/下部序** 排序，同章同部序保留较长版本；识别目录索引帖避免掩盖缺章，结束后输出缺章提示。
- **输出与清理**：默认输出到 `~/Novels/cool18/<首帖标题>/`，以 UTF-8 BOM + CRLF 原子新建单帖文件与多帖合集（如 `书名【完】作者：XXX.txt` / `书名【1-XX】作者：XXX.txt`），既有文件绝不覆盖；解析自动剥除 `<script>`/`<style>`/HTML 注释并防止未闭合 `<a>` 吞链，默认保守清理站点广告行并将删除行写入抓取日志；单页默认最多尝试 4 次，失败页自动重排再试 2 轮（含重排间隔与访问上限控制）。

### 代理与网络保护

cool18 与 Pixiv 的默认 HTTP 代理均为 **`http://127.0.0.1:7897`**（`novelToolkit.cool18Proxy` 与 `novelToolkit.pixivProxy`，支持省略 `http://` 与 `http://user:pass@host:port` Basic 鉴权）。

> [!IMPORTANT]
> 在设置中将 `novelToolkit.cool18Proxy` 或 `novelToolkit.pixivProxy` 显式清空为空字符串 `""` 即可直连。只有当新配置项未被显式设置时，才会回退读取旧插件命名空间 `cool18Novel.proxy` / `pixivNovel.proxy` 与默认代理；实测连接通道可在「抓取日志」中核对。直连模式下跟随 HTTP 重定向会自动拦截本机回环与链路本地地址，所有请求均配有连接超时与总耗时上限。

---

## 批量整理与编码处理

运行 **批量整理文件夹**（面板「章节与批量」或命令面板）可递归扫描选定目录下的全部 `.txt`（跳过 `.bak` 与符号链接/目录联接，单任务互斥运行，支持随时取消）：

- **处理流水线**：按当前配置依次执行 `合并段内换行 → 去除行首缩进 → 添加首行缩进`。当文本有变化或原文件非 UTF-8 编码时，原子写盘为 UTF-8 + CRLF（保留原本带 UTF-8 BOM 文件的 BOM，不为无 BOM 文件额外注入 BOM）；0 字节空文件保持原样。
- **安全护栏**：`novelToolkit.batchBackup` 默认开启，首次改写前创建 `原文件.txt.bak`（已有备份绝不覆盖）；`> 512 KB` 文件在后台线程计算变换，写入前再次比对文件大小与修改时间，防止覆盖外部编辑。
- **内部多编码解码**：内部自动识别 **UTF-8 / UTF-8 BOM / UTF-16 LE & BE / GB18030（兼容 GBK/GB2312）/ Big5**；若解码结果出现替换字符 `U+FFFD` 或 `NUL`，则自动跳过、保留原文件并记入复核日志。
- **已移除的独立转码功能**：插件不修改用户 VS Code 全局/工作区编码配置，亦不再提供独立的编码检测、单文件/批量转码命令或启动编码引导。

---

## 参考速查

<details>
<summary><strong>⌨️ 快捷键与全部 37 个命令速查</strong></summary>

<br />

#### 快捷键

| 快捷键 | 功能 | 生效条件 |
| --- | --- | --- |
| `Alt+F7` / `Shift+Alt+F7` | 跳到下一处 / 上一处标点短行 | `editorTextFocus` |
| `Alt+F8` / `Shift+Alt+F8` | 跳到下一处 / 上一处空白问题（行首 + 正文空格） | `editorTextFocus` |
| `Alt+F9` / `Shift+Alt+F9` | 跳到下一章 / 上一章（含卷名行） | `editorTextFocus` |
| `Alt+F10` | 打开小说工具箱面板 | `editorTextFocus` |
| `Alt+F11` | 打开小说工具箱面板 | 全局 |

#### 命令一览

| 分类 | 命令 ID | 标题 / 说明 |
| --- | --- | --- |
| **工作台** | `novelToolkit.panel` | 打开工具面板（功能按钮 + 章节列表） |
| **检查与跳转** | `novelToolkit.check` | 检查当前文件（空白、短行、引号） |
| | `novelToolkit.nextProblem` / `prevProblem` | 跳到下一处 / 上一处空白问题 |
| | `novelToolkit.nextShort` / `prevShort` | 跳到下一处 / 上一处标点短行 |
| | `novelToolkit.nextQuote` / `prevQuote` | 跳到下一处 / 上一处引号配对问题 |
| | `novelToolkit.nextChapter` / `prevChapter` | 跳到下一章 / 上一章 |
| | `novelToolkit.chapterList` | 章节列表（快速选择并跳转） |
| **段落整理** | `novelToolkit.merge` | 合并段落内换行（当前文件） |
| | `novelToolkit.dedent` | 去除所有行首缩进（当前文件） |
| | `novelToolkit.indent` | 批量添加首行缩进（当前文件） |
| | `novelToolkit.removeBlankLines` | 消除空白行（当前文件） |
| | `novelToolkit.blankBeforeChapters` | 章节名前插入空行（首个章节除外） |
| **文字与章节** | `novelToolkit.t2sFile` | 繁体转简体（当前文件，附转换清单） |
| | `novelToolkit.normalizeEllipsis` | 省略号整改（当前文件） |
| | `novelToolkit.replaceCornerQuotes` | 直角引号换弯引号（「」→ “”）（当前文件） |
| | `novelToolkit.fullwidthToHalfwidth` | 全角字符转半角（当前文件，双模式） |
| | `novelToolkit.unifyChapterNumbers` | 章节号统一（阿拉伯数字 → 汉字） |
| | `novelToolkit.checkChapters` | 章节缺失与重复检查（当前文件） |
| **文件与批量** | `novelToolkit.renameFile` | 重命名当前文件（同目录安全改名） |
| | `novelToolkit.batchProcess` | 批量整理文件夹（合并换行→贴左→缩进） |
| **cool18 抓取** | `novelToolkit.cool18Search` | cool18 搜索（输入关键词，结果可多选抓取） |
| | `novelToolkit.cool18Grab` | cool18 抓取（粘贴链接/ID，单链接自动爬全本） |
| | `novelToolkit.cool18GrabFile` | cool18 抓取本文件全部链接 |
| | `novelToolkit.cool18OpenOutput` | cool18 打开输出目录 |
| **Pixiv 抓取** | `novelToolkit.pixivGrab` | Pixiv 抓取链接（单篇/系列/作者） |
| | `novelToolkit.pixivGrabFile` | Pixiv 抓取本文件全部链接 |
| | `novelToolkit.pixivGrabUser` | Pixiv 抓取作者全部小说 |
| | `novelToolkit.pixivUpdate` | Pixiv 增量更新已抓系列 |
| | `novelToolkit.pixivSetCookie` | Pixiv 设置/更新或清除（`CLEAR`）Cookie |
| | `novelToolkit.pixivOpenOutput` | Pixiv 打开输出目录 |
| **任务管理** | `novelToolkit.scrapeCancel` | 取消当前抓取或搜索任务 |
| | `novelToolkit.showScrapeLog` | 显示抓取运行日志 |
| | `novelToolkit.showHistory` | 查看抓取历史（最近 50 条，点击打开输出目录） |

</details>

<details>
<summary><strong>⚙️ 全部 32 项设置参数参考表（前缀 <code>novelToolkit.</code>）</strong></summary>

<br />

| 设置项 | 默认值 / 范围 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 自动检查行首空白、正文空格及已启用的标点短行与引号问题 |
| `ignoreBlankLines` | `true` | 贴左检查忽略只有空白字符的空行 |
| `excludedLanguages` | `[]` | 不进行自动检查的 VS Code 语言 ID 列表（如 `["python", "yaml"]`） |
| `silenceAfterSave` | `true` | 保存后清空警告并暂停自动检查，直到按 `Alt+F8` 或运行检查命令 |
| `shortLineCheck` | `true` | 检查疑似合并残留的标点短行 |
| `shortLineMaxChars` | `2`（`≥ 1`） | 标点短行判定的最大字符数；更长符号行视为分隔线不报 |
| `quotePairCheck` | `true` | 检查行内 `「」『』“”‘’` 引号开合配对 |
| `indentStartsParagraph` | `true` | 合并换行时把行首缩进视为新段落开头；关闭后仅保留章节等结构分段 |
| `smartParagraphs` | `true` | 当源文件几乎每行都有缩进时，改用句末标点/对话引号判定段落起点 |
| `keepBlankLines` | `true` | 合并换行时保留段落之间的空行；`false` 则消除空行 |
| `indentString` | `"　　"` | 批量添加首行缩进使用的前缀（默认两个全角空格） |
| `indentSkipChapterTitles` | `false` | 批量缩进时跳过章节名行，保持章节名贴左 |
| `indentNormalizeExisting` | `true` | 批量缩进时把不一致的已有缩进统一为 `indentString` |
| `chapterPattern` | `""` | 自定义章节名识别正则；留空使用内置规则，填写合法正则后严格按其匹配 |
| `batchBackup` | `true` | 批量整理首次改写前备份原文件为 `.bak`（已有备份不覆盖） |
| `cool18OutputRoot` | `""` | cool18 输出根目录，留空默认 `~/Novels/cool18`（兜底读取 `cool18Novel.outputRoot`） |
| `cool18Proxy` | `"http://127.0.0.1:7897"` | cool18 HTTP 代理；显式设 `""` 直连，未显式设置时回退旧配置或默认代理 |
| `cool18Delay` | `1`（`≥ 0`） | cool18 相邻请求间隔秒数（实际 ±20% 抖动；`0` 表示不额外等待） |
| `cool18MaxPages` | `300`（`≥ 1`） | cool18 自动爬全本帖子访问上限（含重复帖与失败重排队） |
| `cool18MaxRetries` | `4`（`1–10`） | cool18 单页最大尝试次数（指数退避；自动遍历失败还会重排队 2 轮） |
| `scrapeCleanAds` | `true` | 抓取时保守清理明确站点广告/签名行并将删除内容写入日志 |
| `pixivOutputRoot` | `""` | Pixiv 输出根目录，留空默认 `~/Novels/pixiv`（兜底读取 `pixivNovel.outputRoot`） |
| `pixivCookie` | `""` | 明文 `PHPSESSID` 或 Cookie 兜底（推荐用「设置/更新 Cookie」存入私密存储） |
| `pixivProxy` | `"http://127.0.0.1:7897"` | Pixiv HTTP 代理；显式设 `""` 直连，未显式设置时回退旧配置或默认代理 |
| `pixivIntervalMs` | `1200`（`≥ 200`） | Pixiv 相邻请求起步间隔毫秒数（±30% 抖动） |
| `pixivConcurrency` | `1`（`1–3`） | Pixiv 请求层并发上限（当前目标与章节下载依次串行执行） |
| `pixivMaxRetries` | `3`（`0–10`） | Pixiv 网络错误/限速的最大重试次数 |
| `pixivPageSeparator` | `""` | Pixiv `[newpage]` 处插入的分隔线（留空仅留空行） |
| `pixivRubyKeep` | `false` | Pixiv 注音 `[[rb:本字>注音]]` 是否保留注音括号 |
| `pixivSaveUrlNote` | `true` | 每部单篇/系列写一个只含原始链接的 `（链接）.txt` |
| `pixivSaveMeta` | `false` | 额外写入 `.meta.json` 元数据旁车（正文 txt 不插入头部） |
| `pixivRawCache` | `false` | 保存 Pixiv ajax 原始 JSON 到插件全局存储区供日后离线重解析 |

</details>

---

## 开发者指南

开发环境要求 **VS Code 1.70+** 与 **Node.js**。完整版本演变见 [CHANGELOG.md](CHANGELOG.md)。

| 命令 | 说明 |
| --- | --- |
| `npm test` | 执行 `node test/run-all.js`，运行语法检查、核心引擎、离线抓取、面板、批量、命令与全部回归测试 |
| `node test/wiring-audit.js` | 审计命令注册、`package.json` 声明、快捷键、全源码设置读取及 `RUNNABLE` / `HOST_COMMANDS` / `PUSH_TYPES` 协议一致性 |
| `npm run update` | 打包本地 VSIX、强制安装到本机 VS Code、校验已安装版本并清理临时目录 |
| `node scripts/gen-zh-data.js` | 从 OpenCC 原始词库重新生成 `src/engine/zh-convert-data.js` |

> 离线抓取测试使用本地 fixtures 与模拟 HTTP/Fetcher 响应验证解析、排序、续传与边界护栏，不代表对外部站点当前线上可达性的保证。

```text
novel-toolkit/
├── extension.js                  # 扩展入口：装配服务、注册 37 个命令与编辑器事件
├── package.json                  # 扩展清单：命令、快捷键、配置 Schema 声明
├── src/
│   ├── core/                     # 共享编辑器操作（文档判定、行读取、稀疏替换、精确跳转）
│   ├── commands/                 # 命令层（navigation / organize / files / batch / scrape）
│   ├── engine/                   # 纯 JS 引擎（transforms / chapters / encoding / zh-convert / worker / cool18 / pixiv）
│   ├── service/                  # 服务层（Checker 诊断、ScrapeManager 调度、BatchProcessor 批处理）
│   └── ui/                       # 朱墨工作台 Webview（HTML 模板、前端交互、宿主控制器、消息白名单）
├── scripts/                      # OpenCC 字表生成脚本与本机一键打包安装脚本
└── test/                         # 8 个测试套件、HTML fixtures 与接线完整性审计脚本
```

---

<div align="center">
  基于 <a href="LICENSE">MIT License</a> 开源 · 繁简字词表基于 OpenCC（Apache-2.0）数据并补充中文小说语境规则
</div>
