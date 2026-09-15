import { Badge, Card, DataTable, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/auth/authStore'
import { useApprovalDocuments } from '@/features/approval/approvalApi'
import type { ApprovalListRow } from '@/features/approval/model'
import { APPROVAL_LABELS, approvalTone, type ApprovalStatus } from '@/features/management/config'

/**
 * 내가 올린 근태 신청 목록 — **원장을 새로 두지 않는다.**
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 휴가·연장근무·휴일근무 신청은 모두 전자결재 문서이고, 이 목록은 그 문서함을 양식 약칭으로
 * 걸러 보는 **다른 입구**일 뿐이다. 근태 쪽에 신청 원장을 따로 두면 같은 신청이 두 곳에 적히고,
 * 결재가 반려된 뒤 어느 쪽이 사실인지 화면이 답하지 못한다.
 *
 * 걸러 내는 기준은 양식의 **약칭**이다. 이름은 관리자가 고칠 수 있어서 `휴가신청서`를 `휴가원`으로
 * 바꾼 날 목록이 비어 버린다(신청 화면이 양식을 찾는 기준과 같다).
 */
export function AttendanceRequestList({
  title,
  help,
  abbrevs,
  emptyText,
  year,
}: {
  title: string
  help?: string
  /** 이 목록이 모으는 양식 약칭. */
  abbrevs: string[]
  emptyText: string
  /** 기안일이 이 해에 속한 문서만 센다. 생략하면 모든 해를 센다. */
  year?: number
}) {
  const navigate = useNavigate()
  const uid = useAuthStore((s) => s.user?.id) ?? null
  const { data, isLoading } = useApprovalDocuments()

  /*
    **내가 올린 것만** 센다. 문서함은 결재자·참조자로 걸린 남의 문서도 함께 내어 주는데, 그것까지
    여기 세우면 '내 신청 내역'이라는 제목이 거짓이 된다 — 결재해야 할 것은 전자결재 문서함이
    답할 일이다.
  */
  const rows = useMemo(() => {
    if (!uid) return []
    return (data ?? []).filter(
      (r) =>
        r.drafter_id === uid &&
        r.form?.abbrev &&
        abbrevs.includes(r.form.abbrev) &&
        (year === undefined || dayjs(r.created_at).year() === year),
    )
  }, [data, uid, abbrevs, year])

  const columns: Column<ApprovalListRow>[] = [
    {
      key: 'created_at',
      header: '기안일',
      type: 'date',
      render: (r) => dayjs(r.created_at).format('YYYY-MM-DD'),
    },
    { key: 'title', header: '제목', type: 'name', primary: true, render: (r) => r.title },
    {
      key: 'form',
      header: '문서 종류',
      type: 'text',
      tone: 'meta',
      render: (r) => r.form?.name ?? '-',
    },
    {
      key: 'status',
      header: '결재 상태',
      type: 'badge',
      render: (r) => {
        const status = r.status as ApprovalStatus
        return <Badge tone={approvalTone[status] ?? 'neutral'}>{APPROVAL_LABELS[status] ?? status}</Badge>
      },
    },
  ]

  return (
    <Card title={title} count={rows.length} help={help}>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        emptyText={isLoading ? '불러오는 중입니다.' : emptyText}
        standardColumns={false}
        // 줄을 누르면 그 문서로 간다 — 목록에 따로 `상세` 열을 세우지 않는다.
        onRowClick={(r) => navigate(`/my-office?tab=approval&doc=${r.id}`)}
      />
    </Card>
  )
}
