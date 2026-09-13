# 베이스라인 생성.
#
#   -Local [-DryRun] : 격리된 로컬 스택으로 만드는 **현재 지원 경로**.
#                      scripts/db-baseline/refresh.mjs로 넘기며, 이 파일의 원격 관문은
#                      타지 않습니다(원격 DB를 쓰지 않으므로).
#   기본값           : 아래의 전용 원격 프로젝트 경로. 관문(3개 환경변수)은 그대로 두었으나
#                      **현재 사용하지 않으며 이번 작업에서 검증하지 않았습니다.**
#                      한계는 docs/docs_dev/12_database_baseline_operations.md §3이 소유합니다.
[CmdletBinding()]
param(
  [switch]$Local,
  [switch]$DryRun,
  [string]$DbUrl = $env:BASELINE_DB_URL,
  [string]$ProjectRef = $env:BASELINE_PROJECT_REF,
  [string]$Confirm = $env:BASELINE_DB_CONFIRM
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if ($Local) {
  # 원격 값이 하나라도 살아 있으면 시작하지 않습니다(refresh.mjs도 같은 검사를 다시 합니다).
  if (-not [string]::IsNullOrWhiteSpace($DbUrl) -or
      -not [string]::IsNullOrWhiteSpace($ProjectRef) -or
      -not [string]::IsNullOrWhiteSpace($Confirm)) {
    throw '-Local은 원격 인자·환경변수(BASELINE_DB_URL/PROJECT_REF/DB_CONFIRM)와 함께 쓰지 않습니다. 어느 DB를 썼는지 흐려지면 안 됩니다.'
  }
  $nodeArgs = @((Join-Path $PSScriptRoot 'db-baseline\refresh.mjs'))
  if ($DryRun) { $nodeArgs += '--dry-run' }
  & node @nodeArgs
  exit $LASTEXITCODE
}
$migrationDir = Join-Path $repoRoot 'supabase\migrations'
$baselineDir = Join-Path $repoRoot 'supabase\baseline'
$schemaPath = Join-Path $baselineDir 'current_schema.sql'
$manifestPath = Join-Path $baselineDir 'manifest.json'
$tempSchemaPath = Join-Path $baselineDir 'current_schema.sql.tmp'

if ([string]::IsNullOrWhiteSpace($DbUrl)) {
  throw 'BASELINE_DB_URL is required. Use a disposable Supabase project; never use the production database.'
}
if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
  throw 'BASELINE_PROJECT_REF is required.'
}
if ($ProjectRef -notmatch '^[a-z0-9]{8,40}$') {
  throw 'BASELINE_PROJECT_REF has an invalid format.'
}
if ($Confirm -ne 'RESET_DISPOSABLE_BASELINE_DB') {
  throw 'Set BASELINE_DB_CONFIRM=RESET_DISPOSABLE_BASELINE_DB to confirm destructive reset of the disposable database.'
}

$parsedDbUrl = $null
if (-not [Uri]::TryCreate($DbUrl, [UriKind]::Absolute, [ref]$parsedDbUrl) -or $parsedDbUrl.Scheme -notin @('postgres', 'postgresql')) {
  throw 'BASELINE_DB_URL must be a valid postgres:// or postgresql:// URL.'
}
$dbIdentity = "$($parsedDbUrl.Host):$($parsedDbUrl.UserInfo.Split(':')[0])"
if ($dbIdentity -notmatch [Regex]::Escape($ProjectRef)) {
  throw 'BASELINE_PROJECT_REF does not match the DB host/user. Refusing to reset the database.'
}

$migrations = @(Get-ChildItem -LiteralPath $migrationDir -File -Filter '*.sql' | Sort-Object Name)
if ($migrations.Count -eq 0) { throw 'No migration files were found.' }

$cutoff = $migrations[-1].BaseName.Split('_')[0]
$hashInput = ($migrations | ForEach-Object {
  $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  "$($_.Name):$hash"
}) -join "`n"
$sha256 = [Security.Cryptography.SHA256]::Create()
try {
  $historyHash = ($sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($hashInput)) | ForEach-Object { $_.ToString('x2') }) -join ''
}
finally { $sha256.Dispose() }

New-Item -ItemType Directory -Force -Path $baselineDir | Out-Null
Push-Location $repoRoot
try {
  Write-Host "Resetting disposable baseline project '$ProjectRef' from the complete migration history..."
  & pnpm.cmd exec supabase db reset --db-url $DbUrl --no-seed
  if ($LASTEXITCODE -ne 0) { throw 'supabase db reset failed.' }

  Write-Host 'Dumping the verified public/app schema snapshot...'
  & pnpm.cmd exec supabase db dump --db-url $DbUrl --schema public,app --file $tempSchemaPath
  if ($LASTEXITCODE -ne 0) { throw 'supabase db dump failed.' }
  Move-Item -LiteralPath $tempSchemaPath -Destination $schemaPath -Force

  [ordered]@{
    formatVersion = 1
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    cutoffVersion = $cutoff
    migrationCount = $migrations.Count
    migrationHistorySha256 = $historyHash
    schemas = @('public', 'app')
    source = "disposable Supabase project $ProjectRef rebuilt from supabase/migrations with --no-seed"
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8

  Write-Host "Baseline refreshed through $cutoff ($($migrations.Count) migrations)."
  Write-Host 'Run pnpm db:baseline:check before committing.'
}
finally {
  if (Test-Path -LiteralPath $tempSchemaPath) { Remove-Item -LiteralPath $tempSchemaPath -Force }
  Pop-Location
}
