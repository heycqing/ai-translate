[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string]$ExtensionId,

    [string]$CodexConfigPath = '%USERPROFILE%\.codex\dycodex.config.toml',

    [string]$ProxyToken = '',

    [ValidateRange(1, 65535)]
    [int]$Port = 8787
)

$ErrorActionPreference = 'Stop'
$serverPath = Join-Path $PSScriptRoot 'server.js'
$sourcePath = Join-Path $PSScriptRoot 'windows\native-host.cs'
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$nodePath = $nodeCommand.Source
$expandedConfigPath = [Environment]::ExpandEnvironmentVariables($CodexConfigPath)

if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
    throw "找不到代理入口: $serverPath"
}
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "找不到 Native Host 源码: $sourcePath"
}
if (-not (Test-Path -LiteralPath $expandedConfigPath -PathType Leaf)) {
    throw "找不到 Codex 配置文件: $expandedConfigPath"
}
if ([string]::IsNullOrWhiteSpace($ProxyToken)) {
    $ProxyToken = [guid]::NewGuid().ToString('N')
}

$installRoot = Join-Path $env:LOCALAPPDATA 'AITranslate\local-proxy'
$hostExe = Join-Path $installRoot 'ai-translate-native-host.exe'
$settingsPath = Join-Path $installRoot 'settings.json'
$manifestPath = Join-Path $installRoot 'com.ai_translate.local_proxy.json'
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null

$compilerCandidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compilerPath = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $compilerPath) {
    throw '找不到 Windows .NET Framework C# 编译器。'
}
$temporaryExe = Join-Path $installRoot ('native-host-' + [guid]::NewGuid().ToString('N') + '.exe')
& $compilerPath /nologo /target:winexe /reference:System.Web.Extensions.dll "/out:$temporaryExe" $sourcePath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $temporaryExe -PathType Leaf)) {
    throw 'Native Host 编译失败。'
}
if (Test-Path -LiteralPath $hostExe -PathType Leaf) {
    [System.IO.File]::Delete($hostExe)
}
Move-Item -LiteralPath $temporaryExe -Destination $hostExe

$settings = [ordered]@{
    NodePath = $nodePath
    ServerPath = $serverPath
    ConfigPath = $expandedConfigPath
    Token = $ProxyToken
    Port = $Port
    ProxyPid = 0
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json), $utf8NoBom)

$nativeManifest = [ordered]@{
    name = 'com.ai_translate.local_proxy'
    description = 'AI Translate local Responses proxy controller'
    path = $hostExe
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
}
[System.IO.File]::WriteAllText($manifestPath, ($nativeManifest | ConvertTo-Json), $utf8NoBom)

$nativeRegistry = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.ai_translate.local_proxy'
New-Item -Path $nativeRegistry -Force | Out-Null
Set-Item -LiteralPath $nativeRegistry -Value $manifestPath

$runRegistry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-Item -Path $runRegistry -Force | Out-Null
Set-ItemProperty -LiteralPath $runRegistry -Name 'AITranslateLocalProxy' -Value ('"{0}" --autostart' -f $hostExe)

Start-Process -FilePath $hostExe -ArgumentList '--autostart' -WindowStyle Hidden

Write-Host ''
Write-Host 'AI Translate 本地代理已安装并加入 Windows 登录自启动。'
Write-Host "扩展 ID: $ExtensionId"
Write-Host "本地地址: http://127.0.0.1:$Port/v1"
Write-Host "本地令牌: $ProxyToken"
Write-Host '回到扩展设置页点击“检测状态”；以后修改路径、令牌或端口可点击“保存并启动”。'
