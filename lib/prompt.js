// AI Translate - 翻译请求组装与模型响应解析
// UMD：浏览器/worker 挂 AITPrompt 全局，Node 走 module.exports（供单测）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AITPrompt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULT_SYSTEM =
    '你是专业翻译引擎。用户会发来一个 JSON 字符串数组，把每个元素翻译成{targetLang}。' +
    '只输出翻译后的 JSON 字符串数组，元素数量和顺序必须与输入一致。' +
    '保留原文中的专有名词、代码片段和数字格式。不要输出任何解释或多余文字。';

  function buildMessages(texts, targetLang, systemPrompt) {
    const sys = (systemPrompt || DEFAULT_SYSTEM).replace('{targetLang}', targetLang);
    return [
      { role: 'system', content: sys },
      { role: 'user', content: JSON.stringify(texts) }
    ];
  }

  // 模型不一定听话：可能包 code fence、可能前后带话。宽松提取第一个 [...] 再严格校验
  function parseTranslations(content, expectedCount) {
    if (typeof content !== 'string' || !content.trim()) throw new Error('模型响应为空');
    let s = content.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    const start = s.indexOf('[');
    const end = s.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) throw new Error('响应中找不到 JSON 数组');
    let arr;
    try {
      arr = JSON.parse(s.slice(start, end + 1));
    } catch (e) {
      throw new Error('JSON 解析失败: ' + e.message);
    }
    if (!Array.isArray(arr) || arr.length !== expectedCount) {
      throw new Error('译文数量不匹配: 期望 ' + expectedCount + ' 实得 ' + (Array.isArray(arr) ? arr.length : '非数组'));
    }
    return arr.map(String);
  }

  return { DEFAULT_SYSTEM, buildMessages, parseTranslations };
});
