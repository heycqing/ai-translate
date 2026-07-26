// AI Translate - 哪些元素/文本值得翻译的判定规则
// UMD：浏览器挂 AITCollectRules 全局，Node 走 module.exports（供单测）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AITCollectRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BLOCK_TAGS = [
    'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'TD', 'TH', 'BLOCKQUOTE', 'DD', 'DT', 'FIGCAPTION', 'CAPTION', 'SUMMARY'
  ];
  const SKIP_TAGS = [
    'CODE', 'PRE', 'SCRIPT', 'STYLE', 'NOSCRIPT',
    'TEXTAREA', 'INPUT', 'SELECT', 'KBD', 'SAMP',
    'CANVAS', 'MATH'
  ];
  // 这些元素天然构成一个翻译语义单元。其内部即使有 span/strong 等内联节点，
  // 也由外层统一翻译，避免一句话被拆成多个缺少上下文的短片段。
  const TEXT_UNIT_TAGS = BLOCK_TAGS.concat([
    'A', 'BUTTON', 'LABEL', 'LEGEND'
  ]);
  const ATTRIBUTE_NAMES = ['aria-label', 'title', 'placeholder'];
  // 弹窗正文经常只用 div/span/button 等 UI 标签，不能沿用正文页面的块级标签白名单。
  // class 选择器用于兼容没有补 role/aria-modal 的常见组件库弹窗。
  const POPUP_ROOT_SELECTOR = [
    'dialog', '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]', '[popover]',
    '[class*="modal" i]', '[class*="dialog" i]', '[class*="popup" i]',
    '[class*="popover" i]', '[class*="drawer" i]'
  ].join(',');
  const POPUP_TEXT_TAGS = [
    'DIV', 'SPAN', 'LABEL', 'BUTTON', 'A', 'LEGEND', 'SMALL', 'STRONG', 'EM'
  ];
  // 固定高度 UI 不能追加块级译文，否则会与相邻文字/控件重叠。
  // 这些上下文中的译文使用紧凑行内布局，正文段落仍保持上下双语。
  const COMPACT_TRANSLATION_SELECTOR = [
    'nav', 'header', 'label',
    '[role="navigation"]', '[role="menu"]', '[role="menubar"]', '[role="menuitem"]',
    '[role="combobox"]', '[role="listbox"]', '[role="option"]',
    '[class*="globalnav" i]', '[class*="localnav" i]',
    '[class*="navbar" i]', '[class*="navigation" i]',
    '[class*="field-label" i]', '[class*="input-label" i]', '[class*="select-label" i]'
  ].join(',');
  const BLOCK_SELECTOR = BLOCK_TAGS.join(',').toLowerCase();
  const POPUP_TEXT_SELECTOR = POPUP_TEXT_TAGS.join(',').toLowerCase();
  const POPUP_CANDIDATE_SELECTOR = BLOCK_SELECTOR + ',' + POPUP_TEXT_SELECTOR;

  // 至少 2 个字符且含字母（含欧文变音/西里尔）或 CJK（中日韩），纯数字/符号不翻
  function isTranslatableText(text) {
    if (!text) return false;
    const t = text.trim();
    if (t.length < 2) return false;
    return /[A-Za-zÀ-ɏЀ-ӿ぀-ヿ一-鿿가-힯]/.test(t);
  }

  return {
    BLOCK_TAGS,
    SKIP_TAGS,
    TEXT_UNIT_TAGS,
    ATTRIBUTE_NAMES,
    BLOCK_SELECTOR,
    POPUP_ROOT_SELECTOR,
    POPUP_TEXT_TAGS,
    POPUP_TEXT_SELECTOR,
    POPUP_CANDIDATE_SELECTOR,
    COMPACT_TRANSLATION_SELECTOR,
    isTranslatableText
  };
});
