# Sequential local start for Windows: Vite must be ready before the Hono server.
# Concurrent `pnpm nocobase dev` hangs Vite (~120s) on this workspace.
$ErrorActionPreference = 'Stop'
$AppRoot = Split-Path -Parent $PSScriptRoot
Set-Location $AppRoot
New-Item -ItemType Directory -Force -Path (Join-Path $AppRoot 'storage') | Out-Null

function Clear-AgentEnvOverrides {
  foreach ($name in @(
      'DB_DIALECT', 'DB_STORAGE', 'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USER',
      'DB_USERNAME', 'DB_PASSWORD', 'DB_TABLE_PREFIX', 'DB_FILENAME',
      'PROXY_TARGET_URL', 'DEBUG', 'APP_VITE_DEV_PORT', 'APP_VITE_DEV_URL',
      'APP_SERVER_PORT', 'APP_PUBLIC_ORIGIN', 'NOCOBASE_STRICT_STARTUP', 'BETTER_AUTH_URL'
    )) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
}

function Read-DotEnvValue {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path $Path)) { return $null }
  foreach ($line in Get-Content $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $name, $value = $line -split '=', 2
    if ($name.Trim() -eq $Key) { return $value.Trim().Trim('"').Trim("'") }
  }
  return $null
}

# Export app .env into this process so child Node sees OCTOP_* / CASDOOR_* etc.
# (Standalone config loads .env for AppConfig, but plugins that read process.env need this.)
function Import-AppDotEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  foreach ($line in Get-Content $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $name, $value = $line -split '=', 2
    $name = $name.Trim()
    if (-not $name) { continue }
    $value = $value.Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    } elseif ($value -match '^(.*?)\s+#') {
      $value = $Matches[1].TrimEnd()
    }
    Set-Item -Path "Env:$name" -Value $value
  }
}

function Stop-PortalOwned {
  $patterns = @('packages\\apps\\app-enterprise-portal', 'app-enterprise-portal')
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $cmd = $_.CommandLine
      if (-not $cmd) { return $false }
      foreach ($p in $patterns) { if ($cmd -match $p) { return $true } }
      return $false
    } |
    ForEach-Object { cmd /c "taskkill /PID $($_.ProcessId) /T /F >NUL 2>&1" }

  foreach ($port in @(13000, 14001, 5173, 5174)) {
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.LocalPort -eq $port } |
      ForEach-Object { cmd /c "taskkill /PID $($_.OwningProcess) /T /F >NUL 2>&1" }
  }
}

function Wait-HttpReady {
  param(
    [string]$Url,
    [string]$Label,
    [int]$TimeoutSec = 180,
    [scriptblock]$IsReady = { param($Response) $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500 }
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if (& $IsReady $resp) {
        Write-Host "[start-dev] $Label ready: $Url"
        return
      }
    } catch {
      # keep waiting
    }
    Start-Sleep -Seconds 1
  }
  throw "[start-dev] $Label did not become ready at $Url within ${TimeoutSec}s"
}

Clear-AgentEnvOverrides
Write-Host '[start-dev] Stopping previous portal processes...'
Stop-PortalOwned
Start-Sleep -Seconds 2
Clear-AgentEnvOverrides

if (-not (Test-Path (Join-Path $AppRoot 'config.yml'))) {
  throw '[start-dev] Missing config.yml. Copy config.example.yml first.'
}
if (-not (Test-Path (Join-Path $AppRoot '.env'))) {
  throw '[start-dev] Missing .env.'
}

Import-AppDotEnv -Path (Join-Path $AppRoot '.env')
$localEnv = Join-Path $AppRoot '.env.local'
if (Test-Path $localEnv) { Import-AppDotEnv -Path $localEnv }

$ViteHost = '127.0.0.1'
$VitePort = 5173
$ServerPort = 13000
$BasePath = '/main'
$PublicOrigin = Read-DotEnvValue -Path (Join-Path $AppRoot '.env') -Key 'APP_PUBLIC_ORIGIN'
if (-not $PublicOrigin) {
  $PublicOrigin = "http://127.0.0.1:${ServerPort}"
}
$PublicOrigin = $PublicOrigin.TrimEnd('/')
$ViteUrl = "http://${ViteHost}:${VitePort}${BasePath}/"
$HealthUrl = "http://127.0.0.1:${ServerPort}${BasePath}/api/healthz"
$AppUrl = "${PublicOrigin}${BasePath}/"
$ViteLog = Join-Path $AppRoot 'storage/vite-dev.log'
$ServerLog = Join-Path $AppRoot 'storage/server-dev.log'

$env:APP_BASE_PATH = $BasePath
$env:APP_VITE_DEV_HOST = $ViteHost
$env:APP_VITE_DEV_PORT = "$VitePort"
$env:APP_VITE_DEV_URL = "http://${ViteHost}:${VitePort}"
$env:APP_SERVER_HOST = '127.0.0.1'
$env:APP_SERVER_PORT = "$ServerPort"
$env:APP_SERVER_START_LOG = 'true'
$env:NOCOBASE_STRICT_STARTUP = 'true'

Write-Host "[start-dev] Starting Vite on ${ViteHost}:${VitePort}..."
$viteCmd = "pnpm exec vite --host $ViteHost --port $VitePort --strictPort > `"$ViteLog`" 2>&1"
$vite = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $viteCmd) -WorkingDirectory $AppRoot -PassThru -WindowStyle Hidden

try {
  Wait-HttpReady -Url $ViteUrl -Label 'Vite' -TimeoutSec 180

  Write-Host "[start-dev] Starting application server on ${ServerPort}..."
  $serverCmd = "pnpm exec tsx --tsconfig tsconfig.server.json server/standalone.ts > `"$ServerLog`" 2>&1"
  $server = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $serverCmd) -WorkingDirectory $AppRoot -PassThru -WindowStyle Hidden

  Wait-HttpReady -Url $HealthUrl -Label 'Application healthz' -TimeoutSec 180 -IsReady {
    param($Response)
    try {
      $json = $Response.Content | ConvertFrom-Json
      return $json.ok -eq $true
    } catch {
      return $false
    }
  }

  Write-Host ''
  Write-Host '[start-dev] App ready'
  Write-Host "  Local:     $AppUrl"
  Write-Host "  Healthz:   $HealthUrl"
  Write-Host ''

  while (-not $vite.HasExited -and -not $server.HasExited) {
    Start-Sleep -Seconds 2
  }
  if ($vite.HasExited) { throw "[start-dev] Vite exited with code $($vite.ExitCode)" }
  if ($server.HasExited) { throw "[start-dev] Server exited with code $($server.ExitCode)" }
} catch {
  Write-Host $_
  if ($vite -and -not $vite.HasExited) { cmd /c "taskkill /PID $($vite.Id) /T /F >NUL 2>&1" }
  if ($server -and -not $server.HasExited) { cmd /c "taskkill /PID $($server.Id) /T /F >NUL 2>&1" }
  exit 1
}
