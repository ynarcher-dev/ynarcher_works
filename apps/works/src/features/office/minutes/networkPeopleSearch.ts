import { NETWORK_TARGET_TYPE } from '@/features/networks/config'
import type { NetworkPersonHit } from '@/features/networks/personSearch'
import type { MinuteLink } from '@/features/office/minutes/minuteLinks'

/**
 * NETWORKS에서 찾지 못한 참석자를 회의록 문자열 명단에 더한다.
 * 공백만인 값과 같은 표기의 중복은 받지 않되, 소속이 다른 동명이인 표기는 보존한다.
 */
export function addUnlinkedAttendee(current: string[], raw: string): string[] {
  const value = raw.trim()
  if (!value || current.some((item) => item.trim() === value)) return current
  return [...current, value]
}

/**
 * 회의록이 네트워크 원장의 사람을 담을 때 쓰는 변환 하나.
 *
 * 검색 자체(`useNetworkPeopleSearch`)는 NETWORKS 원장을 읽으므로 그 기능 폴더에 있고,
 * 입력 눅이기(`useDebounced`)는 다른 검색 화면도 함께 쓰므로 공용 자리에 있다. 여기 남는 것은
 * **회의록만 아는 사실**(참석자 역할·상호참조 모양)뿐이다.
 */

/**
 * 검색 결과 1건 → 회의록이 저장할 상호참조.
 *
 * 이 변환이 있어야 하는 이유가 곧 2026-09-03 변경의 요지다 — 종전에는 여기서 '이름/소속'
 * 문자열만 뽑아 명단에 담았고, 그 순간 어느 레코드에서 온 사람인지가 사라졌다.
 */
export function toExternalPersonLink(hit: NetworkPersonHit): MinuteLink {
  return {
    targetType: NETWORK_TARGET_TYPE,
    targetId: hit.id,
    role: 'EXTERNAL_ATTENDEE',
    label: hit.name,
    code: hit.affiliation,
  }
}
