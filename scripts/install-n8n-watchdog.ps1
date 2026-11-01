<#
  يثبّت حارس مسار n8n (scripts\n8n-watchdog.ps1) كمهمة مجدولة تشتغل كل دقيقتين وعند تشغيل الجهاز،
  بحساب SYSTEM حتى تشتغل حتى لو ماكو مستخدم مسجّل دخول.

  شغّله من PowerShell كمسؤول (Run as Administrator):
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-n8n-watchdog.ps1
  للإزالة:
    Unregister-ScheduledTask -TaskName BariqN8nWatchdog -Confirm:$false
#>
$ErrorActionPreference = 'Stop'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'شغّل هذا السكربت من PowerShell كمسؤول (Run as Administrator).' }

$TaskName = 'BariqN8nWatchdog'
$Script = Join-Path $PSScriptRoot 'n8n-watchdog.ps1'
if (-not (Test-Path $Script)) { throw "ما لگيت $Script" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$Script`""
$every2min = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2)
$atStartup = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $every2min, $atStartup -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Output "تم تثبيت $TaskName — يفحص كل دقيقتين."
Write-Output "السجل: $env:ProgramData\Bariq\n8n-watchdog.log"
