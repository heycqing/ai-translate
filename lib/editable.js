// AI Translate - 输入框识别与文本读写（UMD，供 content script 与 Node 单测复用）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AITEditable = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const INPUT_TYPES = ['text', 'search', 'email', 'url', 'tel'];

  function isSupportedInputType(type) {
    return INPUT_TYPES.indexOf(String(type || 'text').toLowerCase()) !== -1;
  }

  function isEditableElement(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') return isSupportedInputType(el.type);
    return el.isContentEditable === true;
  }

  function getText(el) {
    const tag = String(el && el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA'
      ? String(el.value || '')
      : String((el && el.innerText) || '');
  }

  return { INPUT_TYPES, isSupportedInputType, isEditableElement, getText };
});
