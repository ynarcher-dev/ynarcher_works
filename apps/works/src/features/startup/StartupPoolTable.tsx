import { Badge, DataTable, type Column, type DataTableProps } from '@ynarcher/ui'
import { useMemo } from 'react'
import { readIndustries } from '@/features/startup/startupGrowth'

/**
 * 스타트업 풀(발굴·보육·투자) 목록 행. `startups` 테이블 스키마의 표시 컬럼 부분집합이다.
 * 목록에 필요 없는 상세 필드(address·contact·sns_links 등)는 인덱스 시그니처로 흡수한다.
 */
export interface StartupPoolRow {
  id: string
  name: string
  /** 대표자명(startups.representative). */
  representative?: string | null
  /** 산업(startups.industry). */
  industry?: string | null
  /** 성장 단계(startups.stage). */
  stage?: string | null
  /** 구분: 발굴/보육/투자/기타(startups.management_status). */
  management_status?: string | null
  /** 현황: 풀 진행 상태(startups.pool_status). */
  pool_status?: string | null
  /** 발굴 경로(startups.discovery_source). */
  discovery_source?: string | null
  updated_at?: string | null
  created_by?: string | null
  deleted_at?: string | null
  [key: string]: unknown
}

/**
 * 구분(management_status) 태그명 → 배지 톤. 값은 기업구분 태그 원장(company_category_tags)에서 오며,
 * 알려진 기본 태그는 색으로 구분하고 그 외 사용자 정의 태그는 중립으로 폴백한다.
 */
const CATEGORY_TONES: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = {
  발굴: 'neutral',
  보육: 'info',
  투자: 'success',
  기타: 'warning',
}

interface StartupPoolTableProps {
  rows: StartupPoolRow[]
  isLoading?: boolean
  /** 행 클릭(상세 진입). 지정 시 행이 클릭 가능해진다. */
  onRowClick?: (row: StartupPoolRow) => void
  /** 비활성화(소프트 삭제) 핸들러. 미지정 시 관리 컬럼 버튼은 비활성 상태로 노출된다. */
  onDeactivate?: (row: StartupPoolRow) => void
  /** true면 비활성화 버튼이 내장 confirm 없이 핸들러를 호출한다(사유 입력 모달 사용 시). */
  deactivateWithReason?: boolean
  /** 행 다중선택 키(controlled). 일괄 작업용으로 상위가 소유한다. */
  selectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  /** 서버 사이드 페이지네이션(0-base). DataTable로 그대로 전달된다. */
  pagination?: DataTableProps<StartupPoolRow>['pagination']
}

/**
 * 스타트업 풀 관리 공용 데이터 테이블.
 * 컬럼: 체크박스·No.·기업명·대표자명·산업·단계·구분·현황·발굴 경로·작성자·수정일·관리.
 * 좌측 선택/넘버링과 우측 표준 컬럼(작성자·수정일·관리)은 공용 DataTable이 소유하고,
 * 본 컴포넌트는 그 사이의 도메인 컬럼(기업명~발굴 경로)만 정의한다.
 * 현황·발굴 경로는 데이터 원천 확정 전까지 플레이스홀더('-')로 자리만 잡는다.
 */
export function StartupPoolTable({
  rows,
  onRowClick,
  onDeactivate,
  deactivateWithReason,
  selectedKeys,
  onSelectionChange,
  pagination,
}: StartupPoolTableProps) {
  const columns = useMemo<Column<StartupPoolRow>[]>(
    () => [
      {
        key: 'name',
        header: '기업명',
        className: 'min-w-[10rem] font-semibold',
        render: (r) => r.name ?? '-',
      },
      {
        key: 'representative',
        header: '대표자명',
        className: 'w-28',
        render: (r) => r.representative || '-',
      },
      {
        key: 'industry',
        header: '산업',
        className: 'min-w-[8rem]',
        render: (r) => readIndustries(r).join(' · ') || '-',
      },
      {
        key: 'stage',
        header: '단계',
        className: 'w-24',
        render: (r) =>
          r.stage ? (
            <Badge tone="neutral" size="sm">
              {r.stage}
            </Badge>
          ) : (
            '-'
          ),
      },
      {
        key: 'management_status',
        header: '구분',
        align: 'center',
        className: 'w-20',
        render: (r) => {
          const v = r.management_status
          if (!v) return <span className="text-gray-400">-</span>
          return (
            <Badge tone={CATEGORY_TONES[v] ?? 'neutral'} size="sm">
              {v}
            </Badge>
          )
        },
      },
      {
        key: 'pool_status',
        header: '현황',
        align: 'center',
        className: 'w-24',
        render: (r) =>
          r.pool_status ? (
            <Badge tone="info" size="sm">
              {r.pool_status}
            </Badge>
          ) : (
            <span className="text-gray-400">-</span>
          ),
      },
      {
        key: 'discovery_source',
        header: '발굴 경로',
        className: 'w-28',
        render: (r) => r.discovery_source || <span className="text-gray-400">-</span>,
      },
    ],
    [],
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      layout="fixed"
      selectable
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      onRowClick={onRowClick}
      pagination={pagination}
      authorLabel="담당자"
      meta={{
        // 임시: 담당자 연동 전까지 '홍길동'으로 대체한다(created_by는 UUID라 직접 노출 불가).
        author: () => '홍길동',
        onDeactivate,
        deactivateWithReason,
      }}
      emptyText="등록된 스타트업이 없습니다."
    />
  )
}
