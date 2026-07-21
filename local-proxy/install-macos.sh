#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PATH="$SCRIPT_DIR/server.js"
NATIVE_HOST_SOURCE="$SCRIPT_DIR/macos/native-host.js"

EXTENSION_ID=""
CODEX_CONFIG_PATH="$HOME/.codex/dycodex.config.toml"
PROXY_TOKEN=""
PORT="8787"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --extension-id) EXTENSION_ID="$2"; shift 2 ;;
    --codex-config-path) CODEX_CONFIG_PATH="$2"; shift 2 ;;
    --proxy-token) PROXY_TOKEN="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    *) echo "错误：未知参数 $1" >&2; exit 1 ;;
  esac
done

if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  echo "错误：--extension-id 无效，应为 chrome://extensions 里显示的 32 位 a-p 字符扩展 ID。" >&2
  exit 1
fi

NODE_PATH="$(command -v node || true)"
if [[ -z "$NODE_PATH" ]]; then
  echo "错误：找不到 Node.js，请先安装 Node.js 18+。" >&2
  exit 1
fi

if [[ ! -f "$SERVER_PATH" ]]; then
  echo "错误：找不到代理入口 $SERVER_PATH" >&2
  exit 1
fi
if [[ ! -f "$NATIVE_HOST_SOURCE" ]]; then
  echo "错误：找不到 Native Host 源码 $NATIVE_HOST_SOURCE" >&2
  exit 1
fi

EXPANDED_CONFIG_PATH="${CODEX_CONFIG_PATH/#\~/$HOME}"
if [[ ! -f "$EXPANDED_CONFIG_PATH" ]]; then
  echo "错误：找不到 Codex 配置文件 $EXPANDED_CONFIG_PATH" >&2
  exit 1
fi

if [[ -z "$PROXY_TOKEN" ]]; then
  PROXY_TOKEN="$(openssl rand -hex 16)"
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [[ "$PORT" -lt 1 ]] || [[ "$PORT" -gt 65535 ]]; then
  echo "错误：--port 无效，必须是 1-65535 之间的整数。" >&2
  exit 1
fi

INSTALL_ROOT="$HOME/Library/Application Support/AITranslate/local-proxy"
HOST_PATH="$INSTALL_ROOT/ai-translate-native-host.js"
SETTINGS_PATH="$INSTALL_ROOT/settings.json"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/com.ai_translate.local_proxy.json"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$LAUNCH_AGENTS_DIR/com.ai_translate.local_proxy.plist"

mkdir -p "$INSTALL_ROOT"
{ printf '#!%s\n' "$NODE_PATH"; tail -n +2 "$NATIVE_HOST_SOURCE"; } > "$HOST_PATH"
chmod +x "$HOST_PATH"

cat > "$SETTINGS_PATH" <<JSON
{
  "nodePath": "$NODE_PATH",
  "serverPath": "$SERVER_PATH",
  "configPath": "$EXPANDED_CONFIG_PATH",
  "token": "$PROXY_TOKEN",
  "port": $PORT,
  "proxyPid": 0
}
JSON

mkdir -p "$MANIFEST_DIR"
cat > "$MANIFEST_PATH" <<JSON
{
  "name": "com.ai_translate.local_proxy",
  "description": "AI Translate local Responses proxy controller",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
JSON

mkdir -p "$LAUNCH_AGENTS_DIR"
cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ai_translate.local_proxy</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$HOST_PATH</string>
    <string>--autostart</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
PLIST

UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM/com.ai_translate.local_proxy" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST_PATH"

nohup "$HOST_PATH" --autostart >/dev/null 2>&1 &
disown || true

echo ""
echo "AI Translate 本地代理已安装并加入 macOS 登录自启动。"
echo "扩展 ID: $EXTENSION_ID"
echo "本地地址: http://127.0.0.1:$PORT/v1"
echo "本地令牌: $PROXY_TOKEN"
echo "运行日志: $INSTALL_ROOT/local-proxy.log"
echo "回到扩展设置页点击“检测状态”；以后修改路径、令牌或端口可点击“保存并启动”。"
