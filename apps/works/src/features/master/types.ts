/**
 * 마스터 목록/상세 공용 타입. NETWORKS(원장·수정)와 HUB(조회 센터·읽기 전용)가
 * 동일한 리스트뷰를 공유하기 위한 단일 원천이다.
 */
import type { ColumnType } from '@ynarcher/ui'

/**
 * 개인정보 목록 마스킹 유형. 실제 적용 여부는 ADMIN '민감정보 관리'의 콘텐츠별 정책이 정한다.
 * 근거: docs_dev/4_security_privacy_policy.md
 */
export type MaskKind = 'name' | 'email' | 'phone'

/**
 * 목록 셀 렌더 유형.
 * - `text`(기본): 일반 텍스트(없으면 '-')
 * - `tag`: 단일 분류 값(권역 등). 텍스트로 렌더한다 — 색은 상태에만 쓴다
 * - `tags`: 문자열 배열(영역·분야 등)을 쉼표로 이어 한 줄 텍스트로 렌더(넘치면 말줄임)
 * - `match`: 매칭 가능/불가능 읽기용 텍스트(설정은 상세 페이지 드롭다운에서). '불가능'만 위험색
 * - `count`: 건수 표기('{n}건', 값 없음 → 임시 999건)
 * - `rating`: 별점 표기(별 아이콘 + 점수, 값 없음 → 임시 5.0)
 * - `category`: 인라인 구분 드롭다운(미분류 임시 저장소 전용). `categorySelect`가 주입되면
 *   목록에서 바로 구분을 선택해 대상 네트워크로 이관한다. 미주입 시 텍스트로 폴백한다.
 * - `link`: URL 값을 아이콘 링크로 렌더(링크드인 등). 값 유무에 따라 아이콘 색이 갈린다.
 * - `placeholder`: 데이터 미연동 컬럼('-' 고정).
 */
export type MasterColumnKind =
  | 'text'
  | 'tag'
  | 'tags'
  | 'match'
  | 'count'
  | 'rating'
  | 'category'
  | 'link'
  | 'placeholder'

export interface MasterColumn {
  name: string
  label: string
  mask?: MaskKind
  kind?: MasterColumnKind
  /**
   * 열의 종류(DataTable ColumnType). 폭·정렬·수치서식·줄바꿈을 한 단어로 정한다.
   * `kind`(셀 렌더 방식)와는 별개 축 — kind가 "무엇을 그릴까"라면 type은 "열을 어떻게 세울까"다.
   */
  type?: ColumnType
  /** 셀 정렬. `type`이 정한 값을 덮는 예외 통로. */
  align?: 'left' | 'right' | 'center'
  /** 헤더·셀 폭/여백 조정 클래스(예: 'min-w-[13rem]', 'px-2'). `type`이 정한 폭을 덮는 예외 통로. */
  className?: string
}

export type MasterRow = Record<string, unknown> & {
  id: string
  name: string
  is_provisional?: boolean
}
