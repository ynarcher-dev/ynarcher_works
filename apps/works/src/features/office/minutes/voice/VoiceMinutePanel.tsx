import { Button, PanelCard, Spinner, TextArea, cardText, cn } from '@ynarcher/ui'
import { AlertTriangle, CheckCircle2, Music, Play, RotateCcw, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatBytes } from '@/features/networks/materialHooks'
import { FrequencyVisualizer } from './FrequencyVisualizer'
import { RecorderControls } from './RecorderControls'
import { transcribeLong, type TranscribeProgress } from './chunkedTranscribe'
import {
  completeRecording,
  finishRecording,
  getRecordingPlayback,
  listRecordings,
  recoverRecordingTranscripts,
  saveRecordingSegment,
  startRecording,
  transcribeRecordingSegment,
  type PlaybackSegment,
  type RecordingSummary,
} from './recordingApi'
import { useVoiceRecorder, type CapturedSegment } from './useVoiceRecorder'
import { generateMinuteDraft, type DraftContext, type MinuteDraft } from './voiceMinuteApi'

interface Props {
  context: DraftContext
  onApplyDraft: (draft: MinuteDraft) => () => void
  /** 새 회의록이면 저장 후 이 세션을 회의록에 연결할 수 있도록 상위에 전달한다. */
  onRecordingReady: (recordingId: string) => void
  onRecordingStateChange: (recording: boolean) => void
  targetId?: string
  queuedAudio: File | null
  onQueueAudio: (file: File) => void
  onRemoveQueuedAudio: () => void
}

type WorkingAudio = { file: File; queued: boolean }
type BusyState = null | 'uploading' | 'transcribing' | 'drafting'

function fmt(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function recordingLabel(recording: RecordingSummary): string {
  return `${new Date(recording.createdAt).toLocaleString('ko-KR')} · ${fmt(recording.durationMs)} · 내부 ${recording.segmentCount}구간`
}

export function VoiceMinutePanel({
  context,
  onApplyDraft,
  onRecordingReady,
  onRecordingStateChange,
  targetId,
  queuedAudio,
  onQueueAudio,
  onRemoveQueuedAudio,
}: Props) {
  const [transcript, setTranscript] = useState('')
  const [workingAudio, setWorkingAudio] = useState<WorkingAudio | null>(
    queuedAudio ? { file: queuedAudio, queued: true } : null,
  )
  const [busy, setBusy] = useState<BusyState>(null)
  const [progress, setProgress] = useState<TranscribeProgress | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [savedSegments, setSavedSegments] = useState(0)
  const [recordings, setRecordings] = useState<RecordingSummary[]>([])
  const [playback, setPlayback] = useState<PlaybackSegment[]>([])
  const [playingRecordingId, setPlayingRecordingId] = useState<string | null>(null)
  const [playingIndex, setPlayingIndex] = useState(0)

  const recordingIdRef = useRef<string | null>(null)
  const segmentNoRef = useRef(0)
  const transcriptPartsRef = useRef<string[]>([])
  const failedSegmentsRef = useRef(0)
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve())
  const undoDraftRef = useRef<(() => void) | null>(null)

  const refreshRecordings = useCallback(async () => {
    try {
      setRecordings(await listRecordings(targetId))
    } catch {
      // 본 기능 오류는 녹음 시작을 막지 않는다. 재생 시 사용자에게 다시 명시한다.
    }
  }, [targetId])
  useEffect(() => { void refreshRecordings() }, [refreshRecordings])

  const persistSegment = useCallback(async (segment: CapturedSegment) => {
    const recordingId = recordingIdRef.current
    if (!recordingId) return
    const segmentNo = ++segmentNoRef.current
    setBusy('uploading')
    const work = uploadChainRef.current.then(async () => {
      const segmentId = await saveRecordingSegment(
        recordingId,
        segmentNo,
        segment.blob,
        segment.durationMs,
      )
      setSavedSegments(segmentNo)
      setBusy('transcribing')
      const text = await transcribeRecordingSegment(segmentId)
      transcriptPartsRef.current[segmentNo - 1] = text
      setTranscript(transcriptPartsRef.current.filter(Boolean).join('\n\n'))
    })
    uploadChainRef.current = work.catch((error) => {
      failedSegmentsRef.current += 1
      setApiError(error instanceof Error ? error.message : `${segmentNo}번째 녹음 구간 저장에 실패했습니다.`)
    })
    await uploadChainRef.current
    if (recorderStatusRef.current === 'recording') setBusy(null)
  }, [])

  const rec = useVoiceRecorder(persistSegment)
  const recorderStatusRef = useRef(rec.status)
  recorderStatusRef.current = rec.status

  useEffect(() => {
    if (queuedAudio) setWorkingAudio({ file: queuedAudio, queued: true })
    else setWorkingAudio((current) => (current?.queued ? null : current))
  }, [queuedAudio])

  const audioUrl = useMemo(
    () => (workingAudio ? URL.createObjectURL(workingAudio.file) : null),
    [workingAudio],
  )
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])

  const recording = rec.status === 'recording'
  const micLive = rec.status === 'ready' || recording

  useEffect(() => {
    if (!recording) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [recording])

  async function runLegacyTranscribe(file: File) {
    setApiError(null)
    setBusy('transcribing')
    setProgress(null)
    try {
      const text = await transcribeLong(file, setProgress)
      setTranscript(text.trim())
    } catch (error) {
      setApiError(error instanceof Error ? error.message : '음성 전사에 실패했습니다.')
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  async function handleStart() {
    setApiError(null)
    if (!window.confirm('참석자에게 녹음 및 외부 AI 전사·회의록 생성 사실을 고지했습니까?')) return
    const micReady = rec.status === 'ready' || await rec.checkMic()
    if (!micReady) return
    try {
      const recordingId = await startRecording(targetId)
      recordingIdRef.current = recordingId
      segmentNoRef.current = 0
      transcriptPartsRef.current = []
      failedSegmentsRef.current = 0
      uploadChainRef.current = Promise.resolve()
      setSavedSegments(0)
      setTranscript('')
      setApplied(false)
      onRecordingReady(recordingId)
      await rec.start()
      onRecordingStateChange(true)
    } catch (error) {
      setApiError(error instanceof Error ? error.message : '녹음 세션을 만들지 못했습니다.')
    }
  }

  async function handleStop() {
    const recordingId = recordingIdRef.current
    if (!recordingId) return
    setApiError(null)
    try {
      await rec.stop()
      setBusy('uploading')
      await uploadChainRef.current
      await finishRecording(recordingId, rec.elapsedMs)
      if (failedSegmentsRef.current > 0) {
        throw new Error(`녹음 ${failedSegmentsRef.current}개 구간 처리에 실패했습니다. 업로드된 구간은 서버에 보존되어 있으며 처리 재개가 가능합니다.`)
      }
      const mergedTranscript = transcriptPartsRef.current.filter(Boolean).join('\n\n').trim()
      if (!mergedTranscript) throw new Error('저장된 녹음에서 전사 결과를 만들지 못했습니다.')
      setBusy('drafting')
      const draft = await generateMinuteDraft(mergedTranscript, context, recordingId)
      await completeRecording(recordingId, mergedTranscript, draft)
      undoDraftRef.current = onApplyDraft(draft)
      setApplied(true)
      setTranscript(mergedTranscript)
      await refreshRecordings()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : '녹음 저장·회의록 작성에 실패했습니다.')
    } finally {
      onRecordingStateChange(false)
      setBusy(null)
      void refreshRecordings()
    }
  }

  function handleFile(file: File) {
    onQueueAudio(file)
    setWorkingAudio({ file, queued: true })
    void runLegacyTranscribe(file)
  }

  async function handleDraft() {
    setApiError(null)
    setBusy('drafting')
    try {
      undoDraftRef.current = onApplyDraft(await generateMinuteDraft(transcript, context))
      setApplied(true)
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'AI 초안 생성에 실패했습니다.')
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

  async function playRecording(recordingId: string) {
    setApiError(null)
    try {
      const segments = await getRecordingPlayback(recordingId)
      if (segments.length === 0) throw new Error('재생할 녹음 구간이 없습니다.')
      setPlayback(segments)
      setPlayingRecordingId(recordingId)
      setPlayingIndex(0)
    } catch (error) {
      setApiError(error instanceof Error ? error.message : '녹음을 재생하지 못했습니다.')
    }
  }

  async function resumeProcessing(item: RecordingSummary) {
    setApiError(null)
    setBusy('transcribing')
    try {
      recordingIdRef.current = item.id
      onRecordingReady(item.id)
      const recovered = await recoverRecordingTranscripts(item.id)
      if (!recovered.transcript) throw new Error('복구된 전사 내용이 비어 있습니다.')
      await finishRecording(item.id, recovered.durationMs)
      setBusy('drafting')
      const draft = await generateMinuteDraft(recovered.transcript, context, item.id)
      await completeRecording(item.id, recovered.transcript, draft)
      setTranscript(recovered.transcript)
      undoDraftRef.current = onApplyDraft(draft)
      setApplied(true)
      await refreshRecordings()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : '저장된 녹음 처리를 재개하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  function applySavedDraft(item: RecordingSummary) {
    if (!item.draft) return
    recordingIdRef.current = item.id
    onRecordingReady(item.id)
    if (item.transcript) setTranscript(item.transcript)
    undoDraftRef.current = onApplyDraft(item.draft)
    setApplied(true)
  }

  return (
    <PanelCard
      title="회의 녹음 · AI 초안"
      count={recordings.length + (recordingIdRef.current && !targetId ? 1 : 0)}
      help="5분마다 안전하게 자동 저장하며, 화면에는 회의 녹음 한 건으로 표시합니다. 종료하면 상세 회의록 초안을 자동 작성합니다."
    >
      <div className="space-y-3">
        <p className={cardText.meta}>
          녹음 원본과 전사는 제한 자료로 저장되며, 음성 인식과 초안 생성을 위해 Gemini로 전송됩니다.
        </p>
        {micLive && <FrequencyVisualizer analyserRef={rec.analyserRef} active />}

        <RecorderControls
          rec={rec}
          busy={busy !== null}
          hasContent={Boolean(transcript || workingAudio)}
          elapsedLabel={fmt(rec.elapsedMs)}
          onStart={() => void handleStart()}
          onStop={() => void handleStop()}
          onFile={handleFile}
        />

        {recording && (
          <p className={cardText.meta}>
            내부 구간 {savedSegments}개 저장 완료 · 녹음은 중단 없이 다음 구간으로 이어집니다.
          </p>
        )}

        {busy && !recording && (
          <div className="flex items-center justify-center gap-2 py-1 text-body text-gray-500">
            <Spinner />
            {busy === 'uploading' && '마지막 구간 저장 중…'}
            {busy === 'transcribing' && (progress?.total && progress.total > 1
              ? `음성 인식 중… (${Math.min(progress.done + 1, progress.total)}/${progress.total})`
              : '음성 인식 중…')}
            {busy === 'drafting' && '상세 회의록 자동 작성 중…'}
          </div>
        )}

        {workingAudio && !recording && (
          <div className="space-y-2 rounded-radius-md border border-gray-200 bg-gray-50 p-2">
            <div className="flex items-center gap-2 rounded-radius-sm border border-gray-200 bg-white px-2.5 py-1.5">
              <Music className="size-4 shrink-0 text-brand" strokeWidth={1.75} />
              <span className={cn('min-w-0 flex-1 truncate', cardText.value)}>{workingAudio.file.name}</span>
              <span className={cn('shrink-0 tabular-nums', cardText.meta)}>{formatBytes(workingAudio.file.size)}</span>
            </div>
            {audioUrl && <audio className="h-9 w-full" src={audioUrl} controls />}
            {workingAudio.queued && <p className={cardText.meta}>회의록을 저장할 때 원본 파일도 함께 저장됩니다.</p>}
          </div>
        )}

        <div className="space-y-2 border-t border-gray-200 pt-3">
          <TextArea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            rows={7}
            placeholder="전사 결과가 구간별로 이어집니다. 직접 입력하거나 수정할 수도 있습니다."
            aria-label="회의 내용 텍스트"
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void handleDraft()} disabled={busy !== null || transcript.trim().length < 10 || recording}>
              {busy === 'drafting' ? <Spinner /> : <Sparkles className="h-4 w-4" strokeWidth={1.75} />}
              AI 초안 다시 작성
            </Button>
            <Button variant="ghost" onClick={handleReset} disabled={busy !== null || recording} aria-label="음성 작업 초기화">
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </div>
        </div>

        {applied && (
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-caption text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> 상세 초안을 제목·안건·본문에 자동 반영했습니다.
            </p>
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
          {recordings.length === 0 ? (
            <p className={cardText.meta}>저장된 녹음이 없습니다.</p>
          ) : recordings.map((item) => (
            <div key={item.id} className="rounded-radius-md border border-gray-200 bg-white p-2">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 shrink-0 text-brand" />
                <span className={cn('min-w-0 flex-1', cardText.value)}>{recordingLabel(item)}</span>
                <Button variant="ghost" onClick={() => void playRecording(item.id)} aria-label="녹음 재생">
                  <Play className="h-4 w-4" />
                </Button>
                {item.status === 'READY' && item.draft ? (
                  <Button variant="ghost" onClick={() => applySavedDraft(item)}>초안 적용</Button>
                ) : (
                  <Button variant="ghost" disabled={busy !== null || recording} onClick={() => void resumeProcessing(item)}>
                    처리 재개
                  </Button>
                )}
              </div>
              {playingRecordingId === item.id && playback[playingIndex] && (
                <audio
                  key={playback[playingIndex].id}
                  className="mt-2 h-9 w-full"
                  src={playback[playingIndex].url}
                  controls
                  autoPlay
                  onEnded={() => setPlayingIndex((index) => Math.min(index + 1, playback.length - 1))}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </PanelCard>
  )
}
