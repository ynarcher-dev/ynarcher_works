import { useContext, useMemo, useState, type ReactNode } from 'react'
import { cn } from '../utils/cn'
import { DensityProvider, useDensity } from '../density'
import {
  columnWidthScale,
  tableCellDensity,
  tableGridScale,
  tableTextScale,
  type TableStage,
} from '../densityScale'
import { Checkbox } from './Checkbox'
import { Button } from './Button'
import { Pagination } from './Pagination'
import { MiniPager } from '../patterns/MiniPager'
import { ToastContext } from './toast/ToastContext'

/**
 * 열의 종류 — 그 칸에 무엇이 들어가는가.
 *
 * 열 하나를 제대로 세우려면 폭·정렬·수치서식·줄바꿈을 함께 정해야 하는데, 이 넷은 사실 하나의
 * 사실에서 따라 나온다. 날짜 열이면 112px에 왼쪽 정렬에 줄바꿈 금지이고, 금액 열이면 112px에
 * 우측 정렬에 `tabular-nums`다. 그래서 넷을 따로 적게 두지 않고 종류 한 단어로 선언한다 —
 * 넷을 손으로 조합하게 두면 화면마다 조합이 조금씩 달라지고, 그게 곧 들쑥날쑥한 표가 된다.
 *
 * `name`만 폭이 없다. 식별 열은 길이를 예측할 수 없고 잘리면 곤란해서, 남는 폭을 받는 쪽이다.
 *
 * 개별 열에서 `align`·`numeric`·`className`을 직접 주면 종류가 정한 값을 이긴다 — 예외는 있게
 * 마련이고, 예외를 적는 것이 예외를 위해 종류를 안 쓰는 것보다 낫다.
 */
export type ColumnType =
  | 'name'
  | 'text'
  | 'code'
  | 'person'
  | 'tags'
  | 'badge'
  | 'date'
  | 'period'
  | 'datetime'
  | 'money'
  | 'count'
  | 'long'

/**
 * 종류별 규격.
 *
 * 열은 두 부류로 갈린다.
 *
 * - **고정폭(`rem`)** — 날짜·배지·금액처럼 데이터 자체의 폭이 정해진 열. 넓혀 봐야 빈 칸만
 *   늘어나므로 늘리지 않는다.
 * - **가변폭(`flex`)** — 이름·업종처럼 값 길이를 예측할 수 없는 열. 남는 폭은 이 열들이
 *   가중치대로 **나눠 갖는다.** 한 열이나 빈 칸에 몰아주면 그 자리가 통째로 비어 보인다.
 *
 * `flex` 값은 절대 폭이 아니라 서로에 대한 비율이다. 이름 3 : 업종 1.2는 "남는 폭을 이 비율로
 * 갈라라"라는 뜻이고, 실제 픽셀은 표가 컨테이너 폭에서 고정폭 합을 뺀 뒤 계산한다.
 */
interface ColumnSpec {
  width: string
  align: 'left' | 'right' | 'center'
  numeric: boolean
  /** 고정폭(rem). 지정되면 남는 폭을 받지 않는다. */
  rem?: number
  /** 가변폭 가중치. 남는 폭을 이 비율로 나눠 갖는다. */
  flex?: number
}

/**
 * 종류별 규격을 표가 놓인 자리에 맞춰 짓는다.
 *
 * 폭은 글자에서 따라 나오므로(`columnWidthScale` 참조) 자리마다 두 벌이 필요하다. `rem` 값은
 * `width`가 가리키는 Tailwind 폭과 **반드시 같은 값**이어야 한다 — 이 숫자는 가변폭 열이 나눠
 * 가질 몫을 계산할 때 컨테이너에서 빼는 고정폭 합이라, 어긋나면 표가 컨테이너를 넘거나 모자란다.
 */
const buildColumnSpec = (stage: TableStage): Record<ColumnType, ColumnSpec> => {
  const w = columnWidthScale[stage]
  const page = stage === 'page'
  return {
    /** 식별 값(이름·기업명). 가장 큰 몫을 받는다 — 잘리면 곤란한 값이라 여유가 가장 쓸모 있다. */
    name: { width: '', align: 'left', numeric: false, flex: 3 },
    /**
     * 업종·분류 등 짧은 라벨 중 **길이의 상한을 모르는** 것.
     *
     * 상한을 아는 값(코드·구분·단계)은 `code`로 보낸다. 둘을 가르지 않던 동안 `text`가 사실상의
     * 기본값이 되어, 두 글자짜리 값이 사업명과 같은 비율로 폭을 받았다 — 펀드 목록에서는 다섯 개의
     * `text` 열(코드·재원·성격·구분·펀드유형, 값은 모두 5자 이하)이 남는 폭의 절반을 가져갔다.
     */
    text: { width: '', align: 'left', numeric: false, flex: 1.2 },
    /**
     * 길이의 상한이 정해진 값(코드·구분·단계·재원). 넓혀 봐야 빈 칸만 늘어나므로 고정폭이다.
     * 자동 레이아웃에서는 이 폭이 하한이라, 예외적으로 긴 값이 와도 잘리지 않고 열이 늘어난다.
     */
    code: { width: w.code, align: 'left', numeric: false, rem: page ? 6 : 5 },
    /** 사람 이름. */
    person: { width: '', align: 'left', numeric: false, flex: 1 },
    /**
     * 값이 여러 개인 분류 태그(분야·업종). 개수만큼 폭이 널뛰므로 가변 열이다.
     * 목록에서는 배지가 아니라 한 줄 텍스트로 적는다 — 근거는 `TagCell` 주석 참조.
     */
    tags: { width: '', align: 'left', numeric: false, flex: 1.6 },
    /** 주소·비고 등 긴 텍스트. */
    long: { width: '', align: 'left', numeric: false, flex: 2 },
    /** 상태 배지 한 개. */
    badge: { width: w.badge, align: 'left', numeric: false, rem: page ? 6 : 5 },
    /** 날짜 `YYYY-MM-DD`. */
    date: { width: w.date, align: 'left', numeric: false, rem: page ? 8 : 7 },
    /**
     * 기간(날짜 범위) `2026-08-01 ~ 2026-12-31`. **한 줄**에 서고, 폭은 그 23자를 받는다
     * (`PeriodCell`).
     *
     * 폭을 아끼려고 날짜 한 개 폭에 두 줄로 접던 것을 2026-09-02에 되돌렸다 — 접으면 그 열만
     * 행 높이가 두 배가 되어, 한 표 안에 한 줄짜리 열과 두 줄짜리 열이 섞이고 행의 기준선이
     * 하나로 읽히지 않는다. 폭을 줄이지 **않는** 것이 이 종류의 요점이다: 폭이 모자라
     * `2026-08-01 ~ 2026-`처럼 잘린 값은 짧아진 것이 아니라 종료일이 없는 기간과 구분되지 않는
     * 틀린 값이라, 애초에 잘릴 수 없는 폭을 준다.
     */
    period: { width: w.period, align: 'left', numeric: false, rem: page ? 14 : 13 },
    /** 일시 `YYYY-MM-DD HH:MM:SS`. */
    datetime: { width: w.datetime, align: 'left', numeric: false, rem: page ? 11 : 9 },
    /** 금액·수량. */
    money: { width: w.money, align: 'right', numeric: true, rem: page ? 8 : 7 },
    /** 건수·개수. */
    count: { width: w.count, align: 'right', numeric: true, rem: page ? 6 : 5 },
  }
}

const columnSpecByStage: Record<TableStage, Record<ColumnType, ColumnSpec>> = {
  page: buildColumnSpec('page'),
  card: buildColumnSpec('card'),
}

/**
 * 표준 열(선택·No.·작성자·수정일·관리)의 폭. 종류 열과 달리 화면이 지정하지 않으므로 여기서 짓는다.
 * `rem`은 위와 같은 이유로 `w`의 Tailwind 폭과 일치해야 한다.
 */
interface StandardWidth {
  /** Tailwind 폭 클래스. */
  w: string
  /** 같은 폭의 rem 값. 고정폭 합 계산과 sticky 오프셋이 함께 쓴다. */
  rem: number
}

const standardWidthByStage: Record<
  TableStage,
  Record<'sel' | 'no' | 'author' | 'updated' | 'manage', StandardWidth>
> = {
  page: {
    // 선택 열은 체크박스 하나가 놓이는 자리다. card 맥락 체크박스(16px)에 좌우 여백(px-3)을
    // 더해도 40px 안에 들어가므로 자리와 무관하게 같은 폭을 쓴다.
    sel: { w: 'w-10', rem: 2.5 },
    no: { w: 'w-14', rem: 3.5 },
    author: { w: 'w-24', rem: 6 },
    updated: { w: 'w-32', rem: 8 },
    // 관리 열에는 card 맥락 버튼(32px·px-3·13px)이 둘까지 선다 — '수정'과 '비활성화'.
    manage: { w: 'w-40', rem: 10 },
  },
  card: {
    sel: { w: 'w-10', rem: 2.5 },
    no: { w: 'w-12', rem: 3 },
    author: { w: 'w-20', rem: 5 },
    updated: { w: 'w-28', rem: 7 },
    manage: { w: 'w-32', rem: 8 },
  },
}

export interface Column<T> {
  key: string
  header: ReactNode
  render?: (row: T) => ReactNode
  /**
   * 열의 종류. 폭·정렬·수치서식·줄바꿈을 한 번에 정한다.
   *
   * 이것만 적으면 비율을 계산할 일이 없다 — 종류별 절대폭은 `columnWidth`가 갖고 있고,
   * 남는 폭은 표가 알아서 처리한다. 아래 `align`·`numeric`·`className`은 이 값을 덮는 예외 통로다.
   */
  type?: ColumnType
  /**
   * 열 정렬 — **머리글과 셀에 함께 적용된다.** `type`이 정한 정렬을 덮는 예외 통로이며,
   * 종류도 정렬도 없으면 왼쪽이다(2026-08-20, 이전 기본값은 가운데).
   *
   * 표를 빨리 읽게 만드는 것은 선이 아니라 **한 표에 기준 모서리가 하나뿐이라는 것**이다.
   * 그래서 규칙은 셋으로 끝난다.
   *
   * * **왼쪽(기본)**: 값을 읽는 모든 열 — 이름·업종·담당자는 물론 날짜·배지도 여기 든다.
   * * **오른쪽**: 자릿수를 맞춰 크기를 견주는 숫자(금액·건수·No.)만.
   * * **가운데**: 값이 아니라 조작이 놓이는 열(체크박스·관리)만.
   *
   * 2026-08-20에 날짜·일시·배지를 가운데에서 왼쪽으로 옮겼다. 폭이 일정하다는 것은 가운데를
   * *허용하는* 조건일 뿐 *요구하는* 이유가 아니었고, 그 셋만 가운데로 뜬 표는 왼쪽 기준선
   * 사이에 다른 기준선이 끼어 눈이 두 번 옮겨 갔다. 폭이 일정한 값은 왼쪽에 세워도 이미
   * 세로로 가지런하므로 가운데로 얻는 것이 없다.
   */
  align?: 'left' | 'right' | 'center'
  /**
   * 식별 열 표시. 그 행이 무엇인지 알려주는 열(이름·기업명)에 지정하며 진한 값 톤을 받는다.
   * 미지정 시 첫 번째 도메인 열이 자동으로 식별 열이 된다 — 행마다 하나만 진해야 하므로
   * 두 개 이상 지정하지 않는다.
   */
  primary?: boolean
  /**
   * 값의 톤. 생략하면 식별 열은 `primary`, 나머지 도메인 열은 `body`다.
   *
   * `meta`는 조회수·작성자처럼 레코드 자체가 아니라 레코드를 **다룬 흔적**인 값에 쓴다(표준 열
   * 생성자·수정일이 받는 것과 같은 톤). 이전에는 화면이 셀 안 `<span>`에 `tableText.meta`를
   * 직접 붙여 이 톤을 만들었는데, 그 상수에는 크기가 함께 들어 있어 그 칸만 표가 놓인 자리를
   * 따라오지 못했다 — 톤은 열이 말하고 크기는 표가 정한다.
   */
  tone?: 'primary' | 'body' | 'meta'
  /** 수치 서식(`tabular-nums`). `type`이 정한 값을 덮는다. */
  numeric?: boolean
  sortable?: boolean
  /** 정렬에 사용할 원본 값. render가 가공된 값을 표시할 때 지정한다. */
  sortValue?: (row: T) => unknown
  /** 헤더·셀에 함께 적용할 추가 클래스(폭·여백 조정 등). 기본 셀 여백 등과 twMerge로 충돌 해소된다. */
  className?: string
}

/**
 * 표준 메타 컬럼(생성자/수정일/비활성화) 접근자.
 * 미지정 시 관례 필드(created_by, updated_at, deleted_at)에서 자동 추론한다.
 */
export interface DataTableMeta<T> {
  /** 생성자 표시값. 기본값: row.created_by */
  author?: (row: T) => ReactNode
  /** 수정일 표시값. 기본값: row.updated_at (YYYY-MM-DD로 절삭) */
  updatedAt?: (row: T) => ReactNode
  /** 활성 상태. 기본값: row.deleted_at == null (또는 row.is_active) */
  active?: (row: T) => boolean
  /** 비활성화(소프트 삭제) 실행 핸들러. 미지정 시 버튼은 비활성 상태로 노출된다. */
  onDeactivate?: (row: T) => void
  /**
   * true면 비활성화 버튼이 내장 confirm 없이 곧바로 `onDeactivate`를 호출한다.
   * 사유 입력 모달 등 호출 측이 별도 확인 UI를 소유할 때 사용한다.
   */
  deactivateWithReason?: boolean
  /** 복사 버튼 텍스트 생성기. 지정 시 관리 컬럼에 복사 버튼이 노출된다. */
  copyText?: (row: T) => string
  /** 수정 핸들러. 지정 시 관리 컬럼 맨 앞에 수정 버튼이 노출된다(별도 '관리' 컬럼을 만들지 말 것). */
  onEdit?: (row: T) => void
  /**
   * No. 칸을 대체할 표식. 반환값이 있으면 번호 대신 그 노드를 렌더한다.
   * 상단 고정 행처럼 "순번이 의미 없는 행"을 제목 옆 배지 대신 번호 칸에서 알릴 때 쓴다.
   */
  rowMark?: (row: T) => ReactNode
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  onSort?: (key: string) => void
  emptyText?: string
  className?: string
  /** 좌측 No. 내림차순 넘버링 컬럼(기본 true). 로그/매트릭스 등은 false로 opt-out. */
  numbered?: boolean
  /**
   * 선두(식별) 열 고정. true면 선택·No.·첫 도메인 열(기업명 등)을 왼쪽에 sticky 고정하고
   * 나머지 열만 가로 스크롤한다. 컬럼이 많아 가로 스크롤이 필요한 넓은 표에서 행 식별을 유지한다.
   * 고정 셀은 배경을 불투명하게 깔아(hover 포함) 스크롤되는 셀 위를 덮는다.
   */
  stickyLead?: boolean
  /**
   * 서버 사이드 페이지네이션(0-base page). 지정 시 표 하단에 페이저를 렌더하고, 넘겨받은
   * `rows`(해당 페이지 구간)를 전체 건수 기준으로 넘버링한다(예: 총 87건·2페이지면 57부터).
   * 페이지가 1개뿐이어도 페이저는 노출된다. 미지정 시 페이저 없이 `rows`를 그대로 렌더한다.
   */
  pagination?: {
    /** 현재 페이지(0-base). */
    page: number
    /** 페이지당 행 수. */
    pageSize: number
    /** 현재 필터(검색 등)에 반영된 건수(count: 'exact'). 페이지 수·No. 넘버링의 기준이 된다. */
    total: number
    /** 필터 미적용 전체 건수. 지정 시 좌측에 "필터 반영 수 / 전체 수"로 표기한다. */
    totalAll?: number
    /** 페이지 변경 콜백(0-base). */
    onChange: (page: number) => void
    /**
     * 번호줄 없는 미니 페이저(`< 1/3 >`)로 대체한다. 카드 안에 놓인 보조 목록용이며,
     * 상세의 우측 패널 목록이 쓰는 것과 같은 `MiniPager`다.
     *
     * 자리가 가르는 축은 `selectable`과 같다 — 페이지에 바로 놓인 표는 그 화면의 작업
     * 대상이라 번호를 펴 보이고, 카드 안 표는 번호줄이 카드 폭의 절반을 먹는다.
     * `totalAll`은 미니 페이저에 표기 자리가 없어 무시된다.
     */
    compact?: boolean
  }
  /**
   * 최좌측 선택 체크박스 컬럼(헤더 전체선택 + 행별 선택).
   *
   * **기본값은 표가 놓인 자리가 정한다**(2026-08-20). 페이지에 바로 놓인 표는 그 화면의 작업
   * 대상이므로 켜고, 카드 안에 놓인 표는 상세 화면을 받치는 보조 목록이므로 끈다 — 투자 이력이나
   * 관련 목록에서 여러 건을 골라 일괄 처리할 일은 없고, 체크박스만 첫 칸을 차지한다.
   *
   * 크기를 가르는 축과 같은 축이다. 중요도가 아니라 놓이는 자리가 답한다.
   *
   * 선택 핸들러를 주지 않아도 동작한다 — 내부 상태로 관리하며 고른 행은 `bg-brand/5`로 표시된다.
   * 여러 건을 눈으로 짚어 두는 용도만으로도 쓸모가 있다.
   *
   * 명시하면 자리와 무관하게 그 값이 이긴다. 카드 안이지만 일괄 처리가 필요한 표는 `selectable`을,
   * 페이지에 있지만 선택이라는 개념이 성립하지 않는 표(집계 매트릭스·순위표처럼 행이 레코드가
   * 아닌 것)는 `selectable={false}`를 준다.
   */
  selectable?: boolean
  /** 선택된 행 키(제어 모드). 미지정 시 컴포넌트 내부 상태로 관리한다. */
  selectedKeys?: string[]
  /** 선택 변경 콜백(제어/비제어 공통). */
  onSelectionChange?: (keys: string[]) => void
  /** 행 클릭(상세 진입 등). 지정 시 행에 pointer 커서가 적용된다. */
  onRowClick?: (row: T) => void
  /** 행별 추가 클래스(상태 강조 등). 반환값이 있으면 해당 행 `<tr>`에 병합된다. */
  rowClassName?: (row: T) => string | undefined
  /**
   * 레이아웃 모드(기본 'auto').
   *
   * 열마다 `type`을 적었다면 두 모드 모두 폭이 계산되어 표를 정확히 채운다(빈 구간이 생기지 않는다).
   * 갈리는 것은 계산된 폭보다 내용이 길 때다.
   *
   * - 'auto' — 열이 늘어나 값을 다 보여준다. 대신 그만큼 다른 열이 밀린다.
   * - 'fixed' — 폭을 지키고 넘치는 글자를 말줄임(…)한다. 행 높이와 열 위치가 절대 흔들리지 않아야
   *   하는 표에 쓴다.
   *
   * `type`이 없는 열이 섞여 있으면 그 열은 계산에서 빠진다 — 'auto'에서는 내용 폭을 갖고,
   * 'fixed'에서는 남은 폭을 균등 분할한다.
   */
  layout?: 'auto' | 'fixed'
  /**
   * 열이 많아 가로가 빠듯한 표의 축소 여백(기본 false). 자동 레이아웃('auto')을 유지한 채
   * 셀 좌우 여백만 좁힌다 — 열 폭은 내용에 맞춰 늘고 긴 값은 그대로 줄바꿈되므로,
   * 말줄임으로 값 끝이 잘리면 안 되는 표(예: 펀드 목록의 존속기간)에 쓴다.
   * `layout="fixed"`는 이 여백을 이미 쓰므로 함께 지정할 필요가 없다.
   */
  dense?: boolean
  /** 우측 표준 컬럼(생성자/수정일, 기본 true). 로그/매트릭스/랭킹은 false로 opt-out. */
  standardColumns?: boolean
  /** 표준 컬럼 중 생성자 컬럼 노출 여부(기본 true). false면 수정일/관리만 남긴다. */
  showAuthor?: boolean
  /**
   * 생성자 컬럼 헤더 라벨(기본 '생성자'). 이 표준 컬럼은 항상 생성자(레코드를 만든 사람, created_by)를 뜻한다.
   * 담당자(관리 주체)는 별개 축이므로 이 컬럼을 '담당자'로 재라벨하지 말고 도메인 컬럼으로 따로 둔다.
   * 게시글처럼 '작성자'가 도메인 용어인 표에서만 라벨을 바꾼다.
   */
  authorLabel?: string
  /**
   * 수정일 정렬(기본 left). 값을 읽는 열은 전부 왼쪽 한 기준선에 세운다(2026-08-20).
   * 머리글은 값과 같은 쪽에 서므로 이 값이 둘을 함께 정한다. 넓은 표에서 우측 여백을 줄이려면 'right'.
   */
  updatedAtAlign?: 'left' | 'right' | 'center'
  /**
   * 관리(비활성화) 셀 내용 노출 여부(기본 true). `standardColumns`가 true이면 관리 컬럼 자리는
   * 항상 유지되며(컬럼 폭 고정), false면 셀을 비워 버튼 없이 표시한다(HUB 등 읽기 전용).
   */
  manageable?: boolean
  /**
   * 관리 컬럼(헤더+셀)을 아예 렌더할지 여부(기본 true). false면 생성자/수정일만 남기고 관리 열 자체를
   * 제거한다. 비활성화/복사/수정 등 관리 액션이 목록에 전혀 없는 표(예: 삭제를 상세 페이지로 옮긴
   * STARTUP·PROGRAM 목록)에서 빈 열이 남지 않도록 opt-out 한다. 복사 등 다른 관리 액션이 필요한
   * 표(NETWORKS 원장)는 이 열을 유지한 채 비활성화 핸들러만 빼면 된다.
   */
  showManageColumn?: boolean
  /**
   * 표 전체에 한 번만 적히는 단서 — 금액 열의 단위가 대표적이다(`단위: 백만원`).
   *
   * 자리는 표 **테두리 안**, 머리글 줄 위 오른쪽이다. 단위를 값에 붙이면(`50,000백만원`) 세 글자가
   * 행 수만큼 반복되며 열 폭을 먹고 자릿수 비교도 어긋나고, 머리글에 넣으면(`약정총액(백만원)`)
   * 고정폭 열의 머리글이 접히거나 열을 밀어 넓혀 값에서 뺀 폭을 그대로 돌려준다. 표 밖에 두지
   * 않는 이유는 캡처다 — 표만 잘라 공유해도 단위가 함께 따라와야 한다.
   */
  caption?: ReactNode
  /** 표준 컬럼 값 접근자(미지정 시 관례 필드에서 자동 추론). */
  meta?: DataTableMeta<T>
}

const alignClass = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

function asRecord(row: unknown): Record<string, unknown> {
  return (row ?? {}) as Record<string, unknown>
}

/** 수정일 표시: ISO 문자열을 YYYY-MM-DD로 절삭. */
function formatDate(value: unknown): string {
  if (!value) return '-'
  const s = String(value)
  return s.length >= 10 ? s.slice(0, 10) : s
}

function resolveActive<T>(row: T, meta?: DataTableMeta<T>): boolean {
  if (meta?.active) return meta.active(row)
  const rec = asRecord(row)
  if ('deleted_at' in rec) return rec.deleted_at == null
  if ('is_active' in rec) return Boolean(rec.is_active)
  return true
}

function resolveAuthor<T>(row: T, meta?: DataTableMeta<T>): ReactNode {
  if (meta?.author) return meta.author(row)
  const rec = asRecord(row)
  const v = rec.created_by ?? rec.author ?? rec.created_by_name
  return v ? String(v) : '-'
}

function resolveUpdatedAt<T>(row: T, meta?: DataTableMeta<T>): ReactNode {
  if (meta?.updatedAt) return meta.updatedAt(row)
  const rec = asRecord(row)
  return formatDate(rec.updated_at ?? rec.updatedAt)
}

/**
 * 데이터 테이블(헤더·행 모두 `row` 토큰 36px, 수치 tabular-nums, 정렬 토글).
 * 좌측 No.(내림차순) + 우측 표준 컬럼(생성자/수정일/관리)을 기본 탑재한다.
 *
 * 정렬은 열의 `type`이 정하고, 종류도 정렬도 없으면 헤더·본문 모두 왼쪽이다. 버튼만 놓이는
 * 조작 열처럼 가운데가 필요한 자리만 `align: 'center'`를 적는다(기본값과 같은 값은 적지 않는다).
 * 관리 컬럼 자리는 항상 유지되며, `manageable=false`면 셀을 비운다(HUB 등 읽기 전용).
 * 근거: 5_component_spec_rules.md §3.1 (테이블 규격·표준 메타 컬럼)
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sortKey,
  sortDir,
  onSort,
  emptyText = '표시할 데이터가 없습니다.',
  className,
  numbered = true,
  stickyLead = false,
  pagination,
  standardColumns = true,
  showAuthor = true,
  authorLabel = '생성자',
  updatedAtAlign = 'left',
  manageable = true,
  showManageColumn = true,
  selectable: selectableProp,
  selectedKeys,
  onSelectionChange,
  onRowClick,
  rowClassName,
  layout = 'auto',
  dense = false,
  caption,
  meta,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<{ key: string; dir: 'asc' | 'desc' }>(() => ({
    key: standardColumns ? '__updatedAt' : '',
    dir: 'desc',
  }))
  const effectiveSortKey = sortKey ?? internalSort.key
  const effectiveSortDir = sortDir ?? internalSort.dir
  const requestSort = (key: string) => {
    if (onSort) {
      onSort(key)
      return
    }
    setInternalSort((current) => ({
      key,
      dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc',
    }))
  }

  const displayedRows = useMemo(() => {
    if (!effectiveSortKey) return rows
    const column = columns.find((candidate) => candidate.key === effectiveSortKey)
    const valueOf = (row: T): unknown => {
      if (effectiveSortKey === '__updatedAt') {
        const record = asRecord(row)
        return record.updated_at ?? record.updatedAt ?? ''
      }
      return column?.sortValue?.(row) ?? asRecord(row)[effectiveSortKey]
    }
    const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' })
    const isEmpty = (value: unknown) => value == null || value === ''
    const compare = (left: unknown, right: unknown) => {
      if (typeof left === 'number' && typeof right === 'number') return left - right
      return collator.compare(String(left), String(right))
    }
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const left = valueOf(a.row)
        const right = valueOf(b.row)
        // 값이 없는 행은 정렬 방향과 무관하게 항상 아래에 둔다.
        if (isEmpty(left) || isEmpty(right)) {
          if (isEmpty(left) && isEmpty(right)) return a.index - b.index
          return isEmpty(left) ? 1 : -1
        }
        const result = compare(left, right)
        return result === 0 ? a.index - b.index : effectiveSortDir === 'asc' ? result : -result
      })
      .map(({ row }) => row)
  }, [columns, effectiveSortDir, effectiveSortKey, rows])
  // ToastProvider 밖에서도 쓰일 수 있어 컨텍스트를 null-safe로 읽는다(복사 알림용).
  const toast = useContext(ToastContext)
  /*
   * 표가 놓인 자리. 아래 provider는 반환하는 JSX 안에 있으므로 여기서 읽는 값은 **부모가
   * 내려준 맥락**이다 — 카드 안이면 'card', 페이지에 바로 놓였으면 'page'.
   */
  const placement = useDensity()
  const selectable = selectableProp ?? placement !== 'card'
  /*
   * 자리가 규격을 정한다(2026-08-20). 페이지에 바로 놓인 표는 그 화면에서 읽어야 할 내용
   * 자체이므로 본문(14px)·행 40px에 서고, 카드 안에 든 표는 카드가 말하는 주제의 부속이라
   * 한 단 내려 캡션(12px)·행 36px에 선다. 글자·행 높이·열 폭·셀 안 컨트롤이 한 벌로 움직인다.
   *
   * 셀 안에서 또 표를 여는 일(placement === 'table')은 카드 안 표와 같이 다룬다 — 더 내려갈
   * 단이 없다.
   */
  const stage: TableStage = placement === 'page' ? 'page' : 'card'
  const grid = tableGridScale[stage]
  const text = tableTextScale[stage]
  const columnTypeSpec = columnSpecByStage[stage]
  const stdW = standardWidthByStage[stage]
  const fixed = layout === 'fixed'
  const truncate = fixed ? 'truncate' : ''
  // 열이 많은 표는 여백을 좁혀 각 컬럼의 내용 표시 폭을 넓힌다.
  // 폭을 고정한 표(fixed)는 항상 그렇고, 자동 레이아웃이라도 dense를 켜면 같은 여백을 쓴다.
  const pad = fixed || dense ? grid.cellXTight : ''
  const cellX = grid.cellX
  const rowH = grid.row
  // 명시 지정이 없으면 첫 도메인 열을 식별 열로 삼는다.
  const primaryKey = (columns.find((c) => c.primary) ?? columns[0])?.key
  /**
   * 열 폭 계산(2026-08-20).
   *
   * 표가 컨테이너를 꽉 채워야 하는 한 남는 폭은 반드시 어딘가로 간다. 모든 열에 조금씩 뿌리면
   * 값들이 흩어지고, 한 열이나 빈 칸에 몰아주면 그 자리가 통째로 비어 보인다. 셋 다 겪어 보고
   * 남은 결론은 하나다 — **폭을 계산해서 딱 채우는 수밖에 없다.**
   *
   * 계산은 두 부류로 나눠서 한다. 날짜·배지·금액처럼 데이터의 폭이 정해진 열은 rem으로 고정하고,
   * 이름·업종처럼 길이를 예측할 수 없는 열이 나머지를 가중치대로 나눠 갖는다. 그래서 열이 6개든
   * 3개든, 컨테이너가 넓든 좁든 표는 항상 정확히 채워지고 어디에도 빈 구간이 생기지 않는다.
   *
   * 비율을 손으로 적을 일은 없다 — 화면은 열마다 `type`만 적고, 비율은 그 종류들이 모여
   * 자동으로 정해진다.
   */
  const fixedRem =
    (selectable ? stdW.sel.rem : 0) +
    (numbered ? stdW.no.rem : 0) +
    (standardColumns
      ? (showAuthor ? stdW.author.rem : 0) + stdW.updated.rem + (showManageColumn ? stdW.manage.rem : 0)
      : 0) +
    columns.reduce((sum, c) => sum + (c.type ? (columnTypeSpec[c.type].rem ?? 0) : 0), 0)
  const totalFlex = columns.reduce(
    (sum, c) => sum + (c.type ? (columnTypeSpec[c.type].flex ?? 0) : 0),
    0,
  )
  /** 가변폭 열이 가져갈 몫. 고정폭 합을 뺀 나머지를 가중치 비율로 자른다. */
  const flexWidth = (col: Column<T>): string | undefined => {
    const w = col.type ? columnTypeSpec[col.type].flex : undefined
    if (!w || !totalFlex) return undefined
    return `calc((100% - ${fixedRem}rem) * ${(w / totalFlex).toFixed(4)})`
  }
  /** 셀 인라인 스타일 — 고정 열의 left 오프셋과 가변폭을 함께 얹는다. */
  const cellStyle = (col: Column<T>, leadFrozen: boolean) => {
    const width = flexWidth(col)
    if (!leadFrozen && !width) return undefined
    return {
      ...(leadFrozen ? { left: `${leftFirst}rem` } : {}),
      ...(width ? { width } : {}),
    }
  }

  // 선두 열 고정(stickyLead): 선택·No.가 앞설 때 각 고정 열의 left 오프셋을 누적한다.
  // 두 열의 폭은 자리에 따라 갈리므로 표준 열 표(standardWidthByStage)에서 그대로 가져온다.
  const leftNo = selectable ? stdW.sel.rem : 0
  const leftFirst = (selectable ? stdW.sel.rem : 0) + (numbered ? stdW.no.rem : 0)
  // 고정 셀 공통 클래스. 헤더는 gray-25, 본문은 white(+hover gray-25)로 불투명 배경을 깐다.
  // last(첫 도메인 열)에는 우측 seam을 은은하게 번지는 그림자로만 둬, 가로 스크롤 시 고정 영역이
  // 스크롤되는 셀 위로 부드럽게 떠 있게 한다(선명한 경계선 없이).
  const stickyCell = (isHeader: boolean, isLast = false) =>
    stickyLead
      ? cn(
          'sticky',
          // 고정 셀은 스크롤되는 셀 위를 덮어야 하므로 반드시 불투명해야 한다. 머리글 고정 셀은
          // thead와 같은 gray-25를 깐다 — 흰색을 남기면 가로 스크롤 시 그 열만 머리글 띠에서
          // 빠져 보인다.
          isHeader ? 'z-20 bg-gray-25' : 'z-10 bg-white group-hover:bg-gray-25',
          isLast && 'shadow-pinned',
        )
      : ''
  const colSpan =
    columns.length +
    (selectable ? 1 : 0) +
    (numbered ? 1 : 0) +
    (standardColumns ? (showAuthor ? 1 : 0) + 1 + (showManageColumn ? 1 : 0) : 0)

  // 서버 페이징 시 전체 건수 기준으로 첫 행(index 0)의 No.를 매긴다. 미지정 시 페이지 내 rows 기준.
  const numberFrom = pagination
    ? pagination.total - pagination.page * pagination.pageSize
    : rows.length

  const [internalSelected, setInternalSelected] = useState<string[]>([])
  const selected = new Set(selectedKeys ?? internalSelected)
  const allKeys = displayedRows.map(rowKey)
  const allSelected = displayedRows.length > 0 && allKeys.every((k) => selected.has(k))
  const someSelected = allKeys.some((k) => selected.has(k))

  const commitSelection = (next: Set<string>) => {
    const arr = allKeys.filter((k) => next.has(k))
    if (!selectedKeys) setInternalSelected(arr)
    onSelectionChange?.(arr)
  }
  const toggleRow = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    commitSelection(next)
  }
  const toggleAll = () => {
    commitSelection(allSelected ? new Set() : new Set(allKeys))
  }

  const scroller = (
    // 표 내부는 밀도 맥락을 `table`로 고정한다 — 셀 안의 버튼·선택·배지가 별도 지정 없이
    // 표 규격(24px 계열)으로 렌더된다. 근거: 5_component_spec_rules.md §1.2
    <DensityProvider value={tableCellDensity[stage]}>
    <div
      className={cn(
        // 가로 스크롤은 안쪽 상자가 맡는다 — 단서 줄(caption)은 표와 함께 스크롤되면 안 되고,
        // 바깥 상자가 테두리·모서리를 그리므로 여기서 넘치는 것을 잘라 둔다.
        'w-full overflow-hidden rounded-radius-md border border-gray-300 bg-white shadow-soft',
        className,
      )}
    >
      {caption && (
        <div className={cn('flex justify-end border-b border-gray-200', cellX, 'py-1', text.meta)}>
          {caption}
        </div>
      )}
      <div className="w-full overflow-x-auto">
      <table
        className={cn(
          'w-full border-separate border-spacing-0',
          fixed && 'table-fixed',
        )}
      >
        <thead className="bg-gray-25">
          {/*
            세로 구분선을 긋지 않는다(2026-08-20).

            이전에는 `divide-x`로 모든 셀 사이에 세로선을 그었다. 세로선은 가로로 읽는 눈의 진행을
            매 열마다 끊어 스캔을 느리게 하고, 열이 많은 표에서는 격자가 데이터보다 먼저 보인다.
            열 구분은 선이 아니라 정렬이 이미 하고 있다 — 숫자는 우측 정렬에 `tabular-nums`로 폭이
            고정되고, 각 열은 머리글 아래로 수직 정렬이 유지된다. 행 구분(가로선 `border-b`)만
            남기면 표가 훨씬 빨리 읽힌다.
          */}
          {/*
            머리글에 팔레트에서 가장 옅은 회색 면을 깐다(2026-08-25).

            2026-08-20에는 면을 완전히 걷어내고 굵기·색(`tableText.head` — semibold gray-600)과
            밑줄만으로 머리글을 표시했다. 그러나 카드섹션 안에 든 표는 카드 자체가 이미 흰 면이라
            머리글 줄과 첫 데이터 행이 같은 바탕 위에 연달아 놓였고, 밑줄 하나로는 띠가 서지 않아
            어디까지가 머리글인지 한눈에 잡히지 않았다.

            되돌린 값은 구 `gray-50`이 아니라 램프에서 가장 옅은 `gray-25`(#FAFBFC)다 — 머리글이
            데이터보다 무거워지던 이유는 면을 깐 것 자체가 아니라 그 면이 진했던 것이므로, 띠가
            서는 최소한의 톤차만 남긴다. 글자 대비는 7.77:1에서 7.65:1로만 내려가 KWCAG AA를
            그대로 충족하고, 정렬 가능한 머리글의 hover(`gray-50`)는 이 바탕보다 한 단계 진해
            그대로 구분된다.
          */}
          <tr>
            {selectable && (
              <th
                className={cn(`${rowH} ${stdW.sel.w} border-b border-gray-300 ${cellX}`, pad, stickyCell(true))}
                style={stickyLead ? { left: 0 } : undefined}
              >
                {/* 체크박스는 인라인 요소라 셀에 그냥 두면 글자 베이스라인에 걸려 위로 뜬다. */}
                <div className="flex items-center justify-center">
                  <Checkbox
                    aria-label="전체 선택"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allSelected
                    }}
                    onChange={toggleAll}
                  />
                </div>
              </th>
            )}
            {numbered && (
              <th
                className={cn(`${rowH} ${stdW.no.w} border-b border-gray-300 ${cellX} text-center ${text.head}`, pad, stickyCell(true))}
                style={stickyLead ? { left: `${leftNo}rem` } : undefined}
              >
                No.
              </th>
            )}
            {columns.map((col, colIndex) => {
              const sortable = col.sortable ?? col.type === 'name'
              const active = effectiveSortKey === col.key
              const leadFrozen = stickyLead && colIndex === 0
              // 종류가 폭·정렬을 정하고, 열이 직접 준 값이 그것을 덮는다.
              const spec = col.type ? columnTypeSpec[col.type] : undefined
              return (
                <th
                  key={col.key}
                  className={cn(
                    // 머리글은 자기 열의 값과 같은 쪽에 선다(2026-08-20). 이전에는 모든 머리글이
                    // 가운데 고정이라, 왼쪽으로 선 이름 열이나 오른쪽으로 선 금액 열에서 머리글만
                    // 홀로 떠 있었다. 머리글이 어느 열의 것인지는 위치가 알려주는 것이므로,
                    // 값과 어긋나면 열을 훑을 기준선이 두 개가 된다.
                    `${rowH} border-b border-gray-300 ${cellX} ${text.head}`,
                    alignClass[col.align ?? spec?.align ?? 'left'],
                    spec?.width,
                    // 고정폭 열의 머리글은 접힌다(2026-08-20). `columnWidth`의 `whitespace-nowrap`은
                    // 값을 위한 것이다 — `2026-05-14`가 하이픈에서 갈라지지 않게. 그런데 그 nowrap이
                    // 머리글에도 걸리면 머리글의 길이가 곧 열의 최소 폭이 되어, `재고(잔여)` 한 단어가
                    // 종류가 정한 5rem을 밀어낸다. 규격을 정해 놓고 머리글이 그것을 이기면 규격이 아니다.
                    // 그래서 머리글만 nowrap을 벗겨 두 줄로 접히게 두고 열은 자기 폭을 지킨다.
                    // `break-keep`으로 어절 중간에서는 끊지 않는다 — 한글은 기본값이면 `조합원유` /
                    // `형`처럼 음절 아무 데서나 갈라진다. 따라서 두 어절 이상인 머리글은 공백으로 띄워
                    // 적는다(`조합원 유형`). 접히지 않고 열을 밀어내면 머리글이 길다는 신호이며,
                    // 그때 줄일 것은 열 폭이 아니라 머리글이다.
                    spec?.width && 'whitespace-normal break-keep',
                    // 정렬 가능한 머리글의 hover. 머리글이 흰 바탕이 되었으므로 gray-100은 너무
                    // 진하다 — 마우스를 올렸을 뿐인데 걷어낸 회색 띠가 되돌아온 것처럼 보인다.
                    sortable && 'cursor-pointer select-none hover:bg-gray-50',
                    pad,
                    truncate,
                    col.className,
                    leadFrozen && stickyCell(true, true),
                  )}
                  style={cellStyle(col, leadFrozen)}
                  onClick={sortable ? () => requestSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {sortable && (
                      <span className="shrink-0 text-gray-400" aria-hidden>
                        {active ? (
                          effectiveSortDir === 'asc' ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                          )
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
                        )}
                      </span>
                    )}
                  </span>
                </th>
              )
            })}
            {standardColumns && (
              <>
                {showAuthor && (
                  <th className={cn(`${rowH} ${stdW.author.w} border-b border-gray-300 ${cellX} text-center ${text.head}`, pad, truncate)}>{authorLabel}</th>
                )}
                {/* 헤더는 값 정렬과 무관하게 항상 가운데. 머리글 줄이 하나의 띠로 읽히게 한다. */}
                {/* 수정일 머리글도 값과 같은 쪽에 선다 — 값만 우측으로 보내면 머리글이 어긋난다. */}
                <th
                  className={cn(`${rowH} ${stdW.updated.w} border-b border-gray-300 ${cellX} ${text.head}`, alignClass[updatedAtAlign], 'cursor-pointer select-none hover:bg-gray-50', pad, truncate)}
                  onClick={() => requestSort('__updatedAt')}
                >
                  <span className="inline-flex items-center gap-1">
                    수정일
                    <span className="shrink-0 text-gray-400" aria-hidden>
                      {effectiveSortKey === '__updatedAt' ? (
                        effectiveSortDir === 'asc' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        )
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
                      )}
                    </span>
                  </span>
                </th>
                {showManageColumn && (
                  <th className={cn(`${rowH} ${stdW.manage.w} border-b border-gray-300 ${cellX} text-center ${text.head}`, pad)}>관리</th>
                )}
              </>
            )}
          </tr>
        </thead>
        {/*
          마지막 행의 밑줄은 지운다(2026-08-20).

          모든 셀이 `border-b`를 갖는데 표 바깥 래퍼도 `border`를 두르고 있어, 표 아래쪽에 1px 선이
          두 줄로 겹쳐 그림자처럼 두껍게 보였다. 마지막 행의 경계는 래퍼가 이미 그리고 있으므로
          행 쪽 밑줄만 걷어낸다.
        */}
        <tbody className="[&>tr:last-child>td]:border-b-0">
          {displayedRows.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                className={cn('h-24 text-center', text.meta)}
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            displayedRows.map((row, index) => {
              const active = standardColumns ? resolveActive(row, meta) : true
              const key = rowKey(row)
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    rowH,
                    // group: 고정 셀(sticky)이 자기 배경을 깔아도 행 hover 강조를 함께 받도록 한다.
                    // 세로 구분선 없음 — 근거는 머리글 행의 주석 참조.
                    'group transition-colors duration-fast hover:bg-gray-25',
                    !active && 'opacity-50',
                    selected.has(key) && 'bg-brand/5',
                    onRowClick && 'cursor-pointer',
                    rowClassName?.(row),
                  )}
                >
                  {selectable && (
                    <td
                      className={cn(`border-b border-gray-200 ${cellX}`, pad, stickyCell(false))}
                      style={stickyLead ? { left: 0 } : undefined}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-center">
                        <Checkbox
                          aria-label="행 선택"
                          checked={selected.has(key)}
                          onChange={() => toggleRow(key)}
                        />
                      </div>
                    </td>
                  )}
                  {numbered && (
                    <td
                      className={cn(`border-b border-gray-200 ${cellX} text-center tabular-nums ${text.meta}`, pad, stickyCell(false))}
                      style={stickyLead ? { left: `${leftNo}rem` } : undefined}
                    >
                      {meta?.rowMark?.(row) ?? numberFrom - index}
                    </td>
                  )}
                  {columns.map((col, colIndex) => {
                    const leadFrozen = stickyLead && colIndex === 0
                    const spec = col.type ? columnTypeSpec[col.type] : undefined
                    return (
                    <td
                      key={col.key}
                      className={cn(
                        `border-b border-gray-200 ${cellX}`,
                        col.tone
                          ? text[col.tone]
                          : col.key === primaryKey
                            ? text.primary
                            : text.body,
                        alignClass[col.align ?? spec?.align ?? 'left'],
                        spec?.width,
                        (col.numeric ?? spec?.numeric) && 'tabular-nums',
                        pad,
                        truncate,
                        col.className,
                        leadFrozen && stickyCell(false, true),
                      )}
                      style={cellStyle(col, leadFrozen)}
                    >
                      {col.render ? col.render(row) : (row[col.key as keyof T] as ReactNode)}
                    </td>
                    )
                  })}
                  {standardColumns && (
                    <>
                      {showAuthor && (
                        <td className={cn(`whitespace-nowrap border-b border-gray-200 ${cellX} text-center ${text.meta}`, pad, truncate)}>
                          {resolveAuthor(row, meta)}
                        </td>
                      )}
                      {/* 수정일(날짜)은 어떤 레이아웃에서도 줄바꿈되지 않게 nowrap 고정. auto 레이아웃에서 컬럼이 좁혀질 때 하이픈에서 줄이 갈라지는 것을 방지한다. */}
                      <td className={cn(`whitespace-nowrap border-b border-gray-200 ${cellX} tabular-nums ${text.meta}`, alignClass[updatedAtAlign], pad, truncate)}>
                        {resolveUpdatedAt(row, meta)}
                      </td>
                      {showManageColumn && (
                        <td
                          className={cn(`border-b border-gray-200 ${cellX} text-center ${text.body}`, pad)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* 복사는 읽기 전용 액션이라 manageable과 무관하게 노출(HUB 조회 센터 포함). */}
                          {(meta?.copyText || manageable) && (
                            <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                              {/* 수정은 편집 권한 컨텍스트에서, 활성 행에 대해서만 노출한다. */}
                              {manageable && meta?.onEdit && active && (
                                <Button
                                  variant="outline"
                                  title="수정"
                                  onClick={() => meta.onEdit!(row)}
                                >
                                  수정
                                </Button>
                              )}
                              {meta?.copyText && (
                                <Button
                                  variant="outline"
                                  title="복사하기"
                                  onClick={() => {
                                    void navigator.clipboard
                                      ?.writeText(meta.copyText!(row))
                                      .then(() => toast?.show('복사했습니다.', 'success'))
                                      .catch(() => toast?.show('복사에 실패했습니다.', 'danger'))
                                  }}
                                >
                                  복사
                                </Button>
                              )}
                              {/* 비활성화(소프트 삭제)는 핸들러가 주입된 편집 권한 컨텍스트에서만 노출한다.
                                  핸들러가 없으면(삭제를 상세 페이지로 옮긴 목록) 버튼을 그리지 않는다. */}
                              {manageable &&
                                (active
                                  ? meta?.onDeactivate && (
                                      <Button
                                        variant="outline-danger"
                                        title="비활성화(소프트 삭제)"
                                        onClick={() => {
                                          // 사유 모달을 쓰는 경우 내장 confirm 없이 핸들러로 위임한다.
                                          if (meta.deactivateWithReason) {
                                            meta.onDeactivate?.(row)
                                          } else if (
                                            typeof window !== 'undefined' &&
                                            window.confirm('이 항목을 비활성화하시겠습니까?')
                                          ) {
                                            meta.onDeactivate?.(row)
                                          }
                                        }}
                                      >
                                        비활성화
                                      </Button>
                                    )
                                  : (
                                    // 크기는 셀(자리가 정한 규격)에서 물려받고 색만 흐리게 둔다 —
                                    // 여기서 크기를 적으면 이 한 칸만 자리를 따라오지 못한다.
                                    <span className="text-gray-400">비활성</span>
                                  ))}
                            </div>
                          )}
                        </td>
                      )}
                    </>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
      </div>
    </div>
    </DensityProvider>
  )

  if (!pagination) return scroller
  const { total, totalAll } = pagination
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize))
  if (pagination.compact) {
    return (
      <div className="w-full">
        {scroller}
        <MiniPager page={pagination.page} pageCount={pageCount} onPage={pagination.onChange} />
      </div>
    )
  }
  return (
    <div className="w-full">
      {scroller}
      <Pagination
        page={pagination.page + 1}
        pageCount={Math.max(1, Math.ceil(total / pagination.pageSize))}
        onChange={(p) => pagination.onChange(p - 1)}
        info={
          totalAll != null
            ? `${total.toLocaleString()} / ${totalAll.toLocaleString()}건`
            : `${total.toLocaleString()}건`
        }
      />
    </div>
  )
}
