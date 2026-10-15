$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$serverPath = Join-Path $root 'server.mjs'
$stopped = @()

function Stop-MamboProcess([int]$processId) {
  if ($processId -le 0 -or $processId -eq $PID) { return }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
  if (-not $process) { return }
  $commandLine = [string]$process.CommandLine
  if ($process.Name -notmatch '^node(\.exe)?$') { return }
  $scriptArgument = '(?:^|\s)"?' + [regex]::Escape($serverPath) + '"?(?:\s|$)'
  if ($commandLine -notmatch $scriptArgument) { return }
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  $script:stopped += $processId
}

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-MamboProcess $_.ProcessId }

if ($stopped) {
  Write-Output "Stopped $($stopped.Count) Mambo Club process(es) for this project."
} else {
  Write-Output "Mambo Club service was not running."
}
