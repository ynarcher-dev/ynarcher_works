import { Badge, Card, Checkbox, cardText, cn } from '@ynarcher/ui'
import type { AiCardGroupMeta, AiCardMeta } from '@/features/ai/aiCatalog'

/**
 * 'AI 작성하기'에서 **작성할 카드**를 고르는 칸 — 창의 오른쪽 기둥이다.
 *
 * 격자 시절에는 카드 체크박스를 따로 두지 않았다(한 칸이라도 켜진 카드가 대상이었다). 자료가
 * 한 벌이 된 뒤로는 카드를 고르는 자리가 이것 하나뿐이라 체크박스가 곧 답이다.
 *
 * **자료 두 칸과 같은 카드 셸에 담는다**(2026-09-09 사용자 지정 2열 배치). 왼쪽 기둥이 카드
 * 상자 둘인데 오른쪽만 맨몸으로 서면 같은 줄의 두 기둥이 서로 다른 격이 되고, 그 차이가
 * '고르는 자리'와 '보는 자리'의 구분처럼 읽힌다 — 셋 다 고르는 자리다.
 *
 * **묶음 머리는 서버가 실제로 나눠 부르는 탐색 축**이다. 그 이름을 화면에 세우는 이유는 카드가
 * 열둘일 때 한 줄에 다 서면 눈이 어디서 어디까지가 한 덩이인지 못 잡기 때문이지, 담당자가
 * 묶음을 알아야 해서가 아니다. 묶음 이름을 누르면 그 묶음이 통째로 켜지고 꺼진다.
 *
 * **묶음이 열이고 그 안의 카드가 행이다** — 격자 시절 열 머리의 배치를 그대로 물려받는다.
 * 오른쪽 기둥이 넓으므로(창 폭의 58%) 묶음 넷이 한 줄에 서고, 같은 묶음의 카드는 세로로 쌓여
 * 눈이 덩이를 한 번에 잡는다. 좁은 화면에서는 두 열, 더 좁으면 한 열로 접힌다.
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
    <Card
      title="작성할 카드"
      count={selected.length}
      help="체크한 카드만 AI가 채웁니다. 체크하지 않은 카드는 지금 값 그대로 남습니다. 이미 값이 있는 카드에는 '있음'이 서며, 켜면 그 값이 AI 결과로 바뀝니다(저장 전까지는 되돌릴 수 있습니다)."
      actions={
        <button
          type="button"
          disabled={disabled}
          onClick={() => onToggleMany(allKeys)}
          className={cn(cardText.meta, 'text-gray-600 underline-offset-2 hover:underline disabled:text-gray-400')}
        >
          {selected.length > 0 ? '전체 해제' : '전체 선택'}
        </button>
      }
    >
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
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
              {/* 한 묶음의 카드는 세로로 쌓는다 — 열 안에서 줄바꿈으로 흩어지면 어느 카드가
                  어느 묶음의 것인지가 줄마다 달라진다. */}
              <div className="flex flex-col gap-y-1">
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
    </Card>
  )
}
