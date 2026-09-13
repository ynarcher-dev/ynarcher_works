import { Badge, Button, Modal, cn, tableText } from '@ynarcher/ui'
import { useState } from 'react'
import { useBudgetRefSource } from '@/features/approval/budgetRefContext'
import { formatMoney } from '@/features/approval/numeric'

interface Props {
  value: string
  onChange: (next: string) => void
}

/**
 * 지출 내역 한 줄이 "어느 예산 줄에서 쓰는가"를 고르는 칸.
 *
 * 셀렉트가 아니라 창인 이유는 고를 때 **금액이 함께 보여야** 하기 때문이다. 예산 줄 하나를
 * 고르는 일은 이름을 고르는 일이 아니라 "여기에 아직 돈이 남았나"를 보고 정하는 일인데,
 * 드롭다운 한 줄에는 예산·사용·남음 세 숫자가 들어가지 않는다.
 *
 * 남는 금액이 마이너스인 줄도 **고를 수 있다.** 막지 않는 것이 이 기능의 원칙이고(초과는
 * 결재자가 반려로 거른다), 다만 빨갛게 적어 고르는 사람이 알고 고르게 한다.
 */
export function BudgetRefCell({ value, onChange }: Props) {
  const { options, usage, usageLoading, usageError, emptyHint } = useBudgetRefSource()
  const [open, setOpen] = useState(false)
  const picked = options.find((o) => o.id === value) ?? null
  // 사용 현황을 모르는 동안 0을 적으면 "아직 한 푼도 안 썼다"는 거짓말이 된다.
  const known = !usageLoading && !usageError
  const num = (v: number | null) => (known ? formatMoney(v) : usageLoading ? '…' : '알 수 없음')

  // 값은 있는데 선택지에 없다 — 근거 품의를 바꿨거나 예산 변경으로 줄이 사라진 자리다.
  // 조용히 비우지 않는다: 비우면 담당자는 자기가 적은 값이 없어진 줄도 모른다.
  const dangling = Boolean(value) && !picked && options.length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'w-full rounded-radius-sm border border-gray-300 px-2 py-1 text-left',
          tableText.body,
          'hover:border-gray-400',
          dangling && 'border-danger text-danger',
        )}
      >
        {/* 경로는 '사업본부 > 운영비 > …'처럼 길어진다. 칸 안에서 끊고 전체는 title로 준다. */}
        {picked ? (
          <span className="block max-w-[16rem] truncate" title={picked.path}>
            {picked.path}
          </span>
        ) : dangling ? (
          '없어진 예산 줄'
        ) : (
          <span className="text-gray-400">예산 줄 선택</span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="예산 줄 선택" size="lg">
        {usageError && (
          <p className={cn('mb-2 text-danger', tableText.body)}>
            사용 현황을 읽지 못했습니다. 아래 잔액은 믿을 수 없으니 새로고침 후 다시 확인해
            주세요.
          </p>
        )}
        {options.length === 0 ? (
          <p className={cn('py-6 text-center', tableText.empty)}>{emptyHint}</p>
        ) : (
          <div className="relative min-w-0 max-w-full overflow-x-auto rounded-radius-md border border-gray-200">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-25">
                  <th className={cn('px-3 py-1.5 text-left', tableText.head)}>항목</th>
                  <th className={cn('w-28 px-3 py-1.5 text-right', tableText.head)}>예산</th>
                  <th className={cn('w-28 px-3 py-1.5 text-right', tableText.head)}>사용</th>
                  <th className={cn('w-28 px-3 py-1.5 text-right', tableText.head)}>결재 중</th>
                  <th className={cn('w-28 px-3 py-1.5 text-right', tableText.head)}>사용 가능</th>
                  <th className="w-20 px-3 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {options.map((o) => {
                  const u = usage.get(o.id)
                  // 결재 중인 지출도 이미 그 돈을 쥐고 있다. 빼지 않으면 같은 돈을 두 번 쓴다.
                  const available =
                    o.budget === null ? null : o.budget - (u?.spent ?? 0) - (u?.pending ?? 0)
                  return (
                    <tr key={o.id} className="border-b border-gray-100 last:border-b-0">
                      <td className={cn('px-3 py-1.5', tableText.body)}>
                        {/* 경로도 두 줄에서 끊는다 — 접기만 두면 긴 경로 한 줄이 400px 높이가
                            되어 고르는 사람이 목록을 훑을 수 없다. 전체는 title로 준다. */}
                        <div
                          className="line-clamp-2 min-w-[8rem] max-w-[20rem] break-all"
                          title={o.path}
                        >
                          {o.path}
                        </div>
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-3 py-1.5 text-right tabular-nums',
                          tableText.body,
                        )}
                      >
                        {formatMoney(o.budget)}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-3 py-1.5 text-right tabular-nums',
                          tableText.body,
                        )}
                      >
                        {num(u?.spent ?? 0)}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-3 py-1.5 text-right tabular-nums',
                          tableText.body,
                        )}
                      >
                        {num(u?.pending ?? 0)}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums',
                          tableText.body,
                          known && available !== null && available < 0 && 'text-danger',
                        )}
                      >
                        {num(available)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Button
                          density="table"
                          variant={o.id === value ? 'primary' : 'outline'}
                          onClick={() => {
                            onChange(o.id)
                            setOpen(false)
                          }}
                        >
                          {o.id === value ? '선택됨' : '선택'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {value && (
          <div className="mt-3 flex min-w-0 items-center justify-between gap-2">
            {/* 긴 경로가 '선택 해제'를 창 밖으로 밀어내지 않게, 배지가 줄고 버튼이 버틴다.
                Badge 자신이 `shrink-0`이라 `shrink`로 되돌려야 줄어든다(`min-w-0`만으로는 안 준다). */}
            <Badge tone="neutral" className="min-w-0 flex-1 shrink">
              <span className="block truncate" title={picked?.path}>
                현재: {picked?.path ?? '없어진 줄'}
              </span>
            </Badge>
            <Button
              variant="ghost"
              density="table"
              className="shrink-0"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              선택 해제
            </Button>
          </div>
        )}
      </Modal>
    </>
  )
}
