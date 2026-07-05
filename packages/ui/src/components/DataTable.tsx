import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface Column<T> {
  key: string
  header: ReactNode
  render?: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  numeric?: boolean
  sortable?: boolean
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
  /** 우측 표준 컬럼(작성자/수정일/비활성화, 기본 true). 로그/매트릭스/랭킹은 false로 opt-out. */
  standardColumns?: boolean
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
 * 좌측 No.(내림차순) + 우측 표준 컬럼(작성자/수정일/비활성화)을 기본 탑재한다.
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
  standardColumns = true,
  meta,
}: DataTableProps<T>) {
  const colSpan = columns.length + (numbered ? 1 : 0) + (standardColumns ? 3 : 0)

  return (
    <div
      className={cn(
        'w-full overflow-x-auto rounded-radius-md border border-gray-300 bg-white shadow-soft',
        className,
      )}
    >
      <table className="w-full border-separate border-spacing-0 text-body">
        <thead>
          <tr className="bg-gray-50">
            {numbered && (
              <th className="h-9 w-14 border-b border-gray-300 px-3 text-right text-caption font-semibold text-gray-500">
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
                <th className="h-9 border-b border-gray-300 px-3 text-left text-caption font-semibold text-gray-500">작성자</th>
                <th className="h-9 border-b border-gray-300 px-3 text-left text-caption font-semibold text-gray-500">수정일</th>
                <th className="h-9 w-20 border-b border-gray-300 px-3 text-center text-caption font-semibold text-gray-500">비활성화</th>
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
              return (
                <tr
                  key={rowKey(row)}
                  className={cn(
                    'h-11 transition-colors duration-fast hover:bg-gray-25',
                    !active && 'opacity-50',
                  )}
                >
                  {numbered && (
                    <td className="border-b border-gray-200 px-3 text-right text-gray-500 tabular-nums">
                      {rows.length - index}
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'border-b border-gray-200 px-3 font-medium text-gray-800',
                        alignClass[col.align ?? 'left'],
                        col.numeric && 'tabular-nums',
                      )}
                    >
                      {col.render ? col.render(row) : (row[col.key as keyof T] as ReactNode)}
                    </td>
                  ))}
                  {standardColumns && (
                    <>
                      <td className="border-b border-gray-200 px-3 text-gray-500">
                        {resolveAuthor(row, meta)}
                      </td>
                      <td className="border-b border-gray-200 px-3 text-gray-500 tabular-nums">
                        {resolveUpdatedAt(row, meta)}
                      </td>
                      <td className="border-b border-gray-200 px-3 text-center">
                        {active ? (
                          <button
                            type="button"
                            aria-label="비활성화"
                            title="비활성화(소프트 삭제)"
                            disabled={!meta?.onDeactivate}
                            onClick={() => {
                              if (
                                typeof window !== 'undefined' &&
                                window.confirm('이 항목을 비활성화하시겠습니까?')
                              ) {
                                meta?.onDeactivate?.(row)
                              }
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-radius-md text-gray-400 transition-colors duration-fast hover:bg-red-50 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>
                          </button>
                        ) : (
                          <span className="text-caption text-gray-400">비활성</span>
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
}
