const translateToggle = document.querySelector("#translate-toggle");
const readerDemo = document.querySelector(".reader-demo");
const translateStatus = document.querySelector("#translate-status");
const toggleLabel = translateToggle.querySelector(".toggle-label");
const translatedTexts = [...document.querySelectorAll(".translated-text")];

translateToggle.addEventListener("click", () => {
  const isOn = translateToggle.getAttribute("aria-pressed") === "true";
  translateToggle.setAttribute("aria-pressed", String(!isOn));
  translateToggle.classList.toggle("is-on", !isOn);
  readerDemo.classList.toggle("is-source-only", isOn);
  translatedTexts.forEach((text) => {
    text.setAttribute("aria-hidden", String(isOn));
  });
  translateStatus.textContent = isOn ? "当前仅显示原文" : "双语对照已开启";
  toggleLabel.textContent = isOn ? "翻译此页" : "还原原文";
});

const sceneContent = {
  select: {
    description: "选中没看懂的一小段，点一下“译”浮标；也可以直接使用右键菜单。",
    topbar: "github.com / discussion / 1842",
    source:
      "The edge case only appears when the request is interrupted between two streamed chunks.",
    selection: "interrupted between two streamed chunks",
    badge: "译",
    translation: "这个边缘情况只会在请求恰好中断于两个流式数据块之间时出现。",
    meta: "DeepSeek · 已缓存",
  },
  input: {
    description: "聚焦输入框后按 Alt+T，翻译结果会直接替换当前内容；输入有变化时不会误覆盖。",
    topbar: "community.example.com / reply",
    source:
      "I reproduced the issue and will send a minimal example this afternoon.",
    selection: "Alt+T",
    badge: "T",
    translation: "我已经复现了这个问题，今天下午会发一个最小示例。",
    meta: "输入框翻译 · 内容已替换",
  },
  popup: {
    description:
      "页面翻译开启后，稍后出现的 dialog、modal、iframe 和 open Shadow DOM 弹窗也会自动补翻。",
    topbar: "account.example.com / settings / region",
    source:
      "Your country or region determines available services and payment methods.",
    selection: "动态弹窗",
    badge: "窗",
    translation: "你的国家或地区决定了可用的服务和付款方式。",
    meta: "iframe · 自动补翻 · 紧凑排版",
  },
  restore: {
    description: "想核对原文时再按一次 Alt+A，所有译文立即收起，网页回到原始状态。",
    topbar: "docs.example.com / guide / streaming",
    source:
      "Restore the original page at any time without refreshing or losing your reading position.",
    selection: "Alt+A",
    badge: "A",
    translation: "无需刷新，也不会丢失阅读位置；你可以随时还原原始网页。",
    meta: "原文位置已保留",
  },
};

const sceneTabs = [...document.querySelectorAll(".scene-tab")];
const sceneDescription = document.querySelector("#scene-description");
const sceneTopbar = document.querySelector(".context-topbar span:first-child");
const sceneSource = document.querySelector("#scene-source");
const selectionMark = document.querySelector("#selection-mark");
const selectionBadge = document.querySelector("#selection-badge");
const selectionTranslation = document.querySelector("#selection-result p");
const selectionMeta = document.querySelector("#selection-result small");
const scenePanel = document.querySelector("#scene-panel");

function setActiveTab(tabs, activeTab) {
  tabs.forEach((tab) => {
    const isActive = tab === activeTab;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });
}

function showScene(tab) {
  const scene = sceneContent[tab.dataset.scene];
  setActiveTab(sceneTabs, tab);
  scenePanel.setAttribute("aria-labelledby", tab.id);
  sceneDescription.textContent = scene.description;
  sceneTopbar.textContent = scene.topbar;
  sceneSource.textContent = scene.source;
  selectionMark.textContent = scene.selection;
  selectionBadge.textContent = scene.badge;
  selectionTranslation.textContent = scene.translation;
  selectionMeta.textContent = scene.meta;
}

sceneTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => showScene(tab));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + sceneTabs.length) % sceneTabs.length;
    sceneTabs[nextIndex].focus();
    showScene(sceneTabs[nextIndex]);
  });
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.querySelector(`#${button.dataset.copy}`);
    const label = button.querySelector(".copy-label");

    try {
      await navigator.clipboard.writeText(target.textContent);
      label.textContent = "已复制";
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
      label.textContent = "已选中";
    }

    window.setTimeout(() => {
      label.textContent = "复制命令";
    }, 1800);
  });
});
