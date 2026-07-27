$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$localUrl = "http://127.0.0.1:3000"
$minimumNodeVersion = [version]"22.13.0"

function Stop-WithError {
  param([Parameter(Mandatory = $true)][string]$Message)

  Write-Host ""
  Write-Host "QuantScope could not start: $Message" -ForegroundColor Red
  exit 1
}

function Test-QuantScopeReady {
  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Uri $localUrl `
      -TimeoutSec 2
    return $response.StatusCode -eq 200 -and
      $response.Content -match "<title>QuantScope"
  } catch {
    return $false
  }
}

function Test-LocalPortInUse {
  $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::`
    GetIPGlobalProperties().GetActiveTcpListeners()
  return [bool]($listeners | Where-Object { $_.Port -eq 3000 })
}

function Test-DependenciesReady {
  param(
    [string]$Root = $projectRoot,
    [string]$NpmCommand = "npm.cmd"
  )

  if (-not (Test-Path -LiteralPath (Join-Path $Root "node_modules"))) {
    return $false
  }

  try {
    & $NpmCommand ls --depth=0 --silent *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Wait-QuantScopeStartup {
  param(
    [Parameter(Mandatory = $true)]$ServerProcess,
    [scriptblock]$ReadyProbe = { Test-QuantScopeReady },
    [int]$TimeoutMilliseconds = 60000,
    [int]$PollMilliseconds = 500
  )

  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMilliseconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ([bool](& $ReadyProbe)) {
      return "Ready"
    }
    if ($ServerProcess.HasExited) {
      return "Exited"
    }
    Start-Sleep -Milliseconds $PollMilliseconds
  }

  return "TimedOut"
}

function Open-QuantScope {
  $edgeCandidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($edgePath in $edgeCandidates) {
    if ($edgePath -and (Test-Path -LiteralPath $edgePath)) {
      Start-Process `
        -FilePath $edgePath `
        -ArgumentList @("--new-window", "--start-maximized", $localUrl)
      return
    }
  }

  Start-Process -FilePath $localUrl
}

if ($MyInvocation.InvocationName -eq ".") {
  return
}

Set-Location -LiteralPath $projectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Stop-WithError "Node.js 22.13.0 or newer is not installed or is not on PATH."
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Stop-WithError "npm is not installed or is not on PATH."
}

try {
  $nodeVersion = [version]((& node -p "process.versions.node").Trim())
} catch {
  Stop-WithError "The installed Node.js version could not be read."
}
if ($nodeVersion -lt $minimumNodeVersion) {
  Stop-WithError (
    "Node.js $nodeVersion is installed; version 22.13.0 or newer is required."
  )
}

if (-not (Test-DependenciesReady)) {
  Write-Host "Installing locked npm dependencies..."
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) {
    Stop-WithError "npm ci failed."
  }
}

if (Test-QuantScopeReady) {
  Write-Host "QuantScope is already running at $localUrl."
  Open-QuantScope
  exit 0
}

if (Test-LocalPortInUse) {
  Stop-WithError (
    "Port 3000 is already used by another application. Stop that application and try again."
  )
}

Write-Host "Applying local database migrations..."
$previousCi = $env:CI
try {
  $env:CI = "1"
  & npm.cmd run local:db:migrate
  if ($LASTEXITCODE -ne 0) {
    Stop-WithError "The local D1 migration failed."
  }
} finally {
  $env:CI = $previousCi
}

if (Test-QuantScopeReady) {
  Write-Host "QuantScope is already running at $localUrl."
  Open-QuantScope
  exit 0
}

if (Test-LocalPortInUse) {
  Stop-WithError (
    "Port 3000 is already used by another application. Stop that application and try again."
  )
}

$escapedProjectRoot = $projectRoot.Replace("'", "''")
$serverCommand = @"
Set-Location -LiteralPath '$escapedProjectRoot'
`$Host.UI.RawUI.WindowTitle = 'QuantScope Local Server'
npm.cmd run local:dev
"@
$encodedCommand = [Convert]::ToBase64String(
  [Text.Encoding]::Unicode.GetBytes($serverCommand)
)

Write-Host "Starting the local QuantScope server..."
$serverProcess = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    $encodedCommand
  ) `
  -WindowStyle Normal `
  -PassThru

$startupStatus = Wait-QuantScopeStartup -ServerProcess $serverProcess
switch ($startupStatus) {
  "Ready" {
    Write-Host "QuantScope is ready at $localUrl."
    Open-QuantScope
    exit 0
  }
  "Exited" {
    Stop-WithError "The local server exited before it became ready."
  }
  default {
    Stop-WithError (
      "The local server did not become ready within 60 seconds. Check the QuantScope Local Server window."
    )
  }
}
