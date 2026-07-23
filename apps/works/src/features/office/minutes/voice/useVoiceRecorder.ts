import { useCallback, useEffect, useRef, useState } from 'react'
import { downsample, encodeWav, mergeChunks, TARGET_SAMPLE_RATE } from './wav'

/** 녹음기 상태 머신. `checking`은 마이크 권한 요청 중, `ready`는 권한 확보 후 대기. */
export type RecorderStatus =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'recording'
  | 'denied'
  | 'unsupported'
  | 'error'

export interface VoiceRecorder {
  status: RecorderStatus
  error: string | null
  /** 녹음 경과(ms). 시각화·타이머 표시에 사용. */
  elapsedMs: number
  /** 주파수 시각화용 분석 노드(권한 확보 후 채워짐). */
  analyserRef: React.MutableRefObject<AnalyserNode | null>
  /** 마이크 권한 요청 + 오디오 그래프 구성(정상 동작 확인). */
  checkMic: () => Promise<boolean>
  start: () => Promise<void>
  /** 녹음 종료. 수집한 오디오를 16kHz 모노 WAV Blob으로 반환(없으면 null). */
  stop: () => Promise<Blob | null>
  /** 스트림·컨텍스트를 해제하고 초기 상태로 되돌린다. */
  reset: () => void
}

/**
 * 회의록 음성 녹음 훅. 마이크 권한 확인 → 실시간 주파수 분석(AnalyserNode) → PCM 캡처를
 * 하나의 상태 머신으로 묶는다. Gemini는 webm/opus를 받지 않으므로 MediaRecorder 대신
 * ScriptProcessor로 PCM을 모아 종료 시 16kHz 모노 WAV로 인코딩한다.
 * Web Audio 그래프와 스트림은 언마운트 시 확실히 해제한다.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const chunksRef = useRef<Float32Array[]>([])
  const capturingRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)

  const teardown = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    capturingRef.current = false
    chunksRef.current = []
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null
      processorRef.current.disconnect()
    }
    processorRef.current = null
    analyserRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => teardown, [teardown])

  const checkMic = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      setStatus('unsupported')
      setError('이 브라우저는 마이크 녹음을 지원하지 않습니다.')
      return false
    }
    setStatus('checking')
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.75
      source.connect(analyser)

      // ScriptProcessor로 원시 PCM을 캡처한다(녹음 중일 때만 축적).
      // 출력 버퍼에 아무것도 쓰지 않아 스피커 피드백은 없다.
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (ev) => {
        if (!capturingRef.current) return
        chunksRef.current.push(new Float32Array(ev.inputBuffer.getChannelData(0)))
      }
      source.connect(processor)
      processor.connect(ctx.destination)

      audioCtxRef.current = ctx
      analyserRef.current = analyser
      processorRef.current = processor
      setStatus('ready')
      return true
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
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
    chunksRef.current = []
    capturingRef.current = true
    startedAtRef.current = Date.now()
    setElapsedMs(0)
    timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200)
    setStatus('recording')
  }, [checkMic])

  const stop = useCallback((): Promise<Blob | null> => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    capturingRef.current = false
    setStatus((s) => (s === 'recording' ? 'ready' : s))

    const ctx = audioCtxRef.current
    const chunks = chunksRef.current
    chunksRef.current = []
    if (!ctx || chunks.length === 0) return Promise.resolve(null)

    const merged = mergeChunks(chunks)
    const pcm16k = downsample(merged, ctx.sampleRate, TARGET_SAMPLE_RATE)
    return Promise.resolve(encodeWav(pcm16k, TARGET_SAMPLE_RATE))
  }, [])

  const reset = useCallback(() => {
    teardown()
    setStatus('idle')
    setError(null)
    setElapsedMs(0)
  }, [teardown])

  return { status, error, elapsedMs, analyserRef, checkMic, start, stop, reset }
}
