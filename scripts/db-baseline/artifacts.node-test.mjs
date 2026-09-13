// 산출물 한 쌍의 판독·점검·기록.
// 가짜 저장소를 임시 디렉터리에 세워 **실제 파일로** 검사한다. 파일시스템 사정으로만
// 생기는 경로(되돌리기 실패) 하나만 해당 호출을 주입해 실패시키며, 그때도 단언은
// 구현 순서가 아니라 **남은 파일과 오류가 알려 주는 것**을 본다.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it, mock } from 'node:test'

import { canonicalSha256 } from './lib/canonical.mjs'
import {
  LOCAL_STACK_SOURCE,
  MANIFEST_FIELD_ORDER,
  baselinePaths,
  buildManifest,
  inspectBaseline,
  readManifest,
  serializeManifest,
  writeArtifactPair,
} from './lib/artifacts.mjs'
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

const SCHEMA = 'CREATE TABLE public.startups(id uuid primary key);\nGRANT SELECT ON TABLE public.startups TO authenticated;\n'
const MIGRATIONS = {
  '20260101000000_a.sql': 'create table a();\n',
  '20260201000000_b.sql': 'create table b();\n',
}

/** 모양이 모두 올바른 manifest 입력 한 벌. 각 테스트는 여기서 한 칸만 바꿔 본다. */
const FIELDS = Object.freeze({
  cutoffVersion: '20260201000000',
  migrationCount: 2,
  migrationHistorySha256: 'a'.repeat(64),
  schemaSha256: canonicalSha256(SCHEMA),
  schemas: ['public', 'app'],
  postgresMajorVersion: 17,
  supabaseCliVersion: '2.109.0',
  source: 'test fixture',
})

function makeRepo({ schema = SCHEMA, migrations = MIGRATIONS, cutoffVersion = '20260201000000' } = {}) {
  const root = tempDir('yna-baseline-repo-')
  const { baselineDir, migrationDir, schemaPath, manifestPath } = baselinePaths(root)
  fs.mkdirSync(baselineDir, { recursive: true })
  fs.mkdirSync(migrationDir, { recursive: true })
  for (const [name, content] of Object.entries(migrations)) {
    fs.writeFileSync(path.join(migrationDir, name), content, 'utf8')
  }
  const names = Object.keys(migrations).sort().filter((n) => n.slice(0, 14) <= cutoffVersion)
  const manifest = buildManifest({
    cutoffVersion,
    migrationCount: names.length,
    migrationHistorySha256: historySha256OfFiles(migrationDir, names),
    schemaSha256: canonicalSha256(schema),
    schemas: ['public', 'app'],
    postgresMajorVersion: 17,
    supabaseCliVersion: '2.109.0',
    source: 'test fixture',
  })
  fs.writeFileSync(schemaPath, schema, 'utf8')
  fs.writeFileSync(manifestPath, serializeManifest(manifest), 'utf8')
  return { root, baselineDir, migrationDir, schemaPath, manifestPath, manifest }
}

describe('빠른 점검', () => {
  it('정상 쌍을 통과시키고 cutoff 이후가 없다고 보고한다', () => {
    const { root } = makeRepo()
    const report = inspectBaseline(root)
    assert.deepEqual(report.problems, [])
    assert.equal(report.throughCutoff.length, 2)
    assert.equal(report.afterCutoff.length, 0)
  })

  it('CRLF로 체크아웃된 스냅샷도 통과한다', () => {
    const { root, schemaPath } = makeRepo()
    fs.writeFileSync(schemaPath, `\uFEFF${SCHEMA.replace(/\n/g, '\r\n')}`, 'utf8')
    assert.deepEqual(inspectBaseline(root).problems, [])
  })

  it('스냅샷 내용을 손대면 실패한다', () => {
    const { root, schemaPath } = makeRepo()
    fs.writeFileSync(schemaPath, SCHEMA.replace('TO authenticated', 'TO anon'), 'utf8')
    const report = inspectBaseline(root)
    assert.equal(report.problems.length, 1)
    assert.match(report.problems[0], /스키마 스냅샷/)
  })

  it('cutoff 이하 마이그레이션을 고치면 실패한다', () => {
    const { root, migrationDir } = makeRepo()
    fs.appendFileSync(path.join(migrationDir, '20260101000000_a.sql'), 'alter table a add column x int;\n')
    const report = inspectBaseline(root)
    assert.equal(report.problems.length, 1)
    assert.match(report.problems[0], /cutoff 이하 마이그레이션이 변경/)
  })

  it('cutoff 이하 마이그레이션을 지우면 개수와 해시가 함께 어긋난다', () => {
    const { root, migrationDir } = makeRepo()
    fs.rmSync(path.join(migrationDir, '20260101000000_a.sql'))
    const report = inspectBaseline(root)
    assert.equal(report.problems.length, 2)
  })

  it('cutoff 이후 마이그레이션이 쌓이는 것은 위반이 아니다 — 개수만 보고한다', () => {
    const { root, migrationDir } = makeRepo()
    fs.writeFileSync(path.join(migrationDir, '20260301000000_c.sql'), 'create table c();\n', 'utf8')
    const report = inspectBaseline(root)
    assert.deepEqual(report.problems, [])
    assert.deepEqual(report.afterCutoff, ['20260301000000_c.sql'])
  })

  it('산출물이 없으면 무엇을 실행해야 하는지 알려주며 멈춘다', () => {
    const { root, schemaPath } = makeRepo()
    fs.rmSync(schemaPath)
    assert.throws(() => inspectBaseline(root), /db:baseline:refresh/)
  })

  it('모르는 형식·정규화 규칙의 manifest는 해시를 비교하지 않고 거부한다', () => {
    for (const [patch, pattern] of [
      [{ formatVersion: 99 }, /formatVersion/],
      [{ normalizer: { name: 'yna-baseline-canonical', version: 99 } }, /정규화 규칙/],
      [{ historyAlgorithm: 'other/1' }, /이력 해시 알고리즘/],
    ]) {
      const { root, manifestPath, manifest } = makeRepo()
      fs.writeFileSync(manifestPath, serializeManifest({ ...manifest, ...patch }), 'utf8')
      assert.throws(() => inspectBaseline(root), pattern)
    }
  })
})

describe('산출물 기록', () => {
  function currentPair(baselineDir) {
    return {
      schema: fs.readFileSync(path.join(baselineDir, 'current_schema.sql'), 'utf8'),
      manifest: fs.readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'),
    }
  }

  it('새 쌍을 기록하면 빠른 점검을 통과한다', () => {
    const { root, baselineDir, migrationDir } = makeRepo()
    const next = `${SCHEMA}CREATE TABLE public.networks(id uuid primary key);\n`
    writeArtifactPair(baselineDir, {
      schemaText: next,
      manifest: buildManifest({
        cutoffVersion: '20260201000000',
        migrationCount: 2,
        migrationHistorySha256: historySha256OfFiles(migrationDir, Object.keys(MIGRATIONS).sort()),
        schemaSha256: canonicalSha256(next),
        schemas: ['public', 'app'],
        postgresMajorVersion: 17,
        supabaseCliVersion: '2.109.0',
        source: 'test fixture',
      }),
    })
    assert.deepEqual(inspectBaseline(root).problems, [])
  })

  it('기록에 실패하면 멀쩡한 기존 쌍을 건드리지 않는다', () => {
    const { root, baselineDir, manifest } = makeRepo()
    const before = currentPair(baselineDir)

    // schemaSha256과 맞지 않는 스키마 — 쌍이 어긋난 채 기록되면 안 된다.
    assert.throws(
      () => writeArtifactPair(baselineDir, { schemaText: 'CREATE TABLE public.other();\n', manifest }),
      /schemaSha256/,
    )
    assert.throws(() => writeArtifactPair(baselineDir, { schemaText: '   \n', manifest }), /빈 스키마/)

    assert.deepEqual(currentPair(baselineDir), before)
    assert.deepEqual(inspectBaseline(root).problems, [])
    assert.deepEqual(fs.readdirSync(baselineDir).sort(), ['current_schema.sql', 'manifest.json'])
  })

  it('기록한 스냅샷은 항상 LF 정규형이다', () => {
    const { baselineDir } = makeRepo()
    const text = 'a\r\nb\r\n'
    writeArtifactPair(baselineDir, {
      schemaText: text,
      manifest: buildManifest({ ...FIELDS, schemaSha256: canonicalSha256(text) }),
    })
    assert.equal(fs.readFileSync(path.join(baselineDir, 'current_schema.sql'), 'utf8'), 'a\nb\n')
  })

  // 두 번째 rename(manifest)이 실패하는 상황을 실제로 만든다. manifest.json 자리를
  // **비어 있지 않은 디렉터리**로 바꿔 두면 그 위로 파일을 옮길 수 없다.
  it('manifest 이동이 실패하면 이전 스키마로 되돌린다 — 새 스키마와 옛 manifest가 섞이지 않는다', () => {
    const { baselineDir, manifestPath, schemaPath } = makeRepo()
    const before = fs.readFileSync(schemaPath, 'utf8')

    fs.rmSync(manifestPath)
    fs.mkdirSync(manifestPath)
    fs.writeFileSync(path.join(manifestPath, 'occupied'), 'x', 'utf8')

    const next = `${SCHEMA}CREATE TABLE public.networks(id uuid primary key);\n`
    assert.throws(
      () => writeArtifactPair(baselineDir, { schemaText: next, manifest: buildManifest({ ...FIELDS, schemaSha256: canonicalSha256(next) }) }),
      /되돌렸습니다/,
    )

    assert.equal(fs.readFileSync(schemaPath, 'utf8'), before)
    assert.deepEqual(
      fs.readdirSync(baselineDir).sort(),
      ['current_schema.sql', 'manifest.json'],
      '임시 파일·백업이 남으면 안 된다',
    )
  })

  it('기존 쌍이 없던 자리에서 실패하면 반쪽 스키마를 남기지 않는다', () => {
    const { baselineDir, manifestPath, schemaPath } = makeRepo()
    fs.rmSync(schemaPath)
    fs.rmSync(manifestPath)
    fs.mkdirSync(manifestPath)
    fs.writeFileSync(path.join(manifestPath, 'occupied'), 'x', 'utf8')

    assert.throws(
      () => writeArtifactPair(baselineDir, { schemaText: SCHEMA, manifest: buildManifest({ ...FIELDS, schemaSha256: canonicalSha256(SCHEMA) }) }),
      /되돌렸습니다/,
    )
    assert.equal(fs.existsSync(schemaPath), false)
    assert.deepEqual(fs.readdirSync(baselineDir).sort(), ['manifest.json'])
  })
})

describe('manifest는 같은 입력이면 같은 바이트를 낸다', () => {
  it('키 순서가 정본 그대로이고, 입력 순서를 바꿔도 직렬화가 같다', () => {
    const a = buildManifest({ ...FIELDS, generatedAtUtc: '2026-09-12T00:00:00.000Z' })
    const shuffled = Object.fromEntries(Object.entries({ ...FIELDS, generatedAtUtc: '2026-09-12T00:00:00.000Z' }).reverse())
    const b = buildManifest(shuffled)
    assert.deepEqual(Object.keys(a), [...MANIFEST_FIELD_ORDER])
    assert.equal(serializeManifest(a), serializeManifest(b))
  })

  it('직렬화는 LF 정규형이고 다시 읽으면 같은 값이다', () => {
    const text = serializeManifest(buildManifest({ ...FIELDS, generatedAtUtc: '2026-09-12T00:00:00.000Z' }))
    assert.equal(text.includes('\r'), false)
    assert.equal(text.endsWith('}\n'), true)
    assert.equal(JSON.parse(text).cutoffVersion, FIELDS.cutoffVersion)
  })

  it('실행 시각만 다르면 그 필드만 달라진다(다른 값은 추정하지 않는다)', () => {
    const a = buildManifest({ ...FIELDS, generatedAtUtc: '2026-09-12T00:00:00.000Z' })
    const b = buildManifest({ ...FIELDS, generatedAtUtc: '2026-09-13T00:00:00.000Z' })
    assert.deepEqual({ ...a, generatedAtUtc: null }, { ...b, generatedAtUtc: null })
  })
})

describe('manifest는 모양이 틀린 값을 받지 않는다', () => {
  const rejected = [
    ['빈 필드', { supabaseCliVersion: '' }, /supabaseCliVersion/],
    ['잘린 cutoff', { cutoffVersion: '2026' }, /cutoffVersion/],
    ['0개 마이그레이션', { migrationCount: 0 }, /migrationCount/],
    ['정수가 아닌 개수', { migrationCount: 2.5 }, /migrationCount/],
    ['16진이 아닌 이력 해시', { migrationHistorySha256: 'x'.repeat(64) }, /migrationHistorySha256/],
    ['길이가 모자란 스키마 해시', { schemaSha256: 'ab' }, /schemaSha256/],
    ['빈 스키마 목록', { schemas: [] }, /schemas/],
    ['문자열이 아닌 스키마 이름', { schemas: ['public', 3] }, /schemas/],
    ['시각으로 읽을 수 없는 생성 시각', { generatedAtUtc: 'yesterday' }, /generatedAtUtc/],
  ]

  for (const [label, patch, pattern] of rejected) {
    it(`${label}을 거부한다`, () => {
      assert.throws(() => buildManifest({ ...FIELDS, ...patch }), pattern)
    })
  }

  it('정상 입력은 통과한다', () => {
    assert.doesNotThrow(() => buildManifest({ ...FIELDS }))
  })
})

describe('되돌리기까지 실패하면 복구 수단을 남긴다', () => {
  // 되돌리기 실패는 파일시스템 사정이라 픽스처로는 못 만든다. 구현을 흉내 내는 대신
  // **되돌리기가 쓰는 그 호출 하나**(백업 → 원본 복사)만 실패시키고 결과를 본다.
  function breakRestore() {
    const real = fs.copyFileSync
    mock.method(fs, 'copyFileSync', (src, dest) => {
      if (String(src).includes('.bak')) throw new Error('EIO: 되돌리기 복사 실패(주입)')
      return real(src, dest)
    })
  }

  function occupyManifestSlot(manifestPath) {
    fs.rmSync(manifestPath)
    fs.mkdirSync(manifestPath)
    fs.writeFileSync(path.join(manifestPath, 'occupied'), 'x', 'utf8')
  }

  it('되돌리기가 실패하면 옛 스키마 사본을 지우지 않고 경로를 알려 준다', (t) => {
    t.after(() => mock.restoreAll())
    const { baselineDir, manifestPath, schemaPath } = makeRepo()
    const before = fs.readFileSync(schemaPath, 'utf8')
    occupyManifestSlot(manifestPath)
    breakRestore()

    const next = `${SCHEMA}CREATE TABLE public.networks(id uuid primary key);\n`
    let message = ''
    assert.throws(
      () => writeArtifactPair(baselineDir, { schemaText: next, manifest: buildManifest({ ...FIELDS, schemaSha256: canonicalSha256(next) }) }),
      (err) => {
        message = err.message
        assert.match(err.message, /되돌리지도 못했습니다/)
        assert.match(err.message, /db:baseline:check/) // 이 상태가 어떻게 드러나는지 알려준다
        return true
      },
    )

    // 남은 유일한 정상 스키마가 지워지지 않았고, 그 경로가 오류에 적혀 있다.
    const backups = fs.readdirSync(baselineDir).filter((name) => name.endsWith('.bak'))
    assert.equal(backups.length, 1, `백업이 남아야 한다: ${fs.readdirSync(baselineDir).join(', ')}`)
    assert.ok(message.includes(backups[0]), '오류가 백업 경로를 알려줘야 한다')
    assert.equal(fs.readFileSync(path.join(baselineDir, backups[0]), 'utf8'), before)

    // 임시 파일은 그대로 정리된다(백업만 남긴다).
    assert.deepEqual(fs.readdirSync(baselineDir).filter((name) => name.endsWith('.tmp')), [])
  })

  it('되돌릴 옛 스키마가 없었으면 백업을 남기지 않고 지울 파일을 알려 준다', (t) => {
    t.after(() => mock.restoreAll())
    const { baselineDir, manifestPath, schemaPath } = makeRepo()
    fs.rmSync(schemaPath)
    occupyManifestSlot(manifestPath)
    // 복구 단계가 rmSync로 가므로 그쪽을 실패시킨다.
    const realRm = fs.rmSync
    mock.method(fs, 'rmSync', (target, opts) => {
      if (String(target).endsWith('current_schema.sql')) throw new Error('EPERM: 삭제 실패(주입)')
      return realRm(target, opts)
    })

    assert.throws(
      () => writeArtifactPair(baselineDir, { schemaText: SCHEMA, manifest: buildManifest({ ...FIELDS, schemaSha256: canonicalSha256(SCHEMA) }) }),
      (err) => {
        assert.match(err.message, /되돌리지도 못했습니다/)
        assert.match(err.message, /원래 없었으므로/)
        return true
      },
    )
    assert.deepEqual(fs.readdirSync(baselineDir).filter((name) => name.endsWith('.bak')), [])
  })

  it('되돌리기가 성공한 평소에는 백업을 남기지 않는다', () => {
    const { baselineDir, manifestPath } = makeRepo()
    occupyManifestSlot(manifestPath)
    const next = `${SCHEMA}-- 한 줄 더\n`
    assert.throws(
      () => writeArtifactPair(baselineDir, { schemaText: next, manifest: buildManifest({ ...FIELDS, schemaSha256: canonicalSha256(next) }) }),
      /되돌렸습니다/,
    )
    assert.deepEqual(fs.readdirSync(baselineDir).sort(), ['current_schema.sql', 'manifest.json'])
  })
})

describe('읽을 때도 만들 때와 같은 자로 모양을 잰다', () => {
  function writeManifest(manifestPath, patch) {
    const base = buildManifest({ ...FIELDS, generatedAtUtc: '2026-09-12T00:00:00.000Z' })
    fs.writeFileSync(manifestPath, serializeManifest({ ...base, ...patch }), 'utf8')
  }

  it('성한 manifest는 그대로 읽힌다', () => {
    const { manifestPath } = makeRepo()
    writeManifest(manifestPath, {})
    assert.equal(readManifest(manifestPath).cutoffVersion, FIELDS.cutoffVersion)
  })

  it('손으로 고친 필드는 읽는 단계에서 걸린다', () => {
    for (const [patch, pattern] of [
      [{ migrationCount: 0 }, /migrationCount/],
      [{ schemas: [] }, /schemas/],
      [{ schemaSha256: 'deadbeef' }, /schemaSha256/],
      [{ cutoffVersion: '2026' }, /cutoffVersion/],
      [{ source: '' }, /비어 있습니다/],
      [{ generatedAtUtc: 'yesterday' }, /generatedAtUtc/],
    ]) {
      const { manifestPath } = makeRepo()
      writeManifest(manifestPath, patch)
      assert.throws(() => readManifest(manifestPath), pattern)
    }
  })

  it('키 순서를 섞어 다시 쓴 manifest도 걸린다', () => {
    const { manifestPath } = makeRepo()
    const base = buildManifest({ ...FIELDS, generatedAtUtc: '2026-09-12T00:00:00.000Z' })
    const shuffled = Object.fromEntries(Object.entries(base).reverse())
    fs.writeFileSync(manifestPath, serializeManifest(shuffled), 'utf8')
    assert.throws(() => readManifest(manifestPath), /키 순서/)
  })

  it('객체가 아니거나 JSON이 아니면 읽지 않는다', () => {
    const { manifestPath } = makeRepo()
    fs.writeFileSync(manifestPath, '[]\n', 'utf8')
    assert.throws(() => readManifest(manifestPath), /객체가 아닙니다/)
    fs.writeFileSync(manifestPath, '{oops\n', 'utf8')
    assert.throws(() => readManifest(manifestPath), /읽을 수 없습니다/)
  })

  it('빠른 점검도 같은 검사를 거친다', () => {
    const { root, manifestPath } = makeRepo()
    writeManifest(manifestPath, { migrationCount: 0 })
    assert.throws(() => inspectBaseline(root), /migrationCount/)
  })
})

describe('source는 실행마다 달라지지 않는다', () => {
  it('고정 문구이며 실행 단서를 담지 않는다', () => {
    assert.equal(typeof LOCAL_STACK_SOURCE, 'string')
    assert.equal(/project_id|[0-9a-f]{8}|\d{4}-\d{2}-\d{2}/.test(LOCAL_STACK_SOURCE), false, LOCAL_STACK_SOURCE)
    assert.match(LOCAL_STACK_SOURCE, /isolated local stack/)
  })

  it('같은 관측값으로 만든 manifest 두 벌이 바이트까지 같다', () => {
    const at = '2026-09-12T00:00:00.000Z'
    const one = buildManifest({ ...FIELDS, source: LOCAL_STACK_SOURCE, generatedAtUtc: at })
    const two = buildManifest({ ...FIELDS, source: LOCAL_STACK_SOURCE, generatedAtUtc: at })
    assert.equal(serializeManifest(one), serializeManifest(two))
  })
})
