import { useCallback, useEffect, useRef, useState } from 'react'

/** 기본 5분. 서버 제한(7분)보다 짧아 회전·업로드 지연에도 파일 상한을 안정적으로 지킨다. */
export const RECORDING_SEGMENT_MS = 5 * 60 * 1000

export type RecorderStatus =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'recording'
  | 'denied'
  | 'unsupported'
  | 'error'

export interface CapturedSegment {
  blob: Blob
  durationMs: number
  mimeType: string
}

export interface VoiceRecorder {
  status: RecorderStatus
  error: string | null
  elapsedMs: number
  analyserRef: React.MutableRefObject<AnalyserNode | null>
  checkMic: () => Promise<boolean>
  start: () => Promise<void>
  /** 현재 구간을 닫고, 마지막 구간 저장 콜백까지 기다린다. */
  stop: () => Promise<void>
  reset: () => void
}

function preferredMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

/**
 * 마이크 스트림은 한 번만 열고 MediaRecorder만 5분마다 교체한다. 각 구간은 독립 재생 가능한
 * 압축 파일이 되어 메모리에 장시간 PCM을 쌓지 않으며, 구간이 닫힐 때마다 즉시 저장할 수 있다.
 */
export function useVoiceRecorder(
  onSegment?: (segment: CapturedSegment) => Promise<void> | void,
): VoiceRecorder {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const segmentStartedAtRef = useRef(0)
  const recordingStartedAtRef = useRef(0)
  const segmentTimerRef = useRef<number | null>(null)
  const elapsedTimerRef = useRef<number | null>(null)
  const recordingRef = useRef(false)
  const rotationRef = useRef<Promise<void> | null>(null)
  const onSegmentRef = useRef(onSegment)
  onSegmentRef.current = onSegment

  const clearTimers = useCallback(() => {
    if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current)
    if (elapsedTimerRef.current) window.clearInterval(elapsedTimerRef.current)
    segmentTimerRef.current = null
    elapsedTimerRef.current = null
  }, [])

  const beginSegmentRef = useRef<() => void>(() => {})

  const closeSegment = useCallback(async (continueRecording: boolean) => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    if (segmentTimerRef.current) window.clearTimeout(segmentTimerRef.current)
    segmentTimerRef.current = null
    const startedAt = segmentStartedAtRef.current

    const segment = await new Promise<CapturedSegment | null>((resolve) => {
      recorder.addEventListener('stop', () => {
        const blob = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          : null
        chunksRef.current = []
        resolve(blob ? {
          blob,
          durationMs: Math.max(1, Date.now() - startedAt),
          mimeType: (recorder.mimeType || blob.type || 'audio/webm').split(';')[0] ?? 'audio/webm',
        } : null)
      }, { once: true })
      recorder.stop()
    })

    // 업로드가 느려도 다음 구간 녹음은 바로 시작한다.
    if (continueRecording && recordingRef.current) beginSegmentRef.current()
    if (segment) void onSegmentRef.current?.(segment)
  }, [])

  const rotate = useCallback(() => {
    if (rotationRef.current || !recordingRef.current) return
    const work = closeSegment(true).finally(() => {
      if (rotationRef.current === work) rotationRef.current = null
    })
    rotationRef.current = work
  }, [closeSegment])

  const beginSegment = useCallback(() => {
    const stream = streamRef.current
    if (!stream || !recordingRef.current) return
    chunksRef.current = []
    const mimeType = preferredMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onerror = () => {
      recordingRef.current = false
      clearTimers()
      setStatus('error')
      setError('녹음 파일을 만드는 중 오류가 발생했습니다.')
    }
    recorderRef.current = recorder
    segmentStartedAtRef.current = Date.now()
    recorder.start(1_000)
    segmentTimerRef.current = window.setTimeout(rotate, RECORDING_SEGMENT_MS)
  }, [clearTimers, rotate])
  beginSegmentRef.current = beginSegment

  const releaseMedia = useCallback(() => {
    clearTimers()
    recordingRef.current = false
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    recorderRef.current = null
    chunksRef.current = []
    analyserRef.current = null
    void audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [clearTimers])

  useEffect(() => releaseMedia, [releaseMedia])

  const checkMic = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined' || typeof MediaRecorder === 'undefined') {
      setStatus('unsupported')
      setError('이 브라우저는 마이크 녹음을 지원하지 않습니다.')
      return false
    }
    setStatus('checking')
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
      const context = new AudioContext()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.75
      source.connect(analyser)
      audioCtxRef.current = context
      analyserRef.current = analyser
      setStatus('ready')
      return true
    } catch (caught) {
      const denied = caught instanceof DOMException && (caught.name === 'NotAllowedError' || caught.name === 'SecurityError')
      setStatus(denied ? 'denied' : 'error')
      setError(denied ? '마이크 권한이 거부되었습니다. 브라우저 주소창의 권한 설정을 확인하세요.' : '마이크를 열 수 없습니다.')
      return false
    }
  }, [])

  const start = useCallback(async () => {
    if (!streamRef.current || !audioCtxRef.current) {
      const ok = await checkMic()
      if (!ok) return
    }
    await audioCtxRef.current?.resume().catch(() => {})
    recordingRef.current = true
    recordingStartedAtRef.current = Date.now()
    setElapsedMs(0)
    setError(null)
    beginSegmentRef.current()
    elapsedTimerRef.current = window.setInterval(
      () => setElapsedMs(Date.now() - recordingStartedAtRef.current),
      200,
    )
    setStatus('recording')
  }, [checkMic])

  const stop = useCallback(async () => {
    recordingRef.current = false
    clearTimers()
    await rotationRef.current
    if (recorderRef.current?.state !== 'inactive') await closeSegment(false)
    setStatus('ready')
  }, [clearTimers, closeSegment])

  const reset = useCallback(() => {
    releaseMedia()
    setStatus('idle')
    setError(null)
    setElapsedMs(0)
  }, [releaseMedia])

  return { status, error, elapsedMs, analyserRef, checkMic, start, stop, reset }
}
