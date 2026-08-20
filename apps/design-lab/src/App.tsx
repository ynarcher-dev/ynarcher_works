import { Badge } from '@ynarcher/ui'
import { ColorSection } from '@/sections/ColorSection'
import { TypeSection } from '@/sections/TypeSection'
import { DensitySection } from '@/sections/DensitySection'
import { FeedbackSection } from '@/sections/FeedbackSection'
import { CompositionSection } from '@/sections/CompositionSection'

const NAV = [
  { id: 'color', label: '색' },
  { id: 'type', label: '글자' },
  { id: 'density', label: '밀도' },
  { id: 'feedback', label: '상태' },
  { id: 'composition', label: '화면' },
]

/**
 * 디자인 견본 — 살아있는 스타일 가이드.
 *
 * 정적 목업이 아니라 works 앱이 실제로 쓰는 `@ynarcher/ui` 컴포넌트와 `tailwind-preset.mjs`
 * 토큰을 그대로 렌더한다.
 *
 * 후보를 비교하던 전환기(브랜드 5종·표면 4종)와 개선 전/후 대조는 선택이 끝나 전부 걷어냈다.
 * 지금 화면에 있는 것은 확정안 하나뿐이며, 아직 프리셋에 반영하지 않은 두 값(인디고·서피스)만
 * `global.css`의 CSS 변수가 덮는다. 고르고 나서도 선택지가 남아 있으면 다음에 보는 사람이
 * "아직 정하는 중"으로 읽는다.
 */
export function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-navbar border-b border-gray-300 bg-white">
        <div className="mx-auto flex max-w-[80rem] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-body-lg font-semibold text-gray-900">디자인 견본</span>
            <Badge tone="neutral">WORKS</Badge>
          </div>
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
          <p className="ml-auto hidden text-caption text-gray-500 lg:block">
            인디고 · 서피스 · 프리텐다드
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[80rem] space-y-14 px-6 py-10">
        <ColorSection />
        <TypeSection />
        <DensitySection />
        <FeedbackSection />
        <CompositionSection />
        <footer className="border-t border-gray-200 pt-6 text-caption text-gray-500">
          값의 단일 원천은 <span className="font-numeric">tailwind-preset.mjs</span>, 맥락 매핑은{' '}
          <span className="font-numeric">packages/ui/src/densityScale.ts</span> 입니다. 인디고 램프와
          서피스 표면 값은 아직 프리셋에 반영되지 않아 견본의{' '}
          <span className="font-numeric">global.css</span>가 CSS 변수로 덮고 있으며, 프리셋에 옮기고
          나면 걷어냅니다.
        </footer>
      </main>
    </div>
  )
}




