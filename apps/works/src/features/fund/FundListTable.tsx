import { Badge, DataTable, type Column, type DataTableProps } from '@ynarcher/ui'
import { useMemo } from 'react'
import {
  FUND_CHARACTER_LABEL,
  FUND_SOURCE_LABEL,
  FUND_STATUS_TONE,
  FUND_STRATEGY_LABEL,
  FUND_TYPE_LABEL,
  formatEok,
  fundOperatorLabel,
  fundPeriod,
  fundStatusLabel,
  type FundListRow,
} from '@/features/fund/fundListHooks'

/** 구분(전략) 배지 톤: AC=파랑, VC=초록, PE=주황, 기타=회색. */
const STRATEGY_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'info'> = {
  AC: 'info',
  VC: 'success',
  PE: 'warning',
  ETC: 'neutral',
}

/** 펀드유형 배지 톤: 프로젝트=파랑, 블라인드=회색. */
const TYPE_TONE: Record<string, 'neutral' | 'info'> = { PROJECT: 'info', BLIND: 'neutral' }

interface FundListTableProps {
  rows: FundListRow[]
  onRowClick?: (row: FundListRow) => void
  emptyText?: string
  selectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  pagination?: DataTableProps<FundListRow>['pagination']
}

const dash = <span className="text-gray-400">-</span>

/**
 * 펀드(조합) 목록 데이터 테이블. STARTUP 풀 테이블 골격 재사용.
 * 컬럼: 펀드명·재원·성격·유형·상태·존속기간·약정총액·실출자금액·집행액·잔액·대표펀드매니저·운용인력 + 담당자(우측).
 * 우측 '담당자' 컬럼의 값은 등록자(created_by)이며, 헤더 라벨만 재표기한다(사용자 결정, 작성자≠담당자 가드 인지).
 */
export function FundListTable({
  rows,
  onRowClick,
  emptyText,
  selectedKeys,
  onSelectionChange,
  pagination,
}: FundListTableProps) {
  const columns = useMemo<Column<FundListRow>[]>(
    () => [
      { key: 'name', header: '펀드명', primary: true, className: 'w-52', render: (f) => f.name },
      {
        key: 'source_type',
        header: '재원',
        className: 'w-24',
        render: (f) =>
          f.source_type ? (
            <Badge tone={f.source_type === 'MOTAE' ? 'info' : 'neutral'}>
              {FUND_SOURCE_LABEL[f.source_type] ?? f.source_type}
            </Badge>
          ) : (
            dash
          ),
      },
      {
        key: 'character_type',
        header: '성격',
        className: 'w-32',
        render: (f) =>
          f.character_type ? (
            <Badge tone="neutral">{FUND_CHARACTER_LABEL[f.character_type] ?? f.character_type}</Badge>
          ) : (
            dash
          ),
      },
      {
        key: 'strategy_type',
        header: '구분',
        className: 'w-20',
        render: (f) =>
          f.strategy_type ? (
            <Badge tone={STRATEGY_TONE[f.strategy_type] ?? 'neutral'}>
              {FUND_STRATEGY_LABEL[f.strategy_type] ?? f.strategy_type}
            </Badge>
          ) : (
            dash
          ),
      },
      {
        key: 'fund_type',
        header: '펀드유형',
        className: 'w-24',
        render: (f) =>
          f.fund_type ? (
            <Badge tone={TYPE_TONE[f.fund_type] ?? 'neutral'}>
              {FUND_TYPE_LABEL[f.fund_type] ?? f.fund_type}
            </Badge>
          ) : (
            dash
          ),
      },
      {
        key: 'status',
        header: '상태',
        className: 'w-24',
        render: (f) => <Badge tone={FUND_STATUS_TONE[f.status] ?? 'neutral'}>{fundStatusLabel(f.status)}</Badge>,
      },
      {
        key: 'term',
        header: '존속기간',
        className: 'w-44',
        render: (f) => fundPeriod(f.term_start, f.term_end) ?? dash,
      },
      {
        key: 'total_commitment',
        header: '약정총액',
        align: 'right',
        numeric: true,
        className: 'w-24',
        render: (f) => formatEok(f.total_commitment),
      },
      {
        key: 'paid_in_amount',
        header: '실출자금액',
        align: 'right',
        numeric: true,
        className: 'w-24',
        render: (f) => (f.paid_in_amount == null ? dash : formatEok(f.paid_in_amount)),
      },
      {
        key: 'drawn_amount',
        header: '집행액',
        align: 'right',
        numeric: true,
        className: 'w-24',
        render: (f) => formatEok(f.drawn_amount),
      },
      {
        key: 'balance',
        header: '잔액',
        align: 'right',
        numeric: true,
        className: 'w-24',
        render: (f) => formatEok(f.total_commitment - f.drawn_amount),
      },
      {
        key: 'manager',
        header: '대표펀드매니저',
        className: 'w-28',
        render: (f) => f.manager?.name || dash,
      },
      {
        key: 'operators',
        header: '운용인력',
        className: 'w-28',
        render: (f) => fundOperatorLabel(f.operators) ?? dash,
      },
    ],
    [],
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(f) => f.id}
      onRowClick={onRowClick}
      selectable
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      pagination={pagination}
      showManageColumn={false}
      // 값은 등록자(created_by), 라벨만 '담당자'로 표기(작성자≠담당자 원칙을 인지한 의도적 재라벨).
      authorLabel="담당자"
      meta={{ author: (f) => f.creator?.name || dash }}
      emptyText={emptyText ?? '등록된 펀드가 없습니다.'}
    />
  )
}
