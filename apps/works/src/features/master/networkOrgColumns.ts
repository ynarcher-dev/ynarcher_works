import type { MasterColumn } from '@/features/master/types'

/**
 * 기업 · 기관 · 대학 · 외주/거래 · 미분류 공용 조직 테이블 컬럼.
 *
 * 전문가 프로필 컬럼(`NETWORK_PROFILE_COLUMNS`)과 동일하게 소속 조직이 아니라 담당자(사람)를
 * 중심으로 구성한다. 전문가와 달리 분야/활동/만족도/매칭이 없고, 대신 `소속`·`부서명`을 노출한다.
 *
 * DataTable 내장 컬럼(좌측 `No.`, 우측 `작성자`/`수정일`/`관리`)은 자동 렌더되므로
 * 여기서는 그 사이의 도메인 컬럼만 정의한다. NETWORKS(원장·관리 노출)와
 * HUB(조회 센터·관리 숨김)가 동일한 컬럼 구성을 공유한다.
 *
 * 데이터 연동 현황(2026-07-06 기준):
 * - `name`(이름): 담당자(사람)의 이름. 스칼라 컬럼이며 중복 검사·검색·병합의 기준이다.
 * - `contact.affiliation`(소속): 담당자가 속한 조직/회사명. `contact`(jsonb)에 점 경로로 저장·조회한다.
 * - `contact.department`(부서명)/`contact.position`(직책/직급): 담당자의 부서·직책. 자유 텍스트로 관리한다.
 * - `contact.email`/`contact.phone`(이메일/연락): 담당자 연락 수단. `contact`(jsonb)에 저장하며
 *   목록에서는 개인정보 마스킹을 적용한다(상세/폼은 원본).
 * - `contact.category`(구분): 담당자/조직 성격 구분 태그(ADMIN 구분 관리). 값 없으면 '-'.
 */
// 컬럼 폭 비율(table-fixed 기준). 여백은 DataTable 기본 px-3로 통일한다.
export const NETWORK_ORG_COLUMNS: MasterColumn[] = [
  { name: 'name', label: '이름', className: 'w-24' },
  { name: 'contact.affiliation', label: '소속', className: 'w-44' },
  { name: 'contact.department', label: '부서명', className: 'w-28' },
  { name: 'contact.position', label: '직책/직급', className: 'w-28' },
  { name: 'contact.email', label: '이메일', mask: 'email', className: 'w-44' },
  { name: 'contact.phone', label: '연락', mask: 'phone', className: 'w-28' },
  { name: 'contact.category', label: '구분', kind: 'tag', className: 'w-24' },
]
