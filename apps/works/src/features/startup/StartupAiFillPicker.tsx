import { Badge, Checkbox, cardText, cn } from '@ynarcher/ui'
import type { EntityRow } from '@/features/master/entityHooks'
import { formatBytes } from '@/features/networks/materialHooks'
import type { AiSource } from '@/features/startup/startupAiFill'
import { AI_SUPPORTED_HINT } from '@/features/startup/startupAiFormats'
import { AI_CARDS, type AiCardBand, type AiCardKey } from '@/features/startup/startupAiCards'

/**
 * 'AI 작성하기' 모달의 선택 목록 — 읽을 자료(좌)와 작성할 카드(우).
 *
 * 두 목록을 위아래가 아니라 **좌우로 세운다**(2026-09-06). 결재선 설정과 같은 구성인데,
 * 이유도 같다 — 두 목록은 순서대로 거치는 단계가 아니라 **함께 보며 맞추는 짝**이다. 자료가
 * 무엇인지 보면서 어느 카드를 채울 수 있을지 가늠하고, 카드를 고르다 자료를 더 켜기도 한다.
 * 위아래로 쌓으면 그 왕복이 스크롤이 되어, 자료 열넷·카드 열둘에서는 한쪽을 볼 때 다른 쪽이
 * 화면 밖으로 나간다.
 *
 * 목록마다 **첫 행이 전체 선택**이다. 열넷을 하나씩 끄는 일과 하나만 남기는 일이 같은 빈도로
 * 있어서, 그 자리가 없으면 어느 쪽이든 열네 번 눌러야 한다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.2
 */

/** 목록 상자의 공통 껍데기. 두 기둥의 상자가 같은 규격으로 서도록 한곳에서 정한다. */
const boxClass = 'min-h-0 flex-1 overflow-auto rounded-radius-md border border-gray-200'

/**
 * 목록 첫 행 — 전체 선택/해제.
 *
 * 라벨이 상태에 따라 바뀐다("전체 선택" ↔ "전체 해제"). 체크 상태만으로도 뜻은 통하지만,
 * 이 행이 하는 일은 값을 고르는 것이 아니라 **한 번에 처리하는 것**이라 그 동작을 글자로
 * 말해 두는 편이 누르기 전에 결과를 안다.
 */
function SelectAllRow({
  allChecked,
  count,
  total,
  onToggle,
}: {
  allChecked: boolean
  count: number
  total: number
  onToggle: () => void
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2">
      <Checkbox checked={allChecked} onChange={onToggle} label={allChecked ? '전체 해제' : '전체 선택'} />
      <span className={cardText.meta}>
        {count} / {total}
      </span>
    </div>
  )
}

/**
 * 읽을 수 있는 자료 목록.
 *
 * 이미 올라간 첨부와 아직 안 올라간 파일이 한 목록에 섞여 선다 — 등록 모드에서는 뒤쪽만,
 * 수정 모드에서는 앞쪽만 온다. 고르는 사람에게는 둘이 같은 일이므로 화면도 가르지 않는다.
 */
export function AiFileList({
  sources,
  selected,
  onToggle,
  onToggleAll,
}: {
  sources: AiSource[]
  selected: string[]
  onToggle: (key: string) => void
  onToggleAll: () => void
}) {
  const chosen = sources.filter((s) => selected.includes(s.key))
  const allChecked = sources.length > 0 && chosen.length === sources.length
  return (
    <div className={cn(boxClass, 'flex flex-col')}>
      <SelectAllRow allChecked={allChecked} count={chosen.length} total={sources.length} onToggle={onToggleAll} />
      {sources.length === 0 ? (
        <p className={cn('px-3 py-8 text-center', cardText.meta)}>읽을 수 있는 자료가 없습니다.</p>
      ) : (
        <ul>
          {sources.map((s) => (
            <li
              key={s.key}
              className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 last:border-b-0"
            >
              <Checkbox
                checked={selected.includes(s.key)}
                onChange={() => onToggle(s.key)}
                label={<span className="block min-w-0 truncate">{s.name}</span>}
              />
              {/* 링크에는 용량이 없다. '-'는 모른다는 뜻이라 사실과 다르므로 아예 세우지 않는다. */}
              {s.bytes != null && <span className={cn('shrink-0', cardText.meta)}>{formatBytes(s.bytes)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * 읽을 수 없는 자료 목록.
 *
 * 체크박스를 두지 않는다 — 고를 수 없는 줄에 고르는 컨트롤을 세우면 왜 안 눌리는지를 커서를
 * 올려 봐야 안다. 지원 형식 안내도 **줄마다가 아니라 목록에 한 번** 적는다(줄마다 적으면 같은
 * 문장이 열 번 서서, 정작 어느 파일이 걸렸는지가 그 문장에 묻힌다).
 */
export function AiBlockedList({ sources }: { sources: AiSource[] }) {
  if (sources.length === 0) return null
  return (
    <div className="space-y-1">
      <p className={cardText.subhead}>읽을 수 없는 자료 [{sources.length}]</p>
      <div className="max-h-28 overflow-auto rounded-radius-md border border-gray-200 bg-gray-50">
        <ul>
          {sources.map((s) => (
            <li key={s.key} className="border-b border-gray-100 px-3 py-1.5 last:border-b-0">
              <span className={cn('block truncate', cardText.meta)}>{s.name}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* 막힌 이유는 접지 않는다 — 왜 못 고르는지는 다음 행동을 지시하는 안내다. */}
      <p className={cardText.meta}>지원 형식: {AI_SUPPORTED_HINT}</p>
    </div>
  )
}

/**
 * 작성할 카드 목록. 상세 화면과 같은 밴드·순서(기본 2 → 역량 4 → 실적 6)로 선다.
 *
 * 각 줄 오른쪽의 **Y/N은 지금 그 카드에 값이 있는가**다. 이 한 글자가 왜 어떤 카드는 기본으로
 * 꺼져 있는지를 답하고, Y인 카드를 켜는 순간에만 교체 경고가 선다 — 되돌릴 수 있다는 말을
 * 함께 적는 이유는, 경고가 과하면 담당자가 정작 필요한 갱신을 망설이기 때문이다.
 */
export function AiCardList({
  record,
  selected,
  onToggle,
  onToggleAll,
}: {
  record: EntityRow
  selected: AiCardKey[]
  onToggle: (key: AiCardKey) => void
  onToggleAll: () => void
}) {
  const bands: AiCardBand[] = ['기본', '역량', '실적']
  const allChecked = selected.length === AI_CARDS.length
  return (
    <div className={cn(boxClass, 'flex flex-col')}>
      <SelectAllRow
        allChecked={allChecked}
        count={selected.length}
        total={AI_CARDS.length}
        onToggle={onToggleAll}
      />
      <div className="px-3 py-2">
        {bands.map((band) => (
          <div key={band} className="mb-3 last:mb-0">
            <p className={cn('mb-1.5', cardText.subhead)}>{band}</p>
            <ul className="space-y-1.5">
              {AI_CARDS.filter((c) => c.band === band).map((card) => {
                const filled = card.filled(record)
                const count = filled ? card.count?.(record) : undefined
                const checked = selected.includes(card.key)
                return (
                  <li key={card.key}>
                    <div className="flex items-center justify-between gap-2">
                      <Checkbox checked={checked} onChange={() => onToggle(card.key)} label={card.label} />
                      <span className="flex shrink-0 items-center gap-1.5">
                        {count != null && <span className={cardText.meta}>{count}건</span>}
                        {/* 작성 여부는 상태이므로 색을 쓴다. 값이 있는 쪽(Y)만 눈에 걸리면 되고,
                            비어 있는 쪽은 물러나야 스무 줄에서 Y가 먼저 보인다. */}
                        <Badge tone={filled ? 'info' : 'neutral'} density="table" title={filled ? '값 있음' : '비어 있음'}>
                          {filled ? 'Y' : 'N'}
                        </Badge>
                      </span>
                    </div>
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
    </div>
  )
}
