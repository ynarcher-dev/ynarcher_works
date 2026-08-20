import { cn } from '@ynarcher/ui'

export interface StripTile {
  key: string
  label: string
  value: string
  unit?: string
  delta?: number
}

/**
 * 지표 띠 — 상태 타일의 대안.
 *
 * `@ynarcher/ui`의 `StatTileGrid`는 타일마다 테두리를 둘러 "상자 5개의 격자"를 만든다. 지표는
 * 서로 비교하려고 나란히 놓는 것인데, 각자 상자에 갇히면 비교가 아니라 열거로 읽힌다. 상자를
 * 걷고 하나의 띠 안에서 아주 옅은 세로선으로만 나누면 다섯 숫자가 한 덩어리로 스캔된다.
 *
 * 여기서 세로선을 쓰는 것은 표에서 세로선을 지우는 판단과 어긋나지 않는다 — 표는 행이 반복되며
 * 세로선이 수십 줄 누적되지만, 지표 띠는 한 줄이라 선 하나가 누적되지 않는다.
 *
 * 크기와 색은 전부 사다리를 그대로 따른다. 값은 `text-title-sm`(20px) — 사다리가 정한 '지표 값'
 * 단계다. 상자를 걷어낸 것만으로 지표는 이미 앞으로 나오므로, 여기서 크기까지 한 단 올리면
 * 사다리에 없는 24px 지표가 생겨 다음에 보는 사람이 어느 쪽이 규격인지 알 수 없게 된다.
 *
 * 라벨과 증감은 gray-600이다. 12px 한글은 획이 촘촘해 gray-500(6.06:1)에서 흐려지므로
 * gray-600(7.77:1)으로 세운다 — 표 머리글·메타를 올린 것과 같은 판단이다.
 */
export function StatStrip({ tiles }: { tiles: StripTile[] }) {
  return (
    <div className="grid grid-cols-2 divide-gray-200 sm:grid-cols-3 sm:divide-x lg:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.key} className="px-4 py-1 first:pl-0 last:pr-0">
          <p className="text-caption text-gray-600">{t.label}</p>
          <p className="mt-0.5 flex items-baseline gap-1">
            <span className="text-title-sm font-bold tabular-nums text-gray-900">{t.value}</span>
            {/*
              단위는 값보다 한 단 작다. '한 줄 안에서 크기를 갈라 위계를 만들지 않는다'의 예외이며,
              근거는 `StatTileGrid`와 같다 — 크게 읽혀야 하는 것은 자릿수인데 단위는 모든 타일에
              똑같이 반복되는 고정 문자열이라, 같은 크기로 두면 숫자만큼 자리를 먹는다.

              색은 gray-500이다. 라벨·증감을 gray-600으로 세운 근거는 "12px 한글은 gray-500에서
              뭉갠다"인데 단위는 14px이라 해당되지 않고, 반복되는 고정 문자열이므로 20px 숫자
              옆에서 최대한 물러나야 한다.
            */}
            {t.unit && <span className="text-body text-gray-500">{t.unit}</span>}
          </p>
          {t.delta !== undefined && (
            <p className="mt-0.5 text-caption text-gray-600">
              전월 대비{' '}
              {t.delta === 0 ? (
                <span className="text-gray-500">변화 없음</span>
              ) : (
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    t.delta > 0 ? 'text-success' : 'text-danger',
                  )}
                >
                  {t.delta > 0 ? '↑' : '↓'}
                  {Math.abs(t.delta).toLocaleString()}
                </span>
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}



