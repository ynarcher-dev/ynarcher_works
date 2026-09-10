import { createContext, useContext, type ReactNode } from 'react'
import { CardShell } from '../components/CardShell'
import { Tooltip } from '../components/Tooltip'
import { DensityProvider } from '../density'
import { cardText } from '../densityScale'
import { cn } from '../utils/cn'

export interface EntityHeaderCardProps {
  /** 좌측 커버/프로필 이미지(`PhotoBox` 등). 미지정 시 텍스트 블록만 렌더한다. */
  photo?: ReactNode
  title: ReactNode
  /** 제목 우측 배지 묶음(상태·구분 등). */
  badges?: ReactNode
  /** 제목 하단 한 줄 설명. */
  description?: ReactNode
  /**
   * 설명 아래 상태·분류 칩 줄.
   *
   * 제목 옆(`badges`)과 갈리는 기준은 개수다 — 이름 옆에 서는 것은 그 레코드가 무엇인지
   * 한마디로 답하는 하나둘이고, 단계·구분·관리현황처럼 축이 여럿이면 이름 줄을 밀어내므로
   * 아래 줄로 내린다. 두 자리 모두 page 맥락이라 칩 크기는 갈리지 않는다.
   */
  chips?: ReactNode
  /** 헤더 우상단 액션(편집 버튼 등). */
  actions?: ReactNode
  /** 구분선 하단 정보 그리드(`InfoGrid`). */
  info?: ReactNode
  /** 정보 그리드 아래 추가 섹션(`EntityHeaderSection`). */
  children?: ReactNode
  className?: string
}

/**
 * 상세 화면 최상단 '기본 데이터' 카드(AC 사업·NETWORKS·STARTUP 상세 공용 규격).
 * 좌측 커버 이미지 + 제목/배지 + 설명 → 구분선 → 정보 그리드 → 추가 섹션 순으로 쌓인다.
 * 데이터 조회는 하지 않으며, 각 슬롯에 렌더된 노드를 배치만 한다.
 */
export function EntityHeaderCard({
  photo,
  title,
  badges,
  description,
  chips,
  actions,
  info,
  children,
  className,
}: EntityHeaderCardProps) {
  return (
    <CardShell className={className}>
      <div className="flex items-center gap-5">
        {photo}
        <div className="min-w-0 flex-1">
          {/*
            상세 헤더는 카드 안에 있어도 **페이지 맥락**이다. 맥락을 되돌리지 않으면 24px 제목
            옆 배지가 카드 규격(11px)으로 찍혀 먼지처럼 보인다.

            이 되돌림을 화면이 아니라 여기가 갖는 이유는, 화면이 갖던 동안 실제로 갈렸기
            때문이다 — 손으로 짠 헤더 넷은 `DensityProvider`를 감쌌고, 이 카드를 쓰던 화면은
            감싸지 않아 같은 자리의 배지가 화면마다 다른 크기로 섰다.
          */}
          <DensityProvider value="page">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-title-md font-bold text-gray-900">{title}</h1>
              {badges}
            </div>
          </DensityProvider>
          {/* 부제 규격은 이 파일이 다시 적지 않고 카드 부제 토큰이 답한다 — 손으로 적혀 있던
              동안 이 카드만 gray-700이고 같은 자리의 다른 헤더는 gray-500이었다. */}
          {description !== undefined && (
            <p className={cn('mt-1', cardText.subtitle)}>{description || '-'}</p>
          )}
          {chips && (
            <DensityProvider value="page">
              <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div>
            </DensityProvider>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {info && (
        <div className="mt-5 border-t border-gray-100 pt-4">{info}</div>
      )}
      {children}
    </CardShell>
  )
}

/**
 * 이 섹션이 한 줄에 나란히 선 묶음의 칸인지 알린다.
 *
 * 화면이 플래그로 알리게 두지 않는 이유는, 그러면 "묶이면 선을 긋지 않는다"는 규칙을 섹션을
 * 놓는 쪽마다 다시 알아야 하기 때문이다. 묶는 것은 `EntityHeaderSectionRow`이니 그 사실도
 * 그쪽이 내려보낸다.
 */
const SectionRowContext = createContext(false)

export interface EntityHeaderSectionRowProps {
  children: ReactNode
}

/**
 * 섹션 둘을 **한 줄에 나란히** 세우는 자리(구분선은 묶음이 한 번만 긋는다).
 *
 * 세로로 쌓는 것이 기본이고 이 자리는 예외다 — 축 둘이 각각 한두 줄뿐이면 쌓았을 때 오른쪽이
 * 통째로 비어, 값보다 빈 자리가 넓어진다(회의록의 참석자·열람 설정). 나란히 세울 수 있는
 * 조건은 `InfoGrid`가 칸을 나누는 조건과 같다 — **한 칸에 들어가는 값이 짧을 때**다.
 *
 * 선을 칸마다 긋지 않고 묶음이 한 번 긋는 것이 요점이다. 칸마다 그으면 가운데 간격만큼 끊긴
 * 선 둘이 서서, 한 축이 갈린 것인지 두 축이 나란한 것인지 화면이 답하지 못한다.
 */
export function EntityHeaderSectionRow({ children }: EntityHeaderSectionRowProps) {
  return (
    <SectionRowContext.Provider value={true}>
      <div className="mt-4 grid grid-cols-1 items-start gap-x-6 gap-y-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
        {children}
      </div>
    </SectionRowContext.Provider>
  )
}

export interface EntityHeaderSectionProps {
  /**
   * 섹션 캡션(담당자·태그 등). 생략하면 구분선만 긋는다 — 정보 그리드가 두 벌 이어지는 카드
   * (펀드 요약 지표 → 속성)에서 두 번째 묶음은 캡션 없이 선이 갈라 주는 것으로 충분하고,
   * 없는 이름을 지어 붙이면 그 이름이 곧 다음 사람이 지켜야 할 분류축이 된다.
   */
  label?: string
  /**
   * 이 섹션이 무엇을 다루는지에 대한 설명. 캡션 옆 도움말(ⓘ) 말풍선으로 선다.
   *
   * 자리를 여기가 갖는 근거는 `CardHeading`의 `help`와 같다 — 카드가 섹션으로 접히면 카드
   * 제목이 쥐고 있던 안내도 함께 접혀야 하는데, 그때 화면이 `Tooltip`을 직접 놓기 시작하면
   * 같은 안내가 섹션마다 다른 간격으로 선다. 캡션이 없는 섹션에는 붙일 자리도 없다.
   */
  help?: ReactNode
  children: ReactNode
}

/**
 * 카드 안에서 축이 갈리는 자리(라벨 + 구분선 + 내용).
 *
 * 이름은 이 카드에서 났지만 소유하는 것은 **카드 안 구분 섹션 규격**(위 여백·선 색·캡션 톤)이라
 * `EntityHeaderCard` 밖의 `Card`에서도 이 자리를 쓴다(FUND 투자 집행 정보의 규약 목적·딜메이커).
 * 화면이 `border-t border-gray-100 pt-4`를 손으로 적기 시작하면 같은 선이 카드마다 다른 여백으로
 * 그어진다 — 규격을 화면에 두지 않는다는 규칙이 여기에도 그대로 적용된다.
 */
export function EntityHeaderSection({ label, help, children }: EntityHeaderSectionProps) {
  // 묶음 안에서는 위 여백과 선을 묶음이 이미 그었다.
  const inRow = useContext(SectionRowContext)
  return (
    <div className={inRow ? undefined : 'mt-4 border-t border-gray-100 pt-4'}>
      {label && (
        <span className="flex items-center gap-1">
          <span className="text-caption text-gray-700">{label}</span>
          {help && <Tooltip content={help} label={label} className="shrink-0" />}
        </span>
      )}
      <div className={label ? 'mt-2' : undefined}>{children}</div>
    </div>
  )
}
