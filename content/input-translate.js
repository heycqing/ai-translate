// AI Translate - 输入框翻译：聚焦可编辑控件后按 Alt+T，将全部内容翻译并替换
(function () {
  let toast = null;
  let toastTimer = null;
  const translating = new WeakSet();

  function showToast(text, autohideMs) {
    clearTimeout(toastTimer);
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'ait-toast ait-input-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.hidden = false;
    if (autohideMs > 0) {
      toastTimer = setTimeout(function () { toast.hidden = true; }, autohideMs);
    }
  }

  // 逐层进入 open shadow root，兼容常见 Web Component 表单。
  function getDeepActiveElement() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  function getActiveEditable() {
    const active = getDeepActiveElement();
    if (self.AITEditable.isEditableElement(active)) return active;
    if (active && active.closest) {
      const host = active.closest('[contenteditable="true"], [contenteditable=""]');
      if (self.AITEditable.isEditableElement(host)) return host;
    }
    return null;
  }

  // 使用原生 setter，避免 React 等框架拦截实例 value setter 后收不到更新。
  function setControlValue(el, value) {
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      const proto = tag === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) descriptor.set.call(el, value);
      else el.value = value;
      if (typeof el.setSelectionRange === 'function') el.setSelectionRange(value.length, value.length);
    } else {
      el.textContent = value;
    }
    try {
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: value
      }));
    } catch (e) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function translateActiveInput() {
    const el = getActiveEditable();
    if (!el) {
      showToast('请先聚焦可编辑的输入框', 2200);
      return;
    }
    if (translating.has(el)) {
      showToast('这个输入框正在翻译…', 1600);
      return;
    }

    const original = self.AITEditable.getText(el);
    if (!self.AITCollectRules.isTranslatableText(original)) {
      showToast('输入框中没有可翻译的文本', 2200);
      return;
    }

    translating.add(el);
    showToast('正在翻译输入框…');
    let resp;
    try {
      resp = await chrome.runtime.sendMessage({ type: 'translate', texts: [original] });
    } catch (e) {
      resp = { ok: false, error: String(e) };
    } finally {
      translating.delete(el);
    }

    if (!resp || !resp.ok) {
      showToast('输入框翻译失败：' + ((resp && resp.error) || '未知错误'), 3500);
      return;
    }
    if (!el.isConnected) {
      showToast('输入框已离开页面，未替换内容', 2500);
      return;
    }
    if (self.AITEditable.getText(el) !== original) {
      showToast('输入内容已变化，已保留当前内容', 2800);
      return;
    }

    setControlValue(el, resp.translations[0]);
    el.focus();
    if (resp.degraded === 'fallback') showToast('翻译完成（AI 失败，已使用免费通道）', 3000);
    else if (resp.degraded === 'no-provider') showToast('翻译完成（使用免费通道）', 2600);
    else showToast('输入框翻译完成 ✓', 2000);
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.type !== 'translate-active-input') return;
    // all_frames 开启后消息会到达所有 frame。顶层 document 的焦点若是 iframe，
    // 由该子 frame 自己处理，避免顶层同时提示“请先聚焦输入框”。
    const active = document.activeElement;
    if (active && String(active.tagName).toUpperCase() === 'IFRAME') return;
    if (!document.hasFocus()) return;
    translateActiveInput();
  });

  self.AITInput = { translateActiveInput: translateActiveInput };
})();
