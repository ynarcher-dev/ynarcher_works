#!/usr/bin/env node
// 베이스라인 점검.
//
//   node scripts/db-baseline/check.mjs          빠른 점검(Docker 불필요)
//   node scripts/db-baseline/check.mjs --full   전체 검증(격리 스택에서 재생해 대조)
//
// 빠른 점검은 **스키마 해시와 이력 해시를 둘 다** 봅니다 — 산출물 한쪽만 바뀐 상태,
// cutoff 이하 마이그레이션 변경, 손으로 고친 스냅샷이 모두 여기서 걸립니다.
//
// 전체 검증은 산출물을 만든 스택이 아니라 **새 스택**을 세워 cutoff까지의 마이그레이션만
// 재생하고, 그 덤프의 정규형을 커밋된 스냅샷의 정규형과 바이트로 비교합니다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { normalizeDump, toCanonicalText } from './lib/canonical.mjs'
import { baselinePaths, inspectBaseline } from './lib/artifacts.mjs'
import { parseLocalArgs, withIsolatedStack } from './lib/stack.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// 사용자가 고칠 수 있는 실패는 스택 트레이스 대신 한 줄로 알린다.
function fail(message) {
  console.error(`[baseline] ✗ ${message}`)
  process.exit(1)
}

let flags
let report
try {
  flags = parseLocalArgs(process.argv.slice(2), ['--full'])
  report = inspectBaseline(REPO_ROOT)
} catch (err) {
  fail(err.message)
}
const full = flags.has('--full')

const { schemaPath } = baselinePaths(REPO_ROOT)
const { manifest, problems, throughCutoff, afterCutoff } = report

console.log('[baseline] 빠른 점검')
console.log(`[baseline]   cutoff                 : ${manifest.cutoffVersion}`)
console.log(`[baseline]   cutoff 이하 마이그레이션 : ${throughCutoff.length}개`)
console.log(`[baseline]   cutoff 이후 마이그레이션 : ${afterCutoff.length}개`)
console.log(`[baseline]   schemaSha256           : ${report.schemaSha256}`)
console.log(`[baseline]   migrationHistorySha256 : ${report.historySha256}`)
console.log(`[baseline]   생성 환경              : PostgreSQL ${manifest.postgresMajorVersion} / Supabase CLI ${manifest.supabaseCliVersion}`)

if (problems.length > 0) {
  console.error('')
  for (const problem of problems) console.error(`[baseline] ✗ ${problem}`)
  process.exit(1)
}
console.log(`[baseline] ✓ 스키마 해시와 cutoff 이력 해시가 manifest와 일치합니다.`)

if (!full) {
  if (afterCutoff.length > 0) {
    console.log(`[baseline] 참고: cutoff 이후 마이그레이션 ${afterCutoff.length}개는 이 스냅샷에 담겨 있지 않습니다.`)
  }
  process.exit(0)
}

// ── 전체 검증 ─────────────────────────────────────────────────────────
console.log('\n[baseline] 전체 검증 — 새 스택에서 cutoff까지 재생합니다.')
if (afterCutoff.length > 0) {
  console.log(`[baseline] cutoff 이후 ${afterCutoff.length}개는 재생 대상이 아닙니다(스냅샷은 cutoff 시점의 것이므로).`)
}

let run
try {
  run = await withIsolatedStack(
    { repoRoot: REPO_ROOT, label: 'verify', migrationNames: throughCutoff },
    async ({ dumpSchema }) => normalizeDump(await dumpSchema(manifest.schemas)),
  )
} catch (err) {
  fail(err.message)
}

if (run.failure) {
  console.error(`\n[baseline] 전체 검증 실패\n${run.failure.message}`)
  if (run.cleanupFailure) console.error(`[baseline] ${run.cleanupFailure.message}`)
  process.exit(1)
}

// 재생된 것이 manifest가 말하는 그 이력인지부터 확인한다.
if (run.replayedHistorySha256 !== manifest.migrationHistorySha256) {
  console.error('\n[baseline] ✗ 재생한 마이그레이션의 이력 해시가 manifest와 다릅니다 — 대조할 대상이 아닙니다.')
  console.error(
    `[baseline]   manifest=${manifest.migrationHistorySha256.slice(0, 12)}…, 재생=${run.replayedHistorySha256.slice(0, 12)}…`,
  )
  process.exit(1)
}

const rebuilt = run.value.text
const committed = toCanonicalText(fs.readFileSync(schemaPath))
if (rebuilt !== committed) {
  const rebuiltPath = path.join(run.workdir, 'rebuilt_schema.sql')
  fs.writeFileSync(rebuiltPath, rebuilt, 'utf8')
  const a = committed.split('\n')
  const b = rebuilt.split('\n')
  const firstDiff = a.findIndex((line, i) => line !== b[i])
  console.error('\n[baseline] ✗ 재생한 스키마가 커밋된 스냅샷과 다릅니다.')
  console.error(`[baseline]   줄 수: 커밋 ${a.length} / 재생 ${b.length}, 첫 차이 ${firstDiff + 1}번째 줄`)
  if (firstDiff >= 0) {
    console.error(`[baseline]   커밋: ${JSON.stringify(a[firstDiff] ?? '(없음)')}`)
    console.error(`[baseline]   재생: ${JSON.stringify(b[firstDiff] ?? '(없음)')}`)
  }
  console.error(`[baseline]   재생본을 남겼습니다: ${rebuiltPath}`)
  console.error('[baseline]   산출물은 손으로 고치지 않습니다 — 원인을 확인하고 refresh로 다시 만드십시오.')
  if (run.cleanupFailure) console.error(`[baseline] ${run.cleanupFailure.message}`)
  process.exit(1)
}

console.log('\n[baseline] ✓ 새 스택에서 cutoff까지 재생한 덤프의 정규형이 커밋된 스냅샷과 바이트까지 같습니다.')
if (afterCutoff.length > 0) {
  console.log('[baseline] 다만 이 통과가 말하는 것은 **cutoff 시점 스냅샷의 재현성**뿐입니다.')
  console.log('[baseline]   · cutoff 이후 마이그레이션은 검증 대상이 아니었습니다.')
  console.log('[baseline]   · "베이스라인 + 이후 마이그레이션"이 전체 이력 재생과 같은 결과라는 뜻이 아닙니다(대조하지 않았습니다).')
  console.log('[baseline]   · 전체 이력이 그대로 재생되는지는 별도로 pnpm test:db 가 확인합니다.')
}
if (run.cleanupFailure) {
  console.error(`\n[baseline] 검증은 통과했지만 스택 정리에 실패했습니다: ${run.cleanupFailure.message}`)
  process.exit(1)
}
