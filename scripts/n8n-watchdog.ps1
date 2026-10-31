<#
  حارس مسار n8n — يفحص كل دقيقتين إن رسائل Meta تگدر توصل لـ n8n، ويرجّع المسار إذا انقطع.

  الفحوصات بالترتيب:
    1. n8n المحلي (127.0.0.1:5678/healthz) — إذا واقف يعيد تشغيل خدمة BariqN8nBackgroundService.
    2. الإنترنت — إذا مقطوع ما يسوي شي (ماكو شي ينصلح من الجهاز)، بس يسجّل.
    3. الرابط العام عبر نفس طريق Meta (عناوين Funnel العامة، مو عنوان 100.x الداخلي) —
       إذا ما يستجيب: يعيد «tailscale funnel --bg 5678»، وإذا بعده واقف يعيد تشغيل خدمة Tailscale.

  السجل: C:\ProgramData\Bariq\n8n-watchdog.log (يتسجل بس تغيّر الحالة والإصلاحات، مو كل فحص).

  الاستعمال:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\n8n-watchdog.ps1 -DryRun   # فحص بلا إصلاح
    التثبيت كمهمة مجدولة: scripts\install-n8n-watchdog.ps1 (كمسؤول)
#>
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$FunnelHost = 'bariq-n8n.tail7a92cb.ts.net'
$N8nPort = 5678
$N8nTask = 'BariqN8nBackgroundService'
$LogDir = Join-Path $env:ProgramData 'Bariq'
$LogFile = Join-Path $LogDir 'n8n-watchdog.log'
$StateFile = Join-Path $LogDir 'n8n-watchdog.state'

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

function Write-Log([string]$msg) {
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Write-Output $line
  if ($DryRun) { return }
  if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 1MB) { Move-Item $LogFile "$LogFile.1" -Force }
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

# يسجّل بس إذا الحالة تغيّرت، حتى السجل ما يمتلي بـ «OK» كل دقيقتين
function Set-State([string]$state, [string]$msg) {
  $prev = if (Test-Path $StateFile) { (Get-Content $StateFile -Raw).Trim() } else { '' }
  if ($prev -ne $state -or $DryRun) { Write-Log "[$state] $msg" }
  if (-not $DryRun) { Set-Content -Path $StateFile -Value $state -Encoding UTF8 }
}

function Test-Http([string]$url, [int]$expect = 200) {
  try { return (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10).StatusCode -eq $expect } catch { return $false }
}

function Test-Local { Test-Http "http://127.0.0.1:$N8nPort/healthz" }

function Test-Internet { (Test-Http 'https://www.gstatic.com/generate_204' 204) -or (Test-Http 'https://cloudflare.com/cdn-cgi/trace') }

# عناوين Funnel العامة من DNS عام (DoH)، لأن DNS الجهاز يرجّع عنوان Tailscale الداخلي ويتجاوز الـ Funnel
function Get-PublicIps {
  try {
    $r = Invoke-RestMethod -Uri "https://dns.google/resolve?name=$FunnelHost&type=A" -TimeoutSec 10
    return @($r.Answer | Where-Object { $_.type -eq 1 } | ForEach-Object { $_.data })
  } catch { return @() }
}

# $true = يستجيب، $false = ما يستجيب، $null = ما گدرنا نفحص (DNS العام فشل)
function Test-Public {
  $ips = Get-PublicIps
  if ($ips.Count -eq 0) { return $null }
  foreach ($ip in $ips | Select-Object -First 2) {
    $out = & curl.exe -s -m 15 -o NUL -w '%{http_code}' --resolve "${FunnelHost}:443:$ip" "https://$FunnelHost/healthz" 2>$null
    if ($out -eq '200') { return $true }
  }
  return $false
}

function Test-FunnelConfig { ((& tailscale funnel status 2>&1) -join "`n") -match "Funnel on[\s\S]*127\.0\.0\.1:$N8nPort" }

function Restore-Funnel {
  & tailscale funnel --bg $N8nPort 2>&1 | Out-Null
  Start-Sleep -Seconds 15
}

# ---- 1. n8n المحلي ----
if (-not (Test-Local)) {
  if ($DryRun) { Set-State 'N8N_DOWN' "n8n ما يستجيب على المنفذ $N8nPort (DryRun: ما راح يعيد التشغيل)"; exit 1 }
  Set-State 'N8N_DOWN' "n8n ما يستجيب على المنفذ $N8nPort — إعادة تشغيل $N8nTask"
  try {
    Stop-ScheduledTask -TaskName $N8nTask -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName $N8nTask
  } catch { Write-Log "فشل تشغيل ${N8nTask}: $($_.Exception.Message)" }
  Start-Sleep -Seconds 60
  if (Test-Local) { Set-State 'N8N_RESTARTED' 'n8n رجع يشتغل' } else { Write-Log 'n8n بعده واقف بعد إعادة التشغيل' }
  exit 0
}

# ---- 2. الإنترنت ----
if (-not (Test-Internet)) { Set-State 'INTERNET_DOWN' 'الإنترنت مقطوع — بانتظار رجوعه'; exit 0 }

# ---- 3. الرابط العام (طريق Meta) ----
$public = Test-Public
if ($public -eq $true) { Set-State 'OK' "الرابط العام يستجيب (https://$FunnelHost)"; exit 0 }

if ($null -eq $public) {
  # ما گدرنا نفحص من برّه؛ على الأقل نتأكد إعدادات الـ Funnel موجودة
  if (Test-FunnelConfig) { Set-State 'UNKNOWN' 'DNS العام ما جاوب، وإعدادات Funnel موجودة'; exit 0 }
  Write-Log 'DNS العام ما جاوب، وإعدادات Funnel مفقودة'
}

if ($DryRun) { Set-State 'FUNNEL_DOWN' 'الرابط العام ما يستجيب (DryRun: ما راح يصلّح)'; exit 1 }

Set-State 'FUNNEL_DOWN' 'الرابط العام ما يستجيب — إعادة تشغيل Funnel'
Restore-Funnel
if ((Test-Public) -ne $false -and (Test-FunnelConfig)) { Set-State 'OK' 'رجع الرابط بعد إعادة Funnel'; exit 0 }

Write-Log 'بعده واقف — إعادة تشغيل خدمة Tailscale'
try { Restart-Service -Name Tailscale -Force } catch { Write-Log "فشل إعادة تشغيل Tailscale: $($_.Exception.Message)" }
Start-Sleep -Seconds 20
Restore-Funnel
if ((Test-Public) -eq $true) { Set-State 'OK' 'رجع الرابط بعد إعادة تشغيل Tailscale' } else { Write-Log 'الرابط بعده واقف — يحتاج تدخل يدوي' }
