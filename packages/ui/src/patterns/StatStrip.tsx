import { cn } from '../utils/cn'

/**
 * 지표 한 칸.
 *
 * 값은 이미 포맷된 문자열로 받는다 — 자릿수 구분·반올림·단위 환산은 도메인이 정할 일이지
 * 표시 규격이 정할 일이 아니다.
 */
export interface StripTile {
  key: string
  label: string
  /** 이미 포맷된 표시값(숫자 문자열 등). 단위는 `unit`으로 갈라 넘긴다. */
  value: string
  /**
   * 값 뒤에 붙는 단위('건'·'백만원' 등). 숫자보다 한 단 작은 회색으로 붙는다.
   *
   * 디자인 규약의 기본은 '한 줄 안에서 크기를 갈라 위계를 만들지 않는다'이지만, 여기서 크게
   * 읽혀야 하는 것은 자릿수이고 단위는 모든 칸에 똑같이 반복되는 고정 문자열이라 같은 크기로
   * 두면 숫자만큼 자리를 먹는다(`50,000`보다 `백만원`이 길다). 사용자 판단으로 둔 예외이며,
   * 그래서 `value`에 단위를 이어 붙이지 않고 이 자리로 받는다 — 규격을 화면마다 다시 쓰면
   * 어느 대시보드는 회색, 어느 대시보드는 검정이 된다.
   */
  unit?: string
  /** 전월 대비 증감(옵션). 지정 시에만 증감 줄을 세운다. */
  delta?: number
  /**
   * 증감 대신 적을 보조 한 줄(비율 문구 등). `delta`와 함께 주면 이쪽이 이긴다 —
   * 한 칸에 보조 줄은 하나이며, 둘을 겹쳐 쌓으면 칸마다 높이가 어긋난다.
   */
  note?: string
  /** 클릭 이동·필터 토글(옵션). 지정한 칸만 누를 수 있다. */
  onClick?: () => void
  /**
   * 지금 이 지표가 목록을 좁히고 있음(필터 켜짐).
   *
   * 상자를 걷어냈으므로 선택은 테두리가 아니라 옅은 브랜드 면으로 말한다 — 표의 선택된 행,
   * 사업 파이프라인의 켜진 단계와 같은 언어다.
   */
  selected?: boolean
}

/** 기본 격자(5칸). 칸 수가 다른 화면은 `className`으로 교체한다. */
const DEFAULT_GRID = 'grid grid-cols-2 divide-gray-200 sm:grid-cols-3 sm:divide-x lg:grid-cols-5'

/** 전월 대비 증감(증가=success·감소=danger·변화 없음=회색 문구). */
function DeltaLine({ delta }: { delta: number }) {
  if (delta === 0) return <p className="mt-0.5 text-caption text-gray-600">전월 대비 변화 없음</p>
  const up = delta > 0
  return (
    <p className="mt-0.5 text-caption text-gray-600">
      전월 대비{' '}
      <span className={cn('font-semibold tabular-nums', up ? 'text-success' : 'text-danger')}>
        {up ? '↑' : '↓'}
        {Math.abs(delta).toLocaleString()}
      </span>
    </p>
  )
}

export interface StatStripProps {
  tiles: StripTile[]
  /** 격자 클래스 오버라이드(칸 수는 화면마다 다르다). */
  className?: string
}

/**
 * 지표 띠 — 대시보드·목록 상단에서 지표 여러 개를 나란히 세우는 유일한 규격.
 *
 * 지표는 서로 비교하려고 나란히 놓는 것인데, 각자 테두리 상자에 갇히면 비교가 아니라 열거로
 * 읽힌다. 상자를 걷고 하나의 띠 안에서 아주 옅은 세로선으로만 나누면 숫자들이 한 덩어리로
 * 스캔된다. 여기서 세로선을 쓰는 것은 표에서 세로선을 지운 판단과 어긋나지 않는다 — 표는 행이
 * 반복되며 세로선이 수십 줄 누적되지만, 지표 띠는 한 줄이라 선 하나가 누적되지 않는다.
 *
 * 크기와 색은 전부 사다리를 그대로 따른다. 값은 `text-title-sm`(20px) — 사다리가 정한 '지표 값'
 * 단계다. 상자를 걷어낸 것만으로 지표는 이미 앞으로 나오므로, 여기서 크기까지 한 단 올리면
 * 사다리에 없는 24px 지표가 생겨 다음에 보는 사람이 어느 쪽이 규격인지 알 수 없게 된다.
 * 같은 이유로 **총계 칸이라고 값을 키우지 않는다** — 총계임은 라벨('전체')과 맨 앞이라는 자리가
 * 이미 말한다.
 *
 * 라벨과 보조 줄은 `gray-600`이다. 12px 한글은 획이 촘촘해 `gray-500`(6.06:1)에서 흐려지므로
 * `gray-600`(7.77:1)으로 세운다 — 표 머리글·메타를 올린 것과 같은 판단이다.
 *
 * 아이콘도 진행 막대도 두지 않는다. 라벨이 이미 무엇을 재는지 말하고 있고, 비율은 보조 줄이
 * 숫자로 말한다 — 같은 말을 형태로 한 번 더 하면 지표보다 장식이 먼저 눈에 든다.
 *
 * 근거: docs_design/5_component_spec_rules.md §3.9 (지표 띠)
 */
export function StatStrip({ tiles, className = DEFAULT_GRID }: StatStripProps) {
  return (
    <div className={className}>
      {tiles.map((t) => {
        const clickable = Boolean(t.onClick)
        const Tag = clickable ? 'button' : 'div'
        return (
          <Tag
            key={t.key}
            {...(clickable
              ? { type: 'button' as const, onClick: t.onClick, 'aria-pressed': t.selected }
              : {})}
            className={cn(
              'min-w-0 rounded-radius-sm px-3 py-1.5 text-left transition-colors duration-fast',
              t.selected && 'bg-brand-25',
              clickable && !t.selected && 'hover:bg-gray-25',
              !clickable && 'cursor-default',
            )}
          >
            <p className={cn('truncate text-caption', t.selected ? 'text-brand-700' : 'text-gray-600')}>
              {t.label}
            </p>
            <p className="mt-0.5 flex items-baseline gap-1">
              <span className="truncate text-title-sm font-bold tabular-nums text-gray-900">
                {t.value}
              </span>
              {/*
                색은 gray-500이다. 라벨·보조 줄을 gray-600으로 세운 근거는 "12px 한글은 gray-500에서
                뭉갠다"인데 단위는 14px이라 해당되지 않고, 반복되는 고정 문자열이므로 20px 숫자
                옆에서 최대한 물러나야 한다.
              */}
              {t.unit && <span className="shrink-0 text-body text-gray-500">{t.unit}</span>}
            </p>
            {t.note !== undefined ? (
              <p className="mt-0.5 truncate text-caption tabular-nums text-gray-600">{t.note}</p>
            ) : t.delta !== undefined ? (
              <DeltaLine delta={t.delta} />
            ) : null}
          </Tag>
        )
      })}
    </div>
  )
}
