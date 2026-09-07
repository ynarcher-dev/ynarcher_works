import { cardText } from '@ynarcher/ui'
import type { AiEvidence } from '@/features/ai/aiTypes'

/**
 * 카드별 근거 — **어디서 읽었는지와, 그것을 우리가 확인했는지**를 함께 세운다.
 *
 * 종전에는 모델이 지은 문자열 한 줄("p.47 재무 현황")이 툴팁 안에 접혀 있었다. 담당자에게
 * 그것은 확인할 수 없는 안내였다 — 있으면 안심이 되는데 틀렸을 때 알 방법이 없으니, 안심하는
 * 쪽으로만 작동했다. 이제 서버가 조각 id로 되짚어 인용문이 원문에 실재하는지 대조하므로,
 * **확인된 것과 확인하지 못한 것을 갈라 보여 주는 것**이 이 컴포넌트의 일이다.
 *
 * **접지 않는다.** 근거는 저장 전에 눈으로 훑는 값이라 툴팁 뒤에 두면 아무도 열지 않는다.
 * 대신 카드마다 한 줄로 눕히고 인용문은 한 줄에서 잘라 세운다 — 전문이 필요한 사람은 자료를
 * 열어야 하고, 그 자료의 이름과 자리가 여기 있다.
 *
 * '미검증'은 실패가 아니다. 우리가 열지 않은 자료(PDF·이미지)를 가리킨 것이라 대조할 글자가
 * 없다는 뜻이며, 지어낸 근거는 서버가 이미 떼어 내고 그 건수를 그 카드의 경고가 말한다.
 *
 * 카드 이름은 **받아서** 쓴다. 이 컴포넌트가 하는 일은 대상이 무엇이든 같고 갈리는 것은
 * 이름뿐이라, 목록을 직접 들면 그 순간 한 대상의 것이 된다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.4·§16.15
 */
export function AiFillEvidence<K extends string>({
  cards,
  evidence,
  cardLabel,
}: {
  cards: K[]
  evidence: Partial<Record<K, AiEvidence[]>>
  cardLabel: Record<K, string>
}) {
  const shown = cards.filter((k) => (evidence[k]?.length ?? 0) > 0)
  if (shown.length === 0) return null

  return (
    <div className="space-y-1">
      <p className={cardText.meta}>근거</p>
      <ul className="space-y-1">
        {shown.map((key) => (
          <li key={key}>
            <span className={cardText.label}>{cardLabel[key]}</span>
            <ul className="ml-3 list-disc pl-3">
              {(evidence[key] ?? []).map((item, i) => (
                <li key={i} className={cardText.value}>
                  <span className="text-gray-600">
                    {item.fileName}
                    {item.location ? ` · ${item.location}` : ''}
                  </span>
                  {item.quote ? <span> — “{item.quote}”</span> : null}
                  {/* 확인하지 못한 것만 표시한다 — 확인된 것이 기본이고, 기본에 표를 달면
                      그 표가 배경이 되어 정작 예외가 눈에 걸리지 않는다. */}
                  {!item.verified && <span className={`ml-1 ${cardText.meta}`}>(미검증)</span>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
