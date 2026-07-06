/**
 * 마스터 목록/상세 공용 타입. NETWORKS(원장·수정)와 HUB(조회 센터·읽기 전용)가
 * 동일한 리스트뷰를 공유하기 위한 단일 원천이다.
 */

/** 개인정보 목록 마스킹 유형. 근거: docs_dev/4_security_privacy_policy.md */
export type MaskKind = 'email' | 'phone'

/**
 * 목록 셀 렌더 유형.
 * - `text`(기본): 일반 텍스트(없으면 '-')
 * - `tag`: 단일 값을 배지로 렌더(구분태그 등)
 * - `tags`: 문자열 배열을 여러 배지로 렌더(전문 분야 등)
 * - `match`: 매칭 가능/불가능 읽기용 태그(설정은 상세 페이지 드롭다운에서)
 * - `count`: 건수 표기('{n}건', 값 없음 → 임시 999건)
 * - `rating`: 별점 표기(별 아이콘 + 점수, 값 없음 → 임시 5.0)
 * - `placeholder`: 데이터 미연동 컬럼('-' 고정).
 */
export type MasterColumnKind =
  | 'text'
  | 'tag'
  | 'tags'
  | 'match'
  | 'count'
  | 'rating'
  | 'placeholder'

export interface MasterColumn {
  name: string
  label: string
  mask?: MaskKind
  kind?: MasterColumnKind
  /** 셀 정렬(기본 좌측). 매칭/만족도 등 수치·상태 컬럼은 center 권장. */
  align?: 'left' | 'right' | 'center'
  /** 헤더·셀 폭/여백 조정 클래스(예: 'min-w-[13rem]', 'px-2'). */
  className?: string
}

export type MasterRow = Record<string, unknown> & {
  id: string
  name: string
  is_provisional?: boolean
}
