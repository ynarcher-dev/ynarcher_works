/**
 * 스타트업 상세 '자료 관리' 3분류. 각 분류는 별도 target_type으로 저장돼 서로 섞이지 않는다.
 * '기타 자료'는 기존 업로드와 호환되도록 target_type을 'startup' 그대로 유지한다.
 * 상세(읽기)·수정 폼이 이 목록을 공유해 패널을 렌더한다.
 */
export const STARTUP_MATERIAL_SECTIONS = [
  { type: 'startup_ir', title: 'IR 및 소개서' },
  { type: 'startup_financial', title: '재무제표' },
  { type: 'startup', title: '기타 자료' },
] as const
