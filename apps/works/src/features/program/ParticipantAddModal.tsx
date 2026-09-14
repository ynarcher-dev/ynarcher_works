import {
  Badge,
  Banner,
  Button,
  DataTable,
  EmptyValue,
  ListToolbar,
  Modal,
  Spinner,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import {
  GUEST_CANDIDATE_PAGE_SIZE,
  useAddGuestAccounts,
  useGuestAccountCandidates,
  useProgramParticipants,
  type GuestAccountCandidate,
} from '@/features/program/participantHooks'
import {
  markAlreadyAdded,
  rosterAccountIds,
  toGuestRosterRows,
  type GuestAccountPickRow,
} from '@/features/program/guestRoster'
import { describeAddReason } from '@/features/program/programGuestAccountService'

/** 실패 사유를 몇 줄까지 펴는가. 넘는 만큼은 건수로 접는다(배너가 표를 덮으면 안 된다). */
const ISSUE_PREVIEW = 5

/** 배너 한 줄이 답해야 하는 것 — 누가, 왜 막혔는가. */
interface AddIssue {
  userId: string
  name: string
  reason: string
}

/**
 * 이 줄을 이번에 고를 수 있는가 — **서버가 실제로 받아 주는 줄만 고를 수 있게 한다.**
 *
 *  · **명부를 모르는 동안에는 아무것도 고를 수 없다**(`rosterKnown`). `이미 담김`은 이 사업의
 *    명부가 답하는 사실이라, 조회 중이거나 조회에 실패한 상태를 빈 명부로 접으면 이미 담긴
 *    계정이 고를 수 있는 줄로 서고 담당자는 같은 계정을 다시 보낸다.
 *  · 이미 담긴 계정은 고를 수 없다.
 *  · **정지된 계정도 고를 수 없다.** 서버 창구(`add_program_guest_accounts`)가 담기 전에
 *    `users.is_active`를 요구하고, 아니면 그 줄만 `ACCOUNT_NOT_AVAILABLE`로 거절한다. 고를 수
 *    있게 두면 담당자는 보내고 난 뒤에야 실패를 본다.
 *
 * 저장 중(`busy`)은 여기서 보지 않는다 — 그때 체크 칸까지 걷으면 지금 무엇을 보내는 중인지가
 * 화면에서 사라진다. 저장 중의 차단은 조작 쪽이 맡는다.
 */
export function canPickAccount(row: GuestAccountPickRow, rosterKnown: boolean): boolean {
  return rosterKnown && !row.alreadyAdded && row.isActive
}

/**
 * `GUEST 계정 추가` — **이미 있는 계정 중 누가 이 사업에 들어오는가**를 체크로 고른다.
 *
 * **여기서 계정을 만들지 않는다**(2026-09-13 사용자 확정). 이 창은 고르기만 하고, 하는 일은
 * 담기 하나뿐이다 — 빼기는 명부 표의 `명부에서 빼기`가 갖는다.
 *
 * **고를 수 없는 줄도 숨기지 않는다.** 이미 담긴 계정과 정지된 계정은 보이되 고를 수 없고 그
 * 사실을 배지로 적는다 — 숨기면 담당자가 "이 사람은 아직 없다"로 읽고 계정을 하나 더 만들러
 * 간다. 고를 수 있는지의 판정은 `canPickAccount` 한 곳이 답한다.
 *
 * **저장 중에는 창이 움직이지 않는다.** 탭·검색·페이지·선택을 모두 잠근다. 잠그지 않으면
 * 보내는 동안 바뀐 선택이 응답 처리(`setSelected`)에 덮여 조용히 사라진다.
 *
 * **끝난 일은 다시 보내지 않는다.** 일부만 실패하면 창은 열린 채로 남고, 담긴 계정은 선택에서
 * 지워지며 막힌 계정만 체크된 채 사유와 함께 남는다.
 */
export function ParticipantAddModal({
  open,
  onClose,
  programId,
}: {
  open: boolean
  onClose: () => void
  programId: string
}) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  /** 탭·검색·페이지를 옮겨도 체크를 보존하려고 id뿐 아니라 그때 읽은 계정 사본을 함께 든다. */
  const [selected, setSelected] = useState<Map<string, GuestAccountCandidate>>(() => new Map())
  const [issues, setIssues] = useState<AddIssue[]>([])

  const candidates = useGuestAccountCandidates(search, page)
  const participants = useProgramParticipants(programId)
  const add = useAddGuestAccounts(programId)

  /**
   * 이 사업의 명부를 **실제로 읽었는가**. 조회 중·조회 실패를 빈 명부로 접지 않는다 —
   * 접으면 `이미 담김`이 전부 false가 되어, 이미 담긴 계정이 고를 수 있는 줄로 선다.
   */
  const rosterKnown = participants.isSuccess

  /** 이 사업에 이미 서 있는 줄. 내부 임직원 줄은 이 명부의 대상이 아니라 여기서 빠진다. */
  const roster = useMemo(() => toGuestRosterRows(participants.data ?? []), [participants.data])
  const rows = useMemo(
    () => markAlreadyAdded(candidates.data?.rows ?? [], roster),
    [candidates.data?.rows, roster],
  )

  // 창을 다시 열면 지난번 선택·검색·사유가 남아 있지 않아야 한다 — 남으면 방금 연 창이
  // 이전 작업의 중간 상태를 자기 상태인 것처럼 보여 준다.
  useEffect(() => {
    if (!open) return
    setSearch('')
    setPage(0)
    setSelected(new Map())
    setIssues([])
  }, [open])

  const busy = add.isPending

  /**
   * 실제로 보낼 계정 — 선택을 든 채로 **지금도 고를 수 있는 것만** 센다.
   *
   * 선택은 페이지를 넘어 살아 있으므로, 고른 뒤에 사정이 바뀐 계정(누가 먼저 담았거나 계정이
   * 정지된 경우)이 목록에 없는 채로 선택에 남을 수 있다. 그 줄은 표에서 체크를 걷을 수 없는
   * 자리라, 세지도 보내지도 않아야 화면의 건수와 실제로 나가는 건수가 같아진다.
   */
  const taken = useMemo(() => rosterAccountIds(roster), [roster])
  const picked = useMemo(
    () =>
      rosterKnown
        ? [...selected.values()].filter((c) => c.isActive && !taken.has(c.userId))
        : [],
    [rosterKnown, selected, taken],
  )

  /**
   * DataTable의 전체선택은 현재 페이지를 대상으로 한다. 다른 페이지·탭에서 고른 계정은 여기서
   * 보존하고, 지금 페이지에서 바뀐 체크만 갈아 끼운다 — 페이지를 넘겼다는 이유로 방금 고른
   * 계정이 빠지면 여러 쪽에 걸친 선택 자체가 불가능해진다.
   *
   * 저장 중에는 한 줄도 갈아 끼우지 않는다. 응답 처리가 선택 전체를 실패한 줄로 덮으므로,
   * 보내는 동안 더해진 선택은 어느 쪽에도 남지 않고 사라진다.
   */
  const changePageSelection = (keys: string[]) => {
    if (busy) return
    const on = new Set(keys)
    setSelected((current) => {
      const next = new Map(current)
      for (const row of rows) {
        if (!canPickAccount(row, rosterKnown)) continue
        if (on.has(row.userId)) next.set(row.userId, row)
        else next.delete(row.userId)
      }
      return next
    })
  }

  const toggleRow = (row: GuestAccountPickRow) => {
    if (busy) return
    if (!canPickAccount(row, rosterKnown)) return
    setSelected((current) => {
      const next = new Map(current)
      if (next.has(row.userId)) next.delete(row.userId)
      else next.set(row.userId, row)
      return next
    })
  }

  /**
   * 고른 계정을 명부에 잇는다. **부분 실패를 성공으로 접지 않는다.**
   *
   * 담긴 계정과 이미 있던 계정은 선택에서 지우고, 막힌 계정만 체크된 채 남긴다. 전부 지우면
   * 실패가 조용히 사라지고, 아무것도 지우지 않으면 다시 눌렀을 때 성공한 계정이 두 번 나간다.
   */
  const run = async () => {
    // 명부를 모르면 보내지 않는다 — 이미 담긴 계정을 가려낼 근거가 아직 없다.
    if (busy || !rosterKnown) return
    if (picked.length === 0) return
    setIssues([])

    let result: Awaited<ReturnType<typeof add.mutateAsync>>
    try {
      result = await add.mutateAsync(picked.map((c) => c.userId))
    } catch (e) {
      // 반영 여부를 모른다 — 하나도 지우지 않고 전부 남긴다. 여기서 성공으로 접으면 화면이
      // 없는 사실을 단언하게 된다(명부 조회는 이미 무효화되어 실제 결과를 다시 읽는다).
      const reason = e instanceof Error ? e.message : 'GUEST 계정을 추가하지 못했습니다.'
      setIssues(
        picked.map((c) => ({
          userId: c.userId,
          name: c.name,
          reason: '서버 응답이 끊겨 반영 여부를 확인하고 있습니다. 명부를 확인한 뒤 다시 시도하세요.',
        })),
      )
      toast.show(`${reason} 명부를 다시 불러와 실제 반영 여부를 확인합니다.`, 'warning')
      return
    }

    // 서버가 답하지 않은 계정도 실패로 센다 — 보낸 수에서 받은 수를 빼 성공으로 채우면
    // 화면이 없는 사실을 말한다.
    const reasons = new Map<string, string>([
      ...result.failed.map((f) => [f.userId, describeAddReason(f.reason)] as const),
      ...result.unanswered.map(
        (id) => [id, '서버가 이 계정의 결과를 답하지 않았습니다.'] as const,
      ),
    ])
    const stuck = picked.filter((c) => reasons.has(c.userId))
    setSelected(new Map(stuck.map((c) => [c.userId, c])))
    setIssues(stuck.map((c) => ({ userId: c.userId, name: c.name, reason: reasons.get(c.userId)! })))

    const parts = [
      result.added > 0 ? `${result.added}건 추가` : null,
      result.alreadyPresent > 0 ? `${result.alreadyPresent}건은 이미 명부에 있어 그대로 둠` : null,
    ].filter(Boolean)

    if (stuck.length > 0) {
      const head = parts.length > 0 ? `${parts.join(' · ')} · ` : ''
      toast.show(`${head}${stuck.length}건 실패`, 'warning')
      // 창을 닫지 않는다 — 실패한 자리에서 사유를 보고 그 줄만 다시 보낼 수 있어야 한다.
      return
    }

    toast.show(`${parts.join(' · ')}.`, 'success')
    onClose()
  }

  const columns = useMemo<Column<GuestAccountPickRow>[]>(
    () => [
      { key: 'name', header: '이름', type: 'name', render: (row) => row.name },
      {
        key: 'affiliation',
        header: '소속',
        type: 'long',
        render: (row) => row.affiliation ?? <EmptyValue />,
      },
      {
        key: 'email',
        header: '이메일',
        type: 'long',
        // 계정의 이메일은 **로그인 아이디**다. 값을 가리는 정책은 서버가 이미 적용해 보낸다.
        render: (row) => row.email ?? <EmptyValue />,
      },
      {
        key: 'state',
        header: '상태',
        type: 'badge',
        /*
          적는 두 사실이 곧 **고를 수 없는 두 이유**다. `이미 담김`은 이 사업에서 고를 수 없는
          이유이고, `정지`는 서버 창구가 `users.is_active`를 요구해 담기 자체가 거절되는 계정이다
          (종전 주석은 담는 것은 막지 않는다고 적었으나, 서버는 `ACCOUNT_NOT_AVAILABLE`로 그 줄을
          거절한다). 평범한 계정에는 아무 배지도 달지 않는다 — 전부에 배지가 붙으면 배지가 뜻을
          잃는다.
        */
        render: (row) => {
          if (row.alreadyAdded) return <Badge tone="success">이미 담김</Badge>
          if (!row.isActive) return <Badge tone="warning">정지</Badge>
          return <EmptyValue />
        },
      },
    ],
    [],
  )

  const shown = issues.slice(0, ISSUE_PREVIEW)
  const hidden = issues.length - shown.length

  return (
    <Modal
      // 여러 쪽에 걸친 선택은 배경 클릭 한 번으로 잃기에 아깝고, 저장 중에는 닫을 수도 없다.
      dismissible={false}
      open={open}
      onClose={onClose}
      title="GUEST 계정 추가"
      help="이미 만들어져 있는 GUEST 계정 중에서 고릅니다. 새 계정은 GUEST 계정 관리에서 이름·이메일·소속으로 만듭니다."
      size="3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button onClick={() => void run()} disabled={busy || !rosterKnown || picked.length === 0}>
            {busy ? '추가 중…' : `선택한 ${picked.length}개 계정 추가`}
          </Button>
        </>
      }
    >
      {/*
        저장 중에는 창 전체가 움직이지 않는다. 조작을 막는 것은 각 핸들러의 `busy` 가드이고
        (키보드 조작도 그 가드를 지난다), 여기 흐리기와 `pointer-events-none`은 그 사실을
        눈에 보이게 한다.
      */}
      <div className={busy ? 'pointer-events-none space-y-4 opacity-60' : 'space-y-4'} aria-busy={busy}>
        {/*
          명부를 못 읽은 것과 명부가 빈 것은 다른 사실이다. 읽지 못한 동안에는 `이미 담김`을
          판정할 수 없으므로, 빈 명부로 접지 않고 그 사실을 적은 채 고르기를 잠근다.
        */}
        {participants.isError ? (
          <Banner tone="danger">
            <div className="flex items-center justify-between gap-3">
              <span>
                이 사업의 GUEST 명부를 불러오지 못했습니다. 이미 담긴 계정을 가려낼 수 없어 지금은
                계정을 고를 수 없습니다.
              </span>
              <Button variant="outline" onClick={() => void participants.refetch()} disabled={busy}>
                다시 불러오기
              </Button>
            </div>
          </Banner>
        ) : !rosterKnown ? (
          <Banner tone="info">
            이 사업의 GUEST 명부를 불러오는 중입니다. 명부를 읽은 뒤에 계정을 고를 수 있습니다.
          </Banner>
        ) : null}

        <ListToolbar
          keyword={search}
          onKeywordChange={(value) => {
            if (busy) return
            setSearch(value)
            // 3쪽에 서 있던 채로 좁히면 빈 목록이 뜬다.
            setPage(0)
          }}
          searchPlaceholder="계정명 · 이메일 · 소속 검색"
          dense
        />

        {/*
          사유는 계정마다 다르다 — 한 줄로 뭉뚱그리면 담당자가 어느 계정을 손봐야 하는지
          알 수 없다. 그렇다고 전부 펴면 배너가 표를 덮으므로 앞 몇 건만 펴고 나머지는 접는다
          (막힌 계정은 표에 체크된 채로 남아 있다).
        */}
        {issues.length > 0 && (
          <Banner tone="warning">
            <div className="space-y-1">
              <p className="font-medium">{issues.length}건을 담지 못했습니다.</p>
              <ul className="space-y-0.5">
                {shown.map((issue) => (
                  <li key={issue.userId}>
                    {issue.name} — {issue.reason}
                  </li>
                ))}
              </ul>
              {hidden > 0 && <p>외 {hidden}건</p>}
            </div>
          </Banner>
        )}

        {candidates.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : candidates.isError ? (
          // 조회 실패와 빈 목록은 다른 사실이다 — 뭉뚱그리면 "권한이 없다"가 "계정이 없다"로 읽힌다.
          <Banner tone="danger">계정 목록을 불러오지 못했습니다.</Banner>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.userId}
            standardColumns={false}
            selectable
            // 이미 담긴 줄·정지된 줄·명부를 모르는 동안은 보이되 고를 수 없다(머리글의
            // 전체선택에도 들지 않는다).
            selectableRow={(row) => canPickAccount(row, rosterKnown)}
            // 세는 것과 보이는 것이 같아야 한다 — 지금 고를 수 없게 된 선택은 건수에서도
            // 체크에서도 빠진다.
            selectedKeys={picked.map((c) => c.userId)}
            onSelectionChange={changePageSelection}
            onRowClick={toggleRow}
            caption={picked.length > 0 ? `${picked.length}개 계정 선택` : undefined}
            pagination={{
              page,
              pageSize: GUEST_CANDIDATE_PAGE_SIZE,
              total: candidates.data?.total ?? 0,
              onChange: (next) => {
                if (busy) return
                setPage(next)
              },
            }}
            emptyText={
              search.trim()
                ? '검색과 일치하는 GUEST 계정이 없습니다.'
                : '추가할 GUEST 계정이 없습니다.'
            }
          />
        )}
      </div>
    </Modal>
  )
}
