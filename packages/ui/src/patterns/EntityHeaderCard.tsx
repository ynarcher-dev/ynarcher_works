import type { ReactNode } from 'react'
import { CardShell } from '../components/CardShell'
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

export interface EntityHeaderSectionProps {
  /**
   * 섹션 캡션(담당자·태그 등). 생략하면 구분선만 긋는다 — 정보 그리드가 두 벌 이어지는 카드
   * (펀드 요약 지표 → 속성)에서 두 번째 묶음은 캡션 없이 선이 갈라 주는 것으로 충분하고,
   * 없는 이름을 지어 붙이면 그 이름이 곧 다음 사람이 지켜야 할 분류축이 된다.
   */
  label?: string
  children: ReactNode
}

/** 기본 데이터 카드 하단의 (라벨 +) 내용 섹션(구분선 포함). */
export function EntityHeaderSection({ label, children }: EntityHeaderSectionProps) {
  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      {label && <span className="text-caption text-gray-700">{label}</span>}
      <div className={label ? 'mt-2' : undefined}>{children}</div>
    </div>
  )
}
