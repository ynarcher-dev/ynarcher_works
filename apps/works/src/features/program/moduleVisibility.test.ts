import { describe, expect, it } from 'vitest'
import { moduleVisibilityBadge, moduleVisibilityOptions } from '@/features/program/config'

/**
 * 공유 범위 세 값의 **배타**를 못박는다(3_4_15 §15 배타 테스트의 화면 쪽 절반).
 *
 * DB의 `app.module_template_visibilities()`가 같은 표를 갖고 트리거가 최종 강제하므로, 두
 * 벌이 어긋나는 날이 온다 — 그때 어긋났다는 사실을 담당자 화면이 아니라 여기서 알아야 한다.
 */
describe('템플릿 성격이 정하는 공유 범위 선택지', () => {
  it('바깥용 종류에서는 PUBLIC_LINK 하나만 서고, 나머지 두 값은 목록에서 사라진다', () => {
    const options = moduleVisibilityOptions('PUBLIC_LINK')
    expect(options.map((o) => o.value)).toEqual(['PUBLIC_LINK'])
  })

  it('GUEST 성격에서는 두 값을 고르되 PUBLIC_LINK는 서지 않는다', () => {
    // 넓은 것이 위에 선다 — 값이 답하는 것은 '얼마나 넓은가'이기 때문이다.
    expect(moduleVisibilityOptions('GUEST_ONLY').map((o) => o.value)).toEqual([
      'GUEST_ONLY',
      'INTERNAL_ONLY',
    ])
  })

  it('내부 전용 성격과 카탈로그에 없는 키에서는 INTERNAL_ONLY 하나만 남는다', () => {
    expect(moduleVisibilityOptions('INTERNAL_ONLY').map((o) => o.value)).toEqual(['INTERNAL_ONLY'])
    // 템플릿을 아직 못 읽었거나 걷힌 종류라면 가장 좁은 값으로 떨어진다(Default Deny).
    expect(moduleVisibilityOptions(undefined).map((o) => o.value)).toEqual(['INTERNAL_ONLY'])
  })
})

describe('공유 범위 배지', () => {
  it('PUBLIC_LINK라도 지금 열려 있지 않으면 강조하지 않는다', () => {
    // 배지만 보고 '열려 있다'로 읽히면 담당자가 열린 문의 개수를 잘못 센다.
    expect(moduleVisibilityBadge('PUBLIC_LINK', false)).toEqual({
      label: 'PUBLIC_LINK',
      tone: 'neutral',
    })
    expect(moduleVisibilityBadge('PUBLIC_LINK', true)).toEqual({
      label: 'PUBLIC_LINK',
      tone: 'warning',
    })
  })

  it('나머지 두 값은 링크 상태와 무관하다(링크가 붙지 않는 성격이다)', () => {
    expect(moduleVisibilityBadge('GUEST_ONLY', true)).toEqual({ label: 'WORKS+GUEST', tone: 'info' })
    expect(moduleVisibilityBadge('INTERNAL_ONLY', false)).toEqual({
      label: 'WORKS ONLY',
      tone: 'neutral',
    })
  })
})
