// cutoff 선택과 이력 해시. 관심은 하나다 —
// "무엇이 이력을 바꿨다고 판정되어야 하고, 무엇은 아닌가".

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'

import {
  historySha256,
  historySha256OfFiles,
  listMigrationNames,
  migrationVersion,
  splitAtCutoff,
} from './lib/migrations.mjs'

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

const NAMES = [
  '20260101000000_a.sql',
  '20260201000000_b.sql',
  '20260301000000_c.sql',
]

function tempMigrationDir(files) {
  const dir = tempDir('yna-baseline-mig-')
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8')
  }
  return dir
}

describe('버전과 cutoff 선택', () => {
  it('14자리 timestamp만 버전으로 읽는다', () => {
    assert.equal(migrationVersion('20260912025406_grants.sql'), '20260912025406')
    assert.equal(migrationVersion('init.sql'), null)
    assert.equal(migrationVersion('2026091_short.sql'), null)
  })

  it('cutoff는 포함하고 그 이후만 잘라낸다', () => {
    const { throughCutoff, afterCutoff } = splitAtCutoff(NAMES, '20260201000000')
    assert.deepEqual(throughCutoff, [NAMES[0], NAMES[1]])
    assert.deepEqual(afterCutoff, [NAMES[2]])
  })

  it('cutoff에 해당하는 파일이 사라졌으면 거부한다(선택의 근거가 없다)', () => {
    assert.throws(() => splitAtCutoff(NAMES, '20260215000000'), /cutoff/)
  })

  it('형식이 틀린 cutoff를 거부한다', () => {
    assert.throws(() => splitAtCutoff(NAMES, '2026'), /형식/)
    assert.throws(() => splitAtCutoff(NAMES, undefined), /형식/)
  })

  it('디렉터리 목록은 이름순이고, 규칙에 맞지 않는 파일이 있으면 멈춘다', () => {
    const ok = tempMigrationDir({ [NAMES[2]]: 'c', [NAMES[0]]: 'a', 'notes.txt': 'x' })
    assert.deepEqual(listMigrationNames(ok), [NAMES[0], NAMES[2]])
    const bad = tempMigrationDir({ [NAMES[0]]: 'a', 'legacy_init.sql': 'x' })
    assert.throws(() => listMigrationNames(bad), /legacy_init\.sql/)
  })
})

describe('이력 해시', () => {
  const entries = [
    { name: NAMES[0], content: 'create table a();\n' },
    { name: NAMES[1], content: 'create table b();\n' },
  ]

  it('체크아웃 줄바꿈이 달라도 같은 값을 낸다(Windows·Linux 교차 검증)', () => {
    const crlf = entries.map((e) => ({ ...e, content: e.content.replace(/\n/g, '\r\n') }))
    const bom = entries.map((e, i) => (i === 0 ? { ...e, content: `\uFEFF${e.content}` } : e))
    assert.equal(historySha256(crlf), historySha256(entries))
    assert.equal(historySha256(bom), historySha256(entries))
  })

  it('내용이 바뀌면 값이 바뀐다', () => {
    const tampered = entries.map((e, i) => (i === 0 ? { ...e, content: 'create table a(x int);\n' } : e))
    assert.notEqual(historySha256(tampered), historySha256(entries))
  })

  it('파일 이름만 바뀌어도 값이 바뀐다', () => {
    const renamed = [{ ...entries[0], name: '20260101000000_a_renamed.sql' }, entries[1]]
    assert.notEqual(historySha256(renamed), historySha256(entries))
  })

  it('파일이 빠지거나 순서가 바뀌면 값이 바뀐다', () => {
    assert.notEqual(historySha256([entries[0]]), historySha256(entries))
    assert.notEqual(historySha256([entries[1], entries[0]]), historySha256(entries))
  })

  it('cutoff 이후 파일이 쌓여도 cutoff 이하의 이력 해시는 그대로다', () => {
    const dir = tempMigrationDir({
      [NAMES[0]]: 'create table a();\n',
      [NAMES[1]]: 'create table b();\n',
    })
    const before = historySha256OfFiles(dir, [NAMES[0], NAMES[1]])
    fs.writeFileSync(path.join(dir, NAMES[2]), 'create table c();\n', 'utf8')
    const names = listMigrationNames(dir)
    const { throughCutoff } = splitAtCutoff(names, '20260201000000')
    assert.equal(historySha256OfFiles(dir, throughCutoff), before)
  })

  it('파일에서 읽은 값과 내용에서 계산한 값이 같다', () => {
    const dir = tempMigrationDir(Object.fromEntries(entries.map((e) => [e.name, e.content])))
    assert.equal(historySha256OfFiles(dir, entries.map((e) => e.name)), historySha256(entries))
  })
})
