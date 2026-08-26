import { Badge, DataTable, type Column } from '@ynarcher/ui'
import {
  APPROVAL_ROLE_LABEL,
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
} from '@/features/approval/config'
import { docTypeName, myRole, type ApprovalListRow } from '@/features/approval/model'

export interface ApprovalTableProps {
  rows: ApprovalListRow[]
  /** 현재 사용자 id — 구분(나의 자리) 열 판정. */
  uid: string
  /** 현재 사용자의 부서 id(부서 문서함 구분 표기). */
  myDeptId: string | null
  /** 임직원 id → 이름(기안자 열). */
  nameOf: (id: string | null) => string
  onRowClick?: (row: ApprovalListRow) => void
  emptyText?: string
}

/**
 * 전자결재 문서 목록. 폭·정렬은 열의 종류(type)가 정한다.
 * 표준 메타 컬럼과 No. 넘버링은 쓰지 않고(문서 번호가 그 자리를 대신한다),
 * 일괄 처리가 없으므로 선택 체크박스도 내린다.
 */
export function ApprovalTable({
  rows,
  uid,
  myDeptId,
  nameOf,
  onRowClick,
  emptyText = '전자결재 문서가 없습니다.',
}: ApprovalTableProps) {
  const columns: Column<ApprovalListRow>[] = [
    { key: 'doc_no', header: '문서 번호', type: 'text', render: (r) => r.doc_no ?? '-' },
    { key: 'title', header: '제목', type: 'name', primary: true, render: (r) => r.title },
    { key: 'docType', header: '문서 종류', type: 'text', render: (r) => docTypeName(r) },
    { key: 'drafter', header: '기안자', type: 'person', render: (r) => nameOf(r.drafter_id) },
    { key: 'draftedAt', header: '기안일', type: 'date', render: (r) => r.created_at.slice(0, 10) },
    {
      key: 'completedAt',
      header: '완료일',
      type: 'date',
      render: (r) => r.completed_at?.slice(0, 10) ?? '-',
    },
    {
      // 구분(나의 자리)은 대등한 분류라 배지 없이 텍스트로 적는다(자산 상태 열과 같은 판단).
      key: 'role',
      header: '구분',
      type: 'text',
      render: (r) => {
        const role = myRole(r, uid, myDeptId)
        return role ? APPROVAL_ROLE_LABEL[role] : '-'
      },
    },
    {
      key: 'status',
      header: '상태',
      type: 'badge',
      render: (r) => <Badge tone={DOC_STATUS_TONE[r.status]}>{DOC_STATUS_LABEL[r.status]}</Badge>,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      selectable={false}
      numbered={false}
      standardColumns={false}
      onRowClick={onRowClick}
      emptyText={emptyText}
    />
  )
}
