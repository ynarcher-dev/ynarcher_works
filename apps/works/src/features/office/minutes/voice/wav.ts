// 브라우저에서 캡처한 Float32 PCM을 Gemini 호환 16kHz 모노 16-bit WAV로 인코딩한다.
// Gemini 오디오 입력은 webm/opus를 받지 않으므로(WAV·MP3·OGG·FLAC 등만 지원) 녹음을 WAV로 만든다.
// 16kHz 모노는 음성 인식 모델의 표준 입력이라 정확도 손실 없이 용량을 최소화한다.

/** Gemini 전사에 사용하는 목표 샘플레이트(Hz). */
export const TARGET_SAMPLE_RATE = 16_000

/** 여러 캡처 청크(Float32)를 하나로 잇는다. */
export function mergeChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/** 선형 보간 없이 평균 다운샘플링(inRate → outRate). outRate가 더 크면 원본을 그대로 반환. */
export function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate >= inRate) return input
  const ratio = inRate / outRate
  const outLen = Math.floor(input.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j] ?? 0
    out[i] = end > start ? sum / (end - start) : 0
  }
  return out
}

/** Float32(−1..1) 모노 PCM을 16-bit WAV Blob으로 인코딩한다. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt 청크 길이
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // 모노
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}
