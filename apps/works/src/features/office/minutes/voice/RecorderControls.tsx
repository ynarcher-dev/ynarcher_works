import { Button, Spinner } from '@ynarcher/ui'
import { Mic, Square, Upload, AlertTriangle } from 'lucide-react'
import { useRef } from 'react'
import type { VoiceRecorder } from './useVoiceRecorder'

interface Props {
  rec: VoiceRecorder
  /** 전사/초안 진행 중 여부 — 녹음·업로드 버튼을 잠근다. */
  busy: boolean
  /** 이미 오디오나 전사 텍스트가 있으면 기존 작업을 교체한다는 점을 표기. */
  hasContent: boolean
  /** 현재 녹음 경과(ms) — 녹음 중 타이머 표시. */
  elapsedLabel: string
  /** 녹음 종료 → 부모가 오디오 확보 + 전사. */
  onStop: () => void
  /** 저장 세션을 먼저 만든 뒤 녹음을 시작한다. */
  onStart: () => void
  /** 녹취파일 선택 → 부모가 전사. */
  onFile: (file: File) => void
}

/**
 * 회의 녹음의 입력 컨트롤(녹음 + 녹취파일 업로드).
 * 녹음 시작이 마이크 권한 요청까지 함께 맡아, 시작 전에 별도 확인 버튼을 거치지 않는다.
 * 녹음 종료 후 오디오 처리와 전사는 부모(VoiceMinutePanel)가 담당한다.
 */
export function RecorderControls({ rec, busy, hasContent, elapsedLabel, onStart, onStop, onFile }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const recording = rec.status === 'recording'
  const canTranscribe = !busy && !recording

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    if (file) onFile(file)
  }

  return (
    <>
      {/* 마이크 상태 컨트롤 -------------------------------------------------- */}
      {rec.status === 'idle' && (
        <Button className="w-full" onClick={onStart} disabled={busy}>
          <Mic className="h-4 w-4" strokeWidth={1.75} />
          {hasContent ? '다시 녹음' : '녹음 시작'}
        </Button>
      )}

      {rec.status === 'checking' && (
        <div className="flex items-center justify-center gap-2 py-1 text-body text-gray-500">
          <Spinner /> 마이크 여는 중…
        </div>
      )}

      {(rec.status === 'denied' || rec.status === 'unsupported' || rec.status === 'error') && (
        <div className="space-y-2">
          <p className="flex items-start gap-1.5 text-caption text-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {rec.error}
          </p>
          {rec.status !== 'unsupported' && (
            <Button variant="outline" className="w-full" onClick={onStart}>
              녹음 다시 시도
            </Button>
          )}
        </div>
      )}

      {rec.status === 'ready' && !recording && (
        <>
          <Button className="w-full" onClick={onStart} disabled={busy}>
            <Mic className="h-4 w-4" strokeWidth={1.75} />
            {hasContent ? '다시 녹음' : '녹음 시작'}
          </Button>
        </>
      )}

      {recording && (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2 text-body text-gray-600">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-danger" />
            녹음 중 · {elapsedLabel}
          </div>
          <Button variant="danger" className="w-full" onClick={onStop}>
            <Square className="h-4 w-4" strokeWidth={1.75} />
            녹음 종료
          </Button>
        </div>
      )}

      {/* 녹취파일 업로드 — 녹음 중이 아니면 항상 한 개만 노출한다. */}
      {!recording && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canTranscribe}
        >
          <Upload className="h-4 w-4" strokeWidth={1.75} />
          녹취파일 업로드
        </Button>
      )}

      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handlePick} />
    </>
  )
}
