import {
  Badge,
  Button,
  DataTable,
  EmptyValue,
  Input,
  Modal,
  Spinner,
  TextArea,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import {
  GUEST_PAGE_SIZE,
  useGuestAccounts,
  useSetGuestAccountActive,
  type GuestAccount,
  type GuestAccountProgram,
} from '@/features/admin/guestAccountHooks'
import { GUEST_TYPE_LABEL } from '@/lib/userTypes'

const DASH = <EmptyValue />

/** 워크스페이스 표기 — 사업 원장이 셋이라 어느 쪽 사업인지 함께 밝힌다. */
const WORKSPACE_LABEL: Record<string, string> = { ac: 'AC', mna: 'M&A', project: 'PROJECT' }

/** 사업별 로그인 개방 상태 표기. 계정 상태와 다른 축이라 톤도 다르게 쓴다. */
const LOGIN_STATUS: Record<GuestAccountProgram['login_status'], { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  NOT_APPLICABLE: { label: '해당 없음', tone: 'neutral' },
  NOT_ALLOWED: { label: '미개방', tone: 'neutral' },
  INVITED: { label: '초대됨', tone: 'warning' },
  ACTIVE: { label: '열림', tone: 'success' },
  BLOCKED: { label: '차단', tone: 'danger' },
}

function fmtDate(v: string | null): string | null {
  return v ? new Date(v).toLocaleDateString('ko-KR') : null
}

/**
 * 게스트 계정 관리(ADMIN): 전사 게스트 계정 한 자리.
 *
 * **계정을 만들지 않는다.** 게스트 계정은 사업 담당자가 참가자 명부에서 로그인을 열 때
 * 생기며, ADMIN은 있는 계정을 세우고 재운다 — 게시판·모듈 관리와 같은 자세다.
 *
 * 사업 축과 계정 축을 가르는 것이 이 화면의 요지다. 담당자는 **자기 사업의 문**을 여닫고
 * (명부의 로그인 차단), ADMIN은 **계정 자체**를 멈춘다. 한 게스트가 세 사업에 걸려 있으면
 * 어느 사업 담당자도 그 사람을 전부 멈출 수 없었고, 그 일을 할 자리가 지금까지 없었다.
 *
 * 그래서 정지는 사업별 상태를 건드리지 않는다 — 풀면 원래 열려 있던 사업이 그대로 열린다.
 * 삭제는 두지 않는다(명부 행·초대 레코드가 이 계정을 가리키고 있어, 지우면 그 기록들이
 * 누구 것인지 답할 수 없게 된다). 되돌릴 수 있는 정지 하나로 충분하다.
 *
 * 근거 기획: docs/docs_planning/3_2_workspace_admin.md §1.8
 */
export function GuestAccountPanel() {
  const toast = useToast()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  /** 참여 사업 목록을 펼쳐 보는 계정. */
  const [detail, setDetail] = useState<GuestAccount | null>(null)
  /** 정지하려는 계정(사유 입력). 해제는 사유를 묻지 않는다. */
  const [suspending, setSuspending] = useState<GuestAccount | null>(null)
  const [reason, setReason] = useState('')

  const { data, isLoading, error } = useGuestAccounts(keyword, page)
  const setActive = useSetGuestAccountActive()

  // 검색어가 바뀌면 첫 페이지로 되돌린다(빈 페이지 방지).
  useEffect(() => {
    setPage(0)
  }, [keyword])

  const submitSuspend = async () => {
    if (!suspending) return
    if (!reason.trim()) {
      toast.show('정지 사유를 입력하세요.', 'warning')
      return
    }
    try {
      await setActive.mutateAsync({ userId: suspending.user_id, active: false, reason })
      toast.show(`${suspending.name} 계정을 정지했습니다.`, 'success')
      setSuspending(null)
      setReason('')
    } catch {
      toast.show('정지에 실패했습니다. 관리자 권한을 확인하세요.', 'danger')
    }
  }

  const restore = async (a: GuestAccount) => {
    try {
      await setActive.mutateAsync({ userId: a.user_id, active: true })
      toast.show(`${a.name} 계정을 다시 열었습니다.`, 'success')
    } catch {
      toast.show('해제에 실패했습니다. 관리자 권한을 확인하세요.', 'danger')
    }
  }

  const columns: Column<GuestAccount>[] = [
    { key: 'name', header: '이름', type: 'name', render: (r) => r.name },
    {
      key: 'user_type',
      header: '유형',
      type: 'badge',
      render: (r) => <Badge tone="info">{GUEST_TYPE_LABEL[r.user_type] ?? r.user_type}</Badge>,
    },
    { key: 'company', header: '소속 기업', type: 'text', render: (r) => r.company_name || DASH },
    { key: 'email', header: '이메일(로그인 ID)', type: 'long', render: (r) => r.email || DASH },
    {
      key: 'programs',
      header: '참여 사업',
      type: 'count',
      // 건수만으로는 어느 사업인지 답하지 못하므로 눌러서 펼친다. 0건이면 펼칠 것이 없다.
      render: (r) =>
        r.program_count ? (
          <Button variant="ghost" onClick={() => setDetail(r)}>
            {r.open_count}/{r.program_count}
          </Button>
        ) : (
          DASH
        ),
    },
    {
      key: 'last_login',
      header: '최근 접속',
      type: 'date',
      render: (r) => fmtDate(r.last_login_at) ?? DASH,
    },
    {
      key: 'state',
      header: '계정 상태',
      type: 'badge',
      render: (r) =>
        r.is_active ? <Badge tone="success">사용</Badge> : <Badge tone="danger">정지</Badge>,
    },
    {
      key: '_action',
      header: '',
      align: 'right',
      render: (r) =>
        r.is_active ? (
          <Button variant="ghost" onClick={() => setSuspending(r)}>
            정지
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => void restore(r)}>
            정지 해제
          </Button>
        ),
    },
  ]

  if (isLoading) return <Spinner />
  if (error) {
    return (
      <p className="text-body text-danger">
        게스트 계정 목록을 불러오지 못했습니다. 시스템 관리자 권한이 필요합니다.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <Input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="이름 또는 이메일로 검색"
        className="max-w-sm"
      />

      <DataTable
        columns={columns}
        rows={data?.rows ?? []}
        rowKey={(r) => r.user_id}
        standardColumns={false}
        selectable={false}
        pagination={{
          page,
          pageSize: GUEST_PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: setPage,
        }}
        emptyText="발급된 게스트 계정이 없습니다."
      />

      {/* 참여 사업 펼쳐 보기 — 읽기만 하므로 바깥을 눌러 닫을 수 있다. */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.name} — 참여 사업` : ''}
        help="사업별 로그인 개방은 그 사업 담당자가 참가자 명부에서 여닫습니다. 이 화면의 계정 정지는 사업과 무관하게 계정 전체를 멈춥니다."
        size="lg"
      >
        <ul className="space-y-2">
          {(detail?.programs ?? []).map((p) => (
            <li
              key={`${p.entity_key}:${p.program_id}`}
              className="flex items-center justify-between gap-3 rounded border border-gray-200 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="text-caption text-gray-500">
                  {WORKSPACE_LABEL[p.workspace] ?? p.workspace}
                  {p.code ? ` · ${p.code}` : ''}
                </span>
                <span className="block truncate text-body text-gray-800">{p.title ?? '(삭제된 사업)'}</span>
              </span>
              <Badge tone={LOGIN_STATUS[p.login_status].tone}>{LOGIN_STATUS[p.login_status].label}</Badge>
            </li>
          ))}
        </ul>
      </Modal>

      {/* 정지 — 쓰던 사유가 클릭 한 번에 사라지지 않도록 바깥 클릭으로 닫지 않는다. */}
      <Modal
        open={Boolean(suspending)}
        onClose={() => {
          setSuspending(null)
          setReason('')
        }}
        title="게스트 계정 정지"
        dismissible={false}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setSuspending(null)
                setReason('')
              }}
            >
              취소
            </Button>
            <Button variant="danger" onClick={() => void submitSuspend()} disabled={setActive.isPending}>
              정지
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {/* 파급 효과 고지는 접지 않는다(안내 문구 규칙의 예외). */}
          <p className="text-body text-gray-700">
            <b>{suspending?.name}</b> 계정이 참여 중인 사업 {suspending?.program_count ?? 0}건에서 동시에
            멈춥니다. 접속 중인 세션도 즉시 끊깁니다. 사업별 개방 상태는 그대로 두므로, 정지를 풀면
            원래 열려 있던 사업이 그대로 열립니다.
          </p>
          <TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="정지 사유 (감사 로그에 남습니다)"
            rows={3}
          />
        </div>
      </Modal>
    </div>
  )
}
