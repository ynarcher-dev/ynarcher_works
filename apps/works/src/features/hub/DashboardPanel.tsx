/** 최근 72시간 내 게시글 표시 뱃지. 대시보드 외 게시판·자료실·회의록 목록이 함께 쓴다. */
export function NewBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-danger-700 px-1 py-px text-tag-table font-bold uppercase tracking-wide text-gray-0">
      NEW
    </span>
  )
}

/**
 * 전사 대시보드(OFFICE 홈) — 전면 재설계를 위해 콘텐츠를 비워 둔 상태.
 * 기존 구성(인사말·통합검색·워크스페이스 인포 카드 9종·공지/자료 게시판 카드·AI 배너)에 쓰이던
 * 요소 중 재사용 가능한 것은 남아 있다: 통합검색은 `@/features/hub/UnifiedSearchPanel`,
 * 도메인 요약 집계는 `@/features/hub/hooks`(useHubSummary·useMyHireDate),
 * 게시글 조회는 `@/features/hub/boardPostsApi`.
 */
export function DashboardPanel() {
  return null
}
