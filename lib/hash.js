// AI Translate - 缓存键哈希（FNV-1a 32 位）
// UMD：浏览器/worker 挂 AITHash 全局，Node 走 module.exports（供单测）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AITHash = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      // 等价于 h *= 16777619，拆成移位加法避免 32 位溢出精度问题
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  // 哈希 + 文本长度 + 语言 + 模型：哈希碰撞时长度兜底，语言/模型隔离缓存空间
  function makeCacheKey(text, targetLang, model) {
    return fnv1a(text) + ':' + text.length + ':' + targetLang + ':' + model;
  }

  return { fnv1a, makeCacheKey };
});
