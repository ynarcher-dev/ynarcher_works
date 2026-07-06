import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 민감정보 대상 필드. */
export type SensitiveField = 'email' | 'phone'

export interface SensitiveFieldDef {
  key: SensitiveField
  label: string
}

/** 정책 관리 대상(개인정보 목록 마스킹 의무 대상). */
export const SENSITIVE_FIELDS: SensitiveFieldDef[] = [
  { key: 'email', label: '이메일' },
  { key: 'phone', label: '연락처' },
]

interface SensitiveStore {
  /**
   * 필드별 통합 노출 정책(목록+상세 공통).
   * - true(공개): 목록·상세 모두 원본을 표시한다.
   * - false(마스킹): 목록·상세 모두 마스킹하고, 상세 "보기"에서 사유 입력 후 열람한다(접근 로그).
   */
  show: Record<SensitiveField, boolean>
  setShow: (field: SensitiveField, show: boolean) => void
}

/**
 * 민감정보 노출 정책 스토어. ADMIN(민감정보 관리)이 편집하고 마스터 목록/상세가 소비한다.
 * 데모 로컬 상태(localStorage 영속)이며, 서버 연동 시 정책 테이블 + Edge Function/RPC + 접근 로그로 대체한다.
 */
export const useSensitiveStore = create<SensitiveStore>()(
  persist(
    (set) => ({
      show: { email: false, phone: false },
      setShow: (field, show) =>
        set((s) => ({ show: { ...s.show, [field]: show } })),
    }),
    {
      name: 'ynarcher.sensitive-policy',
      // 정책값만 저장하고 액션은 제외한다.
      partialize: (s) => ({ show: s.show }),
    },
  ),
)

/** 필드가 마스킹 정책(목록·상세 가림, 상세 열람)인지 여부. */
export function useMaskField(field: SensitiveField): boolean {
  return useSensitiveStore((s) => !s.show[field])
}
