import { Button, PanelCard, Spinner } from '@ynarcher/ui'
import { Sparkles, RotateCcw, AlertTriangle, Save, Check, Music } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatBytes } from '@/features/networks/materialHooks'
import { FrequencyVisualizer } from './FrequencyVisualizer'
import { RecorderControls } from './RecorderControls'
import { transcribeLong, type TranscribeProgress } from './chunkedTranscribe'
import { useVoiceRecorder } from './useVoiceRecorder'
import { generateMinuteDraft, type DraftContext, type MinuteDraft } from './voiceMinuteApi'

interface Props {
  /** 초안 맥락(제목·회의일·참석자·안건). AI에 함께 전달된다. */
  context: DraftContext
  /** 생성된 초안을 상위 폼(제목·안건·본문)에 반영. */
  onApplyDraft: (draft: MinuteDraft) => void
  /** 녹음·업로드한 오디오를 회의록 '음성 기록' 전용 슬롯에 저장. 신규는 보류 첨부, 수정은 즉시 업로드된다. */
  onSaveAudio: (file: File) => Promise<void>
}

/** ms를 mm:ss로. */
function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** 녹음 오디오의 첨부 파일명(회의일 있으면 사용, 없으면 오늘 날짜). */
function audioFileName(meetingDate?: string | null): string {
  const base = (meetingDate && meetingDate.trim()) || new Date().toISOString().slice(0, 10)
  return `회의녹음-${base}.wav`
}

/**
 * 회의록 음성 패널. 두 기능을 독립적으로 다룬다.
 *  - 음성 기록: 마이크 녹음 또는 오디오 파일 업로드 → Gemini 전사(텍스트) + 원본 오디오 첨부 저장.
 *  - AI 초안: 전사·직접 입력·붙여넣기 등 어떤 텍스트든 있으면 Gemini로 초안 생성.
 * 두 버튼은 서로를 강제하지 않는다(전사 없이 초안만, 초안 없이 오디오 저장만 가능).
 */
export function VoiceMinutePanel({ context, onApplyDraft, onSaveAudio }: Props) {
  const rec = useVoiceRecorder()
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState<null | 'transcribing' | 'drafting'>(null)
  const [progress, setProgress] = useState<TranscribeProgress | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  // 저장 가능한 마지막 오디오(녹음 또는 업로드본)와 그 저장 상태.
  const [audio, setAudio] = useState<File | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // 녹음본 미리듣기용 blob URL — 저장 전에 바로 들어볼 수 있게 한다(오디오가 바뀌면 이전 URL은 해제).
  const audioUrl = useMemo(() => (audio ? URL.createObjectURL(audio) : null), [audio])
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const recording = rec.status === 'recording'
  const micLive = rec.status === 'ready' || recording

  async function runTranscribe(file: File) {
    setApiError(null)
    setBusy('transcribing')
    setProgress(null)
    try {
      const text = await transcribeLong(file, setProgress)
      setTranscript((prev) => (prev ? `${prev}\n${text}` : text).trim())
    } catch (e) {
      setApiError(e instanceof Error ? e.message : '음성 전사에 실패했습니다.')
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  async function handleStop() {
    const blob = await rec.stop()
    if (!blob) return
    const file = new File([blob], audioFileName(context.meetingDate), { type: 'audio/wav' })
    setAudio(file)
    setSaveState('idle')
    await runTranscribe(file)
  }

  function handleFile(file: File) {
    setAudio(file)
    setSaveState('idle')
    void runTranscribe(file)
  }

  async function handleSaveAudio() {
    if (!audio) return
    setSaveState('saving')
    setSaveError(null)
    try {
      await onSaveAudio(audio)
      setSaveState('saved')
    } catch (e) {
      setSaveState('idle')
      setSaveError(e instanceof Error ? e.message : '음성 파일 저장에 실패했습니다.')
    }
  }

  async function handleDraft() {
    setApiError(null)
    setBusy('drafting')
    try {
      const draft = await generateMinuteDraft(transcript, context)
      onApplyDraft(draft)
      setApplied(true)
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'AI 초안 생성에 실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  function handleReset() {
    rec.reset()
    setTranscript('')
    setApiError(null)
    setApplied(false)
    setAudio(null)
    setSaveState('idle')
    setSaveError(null)
  }

  return (
    <PanelCard title="음성 기록 · AI 초안">
      <div className="space-y-3">
        <p className="text-caption text-gray-500">
          회의 음성을 녹음하거나 녹취파일을 올려 텍스트로 옮기고, 필요하면 AI가 초안(제목·안건·본문)을
          작성합니다. 길이·포맷에 상관없이 자동으로 나눠 인식합니다.
        </p>

        {/* 주파수 시각화 — 마이크에 소리가 들어오면 막대가 반응해 정상 동작을 확인시킨다. */}
        <FrequencyVisualizer analyserRef={rec.analyserRef} active={micLive} />

        {/* ── 음성 기록: 녹음/업로드 → 전사 ──────────────────────────────── */}
        <RecorderControls
          rec={rec}
          busy={busy !== null}
          hasContent={Boolean(transcript || audio)}
          elapsedLabel={fmt(rec.elapsedMs)}
          onStop={handleStop}
          onFile={handleFile}
        />

        {busy === 'transcribing' && (
          <div className="flex items-center justify-center gap-2 py-1 text-body text-gray-500">
            <Spinner />
            {progress && progress.total > 1
              ? `음성 인식 중… (${Math.min(progress.done + 1, progress.total)}/${progress.total} 조각)`
              : '음성 인식 중…'}
          </div>
        )}

        {/* 녹음본 준비됨 — 녹취파일 업로드(위)와 한 묶음으로, 파일명 칩 + 미리듣기 + 저장을 2행으로 둔다.
            저장은 녹음/업로드본을 회의록 '음성 기록' 슬롯에 남긴다(전사와 무관). */}
        {audio && !recording && (
          <div className="space-y-2 rounded-radius-md border border-gray-200 bg-gray-50 p-2">
            {/* 1행: 파일명 칩(아이콘 + 이름 + 용량) — 덜렁 텍스트 대신 파일임을 한눈에. */}
            <div className="flex items-center gap-2 rounded-radius-sm border border-gray-200 bg-white px-2.5 py-1.5">
              <Music className="size-4 shrink-0 text-brand" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate text-caption font-medium text-gray-800" title={audio.name}>
                {audio.name}
              </span>
              <span className="shrink-0 tabular-nums text-caption text-gray-500">
                {formatBytes(audio.size)}
              </span>
            </div>

            {/* 미리듣기: 저장 전에 바로 들어볼 수 있다. */}
            {audioUrl && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio className="h-9 w-full" src={audioUrl} controls />
            )}

            {/* 2행: 저장 버튼. */}
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSaveAudio}
              disabled={saveState !== 'idle'}
            >
              {saveState === 'saving' ? (
                <Spinner />
              ) : saveState === 'saved' ? (
                <Check className="h-4 w-4" strokeWidth={2} />
              ) : (
                <Save className="h-4 w-4" strokeWidth={1.75} />
              )}
              {saveState === 'saved' ? '음성 기록에 저장됨' : '음성 파일을 음성 기록에 저장'}
            </Button>
            {saveError && (
              <p className="flex items-start gap-1.5 text-caption text-danger">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                {saveError}
              </p>
            )}
          </div>
        )}

        {/* ── 전사 텍스트(항상 노출) + AI 초안(독립) ────────────────────── */}
        <div className="space-y-2 border-t border-gray-200 pt-3">
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={5}
            className="w-full resize-y rounded-radius-md border border-gray-300 bg-white p-2 text-body text-gray-800 focus:border-brand focus:outline-none"
            placeholder="전사 결과가 여기에 표시됩니다. 직접 입력·붙여넣기해 초안을 만들 수도 있습니다."
            aria-label="회의 내용 텍스트"
          />
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleDraft}
              disabled={busy !== null || transcript.trim().length < 10}
            >
              {busy === 'drafting' ? <Spinner /> : <Sparkles className="h-4 w-4" strokeWidth={1.75} />}
              {busy === 'drafting' ? 'AI 초안 작성 중…' : 'AI 초안 작성'}
            </Button>
            <Button variant="ghost" onClick={handleReset} disabled={busy !== null} aria-label="초기화">
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </div>
        </div>

        {applied && (
          <p className="text-caption text-success">
            초안을 본문에 반영했습니다. 좌측에서 확인·수정 후 저장하세요.
          </p>
        )}

        {apiError && (
          <p className="flex items-start gap-1.5 text-caption text-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {apiError}
          </p>
        )}
      </div>
    </PanelCard>
  )
}
