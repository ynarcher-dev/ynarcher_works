import { useState } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Radio,
  Switch,
  TagChip,
  Tabs,
} from '@ynarcher/ui'
import { LiveSwatch, Section, Spec } from '@/lib/Spec'

/**
 * 램프는 hex 상수가 아니라 Tailwind 클래스로 칠하고 계산된 색을 되읽는다(`LiveSwatch`).
 * 상수로 적어 두면 값이 바뀌었을 때 이 절만 옛 색을 계속 그린다.
 */
const BRAND_STEPS = [
  ['brand.25', 'bg-brand-25'],
  ['brand.500 (DEFAULT)', 'bg-brand'],
  ['brand.600', 'bg-brand-600'],
  ['brand.700', 'bg-brand-700'],
  ['brand.800', 'bg-brand-800'],
  ['brand.900', 'bg-brand-900'],
] as const

const GRAY_STEPS = [
  ['gray.0', 'bg-gray-0'],
  ['gray.25', 'bg-gray-25'],
  ['gray.50', 'bg-gray-50'],
  ['gray.100', 'bg-gray-100'],
  ['gray.200', 'bg-gray-200'],
  ['gray.300', 'bg-gray-300'],
  ['gray.400', 'bg-gray-400'],
  ['gray.500', 'bg-gray-500'],
  ['gray.600', 'bg-gray-600'],
  ['gray.700', 'bg-gray-700'],
  ['gray.800', 'bg-gray-800'],
  ['gray.900', 'bg-gray-900'],
] as const

const STATUS_STEPS = [
  ['success', 'bg-success', 'bg-success-subtle'],
  ['warning', 'bg-warning', 'bg-warning-subtle'],
  ['info', 'bg-info', 'bg-info-subtle'],
  ['danger', 'bg-danger', 'bg-danger-subtle'],
] as const

export function ColorSection() {
  const [tab, setTab] = useState('a')
  const [on, setOn] = useState(true)
  const [pick, setPick] = useState('x')

  return (
    <Section
      id="color"
      title="1. 색"
      lede="브랜드는 조작을, 상태 신호색은 상태를 말합니다. 두 축이 색으로 겹치지 않는 것이 이 팔레트의 전부입니다."
    >
      <Spec
        label="브랜드 램프 — 인디고 #2E5CB8"
        note="화면 액센트는 이 램프가 담당합니다. CI Red는 로고·인쇄물 전용입니다. 흰 글씨 대비 6.3:1."
      >
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {BRAND_STEPS.map(([name, cls]) => (
            <LiveSwatch key={name} name={name} className={cls} />
          ))}
        </div>
      </Spec>

      <Spec
        label="무채색 램프"
        note="100~300은 경계선, 400~900은 글자입니다. 400도 KWCAG AA(4.5:1)를 충족합니다."
      >
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-12">
          {GRAY_STEPS.map(([name, cls]) => (
            <LiveSwatch key={name} name={name} className={cls} />
          ))}
        </div>
      </Spec>

      <Spec label="상태 신호색" note="글자색(DEFAULT)과 배경색(subtle)이 짝을 이룹니다.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {STATUS_STEPS.map(([name, fg, bg]) => (
            <div key={name} className="grid grid-cols-2 gap-2">
              <LiveSwatch name={name} className={fg} />
              <LiveSwatch name={`${name}.subtle`} className={bg} />
            </div>
          ))}
        </div>
      </Spec>

      <Spec label="브랜드가 놓이는 자리" note="넓은 면(버튼)·얇은 선(활성 탭)·작은 표식·포커스 링.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">기업 등록</Button>
            <Button variant="secondary">취소</Button>
            <Button variant="outline">내보내기</Button>
            <Button variant="ghost">더 보기</Button>
            <Button variant="outline-danger">비활성화</Button>
            <Button variant="danger">영구 삭제</Button>
          </div>
          <Tabs
            items={[
              { key: 'a', label: '개요' },
              { key: 'b', label: '투자 이력' },
              { key: 'c', label: '자료' },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-body text-gray-700">
              <Checkbox defaultChecked />
              체크됨
            </label>
            <label className="flex items-center gap-2 text-body text-gray-700">
              <Radio name="brand-demo" checked={pick === 'x'} onChange={() => setPick('x')} />
              선택됨
            </label>
            <Switch checked={on} onChange={setOn} aria-label="사용 여부" />
            <TagChip selected>딥테크</TagChip>
            <TagChip>바이오</TagChip>
          </div>
          <div className="max-w-sm">
            <Input placeholder="클릭하면 포커스 링(brand/10)이 보입니다" />
          </div>
        </div>
      </Spec>

      <Spec
        label="조작과 상태는 겹치지 않는다"
        note="브랜드 버튼 옆에 링크(info)와 상태 배지를 나란히 둔 검사입니다."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">브랜드 버튼</Button>
            <a href="#color" className="text-body text-info underline">
              링크 (info)
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success" dot>
              진행중
            </Badge>
            <Badge tone="info">검토</Badge>
            <Badge tone="warning">준비</Badge>
            <Badge tone="neutral">종료</Badge>
            <Badge tone="danger" solid>
              NEW
            </Badge>
          </div>
        </div>
      </Spec>

      <Spec label="옅은 배경 — brand.25" note="선택된 행·강조 블록의 바탕으로 씁니다.">
        <div className="rounded-radius-md border border-gray-200 bg-brand-25 p-4">
          <p className="text-body font-semibold text-brand">브랜드 25 배경 위의 브랜드 글자</p>
          <p className="text-body text-gray-700">
            옅은 바탕과 그 위 글자가 같은 램프에서 나오므로 강조 블록이 화면과 따로 놀지 않습니다.
          </p>
        </div>
      </Spec>
    </Section>
  )
}












