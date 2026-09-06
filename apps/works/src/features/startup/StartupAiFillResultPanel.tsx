import { cardText, cn } from '@ynarcher/ui'
import { StartupAiFillOutcomeBody } from '@/features/startup/StartupAiFillOutcomeBody'
import type { AiFillOutcome } from '@/features/startup/startupAiMerge'

/**
 * 격자 아래 한 자리 — 실행 전에는 **사용 방법**, 실행 뒤에는 **작성 결과**가 선다.
 *
 * 두 내용이 같은 자리를 쓰는 이유는 자리 절약이 아니라 **순서**다(2026-09-06 사용자 지정).
 * 사용 방법은 아직 아무것도 고르지 않은 창의 빈 상태이고, 결과는 그 방법대로 한 번 실행한
 * 뒤의 답이다. 둘이 함께 서면 다 읽은 안내가 결과 위에 남아 무엇이 이번 실행의 답인지
 * 흐려지고, 결과를 아래로 밀어 스크롤 밖으로 내보낸다.
 *
 * **안내를 접지 않는 예외에 해당한다.** 화면의 규칙 설명은 도움말 말풍선에 접는 것이 원칙이나
 * (CLAUDE.md), 여기 서는 것은 규칙이 아니라 **빈 상태와 다음 행동**이다 — 격자만 놓인 창은
 * 무엇부터 눌러야 하는지 스스로 말하지 못한다. 규칙(왜 자료를 갈라 지정하는가·무엇이 외부로
 * 나가는가)은 그대로 제목 옆 말풍선이 갖는다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.4
 */
export function StartupAiFillResultPanel({ outcome }: { outcome: AiFillOutcome | null }) {
  return (
    <section
      className={cn(
        'rounded-radius-md border px-4 py-3',
        outcome ? 'border-info-border bg-info-subtle' : 'border-gray-200 bg-gray-25',
      )}
    >
      <h3 className={cn('mb-1.5', cardText.subhead)}>{outcome ? '작성 결과' : '사용 방법'}</h3>
      {/* 결과는 길어질 수 있다(카드 열둘의 근거와 경고). 창 전체를 늘리는 대신 이 자리만
          스크롤시킨다 — 격자와 결과가 함께 밀리면 다시 실행할 때 격자를 찾아 올라가야 한다. */}
      <div className={cn('text-body-sm text-gray-800', outcome && 'max-h-[16rem] overflow-y-auto pr-1')}>
        {outcome ? <StartupAiFillOutcomeBody outcome={outcome} /> : <Guide />}
      </div>
    </section>
  )
}

/** 세 단계 — 무엇을 켜고, 무엇을 먼저 해 두면 좋고, 실행하면 어디에 담기는가. */
function Guide() {
  return (
    <ol className="ml-4 list-decimal space-y-1 pl-1">
      <li>
        줄(자료)과 열(카드)이 만나는 칸을 켭니다. 켜진 자료만 그 카드의 근거가 되므로, 재무
        카드에 발표 자료를 함께 켜면 확정 재무 대신 목표 수치가 들어올 수 있습니다.
      </li>
      <li>
        <span className={cardText.label}>선택 자료 분석하기</span>를 먼저 누르면 자료를 한 번만
        열어 두고 다음 실행부터 다시 읽지 않습니다. 누르지 않아도 작성은 되며, 그때는 작성하는
        동안 읽어 시간이 더 걸립니다.
      </li>
      <li>
        작성하면 결과가 이 자리에 서고 값은 뒤편 편집 화면에 채워집니다. 저장하기 전까지 원장은
        바뀌지 않습니다.
      </li>
    </ol>
  )
}
