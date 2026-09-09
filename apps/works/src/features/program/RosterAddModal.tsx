import { Button, Modal, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { LedgerQuickAdd, LedgerQuickAddActions } from '@/features/program/LedgerQuickAdd'
import { checkDraft, useQuickAddDraft } from '@/features/program/quickAddDraft'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
import { RosterCandidateList } from '@/features/program/RosterCandidateList'
import {
  useAddRosterEntries,
  useCreateLedgerEntry,
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
 * 담을 자격은 탭이 정하고 모달은 받기만 한다 — 모달이 자기 원장 선택을 따로 가지면
 * 담당자가 'SELLER' 탭에서 열고 BUYER를 담을 수 있다.
 */
export function RosterAddModal({
  open,
  onClose,
  programId,
  master,
}: {
  open: boolean
  onClose: () => void
  programId: string
  /** 어느 자격으로 담을 것인가. 참가자 명단의 자격 탭이 정한다. */
  master: MasterTable
}) {
  const toast = useToast()
  const config = useProgramWorkspace()
  const spec = PARTICIPANT_PERSONAS[master]
  const [mode, setMode] = useState<'pick' | 'create'>('pick')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const quick = useQuickAddDraft()
  const [checking, setChecking] = useState(false)

  const { data: candidates, isLoading } = useRosterCandidates(programId, master, search)
  const add = useAddRosterEntries(programId)
  const create = useCreateLedgerEntry(programId)

  const busy = add.isPending || create.isPending || checking

  const close = () => {
    setMode('pick')
    setPicked([])
    setSearch('')
    quick.reset()
    onClose()
  }

  const fail = (e: unknown, fallback: string) =>
    toast.show(e instanceof Error ? e.message : fallback, 'danger')

  const addMasterIds = (masterIds: string[]) =>
    add.mutate(
      { master, masterIds },
      {
        onSuccess: (n) => {
          toast.show(`${n}건을 ${config.rosterLabel}에 담았습니다.`, 'success')
          close()
        },
        onError: (e) => fail(e, '추가에 실패했습니다. 권한을 확인하세요.'),
      },
    )

  const createNow = () =>
    create.mutate(
      { master, ...quick.draft },
      {
        onSuccess: () => {
          toast.show(`${spec.label} 1건을 원장에 등록하고 담았습니다.`, 'success')
          close()
        },
        onError: (e) => fail(e, '등록에 실패했습니다. 권한을 확인하세요.'),
      },
    )

  /** 저장 한 번에 대조 한 번. 걸리면 만들지 않고 그 행을 보여 준다. */
  const checkAndCreate = async () => {
    setChecking(true)
    try {
      const found = await checkDraft(master, quick.draft)
      if (found) {
        quick.setMatch(found)
        return
      }
      createNow()
    } catch (e) {
      // 대조에 실패하면 만들지 않는다 — 확인하지 못한 것을 '중복 없음'으로 읽으면
      // 그 침묵이 그대로 중복 등록이 된다.
      fail(e, '원장 대조에 실패했습니다. 다시 시도해 주세요.')
    } finally {
      setChecking(false)
    }
  }

  const toPick = () => {
    setMode('pick')
    quick.reset()
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
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={mode === 'pick' ? close : toPick} disabled={busy}>
            {mode === 'pick' ? '취소' : '목록으로'}
          </Button>
          {mode === 'pick' ? (
            <Button onClick={() => addMasterIds(picked)} disabled={busy || picked.length === 0}>
              {add.isPending ? '담는 중…' : `담기 (${picked.length})`}
            </Button>
          ) : (
            <LedgerQuickAddActions
              match={quick.match}
              canSubmit={Boolean(quick.draft.name.trim())}
              busy={busy}
              onCheckAndCreate={() => void checkAndCreate()}
              onCreateAnyway={createNow}
              onUseMatch={() => quick.match && addMasterIds([quick.match.id])}
            />
          )}
        </div>
      }
    >
      {mode === 'pick' ? (
        <div className="space-y-3">
          <RosterCandidateList
            master={master}
            candidates={candidates ?? []}
            isLoading={isLoading}
            search={search}
            onSearchChange={setSearch}
            picked={picked}
            onToggle={(id) =>
              setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
            }
          />
          {/* 찾아본 뒤에야 닿는 자리다 — 목록 위에 두면 찾기 전에 만들기를 고르게 된다. */}
          <p className="text-body-sm text-gray-600">
            원장에 없나요?{' '}
            <button
              type="button"
              onClick={() => setMode('create')}
              className="text-info transition-opacity duration-fast hover:opacity-80"
            >
              {spec.label} 새로 등록
            </button>
          </p>
        </div>
      ) : (
        <LedgerQuickAdd
          master={master}
          draft={quick.draft}
          onDraftChange={quick.setDraft}
          match={quick.match}
          onMatchChange={quick.setMatch}
          busy={busy}
        />
      )}
    </Modal>
  )
}
