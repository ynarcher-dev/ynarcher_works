import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MASK,
  SENSITIVE_CONTENTS,
  SENSITIVE_CONTENT_GROUPS,
  policyKey,
} from '@/features/admin/sensitiveContents'
import { isMasked, useSensitiveStore } from '@/features/admin/sensitiveStore'

describe('민감정보 콘텐츠 카탈로그', () => {
  it('콘텐츠 키는 중복되지 않는다', () => {
    const keys = SENSITIVE_CONTENTS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('콘텐츠 키는 `워크스페이스.화면` 형식이며 그룹 키로 시작한다', () => {
    for (const group of SENSITIVE_CONTENT_GROUPS) {
      for (const content of group.contents) {
        expect(content.key.split('.')).toHaveLength(2)
        expect(content.key.startsWith(`${group.key}.`)).toBe(true)
      }
    }
  })

  it('제어할 필드가 하나도 없는 콘텐츠는 두지 않는다', () => {
    for (const content of SENSITIVE_CONTENTS) {
      expect(content.fields.length).toBeGreaterThan(0)
    }
  })
})

describe('민감정보 정책 스토어', () => {
  beforeEach(() => {
    useSensitiveStore.getState().resetAll()
  })

  it('미설정 필드는 기본값을 따른다(이름 공개 / 이메일·연락처 마스킹)', () => {
    const { overrides } = useSensitiveStore.getState()
    expect(isMasked(overrides, 'networks.experts', 'name')).toBe(DEFAULT_MASK.name)
    expect(isMasked(overrides, 'networks.experts', 'email')).toBe(true)
    expect(isMasked(overrides, 'networks.experts', 'phone')).toBe(true)
  })

  it('콘텐츠별로 정책이 독립적으로 적용된다', () => {
    useSensitiveStore.getState().setMask('networks.experts', 'email', false)
    const { overrides } = useSensitiveStore.getState()
    expect(isMasked(overrides, 'networks.experts', 'email')).toBe(false)
    // 같은 필드라도 다른 콘텐츠는 영향을 받지 않는다.
    expect(isMasked(overrides, 'networks.investors', 'email')).toBe(true)
  })

  it('한 줄 전체 토글은 해당 콘텐츠가 가진 필드만 바꾼다', () => {
    useSensitiveStore.getState().setContentMask('fund.portfolio', true)
    const { overrides } = useSensitiveStore.getState()
    expect(overrides[policyKey('fund.portfolio', 'name')]).toBe(true)
    // 포트폴리오 표는 피투자사 대표자명만 노출하므로 이메일·연락처 정책은 만들지 않는다.
    expect(overrides[policyKey('fund.portfolio', 'email')]).toBeUndefined()
  })
})

describe('마스킹 대상 범위', () => {
  it('내부 임직원 원장(MANAGEMENT/OFFICE 임직원 정보)은 정책 대상이 아니다', () => {
    // 담당자·등록자·운용인력 등 내부 임직원 이름은 어느 화면에서도 가리지 않는다(사용자 확정).
    const keys = SENSITIVE_CONTENTS.map((c) => c.key)
    expect(keys.some((k) => k.startsWith('management.'))).toBe(false)
    expect(keys.some((k) => k.startsWith('office.'))).toBe(false)
  })
})
