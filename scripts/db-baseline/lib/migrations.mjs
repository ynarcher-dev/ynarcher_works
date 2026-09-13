// 마이그레이션 이력의 cutoff 선택과 이력 해시.
//
// 해시는 **파일의 원시 바이트가 아니라 정규형(LF) 내용**을 재료로 씁니다. Windows
// 클론(`core.autocrlf=true`)과 Linux 클론은 같은 커밋에서도 바이트가 다르므로,
// 원시 바이트를 해시하면 같은 이력이 플랫폼마다 다른 값을 냅니다.

import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

import { canonicalSha256 } from './canonical.mjs'

/** 이력 해시 알고리즘 식별자. 재료에 함께 섞여 들어가므로 규칙이 바뀌면 값도 바뀐다. */
export const HISTORY_ALGORITHM = 'yna-baseline-history/1'

const VERSION_PATTERN = /^(\d{14})_/

/** 파일명에서 14자리 timestamp 버전을 뽑는다. 규칙에 맞지 않으면 null. */
export function migrationVersion(fileName) {
  const match = VERSION_PATTERN.exec(fileName)
  return match ? match[1] : null
}

/** supabase/migrations의 .sql 파일명을 이름순으로 돌려준다. */
export function listMigrationNames(migrationDir) {
  const names = fs
    .readdirSync(migrationDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  if (names.length === 0) throw new Error(`마이그레이션 파일이 없습니다: ${migrationDir}`)
  const bad = names.filter((name) => migrationVersion(name) === null)
  if (bad.length > 0) {
    throw new Error(`버전 규칙(14자리 timestamp)에 맞지 않는 마이그레이션이 있습니다: ${bad.join(', ')}`)
  }
  return names
}

/**
 * cutoff 이하/이후로 이력을 가른다. 버전은 같은 자릿수의 timestamp이므로 문자열 비교로 충분하다.
 * cutoff에 해당하는 파일이 실제로 없으면 선택 자체가 근거를 잃으므로 거부한다.
 */
export function splitAtCutoff(names, cutoffVersion) {
  if (!/^\d{14}$/.test(String(cutoffVersion ?? ''))) {
    throw new Error(`cutoff 버전 형식이 올바르지 않습니다: ${cutoffVersion}`)
  }
  const throughCutoff = names.filter((name) => migrationVersion(name) <= cutoffVersion)
  const afterCutoff = names.filter((name) => migrationVersion(name) > cutoffVersion)
  if (!throughCutoff.some((name) => migrationVersion(name) === cutoffVersion)) {
    throw new Error(`manifest의 cutoff(${cutoffVersion})에 해당하는 마이그레이션 파일이 없습니다.`)
  }
  return { throughCutoff, afterCutoff }
}

/**
 * 이력 해시. 재료는 다음 형식의 텍스트이며 사람이 손으로도 재현할 수 있다.
 *
 *   yna-baseline-history/1\n
 *   <파일명>:<정규형 내용의 sha256>\n   ...(이름순)
 *
 * @param {{name: string, content: string|Buffer}[]} entries
 */
export function historySha256(entries) {
  const lines = entries.map(({ name, content }) => `${name}:${canonicalSha256(content)}`)
  const payload = [HISTORY_ALGORITHM, ...lines].join('\n')
  return crypto.createHash('sha256').update(Buffer.from(payload, 'utf8')).digest('hex')
}

/** 디렉터리에서 주어진 파일들을 읽어 이력 해시를 낸다. */
export function historySha256OfFiles(migrationDir, names) {
  return historySha256(
    names.map((name) => ({ name, content: fs.readFileSync(path.join(migrationDir, name)) })),
  )
}
