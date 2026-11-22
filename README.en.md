<div align="center">

# Novel Toolkit · 小说工具箱

**A Paper-and-Ink VS Code workbench for scraping, proofreading, formatting, and navigating Chinese novels**

<p>
  <a href="https://github.com/ElmaTony/novel-toolkit/releases/latest">
    <img src="https://img.shields.io/badge/Release-Universal%20%2F%20Multi--Platform%20VSIX-476854?style=flat-square" alt="Latest Release" />
  </a>
  <img src="https://img.shields.io/badge/VS%20Code-1.70%2B-252E28?style=flat-square" alt="VS Code 1.70+" />
  <img src="https://img.shields.io/badge/Runtime-Pure%20JavaScript-3E5B48?style=flat-square" alt="Pure JavaScript" />
  <img src="https://img.shields.io/badge/Theme-Paper%20%26%20Ink%20Light%2FDark-657067?style=flat-square" alt="Paper and Ink Theme" />
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-6A645B?style=flat-square" alt="MIT License" />
  </a>
</p>

<p>
  <a href="README.md">简体中文</a> · <strong>English</strong>
</p>

<p>
  <a href="https://github.com/ElmaTony/novel-toolkit/releases/latest">Download Latest</a> ·
  <a href="#key-features">Key Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#paper--ink-workbench">Paper &amp; Ink Workbench</a> ·
  <a href="#novel-scraping">Novel Scraping</a> ·
  <a href="#developer-guide">Developer Guide</a>
</p>

</div>

---

## Key Features

<table>
  <tr>
    <td width="50%">
      <strong>🪶 Paper &amp; Ink Workbench</strong><br />
      Warm off-white paper canvas with pine-green accents and a matching dark mode. Switch between Follow VS Code, Light, and Dark with zero external fonts or scripts loaded.
    </td>
    <td width="50%">
      <strong>🔍 Proofreading &amp; Chapter Navigation</strong><br />
      Detects leading whitespace, stray ASCII spaces between CJK characters, trailing spaces, punctuation-only stub lines, and unbalanced inline quotes. Includes volume-grouped chapter outlines, search, current-chapter tracking, and gap/duplicate checks.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>✨ One-Click Formatting &amp; T2S Conversion</strong><br />
      Merge hard line wraps, normalize indents, strip blank lines, insert chapter spacing, unify chapter numerals, fix ellipses/quotes/fullwidth text, and convert Traditional to Simplified Chinese using OpenCC data with a detailed change report.
    </td>
    <td width="50%">
      <strong>📥 cool18 &amp; Pixiv Novel Scraping</strong><br />
      Unified task runner with live progress, cancellation, logs, and 50-entry history. Supports cool18 thread crawling/search and Pixiv single/series/author downloads, incremental updates, safe backup-on-overwrite force re-download, and VS Code SecretStorage for cookies.
    </td>
  </tr>
</table>

---

## Quick Start

### Download & Installation

Requires **VS Code 1.70 or newer**. Implemented in pure JavaScript—no Python or external runtime needed.

1. Download one `.vsix` package from [GitHub Releases](https://github.com/ElmaTony/novel-toolkit/releases/latest) (pick the universal package if unsure):

| Package | Target Platform | Note |
| --- | --- | :---: |
| `novel-toolkit-<version>.vsix` | Windows / macOS / Linux | Universal (Recommended) |
| `novel-toolkit-win32-x64-<version>.vsix` | Windows x64 | Platform build |
| `novel-toolkit-darwin-arm64-<version>.vsix` | macOS Apple Silicon | Platform build |
| `novel-toolkit-darwin-x64-<version>.vsix` | macOS Intel | Platform build |
| `novel-toolkit-linux-x64-<version>.vsix` | Linux x64 | Platform build |

2. Run `Extensions: Install from VSIX...` from the VS Code Command Palette and choose the file, or drag the `.vsix` onto the Extensions view.
3. Run `Developer: Reload Window` after installing or updating.

> [!TIP]
> **Install from source**: Run `npm run update` at the repository root (requires Node.js and the `code` CLI) to package, force-install into your local VS Code, verify the version, and clean up temporary artifacts automatically.

### Recommended Editing Workflow

Checks only highlight diagnostics without modifying text. Formatting on the active file can be undone with `Ctrl+Z`, while folder batch processing writes directly to disk and keeps `.bak` backups by default.

| Step | Action | Details |
| :---: | --- | --- |
| **1** | **Open or scrape text** | Open a local `.txt` file or download novels from cool18 / Pixiv via the Scrape tab |
| **2** | **Merge line wraps** | Keep original paragraph indentation first; indentation, sentence-ending punctuation, and dialogue quotes guide paragraph boundaries |
| **3** | **Check stubs &amp; quotes** | Use Short Punctuation Lines (`Alt+F7`) and Quote Pair checks to spot leftover fragments or unclosed quotes |
| **4** | **Dedent &amp; inspect spaces** | Remove leading indentation, then use Whitespace navigation (`Alt+F8`) to clean leading, mid-CJK, and trailing spaces |
| **5** | **Verify chapters** | Review volume/chapter hierarchy, run Missing/Duplicate Chapter checks, and unify chapter numbers to Chinese numerals if desired |
| **6** | **Convert &amp; re-indent** | Run T2S, ellipsis, corner-quote, or fullwidth conversions, insert blank lines before chapters, then add first-line indentation and save |

> [!NOTE]
> By default, diagnostics clear and auto-checking pauses after **saving** or **adding indentation**. Run **Check Current File** or press `Alt+F8` to resume; disable `novelToolkit.silenceAfterSave` to keep checking after save.

---

## Paper &amp; Ink Workbench

Press `Alt+F10` / `Alt+F11` or click **小说工具箱** in the status bar to open the panel. Use the top-right buttons to cycle **Follow VS Code / Light / Dark** themes or jump straight to extension settings.

| Theme Mode | Canvas / Accent | Style |
| --- | :---: | --- |
| **Paper &amp; Ink Light** | `#F7F7F1` · `#476854` | Warm off-white paper with muted pine green |
| **Paper &amp; Ink Dark** | `#202822` · `#AAC7AC` | Deep ink slate with soft sage green for low-fatigue editing |
| **Follow VS Code** | Auto (including High Contrast) | Default mode synced with the active VS Code theme |

### Organize Tab Overview

| Section | Capabilities |
| --- | --- |
| **File Bar** | Shows active filename and dirty/saved state; click filename to rename within the same directory |
| **Full Scan** | Three-row summary for Whitespace (leading + mid/trailing spaces), Short Punctuation Lines, and Quote Pairs with prev/next jump controls |
| **Primary Tools** | Merge Line Wraps, Remove Leading Indent, Add First-Line Indent, Remove Blank Lines |
| **More Tools** | Blank Line Before Chapters, Unify Chapter Numbers, Traditional to Simplified Chinese (with frequency &amp; line-number output channel), Normalize Ellipses, Replace Corner Quotes, Fullwidth to Halfwidth, Check Missing/Duplicate Chapters, Batch Process Folder |
| **Chapter Outline** | Volume-grouped chapter tree with search filtering, active-chapter highlight, Locate Current Chapter, and click-to-jump |

> Quote pair checks compare opening and closing quote counts per line and work best after merging wrapped lines. Chapter detection, paragraph merging, and T2S conversion use heuristics—review changes against the original text when needed.

---

## Novel Scraping

Switch between **Pixiv** and **cool18** inside the Scrape tab. Both share a single active-task lock, a live progress footer with cancellation, an output log channel, and a 50-entry scrape history.

### Pixiv Novels

Supports novel, series, author, and legacy `novel/show.php?id=...` URLs. Multiple URLs can be pasted together; **bare numeric IDs accept one ID at a time**:

| Entry Point | Bare Number Meaning |
| --- | --- |
| **Start Scraping** or standard Pixiv Grab command | Single novel ID |
| **Author All…** | Author (user) ID |

- **ID-Isolated Paths**: Defaults to `~/Novels/pixiv`. Author folders, single-novel filenames, and series folders include their numeric IDs so same-named titles never collide. Series outputs include numbered chapter files, `_合并.txt`, and optional URL notes / `.meta.json` sidecars in UTF-8 with CRLF line endings.
- **Manifest &amp; Self-Healing**: `pixiv-manifest.json` stores relative paths and stays compatible with legacy folder layouts. Re-running a series skips existing valid chapters, retries failed ones, and re-fetches missing files or empty title-only shells while preserving legitimate short texts. Incremental updates detect new chapters via published chapter count increases; re-run the series directly if local chapters are missing while the total count is unchanged.
- **Safe Force Re-Download**: Normal runs skip existing text files. With **Force Re-Download** enabled, the extension downloads content first and only backs up the existing file as a timestamped `.bak` before replacing it upon success—failed or canceled runs keep original files intact and never delete an entire series directory. Writes outside the output root or across symlinks/junctions (including dangling symlinks) are rejected.
- **Cookies &amp; Restricted Works**: Login-gated works and author work lists may require a Pixiv cookie (`PHPSESSID` or full Cookie header), stored securely in VS Code SecretStorage. Empty bodies are recorded as failures, and 3 consecutive empty chapters abort the remaining series so you can fix credentials and resume.

### cool18 Library

Paste thread URLs or IDs (one per line), search by keyword with multi-select, or scrape links directly from the active editor or selection.

- **Full-Book Crawl &amp; List Mode**: A single input crawls linked chapters starting from that thread; multiple inputs are scraped in list order.
- **Ordering, Deduplication &amp; Gap Hints**: Crawled threads are ordered by volume, chapter, and part (上/中/下). Duplicate chapters with the same part retain the longer text, and detected number gaps are reported.
- **Output &amp; Retries**: Defaults to `~/Novels/cool18/<first-thread-title>/`, writing numbered single-thread files plus a merged volume file when multiple threads are fetched (UTF-8 BOM + CRLF; existing files skipped). Conservative ad/signature line cleanup logs removed lines. Requests retry up to 4 times by default, crawl mode re-queues failed pages up to 2 rounds (counted toward `cool18MaxPages`), and cancellation writes already-fetched threads to disk.

### Proxy Configuration

Both cool18 and Pixiv default to HTTP proxy **`http://127.0.0.1:7897`** (`novelToolkit.cool18Proxy` and `novelToolkit.pixivProxy`).

> [!IMPORTANT]
> Leaving the new proxy setting blank falls back to legacy `cool18Novel.proxy` / `pixivNovel.proxy`, and if unset still falls back to `http://127.0.0.1:7897`. To connect directly without a proxy, explicitly set both the new and legacy proxy settings to an empty string `""` and confirm in the scrape log.

---

<details>
<summary><strong>⌨️ Keyboard Shortcuts</strong></summary>

<br />

| Shortcut | Action |
| --- | --- |
| `Alt+F7` / `Shift+Alt+F7` | Next / Previous short punctuation line |
| `Alt+F8` / `Shift+Alt+F8` | Next / Previous whitespace issue (leading, mid-CJK, and trailing spaces) |
| `Alt+F9` / `Shift+Alt+F9` | Next / Previous chapter (including volumes) |
| `Alt+F10` / `Alt+F11` | Open Novel Toolkit panel |

> Quote-pair navigation is available via the panel and Command Palette without claiming global keybindings.

</details>

<details>
<summary><strong>📁 Folder Batch Processing &amp; Internal Decoding</strong></summary>

<br />

Run **Batch Process Folder** from More Tools or the Command Palette to recursively process `.txt` files (symlinks and junctions are never followed; only one batch job runs at a time):

- **Pipeline**: Merge line wraps → dedent → add first-line indent; modified files are atomically written as UTF-8 BOM + CRLF, while 0-byte empty files remain untouched.
- **Backup &amp; Cancellation**: `novelToolkit.batchBackup` is enabled by default and saves `file.txt.bak` once without overwriting existing backups. Cancellation stops cleanly after the current file.
- **Large Files &amp; Safety**: Files larger than 512 KB run in a background worker thread and verify the file was not modified externally before writing.
- **Internal Decoding**: Batch processing and scraping decode common Chinese encodings internally (valid UTF-8 preserved first, plus UTF-8 BOM, UTF-16 LE/BE, GB18030, and Big5). Files decoding with `U+FFFD` or `NUL` are skipped untouched and logged for review.
- **Removed Standalone Encoding Tools**: Standalone encoding detection, single/batch transcoding commands, auto-guess settings, and startup encoding prompts have been removed. Existing VS Code encoding settings remain under your own control.

</details>

<details>
<summary><strong>⚙️ Configuration Reference (prefix <code>novelToolkit.</code>)</strong></summary>

<br />

Search **Novel Toolkit** in VS Code Settings. Changes refresh diagnostics and the panel immediately (large files and very long lines run diagnostics and chapter parsing on a background worker with per-version caching):

| Category | Settings |
| --- | --- |
| **Auto Check** | `enabled`, `ignoreBlankLines`, `excludedLanguages`, `silenceAfterSave` |
| **Stub &amp; Quote Checks** | `shortLineCheck`, `shortLineMaxChars`, `quotePairCheck` |
| **Line Merging** | `indentStartsParagraph`, `smartParagraphs`, `keepBlankLines` |
| **Indent &amp; Chapters** | `indentString` (default two fullwidth spaces), `indentSkipChapterTitles`, `indentNormalizeExisting`, `chapterPattern` |
| **Batch Backup** | `batchBackup` |
| **cool18** | `cool18OutputRoot`, `cool18Proxy`, `cool18Delay`, `cool18MaxPages`, `cool18MaxRetries`, `scrapeCleanAds` |
| **Pixiv Connection** | `pixivOutputRoot`, `pixivCookie`, `pixivProxy`, `pixivIntervalMs` (`1200` ±30% jitter), `pixivConcurrency` (request-layer cap 1–3; downloads run sequentially), `pixivMaxRetries` |
| **Pixiv Output** | `pixivPageSeparator`, `pixivRubyKeep`, `pixivSaveUrlNote`, `pixivSaveMeta`, `pixivRawCache` |

> Output roots and plaintext cookies still fall back to legacy `pixivNovel.*` / `cool18Novel.*` settings, whereas SecretStorage cookies are not shared across extension IDs and must be saved once via **Manage Cookie**.

</details>

---

## Developer Guide

Requires **VS Code 1.70+** and **Node.js**. See [CHANGELOG.md](CHANGELOG.md) for full release history.

<details>
<summary><strong>🛠️ Testing, Wiring Audit &amp; Local Install</strong></summary>

<br />

| Command | Purpose |
| --- | --- |
| `npm test` | Runs `node test/run-all.js` across syntax, engine, offline scraping, panel, batch, command, and regression suites |
| `node test/wiring-audit.js` | Audits alignment across command registration, `package.json`, keybindings, settings reads, and webview message whitelists |
| `npm run update` | Packages a local VSIX, force-installs it into VS Code, verifies the installed version, and cleans up temporary files |

> Scraping tests use offline fixtures and mocked responses and do not imply live site availability.

</details>

<details>
<summary><strong>🗂️ Project Structure</strong></summary>

<br />

```text
novel-toolkit/
├── extension.js          # Extension entry point: service wiring, commands, editor events
├── package.json          # Extension manifest: commands, keybindings, settings schema
├── src/
│   ├── core/             # Shared editor helpers (line reading, edits, issue navigation)
│   ├── commands/         # Domain-split commands (organize, navigation, files, batch, scrape)
│   ├── engine/           # Pure engines: transforms, chapters, decoding, T2S, worker, cool18/Pixiv scrapers
│   ├── service/          # Diagnostics checker, scrape coordinator, folder batch processor
│   └── ui/               # Paper & Ink webview HTML, client script, and host-webview protocol
├── scripts/              # OpenCC dictionary generator (gen-zh-data.js) and local installer (update.js)
└── test/                 # Syntax, engine, panel, batch, command, wiring audit, and regression tests
```

</details>

---

<div align="center">
  Released under the <a href="LICENSE">MIT License</a> · Traditional-to-Simplified tables built from OpenCC (Apache-2.0) data with novel-specific rules
</div>
