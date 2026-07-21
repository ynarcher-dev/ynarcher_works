import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  IconButton,
  Input,
  PageHeader,
  Radio,
  Select,
  Spinner,
  Switch,
  Tabs,
  TagChip,
  TextArea,
} from '@ynarcher/ui'
import { Pencil, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { DensityHeader, DensityRow } from '@/features/styleguide/DensityRow'

/**
 * 규격 확인용 내부 페이지(/styleguide).
 *
 * 같은 JSX가 맥락(일반 UI / 카드섹션 / 데이터 테이블)에 따라 어떤 크기로 서는지를
 * 한 화면에 늘어놓고, 각 컴포넌트의 실제 렌더 높이를 px로 함께 표시한다.
 * 규격을 조정할 때는 이 페이지를 보며 `packages/ui/src/densityScale.ts`만 고치면 된다.
 */
export function StyleguidePage() {
  const [on, setOn] = useState(true)
  const [tab, setTab] = useState('a')

  return (
    <div className="space-y-6">
      <PageHeader
        title="컴포넌트 규격"
        description="크기를 가르는 축은 중요도가 아니라 놓이는 자리입니다. 아래 세 열은 같은 코드가 서로 다른 맥락에 놓였을 때의 결과이며, 우측 회색 숫자는 실제 렌더 높이(px)입니다."
      />

      <Card>
        <div className="space-y-1">
          <h2 className="text-body font-semibold text-gray-900">액션</h2>
          <DensityHeader />
          <DensityRow name="Button primary" render={() => <Button>저장</Button>} />
          <DensityRow
            name="Button outline"
            render={() => <Button variant="outline">수정</Button>}
          />
          <DensityRow
            name="Button outline-danger"
            render={() => <Button variant="outline-danger">비활성화</Button>}
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

      <Card>
        <div className="space-y-1">
          <h2 className="text-body font-semibold text-gray-900">폼</h2>
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

      <Card>
        <div className="space-y-1">
          <h2 className="text-body font-semibold text-gray-900">표시</h2>
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
    </div>
  )
}
