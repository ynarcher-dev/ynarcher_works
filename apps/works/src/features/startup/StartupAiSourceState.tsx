import { Badge, IconButton, cardText, cn, type BadgeTone } from '@ynarcher/ui'
import { RotateCcw } from 'lucide-react'
import type { AiSource } from '@/features/startup/startupAiFill'
import { extractable, stateLabel, type AiSourceStatus } from '@/features/startup/startupAiExtractState'

/**
 * 자료 줄의 분석 상태 한 칸 — 배지 하나와, 다시 분석하는 아이콘 하나.
 *
 * **상태에 색을 쓰는 것이 맞는 자리다.** 배지는 값이 아니라 상태를 말하고(5_component_spec
 * §3.4), 담당자가 격자를 훑으며 찾는 것이 바로 "아직 안 연 줄"이다.
 *
 * **요약 건수(시트·표·글자 수)는 세우지 않는다**(2026-09-06 사용자 지정). 그 값은 담당자의
 * 다음 행동을 바꾸지 않는데 줄마다 서서 칸을 넓히고, 넓어진 칸이 표를 가로로 밀어 스크롤을
 * 만들었다. 상태를 아는 데 필요한 것은 '분석 완료'라는 사실 하나이고, 자세한 값은 배지에
 * 커서를 올리면 답한다.
 *
 * **실패 사유만은 접지 않는다.** 건수는 알아도 그만이지만 실패는 담당자가 고쳐야 하는 것이라
 * (암호 해제·PDF로 다시 저장), 그 줄에서 이유가 보이지 않으면 왜 안 되는지 알 수 없다.
 *
 * **버튼이 아니라 아이콘이다.** '분석'·'다시 분석' 두 글자 링크가 줄마다 서면 자료 목록이
 * 아니라 링크 목록으로 읽힌다. 되돌아 도는 화살표는 이 저장소가 다시 실행에 쓰는 표시다
 * (`RotateCcw` — 꺼진 모듈 되살리기·재시도와 같은 아이콘).
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
  const first = status.state === 'idle'
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Badge tone={TONES[status.state]} density="table" title={status.detail || undefined}>
        {stateLabel(status.state)}
      </Badge>
      {status.analyzable && (
        <IconButton
          density="table"
          variant="ghost"
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          label={first ? `${source.name} 분석` : `${source.name} 다시 분석`}
          title={first ? '이 자료를 열어 글자로 바꿔 둡니다.' : '이 자료를 다시 엽니다.'}
          onClick={onAnalyze}
          disabled={disabled}
        />
      )}
      {/* 고쳐야 하는 것만 글자로 선다. 칸이 좁아 잘리므로 전문은 커서를 올리면 답한다. */}
      {status.state === 'failed' && status.detail && (
        <span className={cn('min-w-0 truncate', cardText.meta)} title={status.detail}>
          {status.detail}
        </span>
      )}
      {canForceOriginal(source) && (
        <button
          type="button"
          onClick={onToggleOriginal}
          disabled={disabled}
          className={cn(cardText.meta, 'shrink-0 text-gray-500 underline-offset-2 hover:underline disabled:text-gray-400')}
          title={
            forcedOriginal
              ? '분석한 글자 대신 원본을 보내도록 지정했습니다. 눌러서 되돌립니다.'
              : '이 자료만 원본 그대로 AI에 보냅니다.'
          }
        >
          {forcedOriginal ? '분석본' : '원본'}
        </button>
      )}
    </div>
  )
}
