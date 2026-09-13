#!/usr/bin/env node
// ACL·RLS 인벤토리 도구 — 격리된 일회용 로컬 스택을 세우고, 재생된 카탈로그를
// 읽어 기계 판독용 JSON으로 내립니다. 읽기 전용이며 저장소의 SQL은 건드리지 않습니다.
//
//   up      OS 임시 디렉터리에 작업 디렉터리를 새로 만들고(mkdtemp) 고유 project_id·
//           격리 포트(565xx)·시드 비활성으로 스택을 올립니다. 마이그레이션 전수 재생.
//   export  supabase/security/catalog_inventory.sql을 read-only 트랜잭션으로 돌려
//           supabase/security/acl-inventory.json을 씁니다.
//   status  상태 파일과 컨테이너 상태를 짧게 출력합니다.
//   down    이 도구가 올린 project_id/작업 디렉터리만 내립니다.
//
// 안전 장치
//   · --linked / 원격 --db-url / db push / migration repair 인자는 거부합니다.
//   · config.toml 사본에서 바꾸는 값은 project_id·포트·시드 셋뿐입니다. 노출·권한
//     설정(auto_expose_new_tables 등)은 저장소 원본 그대로 둡니다.
//   · 기존 디렉터리를 지우지 않습니다. down은 상태 파일의 소유 표식·project_id 형식·
//     작업 디렉터리를 확인한 뒤에만 내리고, 실패를 성공으로 적지 않습니다.
//   · CLI 출력은 허용 목록으로 거릅니다 — start 끝의 자격증명 블록은 콘솔에 나가지 않습니다.
//   · export는 **스택이 재생한 사본**의 해시가 저장소의 현재 SQL과 같을 때만 씁니다.
//     다르면 거부합니다(옛 DB에 현재 파일의 지문을 붙이지 않습니다).
//
// 사용: node scripts/security/acl-inventory.mjs <up|export|status|down> [--state <path>]

import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC_SUPABASE = path.join(REPO_ROOT, 'supabase')
const SRC_CONFIG = path.join(SRC_SUPABASE, 'config.toml')
const SRC_MIGRATIONS = path.join(SRC_SUPABASE, 'migrations')
const QUERY_SQL = path.join(SRC_SUPABASE, 'security', 'catalog_inventory.sql')
const OUT_JSON = path.join(SRC_SUPABASE, 'security', 'acl-inventory.json')

// 개발자 스택(543xx)·DB 회귀 러너(547xx)와 포트를 나눕니다.
const PORT_PREFIX = '565'

// ── 인자 ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const command = argv.find((a) => !a.startsWith('--'))
const stateFlag = argv.indexOf('--state')
const STATE_FILE =
  stateFlag >= 0 && argv[stateFlag + 1]
    ? path.resolve(argv[stateFlag + 1])
    : process.env.ACL_DB_STATE
      ? path.resolve(process.env.ACL_DB_STATE)
      : path.join(fs.realpathSync(os.tmpdir()), 'yna-acl-db.json')

if (!['up', 'export', 'status', 'down'].includes(command || '')) {
  console.error('사용: node scripts/security/acl-inventory.mjs <up|export|status|down> [--state <path>]')
  process.exit(1)
}

// ── CLI 해석 ───────────────────────────────────────────────────────────
function resolveCli() {
  const local = path.join(REPO_ROOT, 'node_modules', 'supabase', 'dist', 'supabase.js')
  if (fs.existsSync(local)) return { cmd: process.execPath, prefix: [local], source: 'node_modules' }
  return { cmd: 'supabase', prefix: [], source: 'PATH' }
}
const CLI = resolveCli()
const cliVersion = () =>
  (spawnSync(CLI.cmd, [...CLI.prefix, '--version'], { encoding: 'utf8' }).stdout || '').trim()

// ── 출력 위생 ──────────────────────────────────────────────────────────
//
// 값 뒤를 가리는 정규식(`키: <redacted>`)은 CLI가 표 형태나 JSON으로 찍을 때 새어 나갑니다.
// 그래서 **차단 목록이 아니라 허용 목록**으로 뒤집습니다 — 진행 상황으로 알아본 줄만
// 내보내고 나머지는 아예 버립니다. start 끝의 자격증명 블록은 통째로 걸러집니다.
// 원본이 필요하면 ACL_RAW_LOG에 경로를 주어 OS 임시 파일로만 받습니다(콘솔에는 안 나갑니다).
const SAFE_LINE =
  /^(\s*)(supabase local development|started|stopping|stopped|restarting|seeding|applying migration|initialising|setting up|creating|pulling|removing|service not running|no containers|warn|warning|error|failed|fatal|\[acl\])/i
const RAW_LOG = process.env.ACL_RAW_LOG ? fs.createWriteStream(process.env.ACL_RAW_LOG, { flags: 'a' }) : null
let suppressed = 0

function emit(line, sink) {
  if (RAW_LOG) RAW_LOG.write(`${line}\n`)
  if (SAFE_LINE.test(line)) sink.write(`${line}\n`)
  else if (line.trim()) suppressed += 1
}
function flushSuppressed() {
  if (!suppressed) return
  console.log(`[acl] CLI 출력 ${suppressed}줄을 숨겼습니다(자격증명·URL 포함 가능). 원본은 ACL_RAW_LOG로만 받습니다.`)
  suppressed = 0
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
function runCli(args, { allowFailure = false } = {}) {
  const bad = args.find((a) => FORBIDDEN.has(a))
  if (bad) throw new Error(`원격을 건드릴 수 있는 인자를 거부합니다: ${bad}`)
  console.log(`[acl] supabase ${args.filter((a) => !a.includes(path.sep)).join(' ')}`)
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
      flushSuppressed()
      if (code !== 0 && !allowFailure) return reject(new Error(`supabase ${args[0]} 실패 (exit ${code})`))
      resolve(code ?? 1)
    })
  })
}

// ── 상태 파일(비밀값 없음) ─────────────────────────────────────────────
function readState() {
  if (!fs.existsSync(STATE_FILE)) return null
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
}
function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}
function requireState() {
  const s = readState()
  if (!s) throw new Error(`상태 파일이 없습니다: ${STATE_FILE} — 먼저 up을 실행하세요.`)
  return s
}

// ── 저장소 SQL 지문(출처 증명) ─────────────────────────────────────────
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

// 출처 증명은 **실제로 실행된 SQL**을 가리켜야 합니다. 저장소의 현재 파일을 찍어 두고
// 나중에 그 지문을 옛 DB에 붙이면, 증명이 아니라 잘못된 증언이 됩니다. 그래서
// migrationProvenance는 디렉터리를 인자로 받고, export는 **스택이 재생한 사본**을 다시 해싱해
// 현재 저장소와 대조합니다(어긋나면 거부).
function migrationProvenance(dir = SRC_MIGRATIONS) {
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.sql'))
    .sort()
  const per = names.map((n) => `${n} ${sha256(fs.readFileSync(path.join(dir, n)))}`)
  return {
    migrations_count: names.length,
    source_cutoff: names[names.length - 1] ?? null,
    migrations_sha256: sha256(Buffer.from(`${per.join('\n')}\n`, 'utf8')),
    config_sha256: sha256(fs.readFileSync(SRC_CONFIG)),
    query_sha256: sha256(fs.readFileSync(QUERY_SQL)),
  }
}

// 재생된 스택의 사본과 저장소의 현재 SQL이 같은지 확인합니다. 다르면 그 DB에 현재 파일의
// 지문을 붙일 수 없습니다 — 증명이 아니라 거짓말이 되므로 거부하고 다시 세우게 합니다.
function assertReplayMatchesRepo(workdir) {
  const replayed = path.join(workdir, 'supabase', 'migrations')
  if (!fs.existsSync(replayed)) {
    throw new Error(`재생된 마이그레이션 사본을 찾지 못했습니다: ${replayed} — up을 다시 실행하세요.`)
  }
  const executed = migrationProvenance(replayed)
  const current = migrationProvenance(SRC_MIGRATIONS)
  if (executed.migrations_sha256 !== current.migrations_sha256) {
    throw new Error(
      '이 DB가 재생한 SQL과 저장소의 현재 SQL이 다릅니다. 현재 파일의 지문을 옛 DB에 붙이지 않습니다.\n' +
        `  실행됨 : ${executed.migrations_count}건 / ${executed.migrations_sha256.slice(0, 16)}… (cutoff ${executed.source_cutoff})\n` +
        `  저장소 : ${current.migrations_count}건 / ${current.migrations_sha256.slice(0, 16)}… (cutoff ${current.source_cutoff})\n` +
        '  → down 후 up으로 다시 세우고 export를 다시 실행하세요.',
    )
  }
  return executed
}

// ── config 사본: project_id·포트·시드만 바꾼다 ─────────────────────────
function buildConfig(source, projectId) {
  let section = ''
  return source
    .split(/\r?\n/)
    .map((raw) => {
      let line = raw
      const header = line.match(/^\s*\[([^\]]+)\]\s*$/)
      if (header) section = header[1]
      if (/^\s*project_id\s*=/.test(line)) line = `project_id = "${projectId}"`
      line = line.replace(/\b543(\d\d)\b/g, `${PORT_PREFIX}$1`)
      if (section === 'db.seed') {
        if (/^\s*enabled\s*=/.test(line)) line = 'enabled = false'
        if (/^\s*sql_paths\s*=/.test(line)) line = 'sql_paths = []'
      }
      return line
    })
    .join('\n')
}

// ── up ─────────────────────────────────────────────────────────────────
async function up() {
  const existing = readState()
  if (existing && containerRunning(existing.container)) {
    console.log(`[acl] 이미 떠 있습니다: ${existing.project_id} (db ${existing.db_port})`)
    return
  }

  const workdir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'yna-acl-'))
  const projectId = `yna_acl_${crypto.randomBytes(4).toString('hex')}`
  const workSupabase = path.join(workdir, 'supabase')
  fs.mkdirSync(workSupabase)
  fs.writeFileSync(
    path.join(workSupabase, 'config.toml'),
    buildConfig(fs.readFileSync(SRC_CONFIG, 'utf8'), projectId),
    'utf8',
  )
  const migDst = path.join(workSupabase, 'migrations')
  fs.mkdirSync(migDst)
  for (const n of fs.readdirSync(SRC_MIGRATIONS)) {
    if (n.endsWith('.sql')) fs.copyFileSync(path.join(SRC_MIGRATIONS, n), path.join(migDst, n))
  }

  const prov = migrationProvenance()
  const state = {
    tool: 'scripts/security/acl-inventory.mjs',
    purpose: 'AUTHZ-1/2 ACL 인벤토리용 일회용 로컬 스택 (읽기 전용 조회)',
    status: 'starting',
    project_id: projectId,
    workdir,
    container: `supabase_db_${projectId}`,
    db_port: Number(`${PORT_PREFIX}22`),
    api_port: Number(`${PORT_PREFIX}21`),
    port_group: `${PORT_PREFIX}xx`,
    seed: 'disabled',
    cli_version: cliVersion(),
    ...prov,
    note: '비밀값 없음. 컨테이너 내부 psql(postgres 소켓)로만 조회합니다.',
  }
  // 재생이 몇 분 걸리므로 시작 전에 먼저 적어 둡니다 — 리뷰어가 같은 DB를 찾을 수 있어야 합니다.
  writeState(state)
  console.log(`[acl] 상태 파일: ${STATE_FILE}`)

  console.log('[acl] 격리 스택을 올립니다')
  console.log(`[acl]   작업 디렉터리 : ${workdir}`)
  console.log(`[acl]   project_id    : ${projectId}`)
  console.log(`[acl]   CLI           : ${cliVersion()}`)
  console.log(`[acl]   마이그레이션  : ${prov.migrations_count}건 (cutoff ${prov.source_cutoff})`)

  // 빈 볼륨이므로 start 한 번이 곧 마이그레이션 전수 재생입니다(시드 없음).
  try {
    await runCli([
      'start', '--workdir', workdir,
      '-x', 'studio,imgproxy,mailpit,edge-runtime,vector,logflare,realtime',
    ])
  } catch (err) {
    // 실패해도 컨테이너·볼륨이 남을 수 있습니다. 소유 표식을 남긴 채 한 번 정리하고,
    // 정리 결과까지 상태 파일에 적습니다 — 실패가 흔적 없이 사라지지 않게 합니다.
    let cleanup = 'not attempted'
    try {
      const code = await runCli(['stop', '--workdir', workdir, '--project-id', projectId, '--no-backup'], {
        allowFailure: true,
      })
      cleanup = code === 0 ? 'stopped' : `stop failed (exit ${code}) — 수동 정리 필요`
    } catch (e) {
      cleanup = `stop threw: ${e.message}`
    }
    writeState({ ...state, status: 'start_failed', start_error: err.message, cleanup })
    throw new Error(`${err.message}\n[acl] 정리 결과: ${cleanup} (상태 파일: ${STATE_FILE})`)
  }

  writeState({ ...state, status: 'running' })
  console.log(`[acl] 재생 완료 — 상태 파일 갱신: ${STATE_FILE}`)
}

// ── docker 보조 ────────────────────────────────────────────────────────
function containerRunning(name) {
  if (!name) return false
  const r = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', name], { encoding: 'utf8' })
  return (r.stdout || '').trim() === 'true'
}

function psql(sql, container) {
  const r = spawnSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-P', 'pager=off', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  if (r.status !== 0) throw new Error(`psql 실패 (exit ${r.status})\n${(r.stderr || '').slice(0, 4000)}`)
  return r.stdout
}

// ── export ─────────────────────────────────────────────────────────────
function exportInventory() {
  const state = requireState()
  if (!containerRunning(state.container)) {
    throw new Error(`DB 컨테이너가 떠 있지 않습니다: ${state.container} — up을 먼저 실행하세요.`)
  }
  const executed = assertReplayMatchesRepo(state.workdir)
  const sql = fs.readFileSync(QUERY_SQL, 'utf8')
  const raw = psql(sql, state.container).trim()
  // read-only 트랜잭션의 BEGIN/COMMIT 잡음을 걷어내고 JSON 본문만 취합니다.
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error(`카탈로그 질의가 JSON을 내지 않았습니다:\n${raw.slice(0, 2000)}`)
  const catalog = JSON.parse(raw.slice(start, end + 1))

  const doc = {
    provenance: {
      generator: 'scripts/security/acl-inventory.mjs',
      query: 'supabase/security/catalog_inventory.sql',
      cli_version: state.cli_version || cliVersion(),
      postgres_version: catalog.database?.server_version ?? null,
      // 아래 지문은 **이 DB가 실제로 재생한 사본**을 해싱한 값이며, 저장소의 현재 SQL과
      // 같다는 것을 export가 확인한 뒤에만 기록됩니다(assertReplayMatchesRepo).
      source_cutoff: executed.source_cutoff,
      migrations_count: executed.migrations_count,
      migrations_sha256: executed.migrations_sha256,
      migrations_hashed_from: 'replayed copy in the disposable stack workdir',
      replay_matches_repo: true,
      config_sha256: executed.config_sha256,
      query_sha256: executed.query_sha256,
      project_id: state.project_id,
      seed: 'disabled',
      contains: 'catalog metadata only — no rows, no credentials, no user data',
    },
    ...catalog,
  }
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true })
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')

  const c = catalog.counts || {}
  console.log(`[acl] 기록: ${path.relative(REPO_ROOT, OUT_JSON)}`)
  console.log(
    `[acl] 표 ${c.tables} / 뷰 ${c.views} / 시퀀스 ${c.sequences} / 정책 ${c.policies} / ` +
      `함수 ${c.routines}(secdef ${c.routines_security_definer}) / 버킷 ${c.storage_buckets}`,
  )
}

// ── status / down ──────────────────────────────────────────────────────
function status() {
  const s = readState()
  if (!s) return console.log(`[acl] 상태 파일 없음: ${STATE_FILE}`)
  console.log(`[acl] project_id ${s.project_id} / db ${s.db_port} / 컨테이너 ${s.container}`)
  console.log(`[acl] 실행 중: ${containerRunning(s.container) ? '예' : '아니오'}`)
  console.log(`[acl] cutoff ${s.source_cutoff} (${s.migrations_count}건)`)
}

async function down() {
  const s = requireState()
  // 남의 스택을 내리지 않도록, 내릴 대상이 이 도구가 세운 것인지 먼저 확인합니다.
  if (s.tool !== 'scripts/security/acl-inventory.mjs') {
    throw new Error(`이 도구가 만든 상태 파일이 아닙니다(tool=${s.tool}). 내리지 않습니다.`)
  }
  if (!/^yna_acl_[0-9a-f]{8}$/.test(String(s.project_id || ''))) {
    throw new Error(`이 도구의 project_id 형식이 아닙니다: ${s.project_id}. 내리지 않습니다.`)
  }
  if (!s.workdir || !fs.existsSync(path.join(s.workdir, 'supabase', 'config.toml'))) {
    throw new Error(`작업 디렉터리가 이 도구의 것이 아닙니다: ${s.workdir}. 내리지 않습니다.`)
  }

  const code = await runCli(['stop', '--workdir', s.workdir, '--project-id', s.project_id, '--no-backup'], {
    allowFailure: true,
  })
  const stillUp = containerRunning(s.container)
  const ok = code === 0 && !stillUp
  writeState({ ...s, status: ok ? 'stopped' : 'stop_failed', stop_exit: code, container_running_after: stillUp })
  console.log(`[acl] 작업 디렉터리는 남겨 둡니다(지우지 않습니다): ${s.workdir}`)
  if (!ok) {
    // 실패를 성공으로 적지 않습니다.
    throw new Error(
      `스택을 내리지 못했습니다 — stop exit ${code}, 컨테이너 실행 중 ${stillUp ? '예' : '아니오'} (${s.project_id}).`,
    )
  }
  console.log(`[acl] 내렸습니다: ${s.project_id}`)
}

try {
  if (command === 'up') await up()
  else if (command === 'export') exportInventory()
  else if (command === 'status') status()
  else if (command === 'down') await down()
} catch (err) {
  console.error(`[acl] ${err.message}`)
  process.exit(1)
}
