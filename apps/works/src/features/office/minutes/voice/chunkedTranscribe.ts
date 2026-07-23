import { downsample, encodeWav, TARGET_SAMPLE_RATE } from './wav'
import { transcribeAudio } from './voiceMinuteApi'

/**
 * 한 조각의 최대 길이(초). 16kHz 모노 16-bit 기준 5분 ≈ 9.6MB로,
 * 서버 상한(14MB)·Gemini 인라인 한도(20MB)·60초 처리 타임아웃 안에 넉넉히 든다.
 * 이 값 덕분에 사용자가 회의를 손으로 나눠 녹음할 필요가 없다.
 */
const CHUNK_SECONDS = 300

export interface TranscribeProgress {
  /** 완료한 조각 수. */
  done: number
  /** 전체 조각 수. */
  total: number
}

/**
 * 임의 길이·포맷의 오디오를 16kHz 모노로 디코딩한 뒤 5분 조각으로 나눠 순차 전사하고 합친다.
 * 디코딩할 수 없는 희귀 포맷은 원본을 그대로 한 번에 전사한다(폴백).
 * 조각별 진행 상황은 onProgress로 통지한다.
 */
export async function transcribeLong(
  file: File,
  onProgress?: (p: TranscribeProgress) => void,
): Promise<string> {
  const decoded = await decodeTo16kMono(file)

  // 디코딩 실패(희귀 포맷) → 원본 그대로 1회 전사.
  if (!decoded) {
    onProgress?.({ done: 0, total: 1 })
    const text = await transcribeAudio(file)
    onProgress?.({ done: 1, total: 1 })
    return text
  }

  const { samples, rate } = decoded
  const chunkLen = CHUNK_SECONDS * rate
  const total = Math.max(1, Math.ceil(samples.length / chunkLen))
  const parts: string[] = []
  for (let i = 0; i < total; i++) {
    onProgress?.({ done: i, total })
    const slice = samples.subarray(i * chunkLen, (i + 1) * chunkLen)
    const wav = encodeWav(slice, rate)
    const text = await transcribeAudio(new File([wav], `chunk-${i + 1}.wav`, { type: 'audio/wav' }))
    if (text.trim()) parts.push(text.trim())
  }
  onProgress?.({ done: total, total })
  return parts.join('\n').trim()
}

/** 오디오 파일을 16kHz(원본이 더 낮으면 원본 레이트) 모노 PCM으로 디코딩. 실패 시 null. */
async function decodeTo16kMono(file: File): Promise<{ samples: Float32Array; rate: number } | null> {
  const Ctx = typeof AudioContext !== 'undefined' ? AudioContext : undefined
  if (!Ctx) return null
  const ctx = new Ctx()
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer())
    const mono = toMono(buf)
    // 원본이 16kHz보다 낮으면 업샘플하지 않고 원본 레이트로 인코딩(헤더 왜곡 방지).
    const rate = Math.min(TARGET_SAMPLE_RATE, buf.sampleRate)
    return { samples: downsample(mono, buf.sampleRate, rate), rate }
  } catch {
    return null
  } finally {
    ctx.close().catch(() => {})
  }
}

/** 다채널 오디오를 평균 다운믹스해 모노 Float32로 만든다. */
function toMono(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0)
  const len = buf.length
  const out = new Float32Array(len)
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) out[i] = (out[i] ?? 0) + (data[i] ?? 0) / buf.numberOfChannels
  }
  return out
}
