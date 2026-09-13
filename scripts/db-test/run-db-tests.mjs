#!/usr/bin/env node
// 격리된 로컬 Supabase 스택에서 supabase/tests/*.sql(pgTAP)을 실행한다.
//
//   · 매 실행마다 OS 임시 디렉터리에 mkdtemp로 새 작업 디렉터리와 고유 project_id를 만든다.
//     기존 디렉터리를 지우지 않으므로 경로를 잘못 받아 무언가를 날릴 여지가 없다.
//   · `supabase start`가 빈 볼륨에 마이그레이션 전체를 재생한다(시드 없음). 별도 reset 없음.
//   · CLI 호출은 --workdir/--local뿐. --linked/원격 --db-url/db push/migration repair는 거부한다.
//   · 실패는 감추지 않는다. 건너뛰기·continue-on-error 경로가 없다.
//
// 사용: node scripts/db-test/run-db-tests.mjs [테스트 파일명...]

import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_SUPABASE = path.join(REPO_ROOT, 'supabase')
const SRC_CONFIG = path.join(SRC_SUPABASE, 'config.toml')
const PORT_PREFIX = '547'

const requestedTests = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const unknownFlag = process.argv.slice(2).find((a) => a.startsWith('--'))
if (unknownFlag) {
  console.error(`[db-tests] 옵션을 받지 않습니다: ${unknownFlag}`)
  process.exit(1)
}

// ── CLI 실행 파일: 저장소에 설치된 것을 쓴다 ───────────────────────────
function resolveCli() {
  const local = path.join(REPO_ROOT, 'node_modules', 'supabase', 'dist', 'supabase.js')
  if (fs.existsSync(local)) return { cmd: process.execPath, prefix: [local], source: 'node_modules' }
  return { cmd: 'supabase', prefix: [], source: 'PATH' }
}
const CLI = resolveCli()

const PINNED = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
    return (pkg.devDependencies?.supabase || '').replace(/^[^\d]*/, '')
  } catch {
    return ''
  }
})()

// ── 출력: 줄 단위로 흘려보내되 자격증명은 가린다 ───────────────────────
const SECRET_LINE = /(key|token|secret|jwt|password)/i
const tail = []
function emit(line, sink) {
  const safe = SECRET_LINE.test(line) ? line.replace(/(:\s*)\S.*$/, '$1<redacted>') : line
  tail.push(safe)
  if (tail.length > 400) tail.shift()
  sink.write(`${safe}\n`)
}
function pipeLines(stream, sink) {
  let buf = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buf += chunk
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      emit(buf.slice(0, i).replace(/\r$/, ''), sink)
      buf = buf.slice(i + 1)
    }
  })
  stream.on('end', () => {
    if (buf) emit(buf, sink)
  })
}

const FORBIDDEN = new Set(['--linked', '--db-url', 'push', 'repair', 'link'])

// 실패해도 예외만 던진다 — 정리(finally)는 호출부가 책임진다.
function runCli(args, { allowFailure = false } = {}) {
  const bad = args.find((a) => FORBIDDEN.has(a))
  if (bad) throw new Error(`원격을 건드릴 수 있는 인자를 거부합니다: ${bad}`)

  console.log(`\n[db-tests] supabase ${args.join(' ')}`)
  return new Promise((resolve, reject) => {
    const child = spawn(CLI.cmd, [...CLI.prefix, ...args, '--yes'], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    child.on('error', (err) => reject(new Error(`CLI를 실행하지 못했습니다: ${err.message}`)))
    pipeLines(child.stdout, process.stdout)
    pipeLines(child.stderr, process.stderr)
    child.on('close', (code, signal) => {
      if (signal) return reject(new Error(`supabase ${args[0]}이 신호 ${signal}로 종료됐습니다.`))
      if (code !== 0 && !allowFailure) {
        reject(new Error(`supabase ${args.join(' ')} 실패 (exit ${code})\n--- 마지막 출력 ---\n${tail.join('\n')}`))
        return
      }
      resolve(code ?? 1)
    })
  })
}

// ── 작업 디렉터리: 매 실행마다 새로 만든다 ─────────────────────────────
const WORKDIR = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'yna-dbtest-'))
const WORK_SUPABASE = path.join(WORKDIR, 'supabase')
const PROJECT_ID = `yna_dbtest_${crypto.randomBytes(4).toString('hex')}`

// 운영 config.toml을 읽어 project_id·포트·시드만 바꾼 사본을 만든다. 원본은 손대지 않는다.
function buildTestConfig(source) {
  let section = ''
  return source
    .split(/\r?\n/)
    .map((raw) => {
      let line = raw
      const header = line.match(/^\s*\[([^\]]+)\]\s*$/)
      if (header) section = header[1]
      if (/^\s*project_id\s*=/.test(line)) line = `project_id = "${PROJECT_ID}"`
      // 개발자의 로컬 스택(543xx)과 포트를 나눈다.
      line = line.replace(/\b543(\d\d)\b/g, `${PORT_PREFIX}$1`)
      if (section === 'db.seed') {
        if (/^\s*enabled\s*=/.test(line)) line = 'enabled = false'
        if (/^\s*sql_paths\s*=/.test(line)) line = 'sql_paths = []'
      }
      // 그 밖의 값은 저장소 config를 그대로 쓴다(권한·노출 설정을 여기서 바꾸지 않는다).
      return line
    })
    .join('\n')
}

function copySql(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const name of fs.readdirSync(from)) {
    if (name.endsWith('.sql')) fs.copyFileSync(path.join(from, name), path.join(to, name))
  }
}

fs.mkdirSync(WORK_SUPABASE)
fs.writeFileSync(
  path.join(WORK_SUPABASE, 'config.toml'),
  buildTestConfig(fs.readFileSync(SRC_CONFIG, 'utf8')),
  'utf8',
)
copySql(path.join(SRC_SUPABASE, 'migrations'), path.join(WORK_SUPABASE, 'migrations'))
copySql(path.join(SRC_SUPABASE, 'tests'), path.join(WORK_SUPABASE, 'tests'))

// 20260911220000 정리 블록의 가드 회귀.
// 본문을 재작성하지 않고 마이그레이션 파일에서 그대로 읽어 임시 테스트로 다시 실행한다.
// 본문이 바뀌면 이 테스트가 바뀐 본문을 검사한다.
const CLEANUP_MIGRATION = '20260911220000_ledger_identity_dedup_cleanup.sql'
const GUARD_KEEP = 'f408267d-ffce-4c4e-9c1a-7bd55cf4c459' // 본문 첫 쌍의 정본 id
const GUARD_DROP = '1954ed0c-eea8-4004-868e-02c20fd5e6ce' // 본문 첫 쌍의 사본 id

function generateCleanupGuardTest() {
  const src = fs.readFileSync(path.join(SRC_SUPABASE, 'migrations', CLEANUP_MIGRATION), 'utf8')
  const start = src.indexOf('do $cleanup$')
  const end = src.indexOf('end $cleanup$;')
  if (start < 0 || end < 0) throw new Error(`${CLEANUP_MIGRATION}에서 do $cleanup$ 블록을 찾지 못했습니다.`)
  const body = src.slice(start, end + 'end $cleanup$;'.length)
  if (body.includes('$guardbody$')) throw new Error('본문에 $guardbody$ 인용 태그가 이미 있습니다.')

  const sql = `-- 자동 생성(scripts/db-test/run-db-tests.mjs). 저장소에 커밋하지 않는다.
-- ${CLEANUP_MIGRATION}의 do 블록 본문을 그대로 읽어 네 가지 상태에서 재실행한다.
-- 픽스처 id는 본문이 지목하는 id이며 이 임시 DB에만 존재한다.
begin;
select plan(8);

create temporary table _guard_body(sql text) on commit drop;
insert into _guard_body values ($guardbody$${body}$guardbody$);

-- 1) 정본·사본이 모두 없다 → 무해하게 지나간다(빈 DB 재생 경로).
select lives_ok(
  (select sql from _guard_body),
  '정본·사본이 모두 없으면 정리 블록이 무해하게 지나간다'
);

-- 2) 사본만 있고 정본이 없다 → 멈춘다.
insert into public.startups (id, name) values ('${GUARD_DROP}', '가드 회귀 사본');
select throws_ok(
  (select sql from _guard_body), 'P0001', null,
  '사본이 있는데 정본이 없으면 정리 블록이 멈춘다'
);
select is(
  (select count(*)::int from public.startups where id = '${GUARD_DROP}'),
  1,
  '멈춘 뒤에도 사본 행이 그대로 남아 있다'
);

-- 3) 정본이 비활성(소프트 삭제) → 여전히 멈춘다.
insert into public.startups (id, name, deleted_at)
values ('${GUARD_KEEP}', '가드 회귀 정본', now());
select throws_ok(
  (select sql from _guard_body), 'P0001', null,
  '정본이 비활성이면 정리 블록이 멈춘다'
);
select is(
  (select count(*)::int from public.startups where id in ('${GUARD_KEEP}', '${GUARD_DROP}')),
  2,
  '멈춘 뒤에도 정본·사본 두 행이 모두 남아 있다'
);

-- 4) 정본이 살아 있다 → 실제로 정리한다(가드가 본래 동작을 막지 않는다).
update public.startups set deleted_at = null where id = '${GUARD_KEEP}';
select lives_ok(
  (select sql from _guard_body),
  '정본이 살아 있으면 정리 블록이 사본을 정리한다'
);
select is(
  (select count(*)::int from public.startups where id = '${GUARD_DROP}'),
  0,
  '정리 뒤 사본 행이 사라진다'
);
select is(
  (select count(*)::int from public.startups
    where id = '${GUARD_KEEP}' and deleted_at is null),
  1,
  '정리 뒤에도 정본 행은 활성으로 남는다'
);

select * from finish();
rollback;
`
  fs.writeFileSync(path.join(WORK_SUPABASE, 'tests', 'generated_cleanup_guard_test.sql'), sql, 'utf8')
}
generateCleanupGuardTest()

function testPaths() {
  const dir = path.join(WORK_SUPABASE, 'tests')
  const all = fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()
  if (all.length === 0) throw new Error('supabase/tests 에 실행할 .sql 테스트가 없습니다.')
  if (requestedTests.length === 0) return all.map((n) => path.join(dir, n))
  return requestedTests.map((req) => {
    const name = path.basename(req)
    const hit = all.find((n) => n === name || n === `${name}.sql`)
    if (!hit) throw new Error(`테스트 파일을 찾을 수 없습니다: ${req}`)
    return path.join(dir, hit)
  })
}

// ── 실행 ───────────────────────────────────────────────────────────────
const version = (spawnSync(CLI.cmd, [...CLI.prefix, '--version'], { encoding: 'utf8' }).stdout || '').trim()
console.log('[db-tests] 격리 실행')
console.log(`[db-tests]   작업 디렉터리 : ${WORKDIR}`)
console.log(`[db-tests]   project_id    : ${PROJECT_ID}`)
console.log(`[db-tests]   CLI           : ${version || '확인 실패'} (${CLI.source}, 저장소 고정 ${PINNED || '미상'})`)
if (CLI.source === 'PATH') {
  console.log('[db-tests]   ⚠ node_modules의 Supabase CLI가 없어 PATH의 CLI를 씁니다.')
}
if (PINNED && version && version !== PINNED) {
  console.log(`[db-tests]   ⚠ CLI 버전이 저장소 고정(${PINNED})과 다릅니다.`)
}

let failure = null
let cleanupFailure = null
let testExit = 0
try {
  // 빈 볼륨이므로 start 한 번이 곧 마이그레이션 전체 재생이다(시드 없음).
  await runCli(['start', '--workdir', WORKDIR, '-x', 'studio,imgproxy,mailpit,edge-runtime,vector,logflare,realtime'])

  const tests = testPaths()
  console.log(`\n[db-tests] 실행 대상 ${tests.length}건`)
  for (const t of tests) console.log(`[db-tests]   - ${path.basename(t)}`)
  testExit = await runCli(['test', 'db', '--local', '--workdir', WORKDIR, ...tests], { allowFailure: true })
} catch (err) {
  failure = err
} finally {
  // 이 실행이 만든 project_id/workdir만 내린다.
  try {
    const code = await runCli(
      ['stop', '--workdir', WORKDIR, '--project-id', PROJECT_ID, '--no-backup'],
      { allowFailure: true },
    )
    if (code !== 0) cleanupFailure = new Error(`스택 정리 실패 (exit ${code}) — ${PROJECT_ID}`)
  } catch (err) {
    cleanupFailure = err
  }
  console.log(`[db-tests] 작업 디렉터리는 남겨 둡니다: ${WORKDIR}`)
}

if (failure) {
  console.error(`\n[db-tests] ${failure.message}`)
  if (cleanupFailure) console.error(`[db-tests] ${cleanupFailure.message}`)
  process.exit(1)
}
if (testExit !== 0) {
  console.error(`\n[db-tests] pgTAP 테스트 실패 (exit ${testExit})`)
  if (cleanupFailure) console.error(`[db-tests] ${cleanupFailure.message}`)
  process.exit(testExit)
}
if (cleanupFailure) {
  console.error(`\n[db-tests] 테스트는 통과했지만 스택 정리에 실패했습니다: ${cleanupFailure.message}`)
  process.exit(1)
}
console.log('\n[db-tests] 모든 pgTAP 테스트 통과')
