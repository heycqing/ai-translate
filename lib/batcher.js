// AI Translate - 段落分批纯函数
// UMD：浏览器挂 AITBatcher 全局，Node 走 module.exports（供单测）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AITBatcher = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // 把段落按字符预算/条数上限贪心合批，减少 API 请求次数
  function makeBatches(items, maxChars, maxItems) {
    maxChars = maxChars || 3500;
    maxItems = maxItems || 30;
    const batches = [];
    let cur = [];
    let curChars = 0;
    for (const item of items) {
      const len = item.text.length;
      if (cur.length && (curChars + len > maxChars || cur.length >= maxItems)) {
        batches.push(cur);
        cur = [];
        curChars = 0;
      }
      cur.push(item);
      curChars += len;
    }
    if (cur.length) batches.push(cur);
    return batches;
  }

  return { makeBatches };
});
