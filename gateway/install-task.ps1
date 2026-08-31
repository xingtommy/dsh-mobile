# dsh-gateway lifecycle installer (Windows).
#
# A bare `node dsh-gateway.mjs` process dies with whatever console killed node,
# so it needs a supervisor. Windows offers several; they differ in how
# "persistent" they look to security tooling and how easy they are to undo:
#
#   -Action install (default)  a .cmd in the user's Startup folder. Visible and
#                              toggleable in Task Manager -> Startup apps; delete
#                              the file to uninstall. No admin, no EDR-hostile
#                              persistence mechanism. Does not restart on crash.
#   -Action task               a logon Scheduled Task. Survives crashes
#                              (auto-restart) and reboots, but scheduled tasks
#                              are a security-sensitive persistence mechanism
#                              (MITRE T1053.005): corporate EDR/policy may flag
#                              them, and uninstalling the repo without cleanup
#                              leaves a dangling task. Prefer the Startup folder
#                              on managed machines.
#   -Action status             report both mechanisms + probe the port.
#   -Action remove             undo both mechanisms.
#
# All modes stay user-level: no elevation, no registry, no downloads.
#
#   install (Startup folder):  powershell -ExecutionPolicy Bypass -File install-task.ps1
#   install (scheduled task):  powershell -ExecutionPolicy Bypass -File install-task.ps1 -Action task
#   non-default ports:         ... -Listen 3082 -Target 127.0.0.1:3080
#   is it alive?:              powershell -ExecutionPolicy Bypass -File install-task.ps1 -Action status
#   uninstall everything:      powershell -ExecutionPolicy Bypass -File install-task.ps1 -Action remove
#
# Design note: -Action is a plain string, deliberately NOT a set of [switch]
# parameters - switch parameters fail to bind when the script is launched via
# `powershell -File` from certain wrapped/hosted sessions.
#
# Linux equivalent: the systemd user unit in gateway/README.md.

#Requires -Version 5.1
param(
  [ValidateSet('install', 'status', 'remove', 'task')] [string]$Action = 'install',
  [int]$Listen = 3081,
  [string]$Target = '127.0.0.1:3080',
  [string]$TaskName = 'dsh-gateway'
)

$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$startupCmd = Join-Path ([Environment]::GetFolderPath('Startup')) 'dsh-gateway-autostart.cmd'
$inner = "node dsh-gateway.mjs --listen $Listen --target $Target"

# Raw TCP probe: no Test-NetConnection (slow, chatty, returns a PSCustomObject).
function Test-GatewayPort {
  param([int]$Port)
  $client = New-Object Net.Sockets.TcpClient
  try {
    $client.Connect('127.0.0.1', $Port)
    return $client.Connected
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# ---------- remove: undo both mechanisms ----------
if ($Action -eq 'remove') {
  $removed = @()
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    $removed += "scheduled task '$TaskName'"
  }
  if (Test-Path $startupCmd) {
    Remove-Item $startupCmd -Force
    $removed += "startup entry '$startupCmd'"
  }
  if ($removed.Count -eq 0) { Write-Host 'nothing to remove'; exit 0 }
  Write-Host ("removed: {0}" -f ($removed -join ', '))
  Write-Host 'a running gateway node process (if any) was left alone - stop it once by hand.'
  exit 0
}

# ---------- status: report both mechanisms ----------
if ($Action -eq 'status') {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($task) {
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host ("scheduled task : '{0}' state={1} last={2}" -f $TaskName, $task.State, $info.LastRunTime)
  } else { Write-Host 'scheduled task : not registered' }
  if (Test-Path $startupCmd) { Write-Host "startup entry  : $startupCmd" } else { Write-Host 'startup entry  : not installed' }
  $probe = Test-GatewayPort -Port $Listen
  Write-Host ("port {0}       : {1}" -f $Listen, $(if ($probe) { 'responding' } else { 'not responding' }))
  exit 0
}

# ---------- install (shared preconditions) ----------
$node = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $node) { throw 'node not found on PATH' }
if (-not (Test-Path (Join-Path $dir 'dsh-gateway.mjs'))) { throw "dsh-gateway.mjs not found in $dir" }
if (-not (Test-Path (Join-Path $dir 'auth.json'))) {
  Copy-Item (Join-Path $dir 'auth.example.json') (Join-Path $dir 'auth.json')
  Write-Host 'auth.json was missing - copied the example. SET A REAL PIN at http://127.0.0.1:3081/__setpin' -ForegroundColor Yellow
}

if ($Action -eq 'task') {
  # A powershell wrapper keeps the node console window hidden at logon.
  $action2 = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -Command `"$inner`"" `
    -WorkingDirectory $dir
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $TaskName -Action $action2 -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Write-Host "registered scheduled task '$TaskName' (crash-restarting, survives reboots)"
  Start-ScheduledTask -TaskName $TaskName
} else {
  # Startup folder: launch minimized at sign-in. Visible in Task Manager ->
  # Startup apps; delete the .cmd (or run -Action remove) to uninstall.
  $cmd = "@echo off`r`ncd /d `"$dir`"`r`nstart `"`" /min $inner`r`n"
  [IO.File]::WriteAllText($startupCmd, $cmd, (New-Object Text.ASCIIEncoding))
  Write-Host "installed startup entry: $startupCmd"
  # Also start the gateway now, exactly the way the entry will at next logon.
  Start-Process cmd.exe -ArgumentList '/c', "`"$startupCmd`"" -WindowStyle Hidden
}

Start-Sleep -Seconds 3
$probe = Test-GatewayPort -Port $Listen
Write-Host $(if ($probe) { "gateway is up on 127.0.0.1:$Listen" } else { "started, but port $Listen is not answering yet - re-run with -Action status in a moment" })
