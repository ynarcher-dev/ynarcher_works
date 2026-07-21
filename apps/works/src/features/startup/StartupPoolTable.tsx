import { Badge, DataTable, type Column, type DataTableProps } from '@ynarcher/ui'
import { useMemo } from 'react'
import { formatFounded, readIndustries } from '@/features/startup/startupGrowth'
import {
  isInvested,
  managementStatusLabel,
  type ManagementStatus,
} from '@/features/startup/startupClassification'

/**
 * 스타트업 풀(발굴·보육·투자) 목록 행. `startups` 테이블 스키마의 표시 컬럼 부분집합이다.
 * 목록에 필요 없는 상세 필드(address·contact·sns_links 등)는 인덱스 시그니처로 흡수한다.
 */
export interface StartupPoolRow {
  id: string
  name: string
  /** 대표자명(startups.representative). */
  representative?: string | null
  /** 사업자등록번호(startups.biz_reg_no). */
  biz_reg_no?: string | null
  /** 설립일(startups.founded_on) — 목록에는 연도만 표시. */
  founded_on?: string | null
  /** 산업(startups.industry). SSOT는 industries(배열)이며, 목록은 readIndustries로 읽는다. */
  industry?: string | null
  /** 성장 단계(startups.stage). */
  stage?: string | null
  /** 구분 코드: sourced/incubated/invested/other(startups.management_status). */
  management_status?: string | null
  /** 현황: 풀 진행 상태(startups.pool_status). 투자기업에서만 유효. */
  pool_status?: string | null
  /** 발굴 경로(startups.discovery_source). */
  discovery_source?: string | null
  updated_at?: string | null
  created_by?: string | null
  /** 작성자(등록자, created_by → users) FK 임베드. 전 구분 공통 작성자 컬럼의 원천. */
  creator?: { id: string; name: string | null } | null
  /** 지정 담당자(startup_managers) 임베드. 투자기업 담당자 컬럼의 원천(비투자는 없음). */
  managers?: { user_id: string; is_lead: boolean; user: { id: string; name: string | null } | null }[]
  deleted_at?: string | null
  [key: string]: unknown
}

interface StartupPoolTableProps {
  rows: StartupPoolRow[]
  isLoading?: boolean
  /**
   * 소속 탭(구분 코드). 조건부 컬럼과 담당자 표시를 좌우한다. 작성자는 전 구분 공통.
   * 미지정('내 기업 관리')은 구분이 섞인 뷰이며, 열 구성은 투자기업 탭과 동일하게 맞춘다.
   */
  tab?: ManagementStatus
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
 * 컬럼: 체크박스·No.·기업명·대표자명·사업자등록번호·설립일·산업(뱃지 최대 3)·단계·구분·관리현황(투자·내 기업)·담당자·발굴 경로(발굴·보육·기타)·작성자·수정일·관리.
 * 좌측 선택/넘버링과 우측 표준 컬럼(작성자·수정일·관리)은 공용 DataTable이 소유하고,
 * 본 컴포넌트는 그 사이의 도메인 컬럼(기업명~발굴 경로, 담당자)만 정의한다.
 * 작성자(등록자)와 담당자는 별개 축이다 — 작성자 컬럼은 전 구분 공통 등록자, 담당자 컬럼은 투자=지정 담당자·그 외=공동관리.
 */
/** 투자기업 담당자 표시명: 리드 → 지원 순. 지정 담당자가 없으면 null(→ "미지정"). 등록자로 폴백하지 않는다. */
function managerLabel(r: StartupPoolRow): string | null {
  const ms = r.managers ?? []
  if (ms.length === 0) return null
  const lead = ms.find((m) => m.is_lead) ?? ms[0]
  const leadName = lead?.user?.name ?? null
  const extra = ms.length - 1
  return leadName ? (extra > 0 ? `${leadName} 외 ${extra}` : leadName) : null
}

export function StartupPoolTable({
  rows,
  tab,
  onRowClick,
  onDeactivate,
  deactivateWithReason,
  selectedKeys,
  onSelectionChange,
  pagination,
}: StartupPoolTableProps) {
  const columns = useMemo<Column<StartupPoolRow>[]>(() => {
    const cols: Column<StartupPoolRow>[] = [
      {
        key: 'name',
        header: '기업명',
        className: 'w-36 font-semibold',
        render: (r) => r.name ?? '-',
      },
      {
        key: 'representative',
        header: '대표자명',
        className: 'w-24',
        render: (r) => r.representative || '-',
      },
      {
        key: 'biz_reg_no',
        header: '사업자등록번호',
        className: 'w-32',
        render: (r) => r.biz_reg_no || <span className="text-gray-400">-</span>,
      },
      {
        // 상세페이지와 동일하게 설립일 + 만 나이(formatFounded)로 표기한다.
        key: 'founded_on',
        header: '설립일',
        className: 'w-44',
        render: (r) => (r.founded_on ? formatFounded(r.founded_on) : <span className="text-gray-400">-</span>),
      },
      {
        key: 'industry',
        header: '산업',
        className: 'w-52',
        render: (r) => {
          const inds = readIndustries(r).slice(0, 3)
          if (inds.length === 0) return <span className="text-gray-400">-</span>
          return (
            <div className="flex flex-wrap gap-1">
              {inds.map((ind) => (
                <Badge key={ind} tone="neutral">
                  {ind}
                </Badge>
              ))}
            </div>
          )
        },
      },
      {
        key: 'stage',
        header: '단계',
        className: 'w-24',
        render: (r) => r.stage || <span className="text-gray-400">-</span>,
      },
      {
        key: 'management_status',
        header: '구분',
        className: 'w-24',
        render: (r) =>
          managementStatusLabel(r.management_status) || <span className="text-gray-400">-</span>,
      },
    ]

    // 관리현황(pool_status)은 투자기업에서만 유효 → 투자 탭(또는 전체 뷰)에서만 노출.
    if (tab === undefined || tab === 'invested') {
      cols.push({
        key: 'pool_status',
        header: '관리현황',
        className: 'w-24',
        render: (r) => r.pool_status || <span className="text-gray-400">-</span>,
      })
    }

    // 발굴 경로는 구분이 확정된 비투자 탭(발굴·보육·기타)에서만 담당자 앞에 노출한다.
    // '내 기업 관리'(tab 없음)는 구분이 섞여 있어 이 열이 대부분 비고, 투자기업 탭과 열 구성이
    // 어긋나 보이므로 제외한다. 자유 서술이라 남는 폭을 흡수한다.
    if (tab !== undefined && tab !== 'invested') {
      cols.push({
        key: 'discovery_source',
        header: '발굴 경로',
        className: 'min-w-[9rem]',
        render: (r) => r.discovery_source || <span className="text-gray-400">-</span>,
      })
    }

    // 담당자(관리 주체): 투자기업(관리현황 바로 뒤)은 지정 담당자(리드, 외 N),
    // 그 외는 공동관리(쓰기 권한자 누구나) 텍스트. 등록자로 폴백하지 않으며 작성자는 우측 표준 컬럼에 별도 표시.
    cols.push({
      key: 'managers',
      header: '담당자',
      className: 'w-28',
      render: (r) => {
        if (isInvested(r.management_status)) {
          const label = managerLabel(r)
          return label ?? <span className="text-gray-400">미지정</span>
        }
        return '공동관리'
      },
    })

    return cols
  }, [tab])

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
      meta={{
        // 작성자(등록자) 컬럼: 전 구분 공통으로 created_by를 표시한다(담당자와 별개 축, 폴백 없음).
        author: (r) => r.creator?.name || <span className="text-gray-400">-</span>,
        onDeactivate,
        deactivateWithReason,
      }}
      emptyText="등록된 스타트업이 없습니다."
    />
  )
}
