import { Button, PanelCard, Spinner, TextArea, cardText, cn } from '@ynarcher/ui'
import { AlertTriangle, Music, RotateCcw, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchMaterialFile,
  formatBytes,
  useDeleteMaterial,
  useMaterials,
  type Material,
} from '@/features/networks/materialHooks'
import { MaterialList } from '@/features/networks/MaterialList'
import { MINUTE_VOICE_ATTACHMENT_TYPE } from '@/features/office/minutes/minutesApi'
import { FrequencyVisualizer } from './FrequencyVisualizer'
import { RecorderControls } from './RecorderControls'
import { transcribeLong, type TranscribeProgress } from './chunkedTranscribe'
import { useVoiceRecorder } from './useVoiceRecorder'
import { generateMinuteDraft, type DraftContext, type MinuteDraft } from './voiceMinuteApi'

interface Props {
  context: DraftContext
  /** 초안을 상위 폼에 반영하고, 그 반영만 되돌리는 함수를 돌려준다. */
  onApplyDraft: (draft: MinuteDraft) => () => void
  targetId?: string
  queuedAudio: File | null
  onQueueAudio: (file: File) => void
  onRemoveQueuedAudio: () => void
}

type WorkingAudio = { file: File; queued: boolean }

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function audioFileName(meetingDate?: string | null): string {
  const base = (meetingDate && meetingDate.trim()) || new Date().toISOString().slice(0, 10)
  return `회의녹음-${base}.wav`
}

/**
 * 녹음 보관과 전사·AI 초안을 한 흐름으로 다루는 패널.
 * 새 음성은 회의록 저장 전까지 보류하고, 저장된 음성도 같은 자리에서 다시 전사할 수 있다.
 */
export function VoiceMinutePanel({
  context,
  onApplyDraft,
  targetId,
  queuedAudio,
  onQueueAudio,
  onRemoveQueuedAudio,
}: Props) {
  const rec = useVoiceRecorder()
  const { data: recordings = [], isLoading } = useMaterials(
    MINUTE_VOICE_ATTACHMENT_TYPE,
    targetId,
  )
  const remove = useDeleteMaterial(MINUTE_VOICE_ATTACHMENT_TYPE, targetId ?? '')
  const [transcript, setTranscript] = useState('')
  const [workingAudio, setWorkingAudio] = useState<WorkingAudio | null>(
    queuedAudio ? { file: queuedAudio, queued: true } : null,
  )
  const [busy, setBusy] = useState<null | 'transcribing' | 'drafting'>(null)
  const [transcribingId, setTranscribingId] = useState<string | undefined>()
  const [progress, setProgress] = useState<TranscribeProgress | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const undoDraftRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (queuedAudio) setWorkingAudio({ file: queuedAudio, queued: true })
    else setWorkingAudio((current) => (current?.queued ? null : current))
  }, [queuedAudio])

  const audioUrl = useMemo(
    () => (workingAudio ? URL.createObjectURL(workingAudio.file) : null),
    [workingAudio],
  )
  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  const recording = rec.status === 'recording'
  const micLive = rec.status === 'ready' || recording

  async function runTranscribe(file: File, materialId?: string) {
    setApiError(null)
    setBusy('transcribing')
    setTranscribingId(materialId)
    setProgress(null)
    try {
      const text = await transcribeLong(file, setProgress)
      setTranscript(text.trim())
    } catch (e) {
      setApiError(e instanceof Error ? e.message : '음성 전사에 실패했습니다.')
    } finally {
      setBusy(null)
      setTranscribingId(undefined)
      setProgress(null)
    }
  }

  async function handleStop() {
    const blob = await rec.stop()
    if (!blob) return
    const file = new File([blob], audioFileName(context.meetingDate), { type: 'audio/wav' })
    onQueueAudio(file)
    setWorkingAudio({ file, queued: true })
    await runTranscribe(file)
  }

  function handleFile(file: File) {
    onQueueAudio(file)
    setWorkingAudio({ file, queued: true })
    void runTranscribe(file)
  }

  async function handleStoredRecording(material: Material) {
    setApiError(null)
    try {
      const file = await fetchMaterialFile(material)
      setWorkingAudio({ file, queued: false })
      await runTranscribe(file, material.id)
    } catch (e) {
      setApiError(e instanceof Error ? e.message : '저장된 녹음을 불러오지 못했습니다.')
    }
  }

  async function handleDraft() {
    setApiError(null)
    setBusy('drafting')
    try {
      undoDraftRef.current = onApplyDraft(await generateMinuteDraft(transcript, context))
      setApplied(true)
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'AI 초안 생성에 실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  function undoDraft() {
    undoDraftRef.current?.()
    undoDraftRef.current = null
    setApplied(false)
  }

  function handleReset() {
    if (workingAudio?.queued) onRemoveQueuedAudio()
    undoDraft()
    rec.reset()
    setTranscript('')
    setApiError(null)
    setWorkingAudio(null)
  }

  return (
    <PanelCard
      title="회의 녹음 · AI 초안"
      count={recordings.length + (queuedAudio ? 1 : 0)}
      help="회의 음성을 녹음하거나 파일을 올려 텍스트로 옮긴 뒤, 제목·안건·본문 초안을 만듭니다."
    >
      <div className="space-y-3">
        {micLive && <FrequencyVisualizer analyserRef={rec.analyserRef} active />}

        <RecorderControls
          rec={rec}
          busy={busy !== null}
          hasContent={Boolean(transcript || workingAudio)}
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

        {workingAudio && !recording && (
          <div className="space-y-2 rounded-radius-md border border-gray-200 bg-gray-50 p-2">
            <div className="flex items-center gap-2 rounded-radius-sm border border-gray-200 bg-white px-2.5 py-1.5">
              <Music className="size-4 shrink-0 text-brand" strokeWidth={1.75} />
              <span className={cn('min-w-0 flex-1 truncate', cardText.value)} title={workingAudio.file.name}>
                {workingAudio.file.name}
              </span>
              <span className={cn('shrink-0 tabular-nums', cardText.meta)}>
                {formatBytes(workingAudio.file.size)}
              </span>
            </div>
            {audioUrl && <audio className="h-9 w-full" src={audioUrl} controls />}
            {workingAudio.queued && (
              <p className={cardText.meta}>회의록을 저장할 때 회의 녹음에 함께 저장됩니다.</p>
            )}
          </div>
        )}

        <div className="space-y-2 border-t border-gray-200 pt-3">
          <TextArea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={5}
            placeholder="전사 결과가 여기에 표시됩니다. 직접 입력·붙여넣기할 수도 있습니다."
            aria-label="회의 내용 텍스트"
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleDraft} disabled={busy !== null || transcript.trim().length < 10}>
              {busy === 'drafting' ? <Spinner /> : <Sparkles className="h-4 w-4" strokeWidth={1.75} />}
              {busy === 'drafting' ? 'AI 초안 작성 중…' : 'AI 초안 작성'}
            </Button>
            <Button variant="ghost" onClick={handleReset} disabled={busy !== null} aria-label="음성 작업 초기화">
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </div>
        </div>

        {applied && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption text-success">초안을 제목·안건·본문에 반영했습니다.</p>
            <Button variant="ghost" onClick={undoDraft}>반영 취소</Button>
          </div>
        )}

        {apiError && (
          <p className="flex items-start gap-1.5 text-caption text-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {apiError}
          </p>
        )}

        <div className="space-y-2 border-t border-gray-200 pt-3">
          <p className={cardText.label}>저장된 녹음</p>
          <MaterialList
            materials={recordings}
            loading={isLoading}
            emptyText="저장된 녹음이 없습니다."
            onTranscribe={(material) => void handleStoredRecording(material)}
            transcribingId={transcribingId}
            onDelete={targetId ? (id) => remove.mutate(id) : undefined}
            deletingId={remove.isPending ? remove.variables : undefined}
          />
        </div>
      </div>
    </PanelCard>
  )
}
