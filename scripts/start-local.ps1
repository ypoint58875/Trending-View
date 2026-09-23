$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeHost = "127.0.0.1"
$runtimePorts = [ordered]@{
  Application = [pscustomobject]@{
    Role = "Application"
    DisplayName = "QuantScope application"
    Port = 3000
  }
  MarketRelay = [pscustomobject]@{
    Role = "MarketRelay"
    DisplayName = "QuantScope market relay"
    Port = 3001
  }
}
$applicationRuntime = $runtimePorts.Application
$marketRelayRuntime = $runtimePorts.MarketRelay
$localUrl = "http://${runtimeHost}:$($applicationRuntime.Port)"
$applicationHealthUrl = "$localUrl/api/health"
$marketRelayHealthUrl = (
  "http://${runtimeHost}:$($marketRelayRuntime.Port)/health"
)
$minimumNodeVersion = [version]"22.13.0"

function Stop-WithError {
  param([Parameter(Mandatory = $true)][string]$Message)

  Write-Host ""
  Write-Host "QuantScope could not start: $Message" -ForegroundColor Red
  exit 1
}

function Invoke-QuantScopeLoopbackGet {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [int]$TimeoutSeconds = 10
  )

  $target = [Uri]$Uri
  if ($target.Scheme -ne "http" -or $target.Host -ne $runtimeHost) {
    throw "Only the registered QuantScope loopback host can be probed."
  }

  $timeoutMilliseconds = [Math]::Max(1, $TimeoutSeconds) * 1000
  $probeScript = @"
const http = require("node:http");
const target = process.argv[3];
const timeout = Number(process.argv[4]);
const request = http.get(target, { agent: false }, (response) => {
  let content = "";
  response.setEncoding("utf8");
  response.on("data", (chunk) => {
    content += chunk;
    if (content.length > 1048576) request.destroy(new Error("too large"));
  });
  response.on("end", () => process.stdout.write(JSON.stringify({
    statusCode: response.statusCode,
    content,
  })));
});
request.setTimeout(timeout, () => request.destroy(new Error("timeout")));
request.on("error", () => { process.exitCode = 2; });
"@
  $encodedProbeScript = [Convert]::ToBase64String(
    [Text.Encoding]::UTF8.GetBytes($probeScript)
  )
  $probeBootstrap = (
    "eval(Buffer.from(process.argv[1],process.argv[2]).toString())"
  )
  $previousErrorActionPreference = $ErrorActionPreference
  $previousNoProxy = $env:NO_PROXY
  $previousNoProxyLower = $env:no_proxy
  try {
    $ErrorActionPreference = "Continue"
    $env:NO_PROXY = "$runtimeHost,localhost"
    $env:no_proxy = $env:NO_PROXY
    $rawResponse = & node.exe `
      -e $probeBootstrap `
      $encodedProbeScript `
      "base64" `
      $Uri `
      ([string]$timeoutMilliseconds) `
      2>$null
    $probeExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
    if ($null -eq $previousNoProxy) {
      Remove-Item Env:NO_PROXY -ErrorAction SilentlyContinue
    } else {
      $env:NO_PROXY = $previousNoProxy
    }
    if ($null -eq $previousNoProxyLower) {
      Remove-Item Env:no_proxy -ErrorAction SilentlyContinue
    } else {
      $env:no_proxy = $previousNoProxyLower
    }
  }
  if ($probeExitCode -ne 0) {
    throw "The QuantScope loopback probe failed (exit $probeExitCode)."
  }

  return ([string]$rawResponse | ConvertFrom-Json)
}

function Test-QuantScopeReady {
  try {
    $response = Invoke-QuantScopeLoopbackGet `
      -Uri $applicationHealthUrl `
      -TimeoutSeconds 2
    $health = $response.Content | ConvertFrom-Json
    return $response.StatusCode -eq 200 -and
      $health.ready -eq $true -and
      $health.role -eq "application" -and
      $health.version -eq 1
  } catch {
    return $false
  }
}

function Test-LocalPortInUse {
  param([int]$Port = $applicationRuntime.Port)

  $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::`
    GetIPGlobalProperties().GetActiveTcpListeners()
  return [bool]($listeners | Where-Object { $_.Port -eq $Port })
}

function Test-QuantScopeMarketRelayReady {
  try {
    $relayResponse = Invoke-QuantScopeLoopbackGet `
      -Uri $marketRelayHealthUrl `
      -TimeoutSeconds 2
    $response = $relayResponse.Content | ConvertFrom-Json
    return $response.ready -eq $true -and
      $response.screeningEngine -eq $true -and
      $response.screeningEngineVersion -eq 4
  } catch {
    return $false
  }
}

function Start-StandaloneQuantScopeMarketRelay {
  param([string]$Root = $projectRoot)

  $relayScriptPath = Join-Path $Root "scripts\market-relay.mjs"
  $relayArgument = '"' + $relayScriptPath + '"'
  return Start-Process `
    -FilePath "node.exe" `
    -ArgumentList @($relayArgument) `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -PassThru
}

function Wait-QuantScopeMarketRelayReady {
  param(
    $RelayProcess = $null,
    [int]$TimeoutMilliseconds = 5000,
    [int]$PollMilliseconds = 100
  )

  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMilliseconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-QuantScopeMarketRelayReady) {
      return $true
    }
    if ($RelayProcess -and $RelayProcess.HasExited) {
      return $false
    }
    Start-Sleep -Milliseconds $PollMilliseconds
  }
  return Test-QuantScopeMarketRelayReady
}

function Ensure-QuantScopeMarketRelay {
  param([string]$Root = $projectRoot)

  if (Test-QuantScopeMarketRelayReady) {
    return $true
  }
  Remove-UnhealthyQuantScopeRuntimeListener `
    -Runtime $marketRelayRuntime `
    -Root $Root
  if (
    -not (
      Wait-LocalPortAvailable `
        -Port $marketRelayRuntime.Port `
        -TimeoutMilliseconds 2000
    )
  ) {
    return $false
  }

  try {
    $relayProcess = Start-StandaloneQuantScopeMarketRelay -Root $Root
  } catch {
    return $false
  }
  if (
    Wait-QuantScopeMarketRelayReady `
      -RelayProcess $relayProcess `
      -TimeoutMilliseconds 5000
  ) {
    return $true
  }
  if ($relayProcess -and -not $relayProcess.HasExited) {
    Stop-Process -Id $relayProcess.Id -Force -ErrorAction SilentlyContinue
  }
  return $false
}

function Test-CommandLineArgument {
  param(
    [string]$CommandLine,
    [string]$Argument
  )

  if (
    [string]::IsNullOrWhiteSpace($CommandLine) -or
    [string]::IsNullOrWhiteSpace($Argument)
  ) {
    return $false
  }

  $normalizedCommandLine = $CommandLine.Replace("/", "\")
  $normalizedArgument = $Argument.Replace("/", "\")
  $pattern = '(?i)(?:^|[\s"])' +
    [Regex]::Escape($normalizedArgument) +
    '(?=$|[\s"])'
  return [bool]($normalizedCommandLine -match $pattern)
}

function Test-QuantScopeMarketRelayProcess {
  param(
    [Parameter(Mandatory = $true)]
    $Process,
    [string]$Root = $projectRoot,
    [bool]$RequireOrphan = $true,
    [scriptblock]$ParentProcessExists = {
      param([int]$TargetProcessId)
      return [bool](
        Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
      )
    }
  )

  if (
    [string]::IsNullOrWhiteSpace([string]$Process.Name) -or
    $Process.Name -ine "node.exe"
  ) {
    return $false
  }

  $relayScriptPath = [IO.Path]::GetFullPath(
    (Join-Path $Root "scripts\market-relay.mjs")
  )
  $matchesCurrentProject = Test-CommandLineArgument `
    -CommandLine ([string]$Process.CommandLine) `
    -Argument $relayScriptPath

  if (-not $matchesCurrentProject) {
    return $false
  }

  $parentProcessId = [int]$Process.ParentProcessId
  if ($RequireOrphan -and $parentProcessId -gt 0) {
    try {
      if ([bool](& $ParentProcessExists $parentProcessId)) {
        return $false
      }
    } catch {
      return $false
    }
  }

  return $true
}

function Test-QuantScopeApplicationProcess {
  param(
    [Parameter(Mandatory = $true)]
    $Process,
    [string]$Root = $projectRoot,
    [int]$Port = $applicationRuntime.Port
  )

  if (
    [string]::IsNullOrWhiteSpace([string]$Process.Name) -or
    $Process.Name -ine "node.exe"
  ) {
    return $false
  }

  $normalizedRoot = [IO.Path]::GetFullPath($Root).Replace("/", "\").TrimEnd("\")
  $normalizedCommandLine = ([string]$Process.CommandLine).Replace("/", "\")
  while ($normalizedCommandLine.Contains("\\")) {
    $normalizedCommandLine = $normalizedCommandLine.Replace("\\", "\")
  }
  $vinextCliPattern = '(?i)(?:^|[\s"])' +
    [Regex]::Escape($normalizedRoot) +
    '\\node_modules\\(?:\.bin\\\.\.\\)?vinext\\dist\\cli\.js' +
    '(?=$|[\s"])'

  return [bool](
    $normalizedCommandLine -match $vinextCliPattern -and
    (Test-CommandLineArgument -CommandLine $normalizedCommandLine -Argument "dev") -and
    (Test-CommandLineArgument -CommandLine $normalizedCommandLine -Argument "-p") -and
    (Test-CommandLineArgument -CommandLine $normalizedCommandLine -Argument ([string]$Port)) -and
    (Test-CommandLineArgument -CommandLine $normalizedCommandLine -Argument "-H") -and
    (Test-CommandLineArgument -CommandLine $normalizedCommandLine -Argument $runtimeHost)
  )
}

function Test-QuantScopeRuntimeProcess {
  param(
    [Parameter(Mandatory = $true)]
    $Process,
    [Parameter(Mandatory = $true)]
    $Runtime,
    [string]$Root = $projectRoot,
    [scriptblock]$ParentProcessExists = {
      param([int]$TargetProcessId)
      return [bool](
        Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
      )
    }
  )

  switch ([string]$Runtime.Role) {
    "Application" {
      return Test-QuantScopeApplicationProcess `
        -Process $Process `
        -Root $Root `
        -Port ([int]$Runtime.Port)
    }
    "MarketRelay" {
      return Test-QuantScopeMarketRelayProcess `
        -Process $Process `
        -Root $Root `
        -RequireOrphan $false `
        -ParentProcessExists $ParentProcessExists
    }
    default {
      return $false
    }
  }
}

function Remove-UnhealthyQuantScopeRuntimeListener {
  param(
    [Parameter(Mandatory = $true)]
    $Runtime,
    [string]$Root = $projectRoot,
    [scriptblock]$ListeningProcessIds = {
      param([int]$TargetPort)
      return @(
        Get-NetTCPConnection `
          -LocalPort $TargetPort `
          -State Listen `
          -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty OwningProcess -Unique |
          Where-Object { $_ -gt 0 }
      )
    },
    [scriptblock]$ProcessLookup = {
      param([int]$TargetProcessId)
      return Get-CimInstance `
        -ClassName Win32_Process `
        -Filter "ProcessId = $TargetProcessId" `
        -ErrorAction SilentlyContinue
    },
    [scriptblock]$ParentProcessExists = {
      param([int]$TargetProcessId)
      return [bool](
        Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
      )
    },
    [scriptblock]$ProcessStopper = {
      param([int]$TargetProcessId)
      Stop-Process -Id $TargetProcessId -Force -ErrorAction Stop
    }
  )

  $port = [int]$Runtime.Port
  $processIds = @(& $ListeningProcessIds $port)
  foreach ($processId in $processIds) {
    try {
      $candidate = & $ProcessLookup ([int]$processId)
    } catch {
      continue
    }

    if (
      -not $candidate -or
      -not (
        Test-QuantScopeRuntimeProcess `
          -Process $candidate `
          -Runtime $Runtime `
          -Root $Root `
          -ParentProcessExists $ParentProcessExists
      )
    ) {
      continue
    }

    Write-Host (
      "Stopping unhealthy $($Runtime.DisplayName) " +
      "(PID $processId) on port $port..."
    )
    try {
      & $ProcessStopper ([int]$processId)
    } catch {
      Write-Host (
        "The unhealthy $($Runtime.DisplayName) " +
        "(PID $processId) could not be stopped."
      ) -ForegroundColor Yellow
    }
  }
}

function Get-LocalPortOwnerDescription {
  param(
    [Parameter(Mandatory = $true)]
    $Runtime,
    [scriptblock]$ListeningProcessIds = {
      param([int]$TargetPort)
      return @(
        Get-NetTCPConnection `
          -LocalPort $TargetPort `
          -State Listen `
          -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty OwningProcess -Unique |
          Where-Object { $_ -gt 0 }
      )
    }
  )

  $processIds = @(& $ListeningProcessIds ([int]$Runtime.Port))
  if ($processIds.Count -eq 0) {
    return "unknown process"
  }
  return "PID " + ($processIds -join ", ")
}

function Confirm-QuantScopeRuntimePortAvailable {
  param(
    [Parameter(Mandatory = $true)]
    $Runtime,
    [string]$Root = $projectRoot
  )

  Remove-UnhealthyQuantScopeRuntimeListener `
    -Runtime $Runtime `
    -Root $Root
  return Wait-LocalPortAvailable `
    -Port ([int]$Runtime.Port) `
    -TimeoutMilliseconds 2000
}

function Wait-LocalPortAvailable {
  param(
    [int]$Port,
    [int]$TimeoutMilliseconds = 2000,
    [int]$PollMilliseconds = 100
  )

  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMilliseconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (-not (Test-LocalPortInUse -Port $Port)) {
      return $true
    }
    Start-Sleep -Milliseconds $PollMilliseconds
  }

  return -not (Test-LocalPortInUse -Port $Port)
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

function Remove-StrayQuantScopeApplicationProcesses {
  param(
    [string]$Root = $projectRoot,
    [scriptblock]$ProcessCandidates = {
      return @(
        Get-CimInstance `
          -ClassName Win32_Process `
          -Filter "Name = 'node.exe'" `
          -ErrorAction SilentlyContinue
      )
    },
    [scriptblock]$ProcessStopper = {
      param([int]$TargetProcessId)
      $targetProcess = Get-Process `
        -Id $TargetProcessId `
        -ErrorAction SilentlyContinue
      if ($null -ne $targetProcess) {
        Stop-QuantScopeProcessTree -Process $targetProcess
      }
    }
  )

  $candidates = @(& $ProcessCandidates)
  foreach ($candidate in $candidates) {
    if (
      $null -eq $candidate -or
      -not (Test-QuantScopeApplicationProcess `
        -Process $candidate `
        -Root $Root `
        -Port $applicationRuntime.Port)
    ) {
      continue
    }

    $processId = [int]$candidate.ProcessId
    if ($processId -le 0) {
      continue
    }

    Write-Host (
      "Stopping a stale current-checkout QuantScope application process " +
      "(PID $processId)..."
    ) -ForegroundColor Yellow
    & $ProcessStopper $processId
  }
}

function Stop-QuantScopeProcessTree {
  param(
    [Parameter(Mandatory = $true)]$Process,
    [scriptblock]$ProcessTreeStopper = {
      param([int]$TargetProcessId)
      & taskkill.exe /PID ([string]$TargetProcessId) /T /F *> $null
      return $LASTEXITCODE
    }
  )

  try {
    $Process.Refresh()
    if ($Process.HasExited) {
      return
    }
  } catch {
    return
  }

  $taskkillExitCode = 0
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # taskkill can report a child-process race after the requested root process
    # has already exited. Inspect the root process after the command instead of
    # allowing native stderr to turn that successful cleanup into a fatal error.
    $ErrorActionPreference = "Continue"
    $taskkillExitCode = [int](& $ProcessTreeStopper ([int]$Process.Id))
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  try {
    $null = $Process.WaitForExit(5000)
  } catch {
    # The exact process tree was already requested to stop.
  }

  try {
    $Process.Refresh()
    if ($Process.HasExited) {
      return
    }
  } catch {
    return
  }

  throw (
    "The verified QuantScope process tree could not be stopped " +
    "(taskkill exit code $taskkillExitCode)."
  )
}

function Invoke-QuantScopeLocalMigrations {
  param(
    [string]$Root = $projectRoot,
    [string]$NpmCommand = "npm.cmd",
    [int]$TimeoutMilliseconds = 120000,
    [int]$NoOpExitGraceMilliseconds = 2000,
    [int]$PollMilliseconds = 100
  )

  $eventToken = [Guid]::NewGuid().ToString("N")
  $stdoutEventId = "quantscope-migration-stdout-$eventToken"
  $stderrEventId = "quantscope-migration-stderr-$eventToken"
  $process = $null
  $observedOutput = New-Object Text.StringBuilder
  $noOpSeenAt = $null
  $status = "Exited"
  $exitCode = $null
  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMilliseconds)

  try {
    $resolvedNpmCommand = $NpmCommand
    if (-not [IO.Path]::IsPathRooted($resolvedNpmCommand)) {
      $npmApplication = Get-Command `
        $resolvedNpmCommand `
        -CommandType Application `
        -ErrorAction Stop |
        Select-Object -First 1
      $resolvedNpmCommand = $npmApplication.Source
    }
    $startInfo = New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName = $resolvedNpmCommand
    $startInfo.Arguments = "run local:db:migrate"
    $startInfo.WorkingDirectory = $Root
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.StandardOutputEncoding = [Text.Encoding]::UTF8
    $startInfo.StandardErrorEncoding = [Text.Encoding]::UTF8
    $startInfo.CreateNoWindow = $true

    $process = New-Object Diagnostics.Process
    $process.StartInfo = $startInfo
    $process.EnableRaisingEvents = $true
    Register-ObjectEvent `
      -InputObject $process `
      -EventName OutputDataReceived `
      -SourceIdentifier $stdoutEventId *> $null
    Register-ObjectEvent `
      -InputObject $process `
      -EventName ErrorDataReceived `
      -SourceIdentifier $stderrEventId *> $null
    if (-not $process.Start()) {
      throw "The local migration process could not start."
    }
    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()

    while ($true) {
      $process.Refresh()
      foreach ($sourceId in @($stdoutEventId, $stderrEventId)) {
        $events = @(Get-Event `
          -SourceIdentifier $sourceId `
          -ErrorAction SilentlyContinue)
        foreach ($event in $events) {
          $line = $event.SourceEventArgs.Data
          if ($null -ne $line) {
            Write-Host $line
            $null = $observedOutput.AppendLine($line)
          }
          Remove-Event -EventIdentifier $event.EventIdentifier
        }
      }

      if ($process.HasExited) {
        $null = $process.WaitForExit()
        $exitCode = $process.ExitCode
        break
      }

      if (
        -not $noOpSeenAt -and
        $observedOutput.ToString().Contains("No migrations to apply!")
      ) {
        $noOpSeenAt = [DateTime]::UtcNow
      }
      if (
        $noOpSeenAt -and
        (
          [DateTime]::UtcNow -ge
            $noOpSeenAt.AddMilliseconds($NoOpExitGraceMilliseconds)
        )
      ) {
        $status = "RecoveredNoOp"
        Stop-QuantScopeProcessTree -Process $process
        break
      }
      if ([DateTime]::UtcNow -ge $deadline) {
        $status = "TimedOut"
        Stop-QuantScopeProcessTree -Process $process
        break
      }

      Start-Sleep -Milliseconds $PollMilliseconds
    }

    Start-Sleep -Milliseconds $PollMilliseconds
    foreach ($sourceId in @($stdoutEventId, $stderrEventId)) {
      $events = @(Get-Event `
        -SourceIdentifier $sourceId `
        -ErrorAction SilentlyContinue)
      foreach ($event in $events) {
        $line = $event.SourceEventArgs.Data
        if ($null -ne $line) {
          Write-Host $line
        }
        Remove-Event -EventIdentifier $event.EventIdentifier
      }
    }

    return [pscustomobject]@{
      Status = $status
      ExitCode = $exitCode
    }
  } finally {
    foreach ($sourceId in @($stdoutEventId, $stderrEventId)) {
      Unregister-Event `
        -SourceIdentifier $sourceId `
        -ErrorAction SilentlyContinue
      Get-Event `
        -SourceIdentifier $sourceId `
        -ErrorAction SilentlyContinue |
        Remove-Event -ErrorAction SilentlyContinue
    }
  }
}

function Wait-QuantScopeStartup {
  param(
    [Parameter(Mandatory = $true)]$ServerProcess,
    [scriptblock]$ReadyProbe = { Test-QuantScopeReady },
    [scriptblock]$PortInUseProbe = {
      Test-LocalPortInUse -Port $applicationRuntime.Port
    },
    [scriptblock]$OnListening = {},
    [int]$TimeoutMilliseconds = 60000,
    [int]$ListeningGraceMilliseconds = 120000,
    [int]$PollMilliseconds = 500
  )

  $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMilliseconds)
  $listeningGraceStarted = $false
  $listeningReported = $false
  while ($true) {
    if ([bool](& $ReadyProbe)) {
      return "Ready"
    }
    if ($ServerProcess.HasExited) {
      return "Exited"
    }
    $isListening = [bool](& $PortInUseProbe)
    if ($isListening -and -not $listeningReported) {
      $listeningReported = $true
      & $OnListening
    }
    if ([DateTime]::UtcNow -ge $deadline) {
      if (
        -not $listeningGraceStarted -and
        $ListeningGraceMilliseconds -gt 0 -and
        $isListening
      ) {
        $listeningGraceStarted = $true
        $deadline = [DateTime]::UtcNow.AddMilliseconds(
          $ListeningGraceMilliseconds
        )
        $graceSeconds = [Math]::Ceiling(
          $ListeningGraceMilliseconds / 1000
        )
        Write-Host (
          "The local server is listening but still compiling; " +
          "waiting up to $graceSeconds more seconds..."
        ) -ForegroundColor Yellow
        continue
      }
      return "TimedOut"
    }
    Start-Sleep -Milliseconds $PollMilliseconds
  }
}

function Remove-FailedQuantScopeStartup {
  param(
    [Parameter(Mandatory = $true)]$ServerProcess,
    [string]$Root = $projectRoot
  )

  $cleanupSucceeded = $true
  try {
    Stop-QuantScopeProcessTree -Process $ServerProcess
  } catch {
    $cleanupSucceeded = $false
    Write-Host (
      "Warning: the launcher process tree could not be fully stopped: " +
      $_.Exception.Message
    ) -ForegroundColor Yellow
  }

  try {
    Remove-StrayQuantScopeApplicationProcesses -Root $Root
  } catch {
    $cleanupSucceeded = $false
    Write-Host (
      "Warning: a verified stale application process could not be stopped: " +
      $_.Exception.Message
    ) -ForegroundColor Yellow
  }

  if (-not (Wait-LocalPortAvailable -Port $applicationRuntime.Port)) {
    $cleanupSucceeded = $false
  }
  return $cleanupSucceeded
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

function New-QuantScopeServerCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [bool]$UseMarketRelay = $false,
    [bool]$StartMarketRelay = $true
  )

  $escapedRoot = $Root.Replace("'", "''")
  $commandBody = "npm.cmd run local:dev"
  if ($UseMarketRelay) {
    $marketRelayEnvironment = @"
`$env:NODE_USE_ENV_PROXY = '1'
`$env:QUANTSCOPE_LOCAL_MARKET_RELAY_ENABLED = '1'
"@
    if ($StartMarketRelay) {
      $commandBody = @"
$marketRelayEnvironment
`$relayScriptPath = Join-Path -Path '$escapedRoot' -ChildPath 'scripts\market-relay.mjs'
`$relayArgument = '"' + `$relayScriptPath + '"'
`$relayProcess = Start-Process -FilePath 'node.exe' -ArgumentList @(`$relayArgument) -WorkingDirectory '$escapedRoot' -WindowStyle Hidden -PassThru
try {
  npm.cmd run local:dev
} finally {
  if (`$relayProcess -and -not `$relayProcess.HasExited) {
    Stop-Process -Id `$relayProcess.Id -Force
  }
}
"@
    } else {
      $commandBody = @"
$marketRelayEnvironment
npm.cmd run local:dev
"@
    }
  }

  return @"
Set-Location -LiteralPath '$escapedRoot'
`$Host.UI.RawUI.WindowTitle = 'QuantScope Local Server'
$commandBody
"@
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

$useMarketRelay = $true
$useSystemProxy = [bool]($env:HTTPS_PROXY -or $env:HTTP_PROXY)
if ($useSystemProxy) {
  $env:NODE_USE_ENV_PROXY = "1"
  Write-Host "Configured proxy routing is enabled for Node market requests."
}

if (-not (Test-DependenciesReady)) {
  Write-Host "Installing locked npm dependencies..."
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) {
    Stop-WithError "npm ci failed."
  }
}

if (Test-QuantScopeReady) {
  if (-not (Ensure-QuantScopeMarketRelay -Root $projectRoot)) {
    Stop-WithError (
      "The local market relay could not start on port 3001."
    )
  }
  Write-Host "QuantScope is already running at $localUrl."
  Open-QuantScope
  exit 0
}

Remove-StrayQuantScopeApplicationProcesses -Root $projectRoot

$applicationPortAvailable = Confirm-QuantScopeRuntimePortAvailable `
  -Runtime $applicationRuntime `
  -Root $projectRoot
if (-not $applicationPortAvailable) {
  $owner = Get-LocalPortOwnerDescription -Runtime $applicationRuntime
  Stop-WithError (
    "Port $($applicationRuntime.Port) is used by an active or unrelated " +
    "application ($owner). Stop it and try again."
  )
}

Write-Host "Applying local database migrations..."
$previousCi = $env:CI
try {
  $env:CI = "1"
  $migrationResult = Invoke-QuantScopeLocalMigrations -Root $projectRoot
  switch ($migrationResult.Status) {
    "RecoveredNoOp" {
      Write-Host (
        "Wrangler reported no pending migrations but did not exit; " +
        "the completed migration process was closed safely."
      ) -ForegroundColor Yellow
    }
    "TimedOut" {
      Stop-WithError (
        "The local D1 migration did not finish within 120 seconds."
      )
    }
    default {
      if ($migrationResult.ExitCode -ne 0) {
        Stop-WithError "The local D1 migration failed."
      }
    }
  }
} finally {
  $env:CI = $previousCi
}

if (Test-QuantScopeReady) {
  if (-not (Ensure-QuantScopeMarketRelay -Root $projectRoot)) {
    Stop-WithError (
      "The local market relay could not start on port 3001."
    )
  }
  Write-Host "QuantScope is already running at $localUrl."
  Open-QuantScope
  exit 0
}

$applicationPortAvailable = Confirm-QuantScopeRuntimePortAvailable `
  -Runtime $applicationRuntime `
  -Root $projectRoot
if (-not $applicationPortAvailable) {
  $owner = Get-LocalPortOwnerDescription -Runtime $applicationRuntime
  Stop-WithError (
    "Port $($applicationRuntime.Port) is used by an active or unrelated " +
    "application ($owner). Stop it and try again."
  )
}
$startMarketRelay = $false
if ($useMarketRelay -and -not (Test-QuantScopeMarketRelayReady)) {
  $marketRelayPortAvailable = Confirm-QuantScopeRuntimePortAvailable `
    -Runtime $marketRelayRuntime `
    -Root $projectRoot
  if (-not $marketRelayPortAvailable) {
    $owner = Get-LocalPortOwnerDescription -Runtime $marketRelayRuntime
    Stop-WithError (
      "Port $($marketRelayRuntime.Port) is used by an active or unrelated " +
      "application ($owner). Stop it and try again."
    )
  }
  $startMarketRelay = $true
}

$serverCommand = New-QuantScopeServerCommand `
  -Root $projectRoot `
  -UseMarketRelay $useMarketRelay `
  -StartMarketRelay $startMarketRelay
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

$browserState = [pscustomobject]@{ Opened = $false }
$openBrowserOnce = {
  if (-not $browserState.Opened) {
    $browserState.Opened = $true
    try {
      Open-QuantScope
    } catch {
      Write-Host (
        "The server is ready, but the browser could not be opened: " +
        $_.Exception.Message
      ) -ForegroundColor Yellow
    }
  }
}
$startupStatus = Wait-QuantScopeStartup `
  -ServerProcess $serverProcess `
  -OnListening $openBrowserOnce
switch ($startupStatus) {
  "Ready" {
    Write-Host "QuantScope is ready at $localUrl."
    & $openBrowserOnce
    exit 0
  }
  "Exited" {
    $cleanupSucceeded = Remove-FailedQuantScopeStartup `
      -ServerProcess $serverProcess `
      -Root $projectRoot
    $cleanupMessage = if ($cleanupSucceeded) {
      ""
    } else {
      " Automatic cleanup was incomplete; check the Local Server window."
    }
    Stop-WithError (
      "The local server exited before it became ready." + $cleanupMessage
    )
  }
  default {
    $cleanupSucceeded = Remove-FailedQuantScopeStartup `
      -ServerProcess $serverProcess `
      -Root $projectRoot
    $cleanupMessage = if ($cleanupSucceeded) {
      " The failed server process was stopped safely."
    } else {
      " Automatic cleanup was incomplete; check the Local Server window."
    }
    Stop-WithError (
      "The local server did not become ready after the 60-second startup " +
      "window and 120-second listening grace period." + $cleanupMessage
    )
  }
}
