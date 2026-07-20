import type { BadgeTone } from '@ynarcher/ui'
import { createContext, useContext } from 'react'
import type { ProgramCategoryOption } from '@/config/programCategories'

export type { ProgramCategoryOption }

/**
 * 사업(Program) 공용 모듈을 사용하는 워크스페이스 키.
 * AC/M&A/PROJECT는 원장 테이블이 물리적으로 분리되어 있으나 화면·운영 규칙은 동일하므로,
 * 차이를 본 config 하나로 흡수하고 features/program 전체를 공유한다.
 */
export type ProgramWorkspaceKey = 'ac' | 'mna' | 'project'

/**
 * 워크스페이스별 원장 테이블·RPC·분류 정의.
 * 테이블명은 PostgREST 쿼리와 임베드 문자열 조립에 그대로 쓰이므로 실제 물리 테이블명과 일치해야 한다.
 */
export interface ProgramWorkspaceConfig {
  key: ProgramWorkspaceKey
  /** 라우트 베이스 경로. 목록 `${basePath}`, 상세 `${basePath}/programs/:id`. */
  basePath: string
  /** 사이드바 탭 제목(대시보드/내 ~/전체 ~)에 쓰는 도메인 명칭. */
  entityNoun: string
  tables: {
    programs: string
    modules: string
    moduleAssignees: string
    managers: string
    departments: string
    participants: string
    timeline: string
    customActivities: string
  }
  rpcs: {
    setStaffing: string
    setModule: string
  }
  /** 사업구분 선택지. 빈 배열이면 분류 UI를 감춘다. */
  categories: readonly ProgramCategoryOption[]
  /**
   * 모듈 추가 모달에 노출할 템플릿(module_type) 목록.
   * AC는 전체 9종, M&A/PROJECT는 커스텀 활동만 운용한다.
   */
  allowedModuleTypes: readonly string[]
}

const ProgramWorkspaceContext = createContext<ProgramWorkspaceConfig | null>(null)

export const ProgramWorkspaceProvider = ProgramWorkspaceContext.Provider

/**
 * 현재 화면이 속한 사업 워크스페이스 설정을 반환한다.
 * Provider 밖에서 호출하면 잘못된 원장에 질의할 위험이 있으므로 즉시 예외를 던진다.
 */
export function useProgramWorkspace(): ProgramWorkspaceConfig {
  const ctx = useContext(ProgramWorkspaceContext)
  if (!ctx) {
    throw new Error('useProgramWorkspace는 ProgramWorkspaceProvider 내부에서만 사용할 수 있습니다.')
  }
  return ctx
}

/** 사업구분 값 → 라벨. 미지정/미등록 값은 null. */
export function categoryLabel(config: ProgramWorkspaceConfig, value: string | null): string | null {
  if (!value) return null
  return config.categories.find((c) => c.value === value)?.label ?? null
}

/** 사업구분 값 → 배지 톤. 미등록 값은 중립. */
export function categoryTone(config: ProgramWorkspaceConfig, value: string | null): BadgeTone {
  if (!value) return 'neutral'
  return config.categories.find((c) => c.value === value)?.tone ?? 'neutral'
}
