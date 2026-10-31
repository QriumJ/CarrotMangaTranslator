param([Parameter(Mandatory = $true)][string] $PreviousInstaller)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Use a disposable GitHub runner only.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$installer = (Resolve-Path "dist/CarrotMangaTranslator-Setup-v$version.exe").Path
$root = Join-Path $env:RUNNER_TEMP ("업데이트 검증-" + [guid]::NewGuid())
$appDir = Join-Path $root '프로그램'
$dataDir = Join-Path $root '사용자 지정 자료'
New-Item -ItemType Directory -Path $appDir,$dataDir | Out-Null
$executable = Join-Path $appDir 'CarrotMangaTranslator.exe'
$pointer = Join-Path $appDir 'data-root.txt'
Set-Content -LiteralPath $pointer -Value $dataDir -Encoding utf8
function Invoke-Installer([string] $Path, [bool] $Updated) {
  $arguments = @('/S', '/currentuser')
  if ($Updated) { $arguments += @('--updated', '--force-run') }
  $arguments += "/D=$appDir"
  $process = Start-Process -FilePath $Path -ArgumentList $arguments -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(300000)) { throw 'Installer timed out.' }
  if ($process.ExitCode -ne 0) { throw "Installer exited $($process.ExitCode)." }
}
try {
  Invoke-Installer (Resolve-Path $PreviousInstaller).Path $false
  if (-not (Test-Path -LiteralPath $executable)) { throw 'Old application was not installed.' }
  $oldVersion = (Get-Item -LiteralPath $executable).VersionInfo.ProductVersion
  if ($oldVersion -notlike '3.7.7*') { throw "Unexpected baseline: $oldVersion" }
  $fixtures = @('library/원본/사용자 파일.txt', 'outputs/번역 결과.txt', 'models/사용자 모델.bin')
  $before = @{}
  foreach ($file in $fixtures) {
    $path = Join-Path $dataDir $file
    New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
    [IO.File]::WriteAllText($path, "USER FILE: $file")
    $before[$file] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
  }
  Invoke-Installer $installer $true
  $newVersion = (Get-Item -LiteralPath $executable).VersionInfo.ProductVersion
  if ($newVersion -notlike "$version*") { throw "Wrong installed version: $newVersion" }
  if ((Get-Content -LiteralPath $pointer -Raw).Trim() -ne $dataDir) { throw 'Data location changed.' }
  $deadline = (Get-Date).AddSeconds(45)
  do {
    $running = @(Get-Process CarrotMangaTranslator -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable })
    if ($running.Count) { break }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  if (-not $running.Count) { throw 'Application did not restart after the update.' }
  Start-Sleep -Seconds 5
  if (-not @(Get-Process CarrotMangaTranslator -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable }).Count) { throw 'Restarted application exited early.' }
  $after = @{}
  foreach ($file in $fixtures) {
    $after[$file] = (Get-FileHash -LiteralPath (Join-Path $dataDir $file) -Algorithm SHA256).Hash
    if ($before[$file] -ne $after[$file]) { throw "User file changed: $file" }
  }
  New-Item -ItemType Directory -Force .tmp | Out-Null
  @{ oldVersion=$oldVersion; newVersion=$newVersion; restarted=$true; customDataRoot=$dataDir; before=$before; after=$after; interactiveUacTested=$false } |
    ConvertTo-Json -Depth 5 | Set-Content .tmp/update-upgrade-evidence.json -Encoding utf8
  Write-Host "Upgrade $oldVersion -> $newVersion, automatic restart and user file hashes passed."
} finally {
  Get-Process CarrotMangaTranslator -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable } | Stop-Process -ErrorAction SilentlyContinue
}
