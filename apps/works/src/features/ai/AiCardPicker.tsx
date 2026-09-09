import { Badge, Checkbox, cardText, cn } from '@ynarcher/ui'
import type { AiCardGroupMeta, AiCardMeta } from '@/features/ai/aiCatalog'

/**
 * 'AI 작성하기'에서 **작성할 카드**를 고르는 줄.
 *
 * 격자 시절에는 카드 체크박스를 따로 두지 않았다(한 칸이라도 켜진 카드가 대상이었다). 자료가
 * 한 벌이 된 뒤로는 카드를 고르는 자리가 이것 하나뿐이라 체크박스가 곧 답이다.
 *
 * **묶음 머리는 서버가 실제로 나눠 부르는 탐색 축**이다. 그 이름을 화면에 세우는 이유는 카드가
 * 열둘일 때 한 줄에 다 서면 눈이 어디서 어디까지가 한 덩이인지 못 잡기 때문이지, 담당자가
 * 묶음을 알아야 해서가 아니다. 묶음 이름을 누르면 그 묶음이 통째로 켜지고 꺼진다.
 *
 * **아무것도 켜지지 않은 채 연다**(2026-09-06 사용자 지정 유지). 창을 열자마자 결정이 내려져
 * 있으면 실행이 "고른 것을 실행한다"가 아니라 "정해진 것을 승인한다"가 된다.
 *
 * 값이 있는지는 **카드 이름 옆의 `있음` 배지**가 답한다 — 작성 여부는 상태라 색을 쓰는 것이
 * 맞다. 절반만 찬 카드도 '있음'이다(그 절반은 담당자가 손으로 적은 것이고, 켜면 함께 바뀐다).
 *
 * 근거: docs/docs_planning/3_3_7_ai_fill_visual_read.md §4
 */
export function AiCardPicker<K extends string>({
  cards,
  groups,
  selected,
  disabled,
  onToggle,
  onToggleMany,
}: {
  cards: AiCardMeta<K>[]
  groups: AiCardGroupMeta[]
  selected: K[]
  disabled: boolean
  onToggle: (key: K) => void
  /** 여러 카드를 한 번에 — 켜진 것이 하나라도 있으면 끄고, 없으면 전부 켠다. */
  onToggleMany: (keys: K[]) => void
}) {
  const on = new Set(selected)
  const allKeys = cards.map((c) => c.key)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className={cardText.subhead}>작성할 카드 [{selected.length}]</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onToggleMany(allKeys)}
          className={cn(cardText.meta, 'text-gray-600 underline-offset-2 hover:underline disabled:text-gray-400')}
        >
          {selected.length > 0 ? '전체 해제' : '전체 선택'}
        </button>
      </div>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {groups.map((g) => {
          const members = cards.filter((c) => c.group === g.key)
          if (members.length === 0) return null
          return (
            <div key={g.key} className="space-y-1">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggleMany(members.map((c) => c.key))}
                className={cn(cardText.label, 'text-left underline-offset-2 hover:underline disabled:text-gray-400')}
                title="이 묶음을 한 번에 켜거나 끕니다."
              >
                {g.label}
              </button>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {members.map((c) => (
                  <Checkbox
                    key={c.key}
                    density="card"
                    checked={on.has(c.key)}
                    disabled={disabled}
                    onChange={() => onToggle(c.key)}
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cardText.value}>{c.label}</span>
                        {c.filled && (
                          <Badge
                            tone="info"
                            density="table"
                            title={
                              c.count != null
                                ? `지금 ${c.count}건이 있습니다. 켜면 AI 결과로 바뀝니다.`
                                : '지금 값이 있습니다. 켜면 AI 결과로 바뀝니다.'
                            }
                          >
                            있음
                          </Badge>
                        )}
                      </span>
                    }
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
