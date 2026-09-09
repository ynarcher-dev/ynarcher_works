import type { FundPurpose, FundPurposeKind } from '@/features/fund/hooks'

/** 목적 구분별 짧은 이름 접두어(의무투자=의무, 주목적=주목적, 특수목적=특수). 번호는 구분 안에서 1부터. */
const PURPOSE_KIND_PREFIX: Record<FundPurposeKind, string> = {
  MANDATORY: '의무',
  MAIN: '주목적',
  SPECIAL: '특수',
}

/** 배치 순서: 의무투자 → 주목적 → 특수목적(각 구분 안에서는 sort_order). */
const PURPOSE_KIND_ORDER: Record<FundPurposeKind, number> = { MANDATORY: 0, MAIN: 1, SPECIAL: 2 }

export interface LabeledPurpose {
  purpose: FundPurpose
  /** 표 머리글·상세 라벨에 서는 짧은 이름(`의무1`·`주목적2`). */
  short: string
}

/**
 * 규약 목적을 표시 순서로 세우고 짧은 이름을 붙인다.
 *
 * **번호를 매기는 자리는 여기 하나다.** 이 이름은 펀드 규약의 것이 아니라 화면이 붙인 것이라
 * (원장에는 구분과 sort_order만 있다) 매기는 규칙이 두 곳에 살면 포트폴리오 표의 `주목적2`와
 * 집행 상세의 `주목적2`가 서로 다른 목적을 가리킬 수 있다 — 그때 어느 쪽이 맞는지 답할 근거가
 * 없다.
 */
export function labeledPurposes(purposes: FundPurpose[]): LabeledPurpose[] {
  const ordered = [...purposes].sort(
    (a, b) => PURPOSE_KIND_ORDER[a.kind] - PURPOSE_KIND_ORDER[b.kind] || a.sort_order - b.sort_order,
  )
  const seq: Record<FundPurposeKind, number> = { MANDATORY: 0, MAIN: 0, SPECIAL: 0 }
  return ordered.map((purpose) => ({
    purpose,
    short: `${PURPOSE_KIND_PREFIX[purpose.kind]}${(seq[purpose.kind] += 1)}`,
  }))
}
