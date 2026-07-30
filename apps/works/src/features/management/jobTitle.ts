/**
 * 임직원을 이름 옆에서 부르는 말(호칭)을 정하는 단일 기준.
 *
 * 호칭은 "직급 + 직책"이 아니다 — 어느 쪽이 그 사람의 자리를 말해 주는지가 조합마다 다르다.
 * 그 판단을 코드에 목록으로 박아 두면 직급·직책 태그가 늘 때마다 배포가 필요하므로, 판단은
 * 태그 원장의 **표기 방식**(`display_mode`) 입력값이 갖고 여기서는 두 값을 합치는 순서만 정한다.
 *
 *   '우선'      → 그쪽만. 직급 우선이 직책 우선을 이긴다(둘 다 '우선'이면 직급이 이기는 자리).
 *   '병렬 붙여쓰기' → 직급직책 — 심사역·매니저처럼 직급이 앞에 붙어 한 단어가 되는 표기.
 *   '병렬 따로쓰기' → 직급/직책 — 임원처럼 등급과 맡은 자리를 둘 다 밝히는 표기.
 *   둘 다 기본   → 직책이 있으면 직책만, 없으면 직급만(실장·팀장은 그 자체가 위계다).
 *
 * 병렬을 어느 쪽이 선언했든 붙여쓰기·따로쓰기는 그 설정이 정한다 — 직급 쪽 설정이 먼저 걸린다.
 *
 * 어느 쪽이든 값이 비어 있으면 남은 한쪽만 적고, 둘 다 비면 아무것도 적지 않는다 — 없다는
 * 사실은 읽을 필요가 없으므로 '-'로 채우지 않는다.
 */

/** 태그 원장의 표기 방식. DB(rank_tags/position_tags.display_mode)의 값과 같아야 한다. */
export type TagDisplayMode = 'DEFAULT' | 'PRIORITY' | 'PARALLEL_JOINED' | 'PARALLEL_SEPARATE'

/** 병렬 표기의 두 모양 — 붙여쓰기('책임매니저')와 따로쓰기('이사/본부장'). */
const PARALLEL_SEPARATOR: Record<'PARALLEL_JOINED' | 'PARALLEL_SEPARATE', string> = {
  PARALLEL_JOINED: '',
  PARALLEL_SEPARATE: '/',
}

function parallelSeparator(mode: TagDisplayMode): string | null {
  return mode === 'PARALLEL_JOINED' || mode === 'PARALLEL_SEPARATE' ? PARALLEL_SEPARATOR[mode] : null
}

/** 태그명 → 표기 방식. 원장에 없는 이름은 'DEFAULT'로 본다. */
export type DisplayModeMap = Map<string, TagDisplayMode>

export interface JobTitleModes {
  rank: DisplayModeMap
  position: DisplayModeMap
}

function modeOf(map: DisplayModeMap | undefined, name: string): TagDisplayMode {
  return map?.get(name) ?? 'DEFAULT'
}

/** 표기 방식 문자열(DB·태그 설정)에서 아는 값만 걸러 낸다. 모르는 값은 기본으로 본다. */
export function toDisplayMode(value?: string | null): TagDisplayMode {
  return value === 'PRIORITY' || value === 'PARALLEL_JOINED' || value === 'PARALLEL_SEPARATE'
    ? value
    : 'DEFAULT'
}

/**
 * 이름 옆 태그에 찍을 호칭. `modes`를 주지 않으면(태그 원장을 아직 못 읽은 첫 렌더 등)
 * 모두 기본으로 보아 '직책이 있으면 직책, 없으면 직급'으로 떨어진다 — 값이 튀는 대신
 * 덜 자세해지는 쪽으로 실패한다.
 */
export function jobTitleLabel(
  rank?: string | null,
  position?: string | null,
  modes?: JobTitleModes,
): string {
  const r = (rank ?? '').trim()
  const p = (position ?? '').trim()

  // 한쪽이 비면 합칠 것이 없다 — 표기 방식을 볼 것도 없이 남은 값이 곧 호칭이다.
  if (!r || !p) return r || p
  // 같은 말이 양쪽 원장에 다 적힌 경우('이사') — 두 번 적지 않는다.
  if (r === p) return r

  const rankMode = modeOf(modes?.rank, r)
  const positionMode = modeOf(modes?.position, p)

  if (rankMode === 'PRIORITY') return r
  if (positionMode === 'PRIORITY') return p

  // 병렬은 선언한 쪽이 모양까지 정한다 — 붙여쓰기면 한 단어, 따로쓰기면 슬래시로 나란히.
  const sep = parallelSeparator(rankMode) ?? parallelSeparator(positionMode)
  if (sep !== null) return `${r}${sep}${p}`
  return p
}
