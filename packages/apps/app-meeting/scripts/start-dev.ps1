# One-click Meeting development start (Windows).
#
# This machine's `pnpm dev` often hangs Vite when it is started concurrently
# with the Hono server. Evidence from local runs: Vite alone is ready in ~1s,
# but under `nocobase dev` it may not listen for 120s and the supervisor then
# tears the stack down. This script therefore starts in order:
#   1) stop previous Meeting processes
#   2) clear shell env that would override packages/apps/app-meeting/.env
#   3) start Vite and wait until /main/ answers
#   4) start the application server and wait until healthz answers
#   5) start the public entry proxy APP_SERVER_PORT -> backend
#
# Usage:
#   packages/apps/app-meeting/start-dev.cmd
#   pnpm dev:one

$ErrorActionPreference = 'Stop'

$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $AppRoot

$VitePort = 5173
$BackendPort = 14001
$PublicPort = 13000
$BasePath = 'main'
$ViteUrl = "http://127.0.0.1:$VitePort/$BasePath/"
$HealthUrl = "http://127.0.0.1:$BackendPort/$BasePath/api/healthz"
$PublicUrl = "http://127.0.0.1:$PublicPort/$BasePath/"

Write-Host "[meeting] app root: $AppRoot"

function Stop-MeetingDevProcesses {
  $patterns = @(
    'packages\\apps\\app-meeting',
    'nb-meeting-proxy'
  )
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $cmd = $_.CommandLine
      if (-not $cmd) { return $false }
      foreach ($pattern in $patterns) {
        if ($cmd -match $pattern) { return $true }
      }
      return $false
    }

  foreach ($proc in $procs) {
    Write-Host "[meeting] stopping pid $($proc.ProcessId)"
    # Process may already be gone; never fail the restart on taskkill.
    cmd /c "taskkill /PID $($proc.ProcessId) /T /F >NUL 2>&1"
    $global:LASTEXITCODE = 0
  }

  foreach ($port in @($PublicPort, $BackendPort, $VitePort, 5174)) {
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.LocalPort -eq $port } |
      ForEach-Object {
        $owner = $_.OwningProcess
        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$owner" -ErrorAction SilentlyContinue).CommandLine
        if ($cmd -and ($cmd -match 'packages\\apps\\app-meeting|nb-meeting-proxy|vite\\bin\\vite\.js')) {
          Write-Host "[meeting] freeing port $port (pid $owner)"
          cmd /c "taskkill /PID $owner /T /F >NUL 2>&1"
          $global:LASTEXITCODE = 0
        }
      }
  }

  Start-Sleep -Seconds 2
}

function Clear-EnvOverrides {
  # process.env wins over .env when the parent shell (e.g. Cursor Agent) set these.
  $keys = @(
    'DB_DIALECT',
    'DB_STORAGE',
    'DB_HOST',
    'DB_PORT',
    'DB_DATABASE',
    'DB_USER',
    'DB_USERNAME',
    'DB_PASSWORD',
    'PROXY_TARGET_URL',
    'DEBUG'
  )
  foreach ($key in $keys) {
    if (Test-Path "Env:$key") {
      Write-Host "[meeting] clearing Env:$key"
      Remove-Item "Env:$key"
    }
  }
}

function Wait-HttpOk {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$Label,
    [int]$TimeoutSec = 60
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Write-Host "[meeting] $Label ready ($Url)"
        return
      }
    } catch {
      # keep waiting
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  throw "[meeting] $Label did not become ready at $Url within ${TimeoutSec}s"
}

function Start-HiddenNode {
  param(
    [Parameter(Mandatory = $true)][string[]]$ArgumentList,
    [Parameter(Mandatory = $true)][string]$Name
  )
  $proc = Start-Process -FilePath 'node' -ArgumentList $ArgumentList -WorkingDirectory $AppRoot -WindowStyle Hidden -PassThru
  Write-Host "[meeting] started $Name pid $($proc.Id)"
  return $proc
}

Stop-MeetingDevProcesses
Clear-EnvOverrides

$env:APP_BASE_PATH = $BasePath
$env:APP_VITE_DEV_HOST = '0.0.0.0'
$env:APP_VITE_DEV_PORT = "$VitePort"
$env:APP_VITE_DEV_URL = "http://127.0.0.1:$VitePort"
$env:APP_SERVER_HOST = '127.0.0.1'
$env:APP_SERVER_PORT = "$BackendPort"
$env:APP_SERVER_START_LOG = 'false'
$env:NOCOBASE_COLLECTIONS_REFRESH = $AppRoot

$viteJs = Join-Path $AppRoot 'node_modules\vite\bin\vite.js'
$tsxCli = Join-Path $AppRoot 'node_modules\tsx\dist\cli.mjs'
if (-not (Test-Path $viteJs)) { throw "[meeting] missing $viteJs" }
if (-not (Test-Path $tsxCli)) { throw "[meeting] missing $tsxCli" }

Write-Host "[meeting] 1/3 starting Vite on $VitePort"
Start-HiddenNode -Name 'vite' -ArgumentList @(
  $viteJs,
  '--host', '0.0.0.0',
  '--port', "$VitePort",
  '--strictPort'
) | Out-Null
Wait-HttpOk -Url $ViteUrl -Label 'Vite' -TimeoutSec 60

Write-Host "[meeting] 2/3 starting application server on $BackendPort"
Start-HiddenNode -Name 'server' -ArgumentList @(
  $tsxCli,
  'watch',
  '--tsconfig', 'tsconfig.server.json',
  '--clear-screen=false',
  '--exclude', 'D:/**/node_modules/**',
  'server/standalone.ts'
) | Out-Null
Wait-HttpOk -Url $HealthUrl -Label 'Application HTTP' -TimeoutSec 90

Write-Host "[meeting] 3/3 starting public proxy $PublicPort -> $BackendPort"
$proxyPath = Join-Path $env:TEMP 'nb-meeting-proxy-13000.mjs'
@"
import net from 'node:net';
const port = $PublicPort;
const targetPort = $BackendPort;
const server = net.createServer((client) => {
  client.pause();
  const timeout = setTimeout(() => client.destroy(), 30000);
  const connect = () => {
    if (client.destroyed) return;
    const socket = net.connect({ host: '127.0.0.1', port: targetPort });
    let connected = false;
    socket.once('connect', () => {
      if (client.destroyed) return socket.destroy();
      connected = true;
      clearTimeout(timeout);
      client.resume();
      client.pipe(socket);
      socket.pipe(client);
    });
    socket.once('error', (error) => {
      socket.destroy();
      if (!connected && error.code === 'ECONNREFUSED' && !client.destroyed) {
        setTimeout(connect, 50);
      } else {
        client.destroy();
      }
    });
  };
  client.on('error', () => client.destroy());
  client.once('close', () => clearTimeout(timeout));
  connect();
});
server.on('error', (error) => {
  console.error('proxy-error', error.code || error.message);
  process.exit(1);
});
server.listen(port, '0.0.0.0', () => {
  console.log('proxy-ready ' + port + ' -> ' + targetPort);
});
"@ | Set-Content -Path $proxyPath -Encoding utf8
Start-HiddenNode -Name 'proxy' -ArgumentList @($proxyPath) | Out-Null
Wait-HttpOk -Url "${PublicUrl}api/healthz" -Label 'Public entry' -TimeoutSec 20

Write-Host ''
Write-Host "[meeting] ready"
Write-Host "[meeting] Local:     $PublicUrl"
Write-Host "[meeting] Vite:      $ViteUrl"
Write-Host "[meeting] Backend:   $HealthUrl"
Write-Host ''
Write-Host '[meeting] processes are running in the background. Close them with start-dev.cmd again (it stops first) or taskkill the Meeting node processes.'
