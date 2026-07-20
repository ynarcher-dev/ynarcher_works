import {
  Badge,
  DataTable,
  type Column,
  type DataTableProps,
} from '@ynarcher/ui'
import { useMemo } from 'react'
import {
  PROGRAM_CATEGORY_LABEL,
  PROGRAM_CATEGORY_TONE,
  PROGRAM_STATUS_LABEL,
  PROGRAM_STATUS_TONE,
} from '@/features/ac/config'
import type { Program } from '@/features/ac/hooks'

interface ProgramTableProps {
  rows: Program[]
  onRowClick?: (row: Program) => void
  /** 비활성화(소프트 삭제) 핸들러. 미지정 시 관리 컬럼 버튼은 비활성 상태로 노출된다. */
  onDeactivate?: (row: Program) => void
  /** 행 다중선택 키(controlled). 상위가 소유한다. */
  selectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  /** 서버 사이드 페이지네이션(0-base). DataTable로 그대로 전달된다. */
  pagination?: DataTableProps<Program>['pagination']
}

/**
 * 프로그램 원장 공용 데이터 테이블(STARTUP StartupPoolTable과 동일 규격).
 * 컬럼: 체크박스·No.·사업코드·사업구분·프로그램명·상태·운영 시작일·운영 종료일 + 우측 표준 컬럼(등록자·수정일·관리).
 */
export function ProgramTable({
  rows,
  onRowClick,
  onDeactivate,
  selectedKeys,
  onSelectionChange,
  pagination,
}: ProgramTableProps) {
  const columns = useMemo<Column<Program>[]>(
    () => [
      {
        // 사업코드(6자리 영숫자 난수). 목록에서는 다른 컬럼과 동일한 본문 텍스트로 노출한다.
        key: 'code',
        header: '사업코드',
        className: 'whitespace-nowrap text-gray-600',
        render: (r) => r.code ?? <span className="text-gray-400">-</span>,
      },
      {
        // 사업구분(공공/민간/매출). 상태 배지와 동일 규격의 톤 배지로 노출한다.
        key: 'category',
        header: '사업구분',
        className: 'whitespace-nowrap',
        render: (r) =>
          r.category ? (
            <Badge tone={PROGRAM_CATEGORY_TONE[r.category] ?? 'neutral'} size="sm">
              {PROGRAM_CATEGORY_LABEL[r.category] ?? r.category}
            </Badge>
          ) : (
            <span className="text-gray-400">-</span>
          ),
      },
      {
        // 프로그램명은 min-width로 넓게 확보한다(설명 필러 컬럼이 그만큼 좁혀진다).
        key: 'title',
        header: '사업명',
        className: 'min-w-[18rem] whitespace-nowrap font-semibold',
        render: (r) => r.title,
      },
      {
        // 설명은 자유 서술이라 남는 폭을 전부 흡수하는 필러 컬럼으로 둔다(넘치면 말줄임).
        // 나머지 컬럼은 내용에 맞춰 좁혀져 컬럼 간 여백이 균일해진다.
        key: 'description',
        header: '설명',
        className: 'w-full max-w-0 truncate text-gray-600',
        render: (r) =>
          r.description || <span className="text-gray-400">-</span>,
      },
      {
        key: 'status',
        header: '상태',
        className: 'whitespace-nowrap',
        render: (r) => (
          <Badge tone={PROGRAM_STATUS_TONE[r.status] ?? 'neutral'} size="sm">
            {PROGRAM_STATUS_LABEL[r.status] ?? r.status}
          </Badge>
        ),
      },
      {
        key: 'start_date',
        header: '운영 시작일',
        className: 'whitespace-nowrap',
        numeric: true,
        render: (r) => r.start_date ?? <span className="text-gray-400">-</span>,
      },
      {
        key: 'end_date',
        header: '운영 종료일',
        className: 'whitespace-nowrap',
        numeric: true,
        render: (r) => r.end_date ?? <span className="text-gray-400">-</span>,
      },
      {
        key: 'managers',
        header: '담당자',
        className: 'whitespace-nowrap',
        render: (r) => {
          const ms = r.managers ?? []
          if (ms.length === 0)
            return <span className="text-gray-400">미지정</span>
          // 최대 4명까지 이름을 노출하고, 초과분은 "외 N"으로 접는다.
          const names = ms.map((m) => m.user?.name ?? '알 수 없음')
          const rest = names.length - 4
          const shown = names.slice(0, 4).join(', ')
          return rest > 0 ? `${shown} 외 ${rest}` : shown
        },
      },
    ],
    [],
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      selectable
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      onRowClick={onRowClick}
      pagination={pagination}
      meta={{
        author: (r) => r.creator?.name || <span className="text-gray-400">-</span>,
        onDeactivate,
      }}
      emptyText="등록된 사업이 없습니다."
    />
  )
}
