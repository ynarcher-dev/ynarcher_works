import { useMemo, useState } from 'react'
import { Badge, Card, CollectionTreeTable, IconButton, Input, Select } from '@ynarcher/ui'
import type { CollectionTreeNode, TableStage } from '@ynarcher/ui'
import { SCENARIOS } from '../fixtures'
import { flattenCollectionTree } from '@ynarcher/ui'

const STATUS_TONES = ['neutral', 'success', 'warning', 'info', 'danger'] as const

/**
 * 실제 파일받기 화면이 이 부품을 어떻게 부를지 그대로 흉내 낸 자리.
 *
 * 상태 열에는 `Badge`, 관리 열에는 `IconButton`·`Input`·`Select`를 함께 세운다 — 관리 열에
 * 입력칸이 서는 것이 이 검증의 핵심 중 하나이기 때문이다(표의 방향키가 칸 안 이동을 먹으면
 * 안 된다). 조회도 저장도 하지 않으며, 선택은 오른쪽 상세가 받는다.
 */
export function CollectionTreeCase({
  scenario,
  stage,
}: {
  scenario: string
  stage: TableStage
}) {
  const fixture = SCENARIOS[scenario] ?? SCENARIOS.deep
  const nodes = fixture.nodes as readonly CollectionTreeNode[]
  const [selectedId, setSelectedId] = useState<string | null>(null)

  /** 선택한 줄의 전체 경로 — 앱에서는 상세 패널이 소유할 값이라 여기서도 밖에서 계산한다. */
  const selectedPath = useMemo(() => {
    if (!selectedId) return ''
    const row = flattenCollectionTree(nodes).find((r) => r.node.id === selectedId)
    return row ? row.path.join(' / ') : ''
  }, [nodes, selectedId])

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4">
      <Card title="파일받기 문항" subtitle={fixture.label}>
        <CollectionTreeTable
          nodes={nodes}
          caption="파일받기 문항 트리"
          stage={stage}
          selectedId={selectedId}
          onSelect={setSelectedId}
          renderStatus={(node) => (
            <Badge tone={STATUS_TONES[node.title.length % STATUS_TONES.length]}>
              {node.node_kind === 'FOLDER' ? '묶음' : node.is_required ? '필수 미제출' : '제출됨'}
            </Badge>
          )}
          renderActions={(node) => (
            <>
              <Input
                aria-label={`${node.title} 코멘트`}
                data-testid="row-input"
                defaultValue="검토 의견"
                className="w-20"
              />
              <Select aria-label={`${node.title} 상태 변경`} defaultValue="a" className="w-16">
                <option value="a">대기</option>
                <option value="b">완료</option>
              </Select>
              <IconButton
                label={`${node.title} 삭제`}
                data-testid="row-action"
                icon={<span aria-hidden>×</span>}
              />
            </>
          )}
        />
      </Card>
      <Card title="선택한 문항">
        {/*
          전체 경로를 손가락 하나로 확인하는 길 — 줄을 누르거나 Enter를 치면 여기에 선다.
          이름 칸은 말줄임하지 않으므로 문항 이름 자체는 표에서 이미 읽히고, 이 패널은 그 줄이
          어느 묶음 밑에 있는지를 답한다.
        */}
        <p data-testid="detail-path" className="break-words text-body-sm text-gray-700">
          {selectedPath || '선택 없음'}
        </p>
      </Card>
    </div>
  )
}
