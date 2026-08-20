import { cn } from '@ynarcher/ui'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import { useEffect, useState } from 'react'

interface AssetPhotoCarouselProps {
  /** 사진 경로(표시 순서 = 원장의 배열 순서). */
  paths: string[]
  /** 경로 → Signed URL. 아직 서명 전이거나 실패하면 없다. */
  urlOf: (path: string) => string | undefined
  className?: string
}

/**
 * 물품 사진 캐러셀 — 한 자리에 한 장씩, 좌우 버튼으로 넘긴다.
 *
 * **틀의 크기는 고정하고 사진을 잘라 맞춘다**(`object-cover` + 가운데 기준). 사진마다 비율이
 * 달라 틀을 사진에 맞추면 넘길 때마다 모달 높이가 출렁이고, 옆의 정보 열까지 함께 밀린다.
 * 잘려 나가는 가장자리보다 자리가 흔들리지 않는 편이 물건을 알아보는 데 낫다.
 *
 * 넘김은 끝에서 처음으로 이어진다 — 다섯 장뿐인 목록에서 마지막 장에 도달했을 때 버튼이
 * 죽어 있으면, 되돌아가려고 왼쪽 버튼을 네 번 누르게 된다.
 */
export function AssetPhotoCarousel({ paths, urlOf, className }: AssetPhotoCarouselProps) {
  const [index, setIndex] = useState(0)
  const count = paths.length

  // 사진이 바뀐 물건을 열었을 때 세 번째 장부터 보여 주지 않는다.
  useEffect(() => {
    setIndex(0)
  }, [paths])

  const move = (step: number) => setIndex((i) => (i + step + count) % count)
  const current = paths[index]
  const url = current ? urlOf(current) : undefined

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative aspect-square w-full overflow-hidden rounded-radius-md border border-gray-200 bg-gray-50">
        {url ? (
          <img src={url} alt="" className="size-full object-cover object-center" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageOff className="size-8 text-gray-300" />
          </div>
        )}

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="이전 사진"
              onClick={() => move(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-radius-full bg-white/85 p-1.5 text-gray-700 shadow-popover hover:bg-white"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="다음 사진"
              onClick={() => move(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-radius-full bg-white/85 p-1.5 text-gray-700 shadow-popover hover:bg-white"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        )}
      </div>

      {/* 몇 장 중 몇 번째인지는 점으로만 알린다 — 숫자를 적으면 사진보다 글자가 먼저 읽힌다. */}
      {count > 1 && (
        <div className="flex justify-center gap-1.5">
          {paths.map((p, i) => (
            <button
              key={p}
              type="button"
              aria-label={`${i + 1}번째 사진`}
              onClick={() => setIndex(i)}
              className={cn(
                'size-1.5 rounded-radius-full transition-colors',
                i === index ? 'bg-gray-700' : 'bg-gray-300 hover:bg-gray-400',
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
