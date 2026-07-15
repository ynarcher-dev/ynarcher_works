/**
 * 우측 패널(참가자 풀·통합 타임라인) 헤더의 '전체 보기 →' 액션.
 * 좌측 뒤로가기 링크와 동일한 브랜드 텍스트 톤을 써 상세 페이지 전반의 링크 스타일과 통일한다.
 * `onExpand` 미지정 시 아무것도 렌더하지 않는다(개요 외 컨텍스트에서 재사용 안전).
 */
export function ExpandAction({
  onExpand,
  label = '전체 보기',
}: {
  onExpand?: () => void
  label?: string
}) {
  if (!onExpand) return null
  return (
    <button
      type="button"
      onClick={onExpand}
      className="shrink-0 text-caption font-semibold text-brand transition-colors duration-fast hover:text-brand-600"
    >
      {label} →
    </button>
  )
}
