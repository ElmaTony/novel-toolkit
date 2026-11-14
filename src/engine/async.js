'use strict';
// 完成等待后及时移除取消监听；可被所有抓取器复用。
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new Error('已取消'));
    const finish = (error) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(new Error('已取消'));
    const timer = setTimeout(() => finish(), Math.max(0, ms));
    if (signal) signal.addEventListener('abort', abort, { once: true });
  });
}
module.exports = { sleep };
