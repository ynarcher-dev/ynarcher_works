import { Button, Field, Input, Modal, PickList, PickMark, PickRow, Spinner, useToast } from '@ynarcher/ui'
import { Check } from 'lucide-react'
import { useState } from 'react'
import type { MasterCandidate } from '@/features/program/participantHooks'
import { PARTICIPANT_PERSONAS, type MasterTable } from '@/features/program/participantPersona'
import { useAddRosterEntries, useRosterCandidates } from '@/features/program/rosterHooks'

/**
 * 참가자 목록에 담기 — **원장에서 고르는 한 단계**로 끝난다.
 *
 * GUEST 명부의 추가 모달(`ParticipantAddModal`)에 있는 2단계(사람 정하기)가 여기 없는 것이
 * 요점이다. 저 단계는 **계정을 세우기 위해** 있다 — 누구 이름으로, 어느 이메일로 로그인할
 * 것인가를 정하는 자리다. 참가자 목록은 계정을 세우지 않으므로 물을 것이 없고, 값은 전부
 * 원장이 이미 갖고 있다.
 *
 * 그래서 원장에 연락처가 없어도 담는 것을 막지 않는다. 막는 것은 '이미 담김' 하나다 —
 * 비어 있다는 사실은 표의 `—`가 답하고, 채우는 자리는 원장이다(여기서 원장을 고치지 않는다.
 * 급히 받아적은 값이 마스터를 덮어쓰면 어느 쪽이 정본인지 판정할 근거가 사라진다).
 *
 * 담을 자격은 탭이 정하고 모달은 그것을 받기만 한다 — 모달이 자기 원장 선택을 따로 가지면
 * 담당자가 'SELLER' 탭에서 열고 BUYER를 담을 수 있다.
 *
 * 후보 목록의 규격은 GUEST 명부·회의록 외부 참석자 검색과 같다(체크 원 + 이름·메타 두 줄 +
 * 행 전체 클릭) — 원장에서 골라 담는 화면이 앱 안에서 서로 다르게 생길 이유가 없다.
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
  /** 어느 자격으로 담을 것인가. 참가자 목록의 자격 탭이 정한다. */
  master: MasterTable
}) {
  const toast = useToast()
  const spec = PARTICIPANT_PERSONAS[master]
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<string[]>([])

  const { data: candidates, isLoading } = useRosterCandidates(programId, master, search)
  const add = useAddRosterEntries(programId)

  const close = () => {
    setPicked([])
    setSearch('')
    onClose()
  }

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))

  const submit = () => {
    add.mutate(
      { master, masterIds: picked },
      {
        onSuccess: (n) => {
          toast.show(`${n}건을 참가자 목록에 담았습니다.`, 'success')
          close()
        },
        onError: (e: unknown) =>
          toast.show(
            e instanceof Error ? e.message : '추가에 실패했습니다. 권한을 확인하세요.',
            'danger',
          ),
      },
    )
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={close}
      title={`${spec.label} 추가`}
      help={spec.pickHelp}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            취소
          </Button>
          <Button onClick={submit} disabled={add.isPending || picked.length === 0}>
            {add.isPending ? '담는 중…' : `담기 (${picked.length})`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="검색">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={spec.pickSearchPlaceholder}
          />
        </Field>

        <div className="overflow-hidden rounded-radius-md border border-gray-200">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <PickList isEmpty={(candidates ?? []).length === 0} empty="검색 결과가 없습니다.">
              {(candidates ?? []).map((c: MasterCandidate) => {
                const added = picked.includes(c.id)
                return (
                  <PickRow
                    key={c.id}
                    selected={added}
                    disabled={c.alreadyMapped}
                    onClick={() => toggle(c.id)}
                  >
                    <PickMark checked={added}>
                      <Check className="size-3.5" />
                    </PickMark>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-gray-900">
                        <span className="font-medium">{c.name}</span>
                        {c.loginName && <span className="text-gray-500"> · {c.loginName}</span>}
                      </span>
                      <span className="block truncate text-body-sm text-gray-600">
                        {c.email ?? c.phone ?? '원장에 연락처 없음'}
                      </span>
                    </span>
                    {c.alreadyMapped && (
                      <span className="shrink-0 text-body-sm text-gray-500">담김</span>
                    )}
                  </PickRow>
                )
              })}
            </PickList>
          )}
        </div>
      </div>
    </Modal>
  )
}
