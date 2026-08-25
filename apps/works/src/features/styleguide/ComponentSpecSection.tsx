import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  IconButton,
  Input,
  Radio,
  Select,
  Spinner,
  SummaryTile,
  Switch,
  Tabs,
  TagChip,
  TextArea,
} from '@ynarcher/ui'
import { BriefcaseBusiness, FolderKanban, Pencil, Search, Target, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { DensityHeader, DensityRow } from '@/features/styleguide/DensityRow'
import { GuideSection } from '@/features/styleguide/GuideSection'

/**
 * 같은 JSX가 맥락(일반 UI / 카드섹션 / 데이터 테이블)에 따라 어떤 크기로 서는지를 한 화면에
 * 늘어놓고, 각 컴포넌트의 실제 렌더 높이를 px로 함께 표시한다.
 * 규격을 조정할 때는 이 절을 보며 `packages/ui/src/densityScale.ts`만 고치면 된다.
 */
export function ComponentSpecSection() {
  const [on, setOn] = useState(true)
  const [tab, setTab] = useState('a')

  return (
    <GuideSection
      id="component"
      title="컴포넌트 규격"
      lede="크기를 가르는 축은 중요도가 아니라 놓이는 자리입니다. 아래 세 열은 같은 코드가 서로 다른 맥락에 놓였을 때의 결과이며, 우측 회색 숫자는 실제 렌더 높이(px)입니다."
    >
      <Card title="액션">
        <div className="space-y-1">
          <DensityHeader />
          {/* variant 6종을 무게 순으로 세운다(4_color_system_rules.md §5.1).
              파괴적 액션 둘의 라벨이 다른 것은 의도다 — 적색 채움은 확인창에서 실제로
              실행하는 버튼, 테두리형은 그 확인창을 여는 버튼이다. */}
          <DensityRow name="Button primary" render={() => <Button>저장</Button>} />
          <DensityRow
            name="Button secondary"
            render={() => <Button variant="secondary">취소</Button>}
          />
          <DensityRow
            name="Button outline"
            render={() => <Button variant="outline">수정</Button>}
          />
          <DensityRow name="Button ghost" render={() => <Button variant="ghost">더 보기</Button>} />
          <DensityRow
            name="Button outline-danger"
            render={() => <Button variant="outline-danger">비활성화</Button>}
          />
          <DensityRow
            name="Button danger"
            render={() => <Button variant="danger">영구 삭제</Button>}
          />
          <DensityRow
            name="IconButton"
            render={() => (
              <div className="flex gap-1">
                <IconButton label="수정" icon={<Pencil />} variant="ghost" />
                <IconButton label="삭제" icon={<Trash2 />} variant="ghost" danger />
              </div>
            )}
          />
        </div>
      </Card>

      <Card title="폼">
        <div className="space-y-1">
          <DensityHeader />
          <DensityRow name="Input" render={() => <Input placeholder="이름" />} />
          <DensityRow
            name="Input (아이콘)"
            render={() => <Input placeholder="검색" icon={<Search />} />}
          />
          <DensityRow
            name="Select"
            render={() => (
              <Select defaultValue="a">
                <option value="a">진행 중</option>
                <option value="b">완료</option>
              </Select>
            )}
          />
          <DensityRow name="TextArea" render={() => <TextArea rows={2} placeholder="메모" />} />
          <DensityRow name="Checkbox" render={() => <Checkbox defaultChecked />} />
          <DensityRow name="Radio" render={() => <Radio label="제안 단계" defaultChecked />} />
          <DensityRow
            name="Switch"
            render={() => <Switch checked={on} onChange={setOn} aria-label="예시 스위치" />}
          />
        </div>
      </Card>

      <Card title="표시">
        <div className="space-y-1">
          <DensityHeader />
          <DensityRow name="Badge" render={() => <Badge tone="info">심사중</Badge>} />
          <DensityRow
            name="Badge (점)"
            render={() => (
              <Badge tone="success" dot>
                정상
              </Badge>
            )}
          />
          <DensityRow name="TagChip" render={() => <TagChip selected>딥테크</TagChip>} />
          <DensityRow name="Avatar" render={() => <Avatar name="김와이" />} />
          <DensityRow name="Spinner" render={() => <Spinner />} />
          <DensityRow
            name="Tabs"
            render={() => (
              <Tabs
                items={[
                  { key: 'a', label: '개요', count: 12 },
                  { key: 'b', label: '이력' },
                ]}
                value={tab}
                onChange={setTab}
              />
            )}
          />
        </div>
      </Card>

      <Card title="범주형 현황 요약">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <SummaryTile title="AC" eyebrow="액셀러레이팅" value={8} unit="개 운영" tone="blue"
            icon={<Target className="size-[18px]" />} metrics={[{ label: 'PM', value: 3 }, { label: 'MEMBER', value: 5 }]} />
          <SummaryTile title="M&A·PE" eyebrow="딜 운영" value={4} unit="개 운영" tone="purple"
            icon={<BriefcaseBusiness className="size-[18px]" />} metrics={[{ label: 'PM', value: 2 }, { label: 'MEMBER', value: 2 }]} />
          <SummaryTile title="PROJECT" eyebrow="프로젝트" value={6} unit="개 운영" tone="mint"
            icon={<FolderKanban className="size-[18px]" />} metrics={[{ label: 'PM', value: 1 }, { label: 'MEMBER', value: 5 }]} />
        </div>
      </Card>
    </GuideSection>
  )
}
