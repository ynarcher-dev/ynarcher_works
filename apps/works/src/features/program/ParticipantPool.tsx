import {
  Button,
  Card,
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
import type { Program } from '@/features/program/hooks'
import { ParticipantAddModal } from '@/features/program/ParticipantAddModal'
import {
  ParticipantActionConfirm,
  type ParticipantAction,
} from '@/features/program/ParticipantActionConfirm'
import { participantColumns } from '@/features/program/participantColumns'
import { ParticipantSelectionBar } from '@/features/program/ParticipantSelectionBar'
import {
  PERSONA_LABEL,
  useCloseGuestAccess,
  useOpenGuestAccess,
  useProgramParticipants,
  useReopenGuestAccess,
  useSendPasswordReset,
  type MasterTable,
  type ParticipantRow,
} from '@/features/program/participantHooks'
import { ProgramAccessWindowModal } from '@/features/program/ProgramAccessWindowModal'
import { useProgramWorkspace } from '@/features/program/workspace'

/** 한 페이지에 세우는 행 수 — 페이징 훅과 표 페이저가 같은 값을 봐야 한다. */
const PAGE_SIZE = 10

/** 검색이 걸리는 축 — 대상명과 로그인 계정(성명·연락처). 명부에서 사람을 찾는 길은 이 넷뿐이다. */
function matches(row: ParticipantRow, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  return [row.targetName, row.loginName, row.email, row.phone]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(kw))
}

/** 기간 표기(카드 부제). 값은 사업이 갖고 참여 기업·전문가 전원에게 같이 걸린다. */
function accessWindowLabel(iso: string | null): string {
  if (!iso) return '로그인 가능 기간 제한 없음'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '로그인 가능 기간 제한 없음'
  const label = `로그인 가능 ~ ${d.toLocaleDateString('ko-KR')}`
  return d.getTime() <= Date.now() ? `${label} (만료)` : label
}

/**
 * 사업 상세 개요 좌측 '참여 기업' · '참여 전문가' 탭의 본문. **자격 하나만 담는다.**
 *
 * 2026-09-05 처음에는 탭 하나(참가자/전문가) 안의 하위 탭으로 갈랐으나 곧 위로 올렸다 —
 * 자격은 표를 거르는 조건이 아니라 **다른 화면을 여는 축**이기 때문이다(게스트가 볼 메뉴가
 * 여기서 갈린다, 3_9_1 §4).
 *
 * 자격이 바뀌면 이 컴포넌트는 통째로 다시 선다(부모가 조건부로 렌더한다) — 선택·검색·페이지가
 * 함께 비워져야 일괄 작업이 안 보이는 행을 집지 않는다.
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
export function ParticipantPool({
  program,
  persona,
}: {
  program: Program
  persona: MasterTable
}) {
  const config = useProgramWorkspace()
  const toast = useToast()
  const myId = useAuthStore((s) => s.user?.id)
  const masked = useMaskPolicy(participantContentKey(config.key))

  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [windowOpen, setWindowOpen] = useState(false)
  const [confirming, setConfirming] = useState<ParticipantAction | null>(null)

  const { data, isLoading, isError } = useProgramParticipants(program.id)
  const open = useOpenGuestAccess(program.id)
  const close = useCloseGuestAccess(program.id)
  const reopen = useReopenGuestAccess(program.id)
  const resetPw = useSendPasswordReset()

  const rows = useMemo(() => data ?? [], [data])
  const isManager = useMemo(
    () => (program.managers ?? []).some((m) => m.user_id === myId),
    [program.managers, myId],
  )
  const canOpenDoor = isManager

  /**
   * 이 탭의 자격만 남긴다. 원장이 없는 행(내부 임직원 참가자)은 게스트 자격이 아니므로
   * 어느 탭에도 세우지 않는다 — 이 두 탭은 '밖에서 들어오는 사람'의 축이고, 임직원은
   * WORKS로 들어온다.
   */
  const personaRows = useMemo(
    () => rows.filter((r) => r.master_table === persona),
    [rows, persona],
  )

  const filtered = useMemo(
    () => personaRows.filter((r) => matches(r, keyword)),
    [personaRows, keyword],
  )

  // 선택(selected)은 페이지를 넘겨도 유지된다 — 일괄 처리는 화면에 보이는 행이 아니라 고른 행이
  // 대상이고, 페이지를 넘겼다는 이유로 방금 고른 건이 빠지면 그것이 더 놀라운 동작이다.
  const { pageItems, page, setPage } = usePaged(filtered, PAGE_SIZE)

  const columns = useMemo(
    () => participantColumns(masked, program.status, program.guest_access_ends_at, persona),
    [masked, program.status, program.guest_access_ends_at, persona],
  )

  const selectedRows = useMemo(
    () => personaRows.filter((r) => selected.includes(r.id)),
    [personaRows, selected],
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

  const busy = open.isPending || close.isPending || reopen.isPending || resetPw.isPending

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
        toast.show(`이 사업 접근 ${n}건을 차단했습니다.`, 'success')
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
        const sent = results.filter((r) => r.status === 'fulfilled').length
        const failed = results.length - sent
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

  if (isLoading) {
    return (
      <Card title={PERSONA_LABEL[persona]}>
        <Spinner />
      </Card>
    )
  }

  return (
    <>
      {/* 건수는 이 탭의 자격만 센다 — 카드 제목이 '참여 기업'인데 뒤의 수가 전문가까지 합한
          값이면, 표는 비어 있는데 제목만 건수를 말하는 화면이 된다.
          기간은 전원 공통이라 열로 반복하지 않고 여기 한 자리에 적는다. */}
      <Card
        title={PERSONA_LABEL[persona]}
        count={personaRows.length}
        subtitle={`사업 코드 ${program.code || '미발급'} · ${accessWindowLabel(program.guest_access_ends_at)}`}
      >
        <div className="space-y-3">
          <ListToolbar
            keyword={keyword}
            onKeywordChange={setKeyword}
            searchPlaceholder={
              persona === 'startups' ? '기업명 · 대표자 · 연락처 검색' : '전문가명 · 연락처 검색'
            }
            actions={
              <div className="flex items-center gap-2">
                {canOpenDoor && (
                  <Button variant="outline" onClick={() => setWindowOpen(true)}>
                    로그인 가능 기간
                  </Button>
                )}
                <Button onClick={() => setAddOpen(true)}>{PERSONA_LABEL[persona]} 추가</Button>
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
              totalAll: personaRows.length,
              onChange: setPage,
            }}
          />
        </div>
      </Card>

      <ParticipantAddModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        programId={program.id}
        master={persona}
      />
      <ProgramAccessWindowModal
        program={program}
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
    </>
  )
}
