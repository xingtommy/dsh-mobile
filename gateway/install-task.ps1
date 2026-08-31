# dsh-gateway lifecycle installer (Windows).
#
# Registers the gateway as a logon scheduled task so it survives reboots and
# `dsh web` restarts — an ordinary `node dsh-gateway.mjs` process dies with
# whatever console killed node, and nobody restarts it. This script is the
# Windows answer; see gateway/README.md for the Linux systemd equivalent.
#
#   install / update (default):   powershell -ExecutionPolicy Bypass -File install-task.ps1
#   non-default ports:            powershell -ExecutionPolicy Bypass -File install-task.ps1 -Listen 3082 -Target 127.0.0.1:3080
#   stop + unregister:            powershell -ExecutionPolicy Bypass -File install-task.ps1 -Remove
#   is it alive?:                 powershell -ExecutionPolicy Bypass -File install-task.ps1 -Status
#
# The task runs as the current user at logon, hidden, working directory pinned
# to this folder so `auth.json` is always found. Registration does not require
# elevation. After -Remove the running node process (if any) is left alone —
# stop it once via Task Manager or `Stop-Process -Name node` selectively.

#Requires -Version 5.1
[CmdletBinding(DefaultParameterSetName = 'install')]
param(
  [Parameter(ParameterSetName = 'install')] [int]$Listen = 3081,
  [Parameter(ParameterSetName = 'install')] [string]$Target = '127.0.0.1:3080',
  [Parameter(ParameterSetName = 'install')] [string]$TaskName = 'dsh-gateway',
  [Parameter(ParameterSetName = 'remove')] [switch]$Remove,
  [Parameter(ParameterSetName = 'status')] [switch]$Status
)

$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot

if ($Remove) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $existing) { Write-Host "task '$TaskName' is not registered"; exit 0 }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "removed scheduled task '$TaskName' (a running gateway process, if any, was left alone)"
  exit 0
}

if ($Status) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $existing) { Write-Host "task '$TaskName' is not registered"; exit 1 }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host ("task   : {0} (state: {1})" -f $TaskName, $existing.State)
  Write-Host ("last   : {0} (result 0x{1:X})" -f $info.LastRunTime, $info.LastTaskResult)
  $probe = Test-NetConnection 127.0.0.1 -Port $Listen -WarningAction SilentlyContinue -InformationLevel Quiet
  Write-Host ("port {0}: {1}" -f $Listen, $(if ($probe) { 'responding' } else { 'not responding (yet)' }))
  exit 0
}

# ---- install / update ----

$node = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $node) { throw 'node not found on PATH' }
if (-not (Test-Path (Join-Path $dir 'dsh-gateway.mjs'))) { throw "dsh-gateway.mjs not found in $dir" }
if (-not (Test-Path (Join-Path $dir 'auth.json'))) {
  Copy-Item (Join-Path $dir 'auth.example.json') (Join-Path $dir 'auth.json')
  Write-Host 'auth.json was missing — copied the example. SET A REAL PIN at http://127.0.0.1:3081/__setpin' -ForegroundColor Yellow
}

# A powershell wrapper keeps the node console window hidden at logon.
$inner = "node dsh-gateway.mjs --listen $Listen --target $Target"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -Command `"$inner`"" `
  -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "registered '$TaskName': node dsh-gateway.mjs at logon (listen $Listen -> $Target, dir $dir)"

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2
$probe = Test-NetConnection 127.0.0.1 -Port $Listen -WarningAction SilentlyContinue -InformationLevel Quiet
Write-Host $(if ($probe) { "gateway is up on 127.0.0.1:$Listen" } else { "started, but port $Listen is not answering yet — check Task Scheduler > $TaskName > History" })
