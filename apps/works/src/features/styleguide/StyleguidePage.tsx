import { PageHeader } from '@ynarcher/ui'
import { ColorSection } from '@/features/styleguide/ColorSection'
import { ComponentSpecSection } from '@/features/styleguide/ComponentSpecSection'
import { FeedbackSection } from '@/features/styleguide/FeedbackSection'
import { TypeSection } from '@/features/styleguide/TypeSection'

const NAV = [
  { id: 'color', label: '색' },
  { id: 'type', label: '글자' },
  { id: 'component', label: '컴포넌트 규격' },
  { id: 'feedback', label: '상태와 대화' },
]

/**
 * 살아있는 스타일 가이드(`/styleguide`) — 디자인 시스템의 단일 견본.
 *
 * 정적 목업이 아니라 works가 실제로 쓰는 `@ynarcher/ui` 컴포넌트와 `tailwind-preset.mjs`
 * 토큰을 그대로 렌더한다. 값의 단일 원천은 `tailwind-preset.mjs`, 맥락 매핑은
 * `packages/ui/src/densityScale.ts`이며, 이 페이지는 그 둘을 눈으로 확인하는 자리다.
 *
 * 별도 견본 앱(`apps/design-lab`)이 따로 있었으나 2026-08-25에 이 페이지로 합치고 삭제했다.
 * 견본이 둘이면 반드시 한쪽이 먼저 낡는다 — 실제로 그 앱은 `danger` 샘플에 '비활성화'라는
 * 틀린 이름을 달아 규격을 반대로 가르쳤고, `StatStrip`은 정본이 아닌 로컬 복제본을 들고
 * 있었다. 밀도 비교와 화면 조합 견본은 옮기지 않았다 — 앞은 이 페이지의 3맥락 비교가
 * 상위 호환이고, 뒤는 실제 업무 화면이 한 클릭 거리에 있어 목업이 필요하지 않다.
 */
export function StyleguidePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="디자인 규격"
        description="색·글자·컴포넌트·상태 표현의 단일 견본입니다. 값은 tailwind-preset.mjs, 맥락 매핑은 packages/ui/src/densityScale.ts가 소유합니다."
      />

      <nav className="flex flex-wrap items-center gap-1">
        {NAV.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            className="rounded-radius-md px-2.5 py-1 text-body-sm font-semibold text-gray-500 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-900"
          >
            {n.label}
          </a>
        ))}
      </nav>

      <ColorSection />
      <TypeSection />
      <ComponentSpecSection />
      <FeedbackSection />
    </div>
  )
}
