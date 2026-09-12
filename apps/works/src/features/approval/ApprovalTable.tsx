import { DataTable, type Column, type DataTableProps } from '@ynarcher/ui'
import { APPROVAL_ROLE_LABEL } from '@/features/approval/config'
import { approvalStatusLabel } from '@/features/approval/approvalDraftActions'
import { docTypeName, myRole, type ApprovalListRow } from '@/features/approval/model'
import { HiworksSourceMark } from '@/features/approval/HiworksSourceMark'

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
  /**
   * 페이저(공용 DataTable 규격). 문서함마다 걸러진 건수가 다르므로 자르기·페이지 상태는
   * 목록을 걸러 내는 쪽(워크스페이스)이 갖고, 표는 받아 그대로 넘긴다.
   */
  pagination?: DataTableProps<ApprovalListRow>['pagination']
  /**
   * 선택 상태(일괄 승인·확인). 고른 줄에 대고 할 일은 요약 줄이 갖고, 표는 고르는 자리만 낸다.
   * 핸들러를 주지 않으면 체크 칸 자체가 서지 않는다 — 고른들 할 일이 없는 목록에
   * 빈 칸 한 줄을 세우지 않는다.
   */
  selectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  /** 그 줄에 지금 내가 할 일이 있는가. 없는 줄은 체크 칸이 빈 채로 남는다. */
  selectableRow?: (row: ApprovalListRow) => boolean
}

/**
 * 끝난 판단(반려)과 멈춘 판단(보완)만 행 전체를 물들인다 — 진행·완료는 목록의 보통 상태라
 * 색으로 가를 것이 없고, 색이 여러 줄에 깔리면 정작 손이 필요한 두 줄이 그 사이에 묻힌다.
 *
 * 셀이 저마다 자기 색(`text-gray-900`/`gray-700`)을 들고 있어 행에 건 색은 그 값을 이기지 못한다.
 * 그래서 자식 선택자로 td에 직접 건다.
 */
function rowTone(r: ApprovalListRow): string | undefined {
  if (r.status === 'REJECTED') return '[&>td]:text-danger'
  if (r.status === 'REVISION_REQUIRED') return '[&>td]:text-warning'
  return undefined
}

/**
 * 전자결재 문서 목록. 폭·정렬은 열의 종류(type)가 정한다.
 * 표준 메타 컬럼과 No. 넘버링은 쓰지 않는다(문서 번호가 그 자리를 대신한다).
 */
export function ApprovalTable({
  rows,
  uid,
  myDeptId,
  nameOf,
  onRowClick,
  emptyText = '전자결재 문서가 없습니다.',
  pagination,
  selectedKeys,
  onSelectionChange,
  selectableRow,
}: ApprovalTableProps) {
  const columns: Column<ApprovalListRow>[] = [
    {
      key: 'doc_no',
      header: '문서 번호',
      className: 'w-44 whitespace-nowrap pr-4',
      render: (r) => r.doc_no ?? '-',
    },
    {
      key: 'title',
      header: '제목',
      primary: true,
      sortable: true,
      className: 'overflow-hidden',
      render: (r) => (
        <span className="flex min-w-0 items-center gap-1" title={r.title}>
          {r.legacy?.source_system === 'HIWORKS' && <HiworksSourceMark />}
          <span className="min-w-0 truncate">{r.title}</span>
        </span>
      ),
    },
    {
      key: 'docType',
      header: '문서 종류',
      className: 'w-44',
      render: (r) => docTypeName(r),
    },
    {
      key: 'drafter',
      header: '기안자',
      className: 'w-28',
      render: (r) => nameOf(r.drafter_id),
    },
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
      type: 'code',
      render: (r) => {
        const role = myRole(r, uid, myDeptId)
        return role ? APPROVAL_ROLE_LABEL[role] : '-'
      },
    },
    {
      key: 'status',
      header: '상태',
      type: 'badge',
      // 색은 행이 지므로(rowTone) 셀에서 다시 칠하지 않는다 — 셀에 색을 두면 상태 칸만
      // 행의 색과 다르게 남는다.
      // 기안 취소된 문서는 '임시저장'으로 적지 않는다 — 결재를 돌던 문서가 기안자에게
      // 돌아온 것이라, 한 번도 올라오지 않은 임시저장과 같은 말로 적으면 목록이 사실을
      // 말하지 못한다(판정은 상태 + 회차뿐이라 목록이 서버에 따로 물을 것이 없다).
      render: (r) => approvalStatusLabel(r.status, r.approval_lines),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      selectable={Boolean(onSelectionChange)}
      selectableRow={selectableRow}
      selectedKeys={selectedKeys}
      onSelectionChange={onSelectionChange}
      numbered={false}
      standardColumns={false}
      onRowClick={onRowClick}
      emptyText={emptyText}
      pagination={pagination}
      rowClassName={rowTone}
      layout="fixed"
    />
  )
}
