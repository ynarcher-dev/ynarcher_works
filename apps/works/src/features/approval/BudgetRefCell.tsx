import {
  Badge,
  Button,
  Checkbox,
  Modal,
  PickerField,
  cn,
  tableGrid,
  tableText,
} from '@ynarcher/ui'
import { useState } from 'react'
import { useBudgetRefSource } from '@/features/approval/budgetRefContext'
import { formatMoney } from '@/features/approval/numeric'

interface Props {
  /** 표 머리글의 이름(`예산 줄`). 칸의 접근명이 이 문구로 시작한다. */
  label: string
  value: string
  onChange: (next: string) => void
  /**
   * 여럿을 한 번에 고른 결과 — **첫 줄이 이 칸에 들어가고 나머지는 새 행이 된다**(그 폄은
   * 표가 한다). 넘기면 창에 체크박스와 '선택한 N개 반영'이 함께 선다.
   *
   * 예산 줄 하나에 지출 행 하나라, 다섯 줄에서 쓰는 지출결의서는 행 추가와 창 열기가 다섯 번씩
   * 반복된다 — 고르는 일 자체는 같은 목록을 훑는 한 번의 일인데도 그렇다.
   */
  onPickMany?: (ids: string[]) => void
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
 *
 * 줄마다 선 '선택'은 **한 줄로 끝내는 길**이고(누르는 즉시 창이 닫힌다), 체크박스는 **여러 줄을
 * 모아 한 번에 펴는 길**이다. 둘을 함께 두는 이유는 대부분의 지출이 한 줄짜리이기 때문이다 —
 * 그 흔한 경우까지 체크 후 반영 두 번으로 만들면 조작이 늘기만 한다.
 */
export function BudgetRefCell({ label, value, onChange, onPickMany }: Props) {
  const { options, usage, usageLoading, usageError, emptyHint } = useBudgetRefSource()
  const [open, setOpen] = useState(false)
  /**
   * 체크해 둔 줄들 — **아직 반영되지 않은** 선택이다. 창을 열 때마다 비운다(지금 칸의 값으로
   * 시작하지 않는다): 지금 값을 미리 켜 둔 채로 반영하면 고치려던 값이 그대로 다시 들어가고,
   * 그 체크를 끄면 이번엔 아무것도 안 고른 것이 되어 같은 조작이 두 가지 뜻을 갖는다.
   */
  const [checked, setChecked] = useState<string[]>([])
  const multi = Boolean(onPickMany)
  const picked = options.find((o) => o.id === value) ?? null
  // 사용 현황을 모르는 동안 0을 적으면 "아직 한 푼도 안 썼다"는 거짓말이 된다.
  const known = !usageLoading && !usageError
  const num = (v: number | null) => (known ? formatMoney(v) : usageLoading ? '…' : '알 수 없음')

  // 값은 있는데 선택지에 없다 — 근거 품의를 바꿨거나 예산 변경으로 줄이 사라진 자리다.
  // 조용히 비우지 않는다: 비우면 담당자는 자기가 적은 값이 없어진 줄도 모른다.
  const dangling = Boolean(value) && !picked && options.length > 0

  const toggle = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const allChecked = options.length > 0 && options.length === checked.length
  // 체크한 줄을 **목록 순서대로** 편다. 체크한 차례로 펴면 같은 다섯 줄을 고르고도 표에 선
  // 순서가 매번 달라져, 결재자가 예산표와 지출 내역을 나란히 견줄 수 없다.
  const applyChecked = () => {
    const ids = options.filter((o) => checked.includes(o.id)).map((o) => o.id)
    if (ids.length === 0) return
    onPickMany?.(ids)
    setOpen(false)
  }

  return (
    <>
      {/* 경로는 '사업본부 > 운영비 > …'처럼 길어진다. 칸 안에서 끊고 전체는 title로 주는
          일은 `PickerField`가 한다 — 규격(높이·모서리·호버·초점 링·비활성)도 그 칸이 갖는다. */}
      <PickerField
        density="table"
        label={label}
        text={picked ? picked.path : dangling ? '없어진 예산 줄' : ''}
        placeholder="예산 줄 선택"
        open={open}
        // 값은 있는데 고를 수 없는 줄이면 오류다 — 테두리가 위험색으로 덮이고 aria-invalid가 선다.
        invalid={dangling}
        onClick={() => {
          setChecked([])
          setOpen(true)
        }}
      />

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
          // 밀도 맥락을 내려받지 못하는 수제 표라 격자를 `tableGrid`에서 가져온다 —
          // 직접 적으면 같은 화면의 표끼리 행 높이·여백이 갈린다.
          <div className="relative min-w-0 max-w-full overflow-x-auto rounded-radius-md border border-gray-300">
            <table className="w-full border-collapse">
              <thead>
                <tr className={cn(tableGrid.head, 'border-b border-gray-200 bg-gray-25')}>
                  {multi && (
                    <th className={cn('w-10 text-center', tableGrid.cellX)}>
                      <Checkbox
                        density="table"
                        checked={allChecked}
                        // 일부만 켜진 상태는 '켜짐'도 '꺼짐'도 아니다 — DOM 속성이라 ref로만 준다.
                        ref={(el) => {
                          if (el) el.indeterminate = checked.length > 0 && !allChecked
                        }}
                        onChange={() =>
                          setChecked(allChecked ? [] : options.map((o) => o.id))
                        }
                        aria-label="예산 줄 전체 선택"
                      />
                    </th>
                  )}
                  <th className={cn('text-left', tableGrid.cellX, tableText.head)}>항목</th>
                  <th className={cn('w-28 text-right', tableGrid.cellX, tableText.head)}>예산</th>
                  <th className={cn('w-28 text-right', tableGrid.cellX, tableText.head)}>사용</th>
                  <th className={cn('w-28 text-right', tableGrid.cellX, tableText.head)}>
                    결재 중
                  </th>
                  <th className={cn('w-28 text-right', tableGrid.cellX, tableText.head)}>
                    사용 가능
                  </th>
                  <th className={cn('w-20 text-right', tableGrid.cellX, tableText.head)}>선택</th>
                </tr>
              </thead>
              <tbody>
                {options.map((o) => {
                  const u = usage.get(o.id)
                  // 결재 중인 지출도 이미 그 돈을 쥐고 있다. 빼지 않으면 같은 돈을 두 번 쓴다.
                  const available =
                    o.budget === null ? null : o.budget - (u?.spent ?? 0) - (u?.pending ?? 0)
                  return (
                    <tr
                      key={o.id}
                      className={cn(tableGrid.row, 'border-b border-gray-200 last:border-b-0')}
                    >
                      {multi && (
                        <td className={cn('text-center', tableGrid.cellX)}>
                          <Checkbox
                            density="table"
                            checked={checked.includes(o.id)}
                            onChange={() => toggle(o.id)}
                            aria-label={`${o.path} 함께 선택`}
                          />
                        </td>
                      )}
                      <td className={cn(tableGrid.cellX, tableText.body)}>
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
                          'whitespace-nowrap text-right tabular-nums',
                          tableGrid.cellX,
                          tableText.body,
                        )}
                      >
                        {formatMoney(o.budget)}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap text-right tabular-nums',
                          tableGrid.cellX,
                          tableText.body,
                        )}
                      >
                        {num(u?.spent ?? 0)}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap text-right tabular-nums',
                          tableGrid.cellX,
                          tableText.body,
                        )}
                      >
                        {num(u?.pending ?? 0)}
                      </td>
                      <td
                        className={cn(
                          'whitespace-nowrap text-right font-medium tabular-nums',
                          tableGrid.cellX,
                          tableText.body,
                          known && available !== null && available < 0 && 'text-danger',
                        )}
                      >
                        {num(available)}
                      </td>
                      <td className={cn('text-right', tableGrid.cellX)}>
                        <Button
                          density="table"
                          variant={o.id === value ? 'primary' : 'outline'}
                          aria-label={`${o.path} 선택`}
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

        {(value || (multi && options.length > 0)) && (
          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
            {/* 긴 경로가 버튼들을 창 밖으로 밀어내지 않게, 배지가 줄고 버튼이 버틴다.
                Badge 자신이 `shrink-0`이라 `shrink`로 되돌려야 줄어든다(`min-w-0`만으로는 안 준다). */}
            {value ? (
              <Badge tone="neutral" className="min-w-0 flex-1 shrink">
                <span className="block truncate" title={picked?.path}>
                  현재: {picked?.path ?? '없어진 줄'}
                </span>
              </Badge>
            ) : (
              <span className={cn('min-w-0 flex-1', tableText.empty)}>
                체크한 줄 수만큼 지출 내역 행이 만들어집니다.
              </span>
            )}
            {/* 창 안의 조작이라 표 밀도가 아니라 페이지 밀도다(모달은 맥락을 page로 되돌린다). */}
            <div className="flex shrink-0 items-center gap-2">
              {value && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    onChange('')
                    setOpen(false)
                  }}
                >
                  선택 해제
                </Button>
              )}
              {multi && options.length > 0 && (
                <Button disabled={checked.length === 0} onClick={applyChecked}>
                  선택한 {checked.length}개 반영
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
