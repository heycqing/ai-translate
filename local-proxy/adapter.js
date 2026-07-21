// AI Translate - Chat Completions 请求与 Responses API 的协议转换
function normalizeContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(function (item) {
    return item && typeof item.text === 'string' ? item.text : '';
  }).filter(Boolean).join('\n');
}

function buildResponsesBody(chatBody, runtime) {
  const messages = chatBody && chatBody.messages;
  if (!Array.isArray(messages) || !messages.length) throw new Error('messages 必须是非空数组');

  const instructions = [];
  const input = [];
  messages.forEach(function (message) {
    const role = message && message.role;
    const content = normalizeContent(message && message.content);
    if (!content) return;
    if (role === 'system' || role === 'developer') instructions.push(content);
    else if (role === 'user' || role === 'assistant') input.push({ role: role, content: content });
  });
  if (!input.length) throw new Error('messages 中缺少有效的用户输入');

  const body = {
    model: runtime.model,
    input: input,
    store: false
  };
  if (instructions.length) body.instructions = instructions.join('\n\n');
  if (runtime.reasoningEffort) body.reasoning = { effort: runtime.reasoningEffort };
  return body;
}

function extractOutputText(response) {
  if (response && typeof response.output_text === 'string' && response.output_text) {
    return response.output_text;
  }
  const texts = [];
  const output = response && Array.isArray(response.output) ? response.output : [];
  output.forEach(function (item) {
    const content = item && Array.isArray(item.content) ? item.content : [];
    content.forEach(function (part) {
      if (part && part.type === 'output_text' && typeof part.text === 'string') texts.push(part.text);
    });
  });
  if (!texts.length) throw new Error('Responses API 未返回文本内容');
  return texts.join('');
}

function toChatCompletion(response, content) {
  return {
    id: (response && response.id) || 'local-response',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    choices: [{
      index: 0,
      message: { role: 'assistant', content: content },
      finish_reason: 'stop'
    }]
  };
}

module.exports = { buildResponsesBody, extractOutputText, toChatCompletion };
