import { Button, Modal, useToast } from '@ynarcher/ui'
import { useMemo, useState, type ReactNode } from 'react'
import { LedgerQuickAdd, LedgerQuickAddActions } from '@/features/program/LedgerQuickAdd'
import { checkRows, useQuickAddRows } from '@/features/program/quickAddDraft'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
import { RosterPickPanes } from '@/features/program/RosterPickPanes'
import { useRosterPick } from '@/features/program/rosterPick'
import {
  useAddRosterEntries,
  useBulkAddRoster,
  useProgramRoster,
  useRosterCandidates,
} from '@/features/program/rosterHooks'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 참가자 명단에 담기 — **고르기**와 **새로 만들기** 두 모드가 한 창에 산다.
 *
 * GUEST 명부의 추가 모달(`ParticipantAddModal`)에 있는 '사람 정하기' 단계가 여기 없는 것이
 * 요점이다. 저 단계는 **계정을 세우기 위해** 있다 — 누구 이름으로, 어느 이메일로 로그인할
 * 것인가를 정하는 자리다. 명단은 계정을 세우지 않으므로 물을 것이 없다.
 *
 * **새로 만들기도 원장에 만든다**(2026-09-09). 명단에 값을 직접 적는 칸을 두지 않는 이유는
 * `useCreateLedgerEntry` 주석에 있다 — 요약하면 값이 두 곳에 살게 되고, 가리킬 원장 행이
 * 없는 줄은 계정을 받지 못한다.
 *
 * **모드를 탭으로 가르지 않는다.** 담당자가 이 창을 여는 이유는 언제나 '담기' 하나이고,
 * 새로 만드는 것은 *찾아봤더니 없을 때* 하는 일이다. 탭으로 나란히 세우면 찾아보기 전에
 * 만들기를 고를 수 있게 되고, 그것이 곧 중복 등록의 자리다. 그래서 만들기는 목록 아래
 * 한 줄로만 닿는다.
 *
 * **CSV파일 업로드도 같은 자리에서 닿는다**(2026-09-10 사용자 지정). 종전에는 명단 표 위
 * 툴바에 버튼으로 서 있었는데, 한 건이든 백 건이든 담당자가 하려는 일은 '명단에 담기' 하나라
 * 입구가 둘일 이유가 없다. 파일을 올리는 것은 새로 만들기와 같은 성격의 **다른 길**이다 —
 * 원장을 찾아본 다음에야 고르는 길이라 그 아래 한 줄로 선다.
 *
 * 담을 자격은 탭이 정하고 모달은 받기만 한다 — 모달이 자기 원장 선택을 따로 가지면
 * 담당자가 'SELLER' 탭에서 열고 BUYER를 담을 수 있다.
 */
export function RosterAddModal({
  open,
  onClose,
  onBulk,
  programId,
  master,
}: {
  open: boolean
  onClose: () => void
  /** CSV파일 업로드 창으로 넘어간다(이 창은 닫힌다 — 두 창을 겹쳐 세우지 않는다). */
  onBulk: () => void
  programId: string
  /** 어느 자격으로 담을 것인가. 참가자 명단의 자격 탭이 정한다. */
  master: MasterTable
}) {
  const toast = useToast()
  const config = useProgramWorkspace()
  const spec = PARTICIPANT_PERSONAS[master]
  const [mode, setMode] = useState<'pick' | 'create'>('pick')
  const [search, setSearch] = useState('')
  const quick = useQuickAddRows()
  const [checking, setChecking] = useState(false)

  const { data: candidates, isLoading } = useRosterCandidates(programId, master, search)
  const { data: roster } = useProgramRoster(programId)
  /** 이 자격으로 이미 담긴 줄 — 오른쪽 기둥에 서고, 신규 등록의 '이미 담김' 판정도 이 값이다. */
  const existing = useMemo(
    () => (roster ?? []).filter((r) => r.master_table === master),
    [roster, master],
  )
  const mappedIds = useMemo(() => new Set(existing.map((r) => r.master_id)), [existing])

  const pick = useRosterPick(candidates, existing)
  const add = useAddRosterEntries(programId)
  const create = useBulkAddRoster(programId)

  const busy = add.isPending || create.isPending || checking

  const close = () => {
    setMode('pick')
    pick.reset()
    setSearch('')
    quick.reset()
    onClose()
  }

  const fail = (e: unknown, fallback: string) =>
    toast.show(e instanceof Error ? e.message : fallback, 'danger')

  const addStaged = () =>
    add.mutate(
      { master, masterIds: pick.staged.map((c) => c.id) },
      {
        onSuccess: (n) => {
          toast.show(`${n}건을 ${config.rosterLabel}에 담았습니다.`, 'success')
          close()
        },
        onError: (e) => fail(e, '추가에 실패했습니다. 권한을 확인하세요.'),
      },
    )

  /** 저장 한 번에 대조 한 번. 값을 고치면 결과가 사라지므로 다시 눌러야 담긴다. */
  const runCheck = async () => {
    setChecking(true)
    try {
      quick.setEntries(await checkRows(master, quick.rows, mappedIds))
    } catch (e) {
      // 대조에 실패하면 만들지 않는다 — 확인하지 못한 것을 '중복 없음'으로 읽으면
      // 그 침묵이 그대로 중복 등록이 된다.
      fail(e, '원장 대조에 실패했습니다. 다시 시도해 주세요.')
    } finally {
      setChecking(false)
    }
  }

  /** 대조에서 정해진 결정을 그대로 옮긴다 — CSV파일 업로드와 **같은 실행 훅**을 쓴다. */
  const runCreate = () => {
    const entries = quick.entries ?? []
    create.mutate(
      {
        master,
        linkIds: entries.filter((e) => e.decision === 'link' && e.match).map((e) => e.match!.id),
        creates: entries.filter((e) => e.decision === 'create').map((e) => e.row),
      },
      {
        onSuccess: ({ linked, created }) => {
          toast.show(
            `${config.rosterLabel}에 ${linked + created}건을 담았습니다(원장 신규 ${created}건).`,
            'success',
          )
          close()
        },
        onError: (e) => fail(e, '등록에 실패했습니다. 권한을 확인하세요.'),
      },
    )
  }

  const toPick = () => {
    setMode('pick')
    quick.reset()
  }

  const goBulk = () => {
    // 고르던 것은 버린다 — 업로드 창은 파일이 곧 목록이라 이 창에서 옮겨 둔 줄이 갈 자리가 없다.
    pick.reset()
    onBulk()
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={close}
      title={mode === 'pick' ? `${spec.label} 추가` : `${spec.label} 신규 등록`}
      help={
        mode === 'pick'
          ? spec.pickHelp
          : '원장에 새 행을 만들고 그대로 담습니다. 이름만 필수이고 나머지는 나중에 원장에서 채울 수 있습니다.'
      }
      size="3xl"
      sectioned={mode === 'pick'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={mode === 'pick' ? close : toPick} disabled={busy}>
            {mode === 'pick' ? '취소' : '목록으로'}
          </Button>
          {mode === 'pick' ? (
            <Button onClick={addStaged} disabled={busy || pick.staged.length === 0}>
              {add.isPending ? '담는 중…' : `담기 (${pick.staged.length})`}
            </Button>
          ) : (
            <LedgerQuickAddActions
              entries={quick.entries}
              canSubmit={quick.rows.some((r) => r.name.trim())}
              busy={busy}
              onCheck={() => void runCheck()}
              onSubmit={runCreate}
            />
          )}
        </div>
      }
    >
      {mode === 'pick' ? (
        <RosterPickPanes
          master={master}
          isLoading={isLoading}
          search={search}
          onSearchChange={setSearch}
          pick={pick}
          footer={
            // 찾아본 뒤에야 닿는 자리다 — 목록 위에 두면 찾기 전에 만들기를 고르게 된다.
            <div className="space-y-1 text-body-sm text-gray-600">
              {/* 링크 글자는 문장과 같은 크기로 둔다 — 한 줄 안에서 크기를 갈라 위계를 만들지
                  않는다(구분은 색이 진다). */}
              <p>
                원장에 없나요?{' '}
                <InlineLink onClick={() => setMode('create')}>{spec.label} 새로 등록</InlineLink>
              </p>
              <p>
                한 번에 여러 건인가요? <InlineLink onClick={goBulk}>CSV파일 업로드</InlineLink>
              </p>
            </div>
          }
        />
      ) : (
        <LedgerQuickAdd
          master={master}
          rows={quick.rows}
          entries={quick.entries}
          onPatch={quick.patch}
          onAdd={quick.add}
          onRemove={quick.remove}
          onDecide={quick.decide}
          busy={busy}
        />
      )}
    </Modal>
  )
}

/** 안내 문장 안에 서는 링크 — 한 줄의 다른 글자와 같은 크기이고 색만 다르다. */
function InlineLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-info transition-opacity duration-fast hover:opacity-80"
    >
      {children}
    </button>
  )
}
