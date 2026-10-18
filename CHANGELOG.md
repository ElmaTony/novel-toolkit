# Changelog

## 0.16.0

- 基于 open-claude-ui 的 Claude CDS 令牌重做面板 UI（陶土橙、暖灰表面、发丝边框、弹簧动效）
- 深浅色跟随 VSCode 主题
- 去掉面板 emoji，改为内联 SVG 与纯文本

## 0.15.0

- 架构重构：`extension.js` 拆分为 `src/commands/` 按领域模块 + `src/core/editor.js`
- 抓取优化：可中断指数退避重试、失败页重排队、默认间隔 1.0s ±20% 抖动、广告行保守清理
- 文本整理：智能合并段落、缩进规范化、章节前空行折叠、嵌套引号转换
- 章节识别：允许标题内 `！？…`、放宽长度、上下文兜底识别中等长度标题
- 新增设置：`smartParagraphs` / `indentNormalizeExisting` / `cool18MaxRetries` / `scrapeCleanAds`

## 0.14.0

- 初始公开基线：贴左检查、排版整理、章节导航、cool18/Pixiv 抓取、面板
