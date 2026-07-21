import { AI_SUGGESTIONS } from '@/features/hub/aiAgent'
import { YnarcherMark } from '@/features/hub/YnarcherMark'

interface AiAgentWelcomeProps {
  /** 인사말에 노출할 사용자 이름. */
  userName: string
  /** 추천 카드 클릭 시 해당 프롬프트로 질의를 시작. */
  onPick: (prompt: string) => void
}

/** AI 에이전트 히어로(대화 시작 전) 화면 — 인사말 + 빠른 시작 추천 카드. */
export function AiAgentWelcome({ userName, onPick }: AiAgentWelcomeProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-radius-lg bg-gradient-to-br from-brand to-brand-700 shadow-soft">
        <YnarcherMark className="w-11 text-white" />
      </div>

      <h2 className="mt-5 text-title-md font-bold text-gray-900">
        안녕하세요, {userName}님
      </h2>
      <p className="mt-1.5 text-body-lg text-gray-600">
        무엇을 도와드릴까요? 스타트업·전문가·펀드 데이터를 함께 살펴봐요.
      </p>

      <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        {AI_SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onPick(s.prompt)}
            className="group flex items-start gap-3 rounded-radius-md border border-gray-300 bg-white p-4 text-left shadow-soft transition-all duration-fast hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-popover"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-radius-sm bg-brand-25 text-brand transition-colors group-hover:bg-brand group-hover:text-white">
              <s.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block text-body font-semibold text-gray-900">
                {s.title}
              </span>
              <span className="mt-0.5 block text-caption text-gray-600">
                {s.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
