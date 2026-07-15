import { useContext, useState, type ReactNode } from 'react'
import { cn } from '../utils/cn'
import { Checkbox } from './Checkbox'
import { Pagination } from './Pagination'
import { ToastContext } from './toast/ToastContext'

export interface Column<T> {
  key: string
  header: ReactNode
  render?: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  numeric?: boolean
  sortable?: boolean
  /** 헤더·셀에 함께 적용할 추가 클래스(폭·여백 조정 등). 기본 px-3 등과 twMerge로 충돌 해소된다. */
  className?: string
}

/**
 * 표준 메타 컬럼(작성자/수정일/비활성화) 접근자.
 * 미지정 시 관례 필드(created_by, updated_at, deleted_at)에서 자동 추론한다.
 */
export interface DataTableMeta<T> {
  /** 작성자 표시값. 기본값: row.created_by */
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
  /** 최좌측 선택 체크박스 컬럼(헤더 전체선택 + 행별 선택). 기본 false. */
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
   * 레이아웃 모드(기본 'auto'). 'fixed'는 `table-fixed`로 컬럼 폭 비율을 고정하고
   * 셀 내용이 넘치면 말줄임(…) 처리한다. 컬럼 폭은 각 컬럼 `className`(w-*)이 정한다.
   */
  layout?: 'auto' | 'fixed'
  /** 우측 표준 컬럼(작성자/수정일, 기본 true). 로그/매트릭스/랭킹은 false로 opt-out. */
  standardColumns?: boolean
  /** 표준 컬럼 중 작성자 컬럼 노출 여부(기본 true). false면 수정일/관리만 남긴다. */
  showAuthor?: boolean
  /**
   * 등록자 컬럼 헤더 라벨(기본 '등록자'). 이 표준 컬럼은 항상 등록자(최초 업로더, created_by)를 뜻한다.
   * 담당자(관리 주체)는 별개 축이므로 이 컬럼을 '담당자'로 재라벨하지 말고 도메인 컬럼으로 따로 둔다.
   */
  authorLabel?: string
  /** 수정일 값(셀) 정렬(기본 left). 헤더는 항상 좌측. 넓은 표에서 우측 여백을 줄이려면 'right'. */
  updatedAtAlign?: 'left' | 'right'
  /**
   * 관리(비활성화) 셀 내용 노출 여부(기본 true). `standardColumns`가 true이면 관리 컬럼 자리는
   * 항상 유지되며(컬럼 폭 고정), false면 셀을 비워 버튼 없이 표시한다(HUB 등 읽기 전용).
   */
  manageable?: boolean
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
 * 데이터 테이블(헤더 36px / 행 44px, 수치 tabular-nums, 정렬 토글).
 * 좌측 No.(내림차순) + 우측 표준 컬럼(작성자/수정일/관리)을 기본 탑재한다.
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
  pagination,
  standardColumns = true,
  showAuthor = true,
  authorLabel = '등록자',
  updatedAtAlign = 'left',
  manageable = true,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  onRowClick,
  rowClassName,
  layout = 'auto',
  meta,
}: DataTableProps<T>) {
  // ToastProvider 밖에서도 쓰일 수 있어 컨텍스트를 null-safe로 읽는다(복사 알림용).
  const toast = useContext(ToastContext)
  const fixed = layout === 'fixed'
  const truncate = fixed ? 'truncate' : ''
  // fixed 레이아웃은 여백을 조금 좁혀(px-2) 각 컬럼 내용 표시 폭을 넓힌다.
  const pad = fixed ? 'px-2' : ''
  const colSpan =
    columns.length +
    (selectable ? 1 : 0) +
    (numbered ? 1 : 0) +
    (standardColumns ? (showAuthor ? 3 : 2) : 0)

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
    <div
      className={cn(
        'w-full overflow-x-auto rounded-radius-md border border-gray-300 bg-white shadow-soft',
        className,
      )}
    >
      <table
        className={cn(
          'w-full border-separate border-spacing-0 text-body',
          fixed && 'table-fixed',
        )}
      >
        <thead>
          <tr className="bg-gray-50">
            {selectable && (
              <th className={cn('h-9 w-10 border-b border-gray-300 px-3 text-center', pad)}>
                <Checkbox
                  aria-label="전체 선택"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected
                  }}
                  onChange={toggleAll}
                />
              </th>
            )}
            {numbered && (
              <th className={cn('h-9 w-12 border-b border-gray-300 px-3 text-right text-caption font-semibold text-gray-500', pad)}>
                No.
              </th>
            )}
            {columns.map((col) => {
              const active = sortKey === col.key
              return (
                <th
                  key={col.key}
                  className={cn(
                    'h-9 border-b border-gray-300 px-3 text-caption font-semibold text-gray-500',
                    alignClass[col.align ?? 'left'],
                    col.sortable && 'cursor-pointer select-none hover:bg-gray-100/50',
                    pad,
                    truncate,
                    col.className,
                  )}
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
                  <th className={cn('h-9 w-20 border-b border-gray-300 px-3 text-left text-caption font-semibold text-gray-500', pad, truncate)}>{authorLabel}</th>
                )}
                {/* 수정일 헤더는 항상 좌측 정렬. 값(셀)만 updatedAtAlign을 따른다. */}
                <th className={cn('h-9 w-28 border-b border-gray-300 px-3 text-left text-caption font-semibold text-gray-500', pad, truncate)}>수정일</th>
                <th className={cn('h-9 w-32 border-b border-gray-300 px-3 text-center text-caption font-semibold text-gray-500', pad)}>관리</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                className="h-24 text-center text-body text-gray-400"
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
                    'h-11 transition-colors duration-fast hover:bg-gray-25',
                    !active && 'opacity-50',
                    selected.has(key) && 'bg-brand/5',
                    onRowClick && 'cursor-pointer',
                    rowClassName?.(row),
                  )}
                >
                  {selectable && (
                    <td
                      className={cn('border-b border-gray-200 px-3 text-center', pad)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        aria-label="행 선택"
                        checked={selected.has(key)}
                        onChange={() => toggleRow(key)}
                      />
                    </td>
                  )}
                  {numbered && (
                    <td className={cn('border-b border-gray-200 px-3 text-right text-gray-500 tabular-nums', pad)}>
                      {numberFrom - index}
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'border-b border-gray-200 px-3 font-medium text-gray-800',
                        alignClass[col.align ?? 'left'],
                        col.numeric && 'tabular-nums',
                        pad,
                        truncate,
                        col.className,
                      )}
                    >
                      {col.render ? col.render(row) : (row[col.key as keyof T] as ReactNode)}
                    </td>
                  ))}
                  {standardColumns && (
                    <>
                      {showAuthor && (
                        <td className={cn('whitespace-nowrap border-b border-gray-200 px-3 text-gray-500', pad, truncate)}>
                          {resolveAuthor(row, meta)}
                        </td>
                      )}
                      {/* 수정일(날짜)은 어떤 레이아웃에서도 줄바꿈되지 않게 nowrap 고정. auto 레이아웃에서 컬럼이 좁혀질 때 하이픈에서 줄이 갈라지는 것을 방지한다. */}
                      <td className={cn('whitespace-nowrap border-b border-gray-200 px-3 text-gray-500 tabular-nums', alignClass[updatedAtAlign], pad, truncate)}>
                        {resolveUpdatedAt(row, meta)}
                      </td>
                      <td
                        className={cn('border-b border-gray-200 px-3 text-center', pad)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* 복사는 읽기 전용 액션이라 manageable과 무관하게 노출(HUB 조회 센터 포함). */}
                        {(meta?.copyText || manageable) && (
                          <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                            {meta?.copyText && (
                              <button
                                type="button"
                                title="복사하기"
                                onClick={() => {
                                  void navigator.clipboard
                                    ?.writeText(meta.copyText!(row))
                                    .then(() => toast?.show('복사했습니다.', 'success'))
                                    .catch(() => toast?.show('복사에 실패했습니다.', 'danger'))
                                }}
                                className="inline-flex shrink-0 items-center rounded-radius-md border border-gray-300 px-1.5 py-0.5 text-caption text-gray-600 transition-colors duration-fast hover:bg-gray-50"
                              >
                                복사
                              </button>
                            )}
                            {/* 비활성화(소프트 삭제)는 편집 권한 컨텍스트(manageable)에서만 노출한다. */}
                            {manageable &&
                              (active ? (
                                <button
                                  type="button"
                                  title="비활성화(소프트 삭제)"
                                  disabled={!meta?.onDeactivate}
                                  onClick={() => {
                                    // 사유 모달을 쓰는 경우 내장 confirm 없이 핸들러로 위임한다.
                                    if (meta?.deactivateWithReason) {
                                      meta?.onDeactivate?.(row)
                                    } else if (
                                      typeof window !== 'undefined' &&
                                      window.confirm('이 항목을 비활성화하시겠습니까?')
                                    ) {
                                      meta?.onDeactivate?.(row)
                                    }
                                  }}
                                  className="inline-flex shrink-0 items-center rounded-radius-md border border-gray-300 px-1.5 py-0.5 text-caption text-gray-600 transition-colors duration-fast hover:bg-red-50 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-600"
                                >
                                  비활성화
                                </button>
                              ) : (
                                <span className="text-caption text-gray-400">비활성</span>
                              ))}
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
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
