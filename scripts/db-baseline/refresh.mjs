#!/usr/bin/env node
// 베이스라인 산출물 생성 — 격리된 로컬 스택에서만 만든다.
//
//   node scripts/db-baseline/refresh.mjs [--dry-run]
//
// 하는 일: 새 임시 작업 디렉터리에 저장소 설정 그대로의 스택을 세워 마이그레이션
// 전체를 재생하고, public·app 스키마를 덤프해 정규화한 뒤 manifest와 한 쌍으로 기록한다.
// cutoff는 이번에 재생한 마지막 마이그레이션이다.
//
// 원격 DB는 이 경로로 닿을 수 없다. 원격 변수가 설정돼 있으면 시작하지 않는다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalSha256, normalizeDump } from './lib/canonical.mjs'
import { LOCAL_STACK_SOURCE, baselinePaths, buildManifest, writeArtifactPair } from './lib/artifacts.mjs'
import { historySha256OfFiles, listMigrationNames, migrationVersion } from './lib/migrations.mjs'
import { parseLocalArgs, readPostgresMajorVersion, withIsolatedStack } from './lib/stack.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCHEMAS = ['public', 'app']

// 사용자가 고칠 수 있는 실패는 스택 트레이스 대신 한 줄로 알린다.
function fail(message) {
  console.error(`[baseline] ✗ ${message}`)
  process.exit(1)
}

const { baselineDir, migrationDir } = baselinePaths(REPO_ROOT)
let flags
let names
let cutoffVersion
let historyHash
let postgresMajorVersion
try {
  flags = parseLocalArgs(process.argv.slice(2), ['--dry-run'])
  names = listMigrationNames(migrationDir)
  cutoffVersion = migrationVersion(names[names.length - 1])
  historyHash = historySha256OfFiles(migrationDir, names)
  postgresMajorVersion = readPostgresMajorVersion(
    fs.readFileSync(path.join(REPO_ROOT, 'supabase', 'config.toml'), 'utf8'),
  )
} catch (err) {
  fail(err.message)
}
const dryRun = flags.has('--dry-run')

console.log('[baseline] 베이스라인 생성(refresh)')
console.log(`[baseline]   cutoff        : ${cutoffVersion} (마이그레이션 ${names.length}개)`)
if (dryRun) console.log('[baseline]   모드          : --dry-run (산출물을 쓰지 않고 해시만 보여줍니다)')

let run
try {
  run = await withIsolatedStack(
    { repoRoot: REPO_ROOT, label: 'refresh', migrationNames: names },
    async ({ dumpSchema }) => normalizeDump(await dumpSchema(SCHEMAS)),
  )
} catch (err) {
  fail(err.message)
}

if (run.failure) {
  console.error(`\n[baseline] 생성 실패 — 기존 산출물은 그대로 둡니다.\n${run.failure.message}`)
  if (run.cleanupFailure) console.error(`[baseline] ${run.cleanupFailure.message}`)
  process.exit(1)
}
if (run.cleanupFailure) {
  console.error(`\n[baseline] 덤프는 끝났지만 스택 정리에 실패했습니다: ${run.cleanupFailure.message}`)
  console.error('[baseline] 정리되지 않은 스택을 남긴 채로는 산출물을 기록하지 않습니다.')
  process.exit(1)
}

// manifest가 말하는 이력과 스택이 실제로 재생한 이력이 같은지 확인한다.
// (스택은 복사본을 다시 읽어 해시를 냈다 — 여기서 저장소 계산값과 맞춰 본다.)
if (run.replayedHistorySha256 !== historyHash) {
  fail(
    `재생한 마이그레이션의 이력 해시가 저장소 계산값과 다릅니다` +
      `(재생=${run.replayedHistorySha256.slice(0, 12)}…, 저장소=${historyHash.slice(0, 12)}…). 산출물을 쓰지 않습니다.`,
  )
}

const { text: schemaText, droppedRestrictLines } = run.value
const schemaSha256 = canonicalSha256(schemaText)

const manifest = buildManifest({
  cutoffVersion,
  migrationCount: names.length,
  migrationHistorySha256: historyHash,
  schemaSha256,
  schemas: SCHEMAS,
  postgresMajorVersion,
  supabaseCliVersion: run.cliVersion,
  // 이번 실행의 project_id는 넣지 않는다 — 같은 스키마를 다시 만들면 manifest도 같은
  // 바이트여야 한다. 어떤 스택을 썼는지는 아래 로그와 스택 레지스트리 기록이 가진다.
  source: LOCAL_STACK_SOURCE,
})

console.log('')
console.log(`[baseline] 정규화에서 지운 \\restrict 메타 줄 : ${droppedRestrictLines}`)
console.log(`[baseline] schemaSha256            : ${schemaSha256}`)
console.log(`[baseline] migrationHistorySha256  : ${historyHash}`)
console.log(`[baseline] PostgreSQL major        : ${postgresMajorVersion}`)
console.log(`[baseline] Supabase CLI            : ${run.cliVersion}`)
// manifest에는 넣지 않는 실행 단서. 산출물을 결정적으로 두면서 추적은 잃지 않기 위해서다.
console.log(`[baseline] 이번 실행 project_id     : ${run.projectId} (manifest에는 기록하지 않습니다)`)
console.log(`[baseline] 작업 디렉터리            : ${run.workdir}`)

if (dryRun) {
  console.log('\n[baseline] --dry-run 이므로 아무 파일도 쓰지 않았습니다.')
  process.exit(0)
}

writeArtifactPair(baselineDir, { schemaText, manifest })
console.log(`\n[baseline] 기록: ${path.relative(REPO_ROOT, path.join(baselineDir, 'current_schema.sql'))}`)
console.log(`[baseline] 기록: ${path.relative(REPO_ROOT, path.join(baselineDir, 'manifest.json'))}`)
console.log('[baseline] 다음: pnpm db:baseline:verify 로 **새 스택에서** 재생해 대조하고 diff를 리뷰하십시오.')
