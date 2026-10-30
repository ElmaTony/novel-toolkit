'use strict';

// 面板 ⇄ 扩展主机 的消息协议（两端共享，防漂移）
// 一致性测试（test/panel.test.js）会校验:
//   前端脚本里出现的每个 command 都在下面两个列表中；
//   面板控制器处理的每个 command 也在这里。

module.exports = {
  // 面板按钮/脚本可直接触发的 novelToolkit.* 命令白名单
  RUNNABLE: [
    'merge', 'dedent', 'indent', 'removeBlankLines', 'blankBeforeChapters', 'unifyChapterNumbers', 'normalizeEllipsis', 'checkChapters',
    'replaceCornerQuotes', 'fullwidthToHalfwidth',
    'check', 'nextProblem', 'prevProblem', 'nextShort', 'prevShort',
    'nextQuote', 'prevQuote',
    'nextChapter', 'prevChapter',
    'cool18OpenOutput', 'cool18Search', 'showScrapeLog',
    'pixivSetCookie', 'pixivGrabUser', 'pixivUpdate', 'pixivOpenOutput', 'scrapeCancel',
    'setupEncoding', 'detectEncoding', 'convertToUtf8', 'showHistory',
    't2sFile',
    'batchProcess', 'batchConvert',
  ],

  // 面板脚本发给主机的自定义消息（run 之外）
  HOST_COMMANDS: [
    'refresh', 'chapter', 'scrapePreview',
    'cool18Grab', 'cool18GrabFile',
    'pixivGrab', 'pixivGrabFile', 'pixivCancel',
    'setCookie', 'renameFile',
  ],

  // 主机 → 面板 的推送类型
  PUSH_TYPES: ['update', 'cursor', 'scrapeState', 'scrapePreview', 'task'],
};
