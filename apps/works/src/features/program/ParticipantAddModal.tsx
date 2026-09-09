import { Button, Modal, useToast } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import {
  useAddParticipants,
  useMasterCandidates,
  useProgramParticipants,
} from '@/features/program/participantHooks'
import { useRemoveParticipants } from '@/features/program/participantAccessHooks'
import { ParticipantRemoveConfirm } from '@/features/program/ParticipantRemoveConfirm'
import { ParticipantTransferPanes } from '@/features/program/ParticipantTransferPanes'
import { useParticipantTransfer } from '@/features/program/participantTransfer'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'

/**
 * 계정 생성 — **참가자 목록에 담긴 대상 중 누가 로그인하는가**를 좌우 두 목록으로 정한다.
 *
 * 이 화면에서 원장을 고치지 않는다. 사업 담당자가 급히 받아적은 값이 마스터를 덮어쓰면
 * 어느 쪽이 정본인지 판정할 근거가 사라진다 — 사람을 새로 적는 것은 **계정**을 세우는
 * 일이지 원장 행을 바꾸는 일이 아니다.
 *
 * 담을 대상이 어느 원장에서 오는지는 탭이 정한다 — 모달이 자기 원장 선택을 따로 갖고 있으면
 * 담당자가 'SELLER' 탭에서 열고 BUYER를 담을 수 있고, 그러면 그 사람이 볼 화면이 열려 있던
 * 탭과 어긋난다. 자격은 한 곳에서만 정해져야 한다(3_9_1 §4).
 *
 * **후보는 이 사업의 참가자 목록이다**(2026-09-09 좁힘 — 종전에는 전사 원장 전체였다).
 * 계정은 "누구를 들일지 정한 다음"에 세우는 것이라, 고르는 자리도 그 결정이 사는 곳이어야 한다.
 *
 * **창은 두 갈래의 쓰기를 함께 확정한다**(2026-09-09). 오른쪽으로 옮긴 줄은 계정을 세우고
 * 명부에 담고, 왼쪽으로 내린 줄은 명부에서 뺀다. 두 축을 한 창에 둔 이유는 담당자가 잘못
 * 담은 줄을 **알아차리는 자리가 여기**이기 때문이다 — 계정을 세우려고 목록을 훑다가 발견한
 * 오등록을 거두려고 창을 닫고 표로 돌아가야 하면, 대개 그냥 두게 된다.
 *
 * **되돌릴 수 없는 쪽만 확인을 거친다.** 담기는 되돌릴 수 있으므로(다시 빼면 된다) 저장 한
 * 번으로 끝나고, 빼기는 행이 사라지므로 따라쓰기 확인창을 지난다 — 확인이 필요한 것과 아닌
 * 것을 같은 무게로 물으면 그 확인은 곧 아무도 읽지 않는 절차가 된다.
 */
export function ParticipantAddModal({
  open,
  onClose,
  programId,
  master,
}: {
  open: boolean
  onClose: () => void
  programId: string
  /** 어느 자격으로 담을 것인가. 명부의 자격 탭이 정한다. */
  master: MasterTable
}) {
  const toast = useToast()
  const spec = PARTICIPANT_PERSONAS[master]
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState(false)

  const { data: candidates, isLoading } = useMasterCandidates(programId, master, search)
  const { data: allParticipants } = useProgramParticipants(programId)
  const add = useAddParticipants(programId)
  const remove = useRemoveParticipants(programId)

  /**
   * 오른쪽에 세울 기존 줄. 이 탭의 자격만 남긴다 — 원장이 없는 행(내부 임직원 참가자)은
   * 게스트 자격이 아니므로 어느 자격 탭에도 서지 않는다.
   */
  const participants = useMemo(
    () => (allParticipants ?? []).filter((p) => p.master_table === master),
    [allParticipants, master],
  )

  const transfer = useParticipantTransfer(candidates, participants, search)

  const close = () => {
    transfer.reset()
    setSearch('')
    setConfirming(false)
    onClose()
  }

  const busy = add.isPending || remove.isPending

  /**
   * **빼기를 먼저 끝낸다.** 담기가 부분 실패해도(계정 발급이 막히는 줄이 있다) 담당자가 이미
   * 승인한 빼기는 끝나 있어야, 창을 다시 열었을 때 같은 따라쓰기 확인을 두 번 하지 않는다.
   */
  const run = async () => {
    let removed = 0
    try {
      if (transfer.removals.length > 0) removed = await remove.mutateAsync(transfer.removals)
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : '명부에서 빼지 못했습니다. 권한을 확인하세요.',
        'danger',
      )
      return
    }

    const rows = transfer.additions
    if (rows.length === 0) {
      toast.show(`${removed}건을 명부에서 뺐습니다.`, 'success')
      close()
      return
    }

    add.mutate(
      { master, rows },
      {
        onSuccess: (res) => {
          const tail = removed > 0 ? ` · ${removed}건 뺌` : ''
          // 원장 보완 실패는 계정 실패와 갈라 말한다 — 담긴 것은 담긴 것이고 못 고친 것은
          // 원장이라, 담당자가 다시 해야 하는 일이 서로 다르다.
          const ledger =
            res.ledgerFailed > 0
              ? ` ${res.ledgerFailed}건은 원장에 반영하지 못했습니다(원장 쓰기 권한).`
              : ''
          if (res.failed.length > 0) {
            toast.show(
              `${res.added}건을 담았습니다${tail}. ${res.failed.length}건 실패: ${res.failed[0]}`,
              'warning',
            )
          } else if (ledger) {
            toast.show(`${res.added}건을 명부에 담았습니다${tail}.${ledger}`, 'warning')
          } else {
            toast.show(`${res.added}건을 명부에 담았습니다${tail}.`, 'success')
          }
          if (res.added > 0 || removed > 0) close()
        },
        onError: (e: unknown) =>
          toast.show(
            e instanceof Error ? e.message : '명부 추가에 실패했습니다. 권한을 확인하세요.',
            'danger',
          ),
      },
    )
  }

  /** 저장 버튼이 자기가 일으킬 일을 되읽는다 — 되돌릴 수 없는 빼기가 섞였는지가 여기서 드러난다. */
  const summary = [
    transfer.additions.length > 0 ? `${transfer.additions.length}건 담기` : null,
    transfer.removals.length > 0 ? `${transfer.removals.length}건 빼기` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <Modal
        dismissible={false}
        open={open}
        onClose={close}
        title={`${spec.label} 계정 생성`}
        help="참가자 목록에 담긴 대상만 고를 수 있습니다. 오른쪽으로 옮긴 대상에게 계정이 세워지고, 왼쪽으로 내린 대상은 저장할 때 명부에서 빠집니다."
        size="2xl"
        sectioned
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              취소
            </Button>
            <Button
              onClick={() => (transfer.removals.length > 0 ? setConfirming(true) : void run())}
              disabled={busy || !transfer.dirty || !transfer.ready}
            >
              {busy ? '저장 중…' : summary ? `저장 (${summary})` : '저장'}
            </Button>
          </>
        }
      >
        <ParticipantTransferPanes
          spec={spec}
          search={search}
          onSearchChange={setSearch}
          isLoading={isLoading}
          transfer={transfer}
        />
      </Modal>

      {/*
        빼기만 확인을 거친다. 이 창이 남는 기록의 건수까지 함께 묻는다 — 막지 않는 것과
        말없이 지우는 것은 다르다(지원서·질문·자료는 함께 지워지지 않고 그대로 남는다).
      */}
      <ParticipantRemoveConfirm
        open={confirming}
        programId={programId}
        participantIds={transfer.removals}
        onConfirm={() => {
          setConfirming(false)
          void run()
        }}
        onClose={() => setConfirming(false)}
        busy={busy}
      />
    </>
  )
}
