using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace AITranslateNativeHost
{
    public sealed class HostSettings
    {
        public string NodePath { get; set; }
        public string ServerPath { get; set; }
        public string ConfigPath { get; set; }
        public string Token { get; set; }
        public int Port { get; set; }
        public int ProxyPid { get; set; }
    }

    internal static class Program
    {
        private const int MaxMessageBytes = 1024 * 1024;
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

        private static string SettingsPath
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "AITranslate", "local-proxy", "settings.json");
            }
        }

        private static int Main(string[] args)
        {
            try
            {
                if (args.Length > 0 && args[0] == "--autostart")
                {
                    StartProxy(LoadSettings(), false);
                    return 0;
                }

                Dictionary<string, object> request = ReadMessage();
                string action = GetString(request, "action");
                if (action == "status")
                {
                    HostSettings settings = LoadSettings();
                    bool running = IsHealthy(settings.Port);
                    WriteMessage(Response(running, running
                        ? "本地代理运行正常（127.0.0.1:" + settings.Port + "）。"
                        : "本地代理当前未运行。", settings.Port));
                }
                else if (action == "start")
                {
                    HostSettings settings = LoadSettings();
                    bool running = StartProxy(settings, false);
                    WriteMessage(Response(running, running
                        ? "本地代理已启动。"
                        : "本地代理启动后未通过健康检查。", settings.Port));
                }
                else if (action == "configure")
                {
                    HostSettings settings = LoadSettings();
                    settings.ConfigPath = ExpandPath(GetString(request, "configPath"));
                    settings.Token = GetString(request, "token");
                    settings.Port = GetInt(request, "port");
                    ValidateSettings(settings);
                    StopManagedProxy(settings);
                    settings.ProxyPid = 0;
                    SaveSettings(settings);
                    bool running = StartProxy(settings, true);
                    WriteMessage(Response(running, running
                        ? "配置已保存，本地代理已启动并设为当前翻译引擎。"
                        : "配置已保存，但代理未通过健康检查。", settings.Port));
                }
                else
                {
                    WriteMessage(Response(false, "不支持的 Native Host 操作。", 0));
                }
                return 0;
            }
            catch (Exception error)
            {
                try { WriteMessage(Response(false, error.Message, 0)); }
                catch { Console.Error.WriteLine(error.ToString()); }
                return 1;
            }
        }

        private static Dictionary<string, object> Response(bool ok, string message, int port)
        {
            return new Dictionary<string, object>
            {
                { "ok", ok },
                { "message", message },
                { "port", port }
            };
        }

        private static HostSettings LoadSettings()
        {
            if (!File.Exists(SettingsPath)) throw new InvalidOperationException("本地代理尚未安装，请先执行首次安装命令。");
            HostSettings settings = Json.Deserialize<HostSettings>(File.ReadAllText(SettingsPath, Encoding.UTF8));
            ValidateSettings(settings);
            return settings;
        }

        private static void SaveSettings(HostSettings settings)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath));
            File.WriteAllText(SettingsPath, Json.Serialize(settings), new UTF8Encoding(false));
        }

        private static void ValidateSettings(HostSettings settings)
        {
            if (settings == null) throw new InvalidOperationException("本地代理设置无效。");
            settings.NodePath = ExpandPath(settings.NodePath);
            settings.ServerPath = ExpandPath(settings.ServerPath);
            settings.ConfigPath = ExpandPath(settings.ConfigPath);
            if (!File.Exists(settings.NodePath)) throw new FileNotFoundException("找不到 Node.js，请重新运行安装脚本。", settings.NodePath);
            if (!File.Exists(settings.ServerPath)) throw new FileNotFoundException("找不到 local-proxy/server.js，请重新运行安装脚本。", settings.ServerPath);
            if (!File.Exists(settings.ConfigPath)) throw new FileNotFoundException("找不到 Codex 配置文件。", settings.ConfigPath);
            if (String.IsNullOrWhiteSpace(settings.Token)) throw new InvalidOperationException("本地代理令牌不能为空。");
            if (settings.Port < 1 || settings.Port > 65535) throw new InvalidOperationException("本地代理端口无效。");
        }

        private static string ExpandPath(string value)
        {
            return Path.GetFullPath(Environment.ExpandEnvironmentVariables(value ?? String.Empty));
        }

        private static bool StartProxy(HostSettings settings, bool forceStart)
        {
            ValidateSettings(settings);
            if (!forceStart && IsHealthy(settings.Port)) return true;

            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = settings.NodePath;
            start.Arguments = Quote(settings.ServerPath) + " --config " + Quote(settings.ConfigPath) + " --port " + settings.Port;
            start.WorkingDirectory = Path.GetDirectoryName(settings.ServerPath);
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.WindowStyle = ProcessWindowStyle.Hidden;
            start.EnvironmentVariables["AI_TRANSLATE_PROXY_TOKEN"] = settings.Token;

            Process process = Process.Start(start);
            if (process == null) throw new InvalidOperationException("无法启动 Node.js 本地代理进程。");
            settings.ProxyPid = process.Id;
            SaveSettings(settings);

            for (int attempt = 0; attempt < 30; attempt++)
            {
                if (IsHealthy(settings.Port)) return true;
                if (process.HasExited) break;
                Thread.Sleep(150);
            }
            StopManagedProxy(settings);
            settings.ProxyPid = 0;
            SaveSettings(settings);
            return false;
        }

        private static void StopManagedProxy(HostSettings settings)
        {
            if (settings == null || settings.ProxyPid <= 0) return;
            try
            {
                Process process = Process.GetProcessById(settings.ProxyPid);
                if (String.Equals(process.ProcessName, "node", StringComparison.OrdinalIgnoreCase))
                {
                    process.Kill();
                    process.WaitForExit(2000);
                }
            }
            catch (ArgumentException) { }
            catch (InvalidOperationException) { }
        }

        private static bool IsHealthy(int port)
        {
            if (port < 1 || port > 65535) return false;
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/health");
                request.Method = "GET";
                request.Timeout = 500;
                request.ReadWriteTimeout = 500;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch (WebException) { return false; }
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        private static Dictionary<string, object> ReadMessage()
        {
            Stream input = Console.OpenStandardInput();
            byte[] lengthBytes = ReadExact(input, 4);
            int length = BitConverter.ToInt32(lengthBytes, 0);
            if (length < 1 || length > MaxMessageBytes) throw new InvalidDataException("Native Messaging 消息长度无效。");
            byte[] payload = ReadExact(input, length);
            return Json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(payload));
        }

        private static byte[] ReadExact(Stream stream, int count)
        {
            byte[] buffer = new byte[count];
            int offset = 0;
            while (offset < count)
            {
                int read = stream.Read(buffer, offset, count - offset);
                if (read <= 0) throw new EndOfStreamException("Native Messaging 输入不完整。");
                offset += read;
            }
            return buffer;
        }

        private static void WriteMessage(Dictionary<string, object> response)
        {
            byte[] payload = Encoding.UTF8.GetBytes(Json.Serialize(response));
            byte[] length = BitConverter.GetBytes(payload.Length);
            Stream output = Console.OpenStandardOutput();
            output.Write(length, 0, length.Length);
            output.Write(payload, 0, payload.Length);
            output.Flush();
        }

        private static string GetString(Dictionary<string, object> value, string key)
        {
            object found;
            return value != null && value.TryGetValue(key, out found) && found != null
                ? Convert.ToString(found)
                : String.Empty;
        }

        private static int GetInt(Dictionary<string, object> value, string key)
        {
            object found;
            if (value == null || !value.TryGetValue(key, out found)) return 0;
            return Convert.ToInt32(found);
        }
    }
}
