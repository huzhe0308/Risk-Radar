param(
  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$taskEnvFile = Join-Path $PSScriptRoot ".env.local"
if (Test-Path -LiteralPath $taskEnvFile) {
  Get-Content -LiteralPath $taskEnvFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      $taskEnvName = $Matches[1]
      $taskEnvValue = $Matches[2].Trim()
      if (($taskEnvValue.StartsWith('"') -and $taskEnvValue.EndsWith('"')) -or ($taskEnvValue.StartsWith("'") -and $taskEnvValue.EndsWith("'"))) {
        $taskEnvValue = $taskEnvValue.Substring(1, $taskEnvValue.Length - 2)
      }
      Set-Item -Path "Env:$taskEnvName" -Value $taskEnvValue
    }
  }
}

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$bundledNodeExe = Join-Path $bundledNode "node.exe"
if (Test-Path -LiteralPath $bundledNodeExe) {
  $env:PATH = "$bundledNode;$env:PATH"
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  Write-Host "[ERROR] Node.js 22.13 or newer is required, but Node.js was not found." -ForegroundColor Red
  exit 1
}

$nodeVersion = (& node -p "process.versions.node").Trim()
$nodeMajor = [int](($nodeVersion -split "\.")[0])
if ($nodeMajor -lt 22) {
  Write-Host "[ERROR] Node.js 22.13 or newer is required. Detected $nodeVersion." -ForegroundColor Red
  exit 1
}

if ($ValidateOnly) {
  Write-Host "Startup prerequisites verified with Node.js $nodeVersion."
  exit 0
}

if (-not (Test-Path -LiteralPath "node_modules\.bin\vinext.cmd")) {
  Write-Host "Installing project dependencies..."
  & npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Starting Time Plan Viewer..."
Write-Host "Your browser will open automatically when the server is ready."
$env:TPV_AUTO_OPEN = "1"
& ".\node_modules\.bin\vinext.cmd" dev
exit $LASTEXITCODE
