// AI Translate - 目标语言(自然语言名) → 谷歌翻译语言码
// UMD：浏览器/worker 挂 AITLangCodes 全局，Node 走 module.exports（供单测）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AITLangCodes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const GOOGLE_MAP = { '简体中文': 'zh-CN', 'English': 'en', '日本語': 'ja' };

  function toGoogleLang(targetLang) {
    return GOOGLE_MAP[targetLang] || 'zh-CN';
  }

  return { toGoogleLang };
});
