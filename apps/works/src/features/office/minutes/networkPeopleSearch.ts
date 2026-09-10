import { NETWORK_TARGET_TYPE } from '@/features/networks/config'
import type { NetworkPersonHit } from '@/features/networks/personSearch'
import type { MinuteLink } from '@/features/office/minutes/minuteLinks'

/**
 * 회의록이 네트워크 원장의 사람을 담을 때 쓰는 변환 하나.
 *
 * 검색 자체(`useNetworkPeopleSearch`)와 입력 눅이기(`useDebounced`)는 2026-09-10에 각각
 * `features/networks/personSearch`와 `lib/useDebounced`로 올라갔다 — 스타트업 폼의
 * 대표자·핵심인력이 같은 사람을 가리키게 되며 소비자가 둘이 됐고, 그때부터 그것들은 어느
 * 화면의 것도 아니다. 여기 남는 것은 **회의록만 아는 사실**(참석자 역할·상호참조 모양)뿐이다.
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
