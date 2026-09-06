import { Badge, cardText, cn, type BadgeTone } from '@ynarcher/ui'
import type { AiSource } from '@/features/startup/startupAiFill'
import { extractable, stateLabel, type AiSourceStatus } from '@/features/startup/startupAiExtractState'

/**
 * 자료 줄의 분석 상태 한 줄 — 배지 · 요약 · 그 줄에서 할 수 있는 일.
 *
 * **상태에 색을 쓰는 것이 맞는 자리다.** 배지는 값이 아니라 상태를 말하고(5_component_spec
 * §3.4), 담당자가 격자를 훑으며 찾는 것이 바로 "아직 안 연 줄"이다.
 *
 * **'원본으로' 스위치는 뜻이 있는 줄에만 세운다.** PDF·이미지는 이미 원본으로 가고, 오피스는
 * 모델이 받지 못해 원본으로 보낼 수 없으며, 링크는 서버가 가져온 것이 곧 원본이다. 남는 것은
 * 글자 계열 파일뿐인데, 줄마다 세우면 그 드문 선택이 매번 골라야 하는 칸으로 읽힌다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.3
 */

const TONES: Record<AiSourceStatus['state'], BadgeTone> = {
  idle: 'neutral',
  running: 'info',
  ready: 'success',
  failed: 'danger',
  original: 'neutral',
  stale: 'warning',
}

/** 이 줄에서 '원본으로 보내기'가 뜻을 갖는가. */
function canForceOriginal(source: AiSource): boolean {
  if (source.kind === 'link') return false
  if (source.kind === 'attachment' && source.url) return false
  // 오피스는 모델이 받지 않으므로 원본으로 보낼 길이 없다. 열 수 없는 형식(PDF·이미지)은
  // 이미 원본으로 간다. 남는 것은 우리가 열 수 있으면서 모델도 받는 글자 계열이다.
  const name = source.name.toLowerCase()
  if (/\.(xlsx|docx|pptx)$/.test(name)) return false
  return extractable(source)
}

export function StartupAiSourceState({
  source,
  status,
  forcedOriginal,
  disabled,
  onAnalyze,
  onToggleOriginal,
}: {
  source: AiSource
  status: AiSourceStatus
  forcedOriginal: boolean
  /** 다른 자료를 여는 중이면 이 줄의 버튼도 잠근다(같은 작업자를 쓴다). */
  disabled: boolean
  onAnalyze: () => void
  onToggleOriginal: () => void
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <Badge tone={TONES[status.state]} density="table">
        {stateLabel(status.state)}
      </Badge>
      {status.detail && (
        <span className={cn('min-w-0 truncate', cardText.meta)} title={status.detail}>
          {status.detail}
        </span>
      )}
      {status.analyzable && (
        <button
          type="button"
          onClick={onAnalyze}
          disabled={disabled}
          className={cn(cardText.meta, 'text-brand underline-offset-2 hover:underline disabled:text-gray-400')}
        >
          {status.state === 'idle' ? '분석' : '다시 분석'}
        </button>
      )}
      {canForceOriginal(source) && (
        <button
          type="button"
          onClick={onToggleOriginal}
          disabled={disabled}
          className={cn(cardText.meta, 'text-gray-500 underline-offset-2 hover:underline disabled:text-gray-400')}
          title={
            forcedOriginal
              ? '분석한 글자 대신 원본을 보내도록 지정했습니다. 눌러서 되돌립니다.'
              : '이 자료만 원본 그대로 AI에 보냅니다.'
          }
        >
          {forcedOriginal ? '분석본으로' : '원본으로'}
        </button>
      )}
    </div>
  )
}
