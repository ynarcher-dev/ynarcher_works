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
 * - `category`(구분): 통합 원장의 스칼라 컬럼. 값은 코드이고 라벨은 features/networks/config가
 *   소유한다(2026-09-04 통합 — 종전에는 원장 테이블과 profile.category에 같은 사실이 두 번 있었다).
 * - `country_label`(국가): 한국도 '한국'으로 명시한다. 국가를 모르는 옛 행만 '국내'/'해외'로
 *   물러선다. 권역까지 열로 세우면 국가와 같은 사실을 두 번 말하므로 권역은 필터 축으로만 둔다.
 * - `profile.match_available`: 목록은 가능/불가능 읽기용 태그(값 없음 → '가능' 기본).
 *   값 설정은 상세 페이지 드롭다운에서 수행하며 `profile`(jsonb)에 저장한다.
 * - `activity_count`(활동): 그 인물이 참여한 사업 수. 목록 RPC(`network_directory_entities`)가
 *   AC 참여 원장(program_participants)에서 집계해 실어 준다.
 * - `satisfaction_avg`(만족도): 멘토로 참여한 세션의 스타트업 평가 평균(5점). 근거 원장이
 *   20260903150000에서 걷혀 현재는 항상 비어 '-'로 남는다 — 멘토링을 다시 설계할 때 되살린다.
 */
// 폭·정렬은 열마다의 종류(type)가 정한다 — 수동 w-* 폭을 적지 않는다(2026-08 디자인 리프레시).
export const NETWORK_PROFILE_COLUMNS: MasterColumn[] = [
  { name: 'name', label: '이름', mask: 'name', type: 'name' },
  // 소속은 기관·기업명이라 식별 값 다음으로 길다 — 가변 열 중 두 번째 몫(long).
  { name: 'affiliation', label: '소속', type: 'long' },
  { name: 'profile.position', label: '직책/직급', type: 'text' },
  // 연락 수단(이메일·연락처·링크드인)은 열로 세우지 않는다 — 목록은 누구인지를 가려내는
  // 자리이고 연락은 그 사람을 정한 다음의 일이라, 셋이 나란히 서면 이름·소속·구분이 밀린다.
  // 개인정보를 늘 펼쳐 두지 않는다는 뜻도 된다(마스킹은 가리는 것이지 안 보여주는 것이 아니다).
  // 값은 상세 페이지가 갖고, 검색은 그대로 이메일·연락처까지 닿는다(마스킹 정책이 연 만큼).
  // 지역·구분은 값이 하나뿐인 분류라 배지로 감싸지 않고 텍스트로 둔다(상태가 아니므로 색을 쓰지 않는다).
  // 국가가 구분보다 앞에 선다 — 통합 원장에서 한 사람을 좁혀 가는 순서가 어디 사람인가 →
  // 어떤 구분인가 → 무엇을 하는가여서, 필터 축의 순서와 열의 순서를 같게 둔다.
  { name: 'country_label', label: '국가', type: 'text' },
  { name: 'category_label', label: '구분', type: 'text' },
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
 * 미분류 목록 컬럼. 분류가 없거나 미분류 상태로 유입된 인물이 모이는 임시 저장소로,
 * 목록에서 바로 '구분'을 선택해 대상 네트워크로 이관할 수 있도록 구분을 드롭다운(kind: 'category')으로
 * 노출한다. 영역/활동/만족도/매칭 등 개인 지표는 배정 전이라 표시하지 않는다.
 * (생성자·수정일·관리 컬럼은 DataTable이 자동 렌더한다.)
 */
export const NETWORK_UNCLASSIFIED_COLUMNS: MasterColumn[] = [
  { name: 'name', label: '이름', mask: 'name', type: 'name' },
  { name: 'affiliation', label: '소속', type: 'long' },
  { name: 'profile.department', label: '부서명', type: 'text' },
  { name: 'profile.position', label: '직책/직급', type: 'text' },
  { name: 'email', label: '이메일', mask: 'email', type: 'text' },
  { name: 'phone', label: '연락처', mask: 'phone', type: 'text' },
  { name: 'country_label', label: '국가', type: 'text' },
  // 구분은 인라인 드롭다운(Select)이 들어가는 열이라 태그 열보다 넓게 — long.
  { name: 'category', label: '구분', kind: 'category', type: 'long' },
]
