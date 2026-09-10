import type { RefLinkItem } from '@ynarcher/ui'
import { MINUTE_LINK_TARGETS, type MinuteLink } from '@/features/office/minutes/minuteLinks'

/**
 * 회의록이 가리키는 **다른 레코드**를 상호참조 항목으로 옮기는 자리.
 *
 * **길은 두지 않는다**(2026-09-10 사용자 지정). 회의록 한 장에는 사람 여럿과 연동 대상이 함께
 * 서는데, 그 이름이 전부 링크가 되면 화면이 파란 글자로 덮여 정작 읽어야 할 값(회의일·장소·
 * 본문)이 그 사이에 묻힌다. 그래서 항목은 `to`를 주지 않고 이름만 세운다 — `RefLinkList`가
 * 값 톤 그대로 쉼표로 잇는다.
 *
 * 다만 **권한이 없어 열 수 없는 대상은 여전히 `to: null`**이다. 그 회색은 '링크가 없다'가
 * 아니라 '가리키는 것이 있는데 볼 수 없다'는 사실이고, 링크를 걷었다고 함께 지울 값이 아니다.
 */

/** 내부 인원(참석자·참조) 한 사람 → 상호참조 항목. 임직원이라 종류 표기 없이 이름만 선다. */
export function personItem(p: { userId: string; name: string }): RefLinkItem {
  return { key: p.userId, label: p.name }
}

/**
 * 연동·외부 참석자 한 건 → 상호참조 항목.
 * `label`이 비어 있으면 원장 RLS가 막은 대상이라 이름 대신 그 사실을 적고 `to: null`로
 * 물러나게 한다(`RefLinkList`가 회색 텍스트로 처리한다).
 */
export function linkItem(l: MinuteLink, opts: { showKind: boolean }): RefLinkItem {
  const kind = MINUTE_LINK_TARGETS[l.targetType].kindLabel
  return {
    key: `${l.targetType}:${l.targetId}`,
    label: l.label ?? '접근 권한 없음',
    kind: opts.showKind ? kind : null,
    // 외부 참석자는 종류 대신 소속이 동명이인을 가른다 — 이름 뒤에 붙는 자리는 하나뿐이다.
    note: opts.showKind ? l.code : (l.code ?? kind),
    to: l.label ? undefined : null,
    title: l.label ? undefined : '접근 권한이 없어 열 수 없는 대상입니다',
  }
}
