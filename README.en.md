<div align="center">

# Novel Toolkit · 小说工具箱

**A Vermilion-and-Ink VS Code workbench for reading, proofreading, formatting, and archiving Chinese web novels**

<p>
  <a href="https://github.com/ElmaTony/novel-toolkit/releases/latest">
    <img src="https://img.shields.io/badge/Release-Universal%20%2F%20Multi--Platform%20VSIX-2A2622?style=flat-square" alt="Latest Release" />
  </a>
  <img src="https://img.shields.io/badge/VS%20Code-1.70%2B-6C6459?style=flat-square" alt="VS Code 1.70+" />
  <img src="https://img.shields.io/badge/Runtime-Pure%20JavaScript%20%C2%B7%20Zero%20Deps-837A6D?style=flat-square" alt="Pure JavaScript" />
  <img src="https://img.shields.io/badge/Theme-Vermilion%20%26%20Ink%20Light%2FDark-B03A28?style=flat-square" alt="Vermilion and Ink Workbench" />
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-6A645B?style=flat-square" alt="MIT License" />
  </a>
</p>

<p>
  <a href="README.md">简体中文</a> · <strong>English</strong>
</p>

<p>
  <a href="#key-features">Key Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#vermilion--ink-workbench">Vermilion &amp; Ink Workbench</a> ·
  <a href="#proofreading--formatting">Proofreading &amp; Formatting</a> ·
  <a href="#novel-scraping">Novel Scraping</a> ·
  <a href="#batch-processing--encoding">Batch Processing &amp; Encoding</a> ·
  <a href="#reference">Reference</a> ·
  <a href="#developer-guide">Developer Guide</a>
</p>

</div>

---

## Key Features

<table>
  <tr>
    <td width="50%">
      <strong>🖌️ Vermilion &amp; Ink Split Workbench</strong><br />
      Ink-first styling with vermilion reserved strictly for diagnostics and active focus: ships with Rice Paper (light) and Night Ink (dark), automatic VS Code / High Contrast syncing, responsive two-column layout at <code>&ge; 640px</code>, WAI-ARIA arrow-key tab navigation, and 100% offline bundled assets.
    </td>
    <td width="50%">
      <strong>🔍 4-Way Proofreading &amp; Exact Navigation</strong><br />
      Pinpoints leading whitespace (ASCII space, Tab, BOM, fullwidth/NBSP), stray spaces between CJK characters (exempting valid chapter-heading separators), trailing spaces, punctuation stubs, and unbalanced inline quotes (exempting contractions like <code>don’t</code>). Tracks unchecked, scanning, failed, silenced, and clean states without false greens, jumping directly to exact character ranges alongside a volume-grouped outline.
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>✨ One-Click Formatting &amp; T2S Conversion</strong><br />
      Smart line-wrap merging, indent normalization, blank-line cleanup, chapter spacing, one-pass volume+chapter numeral conversion, ellipsis normalization (preserving alphanumeric middots like <code>3·15</code>), corner-to-curly quotes, dual-mode fullwidth conversion, and OpenCC-backed Traditional-to-Simplified conversion with a frequency report of real changes and protected proper nouns.
    </td>
    <td width="50%">
      <strong>📥 Pixiv &amp; cool18 Scraping &amp; Folder Batching</strong><br />
      Single task queue with real progress, cancellation, logs, and 50-entry history. Pixiv supports SecretStorage cookies, self-healing resume, and backup-on-overwrite force re-downloads; cool18 supports full-book crawling, keyword search, and 3-level ordering/deduplication; folder batching handles multi-encoding decoding and background-worker atomic writes.
    </td>
  </tr>
</table>

---

## Quick Start

### Installation

Requires **VS Code 1.70 or newer**. Implemented in pure JavaScript with zero external dependencies—no Python or extra runtime required.

1. Download a `.vsix` package from [GitHub Releases](https://github.com/ElmaTony/novel-toolkit/releases/latest) (pick the universal package if unsure):

| Package | Target Platform | Note |
| --- | --- | :---: |
| `novel-toolkit-<version>.vsix` | Windows / macOS / Linux | Universal (Recommended) |
| `novel-toolkit-win32-x64-<version>.vsix` | Windows x64 | Platform build |
| `novel-toolkit-darwin-arm64-<version>.vsix` | macOS Apple Silicon (M-series) | Platform build |
| `novel-toolkit-darwin-x64-<version>.vsix` | macOS Intel | Platform build |
| `novel-toolkit-linux-x64-<version>.vsix` | Linux x64 | Platform build |

2. Run `Extensions: Install from VSIX...` from the VS Code Command Palette and select the package, or drag the `.vsix` onto the Extensions view.
3. Run `Developer: Reload Window` after installing or updating.

> [!TIP]
> **Install from source**: Run `npm run update` at the repository root (requires Node.js and the `code` CLI) to package, force-install into VS Code, verify the installed version, and clean up temporary build artifacts automatically.

### Recommended 6-Step Workflow

Checking never edits your text—it only highlights diagnostics. Every formatting command on the active editor supports `Ctrl+Z` undo, while folder batch processing writes atomically to disk and keeps `.bak` backups by default.

```mermaid
flowchart LR
  S1["1. Open or Scrape Text"] --> S2["2. Merge Line Wraps"]
  S2 --> S3["3. Check Stubs & Quotes"]
  S3 --> S4["4. Dedent & Clean Spaces"]
  S4 --> S5["5. Verify Chapters & Numerals"]
  S5 --> S6["6. Convert, Space & Re-Indent"]
```

| Step | Action | Key Details |
| :---: | --- | --- |
| **1** | **Open or Scrape Text** | Open a local `.txt` / untitled document, or download novels from Pixiv / cool18 via the Scrape tab |
| **2** | **Merge Line Wraps** | Run while original paragraph indentation is intact so indentation signals guide paragraph boundaries |
| **3** | **Check Stubs &amp; Quotes** | Inspect Punctuation Stubs (`Alt+F7`) and Quote Pairs to catch leftover fragments or unclosed quotes |
| **4** | **Dedent &amp; Clean Spaces** | Strip leading indentation, then step through Whitespace diagnostics (`Alt+F8`) to clean leading, mid-CJK, and trailing spaces |
| **5** | **Verify Chapters &amp; Numerals** | Inspect the volume/chapter outline, run Missing/Duplicate Chapter checks, and optionally convert chapter numerals to Chinese |
| **6** | **Convert, Space &amp; Re-Indent** | Run T2S, ellipsis, corner-quote, or fullwidth conversions, insert single blank lines before chapters, then add first-line indentation and save |

> [!NOTE]
> By default, diagnostics clear and auto-checking pauses after **saving** or **adding first-line indentation** so standard indentation does not flood the Problems view. Click **Resume Check**, run **Check Current File**, or press `Alt+F8` to resume immediately, or disable `novelToolkit.silenceAfterSave`.

---

## Vermilion & Ink Workbench

Press `Alt+F10` / `Alt+F11` or click **$(book) 小说工具箱** in the status bar to open the panel. At `640px` or wider, the Organize view splits into a fixed-width tools sidebar and a full-height chapter outline.

| Theme Mode | Canvas / Accent | Style |
| --- | :---: | --- |
| **Follow VS Code** | Auto (including High Contrast) | Default mode synced with your active VS Code theme |
| **Rice Paper (Light)** | `#F4F0E6` · `#B03A28` | Warm rice-paper canvas with ink-black primary actions and vermilion annotations |
| **Night Ink (Dark)** | `#181715` · `#E2745D` | Warm charcoal canvas with parchment text and soft vermilion for low-glare reading |

| Region | Capabilities |
| --- | --- |
| **Header** | Organize / Scrape tabs (`←` / `→` / `Home` / `End` keyboard navigation), 3-mode theme cycler, and direct extension settings shortcut |
| **File Bar** | Active filename and dirty indicator (amber dot when unsaved); click filename to safely rename within the same directory (supports case-only renames, extension preservation, and Windows reserved-name protection) |
| **Proofread** | Three cards for Whitespace (leading + mid/trailing spaces), Short Punctuation Lines, and Quote Pairs: `—` when unchecked/pending, vermilion counts on issues, green `✓` only when verified clean; prev/next arrows jump per exact range; Resume banner appears when paused |
| **Organize** | Collapsible section (state persisted) grouping 11 active-file tools plus **Batch Process Folder** into **Paragraphs / Text / Chapters & Batch** |
| **Outline** | Sticky volume headers, search filter (`Enter` jumps to first match, `Esc` clears and restores focus), vermilion active-chapter highlight, Locate Current, prev/next chapter, and click-to-jump; cursor moves scroll only the outline container |
| **Taskbar Footer** | Live status dot, determinate/indeterminate progress bar, last run outcome (vermilion on errors), Cancel button, Scrape Log, and 50-entry Scrape History |

---

## Proofreading & Formatting

### Proofreading Boundaries

- **Accurate Ready Tracking**: `贴左:✓` and green `0 ✓` cards appear only after a scan completes with zero issues. Large files show `贴左:扫描中…` (panel `—`) while scanning in the background and `贴左:失败` if a worker scan fails.
- **Whitespace Checks &amp; Exact Navigation**:
  - **Leading whitespace**: Distinguishes ASCII spaces, Tabs, `BOM` (`U+FEFF`), and other spaces (fullwidth/NBSP); `ignoreBlankLines` skips whitespace-only lines by default.
  - **In-line &amp; trailing spaces**: Flags stray spaces/tabs between CJK characters (including CJK Extension A) and trailing whitespace, while ignoring spaces between English words, between CJK and Latin/digits, and valid single separators after chapter markers.
  - **Per-range navigation**: `Alt+F8` / `Shift+Alt+F8` step through exact diagnostic ranges (including multiple spaces on the same line and skipping valid chapter separators), matching the panel badge counts 1:1.
- **Stub Lines &amp; Quote Pairs**:
  - **Punctuation stubs** (`Alt+F7` / `Shift+Alt+F7`): Flags non-blank, non-pure-ellipsis punctuation lines up to `shortLineMaxChars` (default `2`), leaving longer divider lines untouched.
  - **Quote pairs**: Matches `「」`, `『』`, `“”`, and `‘’` sequentially per line—catching inverted closing-before-opening pairs while ignoring English contractions/possessives (`don’t`, `John’s`).

### Formatting &amp; Chapters

- **Smart Line-Wrap Merging**: Combines indentation, sentence-ending punctuation (`。！？…”’」』】）)`), and dialogue opening quotes (`“「『‘`) to detect true paragraph starts even when almost every source line is indented (`smartParagraphs`). Automatically splits inline multi-space/fullwidth-space breaks, preserves chapter headings and dividers, and stays idempotent on empty documents when `keepBlankLines` is `false`.
- **Indentation &amp; Blank Lines**: Strips all leading indentation, removes all blank lines, normalizes spacing before chapter headings to exactly one blank line (excluding the first chapter), or adds/normalizes first-line indentation (`indentString`, defaulting to two fullwidth spaces) with optional chapter-title skipping.
- **Chapter Detection, Gap Checks &amp; Numeral Conversion**:
  - Built-in detection covers `第X章/节/卷/回/部/集/话` (including `廿/卅/卌` and spaced `第 12 章`), `卷N`, bracketed headings, `序章/楔子/尾声/番外/終章/後記/尾聲`, `Chapter N`, and contextual fallback for medium-length unspaced headings. Supplying a valid `novelToolkit.chapterPattern` switches strictly to that pattern.
  - **Gap &amp; duplicate checks**: Groups chapters per volume to detect skipped or duplicated numbers across Arabic, Chinese (including abbreviated forms like `一百一二`), and English `Chapter N` headings.
  - **Unify chapter numerals**: Converts leading volume and chapter Arabic/fullwidth digits in recognized chapter headings to Chinese numerals in a single pass (including `第 12 章` → `第十二章` and `第1卷 第12章` → `第一卷 第十二章`), leaving body numbers untouched.
- **Text Conversions**:
  - **Traditional to Simplified (T2S)**: Built on OpenCC dictionaries plus CJK Compatibility Ideographs, Japanese Shinjitai variants, novel-context overrides (`著→着`, `祇→只`, `瞭→了`, `妳/牠/姪`), and historical misconversion repairs with zero false changes across GB2312 Simplified characters. Only outputs that would mutate on a second pass receive re-entry guards, keeping the protected-phrase report focused on genuine proper nouns.
  - **Ellipsis Normalization**: Collapses runs of punctuation dots (`≥4` dots → `……`, `2–3` dots → `…`), leaves decimals/periods and alphanumeric/CJK middots (`哈利·波特`, `3·15`) alone, and reports stray isolated dots.
  - **Corner Quotes &amp; Fullwidth to Halfwidth**: Maps `「」→“”` and `『』→‘’` with nested counts; converts fullwidth ASCII either in safe mode (preserving Chinese punctuation) or full mode while always keeping fullwidth spaces (`　`) and CJK/kana intact.

### Large-File Performance

- Documents over `8,000` lines or `300 KB` run diagnostics, outline parsing, and T2S conversion on a background `worker_threads` worker with per-version caching and stale-job cancellation. Editing uses `100ms` debouncing on small files (avoiding IME composition churn) and `250ms` on large files; sparse line-preserving edits (`≥ 200` lines, `≤ 20%` and `≤ 200` changed lines) patch only modified lines.

---

## Novel Scraping

The Scrape tab houses **Pixiv** and **cool18**, sharing a single active-task lock, progress bar, cancellation, output log, and 50-entry scrape history.

### Pixiv Novels

Supports novel, series, author, and legacy `novel/show.php?id=...` URLs, including multi-line pastes. **Bare numeric IDs accept one ID at a time**:

| Entry Point | Bare Number Meaning |
| --- | --- |
| **Start Scraping** / `novelToolkit.pixivGrab` | Single novel ID |
| **Author All…** / `novelToolkit.pixivGrabUser` | Author (user) ID |

- **ID-Isolated Layout** (defaults to `~/Novels/pixiv`, written as UTF-8 + CRLF):

```text
~/Novels/pixiv/
├── pixiv-manifest.json                 # Relative-path progress manifest (legacy layout compatible)
└── Author Name [AuthorID]/
    ├── Novel Title [NovelID].txt
    └── Series Title [SeriesID]/
        ├── 001 Chapter 1 Title.txt     # First line normalized to a chapter heading
        ├── _合并.txt                   # Merged book (visible placeholders for failed chapters)
        └── Series Title（链接）.txt    # Optional URL note (plus optional .meta.json sidecar)
```

- **Self-Healing Resume &amp; Incremental Updates**: Re-running a series skips valid chapters, retries failures, and re-fetches missing files or title-only shells while keeping legitimate short texts. **Check Updates** detects new chapter counts and resumes incomplete or previously aborted series, rebuilding `_合并.txt` once caught up. Single novels belonging to an ungrabbed series prompt asynchronously *after* the task lock is released so notifications never deadlock subsequent jobs.
- **Safe Force Re-Download**: Applies to **Start Scraping**, **Current File Links**, and **Author All…**. Downloads fresh text first, backs up existing files as timestamped `.bak` only after success, keeps originals on error/cancel, never deletes whole series folders, and rejects out-of-root or symlink/junction paths (including dangling symlinks).
- **Cookies &amp; Restricted Works**: Save `PHPSESSID` or a full Cookie header in VS Code `SecretStorage` via **Manage Cookie** (enter `CLEAR` to wipe; rejects tracking cookies like `uids=`). Empty bodies count as failures, and 3 consecutive empty chapters abort the remaining series cleanly.

### cool18 Library

Supports thread URLs/IDs (one per line), keyword search with multi-select, and scraping links from the active editor or selection.

- **Full-Book Crawl &amp; List Mode**: A single entry crawls linked `tid=` chapters via BFS (cannot discover unlinked threads); multiple entries scrape strictly in list order.
- **Ordering, Deduplication &amp; Gap Detection**: Orders by **volume → chapter → part (上/中/下)**, keeps longer bodies on duplicate chapter+part threads, avoids letting multi-link index threads mask missing child chapters, and reports detected gaps.
- **Output &amp; Retries**: Saves UTF-8 BOM + CRLF files into `~/Novels/cool18/<first-thread-title>/` alongside a merged volume file when multiple threads are fetched without overwriting existing files; strips `<script>`/`<style>`/HTML comments and unclosed `<a>` bleed, logs conservatively stripped ad lines, retries each request up to 4 times with backoff, and re-queues failed crawl pages up to 2 rounds with delay pacing.

### Proxy &amp; Connection Hardening

Both cool18 and Pixiv default to HTTP proxy **`http://127.0.0.1:7897`** (`novelToolkit.cool18Proxy` and `novelToolkit.pixivProxy`, supporting `host:port` shorthand and `http://user:pass@host:port` Basic auth).

> [!IMPORTANT]
> Setting `novelToolkit.cool18Proxy` or `novelToolkit.pixivProxy` explicitly to an empty string `""` switches directly to a direct connection. Legacy `cool18Novel.proxy` / `pixivNovel.proxy` and the default proxy are only used when the new setting has not been explicitly configured (check the Scrape Log to verify). Direct-mode redirects block loopback/link-local hosts, and all requests enforce connect and total-duration timeouts.

---

## Batch Processing &amp; Encoding

Run **Batch Process Folder** (Organize · Chapters & Batch or Command Palette) to recursively process `.txt` files under a directory (skipping `.bak` files and symlinks/junctions; one batch job at a time; cancellable between files):

- **Pipeline**: Executes `Merge Line Wraps → Dedent → Add First-Line Indent`. Files with text changes or non-UTF-8 encodings are written atomically as UTF-8 + CRLF (preserving existing UTF-8 BOMs without injecting BOMs into BOM-less files); 0-byte empty files remain untouched.
- **Backups &amp; Concurrency**: `novelToolkit.batchBackup` is enabled by default and saves `file.txt.bak` once without overwriting existing backups. Files over `512 KB` run on a background worker and re-check file size and mtime before writing.
- **Internal Decoding**: Automatically detects **UTF-8 / UTF-8 BOM / UTF-16 LE &amp; BE / GB18030 (GBK/GB2312) / Big5**. Files decoding with `U+FFFD` or `NUL` are skipped untouched and logged for review.
- **Removed Standalone Encoding Tools**: The extension never alters your VS Code encoding settings and no longer includes standalone encoding detection, transcoding commands, or startup encoding prompts.

---

## Reference

<details>
<summary><strong>⌨️ Keyboard Shortcuts &amp; All 37 Commands</strong></summary>

<br />

#### Keyboard Shortcuts

| Shortcut | Action | Context |
| --- | --- | --- |
| `Alt+F7` / `Shift+Alt+F7` | Next / Previous punctuation stub line | `editorTextFocus` |
| `Alt+F8` / `Shift+Alt+F8` | Next / Previous whitespace issue (leading + mid/trailing) | `editorTextFocus` |
| `Alt+F9` / `Shift+Alt+F9` | Next / Previous chapter (including volumes) | `editorTextFocus` |
| `Alt+F10` | Open Novel Toolkit panel | `editorTextFocus` |
| `Alt+F11` | Open Novel Toolkit panel | Global |

#### Command Reference

| Group | Command ID | Description |
| --- | --- | --- |
| **Workbench** | `novelToolkit.panel` | Open Novel Toolkit panel (actions + outline) |
| **Proofread &amp; Nav** | `novelToolkit.check` | Check current file (whitespace, stubs, quotes) |
| | `novelToolkit.nextProblem` / `prevProblem` | Jump to next / previous whitespace issue |
| | `novelToolkit.nextShort` / `prevShort` | Jump to next / previous punctuation stub line |
| | `novelToolkit.nextQuote` / `prevQuote` | Jump to next / previous quote-pair issue |
| | `novelToolkit.nextChapter` / `prevChapter` | Jump to next / previous chapter |
| | `novelToolkit.chapterList` | Open QuickPick chapter list and jump |
| **Paragraphs** | `novelToolkit.merge` | Merge line wraps inside paragraphs |
| | `novelToolkit.dedent` | Remove all leading indentation |
| | `novelToolkit.indent` | Add/normalize first-line indentation |
| | `novelToolkit.removeBlankLines` | Remove all blank lines |
| | `novelToolkit.blankBeforeChapters` | Insert single blank line before chapters (except first) |
| **Text &amp; Chapters** | `novelToolkit.t2sFile` | Convert Traditional to Simplified Chinese with change report |
| | `novelToolkit.normalizeEllipsis` | Normalize ellipsis dots |
| | `novelToolkit.replaceCornerQuotes` | Replace corner quotes (`「」` → `“”`, `『』` → `‘’`) |
| | `novelToolkit.fullwidthToHalfwidth` | Convert fullwidth characters to halfwidth (2 modes) |
| | `novelToolkit.unifyChapterNumbers` | Convert Arabic chapter/volume numbers to Chinese |
| | `novelToolkit.checkChapters` | Check missing or duplicate chapter numbers |
| **Files &amp; Batch** | `novelToolkit.renameFile` | Safely rename the active file in place |
| | `novelToolkit.batchProcess` | Batch process folder (`merge → dedent → indent`) |
| **cool18** | `novelToolkit.cool18Search` | Search cool18 and multi-select threads to scrape |
| | `novelToolkit.cool18Grab` | Scrape cool18 URLs or IDs (single entry crawls book) |
| | `novelToolkit.cool18GrabFile` | Scrape all cool18 links in active file/selection |
| | `novelToolkit.cool18OpenOutput` | Open cool18 output folder |
| **Pixiv** | `novelToolkit.pixivGrab` | Scrape Pixiv novel/series/author links or ID |
| | `novelToolkit.pixivGrabFile` | Scrape all Pixiv links in active file/selection |
| | `novelToolkit.pixivGrabUser` | Scrape all novels by a Pixiv author |
| | `novelToolkit.pixivUpdate` | Incrementally update and resume tracked Pixiv series |
| | `novelToolkit.pixivSetCookie` | Set, update, or `CLEAR` SecretStorage Pixiv Cookie |
| | `novelToolkit.pixivOpenOutput` | Open Pixiv output folder |
| **Tasks** | `novelToolkit.scrapeCancel` | Cancel active scraping or search task |
| | `novelToolkit.showScrapeLog` | Show scraping output channel |
| | `novelToolkit.showHistory` | View last 50 scrape history entries and open output folder |

</details>

<details>
<summary><strong>⚙️ All 32 Configuration Settings (prefix <code>novelToolkit.</code>)</strong></summary>

<br />

| Setting | Default / Range | Description |
| --- | --- | --- |
| `enabled` | `true` | Auto-check leading whitespace, mid/trailing spaces, stubs, and quotes |
| `ignoreBlankLines` | `true` | Ignore whitespace-only blank lines during leading-space checks |
| `excludedLanguages` | `[]` | VS Code language IDs excluded from checks (e.g. `["python", "yaml"]`) |
| `silenceAfterSave` | `true` | Clear warnings and pause auto-check after save until `Alt+F8` or manual check |
| `shortLineCheck` | `true` | Flag punctuation-only stub lines left after merging |
| `shortLineMaxChars` | `2` (`&ge; 1`) | Max length for punctuation stub lines; longer symbol lines are treated as dividers |
| `quotePairCheck` | `true` | Check per-line `「」『』“”‘’` pairing |
| `indentStartsParagraph` | `true` | Treat leading indent as paragraph start when merging wraps |
| `smartParagraphs` | `true` | Fall back to sentence punctuation/dialogue quotes when nearly every line is indented |
| `keepBlankLines` | `true` | Keep blank lines between paragraphs when merging (`false` strips them) |
| `indentString` | `"　　"` | First-line indent prefix (default two fullwidth spaces) |
| `indentSkipChapterTitles` | `false` | Leave chapter heading lines unindented during bulk indentation |
| `indentNormalizeExisting` | `true` | Normalize mismatched existing indentation to `indentString` |
| `chapterPattern` | `""` | Custom chapter regex; empty uses built-in rules, valid regex overrides strictly |
| `batchBackup` | `true` | Save `.bak` once before first overwrite during folder batching |
| `cool18OutputRoot` | `""` | cool18 root folder (defaults to `~/Novels/cool18`, fallback `cool18Novel.outputRoot`) |
| `cool18Proxy` | `"http://127.0.0.1:7897"` | cool18 HTTP proxy; explicit `""` connects directly; unset falls back |
| `cool18Delay` | `1` (`&ge; 0`) | Seconds between cool18 requests (±20% jitter; `0` disables delay) |
| `cool18MaxPages` | `300` (`&ge; 1`) | Max thread visits per cool18 crawl (including duplicates and re-queued retries) |
| `cool18MaxRetries` | `4` (`1–10`) | Max per-page attempts (exponential backoff; crawl mode re-queues up to 2 rounds) |
| `scrapeCleanAds` | `true` | Conservatively remove explicit site ad/signature lines and log removals |
| `pixivOutputRoot` | `""` | Pixiv root folder (defaults to `~/Novels/pixiv`, fallback `pixivNovel.outputRoot`) |
| `pixivCookie` | `""` | Plaintext `PHPSESSID` / Cookie fallback (SecretStorage via Manage Cookie recommended) |
| `pixivProxy` | `"http://127.0.0.1:7897"` | Pixiv HTTP proxy; explicit `""` connects directly; unset falls back |
| `pixivIntervalMs` | `1200` (`&ge; 200`) | Minimum start interval in ms between Pixiv requests (±30% jitter) |
| `pixivConcurrency` | `1` (`1–3`) | Request-layer concurrency cap (target &amp; chapter workflows execute sequentially) |
| `pixivMaxRetries` | `3` (`0–10`) | Max retries for Pixiv network/rate-limit errors |
| `pixivPageSeparator` | `""` | Divider inserted at `[newpage]` markers (empty leaves blank lines only) |
| `pixivRubyKeep` | `false` | Keep ruby annotations from `[[rb:base>ruby]]` markers |
| `pixivSaveUrlNote` | `true` | Write a source-URL `（链接）.txt` file per novel/series |
| `pixivSaveMeta` | `false` | Write `.meta.json` sidecar files without modifying novel txt headers |
| `pixivRawCache` | `false` | Cache raw Pixiv ajax JSON in extension globalStorage for offline re-parsing |

</details>

---

## Developer Guide

Requires **VS Code 1.70+** and **Node.js**. See [CHANGELOG.md](CHANGELOG.md) for the full release history.

| Command | Purpose |
| --- | --- |
| `npm test` | Runs `node test/run-all.js` across syntax, engine, offline scraping, panel, batch, command, and regression suites |
| `node test/wiring-audit.js` | Audits alignment across command registration, `package.json`, keybindings, all-source settings reads, and `RUNNABLE` / `HOST_COMMANDS` / `PUSH_TYPES` |
| `npm run update` | Packages a local VSIX, force-installs it into VS Code, verifies the installed version, and cleans up temporary artifacts |
| `node scripts/gen-zh-data.js` | Regenerates `src/engine/zh-convert-data.js` from OpenCC source dictionaries |

> Offline scraping tests run against local fixtures and mocked HTTP/Fetcher layers to verify parsing, ordering, resume, and safety logic—they do not assert live upstream site availability.

```text
novel-toolkit/
├── extension.js                  # Entry point: service wiring, 37 commands, editor listeners
├── package.json                  # Extension manifest: commands, keybindings, configuration schema
├── src/
│   ├── core/                     # Shared editor helpers (doc checks, line reads, sparse edits, exact jumps)
│   ├── commands/                 # Domain command modules (navigation, organize, files, batch, scrape)
│   ├── engine/                   # Pure JS engines (transforms, chapters, encoding, zh-convert, worker, cool18, pixiv)
│   ├── service/                  # Checker diagnostics, ScrapeManager coordinator, BatchProcessor
│   └── ui/                       # Vermilion & Ink webview HTML, client script, host controller, message whitelist
├── scripts/                      # OpenCC table generator and local VSIX updater
└── test/                         # 8 test suites, HTML fixtures, and wiring audit script
```

---

<div align="center">
  Released under the <a href="LICENSE">MIT License</a> · Traditional-to-Simplified tables built from OpenCC (Apache-2.0) data with novel-specific rules
</div>
