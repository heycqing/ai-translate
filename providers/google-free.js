// AI Translate - 谷歌免费翻译通道（无需 key，作快速通道与 AI 失败降级）
// 只在 background service worker 里运行
(function (root) {
  // 用 POST 把 q 放 body，避免长段落超 URL 长度上限
  async function translateOne(text, tl) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=' +
      encodeURIComponent(tl);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: 'q=' + encodeURIComponent(text)
    });
    if (!resp.ok) throw new Error('GoogleFree ' + resp.status);
    const data = await resp.json();
    // 响应形如 [[[译文段1, 原文段1, ...], [译文段2, ...]], ...]
    if (!data || !Array.isArray(data[0])) throw new Error('GoogleFree 响应格式异常');
    return data[0].map(function (seg) { return (seg && seg[0]) || ''; }).join('');
  }

  async function translate(texts, targetLang) {
    const tl = AITLangCodes.toGoogleLang(targetLang);
    return Promise.all(texts.map(function (t) { return translateOne(t, tl); }));
  }

  root.AITGoogleFree = { translate };
})(self);
