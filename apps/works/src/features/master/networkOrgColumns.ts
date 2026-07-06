import type { MasterColumn } from '@/features/master/types'

/**
 * 기업 · 기관 · 대학 · 외주/거래 공용 조직 테이블 컬럼.
 *
 * 전문가 프로필 컬럼(`NETWORK_PROFILE_COLUMNS`)을 복사·경량화한 조직형 원천이다.
 * 전문가와 달리 분야/활동/만족도/매칭이 없으므로, 그 자리에 자유 텍스트 `메모`를 노출한다.
 *
 * DataTable 내장 컬럼(좌측 `No.`, 우측 `작성자`/`수정일`/`관리`)은 자동 렌더되므로
 * 여기서는 그 사이의 도메인 컬럼만 정의한다. NETWORKS(원장·관리 노출)와
 * HUB(조회 센터·관리 숨김)가 동일한 컬럼 구성을 공유한다.
 *
 * 데이터 연동 현황(2026-07-06 기준):
 * - `name`(명칭): 기업이면 기업명, 기관이면 기관명 등 각 마스터의 대표 명칭.
 * - `representative`(담당자): 조직 마스터 공통 스칼라 필드.
 * - `contact.position`(직책/직급): 담당자의 직책/직급. `contact`(jsonb)에 점 경로로 저장·조회한다.
 *   사내 임직원이 아닌 외부 조직 담당자라 태그가 아닌 자유 텍스트로 관리한다.
 * - `contact.email`/`contact.phone`(이메일/연락처): 담당자 연락 수단. `contact`(jsonb)에 저장하며
 *   목록에서는 개인정보 마스킹을 적용한다(상세/폼은 원본).
 * - `category`(구분): 조직 성격 구분 태그(예: 외주/거래, 지원기관 등). 값 없으면 '-'.
 * - `memo`(메모): 자유 텍스트 비고. 표 폭을 넘치면 말줄임(…) 처리한다.
 */
// 컬럼 폭 비율(table-fixed 기준). 여백은 DataTable 기본 px-3로 통일한다.
export const NETWORK_ORG_COLUMNS: MasterColumn[] = [
  { name: 'name', label: '명칭', className: 'w-40' },
  { name: 'representative', label: '담당자', className: 'w-24' },
  { name: 'contact.position', label: '직책/직급', className: 'w-28' },
  { name: 'contact.email', label: '이메일', mask: 'email', className: 'w-44' },
  { name: 'contact.phone', label: '연락처', mask: 'phone', className: 'w-32' },
  { name: 'category', label: '구분', kind: 'tag', className: 'w-24' },
  { name: 'memo', label: '메모', className: 'w-56' },
]
