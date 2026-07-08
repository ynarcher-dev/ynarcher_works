import { Badge, DataTable, type Column } from '@ynarcher/ui'

/** 전자결재 문서 한 건(목록 행). 세부 필드·상태값은 후속 작업에서 확정한다. */
export interface ApprovalDocument {
  id: string
  /** 문서 종류(예: 지출결의서, 휴가신청서). */
  docType: string
  /** 문서 번호. */
  docNo: string
  /** 제목. */
  title: string
  /** 부서명. */
  department: string
  /** 기안자. */
  drafter: string
  /** 기안일(YYYY-MM-DD). */
  draftedAt: string
  /** 완료일(YYYY-MM-DD). 미완료 시 null. */
  completedAt: string | null
  /** 상태(예: 진행중, 완료, 반려). */
  status: string
  /** 구분(예: 수신, 발신). */
  category: string
}

const columns: Column<ApprovalDocument>[] = [
  { key: 'docType', header: '문서 종류', render: (r) => r.docType },
  { key: 'docNo', header: '문서 번호', render: (r) => r.docNo },
  { key: 'title', header: '제목', render: (r) => r.title },
  { key: 'department', header: '부서명', render: (r) => r.department },
  { key: 'drafter', header: '기안자', render: (r) => r.drafter },
  { key: 'draftedAt', header: '기안일', numeric: true, render: (r) => r.draftedAt },
  { key: 'completedAt', header: '완료일', numeric: true, render: (r) => r.completedAt ?? '-' },
  { key: 'status', header: '상태', render: (r) => <Badge tone="neutral">{r.status}</Badge> },
  { key: 'category', header: '구분', render: (r) => r.category },
]

export interface ApprovalTableProps {
  /** 표시할 문서 목록. 미지정 시 빈 테이블. */
  rows?: ApprovalDocument[]
  /** 선택된 행 키(제어 모드). */
  selectedKeys?: string[]
  /** 선택 변경 콜백. */
  onSelectionChange?: (keys: string[]) => void
}

/**
 * 전자결재 문서 목록 데이터 테이블.
 * 공용 DataTable을 기반으로 체크박스 선택 + 전자결재 전용 컬럼(문서 종류~구분)을 구성한다.
 * 표준 메타 컬럼(작성자/수정일/관리)과 No. 넘버링은 사용하지 않는다.
 */
export function ApprovalTable({ rows = [], selectedKeys, onSelectionChange }: ApprovalTableProps) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      selectable
      numbered={false}
      standardColumns={false}
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      emptyText="전자결재 문서가 없습니다."
    />
  )
}
