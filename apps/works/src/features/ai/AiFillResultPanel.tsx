import { cardText, cn } from '@ynarcher/ui'
import { AiFillOutcomeBody } from '@/features/ai/AiFillOutcomeBody'
import type { AiFillOutcome } from '@/features/ai/aiTypes'

/**
 * 창 아래 한 자리 — 실행 전에는 **사용 방법**, 실행 뒤에는 **작성 결과**가 선다.
 *
 * 두 내용이 같은 자리를 쓰는 이유는 자리 절약이 아니라 **순서**다(2026-09-06 사용자 지정).
 * 사용 방법은 아직 아무것도 고르지 않은 창의 빈 상태이고, 결과는 그 방법대로 한 번 실행한
 * 뒤의 답이다. 둘이 함께 서면 다 읽은 안내가 결과 위에 남아 무엇이 이번 실행의 답인지
 * 흐려지고, 결과를 아래로 밀어 스크롤 밖으로 내보낸다.
 *
 * **안내를 접지 않는 예외에 해당한다.** 화면의 규칙 설명은 도움말 말풍선에 접는 것이 원칙이나
 * (CLAUDE.md), 여기 서는 것은 규칙이 아니라 **빈 상태와 다음 행동**이다 — 목록만 놓인 창은
 * 무엇부터 눌러야 하는지 스스로 말하지 못한다. 규칙(무엇이 외부로 나가는가·왜 읽을 자료를
 * 좁히는가)은 그대로 제목 옆 말풍선이 갖는다.
 *
 * 근거: docs/docs_planning/3_3_7_ai_fill_visual_read.md §4
 */
export function AiFillResultPanel<K extends string>({
  outcome,
  cardLabel,
}: {
  outcome: AiFillOutcome<K> | null
  cardLabel: Record<K, string>
}) {
  return (
    <section
      className={cn(
        'rounded-radius-md border px-4 py-3',
        outcome ? 'border-info-border bg-info-subtle' : 'border-gray-200 bg-gray-25',
      )}
    >
      <h3 className={cn('mb-1.5', cardText.subhead)}>{outcome ? '작성 결과' : '사용 방법'}</h3>
      {/* 결과는 길어질 수 있다(카드 열둘의 근거와 경고). 창 전체를 늘리는 대신 이 자리만
          스크롤시킨다 — 목록과 결과가 함께 밀리면 다시 실행할 때 목록을 찾아 올라가야 한다. */}
      <div className={cn('text-body-sm text-gray-800', outcome && 'max-h-[16rem] overflow-y-auto pr-1')}>
        {outcome ? <AiFillOutcomeBody outcome={outcome} cardLabel={cardLabel} /> : <Guide />}
      </div>
    </section>
  )
}

/**
 * 세 단계 — 무엇을 읽히고, 무엇을 쓰게 하고, 실행하면 어디에 담기는가.
 *
 * 2026-09-09에 격자를 걷으면서 이 문구도 함께 바뀐다. 종전 세 줄은 "줄과 열이 만나는 칸을
 * 켠다"와 "선택 자료 분석하기를 먼저 누른다"였는데, 그 칸도 그 버튼도 화면에 없다 — 없는
 * 컨트롤을 가리키는 안내는 안내가 아니라 오답이다.
 */
function Guide() {
  return (
    <ol className="ml-4 list-decimal space-y-1 pl-1">
      <li>
        왼쪽 <span className={cardText.label}>읽을 자료</span>에 있는 것만 AI가 읽습니다. 파일명으로
        종류를 알 수 있는 자료는 이미 올라와 있고, 줄을 누르면 아래 칸으로 내려갑니다. 읽을 자료가
        적을수록 초안이 정확해집니다.
      </li>
      <li>
        오른쪽에서 <span className={cardText.label}>작성할 카드</span>를 고릅니다. 고르지 않은 카드는
        지금 값 그대로 남고, <span className={cardText.label}>있음</span>이 붙은 카드를 켜면 그 값이
        AI 결과로 바뀝니다.
      </li>
      <li>
        작성하면 결과가 이 자리에 서고 값은 뒤편 편집 화면에 채워집니다. 저장하기 전까지 원장은
        바뀌지 않습니다.
      </li>
    </ol>
  )
}
