import { Badge, Button, Input, Modal, PanelCard, cn, tableText } from '@ynarcher/ui'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useBudgetSourceDocuments, type BudgetSourceDoc } from '@/features/approval/budgetApi'
import { formatMoney } from '@/features/approval/numeric'

interface Props {
  /** 예산표를 가진 양식들. 비어 있으면 고를 대상 자체가 없다. */
  formIds: string[]
  value: string | null
  onChange: (next: string | null) => void
  /** 고른 문서의 표시용 정보(다시 열 때 이름을 보이려면 필요하다). */
  picked: { title: string; docNo: string | null; amount: number | null } | null
  /** 이 양식이 근거 품의를 반드시 요구하는가. */
  required: boolean
  /** 변경 대상 품의를 고르는 자리인가(예산 변경 품의). 라벨이 달라진다. */
  revise?: boolean
  readOnly?: boolean
}

function Row({ doc, onPick }: { doc: BudgetSourceDoc; onPick: () => void }) {
  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className={cn('whitespace-nowrap px-3 py-1.5 tabular-nums', tableText.body)}>
        {doc.docNo ?? '-'}
      </td>
      <td className={cn('px-3 py-1.5', tableText.body)}>
        {/* 띄어쓰기 없는 긴 제목은 한 낱말이라 셀의 최소 폭이 제목 전체가 된다 — 여기서 묶는다. */}
        <div className="min-w-[8rem] max-w-[24rem] break-all" title={doc.title}>
          {doc.title}
        </div>
      </td>
      <td className={cn('whitespace-nowrap px-3 py-1.5 text-right tabular-nums', tableText.body)}>
        {formatMoney(doc.amount)}
      </td>
      <td className="px-3 py-1.5 text-right">
        <Button density="table" variant="outline" onClick={onPick}>
          선택
        </Button>
      </td>
    </tr>
  )
}

/**
 * 근거 품의 — 이 지출이 어느 품의의 돈을 쓰는가(예산 변경 품의라면 무엇을 고치는가).
 *
 * **본문 앞에 선다.** 품의를 골라야 지출 내역의 예산 줄을 고를 수 있으므로, 뒤에 두면
 * 담당자가 내역을 적다가 위로 되돌아와야 한다.
 *
 * 후보는 **승인이 끝난 품의만**이다 — 흐르는 중인 품의의 예산은 아직 확정된 돈이 아니라,
 * 그 위에 지출을 걸면 결재 도중 예산이 바뀌어 차감의 근거가 흔들린다.
 */
export function BudgetSourceField({
  formIds,
  value,
  onChange,
  picked,
  required,
  revise = false,
  readOnly = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const { data: docs, isLoading, isError } = useBudgetSourceDocuments(formIds, keyword)
  const label = revise ? '변경 대상 품의' : '근거 품의'

  return (
    <PanelCard
      title={label}
      action={
        readOnly ? undefined : (
          <Button variant="outline" density="table" onClick={() => setOpen(true)}>
            {value ? '변경' : '선택'}
          </Button>
        )
      }
    >
      {value && picked ? (
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{picked.docNo ?? '번호 없음'}</Badge>
          <span className={cn('min-w-0 flex-1 truncate', tableText.body)}>{picked.title}</span>
          <span className={cn('tabular-nums', tableText.body)}>{formatMoney(picked.amount)}</span>
          {!readOnly && (
            <Button
              variant="ghost"
              density="table"
              onClick={() => onChange(null)}
              aria-label={`${label} 해제`}
            >
              <X size={14} />
            </Button>
          )}
        </div>
      ) : (
        // **이 안내는 접지 않는다.** 왜 예산 줄을 고를 수 없는지를 말하는 차단 안내라,
        // 말풍선 뒤에 숨기면 담당자는 아래 표의 빈 선택지 앞에서 이유를 알 수 없다.
        <p className={tableText.empty}>
          {required
            ? `${label}를 골라야 지출 내역에서 예산 줄을 고를 수 있습니다.`
            : `${label}를 고르면 그 품의의 예산에서 차감됩니다. 비워 두어도 상신할 수 있습니다.`}
        </p>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={`${label} 선택`} size="lg">
        <div className="space-y-3">
          <Input
            placeholder="제목·문서 번호로 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <div className="relative min-w-0 max-w-full overflow-x-auto rounded-radius-md border border-gray-200">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-25">
                  <th className={cn('w-40 px-3 py-1.5 text-left', tableText.head)}>문서 번호</th>
                  <th className={cn('px-3 py-1.5 text-left', tableText.head)}>제목</th>
                  <th className={cn('w-36 px-3 py-1.5 text-right', tableText.head)}>품의 금액</th>
                  <th className="w-20 px-3 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {(docs ?? []).map((d) => (
                  <Row
                    key={d.id}
                    doc={d}
                    onPick={() => {
                      onChange(d.id)
                      setOpen(false)
                    }}
                  />
                ))}
                {/* 조회 중·실패를 '없음'으로 적지 않는다 — 권한 밖과 정말 없음이 섞인다. */}
                {(docs ?? []).length === 0 && (isLoading || isError) && (
                  <tr>
                    <td
                      colSpan={4}
                      className={cn(
                        'px-3 py-6 text-center',
                        isError ? 'text-danger' : '',
                        tableText.empty,
                      )}
                    >
                      {isError
                        ? '목록을 읽지 못했습니다. 새로고침 후 다시 시도해 주세요.'
                        : '불러오는 중입니다…'}
                    </td>
                  </tr>
                )}
                {!isLoading && !isError && (docs ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className={cn('px-3 py-6 text-center', tableText.empty)}>
                      {formIds.length === 0
                        ? '예산표를 가진 양식이 없습니다. ADMIN 결재 양식 관리에서 품의서 양식에 예산표를 추가하세요.'
                        : '조회 가능한 승인 품의가 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </PanelCard>
  )
}
