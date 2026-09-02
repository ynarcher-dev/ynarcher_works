import { Badge } from '@ynarcher/ui'
import { moduleVisibilityBadge } from '@/features/program/config'

/**
 * 모듈 카드의 공유 범위 배지 한 칸(보드·칸반이 함께 쓴다).
 *
 * 2026-09-03 개정으로 배지는 **하나**다 — 종전에는 공유 범위 배지와 '링크 공유' 배지가 나란히
 * 섰으나, 축이 하나가 되었으므로 `PUBLIC_LINK` 배지 자체가 "밖으로 나간다"를 말한다. 지금
 * 실제로 열려 있는지는 라벨이 아니라 톤이 답한다(규칙은 `moduleVisibilityBadge`가 소유한다).
 *
 * 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md 5.2절
 */
export function ModuleVisibilityBadge({
  visibility,
  linkOpen,
  className,
}: {
  visibility: string
  /** 이 모듈의 공개 주소가 지금 열려 있는가(`useOpenPublicLinkModuleIds`). */
  linkOpen: boolean
  className?: string
}) {
  const badge = moduleVisibilityBadge(visibility, linkOpen)
  return (
    <Badge tone={badge.tone} className={className}>
      {badge.label}
    </Badge>
  )
}
