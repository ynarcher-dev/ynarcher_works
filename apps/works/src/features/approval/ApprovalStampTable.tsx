import { cn, tableText } from '@ynarcher/ui'
import { Check, X } from 'lucide-react'

export interface StampLine {
  id: string
  approverId: string | null
  stepOrder: number
  decision: 'PENDING' | 'APPROVED' | 'REJECTED'
  decidedAt: string | null
}

export interface StampRecipient {
  userId: string
  read: boolean
}

interface ApprovalStampTableProps {
  lines: StampLine[]
  recipients: StampRecipient[]
  nameOf: (id: string | null) => string
  /** 직급·직책 표기(있으면 도장 위 칸에 적는다). */
  titleOf?: (id: string | null) => string
}

/** 도장 한 칸 — 결재 여부를 원형 표식으로, 일시를 그 아래에 적는다. */
function Stamp({ line }: { line: StampLine }) {
  if (line.decision === 'PENDING') {
    return <span className={cn('text-caption', tableText.empty)}>대기</span>
  }
  const approved = line.decision === 'APPROVED'
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <span
        className={cn(
          'flex size-9 items-center justify-center rounded-full border-2 text-caption font-bold',
          approved
            ? 'border-info-border bg-info-subtle text-info'
            : 'border-danger-border bg-danger-subtle text-danger',
        )}
      >
        {approved ? <Check size={16} strokeWidth={2.5} /> : <X size={16} strokeWidth={2.5} />}
      </span>
      <span className={cn('text-caption', tableText.meta)}>
        {line.decidedAt?.slice(0, 10) ?? ''}
      </span>
    </span>
  )
}

/**
 * 결재선 도장 표 — 하이웍스 결재 문서 상단의 도장 칸을 승계한다.
 *
 * 세 줄이 한 사람을 이룬다: 직책 / 도장(결재 여부·일시) / 이름. 결재 순번대로 가로로 서며,
 * 참조자는 그 아래 한 줄에 이름과 열람 확인 표시로 늘어놓는다 — 참조는 결재하지 않으므로
 * 도장 칸을 차지하지 않고, 대신 "읽었는가"만 답한다.
 */
export function ApprovalStampTable({
  lines,
  recipients,
  nameOf,
  titleOf,
}: ApprovalStampTableProps) {
  const ordered = [...lines].sort((a, b) => a.stepOrder - b.stepOrder)

  return (
    <div className="overflow-x-auto rounded-radius-md border border-gray-200">
      <table className="w-full border-collapse">
        <tbody>
          <tr className="border-b border-gray-200">
            <th
              scope="row"
              className={cn('w-24 bg-gray-25 px-3 py-2 text-left', tableText.head)}
            >
              결재
            </th>
            {ordered.length === 0 ? (
              <td className={cn('px-3 py-4', tableText.empty)}>지정된 결재선이 없습니다.</td>
            ) : (
              ordered.map((line) => (
                <td
                  key={line.id}
                  className="min-w-[7rem] border-l border-gray-200 px-3 py-2 text-center align-middle"
                >
                  <p className={cn('mb-1', tableText.meta)}>{titleOf?.(line.approverId) || ' '}</p>
                  <Stamp line={line} />
                  <p className={cn('mt-1', tableText.body)}>{nameOf(line.approverId)}</p>
                </td>
              ))
            )}
          </tr>

          {recipients.length > 0 && (
            <tr>
              <th
                scope="row"
                className={cn('bg-gray-25 px-3 py-2 text-left align-top', tableText.head)}
              >
                참조
              </th>
              <td className="border-l border-gray-200 px-3 py-2" colSpan={Math.max(ordered.length, 1)}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {recipients.map((r) => (
                    <span key={r.userId} className={cn('inline-flex items-center gap-1', tableText.body)}>
                      {nameOf(r.userId)}
                      {/* 열람 확인 — 읽은 사람만 표식이 붙는다(안 읽었으면 아무 것도 적지 않는다). */}
                      {r.read && <Check size={13} className="text-info" strokeWidth={2.5} />}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
