import type { RefLinkItem } from '@ynarcher/ui'
import {
  MINUTE_LINK_TARGETS,
  minuteLinkPath,
  type MinuteLink,
} from '@/features/office/minutes/minuteLinks'

/**
 * 회의록이 가리키는 **다른 레코드**를 링크 항목으로 옮기는 자리.
 *
 * 화면(머리 카드·섹션 카드) 둘이 같은 변환을 쓰므로 컴포넌트 파일 밖에 둔다 — 한쪽에 적어
 * 두고 다른 쪽에서 import하면 그 파일이 컴포넌트와 함수를 함께 내보내는 자리가 된다.
 */

/** 임직원 상세(OFFICE 임직원 정보, 조회 전용) 경로. 회의록의 사람은 전부 여기로 간다. */
export const employeePath = (userId: string) => `/office/managers/${userId}`

/** 내부 인원(참석자·참조) 한 사람 → 링크 항목. 임직원이라 종류 표기 없이 이름만 선다. */
export function personItem(p: { userId: string; name: string }): RefLinkItem {
  return { key: p.userId, label: p.name, to: employeePath(p.userId) }
}

/**
 * 연동·외부 참석자 한 건 → 링크 항목.
 * `label`이 비어 있으면 원장 RLS가 막은 대상이라 갈 곳이 없다 — 이름 대신 그 사실을 적고
 * 링크를 걸지 않는다(`RefLinkList`가 회색 텍스트로 물러나게 처리한다).
 */
export function linkItem(l: MinuteLink, opts: { showKind: boolean }): RefLinkItem {
  const kind = MINUTE_LINK_TARGETS[l.targetType].kindLabel
  return {
    key: `${l.targetType}:${l.targetId}`,
    label: l.label ?? '접근 권한 없음',
    kind: opts.showKind ? kind : null,
    // 외부 참석자는 종류 대신 소속이 동명이인을 가른다 — 이름 뒤에 붙는 자리는 하나뿐이다.
    note: opts.showKind ? l.code : (l.code ?? kind),
    to: l.label ? minuteLinkPath(l.targetType, l.targetId) : null,
    title: l.label ? undefined : '접근 권한이 없어 열 수 없는 대상입니다',
  }
}
