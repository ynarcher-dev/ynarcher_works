// 격리된 로컬 Supabase 스택 — 베이스라인 생성·검증이 공유한다.
//
//   · 매 실행마다 OS 임시 디렉터리에 mkdtemp로 새 작업 디렉터리와 고유 project_id를 만든다.
//     기존 디렉터리를 지우지 않으므로 경로를 잘못 받아 무언가를 날릴 여지가 없다.
//   · 포트는 548xx 전용 — 개발자 스택(543xx)·DB 회귀 스택(547xx)과 겹치지 않는다.
//   · config.toml은 저장소 원본을 그대로 쓰고 project_id·포트·시드만 바꾼다.
//   · CLI 호출은 저장소에 고정된 실행 파일로 `--workdir`/`--local`만 부른다.
//     원격을 건드릴 수 있는 인자(--linked·--db-url·push·repair·link)는 거부한다.
//   · 스택을 올리기 **전에** 정리용 메타데이터를 남기고, 성공·실패·예외 어디서 끝나도 내린다.

import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { historySha256 } from './migrations.mjs'

export const PORT_PREFIX = '548'

// 스택에서 빼는 서비스. **CLI가 아는 이름이어야 한다** — 모르는 이름을 주면 CLI는
// 경고 한 줄만 찍고 그 서비스를 그대로 띄운다(2026-09-12 실측: inbucket·functions·analytics가
// 그렇게 무시되어 전부 기동했다). 이름이 조용히 썩지 않도록 경고를 실패로 다룬다.
// 덤프에 필요한 db와, 마이그레이션이 기대하는 auth/storage 스키마를 만드는 서비스는 남긴다.
export const EXCLUDED_SERVICES = ['studio', 'imgproxy', 'mailpit', 'edge-runtime', 'vector', 'logflare', 'realtime']
const INVALID_EXCLUDE_WARNING = /not valid to exclude/i
const REGISTRY_DIR = path.join(os.tmpdir(), 'yna-baseline-stacks')
const FORBIDDEN_ARGS = new Set(['--linked', '--db-url', 'push', 'repair', 'link', '--project-ref'])
const REMOTE_ENV_KEYS = ['BASELINE_DB_URL', 'BASELINE_PROJECT_REF', 'BASELINE_DB_CONFIRM']

/** 로컬 모드는 원격 환경변수를 대체 입력으로 받지 않는다 — 어떤 DB를 썼는지가 흐려지면 안 된다. */
export function assertLocalOnlyEnvironment(env = process.env) {
  const present = REMOTE_ENV_KEYS.filter((key) => (env[key] ?? '').trim() !== '')
  if (present.length > 0) {
    throw new Error(
      `로컬 모드는 원격 변수(${present.join(', ')})를 쓰지 않습니다. 값이 설정된 채로는 실행하지 않습니다 — ` +
        '현재 셸에서 제거한 뒤 다시 실행하십시오.',
    )
  }
}

/**
 * 인자를 오류·로그에 실을 때 쓰는 이름. **값은 절대 싣지 않는다** —
 * 거절하는 인자일수록 값이 연결 문자열(비밀번호 포함)일 가능성이 높다.
 * 무엇이 거절됐는지는 알려야 하므로 플래그 이름은 남긴다.
 */
export function argLabel(arg) {
  if (!arg.startsWith('-')) return '<redacted>'
  const eq = arg.indexOf('=')
  return eq > 0 ? `${arg.slice(0, eq)}=<redacted>` : arg
}

/** `--db-url` 처럼 붙여 쓴 형태(`--db-url=…`)까지 같은 인자로 본다. */
export function isForbiddenArg(arg) {
  if (FORBIDDEN_ARGS.has(arg)) return true
  const eq = arg.indexOf('=')
  return eq > 0 && FORBIDDEN_ARGS.has(arg.slice(0, eq))
}

/** 명령줄에서 원격 옵션을 받지 않는다. 알 수 없는 옵션도 조용히 무시하지 않는다. */
export function parseLocalArgs(argv, allowedFlags) {
  const flags = new Set()
  for (const arg of argv) {
    if (isForbiddenArg(arg)) {
      throw new Error(`원격을 가리킬 수 있는 인자는 받지 않습니다: ${argLabel(arg)}`)
    }
    if (!allowedFlags.includes(arg)) throw new Error(`알 수 없는 인자입니다: ${argLabel(arg)}`)
    flags.add(arg)
  }
  return flags
}

/**
 * 산출물을 만들 CLI를 확정한다.
 *
 * 버전의 정체성은 **설치된 패키지가 스스로 밝히는 값**(`node_modules/supabase/package.json`)이다.
 * 루트 `package.json`의 `^2.109.0` 같은 선언은 범위이며 그 숫자는 하한일 뿐이다 —
 * 하한과 실행 파일을 대조하면 lockfile이 정상적으로 올려 둔 설치본을 거부하게 된다.
 * 여기서 보는 것은 "실행 파일이 보고하는 버전이 설치된 그 패키지가 맞는가" 하나다.
 * 무엇이 설치될지는 pnpm-lock.yaml과 `pnpm install --frozen-lockfile`이 정한다.
 */
export function resolveCli(repoRoot) {
  const pkgDir = path.join(repoRoot, 'node_modules', 'supabase')
  const entry = path.join(pkgDir, 'dist', 'supabase.js')
  if (!fs.existsSync(entry)) {
    throw new Error(
      '저장소에 설치된 Supabase CLI(node_modules/supabase)를 찾지 못했습니다. ' +
        '베이스라인은 설치된 CLI로만 만듭니다 — pnpm install 후 다시 실행하십시오.',
    )
  }

  let installed
  try {
    installed = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version
  } catch (err) {
    throw new Error(`설치된 Supabase CLI의 package.json을 읽지 못했습니다: ${err.message}`)
  }
  if (typeof installed !== 'string' || installed === '') {
    throw new Error('설치된 Supabase CLI의 package.json에 version이 없습니다.')
  }

  const reported = (spawnSync(process.execPath, [entry, '--version'], { encoding: 'utf8' }).stdout || '').trim()
  if (!reported) throw new Error('Supabase CLI 버전을 확인하지 못했습니다.')
  if (reported !== installed) {
    throw new Error(
      `실행 파일이 보고한 버전(${reported})이 설치된 패키지(${installed})와 다릅니다. ` +
        'node_modules가 섞여 있습니다 — pnpm install --frozen-lockfile 후 다시 실행하십시오.',
    )
  }
  return { entry, version: installed }
}

// ── 출력: 줄 단위로 흘려보내되 자격증명은 절대 찍지 않는다 ──────────────
// `supabase start`는 anon/service_role 키와 JWT secret을 마지막에 출력한다.
// 값 모양으로 잡는다(JWT·발급 키·긴 base64)…
const SECRET_VALUE = /(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}|sb_[A-Za-z0-9_-]{16,}|[A-Za-z0-9+/]{40,}={0,2})/g
// …그리고 `anon key: …` `DB URL: …`처럼 **구분자 바로 앞 이름**이 비밀을 가리키는 줄을 통째로 가린다.
// "ERROR: duplicate key value ..." 같은 진단 문구는 이름이 ERROR이므로 그대로 남는다(실패를 가리지 않는다).
const SECRET_LABELLED = /^([^:=\n]{0,60}?(?:key|secret|token|password|dsn|url)["']?)(\s*[:=]\s*)\S.*$/i

export function redactLine(line) {
  const labelled = SECRET_LABELLED.exec(line)
  if (labelled) return `${labelled[1]}${labelled[2]}<redacted>`
  return line.replace(SECRET_VALUE, '<redacted>')
}

function pipeLines(stream, sink, tail, onLine) {
  let buf = ''
  stream.setEncoding('utf8')
  const emit = (raw) => {
    const safe = redactLine(raw)
    tail.push(safe)
    if (tail.length > 400) tail.shift()
    sink.write(`${safe}\n`)
    if (onLine) onLine(safe)
  }
  stream.on('data', (chunk) => {
    buf += chunk
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      emit(buf.slice(0, i).replace(/\r$/, ''))
      buf = buf.slice(i + 1)
    }
  })
  stream.on('end', () => {
    if (buf) emit(buf)
  })
}

function portInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(true))
    server.once('listening', () => server.close(() => resolve(false)))
    server.listen(port, '127.0.0.1')
  })
}

/** 저장소 config.toml에서 project_id·포트·시드만 바꾼 사본을 만든다. 원본은 손대지 않는다. */
export function buildIsolatedConfig(source, projectId) {
  let section = ''
  const rewritten = source
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
      // 그 밖의 값(권한·노출 설정·DB 메이저 버전)은 저장소 config 그대로 쓴다.
      return line
    })
    .join('\n')

  // 저장소 config가 로컬 메일 서버 구역을 정의하지 않으면 CLI 기본 포트(54324)가 쓰이고,
  // 다른 스택과 부딪혀 기동이 통째로 실패한다. 포트만 548xx로 옮긴다(서비스 구성은 그대로).
  if (!/^\s*\[(?:local_smtp|inbucket)\]\s*$/m.test(rewritten)) {
    return `${rewritten}\n# 격리 실행 전용: 로컬 메일 서버 포트도 ${PORT_PREFIX}xx로 옮긴다.\n[local_smtp]\nport = ${PORT_PREFIX}24\nsmtp_port = ${PORT_PREFIX}25\npop3_port = ${PORT_PREFIX}26\n`
  }
  return rewritten
}

/**
 * 마이그레이션을 작업 디렉터리로 복사하고, **복사본을 다시 읽어** 이력 해시를 낸다.
 *
 * manifest의 `migrationHistorySha256`은 저장소 파일로 계산하지만 실제로 재생되는 것은
 * 이 복사본이다. 둘이 같다는 것을 여기서 증명해 두어야 "이 해시의 이력을 재생했다"는
 * 말이 사실이 된다. 바이트가 어긋나면 그 자리에서 멈춘다.
 *
 * @returns {string} 재생 대상(복사본)의 이력 해시
 */
export function copyMigrations(srcDir, dstDir, names) {
  const copied = []
  for (const name of names) {
    const src = path.join(srcDir, name)
    const dst = path.join(dstDir, name)
    fs.copyFileSync(src, dst)
    const srcBytes = fs.readFileSync(src)
    const dstBytes = fs.readFileSync(dst)
    if (!srcBytes.equals(dstBytes)) {
      throw new Error(`마이그레이션 복사본이 원본과 바이트가 다릅니다: ${name}`)
    }
    copied.push({ name, content: dstBytes })
  }
  return historySha256(copied)
}

/** config.toml에서 [db] major_version을 읽는다. manifest에 관측값으로 남긴다. */
export function readPostgresMajorVersion(configText) {
  let section = ''
  for (const raw of configText.split(/\r?\n/)) {
    const header = raw.match(/^\s*\[([^\]]+)\]\s*$/)
    if (header) section = header[1]
    const match = raw.match(/^\s*major_version\s*=\s*(\d+)/)
    if (match && section === 'db') return Number(match[1])
  }
  throw new Error('config.toml에서 [db] major_version을 찾지 못했습니다.')
}

/**
 * 격리 스택을 세우고 fn(stack)을 실행한 뒤, 성공·실패와 무관하게 스택을 내린다.
 * 내리기 실패는 삼키지 않고 종료 코드까지 확인해 호출부에 돌려준다.
 *
 * `replayedHistorySha256`은 **작업 디렉터리로 복사되어 실제로 재생된 파일들**의 이력 해시다.
 * 호출부는 이 값이 저장소에서 계산한 해시와 같은지 확인해야 한다.
 *
 * @returns {Promise<{ value: any, failure: Error|null, cleanupFailure: Error|null, projectId: string,
 *                     workdir: string, cliVersion: string, replayedHistorySha256: string }>}
 */
export async function withIsolatedStack({ repoRoot, label, migrationNames, log = console.log }, fn) {
  assertLocalOnlyEnvironment()
  const cli = resolveCli(repoRoot)

  const srcSupabase = path.join(repoRoot, 'supabase')
  const configText = fs.readFileSync(path.join(srcSupabase, 'config.toml'), 'utf8')
  const workdir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), `yna-baseline-${label}-`))
  const workSupabase = path.join(workdir, 'supabase')
  const projectId = `yna_baseline_${label}_${crypto.randomBytes(4).toString('hex')}`

  fs.mkdirSync(workSupabase)
  fs.writeFileSync(path.join(workSupabase, 'config.toml'), buildIsolatedConfig(configText, projectId), 'utf8')
  const workMigrations = path.join(workSupabase, 'migrations')
  fs.mkdirSync(workMigrations)
  const replayedHistorySha256 = copyMigrations(
    path.join(srcSupabase, 'migrations'),
    workMigrations,
    migrationNames,
  )

  const dbPort = Number(`${PORT_PREFIX}22`)
  const apiPort = Number(`${PORT_PREFIX}21`)
  for (const port of [dbPort, apiPort]) {
    if (await portInUse(port)) {
      throw new Error(
        `포트 ${port}가 이미 사용 중입니다. 베이스라인 스택은 한 번에 하나만 돌릴 수 있습니다 — ` +
          `남은 스택이 있다면 ${REGISTRY_DIR} 의 기록을 보고 supabase stop --project-id <id> 로 내리십시오.`,
      )
    }
  }

  // 스택을 올리기 전에 정리 단서를 남긴다. 중간에 끊겨도 무엇을 내려야 하는지 남는다.
  fs.mkdirSync(REGISTRY_DIR, { recursive: true })
  const registryFile = path.join(REGISTRY_DIR, `${projectId}.json`)
  fs.writeFileSync(
    registryFile,
    `${JSON.stringify(
      {
        projectId,
        workdir,
        repoRoot,
        ports: { db: dbPort, api: apiPort },
        pid: process.pid,
        startedAtUtc: new Date().toISOString(),
        stopCommand: `supabase stop --workdir "${workdir}" --project-id ${projectId} --no-backup`,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  const leftovers = fs
    .readdirSync(REGISTRY_DIR)
    .filter((name) => name.endsWith('.json') && name !== `${projectId}.json`)
  if (leftovers.length > 0) {
    log(`[baseline] ⚠ 정리되지 않은 스택 기록 ${leftovers.length}건: ${REGISTRY_DIR}`)
    log('[baseline]   (이 도구는 남의 스택을 지우지 않습니다. 기록을 보고 직접 내리십시오.)')
  }

  const tail = []
  let invalidExcludeWarning = null
  const watchLine = (line) => {
    if (invalidExcludeWarning === null && INVALID_EXCLUDE_WARNING.test(line)) invalidExcludeWarning = line
  }

  function runCli(args, { allowFailure = false } = {}) {
    const bad = args.find((a) => isForbiddenArg(a))
    if (bad) throw new Error(`원격을 건드릴 수 있는 인자를 거부합니다: ${argLabel(bad)}`)
    // 여기의 인자는 이 파일이 직접 만든 것뿐이지만, 출력 경로는 하나로 모아 둔다.
    log(`\n[baseline] supabase ${redactLine(args.join(' '))}`)
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cli.entry, ...args, '--yes'], {
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      })
      child.on('error', (err) => reject(new Error(`CLI를 실행하지 못했습니다: ${err.message}`)))
      pipeLines(child.stdout, process.stdout, tail, watchLine)
      pipeLines(child.stderr, process.stderr, tail, watchLine)
      child.on('close', (code, signal) => {
        if (signal) return reject(new Error(`supabase ${args[0]}이 신호 ${signal}로 종료됐습니다.`))
        if (code !== 0 && !allowFailure) {
          reject(
            new Error(
              `supabase ${redactLine(args.join(' '))} 실패 (exit ${code})\n--- 마지막 출력 ---\n${tail.join('\n')}`,
            ),
          )
          return
        }
        resolve(code ?? 1)
      })
    })
  }

  /** public·app 스키마를 덤프해 원시 텍스트로 돌려준다(정규화는 호출부). */
  async function dumpSchema(schemas) {
    const out = path.join(workdir, 'dump.sql')
    await runCli(['db', 'dump', '--local', '--workdir', workdir, '--schema', schemas.join(','), '--file', out])
    const raw = fs.readFileSync(out, 'utf8')
    if (raw.trim() === '') throw new Error('덤프가 비어 있습니다.')
    return raw
  }

  log('[baseline] 격리 스택')
  log(`[baseline]   작업 디렉터리 : ${workdir}`)
  log(`[baseline]   project_id    : ${projectId}`)
  log(`[baseline]   CLI           : ${cli.version} (node_modules/supabase 설치본)`)
  log(`[baseline]   제외 서비스   : ${EXCLUDED_SERVICES.join(', ')}`)
  log(`[baseline]   마이그레이션  : ${migrationNames.length}개 (${migrationNames[migrationNames.length - 1]}까지)`)

  let value = null
  let failure = null
  let cleanupFailure = null
  try {
    // 빈 볼륨이므로 start 한 번이 곧 마이그레이션 재생이다(시드 없음).
    await runCli(['start', '--workdir', workdir, '-x', EXCLUDED_SERVICES.join(',')])
    if (invalidExcludeWarning) {
      // 이름이 틀리면 CLI는 경고만 하고 그 서비스를 띄운다. 조용히 넘어가면
      // "무엇을 띄우고 만든 스냅샷인가"가 기록과 달라진다.
      throw new Error(
        `CLI가 제외 서비스 이름을 받아들이지 않았습니다: ${invalidExcludeWarning.trim()} — ` +
          `EXCLUDED_SERVICES(${EXCLUDED_SERVICES.join(', ')})를 이 CLI가 아는 이름으로 고치십시오.`,
      )
    }
    value = await fn({ runCli, dumpSchema, workdir, projectId, cli })
  } catch (err) {
    failure = err
  } finally {
    try {
      const code = await runCli(['stop', '--workdir', workdir, '--project-id', projectId, '--no-backup'], {
        allowFailure: true,
      })
      if (code !== 0) {
        cleanupFailure = new Error(`스택 정리 실패 (exit ${code}) — project_id ${projectId}이 남아 있을 수 있습니다.`)
      } else {
        fs.rmSync(registryFile, { force: true })
      }
    } catch (err) {
      cleanupFailure = err
    }
    log(`[baseline] 작업 디렉터리는 남겨 둡니다: ${workdir}`)
  }

  return { value, failure, cleanupFailure, projectId, workdir, cliVersion: cli.version, replayedHistorySha256 }
}

export { REGISTRY_DIR }
