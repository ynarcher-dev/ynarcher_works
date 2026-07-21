import { DensityProvider, type Density } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { Measured } from '@/features/styleguide/Measured'

const CONTEXTS: { key: Density; label: string; note: string }[] = [
  { key: 'page', label: '일반 UI', note: '페이지 툴바 · 상세 헤더 · 독립 폼' },
  { key: 'card', label: '카드섹션 내부', note: 'PanelCard · Card 안' },
  { key: 'table', label: '데이터 테이블 내부', note: 'DataTable 셀 안' },
]

/** 세 맥락의 라벨 줄. 표 머리처럼 한 번만 깔고 아래 행들이 정렬을 공유한다. */
export function DensityHeader() {
  return (
    <div className="grid grid-cols-[10rem_repeat(3,minmax(0,1fr))] gap-4 border-b border-gray-300 pb-2">
      <span />
      {CONTEXTS.map((c) => (
        <div key={c.key}>
          <div className="text-body-sm font-semibold text-gray-900">{c.label}</div>
          <div className="text-caption text-gray-500">{c.note}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * 한 컴포넌트를 세 맥락에 동시에 세워 비교하는 행.
 * `render`는 맥락을 인자로 받지 않는다 — 크기가 prop이 아니라 주변 맥락에서 온다는 것을
 * 이 페이지 자체가 증명하도록, 똑같은 JSX를 세 번 렌더한다.
 */
export function DensityRow({
  name,
  render,
}: {
  name: string
  render: () => ReactNode
}) {
  return (
    <div className="grid grid-cols-[10rem_repeat(3,minmax(0,1fr))] items-center gap-4 border-b border-gray-100 py-3">
      <code className="text-caption text-gray-600">{name}</code>
      {CONTEXTS.map((c) => (
        <DensityProvider key={c.key} value={c.key}>
          <Measured>{render()}</Measured>
        </DensityProvider>
      ))}
    </div>
  )
}
