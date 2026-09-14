import {
  Badge,
  Banner,
  Button,
  CardHeading,
  DataTable,
  EmptyValue,
  Field,
  InfoField,
  InfoGrid,
  Input,
  ListToolbar,
  Modal,
  RefLinkList,
  Spinner,
  usePaged,
  TextArea,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import { GUEST_APP_URL, openGuestApp } from '@/config/guestApp'
import {
  GUEST_PAGE_SIZE,
  useGuestAccounts,
  useHardDeleteGuestAccounts,
  useSetGuestAccountsActive,
  type GuestAccount,
  type GuestAccountProgram,
} from '@/features/admin/guestAccountHooks'
import {
  GUEST_PASSWORD_RESET_CONFIRM,
  applyGuestContactUpdate,
  applyGuestPasswordReset,
  guestAdminActionState,
  guestAdminErrorMessage,
  hasGuestContactError,
  resolveGuestDetail,
  useResetGuestPassword,
  useUpdateGuestContact,
  validateGuestContact,
} from '@/features/admin/guestContactHooks'
import {
  guestDetailScope,
  guestDoorInput,
  guestOpenProgramCount,
} from '@/features/admin/guestParticipation'
import { guestDoorBadge } from '@/features/program/guestDoorBadge'
import type { AuthUser } from '@/auth/types'
import { GuestAccountCreateModal } from '@/features/guest/GuestAccountCreateModal'
import { GUEST_INITIAL_PASSWORD } from '@/features/guest/guestAccountService'

const DASH = <EmptyValue />

/** 워크스페이스 표기 — 사업 원장이 둘이라 어느 쪽 사업인지 함께 밝힌다. */
const WORKSPACE_LABEL: Record<string, string> = { project: '프로젝트', mna: 'M&A', fund: '조합' }

/** 사업 상세로 가는 길. 값을 복제하지 않고 원장을 가리킨다(명부와 같은 규약). */
const PROGRAM_PATH: Record<GuestAccountProgram['entity_key'], string> = {
  program: '/project',
  ma_program: '/mna/deals',
  fund: '/fund',
}

/** 상세 모달의 참여 사업 표 한 장. 모달 안이라 화면 목록(30)보다 짧게 끊는다. */
const PROGRAM_PAGE_SIZE = 5

/** ISO → `YYYY-MM-DD`. 표의 날짜는 자릿수가 맞아야 세로로 견줘진다. */
function day(v: string | null): string | null {
  return v ? String(v).slice(0, 10) : null
}

/**
 * 게스트 계정 관리: 전사 게스트 계정 한 자리.
 *
 * 전사 `GUEST` 페이지 한 곳에서 독립 계정을 관리한다. 계정을 원장별로 분류하지 않는다.
 *
 * 축이 셋이다(3_9_1 §3).
 *   · **계정**은 사람 하나다. 생성·조회는 내부 사용자 전원, 정지·해제·하드 삭제는 ADMIN.
 *   · **문**은 그 사업 담당자가 참가자 명부에서 여닫는다.
 *   · **열쇠**(비밀번호)는 본인만 쥔다.
 *
 * **여기는 발급된 계정을 들여다보는 자리다.** 그래서 답해야 하는 물음은 "이 계정이 어느 사업에
 * 걸려 있고 사업마다 언제까지 들어올 수 있는가"이며, 행을 누르면 그 답이 통째로 선다
 * (2026-09-07). 종전에는 참여 사업 **건수 칸만** 눌렸는데, 눌리는 자리가 셀 하나면 무엇을
 * 눌러야 하는지를 화면이 말하지 못한다 — 행이 곧 계정이므로 행 전체가 상세를 연다.
 *
 * **비밀번호 재설정 안내는 여전히 두지 않는다**(2026-09-07). 안내는 사업별로 나가고, 계정
 * 목록은 어느 사업의 맥락도 갖지 않아 여기서 보내면 받는 사람이 무슨 건으로 온 안내인지
 * 모른다. 그것과 **초기화 자체는 다른 축이다** — 2026-09-13부터 계정 상세에서 ADMIN이
 * 이름·로그인 아이디·소속을 고치고 비밀번호를 초기화한다. 두 창구 모두 값을
 * 화면에 세우지 않고 아무것도 발송하지 않는다 — 자격증명은 오프라인으로 전한다(3_9_1 §6.2).
 *
 * 정지는 사업별 상태를 건드리지 않는다 — 풀면 원래 열려 있던 사업이 그대로 열린다.
 * 하드 삭제는 ADMIN만 쓴다. 계정 접근자료는 지우되 업무 기록은 삭제하지 않고 사용자 참조만
 * 익명화하며, 익명화할 수 없는 필수 업무 참조가 하나라도 있으면 서버가 삭제를 거부한다.
 *
 * 근거 기획: docs/docs_planning/3_9_1_guest_unified_account.md §9·§11
 */
export function GuestAccountPanel({
  canAdminister = false,
  user,
}: {
  canAdminister?: boolean
  user: AuthUser | null
}) {
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  /**
   * 상세를 펼쳐 보는 계정. 어느 탭에서 열어도 그 계정의 참여 사업 전체를 보여 준다.
   *
   * 여기 담기는 것은 **누른 순간의 사본**이고, 아래에서 지금 목록의 같은 계정으로 다시
   * 찾아 쓴다 — 상세를 열어 둔 채 프로필을 고치면 조회가 새로 돌아오는데, 사본을 그대로
   * 그리면 방금 고친 값이 상세에는 옛 값으로 남아 담당자가 수정이 안 된 줄로 읽는다.
   * 사본을 버리지 않는 이유는 목록에서 사라진 계정(검색어 변경 등)까지 창을 닫히게 하지
   * 않기 위해서다.
   *
   * 그래서 **성공한 변경은 사본에도 함께 적는다**(`applyGuestContactUpdate`·
   * `applyGuestPasswordReset`). 검색어가 옛 이메일에 걸려 있었다면 이메일을 고친 순간 그
   * 계정은 새 목록에서 빠지므로, 사본을 그대로 두면 목록이 답해 줄 자리가 없어져 상세가
   * 영구히 옛 값으로 남는다.
  */
  const [detailSnapshot, setDetailSnapshot] = useState<GuestAccount | null>(null)
  /** ADMIN 전용 두 창구 — 계정 정보 수정과 비밀번호 초기화. 상세 안에서만 연다. */
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editAffiliation, setEditAffiliation] = useState('')
  const [editReason, setEditReason] = useState('')
  /** 검증 문구는 한 번 보낸 뒤에 세운다 — 입력을 시작하기도 전에 붉은 줄부터 뜨지 않게. */
  const [editSubmitted, setEditSubmitted] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetReason, setResetReason] = useState('')
  const [resetSubmitted, setResetSubmitted] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  /** 관리자 목록 체크 선택. 상태 변경·삭제는 행 버튼 없이 이 집합에만 적용한다. */
  const [selected, setSelected] = useState<string[]>([])
  const [suspending, setSuspending] = useState(false)
  const [reason, setReason] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')

  const { data, isLoading, error } = useGuestAccounts(keyword, page)
  const setActive = useSetGuestAccountsActive()
  const hardDelete = useHardDeleteGuestAccounts()
  const updateContact = useUpdateGuestContact()
  const resetPassword = useResetGuestPassword()
  const rows = data?.rows ?? []
  /**
   * 지금 그릴 상세. 목록에 같은 계정이 서 있으면 **조회가 답한 값**이 이기고, 없으면
   * 사본으로 버틴다(위 `detailSnapshot` 주석).
   */
  const detail = resolveGuestDetail(detailSnapshot, rows)
  /** ADMIN 창구 둘(계정 정보 수정·비밀번호 초기화)이 설 수 있는가. 판정은 한곳이 소유한다. */
  const adminActions = guestAdminActionState({
    canAdminister,
    account: detail,
    pending: updateContact.isPending || resetPassword.isPending,
  })
  const selectedAccounts = rows.filter((account) => selected.includes(account.user_id))
  const activeIds = selectedAccounts.filter((account) => account.is_active).map((a) => a.user_id)
  const inactiveIds = selectedAccounts
    .filter((account) => !account.is_active)
    .map((account) => account.user_id)

  /**
   * 상세의 참여 사업 페이징. 계정 하나가 걸리는 사업은 대개 한둘이지만 해를 넘겨 쌓이면
   * 모달이 세로로 길어져 아래쪽이 화면 밖으로 나간다 — 표가 자라도 모달 높이는 그대로여야 한다.
   * 서버를 다시 부르지 않는 이유는 목록이 이미 계정 행에 통째로 실려 와 있기 때문이다.
   */
  const detailScope = guestDetailScope(detail)
  const detailPrograms = detailScope.programs
  const paged = usePaged(detailPrograms, PROGRAM_PAGE_SIZE)
  const setProgramPage = paged.setPage

  // 다른 계정을 열면 첫 장부터 본다. 클램프만으로는 3장짜리 계정을 열 때 2장에서 시작한다.
  useEffect(() => {
    setProgramPage(0)
  }, [detail?.user_id, setProgramPage])

  // 검색어·필터가 바뀌면 첫 페이지로 되돌린다(빈 페이지 방지).
  useEffect(() => {
    setPage(0)
    setSelected([])
  }, [keyword])

  const submitSuspend = async () => {
    if (!suspending || activeIds.length === 0) return
    if (!reason.trim()) {
      toast.show('정지 사유를 입력하세요.', 'warning')
      return
    }
    try {
      const count = await setActive.mutateAsync({ userIds: activeIds, active: false, reason })
      toast.show(`${count}건의 GUEST 계정을 정지했습니다.`, 'success')
      setSuspending(false)
      setReason('')
      setSelected([])
    } catch {
      toast.show('정지에 실패했습니다. 관리자 권한을 확인하세요.', 'danger')
    }
  }

  const restore = async () => {
    if (inactiveIds.length === 0) return
    try {
      const count = await setActive.mutateAsync({ userIds: inactiveIds, active: true })
      toast.show(`${count}건의 GUEST 계정 정지를 해제했습니다.`, 'success')
      setSelected([])
    } catch {
      toast.show('해제에 실패했습니다. 관리자 권한을 확인하세요.', 'danger')
    }
  }

  const closeDelete = () => {
    if (hardDelete.isPending) return
    setDeleting(false)
    setDeleteReason('')
    setDeleteConfirm('')
  }

  const submitDelete = async () => {
    if (!deleting || selectedAccounts.length === 0) return
    const confirmText = `GUEST ${selectedAccounts.length}건 영구 삭제`
    if (deleteConfirm.trim() !== confirmText) {
      toast.show(`확인 문구 “${confirmText}”를 정확히 입력하세요.`, 'warning')
      return
    }
    if (!deleteReason.trim()) {
      toast.show('삭제 사유를 입력하세요.', 'warning')
      return
    }
    try {
      const deletedIds = selectedAccounts.map((account) => account.user_id)
      const count = await hardDelete.mutateAsync({ userIds: deletedIds, reason: deleteReason })
      toast.show(`${count}건의 GUEST 계정을 완전히 삭제했습니다.`, 'success')
      if (detail && deletedIds.includes(detail.user_id)) {
        setDetailSnapshot(null)
      }
      setSelected([])
      closeDelete()
    } catch (error: unknown) {
      toast.show(
        (error as { message?: string }).message ?? '계정을 삭제하지 못했습니다.',
        'danger',
      )
    }
  }

  /**
   * 계정 정보 수정 창을 연다. **세 칸 모두 현재 값으로 채운다** — 서버가 "빈 값 = 유지"를
   * 받지 않기 때문이고(지우려는 요청과 구분할 수 없다), 담당자가 바꿀 칸만 고치면 나머지는
   * 그대로 되돌아간다.
   *
   */
  const openEdit = () => {
    if (!detail) return
    setEditName(detail.name)
    setEditEmail(detail.email ?? '')
    setEditAffiliation(detail.affiliation ?? '')
    setEditReason('')
    setEditSubmitted(false)
    setEditError(null)
    setEditing(true)
  }

  const closeEdit = () => {
    if (updateContact.isPending) return
    setEditing(false)
    setEditReason('')
    setEditSubmitted(false)
    setEditError(null)
  }

  const editErrors = validateGuestContact({
    name: editName,
    email: editEmail,
    affiliation: editAffiliation,
    reason: editReason,
  })

  const submitEdit = async () => {
    if (!detail || updateContact.isPending) return
    setEditSubmitted(true)
    if (hasGuestContactError(editErrors)) return
    setEditError(null)
    try {
      const result = await updateContact.mutateAsync({
        userId: detail.user_id,
        name: editName,
        email: editEmail,
        affiliation: editAffiliation,
        reason: editReason,
      })
      // 목록에서 사라져도(검색어가 옛 이메일에 걸려 있던 경우) 상세가 옛 값으로 남지 않게,
      // 서버가 확인해 준 값을 사본에도 적는다. 실패는 이 줄에 닿지 않고 아무것도 쓰지 않은
      // 재전송은 사본을 그대로 둔다 — 저장되지 않은 입력이 화면에 서지 않는다.
      setDetailSnapshot((prev) => applyGuestContactUpdate(prev, result))
      // 표기만 다른 재전송은 서버가 아무 일도 하지 않고 `changed: false`로 답한다. 그때
      // "수정했습니다"라고 적으면 세션이 끊겼다는 잘못된 사실까지 함께 전한다.
      if (result.changed) {
        // 세션이 끊겼다는 말은 로그인 ID인 이메일이 실제로 바뀌었을 때만 한다.
        toast.show(
          result.email_changed
            ? '계정 정보를 수정했습니다. 이 계정의 기존 세션은 모두 끊겼습니다.'
            : '계정 정보를 수정했습니다.',
          'success',
        )
      } else {
        toast.show('바뀐 값이 없어 아무것도 수정하지 않았습니다.', 'info')
      }
      setEditing(false)
      setEditReason('')
      setEditSubmitted(false)
    } catch (error: unknown) {
      // 막힌 이유는 창을 닫지 않고 그 자리에 세운다 — 토스트로 흘려보내면 고쳐야 할 칸을
      // 보면서 읽을 수 없다(중복 이메일의 소유자 이름이 그 답이다).
      setEditError(guestAdminErrorMessage(error, '계정 정보를 수정하지 못했습니다.'))
    }
  }

  const openReset = () => {
    if (!detail) return
    setResetReason('')
    setResetSubmitted(false)
    setResetError(null)
    setResetting(true)
  }

  const closeReset = () => {
    if (resetPassword.isPending) return
    setResetting(false)
    setResetReason('')
    setResetSubmitted(false)
    setResetError(null)
  }

  const submitReset = async () => {
    if (!detail || resetPassword.isPending) return
    setResetSubmitted(true)
    if (!resetReason.trim()) return
    setResetError(null)
    try {
      const result = await resetPassword.mutateAsync({
        userId: detail.user_id,
        reason: resetReason,
      })
      // 이미 목록에서 빠진 계정(앞선 이메일 수정 등)을 초기화한 경우에도 상세가 계속
      // "본인 설정 완료"로 답하지 않게, 확인된 결과를 사본에 적는다.
      setDetailSnapshot((prev) => applyGuestPasswordReset(prev, result))
      // 최초 비밀번호 값을 토스트에 적지 않는다 — 값은 상세와 안내 문구가 이미 답하고,
      // 흘러가는 알림에 자격증명을 세우면 화면 녹화·캡처에 그대로 남는다.
      toast.show(
        '비밀번호를 초기화했습니다. 기존 세션이 끊겼고 다음 로그인에서 본인이 새 비밀번호를 정합니다.',
        'success',
      )
      setResetting(false)
      setResetReason('')
      setResetSubmitted(false)
    } catch (error: unknown) {
      setResetError(guestAdminErrorMessage(error, '비밀번호를 초기화하지 못했습니다.'))
    }
  }

  const columns: Column<GuestAccount>[] = [
    { key: 'name', header: '이름', type: 'name', render: (r) => r.name },
    // 이름 바로 옆이다 — 동명이인을 가르는 값이라, 이메일 뒤로 밀면 누구인지 확인하는 데
    // 눈이 표를 두 번 건너야 한다.
    { key: 'affiliation', header: '소속', type: 'long', render: (r) => r.affiliation || DASH },
    { key: 'email', header: '이메일(로그인 ID)', type: 'long', render: (r) => r.email || DASH },
    {
      // 지금 실제로 들어올 수 있는 사업 수 / 걸려 있는 사업 수. 앞의 수는 개방 상태만이 아니라
      // 사업 상태·기간까지 함께 본 결론이라, 명부의 로그인 상태 열과 같은 답을 한다.
      key: 'open',
      header: '로그인 가능',
      type: 'count',
      render: (r) => {
        if (!r.program_count) return DASH
        // 분자는 정지까지 함께 본 결론이고 분모는 걸려 있는 사업 수 그대로다. 판정은
        // `guestParticipation.ts`가 소유한다.
        return `${guestOpenProgramCount(r)}/${r.program_count}`
      },
    },
    {
      key: 'last_login',
      header: '최근 접속',
      type: 'date',
      render: (r) => day(r.last_login_at) ?? DASH,
    },
    {
      key: 'state',
      header: '계정 상태',
      type: 'badge',
      render: (r) =>
        r.is_active ? <Badge tone="success">사용</Badge> : <Badge tone="danger">정지</Badge>,
    },
  ]

  /** 상세 모달의 참여 프로젝트/FUND 표. 연결 항목마다 문의 결론과 기간을 나란히 세운다. */
  const programColumns: Column<GuestAccountProgram>[] = [
    {
      key: 'title',
      header: '프로젝트/FUND',
      type: 'name',
      render: (p) => (
        <RefLinkList
          as={Link}
          items={[
            {
              key: p.program_id,
              label: p.title ?? '(삭제된 항목)',
              kind: WORKSPACE_LABEL[p.workspace] ?? p.workspace,
              to: p.title ? `${PROGRAM_PATH[p.entity_key]}/${p.program_id}` : null,
              title: p.title ? undefined : '원장에서 삭제되었거나 볼 권한이 없는 항목입니다.',
            },
          ]}
        />
      ),
    },
    { key: 'code', header: '코드', type: 'code', render: (p) => p.code || DASH },
    {
      key: 'door',
      header: '상태',
      type: 'badge',
      render: (p) => {
        const b = guestDoorBadge(guestDoorInput(p))
        return <Badge tone={b.tone}>{b.label}</Badge>
      },
    },
    {
      // 기간은 계정이 아니라 사업이 갖는다 — 같은 사업의 두 줄은 같은 값을 본다(3_9_1 §8).
      key: 'ends',
      header: '로그인 종료',
      type: 'date',
      render: (p) => day(p.access_ends_at) ?? '제한 없음',
    },
  ]

  if (isLoading) return <Spinner />
  if (error) {
    return (
      <Banner tone="danger">
        게스트 계정 목록을 불러오지 못했습니다. 내부 사용자 권한이 필요합니다.
      </Banner>
    )
  }

  return (
    <div className="space-y-4">
      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder="이름·이메일·소속 검색"
        actions={
          <div className="flex items-center gap-2">
            {/*
              게스트가 실제로 보는 화면으로 가는 문. 계정을 만들고 프로필을 고치는 자리에서
              결과를 눈으로 확인하려면 GUEST 앱 주소를 따로 찾아 들어가야 했다. 주소가 설정되지
              않은 환경에서는 서지 않는다 — 없는 화면을 여는 문은 두지 않는다.
            */}
            {GUEST_APP_URL && (
              <Button variant="outline" density="page" onClick={openGuestApp}>
                게스트 페이지 열기
              </Button>
            )}
            <ListActions
              onBulk={() => navigate('/guest-accounts/bulk', { state: location.state })}
              createLabel="GUEST 계정 생성"
              onCreate={() => setCreating(true)}
            />
          </div>
        }
      />

      {canAdminister && selectedAccounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-radius-md border border-brand-200 bg-brand-50 px-3 py-2">
          <span className="text-body font-semibold text-gray-900">
            {selectedAccounts.length}건 선택
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setSuspending(true)}
              disabled={activeIds.length === 0 || setActive.isPending}
            >
              정지{activeIds.length > 0 ? ` (${activeIds.length})` : ''}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void restore()}
              disabled={inactiveIds.length === 0 || setActive.isPending}
            >
              정지 해제{inactiveIds.length > 0 ? ` (${inactiveIds.length})` : ''}
            </Button>
            <Button
              variant="outline-danger"
              onClick={() => setDeleting(true)}
              disabled={hardDelete.isPending}
            >
              영구 삭제
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.user_id}
        standardColumns={false}
        selectable={canAdminister}
        selectedKeys={canAdminister ? selected : undefined}
        onSelectionChange={canAdminister ? setSelected : undefined}
        onRowClick={setDetailSnapshot}
        pagination={{
          page,
          pageSize: GUEST_PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: (nextPage) => {
            setSelected([])
            setPage(nextPage)
          },
        }}
        emptyText="발급된 게스트 계정이 없습니다."
      />

      {/* 어느 탭에서 행을 눌러도 같은 계정 상세를 연다. */}
      <Modal
        open={Boolean(detail)}
        onClose={() => {
          // 두 창구가 도는 동안에는 받침이 되는 상세를 닫지 않는다 — 닫으면 결과를 받을
          // 계정이 화면에서 사라져 성공했는지 막혔는지를 어디에도 적을 수 없다.
          if (updateContact.isPending || resetPassword.isPending) return
          setDetailSnapshot(null)
        }}
        title={detail ? `${detail.name} — 계정 상세` : ''}
        help={
          canAdminister
            ? '프로젝트/FUND별 로그인 개방과 기간은 해당 담당자가 참가자 명부에서 정합니다. 이 화면에서는 계정을 조회하고 계정 정보를 수정하거나 비밀번호를 초기화하며 정지·해제·삭제할 수 있습니다.'
            : '프로젝트/FUND별 로그인 개방과 기간은 해당 담당자가 참가자 명부에서 정합니다. 이 화면에서는 계정을 생성하고 조회합니다. 계정 정보 수정과 비밀번호 초기화는 시스템 관리자만 할 수 있습니다.'
        }
        size="xl"
        footer={
          adminActions.visible ? (
            <>
              <Button
                variant="secondary"
                onClick={openEdit}
                disabled={!adminActions.canEditContact}
              >
                계정 정보 수정
              </Button>
              <Button
                variant="outline-danger"
                onClick={openReset}
                disabled={!adminActions.canResetPassword}
              >
                비밀번호 초기화
              </Button>
            </>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-5">
            <InfoGrid columns={3}>
              <InfoField
                label="이메일(로그인 ID)"
                value={detail.email}
                valueClassName="truncate"
              />
              <InfoField label="소속" value={detail.affiliation} valueClassName="truncate" />
              <InfoField
                label="계정 상태"
                value={
                  detail.is_active ? (
                    <Badge tone="success">사용</Badge>
                  ) : (
                    <Badge tone="danger">정지</Badge>
                  )
                }
              />
              <InfoField
                label="비밀번호"
                value={
                  detail.has_password
                    ? '본인 설정 완료'
                    : `초기 비밀번호(${GUEST_INITIAL_PASSWORD})`
                }
              />
              <InfoField label="최근 접속" value={day(detail.last_login_at)} meta />
            </InfoGrid>

            <div className="space-y-2">
              <CardHeading
                level="subhead"
                count={detailPrograms.length}
                help="닫히거나 끝난 프로젝트/FUND도 지우지 않고 남깁니다 — 지금 어디에 걸려 있는지만이 아니라 그동안 어디에 걸렸었는지가 문의에 답할 근거입니다."
                trailing={
                  detailScope.hidden > 0
                    ? `볼 권한이 없는 항목 ${detailScope.hidden}건 제외`
                    : undefined
                }
              >
                {detailScope.heading}
              </CardHeading>
              {detailScope.note && <p className="text-caption text-gray-600">{detailScope.note}</p>}
              <DataTable
                columns={programColumns}
                rows={paged.pageItems}
                rowKey={(p) => `${p.entity_key}:${p.program_id}`}
                standardColumns={false}
                selectable={false}
                numbered={false}
                pagination={{
                  page: paged.page,
                  pageSize: PROGRAM_PAGE_SIZE,
                  total: detailPrograms.length,
                  onChange: setProgramPage,
                  // 계정을 받치는 보조 목록이라 번호줄이 아니라 화살표 둘이다(한 장뿐이면 사라진다).
                  compact: true,
                }}
                emptyText="아직 어느 프로젝트나 FUND에도 연결되지 않았습니다. 연결은 해당 담당자가 참가자 명부에서 합니다."
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 계정 정보 수정 — 상세 위에 겹쳐 선다. 쓰던 사유가 사라지지 않도록 바깥 클릭으로
          닫지 않고, 도는 동안에는 닫는 길도 막는다(취소 버튼까지). */}
      <Modal
        open={editing && adminActions.visible}
        onClose={closeEdit}
        title="GUEST 계정 정보 수정"
        help="GUEST 프로필은 이름·이메일·소속 세 값입니다. 이메일이 바뀌면 기존 세션이 즉시 끊기고, 이름이나 소속만 바뀌면 세션은 그대로 유지됩니다."
        dismissible={false}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit} disabled={updateContact.isPending}>
              취소
            </Button>
            <Button onClick={() => void submitEdit()} disabled={updateContact.isPending}>
              {updateContact.isPending ? '수정 중…' : '수정'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {/* 파급 효과 고지는 접지 않는다(안내 문구 규칙의 예외). */}
          <Banner tone="warning">
            <b>이메일이 로그인 ID입니다</b> — 바꾸면 그 계정은 새 이메일로만 들어오고 기존
            세션과 살아 있던 재설정 링크가 즉시 끊깁니다. 이름과 소속은 표시 정보이며 원장의
            값과 자동으로 동기화되지 않습니다. 원장 값은 그대로 두므로 원장까지 고쳐야 하면
            해당 원장에서 따로 수정하십시오. 비밀번호와 정지 여부는 달라지지 않습니다.
          </Banner>
          {editError && <Banner tone="danger">{editError}</Banner>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="이름" required error={editSubmitted ? editErrors.name : undefined}>
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
            </Field>
            <Field
              label="이메일(로그인 ID)"
              required
              error={editSubmitted ? editErrors.email : undefined}
            >
              <Input
                type="email"
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
              />
            </Field>
            <Field
              label="소속"
              required
              error={editSubmitted ? editErrors.affiliation : undefined}
            >
              <Input
                value={editAffiliation}
                onChange={(event) => setEditAffiliation(event.target.value)}
              />
            </Field>
          </div>
          <Field label="수정 사유" required error={editSubmitted ? editErrors.reason : undefined}>
            <TextArea
              value={editReason}
              onChange={(event) => setEditReason(event.target.value)}
              placeholder="감사 로그에 변경 전/후와 함께 남습니다"
              rows={3}
            />
          </Field>
        </div>
      </Modal>

      {/* 비밀번호 초기화 — 값을 보여주지도, 안내를 보내지도 않는다. */}
      <Modal
        open={resetting && adminActions.visible}
        onClose={closeReset}
        title="GUEST 비밀번호 초기화"
        dismissible={false}
        footer={
          <>
            <Button variant="secondary" onClick={closeReset} disabled={resetPassword.isPending}>
              취소
            </Button>
            <Button
              variant="danger"
              onClick={() => void submitReset()}
              disabled={resetPassword.isPending}
            >
              {resetPassword.isPending ? '초기화 중…' : '초기화'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Banner tone="warning">{GUEST_PASSWORD_RESET_CONFIRM}</Banner>
          <Banner tone="info">
            초기화하는 즉시 이 계정의 기존 세션과 살아 있던 재설정 링크가 모두 끊기며, 계정
            정지 여부와 프로젝트/FUND별 로그인 개방은 달라지지 않습니다. 최초 비밀번호는 모든
            계정이 같은 고정값이므로, 담당자가 대상에게 직접 전달하십시오.
          </Banner>
          {resetError && <Banner tone="danger">{resetError}</Banner>}
          <Field
            label="초기화 사유"
            required
            error={resetSubmitted && !resetReason.trim() ? '초기화 사유를 입력하세요.' : undefined}
          >
            <TextArea
              value={resetReason}
              onChange={(event) => setResetReason(event.target.value)}
              placeholder="감사 로그에 남을 초기화 사유"
              rows={3}
            />
          </Field>
        </div>
      </Modal>

      <GuestAccountCreateModal open={creating} onClose={() => setCreating(false)} user={user} />

      {/* 정지 — 쓰던 사유가 클릭 한 번에 사라지지 않도록 바깥 클릭으로 닫지 않는다. */}
      <Modal
        open={suspending}
        onClose={() => {
          setSuspending(false)
          setReason('')
        }}
        title="게스트 계정 정지"
        dismissible={false}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setSuspending(false)
                setReason('')
              }}
            >
              취소
            </Button>
            <Button
              variant="danger"
              onClick={() => void submitSuspend()}
              disabled={setActive.isPending}
            >
              정지
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {/* 파급 효과 고지는 접지 않는다(안내 문구 규칙의 예외). */}
          <Banner tone="warning">
            선택한 사용 계정 <b>{activeIds.length}건</b>이 모든 참여 프로젝트/FUND에서 동시에
            멈춥니다. 접속 중인 세션도 즉시 끊깁니다. 항목별 개방 상태는 그대로 두므로, 정지를
            풀면 원래 열려 있던 항목이 그대로 열립니다.
          </Banner>
          <TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="정지 사유 (감사 로그에 남습니다)"
            rows={3}
          />
        </div>
      </Modal>

      <Modal
        open={deleting}
        onClose={closeDelete}
        title="GUEST 계정 영구 삭제"
        dismissible={false}
        footer={
          <>
            <Button variant="secondary" onClick={closeDelete} disabled={hardDelete.isPending}>
              취소
            </Button>
            <Button
              variant="danger"
              onClick={() => void submitDelete()}
              disabled={hardDelete.isPending}
            >
              {hardDelete.isPending ? '삭제 중…' : '영구 삭제'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Banner tone="danger">
            선택한 <b>{selectedAccounts.length}건</b>의 계정과 로그인 자격·프로젝트/FUND 접근
            연결을 완전히 삭제합니다. 업무 기록은 보존하되 작성자 참조는 익명화되며 이
            작업은 되돌릴 수 없습니다. 한 건이라도 삭제할 수 없으면 전체 작업을 취소합니다.
          </Banner>
          <Field label="확인 문구" required hintInline hint={`아래 문구를 그대로 입력하세요: GUEST ${selectedAccounts.length}건 영구 삭제`}>
            <Input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} />
          </Field>
          <Field label="삭제 사유" required>
            <TextArea
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              placeholder="감사 로그에 남을 삭제 사유"
              rows={3}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
