import {
  CalendarClock,
  ChartNoAxesCombined,
  Rocket,
  Users,
  type LucideIcon,
} from 'lucide-react'

/** 대화 참여자 구분. */
export type AiRole = 'user' | 'assistant'

/** 단일 대화 메시지. `pending`은 응답 생성 중(타이핑 인디케이터) 상태. */
export interface AiMessage {
  id: string
  role: AiRole
  content: string
  pending?: boolean
}

/** 히어로 화면의 빠른 시작 추천 카드. */
export interface AiSuggestion {
  icon: LucideIcon
  title: string
  description: string
  prompt: string
}

/**
 * 빠른 시작 추천 프리셋 — AC/VC 업무 맥락에 맞춘 예시 질의.
 * 실제 응답은 RAG/Text-to-SQL(Gemini) 연동 후 연결됩니다.
 */
export const AI_SUGGESTIONS: AiSuggestion[] = [
  {
    icon: Rocket,
    title: '포트폴리오 브리핑',
    description: '보육 중인 스타트업의 최근 진척을 요약',
    prompt: '보육 중인 스타트업들의 이번 달 주요 진척 상황을 요약해줘.',
  },
  {
    icon: CalendarClock,
    title: '일정 정리',
    description: '이번 주 미팅·마감 일정을 한눈에',
    prompt: '이번 주에 예정된 미팅과 마감 일정을 정리해줘.',
  },
  {
    icon: ChartNoAxesCombined,
    title: '펀드 현황 분석',
    description: '운용 펀드의 소진율·잔여 약정 파악',
    prompt: '운용 중인 펀드의 소진율과 잔여 약정 금액을 분석해줘.',
  },
  {
    icon: Users,
    title: '전문가 매칭',
    description: '스타트업에 어울리는 멘토 추천',
    prompt: '핀테크 분야 스타트업에 어울리는 멘토 전문가를 추천해줘.',
  },
]

/**
 * 모델 연동 전 임시 미리보기 응답.
 * Gemini RAG/Text-to-SQL 파이프라인이 확정되면 이 함수를 실제 스트리밍 호출로 대체합니다.
 */
export function draftPreviewReply(prompt: string): string {
  return [
    `"${prompt.trim()}"에 대한 답변을 준비하는 화면입니다.`,
    '',
    '현재 AI 에이전트는 UI 미리보기 단계로, 아직 실제 데이터 모델(Gemini RAG · Text-to-SQL)과 연결되어 있지 않습니다. 연동이 완료되면 권한(RLS) 범위 안의 스타트업·전문가·펀드 데이터를 근거로 실시간 답변과 출처를 제공합니다.',
  ].join('\n')
}
