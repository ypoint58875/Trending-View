param([int]$WaitForProcessId = 0)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$mutex = New-Object System.Threading.Mutex($false, 'Local\QuantScopeHoldingRescreen')
$owned = $false
try {
    $owned = $mutex.WaitOne(0)
    if (-not $owned) { throw 'A holding-rescreen background run is already active.' }
    if ($WaitForProcessId -gt 0) {
        $previousRunner = Get-Process -Id $WaitForProcessId -ErrorAction SilentlyContinue
        if ($null -ne $previousRunner) { Wait-Process -InputObject $previousRunner }
    }
    Set-Location -LiteralPath $projectRoot
    $prefetchScript = Join-Path $PSScriptRoot 'prefetch.ts'
    $prefetchOutput = Join-Path $PSScriptRoot 'output'
    Start-Process -FilePath 'node.exe' -ArgumentList @('--import','tsx',('"' + $prefetchScript + '"')) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $prefetchOutput "prefetch-$PID.stdout.log") -RedirectStandardError (Join-Path $prefetchOutput "prefetch-$PID.stderr.log") | Out-Null
    & node --import tsx (Join-Path $PSScriptRoot 'run.ts')
    if ($LASTEXITCODE -ne 0) { throw 'Backtest stopped. Inspect stderr and progress.json before resuming.' }
    $latestPath = Join-Path $PSScriptRoot 'output/latest.json'
    $latest = Get-Content -LiteralPath $latestPath -Raw | ConvertFrom-Json
    if ($latest.status -ne 'complete') { throw 'Backtest interrupted safely; rerun to resume.' }
    & node --import tsx (Join-Path $PSScriptRoot 'report.ts')
    if ($LASTEXITCODE -ne 0) { throw 'Exit attribution report failed.' }
    & python (Join-Path $PSScriptRoot 'audit.py')
    if ($LASTEXITCODE -ne 0) { throw 'Independent result audit failed.' }
    Write-Output 'Backtest and independent audit complete. See RESULTS.md and output/latest.json.'
} finally {
    if ($owned) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
