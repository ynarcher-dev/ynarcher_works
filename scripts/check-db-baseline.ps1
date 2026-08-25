[CmdletBinding()]
param(
  [switch]$Full,
  [string]$DbUrl = $env:BASELINE_DB_URL,
  [string]$ProjectRef = $env:BASELINE_PROJECT_REF,
  [string]$Confirm = $env:BASELINE_DB_CONFIRM
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
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
