'use strict';

// 编码检测与解码（纯 Node, 无 vscode 依赖）
// 针对简中小说场景: UTF-8 / UTF-8 BOM / UTF-16 LE/BE / GB18030(兼容 GBK/GB2312) / Big5

function isAscii(buf) {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] > 0x7F) {
      return false;
    }
  }
  return true;
}

function hasCJK(s) {
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) ||
        (c >= 0x3040 && c <= 0x30FF) || (c >= 0x3000 && c <= 0x303F) ||
        (c >= 0xFF00 && c <= 0xFFEF) || (c >= 0xF900 && c <= 0xFAFF)) {
      return true;
    }
  }
  return false;
}

function safeDecoder(enc) {
  try {
    return new TextDecoder(enc);
  } catch (e) {
    return null; // small-icu 构建下 gb18030/big5 可能缺失
  }
}

// 简体/繁体高频特征字（简繁同形字不选，保证有区分度）
const S_CHARS = '会们这说对时后来点里么发开无经见现爱应体车马门长东问题记让读写场';
const T_CHARS = '會們這說對時後來點裡麼發開無經見現愛應體車馬門長東問題記讓讀寫場';
const S_SET = new Set(S_CHARS);
const T_SET = new Set(T_CHARS);

// 按 GB18030/Big5 解码并评分: 坏字符率越低、常用汉字占比与高频特征字命中越高越好
function scoreDoubleByte(buf, enc) {
  const dec = safeDecoder(enc);
  if (!dec) {
    return { enc, bad: 1, cjk: 0, marks: 0 };
  }
  const s = dec.decode(buf);
  const n = s.length || 1;
  let bad = 0;
  let cjk = 0;
  let marks = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 0xFFFD) {
      bad++;
    } else {
      if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) ||
          (c >= 0x3000 && c <= 0x303F) || (c >= 0xFF00 && c <= 0xFFEF)) {
        cjk++;
      }
      if (S_SET.has(ch) || T_SET.has(ch)) {
        marks++;
      }
    }
  }
  return { enc, bad: bad / n, cjk: cjk / n, marks: marks / n };
}

// 无 BOM 的 UTF-16 识别：UTF-16 每字符占 2 字节，与 GB/Big5/UTF-8（0x00 只出现在 NUL，文本中≈0）不同，
// ASCII 区字符（换行/空格/英数/半角标点）会带 0x00 填充；纯中文则高字节固定落在 CJK 区（0x4E-0x9F）
// 且奇偶位置严格分区——GB/Big5 双字节序列没有这种位置规律。返回 'utf16le' | 'utf16be' | null
function looksLikeUtf16(buf) {
  const n = Math.min(buf.length, 8192) & ~1;
  if (n < 64) {
    return null;
  }
  let zeros = 0;
  let evenZeros = 0;
  let oddHiCJK = 0;
  let evenHiCJK = 0;
  for (let i = 0; i < n; i += 2) {
    if (buf[i] === 0) { zeros++; evenZeros++; }
    if (buf[i + 1] === 0) { zeros++; }
    if (buf[i + 1] >= 0x4E && buf[i + 1] <= 0x9F) { oddHiCJK++; }  // LE: CJK 高字节在奇数位
    if (buf[i] >= 0x4E && buf[i] <= 0x9F) { evenHiCJK++; }         // BE: CJK 高字节在偶数位
  }
  const pairs = n / 2;
  if (zeros / n > 0.04) {
    // 0x00 填充字节集中在哪一侧，即是 LE（奇数位高字节在前 → 0x00 在偶…按字节序判断）
    return evenZeros > zeros - evenZeros ? 'utf16be' : 'utf16le';
  }
  if (oddHiCJK / pairs > 0.3 && oddHiCJK > evenHiCJK * 3) {
    return 'utf16le';
  }
  if (evenHiCJK / pairs > 0.3 && evenHiCJK > oddHiCJK * 3) {
    return 'utf16be';
  }
  return null;
}

// 返回编码 id: utf8 / utf8bom / utf16le / utf16be / gb18030 / big5
function detectEncoding(buf) {
  if (buf.length >= 2) {
    if (buf[0] === 0xFF && buf[1] === 0xFE) {
      return 'utf16le';
    }
    if (buf[0] === 0xFE && buf[1] === 0xFF) {
      return 'utf16be';
    }
  }
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return 'utf8bom';
  }
  if (isAscii(buf)) {
    return 'utf8';
  }
  // 无 BOM UTF-16 识别（必须在 GB/Big5 之前：GB18030 几乎对任意字节序列都"合法"，会抢先胜出）
  const u16 = looksLikeUtf16(buf);
  if (u16) {
    return u16;
  }
  // 严格 UTF-8 能解通: 含中文 → utf8; 完全没有中文且高字节密集 →
  // 大概率是 GB 系文本被误读成西里尔/拉丁（GB 字节常恰好是合法 UTF-8 序列）
  try {
    const utf = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    if (hasCJK(utf)) {
      return 'utf8';
    }
    let high = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] > 0x7F) {
        high++;
      }
    }
    if (high / buf.length < 0.2) {
      return 'utf8';
    }
  } catch (e) { /* 不是严格 UTF-8, 继续判 GB/Big5 */ }

  const gb = scoreDoubleByte(buf, 'gb18030');
  const big5 = scoreDoubleByte(buf, 'big5');
  // 高频特征字是"可读性"的直接证据：GB 解 Big5 文本会得到一堆罕用字，特征字命中≈0。
  // 只看 bad 率会系统性偏向 GB18030（其对任意字节几乎都合法），必须先用特征字纠偏。
  if (big5.marks > 0.02 && big5.marks > gb.marks * 2) {
    return 'big5';
  }
  if (gb.marks > 0.02 && gb.marks > big5.marks * 2) {
    return 'gb18030';
  }
  if (gb.bad < big5.bad) {
    return 'gb18030';
  }
  if (big5.bad < gb.bad) {
    return 'big5';
  }
  return gb.cjk >= big5.cjk ? 'gb18030' : 'big5';
}

// 字节 → 字符串（BOM 自动剥离）
// UTF-16 不走 TextDecoder：部分裁剪版 Node（small-icu）不支持该标签，
// Buffer.toString('utf16le') 是 V8 内建、无 ICU 依赖，BE 用字节交换复用
function decodeToUtf8(buf) {
  const enc = detectEncoding(buf);
  if (enc === 'utf16le' || enc === 'utf16be') {
    let body = buf;
    if (enc === 'utf16be') {
      body = Buffer.allocUnsafe(buf.length - (buf.length % 2));
      for (let i = 0; i + 1 < buf.length; i += 2) {
        body[i] = buf[i + 1];
        body[i + 1] = buf[i];
      }
    }
    let text = body.toString('utf16le');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // 剥 BOM
    return { encoding: enc, text };
  }
  let decoder = safeDecoder(enc);
  if (!decoder) {
    decoder = new TextDecoder('utf-8'); // 降级：解出含 U+FFFD 的文本，上层 needsReview/跳过逻辑会兜住
  }
  return { encoding: enc, text: decoder.decode(buf) };
}

module.exports = { detectEncoding, decodeToUtf8 };
