// 격리 스택의 판정 부분 — Docker 없이 검사할 수 있는 것만 본다.
// (실제 기동·덤프는 pnpm db:baseline:verify 가 확인한다.)

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'

import {
  argLabel,
  assertLocalOnlyEnvironment,
  buildIsolatedConfig,
  copyMigrations,
  isForbiddenArg,
  parseLocalArgs,
  readPostgresMajorVersion,
  redactLine,
  resolveCli,
} from './lib/stack.mjs'
import { historySha256OfFiles } from './lib/migrations.mjs'

// 테스트가 만든 임시 디렉터리는 끝나고 지운다 — CI와 개발 머신의 TEMP에 쌓이면 안 된다.
const TEMP_DIRS = []
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix))
  TEMP_DIRS.push(dir)
  return dir
}
after(() => {
  for (const dir of TEMP_DIRS) fs.rmSync(dir, { recursive: true, force: true })
})

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CONFIG = fs.readFileSync(path.join(REPO_ROOT, 'supabase', 'config.toml'), 'utf8')

describe('원격 경로를 막는다', () => {
  it('원격 인자는 이름을 밝히며 거부한다', () => {
    for (const arg of ['--linked', '--db-url', '--db-url=postgres://x', '--project-ref=abcd']) {
      assert.throws(() => parseLocalArgs([arg], ['--full']), /원격/)
    }
  })

  it('알 수 없는 인자를 조용히 무시하지 않는다', () => {
    assert.throws(() => parseLocalArgs(['--force'], ['--full']), /알 수 없는 인자/)
    assert.deepEqual([...parseLocalArgs(['--full'], ['--full'])], ['--full'])
    assert.deepEqual([...parseLocalArgs([], ['--full'])], [])
  })

  it('원격 환경변수가 설정돼 있으면 시작하지 않는다', () => {
    assert.throws(() => assertLocalOnlyEnvironment({ BASELINE_DB_URL: 'postgresql://x' }), /BASELINE_DB_URL/)
    assert.throws(() => assertLocalOnlyEnvironment({ BASELINE_PROJECT_REF: 'abcdefgh' }), /BASELINE_PROJECT_REF/)
    assert.doesNotThrow(() => assertLocalOnlyEnvironment({ BASELINE_DB_URL: '  ' }))
    assert.doesNotThrow(() => assertLocalOnlyEnvironment({}))
  })

  it('붙여 쓴 형태(--db-url=…)도 같은 인자로 본다', () => {
    assert.equal(isForbiddenArg('--db-url=postgresql://x'), true)
    assert.equal(isForbiddenArg('--project-ref=abcd'), true)
    assert.equal(isForbiddenArg('--linked'), true)
    assert.equal(isForbiddenArg('--full'), false)
    assert.equal(isForbiddenArg('--db-url-ish'), false)
  })
})

describe('인자를 거절할 때 값을 오류에 싣지 않는다', () => {
  const SECRET = 'postgresql://postgres:S3cr3tP4ss@db.example.com:5432/postgres'

  it('거절한 원격 인자의 값이 메시지에 남지 않는다', () => {
    assert.throws(
      () => parseLocalArgs([`--db-url=${SECRET}`], ['--full']),
      (err) => {
        assert.match(err.message, /원격/)
        assert.match(err.message, /--db-url/) // 무엇이 거절됐는지는 알려준다
        assert.equal(err.message.includes('S3cr3tP4ss'), false)
        assert.equal(err.message.includes('db.example.com'), false)
        return true
      },
    )
  })

  it('알 수 없는 인자의 값도 남지 않는다 — 값 없는 위치 인자는 통째로 가린다', () => {
    assert.throws(
      () => parseLocalArgs([`--token=${SECRET}`], ['--full']),
      (err) => {
        assert.match(err.message, /알 수 없는 인자/)
        assert.equal(err.message.includes('S3cr3tP4ss'), false)
        return true
      },
    )
    assert.throws(
      () => parseLocalArgs([SECRET], ['--full']),
      (err) => {
        assert.equal(err.message.includes('S3cr3tP4ss'), false)
        assert.equal(err.message.includes('postgresql'), false)
        return true
      },
    )
  })

  it('값이 없는 플래그 이름은 그대로 보여 준다(진단을 지우지 않는다)', () => {
    assert.equal(argLabel('--full'), '--full')
    assert.equal(argLabel('--db-url'), '--db-url')
    assert.equal(argLabel('--db-url=postgresql://u:p@h/db'), '--db-url=<redacted>')
    assert.equal(argLabel('postgresql://u:p@h/db'), '<redacted>')
  })
})

describe('자격증명을 출력하지 않는다', () => {
  it('기동 요약의 키·URL을 가린다', () => {
    assert.equal(redactLine('        anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig'), '        anon key: <redacted>')
    assert.equal(redactLine('service_role key: sb_secret_abcdefghijklmnopqrstuvwxyz'), 'service_role key: <redacted>')
    assert.equal(redactLine('      JWT secret: super-long-secret-value'), '      JWT secret: <redacted>')
    assert.equal(redactLine('          DB URL: postgresql://postgres:postgres@127.0.0.1:54822/postgres'), '          DB URL: <redacted>')
  })

  it('JSON 형태의 상태 출력도 가린다', () => {
    assert.equal(redactLine('  "SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiJ9.a.b",'), '  "SERVICE_ROLE_KEY": <redacted>')
    assert.equal(redactLine('  "DB_URL": "postgresql://postgres:pw@127.0.0.1:54822/postgres",'), '  "DB_URL": <redacted>')
  })

  it('키가 이름 없이 튀어나와도 값 모양으로 가린다', () => {
    const line = redactLine('token is eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghij.klmnopqrst now')
    assert.ok(!line.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'))
    assert.ok(line.includes('<redacted>'))
  })

  it('진단 문구는 가리지 않는다 — 실패 원인을 감추면 안 된다', () => {
    const errors = [
      'ERROR: duplicate key value violates unique constraint "users_pkey" (SQLSTATE 23505)',
      'failed to apply migration 20260912025406_authenticated_data_api_grants.sql',
      'Applying migration 20260101000000_init.sql...',
    ]
    for (const line of errors) assert.equal(redactLine(line), line)
  })
})

describe('격리 설정은 저장소 config에서 세 가지만 바꾼다', () => {
  const isolated = buildIsolatedConfig(CONFIG, 'yna_baseline_test_dead')

  it('project_id를 이번 실행의 것으로 바꾼다', () => {
    assert.ok(isolated.includes('project_id = "yna_baseline_test_dead"'))
    assert.ok(!isolated.includes('project_id = "ynarcher_works"'))
  })

  it('포트를 548xx 전용으로 옮긴다(개발자 543xx·DB 회귀 547xx와 겹치지 않게)', () => {
    assert.equal(/\b543\d\d\b/.test(isolated), false)
    assert.ok(isolated.includes('54822'))
    assert.ok(isolated.includes('54821'))
  })

  it('시드를 끈다', () => {
    const seed = isolated.slice(isolated.indexOf('[db.seed]'))
    const body = seed.slice(0, seed.indexOf('\n[', 1))
    assert.match(body, /^enabled = false$/m)
    assert.match(body, /^sql_paths = \[\]$/m)
  })

  it('그 밖의 값은 저장소 config 그대로다', () => {
    const normalize = (text) =>
      text
        .split(/\r?\n/)
        .filter((line) => !/^\s*project_id\s*=/.test(line) && !/543\d\d|548\d\d/.test(line))
        .join('\n')
    const before = normalize(CONFIG)
    const after = normalize(isolated)
    // db.seed 두 줄을 제외하면 완전히 같아야 한다.
    const changed = before
      .split('\n')
      .map((line, i) => [line, after.split('\n')[i]])
      .filter(([a, b]) => a !== b)
    assert.ok(changed.length <= 2, `예상 밖의 설정 변경: ${JSON.stringify(changed)}`)
    for (const [, b] of changed) assert.match(b, /^(enabled = false|sql_paths = \[\])$/)
  })

  it('저장소가 정의하지 않는 로컬 메일 서버 포트도 548xx로 옮긴다(CLI 기본 54324와의 충돌 방지)', () => {
    assert.match(isolated, /^\[local_smtp\]$/m)
    assert.match(isolated, /^port = 54824$/m)
    // 이미 구역이 있으면 덧붙이지 않는다(TOML 중복 구역은 오류다).
    const withSection = buildIsolatedConfig(`${CONFIG}\n[local_smtp]\nport = 54324\n`, 'yna_baseline_test_dead')
    assert.equal(withSection.match(/^\[local_smtp\]$/gm).length, 1)
    assert.equal(/\b543\d\d\b/.test(withSection), false)
  })

  it('DB 메이저 버전은 저장소 설정에서 읽는다(추정하지 않는다)', () => {
    assert.equal(readPostgresMajorVersion(CONFIG), readPostgresMajorVersion(isolated))
    assert.equal(typeof readPostgresMajorVersion(CONFIG), 'number')
    assert.throws(() => readPostgresMajorVersion('[api]\nmajor_version = 15\n'), /major_version/)
  })
})

describe('재생하는 파일이 해시를 낸 그 파일임을 증명한다', () => {
  const FILES = {
    '20260101000000_a.sql': 'create table a();\n',
    '20260201000000_b.sql': 'create table b();\r\n', // CRLF 체크아웃도 그대로 복사된다
    '20260301000000_c.sql': 'create table c();\n',
  }

  function tempPair() {
    const root = tempDir('yna-baseline-copy-')
    const src = path.join(root, 'src')
    const dst = path.join(root, 'dst')
    fs.mkdirSync(src)
    fs.mkdirSync(dst)
    for (const [name, content] of Object.entries(FILES)) {
      fs.writeFileSync(path.join(src, name), content, 'utf8')
    }
    return { src, dst }
  }

  it('복사본은 원본과 바이트가 같고, 돌려준 해시는 저장소 계산값과 같다', () => {
    const { src, dst } = tempPair()
    const names = Object.keys(FILES).sort()
    const replayed = copyMigrations(src, dst, names)

    for (const name of names) {
      assert.ok(fs.readFileSync(path.join(src, name)).equals(fs.readFileSync(path.join(dst, name))), name)
    }
    assert.equal(replayed, historySha256OfFiles(src, names))
    assert.deepEqual(fs.readdirSync(dst).sort(), names)
  })

  it('해시는 재생하기로 한 부분집합만 덮는다(cutoff 이후는 복사하지 않는다)', () => {
    const { src, dst } = tempPair()
    const throughCutoff = ['20260101000000_a.sql', '20260201000000_b.sql']
    const replayed = copyMigrations(src, dst, throughCutoff)

    assert.equal(replayed, historySha256OfFiles(src, throughCutoff))
    assert.notEqual(replayed, historySha256OfFiles(src, Object.keys(FILES).sort()))
    assert.deepEqual(fs.readdirSync(dst).sort(), throughCutoff)
  })

  it('원본이 바뀌면 재생 해시도 바뀐다', () => {
    const { src, dst } = tempPair()
    const names = Object.keys(FILES).sort()
    const before = copyMigrations(src, dst, names)
    fs.appendFileSync(path.join(src, names[0]), 'alter table a add column x int;\n')
    const { dst: dst2 } = { dst: tempDir('yna-baseline-copy2-') }
    assert.notEqual(copyMigrations(src, dst2, names), before)
  })

  it('없는 파일을 재생 목록에 넣으면 복사 단계에서 멈춘다', () => {
    const { src, dst } = tempPair()
    assert.throws(() => copyMigrations(src, dst, ['20269999000000_missing.sql']))
  })
})

// CLI의 정체성은 **설치된 패키지가 밝히는 버전**이다. 저장소 선언(^2.109.0)은 범위이며
// 그 숫자는 하한일 뿐이라, 하한으로 대조하면 lockfile이 올려 둔 정상 설치를 거부한다.
describe('CLI 버전은 설치된 패키지로 확인한다', () => {
  function fakeRepo({ installed, reported = installed, declared = '^2.109.0', withPackageJson = true }) {
    const root = tempDir('yna-baseline-cli-')
    const pkgDir = path.join(root, 'node_modules', 'supabase')
    fs.mkdirSync(path.join(pkgDir, 'dist'), { recursive: true })
    if (withPackageJson) {
      fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'supabase', version: installed }))
    }
    // 실제 CLI처럼 버전 한 줄만 찍는 대역.
    fs.writeFileSync(path.join(pkgDir, 'dist', 'supabase.js'), `console.log(${JSON.stringify(reported)})\n`)
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ devDependencies: { supabase: declared } }))
    return root
  }

  it('선언이 범위(^)이고 설치본이 그보다 높아도 거부하지 않는다', () => {
    const root = fakeRepo({ installed: '2.115.3', declared: '^2.109.0' })
    const cli = resolveCli(root)
    assert.equal(cli.version, '2.115.3')
    assert.equal(cli.entry, path.join(root, 'node_modules', 'supabase', 'dist', 'supabase.js'))
  })

  it('선언과 설치본이 같아도 그대로 통과한다', () => {
    assert.equal(resolveCli(fakeRepo({ installed: '2.109.0', declared: '2.109.0' })).version, '2.109.0')
  })

  it('실행 파일이 보고한 버전이 설치된 패키지와 다르면 거부한다', () => {
    const root = fakeRepo({ installed: '2.115.3', reported: '2.109.0' })
    assert.throws(() => resolveCli(root), /2\.115\.3/)
    assert.throws(() => resolveCli(root), /frozen-lockfile/)
  })

  it('CLI가 설치돼 있지 않으면 무엇을 해야 하는지 알려주며 멈춘다', () => {
    const root = tempDir('yna-baseline-cli-none-')
    assert.throws(() => resolveCli(root), /pnpm install/)
  })

  it('설치된 패키지의 package.json이 없거나 version이 없으면 멈춘다', () => {
    assert.throws(() => resolveCli(fakeRepo({ installed: '2.115.3', withPackageJson: false })), /package.json/)

    const root = fakeRepo({ installed: '2.115.3' })
    fs.writeFileSync(path.join(root, 'node_modules', 'supabase', 'package.json'), JSON.stringify({ name: 'supabase' }))
    assert.throws(() => resolveCli(root), /version/)
  })

  it('버전을 한 줄도 찍지 못하면 멈춘다', () => {
    const root = fakeRepo({ installed: '2.115.3' })
    fs.writeFileSync(path.join(root, 'node_modules', 'supabase', 'dist', 'supabase.js'), 'process.exit(1)\n')
    assert.throws(() => resolveCli(root), /버전을 확인하지 못했습니다/)
  })
})
