import {
  Button,
  DataTable,
  ListToolbar,
  Spinner,
  usePaged,
  useToast,
} from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { participantContentKey } from '@/features/admin/sensitiveContents'
import { useMaskPolicy } from '@/features/admin/sensitiveStore'
import { useGuestHost, type GuestHostEntity } from '@/features/guest/host'
import { ParticipantAddModal } from '@/features/program/ParticipantAddModal'
import {
  ParticipantActionConfirm,
  type ParticipantAction,
} from '@/features/program/ParticipantActionConfirm'
import { participantColumns } from '@/features/program/participantColumns'
import { ParticipantRemoveConfirm } from '@/features/program/ParticipantRemoveConfirm'
import { ParticipantSelectionBar } from '@/features/program/ParticipantSelectionBar'
import {
  useProgramParticipants,
  type ParticipantRow,
} from '@/features/program/participantHooks'
import {
  countNotified,
  useCloseGuestAccess,
  useOpenGuestAccess,
  useRemoveParticipants,
  useReopenGuestAccess,
  useSendPasswordReset,
} from '@/features/program/participantAccessHooks'
import { isGuestRosterRow } from '@/features/program/guestRoster'
import { ProgramAccessWindowModal } from '@/features/program/ProgramAccessWindowModal'

/** 한 페이지에 세우는 행 수 — 페이징 훅과 표 페이저가 같은 값을 봐야 한다. */
const PAGE_SIZE = 10

/**
 * 검색이 걸리는 축 — **계정의 값이 앞이고 원장 이름이 뒤다**.
 *
 * 표가 세우는 값으로만 건다. 보이지 않는 값으로 걸러지면 방금 눈으로 본 줄이 사라진 이유를
 * 화면이 답하지 못한다. 원장 이름을 함께 두는 이유는 그것도 표에 서기 때문이다(연결 원장 열).
 */
function matches(row: ParticipantRow, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  return [row.accountName, row.accountEmail, row.phone, row.targetName]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(kw))
}

/**
 * 기간을 여는 버튼의 라벨 — **값이 있으면 버튼이 그 값을 되읽는다**(2026-09-08).
 *
 * 종전에는 카드 부제가 이 값을 말했다. 자리를 옮긴 이유는 부제가 답하던 두 가지 중 하나가
 * 이 카드의 물음이 아니어서다 — 사업 코드는 사업의 식별값이라 사업 정보 카드가 소유하고,
 * 명부 카드에 두면 제목 바로 아래 첫 줄을 명부와 무관한 값이 차지한다.
 *
 * 남는 하나(기간)는 부제보다 **그 값을 바꾸는 버튼**에 붙는 편이 낫다. 버튼이 자기가 무엇을
 * 여는지 말할 뿐 아니라 지금 값이 무엇인지도 함께 말하므로, 담당자가 열어 확인하고 닫는
 * 왕복이 사라진다(CLAUDE.md: 입력값 되읽기는 접지 않는 예외다).
 *
 * 만료를 숨기지 않는 이유: 기간이 지났다는 사실은 "왜 아무도 못 들어오나"의 답이라, 날짜만
 * 적으면 담당자가 그것을 오늘과 비교해야 안다.
 */
function accessWindowLabel(iso: string | null): string {
  if (!iso) return '로그인 가능 기간'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '로그인 가능 기간'
  const day = d.toLocaleDateString('ko-KR')
  return d.getTime() <= Date.now() ? `로그인 만료 · ${day}` : `로그인 가능 ~ ${day}`
}

/**
 * 사업 상세 '와이앤아처 GUEST 설정' 모달 `GUEST 계정 추가` 탭의 본문. **명부 한 벌이 선다.**
 *
 * **자격 탭을 걷었다**(2026-09-13 사용자 확정). 종전에는 자격(원장)마다 하위 탭이 서고 이
 * 컴포넌트가 그중 하나만 담았는데, 그 구조에서는 **원장에 붙지 않은 게스트 계정이 어느 탭에도
 * 서지 못했다.** 원장 연결이 계정의 선택적 속성이 된 이상 자격은 명부를 가르는 축이 될 수
 * 없고, 표의 한 열(`연결 원장`)로 내려온다.
 *
 * **내부 임직원 줄은 서지 않는다.** 이 명부는 *밖에서 들어오는 사람*의 축이고 임직원은
 * WORKS로 들어온다. 가르는 값은 원장 유무가 아니라 계정 유형이다(`isGuestRosterRow`) —
 * 원장 유무로 가르면 원장 없는 게스트가 임직원으로 불린다.
 *
 * **여기서 계정을 만들지 않는다.** 생성 창구는 `/guest-accounts` 하나이며, 이 화면의 추가는
 * 이미 있는 계정을 이 사업에 잇는 일이다(`ParticipantAddModal`).
 *
 * **버튼이 서는 자리는 걸리는 범위가 정한다**(2026-09-05 개편). 사업 전체에 걸리는
 * '로그인 가능 기간'은 선택과 무관하므로 툴바에 상시로 서고, 고른 행에 걸리는 것들(열기·재설정
 * 안내·차단·해제)은 고른 뒤에만 선택 줄로 뜬다. 종전에는 넷이 늘 회색으로 서 있었고 켜지는
 * 조건이 저마다 달라(1건만·계정 있는 행만·N건) 왜 못 누르는지를 화면이 답하지 못했다.
 *
 * **차단과 해제는 두 버튼이지만 한 축이다.** 고른 것에 실제로 걸리는 쪽만 세우고, 섞어
 * 골랐으면 둘 다 서되 각자 자기 몫에만 걸린다. `로그인 열기`와 `차단 해제`는 둘 다 문을
 * 여는 일이지만 갈린다 — 전자는 **다시 초대하며 안내를 보내고**, 후자는 **조용히 되돌린다**
 * (막은 적 있다는 사실을 굳이 알리지 않는 길이 있어야 한다).
 *
 * 명부에 올리는 일과 로그인을 여는 일이 갈려 있다 — 참여 후보를 쌓아 두더라도 확정 전에는
 * 문이 열리지 않는다. 문을 여닫을 수 있는 사람은 그 사업의 담당자(PM·MEMBER)뿐이며,
 * 화면의 숨김은 편의일 뿐 실제 강제는 서버(RPC)가 한다.
 */
export function ParticipantPool({ host }: { host: GuestHostEntity }) {
  const config = useGuestHost()
  const toast = useToast()
  const myId = useAuthStore((s) => s.user?.id)
  const masked = useMaskPolicy(participantContentKey(config.key))

  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [windowOpen, setWindowOpen] = useState(false)
  const [confirming, setConfirming] = useState<ParticipantAction | null>(null)
  // 되돌릴 수 없는 하나는 별도 상태다 — 나머지 넷과 확인창 자체가 다르다(따라쓰기).
  const [removing, setRemoving] = useState(false)

  const { data, isLoading, isError } = useProgramParticipants(host.id)
  const open = useOpenGuestAccess(host.id)
  const close = useCloseGuestAccess(host.id)
  const reopen = useReopenGuestAccess(host.id)
  const resetPw = useSendPasswordReset()
  const remove = useRemoveParticipants(host.id)

  const rows = useMemo(() => data ?? [], [data])
  const isManager = useMemo(
    () => (host.managers ?? []).some((m) => m.user_id === myId),
    [host.managers, myId],
  )
  const canOpenDoor = isManager

  /**
   * 게스트 명부에 서는 줄만 남긴다 — 거르는 것은 **실제 내부 임직원 계정뿐**이다.
   * 자격(원장)으로는 거르지 않는다: 원장에 붙지 않은 게스트 계정도 이 명부의 대상이다.
   */
  const guestRows = useMemo(() => rows.filter(isGuestRosterRow), [rows])

  const filtered = useMemo(
    () => guestRows.filter((r) => matches(r, keyword)),
    [guestRows, keyword],
  )

  // 선택(selected)은 페이지를 넘겨도 유지된다 — 일괄 처리는 화면에 보이는 행이 아니라 고른 행이
  // 대상이고, 페이지를 넘겼다는 이유로 방금 고른 건이 빠지면 그것이 더 놀라운 동작이다.
  const { pageItems, page, setPage } = usePaged(filtered, PAGE_SIZE)

  const columns = useMemo(
    () => participantColumns(masked, host.status, host.guest_access_ends_at),
    [masked, host.status, host.guest_access_ends_at],
  )

  const selectedRows = useMemo(
    () => guestRows.filter((r) => selected.includes(r.id)),
    [guestRows, selected],
  )

  /** 고른 행 중 계정이 있는 대상의 계정 id — 재설정 안내는 줄이 아니라 계정이 대상이다. */
  const selectedAccountIds = useMemo(
    () => [...new Set(selectedRows.filter((r) => r.accountId).map((r) => r.accountId!))],
    [selectedRows],
  )

  // 차단과 해제는 서로 반대인 한 축이라 대상이 겹치지 않는다. 섞어 골랐을 때 각 버튼이
  // 자기 몫에만 걸리도록 여기서 갈라 둔다 — 고른 전부를 보내면 이미 차단된 행을 다시
  // 차단하고 열려 있는 행의 해제를 시도하게 되어, 결과 건수가 담당자가 고른 수와 어긋난다.
  const blockedIds = useMemo(
    () => selectedRows.filter((r) => r.login_status === 'BLOCKED').map((r) => r.id),
    [selectedRows],
  )
  const openableIds = useMemo(
    () => selectedRows.filter((r) => r.login_status !== 'BLOCKED').map((r) => r.id),
    [selectedRows],
  )

  const busy =
    open.isPending || close.isPending || reopen.isPending || resetPw.isPending || remove.isPending

  const runOpen = () => {
    open.mutate(selected, {
      onSuccess: (res) => {
        setSelected([])
        setConfirming(null)
        if (res.failed > 0) {
          toast.show(`로그인 ${res.opened}건 개방 · 안내 발송 ${res.failed}건 실패`, 'warning')
        } else {
          toast.show(`로그인 ${res.opened}건을 열고 안내를 보냈습니다.`, 'success')
        }
      },
      onError: (e: unknown) =>
        toast.show(e instanceof Error ? e.message : '로그인 개방에 실패했습니다.', 'danger'),
    })
  }

  const runClose = () => {
    close.mutate(openableIds, {
      onSuccess: (n) => {
        setSelected([])
        setConfirming(null)
        toast.show(`이 ${config.entityNoun} 접근 ${n}건을 차단했습니다.`, 'success')
      },
      onError: (e: unknown) =>
        toast.show(e instanceof Error ? e.message : '차단에 실패했습니다.', 'danger'),
    })
  }

  /**
   * 차단 해제. 되돌릴 상태는 화면이 정하지 않고 서버가 원장에 되묻는다(들어와 본 적이
   * 있으면 이용 중, 없으면 초대). 안내는 나가지 않는다 — 그것은 `로그인 열기`의 일이다.
   */
  const runReopen = () => {
    reopen.mutate(blockedIds, {
      onSuccess: (n) => {
        setSelected([])
        setConfirming(null)
        toast.show(`차단 ${n}건을 해제했습니다.`, 'success')
      },
      onError: (e: unknown) =>
        toast.show(e instanceof Error ? e.message : '차단 해제에 실패했습니다.', 'danger'),
    })
  }

  /**
   * 비밀번호 재설정 **안내 발송**. 담당자가 값을 되돌리는 경로는 없다 — 계정 하나가 여러
   * 사업을 열게 되어, 값을 쥔 사람은 그 게스트의 다른 팀 사업까지 들어갈 수 있다.
   */
  const runResetPassword = () => {
    void Promise.allSettled(selectedAccountIds.map((id) => resetPw.mutateAsync(id))).then(
      (results) => {
        setSelected([])
        setConfirming(null)
        // 호출이 성공한 것과 안내가 나간 것은 다르다(countNotified 주석 참조).
        const { sent, failed } = countNotified(results)
        if (failed > 0) {
          toast.show(`재설정 안내 ${sent}건 발송 · ${failed}건 실패`, 'warning')
        } else {
          toast.show(`재설정 안내 ${sent}건을 본인 연락처로 보냈습니다.`, 'success')
        }
      },
    )
  }

  const confirmHandlers: Record<ParticipantAction, () => void> = {
    open: runOpen,
    block: runClose,
    unblock: runReopen,
    reset: runResetPassword,
  }

  /** 확인창이 말할 건수 — 액션마다 대상이 다르다(계정 / 차단된 행 / 나머지). */
  const confirmCount: Record<ParticipantAction, number> = {
    open: selected.length,
    block: openableIds.length,
    unblock: blockedIds.length,
    reset: selectedAccountIds.length,
  }

  if (isLoading) return <Spinner />

  return (
    <>
      {/*
        **카드 껍데기를 두르지 않는다**(2026-09-08). 이 명부는 모달 안에 서고, 그 모달은 이미
        제목과 상자를 갖는다 — 한 번 더 두르면 상자 안의 상자가 되고 제목이 두 줄이 된다.

        건수도 제목 옆에 적지 않는다. 표 아래 페이저가 이미 '필터 반영 / 전체'로 말하고 있어,
        같은 수를 두 곳에서 각자 세면 검색으로 좁혔을 때 두 값이 어긋나 보인다.

        자격은 위의 하위 탭이 답하고, 사업 코드는 사업 정보 카드가 소유하며, 기간은 그것을
        바꾸는 버튼이 스스로 되읽는다.
      */}
      <div className="space-y-3">
          <ListToolbar
            keyword={keyword}
            onKeywordChange={setKeyword}
            searchPlaceholder="계정명 · 이메일 · 연락처 · 연결 원장 검색"
            actions={
              <div className="flex items-center gap-2">
                {canOpenDoor && (
                  <Button variant="outline" onClick={() => setWindowOpen(true)}>
                    {accessWindowLabel(host.guest_access_ends_at)}
                  </Button>
                )}
                {/* '생성'이 아니라 '추가'다 — 이 버튼은 이미 있는 계정을 이 사업에 잇는다. */}
                <Button onClick={() => setAddOpen(true)}>GUEST 계정 추가</Button>
              </div>
            }
          />

          {canOpenDoor && (
            <ParticipantSelectionBar
              count={selected.length}
              accountCount={selectedAccountIds.length}
              blockedCount={blockedIds.length}
              onOpen={() => setConfirming('open')}
              onResetPassword={() => setConfirming('reset')}
              onBlock={() => setConfirming('block')}
              onUnblock={() => setConfirming('unblock')}
              onRemove={() => setRemoving(true)}
              onClear={() => setSelected([])}
              busy={busy}
            />
          )}

          <DataTable
            columns={columns}
            rows={pageItems}
            rowKey={(r) => r.id}
            selectable={canOpenDoor}
            selectedKeys={selected}
            onSelectionChange={setSelected}
            // 생성자는 도메인 컬럼으로 직접 세운다. 표준 컬럼을 쓰면 이 원장에 없는 수정일·관리
            // 열까지 딸려 와 빈 칸 둘이 가로 스크롤만 만든다.
            standardColumns={false}
            // 조회 실패와 빈 명부는 다른 사실이다 — 한 문장으로 뭉뚱그리면 원인을 짚을 수 없다.
            emptyText={isError ? '명부를 불러오지 못했습니다.' : '명부가 비어 있습니다.'}
            // 좌측 건수는 '필터 반영 / 전체'로 읽힌다 — 검색으로 좁힌 뒤에도 명부 총량을 잃지 않는다.
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total: filtered.length,
              totalAll: guestRows.length,
              onChange: setPage,
            }}
          />
      </div>

      <ParticipantAddModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        programId={host.id}
      />
      <ProgramAccessWindowModal
        host={host}
        open={windowOpen}
        onClose={() => setWindowOpen(false)}
      />
      <ParticipantActionConfirm
        action={confirming}
        count={confirming ? confirmCount[confirming] : 0}
        onConfirm={() => confirming && confirmHandlers[confirming]()}
        onClose={() => setConfirming(null)}
        busy={busy}
      />
      <ParticipantRemoveConfirm
        open={removing}
        programId={host.id}
        participantIds={selected}
        onConfirm={() =>
          remove.mutate(selected, {
            onSuccess: (n) => {
              setSelected([])
              setRemoving(false)
              toast.show(`${n}건을 명부에서 뺐습니다.`, 'success')
            },
            onError: (e: unknown) => {
              // 창을 닫지 않는다 — 실패한 자리에서 사유를 보고 다시 누를 수 있어야 한다.
              toast.show(
                e instanceof Error ? e.message : '명부에서 빼지 못했습니다. 권한을 확인하세요.',
                'danger',
              )
            },
          })
        }
        onClose={() => setRemoving(false)}
        busy={remove.isPending}
      />
    </>
  )
}
