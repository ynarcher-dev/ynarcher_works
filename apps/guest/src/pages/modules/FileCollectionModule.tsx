import { useState } from 'react'
import { Asterisk, CircleDashed, FileCheck2, RotateCcw } from 'lucide-react'
import {
  Badge,
  Banner,
  Card,
  CollectionTreeTable,
  EmptyState,
  Spinner,
  SummaryTile,
  tableText,
} from '@ynarcher/ui'
import {
  fileCollectionStatusLabel,
  fileCollectionStatusTone,
  toCollectionTreeNodes,
} from '@ynarcher/master-data'
import { GuestButton } from '@/components/GuestButton'
import {
  loadErrorMessage,
  useCollectionNodes,
  useFileCollection,
  useFileCollectionScope,
  useMyAssignment,
  useMyResponses,
  type FileCollectionScope,
} from '@/features/fileCollectionHooks'
import {
  folderProgressText,
  guestProgressSummary,
  responsesByNode,
  statusOfNode,
  writeStateOfModule,
} from '@/features/fileCollectionView'
import { QuestionDetailPanel } from '@/pages/modules/fileCollection/QuestionDetailPanel'

/**
 * 파일받기 메뉴 — 담당자가 요청한 자료를 **문항별로** 올리고 내는 화면.
 *
 * 이 화면이 아는 것은 내 배정 하나뿐이다. 같은 기업의 다른 게스트가 무엇을 냈는지, 대상이
 * 모두 몇 명인지는 조회조차 되지 않는다(RLS가 자른다) — 화면도 그 사실을 말하지 않는다.
 *
 * 계정이나 사업이 갈리면 **화면 상태를 통째로 다시 세운다**(`key`). 고른 문항·쓰던 메모가
 * 새 맥락으로 넘어가면, 방금 연 사람의 화면에 앞사람의 선택이 남는다.
 */
export function FileCollectionModule({
  moduleId,
  moduleStatus,
}: {
  moduleId: string
  moduleStatus: string
}) {
  const scope = useFileCollectionScope(moduleId)
  return <FileCollectionBody key={scope.token} scope={scope} moduleStatus={moduleStatus} />
}

function FileCollectionBody({
  scope,
  moduleStatus,
}: {
  scope: FileCollectionScope
  moduleStatus: string
}) {
  const collection = useFileCollection(scope)
  const collectionId = collection.data?.id
  const assignment = useMyAssignment(scope, collectionId)
  const nodes = useCollectionNodes(scope, collectionId)
  const responses = useMyResponses(scope, assignment.data?.id)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * 우측 패널에서 작업(올리기·제출·메모)이 도는 중인가.
   *
   * 패널은 뒤 화면을 막지 않으므로 딤이 하던 일을 이 깃발이 한다 — 올리는 중에 옆 줄을 눌러
   * 문항이 갈리면, 확정이 끝나지 않은 파일이 화면에서 사라진 채로 남는다. 목록과 패널을 함께
   * 쥔 곳이 여기뿐이라 판정도 여기가 소유한다.
   */
  const [panelBusy, setPanelBusy] = useState(false)

  const write = writeStateOfModule(moduleStatus)

  if (collection.isLoading || (collectionId && assignment.isLoading)) return <Spinner />

  if (collection.isError || assignment.isError || nodes.isError || responses.isError) {
    return (
      <div className="space-y-3">
        {/* 상한에 닿아 멈춘 경우에는 그 사실을 그대로 말한다 — 자른 목록을 보여 주는 대신
            멈춘 것이므로, 참여자가 읽는 문장도 "일부만 보이는 중"이 아니라 "불러오지 못했다"다. */}
        <Banner tone="danger">
          {loadErrorMessage(
            [collection.error, assignment.error, nodes.error, responses.error],
            '요청 내용을 불러오지 못했습니다.',
          )}
        </Banner>
        <GuestButton
          variant="secondary"
          onClick={() => {
            void collection.refetch()
            void assignment.refetch()
            void nodes.refetch()
            void responses.refetch()
          }}
        >
          다시 시도
        </GuestButton>
      </div>
    )
  }

  // 공개 전이거나 나에게 배정이 없으면 조회 자체가 비어 돌아온다. 둘을 구분해 말하지 않는다 —
  // 아직 오지 않은 요청과 내 것이 아닌 요청은 참여자에게 같은 사실('지금 할 일이 없다')이다.
  if (!collection.data || !assignment.data) {
    return (
      <EmptyState
        title="아직 받을 자료가 없습니다"
        description="담당자가 요청을 공개하면 이 자리에 문항이 섭니다."
      />
    )
  }

  const nodeList = nodes.data ?? []
  const responseList = responses.data ?? []
  const byNode = responsesByNode(responseList)
  const summary = guestProgressSummary(nodeList, responseList, assignment.data.id)
  const selectedNode = nodeList.find((n) => n.id === selectedId) ?? null
  const openedQuestion = selectedNode?.node_type === 'QUESTION' ? selectedNode : null

  return (
    <div className="space-y-5">
      {/* 담당자가 적은 안내가 있을 때만 선다(2026-09-14 사용자 지정). 안내가 없으면 "문항을
          눌러 올리고 제출하라"는 고정 문장만 남는데, 그 말은 문항 표와 그 안의 버튼이 이미
          하고 있어 카드 한 장이 통째로 같은 말을 되풀이한다. */}
      {collection.data.guide && (
        <Card title={collection.data.title || '자료 요청'}>
          <p className="whitespace-pre-line break-words text-body text-gray-800 [overflow-wrap:anywhere]">
            {collection.data.guide}
          </p>
        </Card>
      )}

      {/* 막힌 이유는 카드가 사라져도 남아야 한다 — 낼 수 없는 이유를 화면이 답하지 않으면
          참여자는 제출 버튼이 왜 잠겼는지 알 길이 없다. */}
      {!write.writable && <Banner tone="info">{write.reason}</Banner>}

      <Card title="내 진행 상태">
        {/* 내 것만 센다 — 대상 인원이나 다른 사람의 진행은 이 화면이 답하지 않는다.
            표현은 WORKS의 현황 카드보드(SummaryTile)와 같은 규격이다. 네 칸은 서로 견주라고
            나란히 서는 값이라, 라벨·값만 늘어놓던 종전 줄보다 칸으로 갈린 편이 "지금 무엇이
            남았는가"에 먼저 눈이 간다. 칸 폭은 auto-fit이 정한다 — 이 카드는 2:1 격자의 좁은
            쪽에도 설 수 있어 칸 수를 고정하면 이름이 두 줄로 접힌다. */}
        <section
          aria-label="내 제출 진행 상태"
          className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3"
        >
          <SummaryTile
            title="제출한 문항"
            value={summary.submittedText}
            tone="primary"
            compact
            icon={<FileCheck2 aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
          <SummaryTile
            title="필수 문항"
            value={summary.requiredText}
            tone="blue"
            compact
            icon={<Asterisk aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
          {/* 보완 요청은 '지금 내가 손대야 하는 것'이라 경고 톤으로 선다. */}
          <SummaryTile
            title="보완 요청"
            value={summary.rework}
            unit="건"
            tone="amber"
            compact
            icon={<RotateCcw aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
          <SummaryTile
            title="아직 시작 전"
            value={summary.notSubmitted}
            unit="건"
            tone="slate"
            compact
            icon={<CircleDashed aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
        </section>
      </Card>

      <Card title="문항" count={summary.total}>
        {nodes.isLoading || responses.isLoading ? (
          <Spinner />
        ) : (
          <CollectionTreeTable
            caption="제출 문항 목록"
            nodes={toCollectionTreeNodes(nodeList)}
            selectedId={selectedId}
            onSelect={(id) => {
              if (!panelBusy) setSelectedId(id)
            }}
            emptyMessage="아직 문항이 없습니다."
            statusLabel="상태"
            renderStatus={(node) =>
              node.node_kind === 'QUESTION' ? (
                <Badge tone={fileCollectionStatusTone(statusOfNode(byNode, node.id))}>
                  {fileCollectionStatusLabel(statusOfNode(byNode, node.id))}
                </Badge>
              ) : (
                <span className={`tabular-nums ${tableText.meta}`}>
                  <span className="sr-only">하위 문항 제출</span>
                  {folderProgressText(nodeList, byNode, node.id)}
                </span>
              )
            }
          />
        )}
      </Card>

      <QuestionDetailPanel
        scope={scope}
        nodes={nodeList}
        node={openedQuestion}
        response={openedQuestion ? (byNode.get(openedQuestion.id) ?? null) : null}
        write={write}
        busy={panelBusy}
        onBusyChange={setPanelBusy}
        onClose={() => {
          if (!panelBusy) setSelectedId(null)
        }}
      />
    </div>
  )
}
