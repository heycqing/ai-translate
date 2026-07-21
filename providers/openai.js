// AI Translate - OpenAI 兼容通道（DeepSeek/OpenAI/智谱/本地代理通用）
// 只在 background service worker 里运行
(function (root) {
  async function translate(texts, targetLang, cfg) {
    const messages = AITPrompt.buildMessages(texts, targetLang, cfg.systemPrompt);
    const url = cfg.baseURL.replace(/\/+$/, '') + '/chat/completions';
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey
      },
      body: JSON.stringify({ model: cfg.model, messages: messages, temperature: 0.2 })
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error('API ' + resp.status + ': ' + body.slice(0, 200));
    }
    const data = await resp.json();
    const content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : null;
    return AITPrompt.parseTranslations(content, texts.length);
  }

  root.AITOpenAI = { translate };
})(self);
