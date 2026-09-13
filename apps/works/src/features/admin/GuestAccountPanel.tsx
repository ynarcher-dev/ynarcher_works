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
  Tabs,
  usePaged,
  TextArea,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ListActions } from '@/components/ListActions'
import {
  GUEST_PAGE_SIZE,
  useGuestAccounts,
  useHardDeleteGuestAccounts,
  useSetGuestAccountsActive,
  type GuestAccount,
  type GuestAccountProgram,
  type GuestAccountFacet,
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
import type { GuestEntityKey } from '@/features/guest/host'
import { guestDoorBadge } from '@/features/program/guestDoorBadge'
import { PERSONA_LABEL, type MasterTable } from '@/features/program/participantPersona'
import type { AuthUser } from '@/auth/types'
import { GuestAccountCreateModal } from '@/features/guest/GuestAccountCreateModal'

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

/** 목록의 여섯 분류. 첫 다섯 탭 어디에도 들지 않는 계정은 `미연결`에서 다시 찾는다. */
const GUEST_ACCOUNT_TABS: { key: GuestAccountFacet; label: string }[] = [
  { key: 'startups', label: PERSONA_LABEL.startups },
  { key: 'networks', label: PERSONA_LABEL.networks },
  { key: 'ma_buyers', label: PERSONA_LABEL.ma_buyers },
  { key: 'ma_sellers', label: PERSONA_LABEL.ma_sellers },
  { key: 'fund', label: 'FUND' },
  { key: 'unlinked', label: '미연결' },
]

/** ISO → `YYYY-MM-DD`. 표의 날짜는 자릿수가 맞아야 세로로 견줘진다. */
function day(v: string | null): string | null {
  return v ? String(v).slice(0, 10) : null
}

/**
 * 게스트 계정 관리: 전사 게스트 계정 한 자리.
 *
 * 2026-09-12부터 워크스페이스별 복제 화면을 없애고 전사 `GUEST` 페이지 한 곳에서 쓴다.
 * `entityKey`·`masterTables`는 조회 범위를 좁힐 필요가 있는 임베드 화면을 위한 선택 인자이고,
 * 연락처와 M&A 정보의 노출 범위는 서버(`guest_accounts_list`)의 RLS가 정한다.
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
 * 로그인 아이디·연락처를 고치고 비밀번호를 초기화한다(사용자 확정). 두 창구 모두 값을
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
  entityKey,
  masterTables,
}: {
  canAdminister?: boolean
  user: AuthUser | null
  /**
   * 참여 사업 칸이 볼 범위. 주지 않으면 전 워크스페이스다.
   * 통합 화면에서는 주지 않아 전 워크스페이스를 함께 본다.
   */
  entityKey?: GuestEntityKey
  /**
   * 목록에 설 계정을 **인격의 출처 원장**으로 좁힌다(2026-09-08). 주지 않으면 전부(ADMIN).
   *
   * `entityKey`와 다른 축이다 — 저쪽은 참여 사업 칸이 무엇을 세는가이고 이쪽은 어느 계정이
   * 서는가다. 창구마다 발급하는 원장이 다르므로, 남의 원장 인격이 여기 서면 참여 사업 칸이
   * 비어 있어도 "그 사람 계정이 있다"가 드러난다.
   */
  masterTables?: readonly MasterTable[]
}) {
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  /** 목록 분류는 한 계정의 다중 소속을 허용한다. 같은 계정이 여러 탭에 각각 설 수 있다. */
  const [facet, setFacet] = useState<GuestAccountFacet>('startups')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  /**
   * 상세를 펼쳐 보는 계정. 어느 탭에서 열어도 그 계정의 참여 사업 전체를 보여 준다.
   *
   * 여기 담기는 것은 **누른 순간의 사본**이고, 아래에서 지금 목록의 같은 계정으로 다시
   * 찾아 쓴다 — 상세를 열어 둔 채 연락처를 고치면 조회가 새로 돌아오는데, 사본을 그대로
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
  /** ADMIN 전용 두 창구 — 연락처 수정과 비밀번호 초기화. 상세 안에서만 연다. */
  const [editing, setEditing] = useState(false)
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
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

  const { data, isLoading, error } = useGuestAccounts(
    keyword,
    page,
    entityKey,
    masterTables,
    false,
    facet,
  )
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
  /** ADMIN 창구 둘(연락처 수정·비밀번호 초기화)이 설 수 있는가. 판정은 한곳이 소유한다. */
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
  const detailScope = guestDetailScope(detail, null)
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
  }, [keyword, facet])

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
   * 연락처 수정 창을 연다. **두 칸 모두 현재 값으로 채운다** — 서버가 "빈 값 = 유지"를
   * 받지 않기 때문이고(지우려는 요청과 구분할 수 없다), 담당자가 바꿀 칸만 고치면 나머지는
   * 그대로 되돌아간다.
   *
   * 원본 연락처가 오는 것은 ADMIN뿐이다(그 밖에는 서버가 마스킹해 내려준다). 이 창구도
   * ADMIN에게만 서므로 마스킹된 값이 입력칸에 담길 자리가 없다.
   */
  const openEdit = () => {
    if (!detail) return
    setEditEmail(detail.email ?? '')
    setEditPhone(detail.phone ?? '')
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
    email: editEmail,
    phone: editPhone,
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
        email: editEmail,
        phone: editPhone,
        reason: editReason,
      })
      // 목록에서 사라져도(검색어가 옛 이메일에 걸려 있던 경우) 상세가 옛 값으로 남지 않게,
      // 서버가 확인해 준 값을 사본에도 적는다. 실패는 이 줄에 닿지 않고 아무것도 쓰지 않은
      // 재전송은 사본을 그대로 둔다 — 저장되지 않은 입력이 화면에 서지 않는다.
      setDetailSnapshot((prev) => applyGuestContactUpdate(prev, result))
      // 표기만 다른 재전송은 서버가 아무 일도 하지 않고 `changed: false`로 답한다. 그때
      // "수정했습니다"라고 적으면 세션이 끊겼다는 잘못된 사실까지 함께 전한다.
      if (result.changed) {
        toast.show('연락처를 수정했습니다. 이 계정의 기존 세션은 모두 끊겼습니다.', 'success')
      } else {
        toast.show('바뀐 값이 없어 아무것도 수정하지 않았습니다.', 'info')
      }
      setEditing(false)
      setEditReason('')
      setEditSubmitted(false)
    } catch (error: unknown) {
      // 막힌 이유는 창을 닫지 않고 그 자리에 세운다 — 토스트로 흘려보내면 고쳐야 할 칸을
      // 보면서 읽을 수 없다(중복 이메일의 소유자 이름이 그 답이다).
      setEditError(guestAdminErrorMessage(error, '연락처를 수정하지 못했습니다.'))
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
    if (!resetReason.trim() || adminActions.resetBlocked) return
    setResetError(null)
    try {
      const result = await resetPassword.mutateAsync({
        userId: detail.user_id,
        reason: resetReason,
      })
      // 이미 목록에서 빠진 계정(앞선 이메일 수정 등)을 초기화한 경우에도 상세가 계속
      // "본인 설정 완료"로 답하지 않게, 확인된 결과를 사본에 적는다.
      setDetailSnapshot((prev) => applyGuestPasswordReset(prev, result))
      // 초기 비밀번호 값을 적지 않는다 — 담당자는 그 계정의 연락처를 이미 보고 있고,
      // 토스트에 자격증명을 세우면 화면 녹화·캡처에 그대로 남는다.
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

  // 체크박스 다음 번호는 현재 페이지의 배열 순번이 아니라 전체 목록 기준으로 이어진다.
  const rowNumbers = new Map(
    rows.map((account, index) => [account.user_id, page * GUEST_PAGE_SIZE + index + 1]),
  )

  const columns: Column<GuestAccount>[] = [
    {
      key: 'no',
      header: 'No.',
      type: 'count',
      render: (r) => rowNumbers.get(r.user_id) ?? DASH,
    },
    { key: 'name', header: '이름', type: 'name', render: (r) => r.name },
    { key: 'email', header: '이메일(로그인 ID)', type: 'long', render: (r) => r.email || DASH },
    // 연락처는 서버가 내려준 값을 그대로 적는다 — ADMIN이 아니면 이미 마스킹되어 온다.
    { key: 'phone', header: '연락처', type: 'phone', render: (r) => r.phone || DASH },
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
              // 워크스페이스가 하나로 좁혀진 자리에서는 되풀이하지 않는다.
              kind: entityKey ? null : (WORKSPACE_LABEL[p.workspace] ?? p.workspace),
              to: p.title ? `${PROGRAM_PATH[p.entity_key]}/${p.program_id}` : null,
              title: p.title ? undefined : '원장에서 삭제되었거나 볼 권한이 없는 항목입니다.',
            },
          ]}
        />
      ),
    },
    { key: 'code', header: '코드', type: 'code', render: (p) => p.code || DASH },
    {
      key: 'persona',
      header: '자격',
      type: 'text',
      render: (p) => (p.master_table ? PERSONA_LABEL[p.master_table] : DASH),
    },
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
      <Tabs
        items={GUEST_ACCOUNT_TABS}
        value={facet}
        onChange={(key) => setFacet(key as GuestAccountFacet)}
      />

      <ListToolbar
        keyword={keyword}
        onKeywordChange={setKeyword}
        searchPlaceholder="이름·이메일·연락처 검색"
        actions={
          <ListActions
            onBulk={() => navigate('/guest-accounts/bulk', { state: location.state })}
            createLabel="GUEST 계정 생성"
            onCreate={() => setCreating(true)}
          />
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
            ? '프로젝트/FUND별 로그인 개방과 기간은 해당 담당자가 참가자 명부에서 정합니다. 이 화면에서는 계정을 조회하고 연락처를 수정하거나 비밀번호를 초기화하며 정지·해제·삭제할 수 있습니다.'
            : '프로젝트/FUND별 로그인 개방과 기간은 해당 담당자가 참가자 명부에서 정합니다. 이 화면에서는 계정을 생성하고 조회합니다. 연락처 수정과 비밀번호 초기화는 시스템 관리자만 할 수 있습니다.'
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
                연락처 수정
              </Button>
              <Button
                variant="outline-danger"
                onClick={openReset}
                disabled={!adminActions.canResetPassword}
                title={adminActions.resetBlocked ?? undefined}
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
              <InfoField label="연락처" value={detail.phone} valueClassName="truncate" />
              <InfoField label="소속 기업" value={detail.company_name} valueClassName="truncate" />
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
                value={detail.has_password ? '본인 설정 완료' : '초기 비밀번호(연락처)'}
              />
              <InfoField label="최근 접속" value={day(detail.last_login_at)} meta />
            </InfoGrid>

            {/* 막힌 이유는 접지 않는다 — 버튼이 왜 눌리지 않는지는 호버해야 보이는 문구로
                답할 수 없다(Field.hintInline과 같은 기준). */}
            {adminActions.resetBlocked && (
              <Banner tone="warning">{adminActions.resetBlocked}</Banner>
            )}

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
                rowKey={(p) => `${p.entity_key}:${p.program_id}:${p.master_table ?? '-'}`}
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

      {/* 연락처 수정 — 상세 위에 겹쳐 선다. 쓰던 사유가 사라지지 않도록 바깥 클릭으로
          닫지 않고, 도는 동안에는 닫는 길도 막는다(취소 버튼까지). */}
      <Modal
        open={editing && adminActions.visible}
        onClose={closeEdit}
        title="GUEST 연락처 수정"
        help="이메일은 로그인 ID이고 연락처는 개시 상태의 초기 비밀번호입니다. 둘 중 하나라도 바뀌면 이 계정의 기존 세션이 즉시 끊깁니다."
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
            <b>이메일이 로그인 ID입니다</b> — 바꾸면 그 계정은 새 이메일로만 들어옵니다.
            원장(스타트업·네트워크·M&A)의 연락처는 그대로 두므로, 원장 값까지 고쳐야 하면 그
            원장에서 따로 수정하십시오. 연락처만 바꾸는 경우 본인이 이미 정한 비밀번호는 그대로
            유지됩니다. 어느 쪽이든 이 계정의 기존 세션은 즉시 끊깁니다. 정지 여부는 달라지지
            않습니다.
          </Banner>
          {editError && <Banner tone="danger">{editError}</Banner>}
          <div className="grid gap-3 sm:grid-cols-2">
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
              label="연락처"
              required
              hint="숫자 9~15자리. 개인 비밀번호를 정하기 전에는 이 값(숫자만)이 초기 비밀번호입니다."
              error={editSubmitted ? editErrors.phone : undefined}
            >
              <Input value={editPhone} onChange={(event) => setEditPhone(event.target.value)} />
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
              disabled={resetPassword.isPending || Boolean(adminActions.resetBlocked)}
            >
              {resetPassword.isPending ? '초기화 중…' : '초기화'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Banner tone="warning">{GUEST_PASSWORD_RESET_CONFIRM}</Banner>
          <Banner tone="info">
            다음 로그인에서 본인이 <b>개인 비밀번호를 정한 뒤에야</b> 화면에 들어갑니다.
            초기화하는 즉시 이 계정의 기존 세션과 살아 있던 재설정 링크가 모두 끊기며, 계정
            정지 여부와 프로젝트/FUND별 로그인 개방은 달라지지 않습니다. 안내는 발송하지 않고 비밀번호도
            화면에 표시하지 않으니, 담당자가 직접 전달하십시오.
          </Banner>
          {adminActions.resetBlocked && (
            <Banner tone="danger">{adminActions.resetBlocked}</Banner>
          )}
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
            선택한 <b>{selectedAccounts.length}건</b>의 계정과 로그인 자격·원장 인격 연결·프로젝트/FUND
            접근 연결을 완전히 삭제합니다. 업무 기록은 보존하되 작성자 참조는 익명화되며 이
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
