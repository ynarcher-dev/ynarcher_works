import { useContext, useState, type ReactNode } from 'react'
import { cn } from '../utils/cn'
import { DensityProvider, useDensity } from '../density'
import { columnWidth, tableGrid, tableText } from '../densityScale'
import { Checkbox } from './Checkbox'
import { Button } from './Button'
import { Pagination } from './Pagination'
import { ToastContext } from './toast/ToastContext'

/**
 * 열의 종류 — 그 칸에 무엇이 들어가는가.
 *
 * 열 하나를 제대로 세우려면 폭·정렬·수치서식·줄바꿈을 함께 정해야 하는데, 이 넷은 사실 하나의
 * 사실에서 따라 나온다. 날짜 열이면 112px에 가운데 정렬에 줄바꿈 금지이고, 금액 열이면 112px에
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
  | 'person'
  | 'badge'
  | 'date'
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
const columnTypeSpec: Record<
  ColumnType,
  {
    width: string
    align: 'left' | 'right' | 'center'
    numeric: boolean
    /** 고정폭(rem). 지정되면 남는 폭을 받지 않는다. */
    rem?: number
    /** 가변폭 가중치. 남는 폭을 이 비율로 나눠 갖는다. */
    flex?: number
  }
> = {
  /** 식별 값(이름·기업명). 가장 큰 몫을 받는다 — 잘리면 곤란한 값이라 여유가 가장 쓸모 있다. */
  name: { width: '', align: 'left', numeric: false, flex: 3 },
  /** 업종·분류 등 짧은 라벨. */
  text: { width: '', align: 'left', numeric: false, flex: 1.2 },
  /** 사람 이름. */
  person: { width: '', align: 'left', numeric: false, flex: 1 },
  /** 주소·비고 등 긴 텍스트. */
  long: { width: '', align: 'left', numeric: false, flex: 2 },
  /** 상태 배지 한 개. */
  badge: { width: columnWidth.badge, align: 'center', numeric: false, rem: 5 },
  /** 날짜 `YYYY-MM-DD`. */
  date: { width: columnWidth.date, align: 'center', numeric: false, rem: 7 },
  /** 일시 `YYYY-MM-DD HH:MM:SS`. */
  datetime: { width: columnWidth.datetime, align: 'center', numeric: false, rem: 9 },
  /** 금액·수량. */
  money: { width: columnWidth.money, align: 'right', numeric: true, rem: 7 },
  /** 건수·개수. */
  count: { width: columnWidth.count, align: 'right', numeric: true, rem: 5 },
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
   * 표를 빨리 읽게 만드는 것은 선이 아니라 열마다의 기준 모서리다. 길이가 제각각인 텍스트
   * (이름·업종·담당자)는 `left`로 두어 왼쪽 모서리를 세우고, 숫자는 `right`로 두어 자릿수를
   * 맞추며, 날짜·배지처럼 폭이 일정한 것만 가운데에 둔다.
   *
   * 기본값이 왼쪽인 이유는 그 셋 중 가운데만이 **폭이 일정하다는 조건**을 요구하기 때문이다.
   * 조건이 붙은 값은 기본값이 될 수 없다 — 종류를 안 적었다는 것은 그 조건을 확인하지 않았다는
   * 뜻이므로, 확인 없이 안전한 쪽인 왼쪽으로 떨어져야 한다. 가운데가 기본이던 동안에는 종류를
   * 붙이지 못한 몇 개 열만 홀로 가운데로 떠서, 같은 표 안에 기준선이 두 개 생겼다.
   */
  align?: 'left' | 'right' | 'center'
  /**
   * 식별 열 표시. 그 행이 무엇인지 알려주는 열(이름·기업명)에 지정하며 진한 값 톤을 받는다.
   * 미지정 시 첫 번째 도메인 열이 자동으로 식별 열이 된다 — 행마다 하나만 진해야 하므로
   * 두 개 이상 지정하지 않는다.
   */
  primary?: boolean
  /** 수치 서식(`tabular-nums`). `type`이 정한 값을 덮는다. */
  numeric?: boolean
  sortable?: boolean
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
   * 수정일 정렬(기본 center). 날짜는 폭이 일정해 가운데가 안정적이다.
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
  updatedAtAlign = 'center',
  manageable = true,
  showManageColumn = true,
  selectable: selectableProp,
  selectedKeys,
  onSelectionChange,
  onRowClick,
  rowClassName,
  layout = 'auto',
  dense = false,
  meta,
}: DataTableProps<T>) {
  // ToastProvider 밖에서도 쓰일 수 있어 컨텍스트를 null-safe로 읽는다(복사 알림용).
  const toast = useContext(ToastContext)
  /*
   * 표가 놓인 자리. `DataTable`은 내부를 `table` 밀도로 고정하지만, 그 provider는 반환하는
   * JSX 안에 있으므로 여기서 읽는 값은 **부모가 내려준 맥락**이다 — 카드 안이면 'card',
   * 페이지에 바로 놓였으면 'page'.
   */
  const placement = useDensity()
  const selectable = selectableProp ?? placement !== 'card'
  const fixed = layout === 'fixed'
  const truncate = fixed ? 'truncate' : ''
  // 열이 많은 표는 여백을 좁혀(px-2) 각 컬럼의 내용 표시 폭을 넓힌다.
  // 폭을 고정한 표(fixed)는 항상 그렇고, 자동 레이아웃이라도 dense를 켜면 같은 여백을 쓴다.
  const pad = fixed || dense ? tableGrid.cellXTight : ''
  const cellX = tableGrid.cellX
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
    (selectable ? 2.5 : 0) +
    (numbered ? 3 : 0) +
    (standardColumns ? (showAuthor ? 5 : 0) + 7 + (showManageColumn ? 8 : 0) : 0) +
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

  // 선두 열 고정(stickyLead): 선택(w-10=2.5rem)·No.(w-12=3rem)가 앞설 때 각 고정 열의 left 오프셋을 누적한다.
  const selRem = 2.5
  const noRem = 3
  const leftNo = selectable ? selRem : 0
  const leftFirst = (selectable ? selRem : 0) + (numbered ? noRem : 0)
  // 고정 셀 공통 클래스. 헤더는 gray-50, 본문은 white(+hover gray-25)로 불투명 배경을 깐다.
  // last(첫 도메인 열)에는 우측 seam을 은은하게 번지는 그림자로만 둬, 가로 스크롤 시 고정 영역이
  // 스크롤되는 셀 위로 부드럽게 떠 있게 한다(선명한 경계선 없이).
  const stickyCell = (isHeader: boolean, isLast = false) =>
    stickyLead
      ? cn(
          'sticky',
          // 고정 셀은 스크롤되는 셀 위를 덮어야 하므로 반드시 불투명해야 한다. 머리글의 회색
          // 면을 걷어냈으므로 머리글 고정 셀도 흰색을 깐다 — gray-50을 남기면 그 열만 회색으로
          // 뜬다.
          isHeader ? 'z-20 bg-white' : 'z-10 bg-white group-hover:bg-gray-25',
          isLast && 'shadow-[10px_0_14px_-4px_rgba(17,24,39,0.16)]',
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
  const allKeys = rows.map(rowKey)
  const allSelected = rows.length > 0 && allKeys.every((k) => selected.has(k))
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
    <DensityProvider value="table">
    <div
      className={cn(
        'w-full overflow-x-auto rounded-radius-md border border-gray-300 bg-white shadow-soft',
        className,
      )}
    >
      <table
        className={cn(
          'w-full border-separate border-spacing-0',
          fixed && 'table-fixed',
        )}
      >
        <thead>
          {/*
            세로 구분선을 긋지 않는다(2026-08-20).

            이전에는 `divide-x`로 모든 셀 사이에 세로선을 그었다. 세로선은 가로로 읽는 눈의 진행을
            매 열마다 끊어 스캔을 느리게 하고, 열이 많은 표에서는 격자가 데이터보다 먼저 보인다.
            열 구분은 선이 아니라 정렬이 이미 하고 있다 — 숫자는 우측 정렬에 `tabular-nums`로 폭이
            고정되고, 각 열은 머리글 아래로 수직 정렬이 유지된다. 행 구분(가로선 `border-b`)만
            남기면 표가 훨씬 빨리 읽힌다.
          */}
          {/*
            머리글에 회색 면을 깔지 않는다(2026-08-20).

            이전에는 `bg-gray-50` 배경과 진한 밑줄을 함께 썼다. 둘 다 "여기부터 머리글이다"라는
            같은 말이라, 겹치면 머리글이 정작 읽어야 할 데이터보다 무거워진다. 표를 세로로 훑을 때
            제일 먼저 눈에 걸리는 것이 회색 띠가 되는 것은 순서가 뒤바뀐 것이다.

            머리글임은 굵기와 색이 이미 말하고 있고(`tableText.head` — semibold gray-600), 데이터와의
            경계는 밑줄 하나가 긋는다. 면을 걷어내면 글자가 흰 바탕 위로 올라와 대비도 7.19:1에서
            7.77:1로 함께 오른다.
          */}
          <tr>
            {selectable && (
              <th
                className={cn(`h-row w-10 border-b border-gray-300 ${cellX}`, pad, stickyCell(true))}
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
                className={cn(`h-row w-12 border-b border-gray-300 ${cellX} text-center ${tableText.head}`, pad, stickyCell(true))}
                style={stickyLead ? { left: `${leftNo}rem` } : undefined}
              >
                No.
              </th>
            )}
            {columns.map((col, colIndex) => {
              const active = sortKey === col.key
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
                    `h-row border-b border-gray-300 ${cellX} ${tableText.head}`,
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
                    col.sortable && 'cursor-pointer select-none hover:bg-gray-50',
                    pad,
                    truncate,
                    col.className,
                    leadFrozen && stickyCell(true, true),
                  )}
                  style={cellStyle(col, leadFrozen)}
                  onClick={col.sortable ? () => onSort?.(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span className="shrink-0 text-gray-400" aria-hidden>
                        {active ? (
                          sortDir === 'asc' ? (
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
                  <th className={cn(`h-row w-20 border-b border-gray-300 ${cellX} text-center ${tableText.head}`, pad, truncate)}>{authorLabel}</th>
                )}
                {/* 헤더는 값 정렬과 무관하게 항상 가운데. 머리글 줄이 하나의 띠로 읽히게 한다. */}
                {/* 수정일 머리글도 값과 같은 쪽에 선다 — 값만 우측으로 보내면 머리글이 어긋난다. */}
                <th className={cn(`h-row w-28 border-b border-gray-300 ${cellX} ${tableText.head}`, alignClass[updatedAtAlign], pad, truncate)}>수정일</th>
                {showManageColumn && (
                  <th className={cn(`h-row w-32 border-b border-gray-300 ${cellX} text-center ${tableText.head}`, pad)}>관리</th>
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
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                className={cn('h-24 text-center', tableText.meta)}
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => {
              const active = standardColumns ? resolveActive(row, meta) : true
              const key = rowKey(row)
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    tableGrid.row,
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
                      className={cn(`border-b border-gray-200 ${cellX} text-center tabular-nums ${tableText.meta}`, pad, stickyCell(false))}
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
                        col.key === primaryKey ? tableText.primary : tableText.body,
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
                        <td className={cn(`whitespace-nowrap border-b border-gray-200 ${cellX} text-center ${tableText.meta}`, pad, truncate)}>
                          {resolveAuthor(row, meta)}
                        </td>
                      )}
                      {/* 수정일(날짜)은 어떤 레이아웃에서도 줄바꿈되지 않게 nowrap 고정. auto 레이아웃에서 컬럼이 좁혀질 때 하이픈에서 줄이 갈라지는 것을 방지한다. */}
                      <td className={cn(`whitespace-nowrap border-b border-gray-200 ${cellX} tabular-nums ${tableText.meta}`, alignClass[updatedAtAlign], pad, truncate)}>
                        {resolveUpdatedAt(row, meta)}
                      </td>
                      {showManageColumn && (
                        <td
                          className={cn(`border-b border-gray-200 ${cellX} text-center ${tableText.body}`, pad)}
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
                                  : <span className="text-caption text-gray-400">비활성</span>)}
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
    </DensityProvider>
  )

  if (!pagination) return scroller
  const { total, totalAll } = pagination
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
