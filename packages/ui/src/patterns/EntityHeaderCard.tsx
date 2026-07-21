import type { ReactNode } from 'react'
import { CardShell } from '../components/CardShell'

export interface EntityHeaderCardProps {
  /** 좌측 커버/프로필 이미지(`PhotoBox` 등). 미지정 시 텍스트 블록만 렌더한다. */
  photo?: ReactNode
  title: ReactNode
  /** 제목 우측 배지 묶음(상태·구분 등). */
  badges?: ReactNode
  /** 제목 하단 한 줄 설명. */
  description?: ReactNode
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
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-title-md font-bold text-gray-900">{title}</h1>
            {badges}
          </div>
          {description !== undefined && (
            <p className="mt-1 text-body text-gray-700">{description || '-'}</p>
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
  /** 섹션 캡션(담당자·태그 등). */
  label: string
  children: ReactNode
}

/** 기본 데이터 카드 하단의 라벨 + 내용 섹션(구분선 포함). */
export function EntityHeaderSection({ label, children }: EntityHeaderSectionProps) {
  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <span className="text-caption text-gray-700">{label}</span>
      <div className="mt-2">{children}</div>
    </div>
  )
}
