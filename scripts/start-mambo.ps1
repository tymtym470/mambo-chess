param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$node = (Get-Command node.exe -ErrorAction Stop).Source
$expected = & $node (Join-Path $PSScriptRoot 'runtime-info.mjs') | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $expected.revision) { throw 'Cannot determine the project version.' }
$port = if ($env:MAMBO_PORT) { [int]$env:MAMBO_PORT } else { 5176 }
$firstPort = $port
$serverPath = Join-Path $root 'server.mjs'

function Get-MamboStatus([int]$candidate) {
  try { return Invoke-RestMethod -Uri "http://127.0.0.1:$candidate/api/config" -TimeoutSec 1 }
  catch { return $null }
}

function Test-OwnedProcess($status, [int]$candidate) {
  if ($status.appId -ne $expected.appId -or $status.workspaceId -ne $expected.workspaceId) { return $false }
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($status.pid)" -ErrorAction SilentlyContinue
  if (-not $owner -or $owner.Name -notmatch '^node(\.exe)?$') { return $false }
  $scriptArgument = '(?:^|\s)"?' + [regex]::Escape($serverPath) + '"?(?:\s|$)'
  if ([string]$owner.CommandLine -notmatch $scriptArgument) { return $false }
  $listener = Get-NetTCPConnection -State Listen -LocalPort $candidate -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -eq $status.pid }
  return [bool]$listener
}

# Only reuse an identified, current service; never terminate an unrelated port owner.
while ($port -lt $firstPort + 25) {
  $status = Get-MamboStatus $port
  if (Test-OwnedProcess $status $port) {
    if ($status.revision -eq $expected.revision) { break }
    Stop-Process -Id $status.pid -Force -ErrorAction Stop
    for ($i = 0; $i -lt 40; $i++) {
      if (-not (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) { break }
      Start-Sleep -Milliseconds 100
    }
    $status = $null
  }
  $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
  if (-not $listener) { break }
  $port++
}
if ($port -ge $firstPort + 25) { throw 'No free local port was found for Mambo Club.' }
$url = "http://127.0.0.1:$port"

if (-not $status -or $status.revision -ne $expected.revision -or $status.workspaceId -ne $expected.workspaceId) {
  $oldPort = $env:PORT
  $oldStrict = $env:MAMBO_STRICT_PORT
  try {
    $env:PORT = [string]$port
    $env:MAMBO_STRICT_PORT = '1'
    $process = Start-Process -FilePath $node -ArgumentList @('--env-file-if-exists=.env', "`"$serverPath`"", '--production') -WorkingDirectory $root -WindowStyle Hidden -PassThru
  } finally {
    $env:PORT = $oldPort
    $env:MAMBO_STRICT_PORT = $oldStrict
  }
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 150
    $status = Get-MamboStatus $port
    if ($status.revision -eq $expected.revision -and $status.workspaceId -eq $expected.workspaceId -and $status.pid -eq $process.Id) { $ready = $true; break }
    if ($process.HasExited) { break }
  }
  if (-not $ready) { throw 'The local service did not start with the expected project version.' }
}

$page = "$url/?build=$($expected.revision)"
Write-Output $page
if (-not $NoBrowser) { Start-Process $page }
