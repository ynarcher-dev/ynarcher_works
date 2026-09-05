import { Checkbox, cardText } from '@ynarcher/ui'
import type { EntityRow } from '@/features/master/entityHooks'
import { formatBytes, isPdfMaterial, materialDisplayName, type Material } from '@/features/networks/materialHooks'
import { AI_CARDS, type AiCardKey } from '@/features/startup/startupAiCards'

/**
 * 'AI 작성하기' 모달의 두 선택 목록 — 읽을 자료와 작성할 카드.
 *
 * 순서는 **재료 → 대상**이다. 무엇을 근거로 삼는지가 정해져야 어느 카드를 채울 수 있을지
 * 가늠이 서고, 반대로 두면 카드를 고른 뒤 근거가 없어 되돌아오게 된다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.2
 */

/** 읽을 자료 목록. PDF가 아닌 파일은 체크할 수 없고 이유를 그 줄에서 밝힌다. */
export function AiFileList({
  materials,
  selected,
  onToggle,
}: {
  materials: Material[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <ul className="space-y-1.5">
      {materials.map((m) => {
        const pdf = isPdfMaterial(m)
        return (
          <li key={m.id} className="flex items-center gap-2">
            <Checkbox
              checked={selected.includes(m.id)}
              disabled={!pdf}
              onChange={() => onToggle(m.id)}
              label={
                <span className="flex min-w-0 flex-wrap items-center gap-x-2">
                  <span className={`min-w-0 truncate ${pdf ? '' : 'text-gray-500'}`}>
                    {materialDisplayName(m)}
                  </span>
                  <span className={cardText.meta}>{formatBytes(m.byte_size)}</span>
                  {/* 막힌 이유는 접지 않는다 — 왜 못 고르는지는 다음 행동을 지시하는 안내다. */}
                  {!pdf && <span className={cardText.meta}>PDF만 읽을 수 있습니다 · PDF로 변환해 올려 주세요</span>}
                </span>
              }
            />
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 작성할 카드 목록. 상세 화면과 같은 밴드·순서(역량 4 → 실적 6)로 선다.
 *
 * 값이 있는 카드에는 '작성됨'을 붙여 왜 기본으로 꺼져 있는지를 그 줄이 답하게 하고, 그 카드를
 * 켜는 순간에만 교체 경고가 선다 — 되돌릴 수 없는 일이 아니라(저장 전이므로) 되돌릴 수 있음을
 * 함께 적는 이유는, 경고가 과하면 담당자가 정작 필요한 갱신을 망설이기 때문이다.
 */
export function AiCardList({
  record,
  selected,
  onToggle,
}: {
  record: EntityRow
  selected: AiCardKey[]
  onToggle: (key: AiCardKey) => void
}) {
  const bands: ('역량' | '실적')[] = ['역량', '실적']
  return (
    <div className="space-y-3">
      {bands.map((band) => (
        <div key={band}>
          <p className={`mb-1.5 ${cardText.subhead}`}>{band}</p>
          <ul className="space-y-1.5">
            {AI_CARDS.filter((c) => c.band === band).map((card) => {
              const filled = card.filled(record)
              const count = filled ? card.count?.(record) : undefined
              const checked = selected.includes(card.key)
              return (
                <li key={card.key}>
                  <Checkbox
                    checked={checked}
                    onChange={() => onToggle(card.key)}
                    label={
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span>{card.label}</span>
                        <span className={cardText.meta}>
                          {filled ? `작성됨${count ? ` · ${count}건` : ''}` : '비어 있음'}
                        </span>
                      </span>
                    }
                  />
                  {filled && checked && (
                    <p className="ml-6 text-caption text-warning">
                      현재 값이 AI 결과로 바뀝니다. 저장 전까지는 되돌릴 수 있습니다.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
