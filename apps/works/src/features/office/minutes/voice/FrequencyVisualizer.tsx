import { useEffect, useRef } from 'react'

interface Props {
  /** 주파수 데이터를 읽어올 분석 노드 ref. */
  analyserRef: React.MutableRefObject<AnalyserNode | null>
  /** true일 때만 애니메이션 루프를 돈다(녹음·마이크 확인 중). */
  active: boolean
}

/** 브랜드 네이비(brand.DEFAULT). 막대 그라디언트 상단/하단에 사용. */
const BAR_TOP = '#1F3A5F'
const BAR_BOTTOM = '#6E7683'

/**
 * 마이크 입력의 주파수 스펙트럼을 실시간 막대로 그리는 캔버스.
 * `active`가 아니면 정지선(무음)을 표시해 마이크 대기 상태를 시각적으로 구분한다.
 * requestAnimationFrame 루프와 리사이즈 옵저버는 언마운트·비활성 시 정리한다.
 */
export function FrequencyVisualizer({ analyserRef, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const analyser = analyserRef.current

      if (!active || !analyser) {
        // 무음 상태: 중앙 기준선만 옅게 그린다.
        ctx.fillStyle = 'rgba(110,118,131,0.35)'
        ctx.fillRect(0, h / 2 - dpr, w, dpr * 2)
        raf = requestAnimationFrame(draw)
        return
      }

      const bins = analyser.frequencyBinCount
      const data = new Uint8Array(bins)
      analyser.getByteFrequencyData(data)

      // 저역이 화면 대부분을 차지하므로 앞쪽 3/4 대역만 사용해 시각적으로 고르게 편다.
      const used = Math.floor(bins * 0.75)
      const gap = dpr * 2
      const barW = Math.max(dpr, (w - gap * (used - 1)) / used)
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, BAR_TOP)
      grad.addColorStop(1, BAR_BOTTOM)
      ctx.fillStyle = grad

      for (let i = 0; i < used; i++) {
        const v = (data[i] ?? 0) / 255 // 0..1
        const barH = Math.max(dpr * 2, v * h)
        const x = i * (barW + gap)
        ctx.fillRect(x, h - barH, barW, barH)
      }
      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [analyserRef, active])

  return (
    <canvas
      ref={canvasRef}
      className="h-16 w-full rounded-radius-md bg-gray-50"
      aria-label="음성 주파수 시각화"
    />
  )
}
