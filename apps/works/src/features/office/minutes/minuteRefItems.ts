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
 *
 * **이름이 어디서 온 값인지는 이름 앞 태그가 답한다**(2026-09-10 사용자 지정) — 연동 대상은
 * 원장 이름(`STARTUP`·`FUND`), 외부 참석자는 소속이다. 둘을 한 자리에 모으는 이유는 묻는
 * 것이 같아서다: 이 이름이 어느 원장·어느 조직의 것인가. 회의록 한 장에는 그 이름이 여럿
 * 서므로 회색 글자로 앞에 붙이면 이름과 분류가 같은 무게로 이어져 어디까지가 이름인지
 * 줄 끝에서 갈라지지 않는다. 태그는 그 경계를 모양으로 긋는다.
 *
 * 소속이 비면 종류 라벨이 대신 선다 — 원장에 소속을 아직 적지 않은 사람이라도 그 이름이
 * 밖에서 온 값이라는 사실은 남아야 한다.
 */
export function linkItem(l: MinuteLink, opts: { showKind: boolean }): RefLinkItem {
  const kind = MINUTE_LINK_TARGETS[l.targetType].kindLabel
  return {
    key: `${l.targetType}:${l.targetId}`,
    label: l.label ?? '접근 권한 없음',
    kind: opts.showKind ? kind : (l.code ?? kind),
    // 사업코드는 태그로 세우지 않는다 — 출처가 아니라 그 레코드를 부르는 또 하나의 이름이라
    // 이름 옆에 붙어야 읽히고, 앞으로 보내면 원장 이름과 두 태그가 나란히 서 값이 밀린다.
    note: opts.showKind ? l.code : null,
    to: l.label ? undefined : null,
    title: l.label ? undefined : '접근 권한이 없어 열 수 없는 대상입니다',
  }
}
