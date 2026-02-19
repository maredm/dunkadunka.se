param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$HostPath = Join-Path $RootDir "host\volume_host.py"
$TemplatePath = Join-Path $RootDir "host\com.dunkadunka.volume_host.template.json"
$TargetDir = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data\NativeMessagingHosts"
$TargetFile = Join-Path $TargetDir "com.dunkadunka.volume_host.json"

New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

$template = Get-Content $TemplatePath -Raw
$template = $template.Replace("__HOST_PATH__", $HostPath.Replace("\\", "\\\\"))
$template = $template.Replace("__EXTENSION_ID__", $ExtensionId)
Set-Content -Path $TargetFile -Value $template -Encoding UTF8

$regPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.dunkadunka.volume_host"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(default)" -Value $TargetFile

Write-Host "Installed native host manifest at: $TargetFile"
Write-Host "Registered key: $regPath"
