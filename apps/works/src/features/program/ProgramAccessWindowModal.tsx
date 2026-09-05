import { Button, Field, Input, Modal, useToast } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import type { Program } from '@/features/program/hooks'
import { useSetProgramAccessWindow } from '@/features/program/participantHooks'

/** timestamptz → `<input type="date">`가 읽는 값. 빈 값은 '제한 없음'이다. */
function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** 날짜 칸 → 저장값. 그날 끝까지 열어 둔다(날짜만 받아 시각을 묻지 않는다). */
function fromDateInput(value: string): string | null {
  if (!value) return null
  const d = new Date(`${value}T23:59:59`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * 이 사업 게스트의 로그인 가능 기간(종료일 하나).
 *
 * **기간은 사업이 갖는다**(2026-09-05). 종전에는 참여 줄마다 있어 담당자가 기업 한 곳씩
 * 정했는데, 참여 기업이 스무 곳이면 같은 값을 스무 번 적는 일이었고 그 스무 값이 어긋날 수
 * 있다는 것 자체가 결함이었다 — "이 사업 게스트는 언제까지 들어오나"에 원장이 답을 못 했다.
 * 기업 한 곳만 막을 일은 기간이 아니라 **차단**이 답한다.
 *
 * 시작일을 두지 않는 이유는 연결한 순간이 곧 시작이어서다. 시작일을 따로 두면
 * "연결됨인데 아직 못 들어옴"이라는 상태가 하나 더 생기고, 담당자는 그것을 상태 열에서
 * 읽을 방법이 없다.
 *
 * 기본값은 첫 연결 시점에 서버가 채운다(사업 종료일 + 14일). 이 화면은 그 값을 **덮어쓰는**
 * 자리이며, 담당자가 아무것도 하지 않아도 기간이 있다는 것이 요점이다.
 *
 * 근거: docs/docs_planning/3_9_1_guest_unified_account.md §8
 */
export function ProgramAccessWindowModal({
  program,
  open,
  onClose,
}: {
  program: Program
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const save = useSetProgramAccessWindow(program.id)
  const [ends, setEnds] = useState('')

  useEffect(() => {
    if (open) setEnds(toDateInput(program.guest_access_ends_at))
  }, [open, program.guest_access_ends_at])

  if (!open) return null

  const onSave = () => {
    save.mutate(fromDateInput(ends), {
      onSuccess: () => {
        toast.show(
          ends ? '로그인 가능 기간을 저장했습니다.' : '로그인 가능 기간을 제한 없음으로 두었습니다.',
          'success',
        )
        onClose()
      },
      onError: (e: unknown) =>
        toast.show(e instanceof Error ? e.message : '저장에 실패했습니다.', 'danger'),
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="로그인 가능 기간"
      help="비워 두면 제한이 없습니다. 기간이 지나면 이 사업만 게스트의 참여 목록에서 사라지고, 계정과 다른 사업은 그대로 유지됩니다."
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
        {/*
          되돌릴 수 있는 설정이지만 파급 범위는 미리 밝힌다 — 담당자가 표에서 한 행을 고른 뒤
          여는 버튼이라, 고른 그 기업에만 걸린다고 읽힐 여지가 있다(CLAUDE.md: 파급 효과 고지는
          접지 않는다).
        */}
        <p className="text-body text-gray-700">
          <span className="font-medium">{program.title}</span>의 참여 기업·참여 전문가{' '}
          <span className="font-medium">전원</span>에게 같이 걸립니다.
        </p>
        <Field label="종료일" hint="비워 두면 제한 없음">
          <Input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
