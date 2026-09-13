# 베이스라인 점검.
#
#   -Local [-Full] : 격리된 로컬 스택 기준의 **현재 지원 경로**. scripts/db-baseline/check.mjs로 넘깁니다.
#   기본값         : 아래의 전용 원격 프로젝트 경로. 관문은 그대로 두었으나 현재 사용하지 않으며
#                    이번 작업에서 검증하지 않았습니다(12_database_baseline_operations.md §3).
#
# 주의: 원격 경로의 -Full은 **전체 이력**을 재생해 cutoff 스냅샷과 비교하므로,
#       cutoff 이후 마이그레이션이 쌓이면 구조적으로 실패합니다. 로컬 경로(-Local -Full)는
#       cutoff까지만 재생해 비교하며, 그 차이는 위 문서가 설명합니다.
[CmdletBinding()]
param(
  [switch]$Local,
  [switch]$Full,
  [string]$DbUrl = $env:BASELINE_DB_URL,
  [string]$ProjectRef = $env:BASELINE_PROJECT_REF,
  [string]$Confirm = $env:BASELINE_DB_CONFIRM
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if ($Local) {
  # 원격 값이 하나라도 살아 있으면 시작하지 않습니다(check.mjs도 같은 검사를 다시 합니다).
  if (-not [string]::IsNullOrWhiteSpace($DbUrl) -or
      -not [string]::IsNullOrWhiteSpace($ProjectRef) -or
      -not [string]::IsNullOrWhiteSpace($Confirm)) {
    throw '-Local은 원격 인자·환경변수(BASELINE_DB_URL/PROJECT_REF/DB_CONFIRM)와 함께 쓰지 않습니다. 어느 DB를 썼는지 흐려지면 안 됩니다.'
  }
  $nodeArgs = @((Join-Path $PSScriptRoot 'db-baseline\check.mjs'))
  if ($Full) { $nodeArgs += '--full' }
  & node @nodeArgs
  exit $LASTEXITCODE
}
$migrationDir = Join-Path $repoRoot 'supabase\migrations'
$baselineDir = Join-Path $repoRoot 'supabase\baseline'
$schemaPath = Join-Path $baselineDir 'current_schema.sql'
$manifestPath = Join-Path $baselineDir 'manifest.json'

if (-not (Test-Path -LiteralPath $schemaPath) -or -not (Test-Path -LiteralPath $manifestPath)) {
  throw 'Baseline artifacts are missing. Run pnpm db:baseline:refresh with Docker running.'
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$migrations = @(Get-ChildItem -LiteralPath $migrationDir -File -Filter '*.sql' | Sort-Object Name)
$cutoffFiles = @($migrations | Where-Object { $_.BaseName.Split('_')[0] -le $manifest.cutoffVersion })
$hashInput = ($cutoffFiles | ForEach-Object {
  $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$($_.Name):$hash"
}) -join "`n"
$sha256 = [Security.Cryptography.SHA256]::Create()
try {
  $historyHash = ($sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($hashInput)) | ForEach-Object { $_.ToString('x2') }) -join ''
}
finally { $sha256.Dispose() }

if ($cutoffFiles.Count -ne $manifest.migrationCount) {
  throw "Baseline cutoff count mismatch: manifest=$($manifest.migrationCount), current=$($cutoffFiles.Count)."
}
if ($historyHash -ne $manifest.migrationHistorySha256) {
  throw 'A migration at or before the baseline cutoff was changed. Restore it or intentionally refresh the baseline.'
}
if ((Get-Item -LiteralPath $schemaPath).Length -eq 0) { throw 'Baseline schema is empty.' }
Write-Host "Baseline history is intact through $($manifest.cutoffVersion)."

if ($Full) {
  if ([string]::IsNullOrWhiteSpace($DbUrl) -or [string]::IsNullOrWhiteSpace($ProjectRef)) {
    throw 'Full verification requires BASELINE_DB_URL and BASELINE_PROJECT_REF.'
  }
  if ($ProjectRef -notmatch '^[a-z0-9]{8,40}$') {
    throw 'BASELINE_PROJECT_REF has an invalid format.'
  }
  if ($Confirm -ne 'RESET_DISPOSABLE_BASELINE_DB') {
    throw 'Set BASELINE_DB_CONFIRM=RESET_DISPOSABLE_BASELINE_DB to confirm destructive reset.'
  }
  $parsedDbUrl = $null
  if (-not [Uri]::TryCreate($DbUrl, [UriKind]::Absolute, [ref]$parsedDbUrl) -or $parsedDbUrl.Scheme -notin @('postgres', 'postgresql')) {
    throw 'BASELINE_DB_URL must be a valid postgres:// or postgresql:// URL.'
  }
  $dbIdentity = "$($parsedDbUrl.Host):$($parsedDbUrl.UserInfo.Split(':')[0])"
  if ($dbIdentity -notmatch [Regex]::Escape($ProjectRef)) {
    throw 'BASELINE_PROJECT_REF does not match the DB host/user. Refusing to reset the database.'
  }

  Push-Location $repoRoot
  try {
    Write-Host "Running a full clean rebuild on disposable project '$ProjectRef'..."
    & pnpm.cmd exec supabase db reset --db-url $DbUrl --no-seed
    if ($LASTEXITCODE -ne 0) { throw 'Full migration replay failed.' }

    $tempDump = Join-Path $baselineDir 'verify_schema.sql.tmp'
    & pnpm.cmd exec supabase db dump --db-url $DbUrl --schema public,app --file $tempDump
    if ($LASTEXITCODE -ne 0) { throw 'Verification dump failed.' }
    $expected = (Get-FileHash -LiteralPath $schemaPath -Algorithm SHA256).Hash
    $actual = (Get-FileHash -LiteralPath $tempDump -Algorithm SHA256).Hash
    Remove-Item -LiteralPath $tempDump -Force
    if ($expected -ne $actual) {
      throw 'The rebuilt schema differs from the committed baseline. Refresh it and review the diff.'
    }
    Write-Host 'Full schema verification passed.'
  }
  finally { Pop-Location }
}
