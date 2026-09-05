import { Button, Field, Input, Modal, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import {
  useSetAccessWindow,
  type ParticipantRow,
} from '@/features/program/participantHooks'

/** timestamptz → `<input type="date">`가 읽는 값. 빈 값은 '제한 없음'이다. */
function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** 날짜 칸 → 저장값. 종료는 그날 끝까지 열어 둔다(날짜만 받아 시각을 묻지 않는다). */
function fromDateInput(value: string, endOfDay: boolean): string | null {
  if (!value) return null
  const d = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * 참여 줄의 접근 기간 설정.
 *
 * 기간은 계정이 아니라 **이 줄**이 갖는다 — 같은 사람이 두 사업에 걸리면 기간이 서로 다르고,
 * 계정에 종료일 하나를 달면 답이 없기 때문이다. 만료되면 그 줄만 게스트의 참여 목록에서
 * 사라지고 계정과 다른 줄은 그대로 산다.
 *
 * 기본값은 `연결` 시점에 서버가 채운다(사업 종료일 + 14일). 이 화면은 그 값을 **덮어쓰는**
 * 자리이며, 담당자가 아무것도 하지 않아도 기간이 있다는 것이 요점이다.
 *
 * 근거: docs/docs_planning/3_9_1_guest_unified_account.md §8
 */
export function AccessWindowModal({
  programId,
  row,
  onClose,
}: {
  programId: string
  row: ParticipantRow | null
  onClose: () => void
}) {
  const toast = useToast()
  const save = useSetAccessWindow(programId)
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setStarts(toDateInput(row?.access_starts_at ?? null))
    setEnds(toDateInput(row?.access_ends_at ?? null))
    setError(null)
  }, [row])

  if (!row) return null

  const onSave = () => {
    if (starts && ends && starts >= ends) {
      setError('시작이 종료보다 뒤일 수 없습니다.')
      return
    }
    save.mutate(
      {
        participantId: row.id,
        starts: fromDateInput(starts, false),
        ends: fromDateInput(ends, true),
      },
      {
        onSuccess: () => {
          toast.show('접근 기간을 저장했습니다.', 'success')
          onClose()
        },
        onError: (e: unknown) =>
          toast.show(e instanceof Error ? e.message : '저장에 실패했습니다.', 'danger'),
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="접근 기간"
      help="비워 두면 제한이 없습니다. 기간이 지나면 이 사업만 참여자 목록에서 사라지고 계정과 다른 사업은 그대로 유지됩니다."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={onSave} disabled={save.isPending}>
            {save.isPending ? '저장 중…' : '저장'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-body text-gray-700">
          <span className="font-medium">{row.targetName}</span> · {row.role}
        </p>
        <Field label="시작">
          <Input type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </Field>
        <Field label="종료" error={error ?? undefined}>
          <Input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
