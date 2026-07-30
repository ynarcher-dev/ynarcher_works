import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_MASK,
  SENSITIVE_CONTENTS,
  policyKey,
  sensitiveContentOf,
  type SensitiveField,
} from '@/features/admin/sensitiveContents'

export type { SensitiveField }

/** 콘텐츠×필드 마스킹 여부 맵. 기본값과 다른 항목만 담는다(`${contentKey}:${field}` → 마스킹). */
export type MaskOverrides = Record<string, boolean>

interface SensitiveStore {
  /**
   * 콘텐츠(목록 화면)별 필드 마스킹 정책. 값이 없으면 `DEFAULT_MASK`를 따른다.
   * - true(마스킹): 목록·상세를 가리고, 상세의 "보기"(사유 입력)로만 원본을 연다(접근 로그).
   * - false(공개): 목록·상세 모두 원본을 표시한다.
   */
  overrides: MaskOverrides
  setMask: (contentKey: string, field: SensitiveField, masked: boolean) => void
  /** 콘텐츠 한 줄의 모든 필드를 한 번에 켜고 끈다. */
  setContentMask: (contentKey: string, masked: boolean) => void
  /** 전체 정책을 기본값으로 되돌린다. */
  resetAll: () => void
}

/** 구 버전(v1) 저장 형태: 필드 2종을 전역으로 제어했다. */
interface LegacyState {
  show?: Partial<Record<'email' | 'phone', boolean>>
}

/**
 * v1(전역 이메일/연락처 스위치) → v2(콘텐츠별 정책) 마이그레이션.
 * 전역 '공개' 설정은 그 필드를 가진 모든 콘텐츠에 그대로 펼쳐 이관한다.
 */
function migrateFromV1(legacy: LegacyState): MaskOverrides {
  const overrides: MaskOverrides = {}
  for (const field of ['email', 'phone'] as const) {
    const shown = legacy.show?.[field]
    if (shown === undefined) continue
    for (const content of SENSITIVE_CONTENTS) {
      if (content.fields.includes(field)) overrides[policyKey(content.key, field)] = !shown
    }
  }
  return overrides
}

/**
 * 민감정보 노출 정책 스토어. ADMIN '민감정보 관리'가 편집하고 각 목록·상세 화면이 소비한다.
 * 데모 로컬 상태(localStorage 영속)이며, 서버 연동 시 정책 테이블 + Edge Function/RPC + 접근 로그로 대체한다.
 */
export const useSensitiveStore = create<SensitiveStore>()(
  persist(
    (set) => ({
      overrides: {},
      setMask: (contentKey, field, masked) =>
        set((s) => ({ overrides: { ...s.overrides, [policyKey(contentKey, field)]: masked } })),
      setContentMask: (contentKey, masked) =>
        set((s) => {
          const fields = sensitiveContentOf(contentKey)?.fields ?? []
          const next = { ...s.overrides }
          for (const f of fields) next[policyKey(contentKey, f)] = masked
          return { overrides: next }
        }),
      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: 'ynarcher.sensitive-policy',
      version: 2,
      // 정책값만 저장하고 액션은 제외한다.
      partialize: (s) => ({ overrides: s.overrides }),
      migrate: (persisted, version) => {
        if (version >= 2) return persisted as { overrides: MaskOverrides }
        return { overrides: migrateFromV1((persisted ?? {}) as LegacyState) }
      },
    },
  ),
)

/** 정책 맵에서 콘텐츠×필드의 마스킹 여부를 읽는다(미설정 시 필드 기본값). */
export function isMasked(
  overrides: MaskOverrides,
  contentKey: string,
  field: SensitiveField,
): boolean {
  return overrides[policyKey(contentKey, field)] ?? DEFAULT_MASK[field]
}

/** 콘텐츠 하나의 필드별 마스킹 여부. 화면은 이 훅 하나만 보고 원본/마스킹을 가른다. */
export function useMaskPolicy(contentKey: string): Record<SensitiveField, boolean> {
  const overrides = useSensitiveStore((s) => s.overrides)
  return useMemo(
    () => ({
      name: isMasked(overrides, contentKey, 'name'),
      email: isMasked(overrides, contentKey, 'email'),
      phone: isMasked(overrides, contentKey, 'phone'),
    }),
    [overrides, contentKey],
  )
}
