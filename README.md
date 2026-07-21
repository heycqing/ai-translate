# AI Translate

一个轻量的 Chrome MV3 双语网页翻译扩展。支持整页双语对照、划词/右键翻译、OpenAI 兼容模型、IndexedDB 缓存，以及 AI 接口不可用时自动降级到 Google 免费翻译。

> 当前版本：`0.4.1`。M1、M2 与 M3 已完成，核心日常翻译能力可用。

## 功能

- **整页双语对照**：在原文段落后插入译文，可随时还原
- **动态内容补翻**：自动处理无限滚动和页面新增内容
- **划词与右键翻译**：选中文本后点击“译”浮标，或使用右键菜单
- **多引擎配置**：支持 DeepSeek、OpenAI、智谱及其他 OpenAI 兼容接口
- **失败恢复**：批次失败会拆分重试，单段失败可点击重译
- **译文缓存**：相同原文、目标语言和模型优先读取 IndexedDB，减少重复请求
- **自动降级**：未配置 AI 引擎或 AI 请求失败时，使用 Google 免费翻译通道
- **快捷操作**：按 `Alt+A` 切换当前页面的翻译/还原状态
- **输入框翻译**：聚焦输入框后按 `Alt+T`，翻译结果会替换原内容
- **本地 Responses 转接**：可读取现有 Codex Provider 配置，通过本地代理接入 Responses API
- **本地自启动（Windows / macOS）**：安装一次 Native Host 后，登录自动启动代理，也可在扩展设置页检测、启动和修改配置
- **设置备份恢复**：可导出、导入引擎设置，便于扩展重新加载或迁移

## 安装

本项目无需构建，可直接以未打包扩展加载：

1. 下载或克隆本仓库。
2. 在 Chrome 打开 `chrome://extensions`。
3. 开启右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择本项目目录。
5. 右键扩展图标，打开“选项”完成引擎配置。

## 配置翻译引擎

设置页可以保存多个 OpenAI 兼容引擎，并在扩展弹窗中切换当前引擎。

以 DeepSeek 为例：

| 配置项 | 示例 |
| --- | --- |
| 名称 | `DeepSeek` |
| baseURL | `https://api.deepseek.com/v1` |
| API Key | `sk-...` |
| 模型 | `deepseek-chat` |

目标语言目前支持简体中文、English 和日本語。也可以不配置 AI 引擎，此时扩展会直接使用 Google 免费翻译通道。

## 使用

### 整页翻译

- 点击扩展图标，选择“翻译此页”或“还原原文”。
- 也可以按 `Alt+A` 在翻译与原文之间切换。
- 翻译进度和降级状态会显示在页面右下角。
- 失败段落会显示“翻译失败，点击重试”，点击即可单独重译。

### 划词翻译

- 选中可翻译文本，点击选区附近的“译”浮标。
- 或选中文本后右键，选择“翻译选中内容”。
- 点击翻译卡片之外的区域可关闭卡片。

### 输入框翻译

- 聚焦 `input`、`textarea` 或网页富文本编辑区，按 `Alt+T` 翻译全部内容。
- 密码框、只读控件和禁用控件不会被翻译。
- 如果请求期间输入内容发生变化，扩展会保留新内容，不会用异步翻译结果覆盖。
- 快捷键可在 `chrome://extensions/shortcuts` 中检查或重新绑定。

## 项目进度

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M1 | 整页双语对照、OpenAI 兼容 Provider、设置页 | ✅ 已完成 |
| M2 | 划词/右键翻译、IndexedDB 缓存、Google 免费通道降级 | ✅ 已完成并实机验证 |
| M3 | 输入框翻译（`Alt+T`） | ✅ 已完成 |
| M3 可选项 | Codex Responses Provider 本地代理转接 | ✅ 已完成，真实配置仅在运行时读取 |
| M3 可选项 | 登录自启动（Windows / macOS）、设置页本地代理控制 | ✅ 已完成 |

当前实现已经覆盖网页阅读、选中文本和输入回复三类主要场景。下一步建议完善缓存清理与容量策略，并增加浏览器端自动化回归。

## 本地 Responses 代理

扩展仍使用 OpenAI Chat Completions 格式；`local-proxy/` 会在本机把请求转换为 Responses API。代理只监听 `127.0.0.1`，运行时读取 Codex TOML，不会复制、修改或提交其中的端点、模型与密钥。

要求：Node.js 18 或更高版本，且目标 Codex Provider 使用 `wire_api = "responses"`。

### 推荐：安装登录自启动

1. 在 `chrome://extensions` 找到 AI Translate，刷新扩展。
2. 打开扩展“选项”，确认页面显示的扩展 ID。
3. 填写 Codex 配置路径、本地令牌和端口，按你的系统点击"复制 Windows 安装命令"或"复制 macOS 安装命令"，会展开一个可编辑的深色命令文本框，内容分两步：第 1 步进入项目根目录、第 2 步执行安装脚本。
4. 先在文本框里把第 1 步的占位路径改成你本机 clone 本项目的实际路径，再点击"复制全部"，或直接在文本框里全选复制。
   **Windows**：在 PowerShell 里粘贴，两步依次执行（也可以整段一次粘贴，注释行会被自动跳过）。
   **macOS**：在 Terminal 里粘贴，两步依次执行（需要先安装 Node.js 18+）。
5. 回到设置页点击“检测状态”；以后可用“保存并启动”修改配置并重启代理。

安装脚本会把本机控制程序和运行设置写入本机应用数据目录（Windows: `%LOCALAPPDATA%\AITranslate\local-proxy`；macOS: `~/Library/Application Support/AITranslate/local-proxy`），注册当前扩展 ID 对应的 Chrome Native Messaging Host，并添加当前用户的登录自启动项（Windows 写入 `HKCU...Run`；macOS 写入 `~/Library/LaunchAgents`）。它只保存配置路径、本地令牌和端口，不会复制上游模型配置或密钥到仓库。

如果扩展 ID 发生变化，需要用新 ID 再执行一次安装命令。

### 手动启动（可选）

在 PowerShell 中设置运行时变量。配置路径请指向你本机已有的 Codex Provider 配置；本地令牌可自行生成，并且不要提交到仓库：

```powershell
$env:AI_TRANSLATE_CODEX_CONFIG = 'C:\path\to\your-provider.config.toml'
$env:AI_TRANSLATE_PROXY_TOKEN = [guid]::NewGuid().ToString('N')
node local-proxy/server.js
```

代理会从 TOML 中读取当前 `model_provider`、`model`、`base_url`、`wire_api` 和 `env_key`，然后从 `env_key` 指向的环境变量取得上游密钥。也可以完全不读取 TOML，改用以下运行时变量：

- `AI_TRANSLATE_RESPONSES_URL`：完整的 `/responses` 地址
- `AI_TRANSLATE_MODEL`：运行时模型名
- `AI_TRANSLATE_UPSTREAM_API_KEY`：上游密钥
- `AI_TRANSLATE_REASONING_EFFORT`：可选推理强度
- `AI_TRANSLATE_PROXY_PORT`：可选本地端口，默认 `8787`

### 扩展设置

在扩展“选项”中新增一个引擎：

| 配置项 | 值 |
| --- | --- |
| 名称 | `Local Responses Proxy` |
| baseURL | `http://127.0.0.1:8787/v1` |
| API Key | 与 `AI_TRANSLATE_PROXY_TOKEN` 相同 |
| 模型 | `local-proxy`（实际模型由代理运行时配置决定） |

使用设置页的“保存并启动”后，扩展会自动新增并启用这条本地引擎，无需手工填写。也可按上表手工配置。启动后可访问 `http://127.0.0.1:8787/health` 检查状态；健康检查不会返回上游地址、模型或密钥。

## 设置持久化与迁移

目标语言、引擎列表、API Key 和本地代理控制参数保存在 `chrome.storage.local`。只要扩展 ID 和 Chrome 用户资料不变，正常刷新代码或升级版本会继续使用原设置。

以下操作可能让 Chrome 分配新的存储空间：删除后重新加载扩展、从不同目录加载、扩展 ID 改变，或更换 Chrome 用户资料。更新前可在设置页点击“导出设置 JSON”，更新后再导入。备份文件包含 API Key 和本地令牌，不能提交到 Git 或公开分享。

## 开发与测试

- 技术栈：Chrome Manifest V3、原生 JavaScript、无构建步骤
- 网络边界：所有翻译请求统一由 background service worker 发出

修改代码后，在 `chrome://extensions` 中刷新扩展即可生效。纯函数测试可直接使用 Node.js 运行：

```text
node tests/batcher.test.js
node tests/collect-rules.test.js
node tests/editable.test.js
node tests/hash.test.js
node tests/input-translate.test.js
node tests/lang-codes.test.js
node tests/local-proxy-adapter.test.js
node tests/local-proxy-config.test.js
node tests/local-proxy-server.test.js
node tests/prompt.test.js
node tests/settings.test.js
```

建议在发布改动前额外手测：长文章、包含代码块的 GitHub 页面、无限滚动页面、划词/右键入口、缓存命中、错误 Key 降级和零配置降级。

## 已知限制

- 译文使用纯文本，不保留段落内的链接、加粗等内联格式。
- 尚未检测原文是否已是目标语言，翻译同语种页面可能产生不必要的请求。
- 缓存没有过期时间或容量上限，也没有图形化清理入口。需要清空时，可在扩展 service worker 控制台执行 `indexedDB.deleteDatabase('ai-translate-cache')`。
- 尚无浏览器端自动化测试；当前自动测试只覆盖可独立运行的纯函数。
- 富文本编辑区翻译会替换为纯文本，不保留原有富文本格式。
- 非 Windows 环境下，本地 Responses 代理仍需手动保持运行；Windows 可使用随项目提供的登录自启动安装脚本。
- 暂未支持 PDF/EPUB、视频字幕及 Chrome 商店发布。

## 隐私说明

待翻译文本会发送到当前选中的翻译服务；发生降级时会发送到 Google 免费翻译接口。Provider 配置和 API Key 保存在本机的 `chrome.storage.local` 中。

## 作者与链接

- **作者**：[heycqing](https://github.com/heycqing)
- **个人博客**：[https://blog.haiqing.uk/blog/](https://blog.haiqing.uk/blog/)
- **GitHub 仓库**：[https://github.com/heycqing/ai-translate](https://github.com/heycqing/ai-translate)

