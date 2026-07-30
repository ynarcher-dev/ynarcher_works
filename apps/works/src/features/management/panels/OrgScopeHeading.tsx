import { cardText, cn } from '@ynarcher/ui'

interface OrgScopeHeadingProps {
  /** 루트→선택 조직의 이름 조각. 비어 있으면 '조직'으로 적는다. */
  names: string[]
  /** 머리글 옆 건수(표시 인원). */
  count: number
}

/**
 * 좌우 2단 화면의 우측 머리글 — 선택 조직을 최상위부터의 전체 경로로 적는다.
 *
 * 말단 이름만 적으면 '2팀'처럼 여러 본부에 같은 이름이 있는 조직에서 지금 어디를 보고 있는지
 * 알 수 없다. 상위는 같은 크기로 두고 굵기와 색만 낮춘다 — 한 줄 안에서 크기를 갈라 위계를
 * 만들지 않는 것이 이 프로젝트의 규칙이고, 경로는 읽는 대상이 아니라 위치를 알려주는 꼬리표다.
 */
export function OrgScopeHeading({ names, count }: OrgScopeHeadingProps) {
  const parents = names.slice(0, -1)
  const leaf = names[names.length - 1] ?? '조직'
  return (
    <h2 className="flex items-center gap-2 border-b border-gray-200 pb-3">
      <span className={cn(cardText.title, 'min-w-0 truncate')} title={names.join(' > ')}>
        {parents.length > 0 && (
          <span className="font-normal text-gray-500">{parents.join(' > ')} &gt; </span>
        )}
        {leaf}
      </span>
      <span className={cardText.count}>{count}</span>
    </h2>
  )
}
