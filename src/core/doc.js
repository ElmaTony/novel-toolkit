'use strict';

// 零 vscode 依赖的编辑器文档判定，供扩展入口、editor 工具与 Webview 面板宿主共用。
function isDocEditor(editor) {
  if (!editor || !editor.document || editor.document.isClosed) {
    return false;
  }
  const scheme = editor.document.uri && editor.document.uri.scheme;
  return !scheme || scheme === 'file' || scheme === 'untitled';
}

module.exports = { isDocEditor };
