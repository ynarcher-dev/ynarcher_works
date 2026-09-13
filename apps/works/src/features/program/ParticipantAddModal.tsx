import { Button, Modal, useToast } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import {
  GUEST_CANDIDATE_PAGE_SIZE,
  useAddGuestAccounts,
  useGuestAccountCandidates,
  useProgramParticipants,
} from '@/features/program/participantHooks'
import { toGuestRosterRows } from '@/features/program/guestRoster'
import { useRemoveParticipants } from '@/features/program/participantAccessHooks'
import { ParticipantRemoveConfirm } from '@/features/program/ParticipantRemoveConfirm'
import { ParticipantTransferPanes } from '@/features/program/ParticipantTransferPanes'
import { useParticipantTransfer } from '@/features/program/participantTransfer'
import { describeAddReason } from '@/features/program/programGuestAccountService'

/**
 * `GUEST 계정 추가` — **이미 있는 계정 중 누가 이 사업에 들어오는가**를 좌우 두 목록으로 정한다.
 *
 * **여기서 계정을 만들지 않는다**(2026-09-13 사용자 확정). 생성 창구는 `/guest-accounts`
 * 하나이며, 이 창은 그 원장에서 **고르기만** 한다. 종전에는 이 자리에서 성명·이메일·연락처를
 * 받아 계정을 세웠고, 그래서 같은 사람의 계정이 창구마다 조금씩 다른 값으로 여러 벌 생길 수
 * 있었다 — 계정이 어디서 생기는지 묻는 물음에 답이 둘이면 어느 쪽도 정본이 아니다.
 *
 * **원장 연결은 선택이다.** 후보는 계정이고, 그 계정이 어느 원장의 누구인지는 곁들이는
 * 표시값이다. 그래서 원장에 아직 붙지 않은 계정도 이 사업에 들일 수 있다.
 *
 * **창은 두 갈래의 쓰기를 함께 확정한다.** 오른쪽으로 옮긴 계정은 명부에 이어지고, 왼쪽으로
 * 내린 줄은 명부에서 빠진다. 두 축을 한 창에 둔 이유는 담당자가 잘못 담은 줄을 **알아차리는
 * 자리가 여기**이기 때문이다 — 거두려고 창을 닫고 표로 돌아가야 하면 대개 그냥 두게 된다.
 *
 * **되돌릴 수 없는 쪽만 확인을 거친다.** 담기는 되돌릴 수 있으므로(다시 빼면 된다) 저장 한
 * 번으로 끝나고, 빼기는 행이 사라지므로 따라쓰기 확인창을 지난다.
 *
 * **끝난 일은 다시 보내지 않는다.** 빼기가 끝나고 담기가 실패하면 창은 열린 채로 남되,
 * 이미 처리된 빼기는 대기 목록에서 지운다 — 다시 [저장]을 눌러도 같은 빼기가 두 번 나가지
 * 않고 따라쓰기 확인도 다시 묻지 않는다.
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
  const [confirming, setConfirming] = useState(false)
  const [addIssues, setAddIssues] = useState<Record<string, string>>({})

  const candidates = useGuestAccountCandidates(search, page)
  const { data: allParticipants } = useProgramParticipants(programId)
  const add = useAddGuestAccounts(programId)
  const remove = useRemoveParticipants(programId)

  /** 오른쪽에 세울 기존 줄. 내부 임직원 줄은 이 명부의 대상이 아니라 여기서 빠진다. */
  const roster = useMemo(() => toGuestRosterRows(allParticipants ?? []), [allParticipants])

  const transfer = useParticipantTransfer(candidates.data?.rows, roster, search)

  const total = candidates.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / GUEST_CANDIDATE_PAGE_SIZE))

  const close = () => {
    transfer.reset()
    setSearch('')
    setPage(0)
    setConfirming(false)
    setAddIssues({})
    onClose()
  }

  /** 검색어를 바꾸면 첫 페이지로 돌아간다 — 3쪽에 서 있던 채로 좁히면 빈 목록이 뜬다. */
  const changeSearch = (v: string) => {
    setSearch(v)
    setPage(0)
  }

  const busy = add.isPending || remove.isPending

  /**
   * **빼기를 먼저 끝낸다.** 담기가 막혀도(서버 창구가 아직 없을 수 있다) 담당자가 이미 승인한
   * 빼기는 끝나 있어야, 창을 다시 열었을 때 같은 따라쓰기 확인을 두 번 하지 않는다.
   */
  const run = async () => {
    const removals = transfer.removals
    let removed = 0
    if (removals.length > 0) {
      try {
        removed = await remove.mutateAsync(removals)
      } catch (e) {
        // 창을 닫지 않는다 — 실패한 자리에서 사유를 보고 다시 누를 수 있어야 한다.
        toast.show(
          e instanceof Error ? e.message : '명부에서 빼지 못했습니다. 권한을 확인하세요.',
          'danger',
        )
        return
      }
      // 끝난 빼기는 대기 목록에서 지운다(아래 담기가 실패해도 다시 나가지 않는다).
      transfer.commitRemovals(removals)
    }

    const userIds = transfer.additions
    if (userIds.length === 0) {
      toast.show(`${removed}건을 명부에서 뺐습니다.`, 'success')
      close()
      return
    }

    let result: Awaited<ReturnType<typeof add.mutateAsync>>
    setAddIssues({})
    try {
      result = await add.mutateAsync(userIds)
    } catch (e) {
      // 담기만 실패했어도 빼기는 이미 끝났다 — 그 사실을 함께 적지 않으면 담당자가 전부
      // 실패한 것으로 읽고 처음부터 다시 한다.
      const reason = e instanceof Error ? e.message : 'GUEST 계정을 추가하지 못했습니다.'
      const unknown =
        '서버 응답이 끊겨 반영 여부를 확인하고 있습니다. 명부를 확인한 뒤 다시 시도하세요.'
      setAddIssues(Object.fromEntries(userIds.map((id) => [id, unknown])))
      const prefix = removed > 0 ? `${removed}건은 뺐습니다. ` : ''
      toast.show(`${prefix}${reason} 명부를 다시 불러와 실제 반영 여부를 확인합니다.`, 'warning')
      return
    }

    /*
      **끝난 것만 대기 목록에서 지운다.** 담긴 줄과 이미 있던 줄은 다시 보낼 이유가 없고,
      막힌 줄은 오른쪽에 남아야 담당자가 사유를 보고 그 줄만 다시 보낼 수 있다 —
      전부 지우면 실패가 조용히 사라지고, 아무것도 지우지 않으면 성공한 것이 다시 나간다.
    */
    const stuck = [...result.failed.map((f) => f.userId), ...result.unanswered]
    setAddIssues(
      Object.fromEntries([
        ...result.failed.map((row) => [row.userId, describeAddReason(row.reason)] as const),
        ...result.unanswered.map(
          (id) => [id, '서버가 이 계정의 결과를 답하지 않았습니다.'] as const,
        ),
      ]),
    )
    transfer.commitAdditions(userIds.filter((id) => !stuck.includes(id)))

    const parts = [
      result.added > 0 ? `${result.added}건 추가` : null,
      result.alreadyPresent > 0 ? `${result.alreadyPresent}건은 이미 명부에 있어 그대로 둠` : null,
      removed > 0 ? `${removed}건 뺌` : null,
    ].filter(Boolean)

    if (stuck.length > 0) {
      // 사유는 첫 건만 편다(나머지는 오른쪽 표에 그대로 서 있다). 서버가 답하지 않은 줄도
      // 실패로 센다 — 보낸 수에서 받은 수를 빼 성공으로 채우면 화면이 없는 사실을 말한다.
      const detail = result.failed[0]
        ? describeAddReason(result.failed[0].reason)
        : '서버가 결과를 답하지 않았습니다.'
      const head = parts.length > 0 ? `${parts.join(' · ')} · ` : ''
      toast.show(`${head}${stuck.length}건 실패: ${detail}`, 'warning')
      // 창을 닫지 않는다 — 실패한 자리에서 사유를 보고 다시 누를 수 있어야 한다.
      return
    }

    toast.show(`${parts.join(' · ')}.`, 'success')
    close()
  }

  /** 저장 버튼이 자기가 일으킬 일을 되읽는다 — 되돌릴 수 없는 빼기가 섞였는지가 여기서 드러난다. */
  const summary = [
    transfer.additions.length > 0 ? `${transfer.additions.length}건 추가` : null,
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
        title="GUEST 계정 추가"
        help="이미 만들어져 있는 GUEST 계정 중에서 고릅니다. 새 계정은 통합 GUEST 계정 관리에서 만들며, 여기서 고른 계정의 이름·이메일·연락처는 바뀌지 않습니다. 원장 연결이 없는 계정도 담을 수 있습니다."
        size="3xl"
        sectioned
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              취소
            </Button>
            <Button
              onClick={() => (transfer.removals.length > 0 ? setConfirming(true) : void run())}
              disabled={busy || !transfer.dirty}
            >
              {busy ? '저장 중…' : summary ? `저장 (${summary})` : '저장'}
            </Button>
          </>
        }
      >
        <ParticipantTransferPanes
          search={search}
          onSearchChange={changeSearch}
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          total={total}
          isLoading={candidates.isLoading}
          isError={candidates.isError}
          busy={busy}
          addIssues={addIssues}
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
