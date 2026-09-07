import type { ProgramDepartmentDraft, ProgramManagerDraft } from '@/features/program/hooks'

/**
 * 수행 조직 편집용 타입 두 벌.
 *
 * 저장 payload(`*Draft`)에 React 리스트 키(`_key`)만 더한 것이며 `_key`는 RPC에서 무시된다.
 * 편집기 파일이 아니라 여기 사는 이유는 **둘을 함께 쓰는 곳이 여럿**이기 때문이다 — 폼 모달이
 * 상태로 들고, 단계 편집기가 슬라이스로 갈라 주고, 부서 카드가 한 부서 몫을 받는다. 타입이
 * 어느 한 컴포넌트 파일에 살면 그 컴포넌트를 갈아엎을 때마다 타입 import 경로가 함께 흔들린다.
 */
export interface ProgramDepartmentSegment extends ProgramDepartmentDraft {
  _key: string
}

export interface ProgramManagerSegment extends ProgramManagerDraft {
  _key: string
}
