import { useState } from 'react'
import {
  Asterisk,
  CircleCheckBig,
  CircleDashed,
  Clock,
  ListChecks,
  Maximize2,
  Minimize2,
  Paperclip,
  RotateCcw,
} from 'lucide-react'
import {
  Badge,
  Banner,
  Card,
  CollectionTreeTable,
  EmptyState,
  ExpandToggleButton,
  FullscreenPanel,
  Input,
  MiniPager,
  Spinner,
  SummaryTile,
} from '@ynarcher/ui'
import {
  fileCollectionStatusTone,
  questionNodes,
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
  useNodeFileCounts,
  type FileCollectionScope,
} from '@/features/fileCollectionHooks'
import {
  filterCollectionNodes,
  guestProgressSummary,
  guestStatusLabel,
  pageCollectionNodes,
  responsesByNode,
  statusOfNode,
  writeStateOfModule,
} from '@/features/fileCollectionView'
import { QuestionDetailPanel } from '@/pages/modules/fileCollection/QuestionDetailPanel'

/** 카드 안과 전체 화면의 쪽 크기 — 자르는 단위는 줄이 아니라 최상위 묶음이다. */
const CARD_PAGE_SIZE = 5
const FULL_PAGE_SIZE = 15

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
  /**
   * 문항마다 담당자가 붙여 둔 자료가 있는지 — 목록의 클립이 이 값을 본다.
   *
   * 다른 조회와 달리 **실패해도 화면을 멈추지 않는다**(아래 오류 분기에 넣지 않는다). 이 값이
   * 없으면 클립이 서지 않을 뿐 무엇을 내야 하는지는 그대로 읽히고, 자료 자체는 문항을 열면
   * 그 패널이 다시 묻는다 — 곁값 하나 때문에 제출 화면 전체를 막지 않는다.
   */
  const nodeFileCounts = useNodeFileCounts(scope)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * 우측 패널에서 작업(올리기·제출·메모)이 도는 중인가.
   *
   * 패널은 뒤 화면을 막지 않으므로 딤이 하던 일을 이 깃발이 한다 — 올리는 중에 옆 줄을 눌러
   * 문항이 갈리면, 확정이 끝나지 않은 파일이 화면에서 사라진 채로 남는다. 목록과 패널을 함께
   * 쥔 곳이 여기뿐이라 판정도 여기가 소유한다.
   */
  const [panelBusy, setPanelBusy] = useState(false)
  /** 검색어와 쪽은 카드와 전체 화면이 **함께 쓴다** — 크게 열었다고 찾던 것이 풀리지 않는다. */
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

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
  // 검색은 이름과 안내 문구를 함께 본다. 걸린 줄의 묶음은 함께 남아 어디에 속한 문항인지가
  // 사라지지 않는다(`filterCollectionNodes`).
  const visibleNodes = filterCollectionNodes(nodeList, query)
  const questionCount = questionNodes(visibleNodes).length
  const cardPage = pageCollectionNodes(visibleNodes, page, CARD_PAGE_SIZE)
  const fullPage = pageCollectionNodes(visibleNodes, page, FULL_PAGE_SIZE)

  /**
   * 표 위 조작 줄 — 제목 아래 한 줄을 통째로 쓰고, **찾기는 왼쪽 끝·크게보기는 오른쪽 끝**에
   * 선다(2026-09-14 사용자 지정).
   *
   * 제목 오른쪽(`Card`의 `actions`)에 함께 밀어 넣지 않는다 — 그러면 둘이 오른쪽에 붙어 서고,
   * 폭이 모자라면 검색칸이 버튼을 아래로 밀어 머리가 두 층이 된다.
   */
  const questionToolbar = (
    <div className="flex items-center justify-between gap-3">
      {/* 폭은 **바깥 상자**가 정한다 — `Input`의 `className`은 안쪽 `<input>`에만 붙고 그
          래퍼는 `w-full`이라, 칸에 폭을 줘도 이 줄을 통째로 차지한다. */}
      <div className="w-48 max-w-full shrink sm:w-64">
        <Input
          type="search"
          aria-label="문항 검색"
          placeholder="문항 이름·안내로 찾기"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            // 좁히면 쪽 수가 줄어든다 — 보고 있던 쪽이 사라지면 빈 화면이 남으므로 첫 쪽으로 돌린다.
            setPage(0)
          }}
        />
      </div>
      <ExpandToggleButton
        expanded={fullscreen}
        onToggle={() => setFullscreen((v) => !v)}
        expandLabel="크게보기"
        expandIcon={<Maximize2 aria-hidden className="size-4" />}
        collapseIcon={<Minimize2 aria-hidden className="size-4" />}
      />
    </div>
  )

  const questionTable = (pageNodes: typeof nodeList) => (
    <CollectionTreeTable
      /* 이 표는 카드에 담겨 있지만 **이 화면의 본문**이다(자리를 가르는 축은 상자가 아니라 역할).
         `card`로 두면 셀과 배지가 표 밀도(10px 배지)로 내려앉아, 같은 화면의 카드보드·패널에 선
         배지보다 한 단 작아진다. */
      stage="page"
      caption="제출 문항 목록"
      nodes={toCollectionTreeNodes(pageNodes, nodeFileCounts.data)}
      selectedId={selectedId}
      onSelect={(id) => {
        if (!panelBusy) setSelectedId(id)
      }}
      emptyMessage={query ? '찾는 문항이 없습니다.' : '아직 문항이 없습니다.'}
      showDescription
      /* 첨부 유무는 **상태 왼쪽의 제 열**이 답한다(2026-09-14 사용자 지정). 표식은 WORKS
         목록들과 같은 클립(lucide `Paperclip`)이며, 있고 없음만 알리고 건수는 문항을 열면
         그 패널이 답한다 — 게시판 목록과 같은 규칙이다(`attachmentColumn`). */
      attachmentLabel="첨부파일"
      renderAttachment={(node) =>
        node.node_kind === 'QUESTION' && node.has_files ? (
          <span className="inline-flex items-center justify-center" title="첨부 있음">
            <Paperclip aria-label="첨부 있음" className="size-4 text-gray-500" />
          </span>
        ) : (
          <span className="sr-only">첨부 없음</span>
        )
      }
      statusLabel="상태"
      /* 상태 열은 **문항의 상태만** 답한다(2026-09-14 사용자 지정) — 묶음이 몇 항목인지는 이름
         옆에 서고, 진행 비율까지 이 칸에 넣으면 같은 열에 성격이 다른 두 값이 섞인다. */
      renderStatus={(node) =>
        node.node_kind === 'QUESTION' ? (
          <Badge tone={fileCollectionStatusTone(statusOfNode(byNode, node.id))}>
            {guestStatusLabel(statusOfNode(byNode, node.id))}
          </Badge>
        ) : null
      }
    />
  )

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
            표현은 WORKS의 현황 카드보드(SummaryTile)와 같은 규격이다.

            앞은 **무엇을 내야 하는가**(총·필수), 뒤는 **지금 어디까지 왔는가**
            (미제출·검토 대기·보완·완료)다. 종전에는 `1/3`·`0/2` 같은 분수 네 칸이었는데 분모가 칸마다
            달라 남은 개수를 읽으려면 눈으로 빼야 했다 — 이제 모든 칸이 건수 하나를 말한다.

            검토 대기는 완료에 더하지 않고 제 칸으로 선다 — 표의 배지가 '검토 대기'라고 말하는
            문항을 요약이 완료로 세면 두 자리가 같은 문항을 다르게 읽는다.
            칸 폭은 auto-fit이 정한다 — 이 카드는 2:1 격자의 좁은 쪽에도 설 수 있다. */}
        <section
          aria-label="내 제출 진행 상태"
          className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3"
        >
          <SummaryTile
            title="총 항목"
            value={summary.total}
            unit="건"
            tone="primary"
            compact
            icon={<ListChecks aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
          <SummaryTile
            title="필수 항목"
            value={summary.requiredTotal}
            unit="건"
            tone="blue"
            compact
            icon={<Asterisk aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
          {/* 뒷줄은 문항이 거쳐 가는 차례대로 선다 — 미제출 → 검토 대기 → 보완 → 완료.
              손대지 않은 문항과 올려 두기만 한 문항은 한 칸으로 센다(참여자에게는 둘 다 아직
              내지 않은 것이라 할 일이 같다). 색은 문항 표의 상태 배지와 같은 계열을 쓴다. */}
          <SummaryTile
            title="미제출"
            value={summary.notSubmitted}
            unit="건"
            tone="slate"
            compact
            icon={<CircleDashed aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
          <SummaryTile
            title="검토 대기"
            value={summary.submitted}
            unit="건"
            tone="amber"
            compact
            icon={<Clock aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
          {/* 보완 요청은 '지금 내가 손대야 하는 것'이라 되돌아온 신호(rose)로 선다. */}
          <SummaryTile
            title="보완"
            value={summary.rework}
            unit="건"
            tone="rose"
            compact
            icon={<RotateCcw aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
          <SummaryTile
            title="완료"
            value={summary.approved}
            unit="건"
            tone="mint"
            compact
            icon={<CircleCheckBig aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
        </section>
      </Card>

      {/* 문항 목록 — 검색으로 좁히고, 쪽으로 나누고, 좁으면 전체 화면으로 편다.
          표 자체는 카드 안과 전체 화면이 **같은 부품 한 벌**을 쓴다(`questionTable`) — 두 벌로
          적어 두면 한쪽만 고쳐지는 날이 온다. 쪽 크기만 자리에 따라 갈린다. */}
      <Card title="문항" count={questionCount}>
        <div className="space-y-3">
          {/* 조작 줄은 불러오는 중에도 남는다 — 검색어를 적어 둔 채 결과를 기다릴 수 있다. */}
          {questionToolbar}
          {nodes.isLoading || responses.isLoading ? (
            <Spinner />
          ) : (
            <>
              {questionTable(cardPage.nodes)}
              <MiniPager page={cardPage.page} pageCount={cardPage.pageCount} onPage={setPage} alwaysVisible />
            </>
          )}
        </div>
      </Card>

      <FullscreenPanel
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        title="문항"
        /* 넓게 펴 놓고도 다른 메뉴로 갈 수 있어야 한다 — 사이드바는 덮지 않는다. */
        coverSidebar={false}
      >
        <div className="space-y-3">
          {questionToolbar}
          {questionTable(fullPage.nodes)}
          <MiniPager page={fullPage.page} pageCount={fullPage.pageCount} onPage={setPage} alwaysVisible />
        </div>
      </FullscreenPanel>

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
