// 베이스라인 산출물(current_schema.sql + manifest.json)의 생성·판독·빠른 점검.
//
// 두 파일은 한 쌍입니다. 한쪽만 새것이면 해시가 어긋나 check가 실패하도록 만들며,
// 생성에 실패한 실행이 멀쩡한 기존 쌍을 덮어쓰지 않게 임시 파일에 다 쓰고 마지막에 옮깁니다.

import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

import { NORMALIZER, canonicalSha256, toCanonicalText } from './canonical.mjs'
import { HISTORY_ALGORITHM, historySha256OfFiles, listMigrationNames, splitAtCutoff } from './migrations.mjs'

export const MANIFEST_FORMAT_VERSION = 2
export const SCHEMA_FILE = 'current_schema.sql'
export const MANIFEST_FILE = 'manifest.json'

export function baselinePaths(repoRoot) {
  const baselineDir = path.join(repoRoot, 'supabase', 'baseline')
  return {
    baselineDir,
    migrationDir: path.join(repoRoot, 'supabase', 'migrations'),
    schemaPath: path.join(baselineDir, SCHEMA_FILE),
    manifestPath: path.join(baselineDir, MANIFEST_FILE),
  }
}

// manifest의 키 순서는 이 배열이 정본이다. JSON.stringify는 삽입 순서를 그대로 쓰므로,
// 같은 입력이면 언제나 같은 바이트가 나온다(generatedAtUtc만 실행마다 다른 관측값이다).
export const MANIFEST_FIELD_ORDER = Object.freeze([
  'formatVersion',
  'normalizer',
  'historyAlgorithm',
  'generatedAtUtc',
  'postgresMajorVersion',
  'supabaseCliVersion',
  'cutoffVersion',
  'migrationCount',
  'migrationHistorySha256',
  'schemas',
  'schemaSha256',
  'source',
])

const SHA256_HEX = /^[0-9a-f]{64}$/
const CUTOFF_VERSION = /^\d{14}$/

/**
 * 산출물을 만든 경로를 밝히는 **고정 문구**. 실행마다 달라지는 값(project_id·작업 디렉터리)은
 * 넣지 않는다 — 같은 스키마를 다시 만들면 manifest가 같은 바이트여야 하기 때문이다.
 * 이번 실행이 어떤 스택을 썼는지는 실행 로그와 `%TEMP%/yna-baseline-stacks/`의 기록이 가진다.
 */
export const LOCAL_STACK_SOURCE = 'isolated local stack (supabase start, seed disabled)'

/**
 * manifest 한 벌이 갖춰야 할 모양. **만들 때와 읽을 때 같은 자를 쓴다** —
 * 생성만 검사하면 손으로 고친 산출물이 그대로 통과한다.
 *
 * @param {object} manifest
 * @param {string} where 오류 메시지에 붙일 대상 이름
 */
export function assertManifestShape(manifest, where = 'manifest') {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`${where}가 객체가 아닙니다.`)
  }
  for (const [key, value] of Object.entries(manifest)) {
    if (value === undefined || value === null || value === '') {
      throw new Error(`${where} 필드가 비어 있습니다: ${key}`)
    }
  }
  // 모양까지 본다. "비어 있지 않다"만으로는 빈 배열·0개·잘린 해시가 그대로 통과한다.
  if (!CUTOFF_VERSION.test(manifest.cutoffVersion)) {
    throw new Error(`${where}의 cutoffVersion은 14자리 timestamp여야 합니다: ${manifest.cutoffVersion}`)
  }
  if (!Number.isInteger(manifest.migrationCount) || manifest.migrationCount < 1) {
    throw new Error(`${where}의 migrationCount는 1 이상의 정수여야 합니다: ${manifest.migrationCount}`)
  }
  for (const key of ['migrationHistorySha256', 'schemaSha256']) {
    if (!SHA256_HEX.test(manifest[key])) {
      throw new Error(`${where}의 ${key}는 소문자 16진 64자리 SHA-256이어야 합니다.`)
    }
  }
  if (!Array.isArray(manifest.schemas) || manifest.schemas.length === 0 ||
      manifest.schemas.some((name) => typeof name !== 'string' || name === '')) {
    throw new Error(`${where}의 schemas는 비어 있지 않은 스키마 이름 배열이어야 합니다.`)
  }
  if (!Number.isInteger(manifest.postgresMajorVersion)) {
    throw new Error(`${where}의 postgresMajorVersion은 정수여야 합니다: ${manifest.postgresMajorVersion}`)
  }
  if (Number.isNaN(Date.parse(manifest.generatedAtUtc))) {
    throw new Error(`${where}의 generatedAtUtc를 시각으로 읽을 수 없습니다: ${manifest.generatedAtUtc}`)
  }
  // 키 순서가 흐트러지면 같은 입력이 다른 바이트를 낸다 — 여기서 붙잡는다.
  const keys = Object.keys(manifest)
  if (keys.length !== MANIFEST_FIELD_ORDER.length || keys.some((key, i) => key !== MANIFEST_FIELD_ORDER[i])) {
    throw new Error(`${where} 키 순서가 정본과 다릅니다: ${keys.join(', ')}`)
  }
  return manifest
}

/**
 * manifest를 만든다. 값은 모두 **이번 생성 실행에서 관측한 것**이며 추정하지 않는다.
 */
export function buildManifest({
  cutoffVersion,
  migrationCount,
  migrationHistorySha256,
  schemaSha256,
  schemas,
  postgresMajorVersion,
  supabaseCliVersion,
  generatedAtUtc = new Date().toISOString(),
  source,
}) {
  const manifest = {
    formatVersion: MANIFEST_FORMAT_VERSION,
    normalizer: { name: NORMALIZER.name, version: NORMALIZER.version },
    historyAlgorithm: HISTORY_ALGORITHM,
    generatedAtUtc,
    postgresMajorVersion,
    supabaseCliVersion,
    cutoffVersion,
    migrationCount,
    migrationHistorySha256,
    schemas,
    schemaSha256,
    source,
  }
  return assertManifestShape(manifest)
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * manifest를 읽고, 이 구현이 다룰 수 있는 형식인지와 **모양이 성한지**까지 확인한다.
 *
 * 호환성(형식 버전·정규화 규칙·이력 알고리즘)을 먼저 본다 — 다룰 수 없는 형식이면
 * 필드 모양을 따지는 것이 의미가 없고, "다시 생성하십시오"가 정확한 안내이기 때문이다.
 * 그다음 생성 때와 **같은 자**로 모양을 재며, 여기서 손으로 고친 산출물이 걸린다.
 */
export function readManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, 'utf8')
  let manifest
  try {
    manifest = JSON.parse(toCanonicalText(raw))
  } catch (err) {
    throw new Error(`manifest.json을 읽을 수 없습니다: ${err.message}`)
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('manifest.json이 객체가 아닙니다.')
  }
  if (manifest.formatVersion !== MANIFEST_FORMAT_VERSION) {
    throw new Error(
      `manifest formatVersion ${manifest.formatVersion}은 이 도구(${MANIFEST_FORMAT_VERSION})가 다루지 않습니다. 베이스라인을 다시 생성하십시오.`,
    )
  }
  if (manifest.normalizer?.name !== NORMALIZER.name || manifest.normalizer?.version !== NORMALIZER.version) {
    throw new Error(
      `정규화 규칙이 다릅니다(manifest=${manifest.normalizer?.name}/${manifest.normalizer?.version}, 도구=${NORMALIZER.name}/${NORMALIZER.version}). 해시를 비교할 수 없으므로 베이스라인을 다시 생성해야 합니다.`,
    )
  }
  if (manifest.historyAlgorithm !== HISTORY_ALGORITHM) {
    throw new Error(
      `이력 해시 알고리즘이 다릅니다(manifest=${manifest.historyAlgorithm}, 도구=${HISTORY_ALGORITHM}).`,
    )
  }
  return assertManifestShape(manifest, 'manifest.json')
}

/**
 * Docker 없이 도는 빠른 점검. 스키마 해시와 이력 해시를 **둘 다** 확인한다.
 * 던지지 않고 문제 목록을 돌려주므로 호출부가 전부 보여줄 수 있다.
 *
 * @returns {{ manifest: object, problems: string[], throughCutoff: string[], afterCutoff: string[],
 *             schemaSha256: string, historySha256: string }}
 */
export function inspectBaseline(repoRoot) {
  const { schemaPath, manifestPath, migrationDir } = baselinePaths(repoRoot)
  for (const p of [schemaPath, manifestPath]) {
    if (!fs.existsSync(p)) {
      throw new Error(`베이스라인 산출물이 없습니다: ${path.relative(repoRoot, p)} — pnpm db:baseline:refresh 로 생성하십시오.`)
    }
  }

  const manifest = readManifest(manifestPath)
  const problems = []

  const schemaRaw = fs.readFileSync(schemaPath)
  if (schemaRaw.length === 0) problems.push('current_schema.sql이 비어 있습니다.')
  const schemaSha256 = canonicalSha256(schemaRaw)
  if (schemaSha256 !== manifest.schemaSha256) {
    problems.push(
      `스키마 스냅샷이 manifest와 다릅니다(manifest=${manifest.schemaSha256.slice(0, 12)}…, 실제=${schemaSha256.slice(0, 12)}…). ` +
        '산출물을 손으로 고쳤거나 한쪽만 갱신된 상태입니다.',
    )
  }

  const names = listMigrationNames(migrationDir)
  const { throughCutoff, afterCutoff } = splitAtCutoff(names, manifest.cutoffVersion)
  if (throughCutoff.length !== manifest.migrationCount) {
    problems.push(
      `cutoff 이하 마이그레이션 수가 다릅니다(manifest=${manifest.migrationCount}, 현재=${throughCutoff.length}). 파일이 추가·삭제·개명되었습니다.`,
    )
  }
  const historySha = historySha256OfFiles(migrationDir, throughCutoff)
  if (historySha !== manifest.migrationHistorySha256) {
    problems.push(
      'cutoff 이하 마이그레이션이 변경되었습니다. 되돌리거나 의도한 변경이라면 베이스라인을 다시 생성하십시오.',
    )
  }

  return { manifest, problems, throughCutoff, afterCutoff, schemaSha256, historySha256: historySha }
}

/**
 * 두 산출물을 한 쌍으로 기록한다.
 *
 *  · 임시 파일에 모두 쓰고 **정합성을 확인한 뒤에만** 제자리로 옮긴다.
 *  · 이 함수가 **오류를 던지고 돌아오는 경우**에는 기존 쌍이 그대로 남는다. 스키마를 먼저
 *    옮기되 두 번째 이동(manifest)이 실패하면 옛 스키마로 되돌리기 때문이다.
 *  · **원자적이지는 않다.** 두 rename 사이에서 프로세스가 강제 종료되거나(SIGKILL·전원 차단)
 *    저장소가 끊기면 되돌릴 코드가 돌지 못하고 `새 스키마 + 옛 manifest`가 남을 수 있다.
 *    파일시스템 수준의 두 파일 원자적 교체는 이식 가능한 방법이 없으므로, 대신 그 상태를
 *    **감출 수 없게** 만들어 둔다: schemaSha256이 어긋나므로 `pnpm db:baseline:check`가
 *    반드시 실패한다. 복구는 산출물을 손으로 고치는 것이 아니라 refresh를 다시 도는 것이다.
 *  · 되돌리기까지 실패하면 그 사실을 오류에 담고, **옛 스키마 사본(.bak)을 지우지 않고 남긴다** —
 *    그 파일이 남은 유일한 정상 스키마이기 때문이다. 경로는 오류 메시지가 알려 준다.
 */
export function writeArtifactPair(baselineDir, { schemaText, manifest }) {
  fs.mkdirSync(baselineDir, { recursive: true })
  const stamp = `${process.pid}.${crypto.randomBytes(4).toString('hex')}`
  const schemaTmp = path.join(baselineDir, `.${SCHEMA_FILE}.${stamp}.tmp`)
  const manifestTmp = path.join(baselineDir, `.${MANIFEST_FILE}.${stamp}.tmp`)
  const schemaBackup = path.join(baselineDir, `.${SCHEMA_FILE}.${stamp}.bak`)
  // 되돌리기가 실패하면 이 사본이 남은 유일한 정상 스키마다 — finally가 지우면 안 된다.
  let keepBackup = false

  try {
    const canonicalSchema = toCanonicalText(schemaText)
    if (canonicalSchema.trim() === '') throw new Error('빈 스키마는 산출물이 될 수 없습니다.')
    if (canonicalSha256(canonicalSchema) !== manifest.schemaSha256) {
      throw new Error('manifest의 schemaSha256이 기록하려는 스키마와 맞지 않습니다.')
    }
    fs.writeFileSync(schemaTmp, Buffer.from(canonicalSchema, 'utf8'))
    fs.writeFileSync(manifestTmp, Buffer.from(serializeManifest(manifest), 'utf8'))

    // 기록된 바이트를 다시 읽어 확인한다(쓰다 만 파일을 산출물로 승격시키지 않는다).
    if (canonicalSha256(fs.readFileSync(schemaTmp)) !== manifest.schemaSha256) {
      throw new Error('임시 스키마 파일을 다시 읽은 해시가 맞지 않습니다.')
    }
    JSON.parse(fs.readFileSync(manifestTmp, 'utf8'))

    const schemaTarget = path.join(baselineDir, SCHEMA_FILE)
    const manifestTarget = path.join(baselineDir, MANIFEST_FILE)

    const hadSchema = fs.existsSync(schemaTarget)
    if (hadSchema) fs.copyFileSync(schemaTarget, schemaBackup)
    fs.renameSync(schemaTmp, schemaTarget)
    try {
      fs.renameSync(manifestTmp, manifestTarget)
    } catch (err) {
      try {
        if (hadSchema) fs.copyFileSync(schemaBackup, schemaTarget)
        else fs.rmSync(schemaTarget, { force: true })
      } catch (restoreErr) {
        keepBackup = hadSchema
        throw new Error(
          `manifest를 옮기지 못했고(${err.message}) 이전 스키마로 되돌리지도 못했습니다(${restoreErr.message}). ` +
            `${SCHEMA_FILE}은 새 내용이고 ${MANIFEST_FILE}은 옛 내용이라 쌍이 어긋나 있습니다 — ` +
            'pnpm db:baseline:check 가 이 상태를 해시 불일치로 잡습니다. ' +
            (hadSchema
              ? `이전 스키마 사본을 남겨 둡니다(복구용): ${schemaBackup}`
              : `이전 스키마는 원래 없었으므로 ${SCHEMA_FILE}을 지우고 다시 생성하십시오.`),
        )
      }
      throw new Error(`manifest를 제자리로 옮기지 못해 이전 산출물 쌍으로 되돌렸습니다: ${err.message}`)
    }
  } finally {
    const disposable = keepBackup ? [schemaTmp, manifestTmp] : [schemaTmp, manifestTmp, schemaBackup]
    for (const tmp of disposable) {
      if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true })
    }
  }
}
