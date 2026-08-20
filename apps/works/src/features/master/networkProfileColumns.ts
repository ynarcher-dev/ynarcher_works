import type { MasterColumn } from '@/features/master/types'

/**
 * 전문가 · VAN · 투자자 공용 프로필 테이블 컬럼.
 *
 * DataTable 내장 컬럼(좌측 `No.`, 우측 `생성자`/`수정일`/`관리`)은 자동 렌더되므로
 * 여기서는 그 사이의 도메인 컬럼만 정의한다. NETWORKS(원장·관리 노출)와
 * HUB(조회 센터·관리 숨김)가 동일한 컬럼 구성을 공유한다.
 *
 * 데이터 연동 현황(2026-07-06 기준):
 * - `name`/`affiliation`: 기존 마스터 스칼라 필드 사용(전문가 외 엔티티는 비면 '-').
 * - `profile.position`(직책/직급): 상세 폼이 `profile`(jsonb)에 저장하므로 점 경로로 읽는다.
 *   사내 임직원이 아닌 외부 네트워크 인물이라 태그가 아닌 자유 텍스트로 관리한다.
 * - `expertise`(영역): ADMIN 영역 관리(`field_tags`) 태그를 상세 폼에서 다중 선택해 저장한다.
 * - `profile.category`(구분): ADMIN 구분 관리(`category_tags`) 태그를 상세 폼에서 단일 선택해
 *   `profile`(jsonb)에 저장한다.
 * - `profile.match_available`: 목록은 가능/불가능 읽기용 태그(값 없음 → '가능' 기본).
 *   값 설정은 상세 페이지 드롭다운에서 수행하며 `profile`(jsonb)에 저장한다.
 * - `activity_count`(활동): 그 인물이 참여한 사업 수. 목록 RPC(`network_directory_entities`)가
 *   AC 참여 원장(program_participants)에서 집계해 실어 준다.
 * - `satisfaction_avg`(만족도): 멘토로 참여한 세션의 스타트업 평가 평균(5점). 같은 RPC가 집계한다.
 *   평가가 한 건도 없으면 값이 비어 '-'로 남는다(0.0으로 채우면 '최하 평가'와 구분되지 않는다).
 */
// 폭·정렬은 열마다의 종류(type)가 정한다 — 수동 w-* 폭을 적지 않는다(2026-08 디자인 리프레시).
export const NETWORK_PROFILE_COLUMNS: MasterColumn[] = [
  { name: 'name', label: '이름', mask: 'name', type: 'name' },
  // 소속은 기관·기업명이라 식별 값 다음으로 길다 — 가변 열 중 두 번째 몫(long).
  { name: 'affiliation', label: '소속', type: 'long' },
  { name: 'profile.position', label: '직책/직급', type: 'text' },
  { name: 'email', label: '이메일', mask: 'email', type: 'text' },
  { name: 'phone', label: '연락처', mask: 'phone', type: 'text' },
  // 구분은 값이 하나뿐인 분류라 배지로 감싸지 않고 텍스트로 둔다(상태가 아니므로 색을 쓰지 않는다).
  { name: 'profile.category', label: '구분', type: 'text' },
  // 영역: 전문 영역(expertise, ADMIN 영역 관리 태그 다중선택). 태그가 여러 개라 badge가 아니라 long.
  { name: 'expertise', label: '영역', kind: 'tags', type: 'long' },
  { name: 'activity_count', label: '활동', kind: 'count', type: 'count' },
  { name: 'satisfaction_avg', label: '만족도', kind: 'rating', type: 'count' },
  { name: 'profile.match_available', label: '매칭', kind: 'match', type: 'badge' },
]

/**
 * 조직 유형(기업·기관·대학·기타) 목록 컬럼.
 * 이들은 개인 중심 지표인 영역·활동·만족도·매칭이 필요 없으므로, 전체 컬럼에서
 * 해당 4종을 제외해 파생한다(폼·상세의 `isCompactEntity` 숨김 처리와 대칭).
 * 전체 컬럼이 바뀌어도 자동으로 동기화되도록 이름 기반 필터로 구성한다.
 */
const ORG_OMIT_COLUMNS = new Set([
  'expertise',
  'activity_count',
  'satisfaction_avg',
  'profile.match_available',
])

// 조직 유형은 담당자의 부서 식별이 중요하므로 소속 바로 뒤에 부서를 노출한다.
const ORG_DEPARTMENT_COLUMN: MasterColumn = {
  name: 'profile.department',
  label: '부서',
  type: 'text',
}

export const NETWORK_ORG_COLUMNS: MasterColumn[] = NETWORK_PROFILE_COLUMNS.filter(
  (c) => !ORG_OMIT_COLUMNS.has(c.name),
).flatMap((c) => (c.name === 'affiliation' ? [c, ORG_DEPARTMENT_COLUMN] : [c]))

/**
 * 미분류(others) 목록 컬럼. 분류가 없거나 미분류 상태로 유입된 인물이 모이는 임시 저장소로,
 * 목록에서 바로 '구분'을 선택해 대상 네트워크로 이관할 수 있도록 구분을 드롭다운(kind: 'category')으로
 * 노출한다. 영역/활동/만족도/매칭 등 개인 지표는 배정 전이라 표시하지 않는다.
 * (생성자·수정일·관리 컬럼은 DataTable이 자동 렌더한다.)
 */
export const NETWORK_OTHERS_COLUMNS: MasterColumn[] = [
  { name: 'name', label: '이름', mask: 'name', type: 'name' },
  { name: 'affiliation', label: '소속', type: 'long' },
  { name: 'profile.department', label: '부서명', type: 'text' },
  { name: 'profile.position', label: '직책/직급', type: 'text' },
  { name: 'email', label: '이메일', mask: 'email', type: 'text' },
  { name: 'phone', label: '연락처', mask: 'phone', type: 'text' },
  // 구분은 인라인 드롭다운(Select)이 들어가는 열이라 태그 열보다 넓게 — long.
  { name: 'profile.category', label: '구분', kind: 'category', type: 'long' },
]
