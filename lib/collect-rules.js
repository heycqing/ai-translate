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
    'TEXTAREA', 'INPUT', 'SELECT', 'KBD', 'SAMP', 'SVG', 'MATH'
  ];
  const BLOCK_SELECTOR = BLOCK_TAGS.join(',').toLowerCase();

  // 至少 2 个字符且含字母（含欧文变音/西里尔）或 CJK（中日韩），纯数字/符号不翻
  function isTranslatableText(text) {
    if (!text) return false;
    const t = text.trim();
    if (t.length < 2) return false;
    return /[A-Za-zÀ-ɏЀ-ӿ぀-ヿ一-鿿가-힯]/.test(t);
  }

  return { BLOCK_TAGS, SKIP_TAGS, BLOCK_SELECTOR, isTranslatableText };
});
