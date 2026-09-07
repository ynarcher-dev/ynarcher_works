import type { ReactNode } from 'react'
import { CardShell } from '../components/CardShell'
import { CardHeading } from '../components/CardHeading'
import { cn } from '../utils/cn'

export interface PanelCardProps {
  title: ReactNode
  /** 제목 옆 건수(미지정 시 숨김). `[3]` 말머리 형태로 렌더한다. */
  count?: number
  /** 헤더 우측 액션(‘전체 보기 →’·아이콘 버튼 등). */
  /** 이 패널이 무엇을 다루는지에 대한 설명. 제목 옆 도움말(ⓘ) 말풍선으로 접힌다. */
  help?: ReactNode
  action?: ReactNode
  className?: string
  /** 제목 글자에만 붙일 클래스(색 강조·truncate 등). 제목 줄 규격은 CardHeading이 그대로 소유한다. */
  titleClassName?: string
  bodyClassName?: string
  children: ReactNode
}

/**
 * 상세 화면 우측 패널 카드(통합 타임라인·관련 전자결재·자료 관리·코멘트·변동 이력 공용 래퍼).
 * 좌측 본문 카드(`Card`)와 동일한 톤을 유지하되 헤더를 한 줄(제목 + 건수 + 액션)로 압축한다.
 */
export function PanelCard({
  title,
  count,
  help,
  action,
  className,
  titleClassName,
  bodyClassName,
  children,
}: PanelCardProps) {
  return (
    <CardShell className={className}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <CardHeading count={count} help={help} titleClassName={titleClassName}>
          {title}
        </CardHeading>
        {action}
      </div>
      <div className={cn(bodyClassName)}>{children}</div>
    </CardShell>
  )
}
