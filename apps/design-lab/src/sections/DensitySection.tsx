import { useState } from 'react'
import { Pencil } from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  DensityProvider,
  IconButton,
  Input,
  Select,
  Switch,
  TagChip,
  type Density,
} from '@ynarcher/ui'
import { Section, Spec, Tag } from '@/lib/Spec'

const CONTEXTS: { density: Density; title: string; where: string; height: string }[] = [
  { density: 'page', title: 'page', where: '페이지 툴바·상세 헤더·독립 폼', height: '40px' },
  { density: 'card', title: 'card', where: '카드섹션 내부', height: '32px' },
  { density: 'table', title: 'table', where: '데이터 테이블 셀 내부', height: '24px' },
]

/** 한 맥락에서 렌더되는 컨트롤 한 벌. density prop 없이 부모 맥락만 상속받는다. */
function ControlSet() {
  const [on, setOn] = useState(true)
  const [checked, setChecked] = useState(true)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary">저장</Button>
        <Button variant="secondary">취소</Button>
        <Button variant="outline">내보내기</Button>
        <Button variant="ghost">더 보기</Button>
        <Button variant="outline-danger">비활성화</Button>
        <Button variant="danger">영구 삭제</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="검색어" className="max-w-[12rem]" />
        <Select defaultValue="all">
          <option value="all">전체</option>
          <option value="mine">내 담당</option>
        </Select>
        <IconButton icon={<Pencil />} label="수정" variant="outline" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="success" dot>
          진행중
        </Badge>
        <Badge tone="warning">준비</Badge>
        <Badge tone="danger" solid>
          NEW
        </Badge>
        <TagChip selected>딥테크</TagChip>
        <TagChip>바이오</TagChip>
        <Avatar name="김와이" />
        <label className="flex items-center gap-2 text-gray-700">
          <Checkbox checked={checked} onChange={(e) => setChecked(e.currentTarget.checked)} />
          선택
        </label>
        <Switch checked={on} onChange={setOn} aria-label="사용 여부" />
      </div>
    </div>
  )
}

export function DensitySection() {
  return (
    <Section
      id="density"
      title="3. 밀도"
      lede="크기는 중요도가 아니라 놓이는 자리가 정합니다. 같은 '저장' 버튼이라도 상세 헤더면 40px, 카드 안이면 32px, 표 셀 안이면 24px입니다."
    >
      {CONTEXTS.map((c) => (
        <Spec
          key={c.density}
          label={`${c.title} 맥락 — ${c.height}`}
          note={`${c.where} · 아래 컨트롤은 전부 크기 prop 없이 부모 맥락만 상속받았습니다.`}
        >
          <DensityProvider value={c.density}>
            <ControlSet />
          </DensityProvider>
        </Spec>
      ))}

      <Spec
        label="맥락은 자동으로 내려옵니다"
        note="Card는 card를, DataTable은 table을 스스로 깝니다 — 화면 코드가 크기를 지정할 일이 없습니다."
      >
        <div className="flex flex-wrap items-center gap-3 text-body text-gray-700">
          <Tag>DensityProvider</Tag>
          <span>→</span>
          <Tag>useDensity()</Tag>
          <span>→</span>
          <Tag>controlScale / iconScale / tagScale</Tag>
          <span>→</span>
          <Tag>h-ctl-page · h-ctl-card · h-ctl-table</Tag>
        </div>
      </Spec>
    </Section>
  )
}















